#!/usr/bin/env node
// Server MCP (stdio) per Garden Legacy: espone a Claude le API REST dell'app come tool.
// Non tocca il backend: fa login come il browser (POST /api/auth/login), tiene il cookie
// auth_token in memoria e lo manda a ogni chiamata. Su 401 rifà il login una volta.
//
// Variabili d'ambiente:
//   GARDEN_URL   indirizzo dell'app (default https://garden.cocchy.casa)
//   GARDEN_USER  utente
//   GARDEN_PASS  password
//
// Niente eliminazioni (piante, lavori, categorie, foto): non si possono annullare.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = (process.env.GARDEN_URL || "https://garden.cocchy.casa").replace(/\/+$/, "");
const USER = process.env.GARDEN_USER;
const PASS = process.env.GARDEN_PASS;

let token = null;

async function login() {
    if (!USER || !PASS) throw new Error("Set GARDEN_USER and GARDEN_PASS in the MCP server environment");
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: USER, pass: PASS })
    });
    if (!res.ok) throw new Error(`Login failed: ${await errorMessage(res)}`);
    // Il token è nel Set-Cookie della risposta
    for (const cookie of res.headers.getSetCookie()) {
        const match = /^auth_token=([^;]+)/.exec(cookie);
        if (match) { token = match[1]; return; }
    }
    throw new Error("Login failed: no auth_token cookie in the response");
}

async function errorMessage(res) {
    const text = await res.text();
    try {
        const body = JSON.parse(text);
        return `${res.status} ${body.message || text}`;
    } catch {
        return `${res.status} ${text || res.statusText}`;
    }
}

/** Chiamata a /api: JSON in entrata e in uscita, login automatico. */
async function api(method, path, body) {
    if (!token) await login();
    for (let attempt = 0; ; attempt++) {
        const res = await fetch(`${BASE_URL}/api${path}`, {
            method,
            headers: {
                Cookie: `auth_token=${token}`,
                ...(body !== undefined ? { "Content-Type": "application/json" } : {})
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        });
        // Sessione scaduta (30 giorni senza uso o limite di 180): nuovo login e si riprova una volta
        if (res.status === 401 && attempt === 0) { await login(); continue; }
        if (!res.ok) throw new Error(await errorMessage(res));
        const text = await res.text();
        return text ? JSON.parse(text) : null;
    }
}

/** Toglie i campi non passati (undefined): l'API non tocca quelli assenti. */
function defined(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// Risultato del tool: JSON leggibile; un errore dell'API diventa isError (Claude vede il messaggio)
function tool(handler) {
    return async args => {
        try {
            const result = await handler(args);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
            return { content: [{ type: "text", text: String(err.message || err) }], isError: true };
        }
    };
}

// Schemi comuni
const id = z.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const interval = z.number().int().min(1).max(65535);
const doneDate = date.optional().describe("Date it was done, YYYY-MM-DD. Defaults to today (server time, Europe/Rome).");

const READ = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

const server = new McpServer({ name: "garden-legacy", version: "0.0.1" });

// --- Lettura ---

server.registerTool("list_reminders", {
    title: "List reminders",
    description: "Watering, fertilizing and task reminders for all plants, sorted by due date (overdue first). " +
        "Each item has the plant, type (watering / fertilizing / task), dueDate, daysUntilDue, status (overdue / today / upcoming) and, for tasks, taskId.",
    inputSchema: {},
    annotations: READ
}, tool(() => api("GET", "/reminders")));

server.registerTool("list_plants", {
    title: "List plants",
    description: "All plants with their category, notes, last watered/fertilized dates, frequencies in days " +
        "and one-off fertilizing due date. Use the ids with the other tools.",
    inputSchema: {},
    annotations: READ
}, tool(() => api("GET", "/plants")));

server.registerTool("get_plant", {
    title: "Get plant",
    description: "One plant with its tasks (each task: name, intervalDays, lastDoneAt, one-off dueDate).",
    inputSchema: { plantId: id },
    annotations: READ
}, tool(async ({ plantId }) => {
    const [plant, tasks] = await Promise.all([
        api("GET", `/plants/${plantId}`),
        api("GET", `/plants/${plantId}/tasks`)
    ]);
    return { ...plant, tasks };
}));

server.registerTool("list_categories", {
    title: "List categories",
    description: "Plant categories (used to group plants on the dashboard).",
    inputSchema: {},
    annotations: READ
}, tool(() => api("GET", "/categories")));

// --- Cura: segna come fatto ---

server.registerTool("water_plant", {
    title: "Water plant",
    description: "Record that a plant was watered: sets its last watered date (only the latest date is kept).",
    inputSchema: { plantId: id, date: doneDate },
    annotations: WRITE
}, tool(({ plantId, date }) => api("POST", `/plants/${plantId}/water`, defined({ date }))));

server.registerTool("fertilize_plant", {
    title: "Fertilize plant",
    description: "Record that a plant was fertilized: sets its last fertilized date. If the plant had a one-off " +
        "fertilizing date, it is cleared; with a frequency set, fertilizing repeats from this date.",
    inputSchema: { plantId: id, date: doneDate },
    annotations: WRITE
}, tool(({ plantId, date }) => api("POST", `/plants/${plantId}/fertilize`, defined({ date }))));

server.registerTool("complete_task", {
    title: "Complete task",
    description: "Mark a plant task as done: sets its last done date. A one-off task (with a due date) " +
        "is cleared and does not come back; a recurring task repeats from this date.",
    inputSchema: { taskId: id, date: doneDate },
    annotations: WRITE
}, tool(({ taskId, date }) => api("POST", `/tasks/${taskId}/done`, defined({ date }))));

// --- Piante ---

// Campi facoltativi della pianta: null li svuota, assente non li tocca
const plantFields = {
    description: z.string().nullable().optional(),
    notes: z.string().nullable().optional().describe("Free-form notes"),
    categoryId: id.nullable().optional().describe("Existing category id (see list_categories); null = no category"),
    lastWateredAt: date.nullable().optional(),
    wateringIntervalDays: interval.nullable().optional().describe("Water every N days; null = no reminder"),
    lastFertilizedAt: date.nullable().optional(),
    fertilizingIntervalDays: interval.nullable().optional().describe("Fertilize every N days"),
    fertilizingDueDate: date.nullable().optional()
        .describe("One-off fertilizing date; when set it wins over last date + frequency")
};

server.registerTool("create_plant", {
    title: "Create plant",
    description: "Add a plant. Only the name is required. Reminders appear only when a last date and a " +
        "frequency are both set (or a one-off fertilizing date).",
    inputSchema: { name: z.string().min(1).max(120), ...plantFields },
    annotations: WRITE
}, tool(args => api("POST", "/plants", defined(args))));

server.registerTool("update_plant", {
    title: "Update plant",
    description: "Change a plant. Only the fields passed are changed; pass null to clear a field.",
    inputSchema: { plantId: id, name: z.string().min(1).max(120).optional(), ...plantFields },
    annotations: { ...WRITE, idempotentHint: true }
}, tool(({ plantId, ...fields }) => api("PUT", `/plants/${plantId}`, defined(fields))));

server.registerTool("create_category", {
    title: "Create category",
    description: "Add a plant category.",
    inputSchema: { name: z.string().min(1) },
    annotations: WRITE
}, tool(({ name }) => api("POST", "/categories", { name })));

// --- Lavori ---

const taskFields = {
    intervalDays: interval.nullable().optional().describe("Repeat every N days; null = no recurrence"),
    lastDoneAt: date.nullable().optional(),
    dueDate: date.nullable().optional().describe("One-off date; when set it wins over last date + frequency")
};

server.registerTool("add_task", {
    title: "Add task",
    description: "Add a named task to a plant (e.g. Repot, Prune). Either recurring (intervalDays, reminder " +
        "starts once lastDoneAt is set) or one-off (dueDate).",
    inputSchema: { plantId: id, name: z.string().min(1).max(120), ...taskFields },
    annotations: WRITE
}, tool(({ plantId, ...fields }) => api("POST", `/plants/${plantId}/tasks`, defined(fields))));

server.registerTool("update_task", {
    title: "Update task",
    description: "Change a task. Only the fields passed are changed; pass null to clear a field.",
    inputSchema: { taskId: id, name: z.string().min(1).max(120).optional(), ...taskFields },
    annotations: { ...WRITE, idempotentHint: true }
}, tool(({ taskId, ...fields }) => api("PUT", `/tasks/${taskId}`, defined(fields))));

await server.connect(new StdioServerTransport());
