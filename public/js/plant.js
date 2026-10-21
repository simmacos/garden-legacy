import {
    MAX_PHOTO_BYTES, ago, api, cachedApi, chipEl, chipFor, clearError, dropCache, el, initThemeToggle, patchCache,
    prepareImage, readCache, shortDate, showError, todayISO, writeCache
} from "/js/lib.js";

const $ = id => document.getElementById(id);

const rawId = new URLSearchParams(location.search).get("id");
const isNew = rawId === null;

let plant = null;          // pianta salvata (solo in modifica)
let categories = [];       // [{ id, name }]
let allPlants = [];        // per i conteggi delle categorie (solo dopo che /plants è arrivata)
let tasks = [];
let editingTaskId = null;
let addingTask = false;
let lastCategory = "";     // valore del select prima di "+ New category…"
let photoVersion = null;   // updatedAt (ms) della foto salvata: serve a costruire l'URL con versione
let pendingPhoto = null;   // foto scelta in creazione: si carica dopo il primo salvataggio
let pendingPhotoUrl = null;

initThemeToggle($("theme-toggle"));

// ---------- Cura (annaffiatura / concimazione) ----------

const care = {};

function field(labelText, input, extraClass = "") {
    return el("div", { class: `field ${extraClass}`.trim() }, el("label", { for: input.id }, labelText), input);
}

function createCare(key, title) {
    const last = el("input", { class: "input input-mono", id: `${key}-last`, type: "date" });
    const freq = el("input", {
        class: "input input-mono", id: `${key}-freq`, type: "number", min: "1", max: "65535",
        inputmode: "numeric", placeholder: "—"
    });
    const lastLabel = el("div", { class: "care-last" });
    const chipSlot = el("span", {});

    const update = () => {
        lastLabel.textContent = "Last: " + (last.value ? `${shortDate(last.value)} · ${ago(last.value)}` : "Never");
        chipSlot.replaceChildren(chipEl(chipFor(last.value, freq.value)));
    };
    last.addEventListener("input", update);
    freq.addEventListener("input", update);

    const done = el("button", {
        class: "btn btn-accent btn-hard", type: "button",
        onclick: () => { last.value = todayISO(); last.dispatchEvent(new Event("input", { bubbles: true })); }
    }, "Done today");

    const root = el("div", { class: "care" },
        el("div", { class: "care-head" },
            el("div", {}, el("div", { class: "care-title" }, title), lastLabel),
            chipSlot
        ),
        el("div", { class: "care-fields" },
            field("Last done", last),
            field("Every (days)", freq, "narrow"),
            done
        )
    );
    return { root, last, freq, update };
}

care.watering = createCare("watering", "Watering");
care.fertilizing = createCare("fertilizing", "Fertilizing");
$("care").append(care.watering.root, care.fertilizing.root);

// ---------- Form ----------

function renderCategorySelect(selectedId) {
    const select = $("category");
    select.replaceChildren(
        el("option", { value: "" }, "Uncategorized"),
        ...categories.map(c => el("option", { value: String(c.id) }, c.name)),
        el("option", { value: "__new" }, "+ New category…")
    );
    select.value = selectedId === null || selectedId === undefined ? "" : String(selectedId);
    lastCategory = select.value;
}

function sortCategories() {
    categories.sort((a, b) => a.name.localeCompare(b.name));
}

// Campi che l'utente ha toccato: i dati freschi arrivati dalla rete non li sovrascrivono.
const FORM_FIELDS = ["name", "category", "description", "notes", "watering-last", "watering-freq", "fertilizing-last", "fertilizing-freq"];
const dirty = new Set();

function markDirty(event) {
    if (FORM_FIELDS.includes(event.target.id) && event.target.value !== "__new") dirty.add(event.target.id);
}
$("plant-page").addEventListener("input", markDirty);
$("plant-page").addEventListener("change", markDirty);

/** Riempie il form dalla pianta (o vuoto se nuova), saltando i campi che l'utente ha già modificato. */
function fillForm() {
    const setField = (id, value) => { if (!dirty.has(id)) $(id).value = value ?? ""; };
    setField("name", plant?.name);
    setField("description", plant?.description);
    setField("notes", plant?.notes);
    setField("watering-last", plant?.lastWateredAt);
    setField("watering-freq", plant?.wateringIntervalDays);
    setField("fertilizing-last", plant?.lastFertilizedAt);
    setField("fertilizing-freq", plant?.fertilizingIntervalDays);
    if (!dirty.has("category")) renderCategorySelect(plant?.categoryId ?? null);
    care.watering.update();
    care.fertilizing.update();
    updateInitial();
}

function readForm() {
    const category = $("category").value;
    return {
        name: $("name").value.trim(),
        categoryId: category && category !== "__new" ? Number(category) : null,
        description: $("description").value,
        notes: $("notes").value,
        lastWateredAt: care.watering.last.value || null,
        wateringIntervalDays: care.watering.freq.value || null,
        lastFertilizedAt: care.fertilizing.last.value || null,
        fertilizingIntervalDays: care.fertilizing.freq.value || null
    };
}

function updateInitial() {
    $("photo-initial").textContent = $("name").value.trim().charAt(0).toUpperCase() || "P";
}

// ---------- Copia locale dei dati (vedi cachedApi in lib.js) ----------
// Piante e foto stanno nella copia di /dashboard, la stessa della dashboard. Dopo ogni modifica si aggiorna;
// `reminders: null` = "da ricalcolare": li calcola il server, e la dashboard aspetta la rete.

const byName = (a, b) => a.name.localeCompare(b.name);

function patchDashboard(fn) {
    patchCache("/dashboard", data => ({ ...fn(data), reminders: null }));
}

/** Pianta creata o salvata. */
function cachePlantSaved(saved) {
    writeCache(`/plants/${saved.id}`, saved);
    patchDashboard(data => ({ ...data, plants: [...data.plants.filter(p => p.id !== saved.id), saved].sort(byName) }));
    allPlants = [...allPlants.filter(p => p.id !== saved.id), saved].sort(byName);
}

function cachePlantDeleted(id) {
    patchDashboard(data => ({
        ...data,
        plants: data.plants.filter(p => p.id !== id),
        photos: data.photos.filter(p => p.plantId !== id)
    }));
    dropCache(`/plants/${id}`);
    dropCache(`/plants/${id}/tasks`);
}

function cacheTasks() {
    writeCache(`/plants/${plant.id}/tasks`, tasks);
    patchDashboard(data => data);
}

function cachePhotoSaved(plantId, saved) {
    patchDashboard(data => ({
        ...data,
        photos: [...data.photos.filter(p => p.plantId !== plantId), { plantId, updatedAt: saved.updatedAt }]
    }));
}

/** Categoria rinominata (`category` = { id, name }) o eliminata (`category` = null): si allineano le piante. */
function cachePlantCategories(categoryId, category) {
    const patch = p => (p.categoryId === categoryId ? { ...p, categoryId: category ? categoryId : null, category } : p);
    patchDashboard(data => ({ ...data, plants: data.plants.map(patch) }));
    allPlants = allPlants.map(patch);
}

// ---------- Foto ----------

function renderPhoto() {
    const img = $("photo-img");
    let src = null;
    if (pendingPhotoUrl) src = pendingPhotoUrl;
    else if (photoVersion !== null) src = `/api/plants/${plant.id}/photo?v=${photoVersion}`;

    img.classList.toggle("raw", Boolean(pendingPhotoUrl));
    if (src) {
        img.alt = `Photo of ${$("name").value.trim() || "plant"}`;
        img.src = src;
    } else {
        img.removeAttribute("src");
    }
    img.hidden = !src;
    $("photo-empty").hidden = Boolean(src);
}

// Se il browser non sa mostrare il file scelto (es. HEIC) si torna al segnaposto: l'upload funziona comunque.
$("photo-img").addEventListener("error", () => {
    $("photo-img").hidden = true;
    $("photo-empty").hidden = false;
});

function setPhotoBusy(busy) {
    $("photo-busy").hidden = !busy;
    for (const input of [$("photo-camera"), $("photo-file")]) {
        input.disabled = busy;
        input.closest("label").classList.toggle("is-disabled", busy);
    }
}

/** Prepara il file e lo invia (salva o sostituisce la foto della pianta). Restituisce la risposta del server. */
async function uploadPhoto(plantId, file) {
    const body = await prepareImage(file);
    if (body.size > MAX_PHOTO_BYTES) throw new Error("Photo is too large (max 12 MB)");
    return api("PUT", `/plants/${plantId}/photo`, body);
}

async function onPhotoChosen(input) {
    const file = input.files?.[0];
    input.value = ""; // permette di scegliere di nuovo lo stesso file
    if (!file) return;
    clearError();

    if (isNew) {
        // la pianta non esiste ancora: anteprima locale, upload dopo il primo salvataggio
        if (pendingPhotoUrl) URL.revokeObjectURL(pendingPhotoUrl);
        pendingPhoto = file;
        pendingPhotoUrl = URL.createObjectURL(file);
        renderPhoto();
        return;
    }

    setPhotoBusy(true);
    try {
        const saved = await uploadPhoto(plant.id, file);
        cachePhotoSaved(plant.id, saved);
        photoVersion = Date.parse(saved.updatedAt);
        renderPhoto();
    } catch (err) {
        showError(err.message);
    } finally {
        setPhotoBusy(false);
    }
}

$("photo-camera").addEventListener("change", () => onPhotoChosen($("photo-camera")));
$("photo-file").addEventListener("change", () => onPhotoChosen($("photo-file")));

function validateName() {
    const ok = $("name").value.trim() !== "";
    $("name-error").hidden = ok;
    $("name").setAttribute("aria-invalid", String(!ok));
    return ok;
}

$("name").addEventListener("input", () => { updateInitial(); if (!$("name-error").hidden) validateName(); });
$("name").addEventListener("blur", () => { if (!isNew || $("name").value !== "") validateName(); });

// ---------- Salvataggio ----------

/** Messaggio da mostrare alla prossima apertura di una scheda (sopravvive al redirect). */
function flash(message) {
    try { sessionStorage.setItem("gl-flash", message); } catch (e) { /* solo un avviso */ }
}

function showFlash() {
    try {
        const message = sessionStorage.getItem("gl-flash");
        if (message) {
            sessionStorage.removeItem("gl-flash");
            showError(message);
        }
    } catch (e) { /* storage non disponibile */ }
}

const saveButtons = [...document.querySelectorAll(".js-save")];
const saveLabel = () => (isNew ? "Create plant" : "Save changes");
let savedTimer = null;

function setSaveLabel(text, disabled) {
    saveButtons.forEach(b => { b.textContent = text; b.disabled = disabled; });
}

async function save() {
    clearError();
    if (!validateName()) {
        $("name").focus();
        return;
    }
    setSaveLabel("Saving…", true);
    try {
        if (isNew) {
            const created = await api("POST", "/plants", readForm());
            cachePlantSaved(created);
            if (pendingPhoto) {
                setSaveLabel("Uploading photo…", true);
                try {
                    cachePhotoSaved(created.id, await uploadPhoto(created.id, pendingPhoto));
                } catch (err) {
                    // la pianta esiste già: si apre la sua scheda e lì si mostra l'errore
                    flash(`Plant saved, but the photo could not be uploaded: ${err.message}`);
                }
            }
            window.location.href = `/plant.html?id=${created.id}`;
            return;
        }
        plant = await api("PUT", `/plants/${plant.id}`, readForm());
        dirty.clear(); // il form coincide di nuovo con la pianta salvata
        cachePlantSaved(plant);
        setSaveLabel("✓ Saved", false);
        clearTimeout(savedTimer);
        savedTimer = setTimeout(() => setSaveLabel(saveLabel(), false), 1800);
    } catch (err) {
        showError(err.message);
        setSaveLabel(saveLabel(), false);
    }
}

saveButtons.forEach(b => b.addEventListener("click", save));

// ---------- Categorie ----------

$("category").addEventListener("change", () => {
    if ($("category").value === "__new") {
        $("category").value = lastCategory;
        $("new-cat").hidden = false;
        $("new-cat-name").focus();
    } else {
        lastCategory = $("category").value;
    }
});

function closeNewCategory() {
    $("new-cat").hidden = true;
    $("new-cat-name").value = "";
}

$("new-cat-cancel").addEventListener("click", closeNewCategory);

$("new-cat-create").addEventListener("click", async () => {
    const name = $("new-cat-name").value.trim();
    if (!name) return $("new-cat-name").focus();
    clearError();
    try {
        const created = await api("POST", "/categories", { name });
        patchCache("/categories", list => [...list, created].sort(byName));
        categories.push({ id: created.id, name: created.name });
        sortCategories();
        renderCategorySelect(created.id);
        dirty.add("category");
        closeNewCategory();
    } catch (err) {
        showError(err.message);
    }
});

// ---------- Dialog ----------

function openDialog(className = "") {
    const dialog = el("dialog", { class: `dlg ${className}`.trim() });
    dialog.addEventListener("close", () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
}

function openDeleteDialog() {
    const dialog = openDialog();
    dialog.setAttribute("aria-labelledby", "dlg-delete-title");
    const count = tasks.length;
    dialog.append(
        el("div", { class: "warn" }, "◆ Cannot be undone"),
        el("h3", { id: "dlg-delete-title" }, `Delete “${plant.name}”?`),
        el("p", {}, count
            ? `Its ${count === 1 ? "task" : count + " tasks"} will be deleted too. This cannot be undone.`
            : "This cannot be undone."),
        el("div", { class: "dlg-actions" },
            el("button", { class: "btn", type: "button", onclick: () => dialog.close() }, "Cancel"),
            el("button", {
                class: "btn btn-danger-solid", type: "button",
                onclick: async event => {
                    event.currentTarget.disabled = true;
                    try {
                        await api("DELETE", `/plants/${plant.id}`);
                        cachePlantDeleted(plant.id);
                        window.location.href = "/dashboard.html";
                    } catch (err) {
                        dialog.close();
                        showError(err.message);
                    }
                }
            }, "Delete")
        )
    );
}

let renamingId = null;
let confirmingId = null;

function categoryCount(id) {
    return allPlants.filter(p => p.categoryId === id).length;
}

function confirmMessage(category) {
    const n = categoryCount(category.id);
    if (n === 0) return `“${category.name}” has no plants.`;
    return n === 1
        ? "Its plant won't be deleted: it moves to “Uncategorized”."
        : `Its ${n} plants won't be deleted: they move to “Uncategorized”.`;
}

function openCategoriesDialog() {
    const dialog = openDialog("wide");
    dialog.setAttribute("aria-label", "Manage categories");
    renamingId = null;
    confirmingId = null;

    const rerender = () => {
        dialog.replaceChildren(
            el("div", { class: "dlg-head" },
                el("h3", {}, "Categories"),
                el("button", { class: "btn-text", type: "button", onclick: () => dialog.close() }, "Close")
            ),
            ...categories.map(c => categoryRow(c, rerender)),
            ...(categories.length ? [] : [el("p", {}, "No categories yet.")]),
            el("p", { class: "note" }, "To add a category, pick “+ New category…” in the Category menu.")
        );
    };
    rerender();
}

function categoryRow(category, rerender) {
    const n = categoryCount(category.id);

    if (renamingId === category.id) {
        const input = el("input", {
            class: "input", type: "text", maxlength: "80", value: category.name, "aria-label": "New category name"
        });
        const saveRename = async () => {
            const name = input.value.trim();
            if (!name) return input.focus();
            try {
                const updated = await api("PUT", `/categories/${category.id}`, { name });
                patchCache("/categories", list => list.map(c => (c.id === updated.id ? updated : c)).sort(byName));
                cachePlantCategories(updated.id, { id: updated.id, name: updated.name });
                category.name = updated.name;
                sortCategories();
                renderCategorySelect($("category").value || null);
                renamingId = null;
                rerender();
            } catch (err) {
                showError(err.message);
            }
        };
        input.addEventListener("keydown", e => { if (e.key === "Enter") saveRename(); });
        queueMicrotask(() => input.focus());
        return el("div", { class: "cat-row" }, el("div", { class: "row" },
            input,
            el("button", { class: "btn btn-accent", type: "button", onclick: saveRename }, "Save"),
            el("button", { class: "btn-text", type: "button", onclick: () => { renamingId = null; rerender(); } }, "Cancel")
        ));
    }

    if (confirmingId === category.id) {
        return el("div", { class: "cat-row" }, el("div", { class: "cat-confirm" },
            el("div", { class: "warn" }, `◆ Delete “${category.name}”?`),
            el("p", {}, confirmMessage(category)),
            el("div", { class: "dlg-actions" },
                el("button", { class: "btn", type: "button", onclick: () => { confirmingId = null; rerender(); } }, "Cancel"),
                el("button", {
                    class: "btn btn-danger-solid", type: "button",
                    onclick: async () => {
                        try {
                            await api("DELETE", `/categories/${category.id}`);
                            patchCache("/categories", list => list.filter(c => c.id !== category.id));
                            cachePlantCategories(category.id, null);
                            const selected = $("category").value;
                            categories = categories.filter(c => c.id !== category.id);
                            renderCategorySelect(selected === String(category.id) ? null : selected || null);
                            confirmingId = null;
                            rerender();
                        } catch (err) {
                            showError(err.message);
                        }
                    }
                }, "Delete")
            )
        ));
    }

    return el("div", { class: "cat-row" }, el("div", { class: "cat-line" },
        el("div", { class: "grow" },
            el("div", { class: "cat-name" }, category.name),
            el("div", { class: "cat-count" }, n === 1 ? "1 plant" : `${n} plants`)
        ),
        el("button", { class: "btn-text", type: "button", onclick: () => { renamingId = category.id; confirmingId = null; rerender(); } }, "Rename"),
        el("button", { class: "btn-text danger", type: "button", onclick: () => { confirmingId = category.id; renamingId = null; rerender(); } }, "Delete")
    ));
}

$("manage-cats").addEventListener("click", openCategoriesDialog);
$("delete-plant").addEventListener("click", openDeleteDialog);

// ---------- Attività ----------

async function taskAction(fn) {
    clearError();
    try {
        await fn();
        cacheTasks();
        renderTasks();
    } catch (err) {
        showError(err.message);
    }
}

function replaceTask(updated) {
    tasks = tasks.map(t => (t.id === updated.id ? updated : t));
}

function taskView(task) {
    const chip = chipFor(task.lastDoneAt, task.intervalDays);
    const freq = task.intervalDays ? `every ${task.intervalDays}d` : "no schedule";
    const last = task.lastDoneAt ? `last ${ago(task.lastDoneAt)}` : "never done";
    return el("div", { class: "task-view" },
        el("div", { class: "task-main" },
            el("div", { class: "task-name" }, task.name),
            el("div", { class: "task-meta" }, `${freq} · ${last}`)
        ),
        chip.s === "none" ? null : chipEl(chip),
        el("div", { class: "task-actions" },
            el("button", {
                class: "btn btn-accent", type: "button",
                onclick: () => taskAction(async () => replaceTask(await api("POST", `/tasks/${task.id}/done`)))
            }, "Done"),
            el("button", { class: "btn-text", type: "button", onclick: () => { editingTaskId = task.id; renderTasks(); } }, "Edit"),
            el("button", {
                class: "btn-text danger", type: "button",
                onclick: () => taskAction(async () => {
                    await api("DELETE", `/tasks/${task.id}`);
                    tasks = tasks.filter(t => t.id !== task.id);
                    if (editingTaskId === task.id) editingTaskId = null;
                })
            }, "Delete")
        )
    );
}

/** Form per nome + frequenza (modifica o nuova attività). */
function taskForm({ task, onSave, onCancel, saveLabel: label, nameLabel, placeholder = "" }) {
    const name = el("input", {
        class: "input", type: "text", maxlength: "120", placeholder, value: task?.name ?? "", "aria-label": nameLabel
    });
    const freq = el("input", {
        class: "input freq", type: "number", min: "1", max: "65535", inputmode: "numeric", placeholder: "days",
        value: task?.intervalDays ?? "", "aria-label": "Frequency in days (optional)"
    });
    const submit = () => {
        if (!name.value.trim()) return name.focus();
        onSave({ name: name.value.trim(), intervalDays: freq.value || null });
    };
    name.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });
    queueMicrotask(() => name.focus());
    return el("div", { class: "row inline-form task-edit" },
        name, freq,
        el("button", { class: "btn btn-accent", type: "button", onclick: submit }, label),
        el("button", { class: "btn-text", type: "button", onclick: onCancel }, "Cancel")
    );
}

function renderTasks() {
    $("tasks-count").textContent = `[${tasks.length}]`;

    $("tasks-list").replaceChildren(...tasks.map(task => el("div", { class: "task" },
        editingTaskId === task.id
            ? taskForm({
                task, saveLabel: "Save", nameLabel: "Task name",
                onCancel: () => { editingTaskId = null; renderTasks(); },
                onSave: body => taskAction(async () => {
                    replaceTask(await api("PUT", `/tasks/${task.id}`, body));
                    editingTaskId = null;
                })
            })
            : taskView(task)
    )));

    $("task-add").replaceChildren(addingTask
        ? taskForm({
            saveLabel: "Add", nameLabel: "New task name", placeholder: "e.g. Repotting",
            onCancel: () => { addingTask = false; renderTasks(); },
            onSave: body => taskAction(async () => {
                tasks.push(await api("POST", `/plants/${plant.id}/tasks`, body));
                addingTask = false;
            })
        })
        : el("button", { class: "btn btn-dashed", type: "button", onclick: () => { addingTask = true; renderTasks(); } }, "+ Add task")
    );
}

// ---------- Avvio ----------

function showNotFound() {
    $("not-found").hidden = false;
    $("plant-page").hidden = true;
}

/**
 * Ogni dato arriva prima dalla copia locale (se c'è) e poi dalla rete. La scheda si disegna appena ci sono
 * categorie, pianta e foto; la pianta può partire anche dall'elenco già salvato dalla dashboard.
 * Le attività compaiono quando arrivano. I dati freschi non toccano i campi che l'utente ha modificato.
 */
async function init() {
    if (!isNew && !/^\d+$/.test(rawId)) return showNotFound();
    const id = isNew ? null : Number(rawId);

    const ready = new Set();
    const needed = isNew ? ["categories"] : ["categories", "plant", "photos"];
    let shown = false;
    let tasksShown = false;
    let queued = false;

    const render = () => {
        queued = false;
        if (!shown) {
            if (!needed.every(key => ready.has(key))) return;
            fillForm();
            renderPhoto();
            showFlash();
            setSaveLabel(saveLabel(), false);
            saveButtons.forEach(b => { b.hidden = false; });
            $("save-bar").hidden = false;
            $("plant-page").hidden = false;
            if (isNew) $("tasks-hint").hidden = false;
            shown = true;
        }
        if (!isNew && !tasksShown && ready.has("tasks")) {
            $("tasks-section").hidden = false;
            $("delete-box").hidden = false;
            tasksShown = true;
            renderTasks();
        }
    };
    // le copie arrivano nello stesso istante: un solo disegno
    const got = key => {
        ready.add(key);
        if (!queued) {
            queued = true;
            queueMicrotask(render);
        }
    };

    const onCategories = data => {
        categories = data.map(c => ({ id: c.id, name: c.name }));
        if (shown) renderCategorySelect(dirty.has("category") ? $("category").value : plant?.categoryId ?? null);
        got("categories");
    };
    const onPlants = data => {
        allPlants = data;
        $("manage-cats").disabled = false; // i conteggi delle categorie servono l'elenco completo
    };
    const onPlant = data => {
        if (plant && data.updatedAt < plant.updatedAt) return; // copia più vecchia di quella già in uso
        plant = data;
        document.title = `${plant.name} · Garden Legacy`;
        if (shown) fillForm();
        got("plant");
    };
    const onTasks = data => {
        tasks = data;
        if (tasksShown && editingTaskId === null && !addingTask) renderTasks();
        got("tasks");
    };
    const onPhotos = data => {
        const before = photoVersion;
        const photo = data.find(p => p.plantId === id);
        photoVersion = photo ? Date.parse(photo.updatedAt) : null;
        if (shown && !pendingPhotoUrl && photoVersion !== before) renderPhoto();
        got("photos");
    };

    $("manage-cats").disabled = true;

    if (!isNew) {
        // la scheda parte dalla copia più recente tra la pianta salvata e l'elenco della dashboard
        const seed = [readCache(`/plants/${id}`), readCache("/dashboard")?.plants.find(p => p.id === id)]
            .filter(Boolean)
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
        if (seed) onPlant(seed);
    }

    try {
        // /dashboard dà l'elenco completo delle piante (conteggi categorie) e le foto in una richiesta sola
        const requests = [cachedApi("/categories", onCategories), cachedApi("/dashboard", data => {
            onPlants(data.plants);
            if (!isNew) onPhotos(data.photos);
        })];
        if (!isNew) {
            requests.push(
                cachedApi(`/plants/${id}`, onPlant),
                cachedApi(`/plants/${id}/tasks`, onTasks)
            );
        }
        await Promise.all(requests);
    } catch (err) {
        if (err.status === 404) {
            if (!isNew) cachePlantDeleted(id); // cancellata altrove: la copia locale non vale più
            return showNotFound();
        }
        if (err.status !== 401) showError(err.message);
    }
}

init();
