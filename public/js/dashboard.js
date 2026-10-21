import {
    ago, api, cachedApi, chipFromDays, dropCache, el, initThemeToggle, shortDate, showError, clearError, todayISO, todayParts, writeCache
} from "/js/lib.js";

// Su mobile il pulsante è nascosto (come nel 4b); la scelta fatta altrove vale comunque.
initThemeToggle(document.getElementById("theme-toggle"));

const today = todayParts();
document.getElementById("today-label").append(
    el("span", {}, today.weekday),
    el("span", {}, today.dayMonth),
    el("span", { class: "year" }, today.year)
);

let plants = [];
let reminders = [];
let photos = [];               // [{ plantId, updatedAt }]: dati grezzi, per la copia locale
let photoVersions = new Map(); // plantId -> updatedAt (ms): serve all'URL con versione della foto

// ---------- Promemoria ----------

const UPCOMING_LIMIT = 5; // promemoria futuri mostrati prima di "Show more"
let showAllUpcoming = false;

const REMINDER_CODES = { watering: "WAT", fertilizing: "FER", task: "TSK" };

const reminderKey = r => `${r.type}:${r.plantId}:${r.taskId ?? ""}`;

// Promemoria appena segnati come fatti, finché il server non risponde:
// "pending" = pulsante ✓✓ (450 ms), "gone" = riga già nascosta in attesa della risposta.
const completing = new Map();

function doneUrl(r) {
    if (r.type === "task") return `/tasks/${r.taskId}/done`;
    return `/plants/${r.plantId}/${r.type === "watering" ? "water" : "fertilize"}`;
}

function doneLabel(r) {
    if (r.type === "task") return `Mark done: ${r.taskName}, ${r.plantName}`;
    return `Mark done: ${r.type === "watering" ? "water" : "feed"} ${r.plantName}`;
}

/** Segna il promemoria come fatto: ✓✓ per un attimo, la riga sparisce subito, poi si allinea al server. */
async function complete(r) {
    const key = reminderKey(r);
    if (completing.has(key)) return;
    completing.set(key, "pending");
    clearError();
    renderReminders();

    const shownLongEnough = new Promise(resolve => setTimeout(resolve, 450)).then(() => {
        if (completing.has(key)) {
            completing.set(key, "gone");
            renderReminders();
        }
    });
    try {
        await api("POST", doneUrl(r));
        if (r.type === "task") dropCache(`/plants/${r.plantId}/tasks`); // la scheda pianta ha le attività vecchie
        applyDashboard(await api("GET", "/dashboard"));
        writeCache("/dashboard", { plants, reminders, photos });
    } catch (err) {
        showError(err.message); // la riga ricompare: non è stato registrato
    } finally {
        await shownLongEnough;
        completing.delete(key);
        render();
    }
}

/** "WAT · Oct 14"; per i lavori anche il nome: "TSK · Repot · Oct 24" (una pianta può avere più lavori). */
function reminderMeta(r) {
    const parts = [REMINDER_CODES[r.type], ...(r.type === "task" ? [r.taskName] : []), shortDate(r.dueDate)];
    return parts.join(" · ");
}

function reminderRow(r) {
    const chip = chipFromDays(r.daysUntilDue);
    const pending = completing.has(reminderKey(r));
    return el("div", { class: "reminder", "data-s": chip.s },
        el("a", { class: "reminder-main", href: `/plant.html?id=${r.plantId}` },
            el("div", { class: "reminder-plant" }, r.plantName),
            el("div", { class: "reminder-meta" }, reminderMeta(r))
        ),
        el("div", { class: "reminder-status" },
            el("span", { class: "reminder-chip" }, `${chip.glyph} ${chip.label}`),
            el("button", {
                class: "reminder-done", type: "button", "aria-label": doneLabel(r), disabled: pending,
                onclick: () => complete(r)
            }, pending ? "✓✓" : "✓")
        )
    );
}

function renderReminders() {
    const visible = reminders.filter(r => completing.get(reminderKey(r)) !== "gone");
    document.getElementById("reminders-count").textContent = visible.length ? `[${visible.length}]` : "";
    const box = document.getElementById("reminders");
    if (!visible.length) {
        box.replaceChildren(el("div", { class: "empty reminders-empty" },
            el("div", { class: "empty-label" }, "[0] No reminders"),
            el("p", {}, "All caught up. Due dates show up here once a plant has a watering, feeding or task schedule.")
        ));
        return;
    }
    // Scaduti e di oggi sempre tutti; dei futuri solo i primi UPCOMING_LIMIT, il resto dietro il pulsante.
    const due = visible.filter(r => r.daysUntilDue <= 0);
    const upcoming = visible.filter(r => r.daysUntilDue > 0);
    const hidden = showAllUpcoming ? 0 : Math.max(0, upcoming.length - UPCOMING_LIMIT);
    const rows = [...due, ...(hidden ? upcoming.slice(0, UPCOMING_LIMIT) : upcoming)].map(reminderRow);

    if (upcoming.length > UPCOMING_LIMIT) {
        rows.push(el("button", {
            class: "btn btn-mono btn-dashed reminders-more",
            type: "button",
            "aria-expanded": showAllUpcoming ? "true" : "false",
            onclick: () => {
                showAllUpcoming = !showAllUpcoming;
                renderReminders();
            }
        }, showAllUpcoming ? "Show less" : `Show ${hidden} more`));
    }
    box.replaceChildren(...rows);
}

// ---------- Piante ----------

async function water(plant, button) {
    button.disabled = true;
    clearError();
    try {
        Object.assign(plant, await api("POST", `/plants/${plant.id}/water`));
        reminders = await api("GET", "/reminders");
        // la copia locale segue la modifica, così alla prossima apertura non si vede lo stato vecchio
        writeCache("/dashboard", { plants, reminders, photos });
        render();
    } catch (err) {
        button.disabled = false;
        showError(err.message);
    }
}

function plantCard(plant) {
    const wateredToday = plant.lastWateredAt === todayISO();
    const button = el("button", { class: "btn btn-water", type: "button", "data-w": wateredToday ? "1" : "0" },
        wateredToday ? "✓ Watered" : "Water");
    if (!wateredToday) button.addEventListener("click", () => water(plant, button));

    const href = `/plant.html?id=${plant.id}`;
    const version = photoVersions.get(plant.id);
    // Con foto: l'immagine riempie l'area. Senza: iniziale grande e "+ ADD PHOTO" (come nel design).
    return el("article", { class: "card" },
        el("a", { class: `card-photo${version ? " has-photo" : ""}`, href, "aria-hidden": "true", tabindex: "-1" },
            version
                ? el("img", { class: "card-img", src: `/api/plants/${plant.id}/photo?v=${version}`, alt: "", loading: "lazy" })
                : [el("span", { class: "initial" }, plant.name.charAt(0).toUpperCase()), el("span", { class: "hint" }, "+ ADD PHOTO")]
        ),
        el("div", { class: "card-body" },
            el("a", { class: "card-info", href },
                el("div", { class: "card-cat" }, plant.category?.name ?? "Uncategorized"),
                el("div", { class: "card-name" }, plant.name),
                el("div", { class: "stats" },
                    stat("Watered", plant.lastWateredAt),
                    stat("Fed", plant.lastFertilizedAt)
                )
            ),
            button
        )
    );
}

function stat(label, date) {
    return el("div", {},
        el("div", { class: "k" }, label),
        el("div", { class: "v" }, date ? ago(date) : "—")
    );
}

/** Gruppi per categoria in ordine alfabetico, "Uncategorized" in fondo. */
function groupByCategory(list) {
    const groups = new Map();
    for (const plant of list) {
        const key = plant.category?.id ?? 0;
        if (!groups.has(key)) groups.set(key, { name: plant.category?.name ?? "Uncategorized", plants: [] });
        groups.get(key).plants.push(plant);
    }
    return [...groups.entries()]
        .sort(([ka, a], [kb, b]) => (ka === 0) - (kb === 0) || a.name.localeCompare(b.name))
        .map(([, group]) => group);
}

function renderGroups() {
    const box = document.getElementById("groups");
    if (!plants.length) {
        box.replaceChildren(el("div", { class: "empty empty-big" },
            el("div", { class: "empty-label" }, "[0] Plants logged"),
            el("h2", {}, "The notebook", el("br"), "is empty"),
            el("p", {}, "Log your first plant: a name is enough. Photo, category and schedules can come later."),
            el("a", { class: "btn btn-accent btn-hard btn-lg", href: "/plant.html" }, "+ Add your first plant")
        ));
        return;
    }
    box.replaceChildren(...groupByCategory(plants).map(group =>
        el("section", { class: "group" },
            el("div", { class: "section-head" },
                el("h2", { class: "h-section" }, group.name),
                el("span", { class: "count" }, `[${group.plants.length}]`)
            ),
            el("div", { class: "cards" }, group.plants.map(plantCard))
        )
    ));
}

function render() {
    renderReminders();
    renderGroups();
}

/**
 * Piante, promemoria e foto arrivano insieme da /dashboard: prima la copia locale (se c'è), poi la rete.
 * Si ridisegna solo se la rete porta dati diversi.
 */
function applyDashboard(data) {
    plants = data.plants;
    reminders = data.reminders;
    photos = data.photos;
    photoVersions = new Map(photos.map(p => [p.plantId, Date.parse(p.updatedAt)]));
}

async function load() {
    // copie di versioni precedenti dell'app (una richiesta per elenco): non servono più
    ["/plants", "/reminders", "/photos"].forEach(dropCache);

    // Le categorie servono alla scheda pianta: si scaldano qui, così la prima scheda aperta è già istantanea
    cachedApi("/categories", () => {}).catch(() => {});

    try {
        await cachedApi("/dashboard", data => {
            // dopo una modifica dalla scheda pianta i promemoria non sono noti (li calcola il server): si aspetta la rete
            if (!data.reminders) return;
            applyDashboard(data);
            render();
            document.getElementById("content").hidden = false;
        });
    } catch (err) {
        if (err.status !== 401) showError(err.message);
    }
}

load();
