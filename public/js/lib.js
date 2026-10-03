// Helper condivisi dalle pagine: API, DOM, date, chip di stato, tema.

// ---------- API ----------

export class ApiError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/** Chiamata JSON a /api. Con 401 rimanda al login. */
export async function api(method, path, body) {
    const options = { method, credentials: "same-origin" };
    if (body !== undefined) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(body);
    }

    const res = await fetch("/api" + path, options);
    const data = await res.json().catch(() => null);

    if (res.status === 401) {
        window.location.href = "/auth/auth.html";
        throw new ApiError(401, "Login required");
    }
    if (!res.ok) {
        // Errori di validazione di Moleculer: il dettaglio è in data[0].message
        const detail = Array.isArray(data?.data) ? data.data[0]?.message : null;
        throw new ApiError(res.status, detail || data?.message || "Something went wrong");
    }
    return data;
}

// ---------- DOM ----------

const PROPERTIES = new Set(["value", "disabled", "checked", "selected", "hidden", "textContent"]);

/** el("div", { class: "x", onclick: fn }, "testo", altroNodo) — i testi sono sempre text node (niente innerHTML). */
export function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false) continue;
        if (key.startsWith("on") && typeof value === "function") {
            node.addEventListener(key.slice(2), value);
        } else if (key === "class") {
            node.className = value;
        } else if (PROPERTIES.has(key)) {
            node[key] = value;
        } else {
            node.setAttribute(key, value === true ? "" : String(value));
        }
    }
    node.append(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false));
    return node;
}

export function showError(message) {
    const alert = document.getElementById("alert");
    if (!alert) return;
    alert.textContent = `◆ ${message}`;
    alert.hidden = false;
}

export function clearError() {
    const alert = document.getElementById("alert");
    if (alert) alert.hidden = true;
}

// ---------- Date ----------

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86_400_000;

const pad = n => String(n).padStart(2, "0");
const parseDay = s => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
};

/** Data odierna YYYY-MM-DD (fuso del browser). */
export function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Giorni da oggi (negativo = passato). */
export function daysFromToday(s) {
    return Math.round((parseDay(s) - parseDay(todayISO())) / DAY_MS);
}

export function shortDate(s) {
    const [, m, d] = s.split("-").map(Number);
    return `${MONTHS[m - 1]} ${d}`;
}

export function ago(s) {
    const n = daysFromToday(s);
    if (n === 0) return "today";
    if (n === -1) return "yesterday";
    return n < 0 ? `${-n}d ago` : shortDate(s);
}

/** { weekday: "Sat", dayMonth: "3 Oct", year: "2026" } */
export function todayParts() {
    const d = new Date();
    return { weekday: WEEKDAYS[d.getDay()], dayMonth: `${d.getDate()} ${MONTHS[d.getMonth()]}`, year: String(d.getFullYear()) };
}

// ---------- Chip di stato ----------

/** Stato dalla distanza in giorni dalla scadenza (negativo = scaduto). */
export function chipFromDays(n) {
    if (n < 0) return { s: "late", glyph: "◆", label: `Overdue ${-n}d` };
    if (n === 0) return { s: "today", glyph: "●", label: "Today" };
    return { s: "soon", glyph: "○", label: n === 1 ? "Tomorrow" : `In ${n} days` };
}

/** Stato da ultima data + frequenza; senza uno dei due non c'è scadenza. */
export function chipFor(last, freq) {
    const days = parseInt(freq, 10);
    if (!last || !days || days < 1) return { s: "none", glyph: "–", label: "No schedule" };
    return chipFromDays(daysFromToday(last) + days);
}

export function chipEl(chip) {
    return el("span", { class: "chip", "data-s": chip.s }, `${chip.glyph} ${chip.label}`);
}

// ---------- Tema ----------

export function initThemeToggle(button) {
    const root = document.documentElement;
    const current = () => root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    const label = () => {
        const dark = current() === "dark";
        button.textContent = dark ? "☀ Light" : "☾ Dark";
        button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    };

    button.addEventListener("click", () => {
        const next = current() === "dark" ? "light" : "dark";
        root.dataset.theme = next;
        try { localStorage.setItem("gl-theme", next); } catch (e) { /* solo preferenza */ }
        label();
    });
    label();
}
