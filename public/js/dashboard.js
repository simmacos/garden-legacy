import {
    ago, api, chipEl, chipFromDays, el, initThemeToggle, shortDate, showError, clearError, todayISO, todayParts
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
let photoVersions = new Map(); // plantId -> updatedAt (ms): serve all'URL con versione della foto

// ---------- Promemoria ----------

const REMINDER_CODES = { watering: "WAT", fertilizing: "FER", task: "TSK" };

function reminderKind(r) {
    if (r.type === "watering") return "Water";
    if (r.type === "fertilizing") return "Feed";
    return r.taskName;
}

function reminderRow(r) {
    return el("a", { class: "reminder", href: `/plant.html?id=${r.plantId}` },
        el("span", { class: "reminder-code" }, REMINDER_CODES[r.type]),
        el("div", { class: "reminder-main" },
            el("div", { class: "reminder-plant" }, r.plantName),
            el("div", { class: "reminder-meta" }, `${reminderKind(r)} · ${shortDate(r.dueDate)}`)
        ),
        chipEl(chipFromDays(r.daysUntilDue))
    );
}

function renderReminders() {
    document.getElementById("reminders-count").textContent = reminders.length ? `[${reminders.length}]` : "";
    const box = document.getElementById("reminders");
    if (!reminders.length) {
        box.replaceChildren(el("div", { class: "empty reminders-empty" },
            el("div", { class: "empty-label" }, "[0] No reminders"),
            el("p", {}, "All caught up. Due dates show up here once a plant has a watering, feeding or task schedule.")
        ));
        return;
    }
    box.replaceChildren(...reminders.map(reminderRow));
}

// ---------- Piante ----------

async function water(plant, button) {
    button.disabled = true;
    clearError();
    try {
        Object.assign(plant, await api("POST", `/plants/${plant.id}/water`));
        reminders = await api("GET", "/reminders");
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

async function load() {
    try {
        const [plantList, reminderList, photos] = await Promise.all([api("GET", "/plants"), api("GET", "/reminders"), api("GET", "/photos")]);
        plants = plantList;
        reminders = reminderList;
        photoVersions = new Map(photos.map(p => [p.plantId, Date.parse(p.updatedAt)]));
        render();
        document.getElementById("content").hidden = false;
    } catch (err) {
        if (err.status !== 401) showError(err.message);
    }
}

load();
