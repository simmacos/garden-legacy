import { addDays, daysBetween } from "./dates";

export interface ReminderPlant {
    id: number;
    name: string;
    lastWateredAt: string | null;
    wateringIntervalDays: number | null;
    lastFertilizedAt: string | null;
    fertilizingIntervalDays: number | null;
    /** Concimazione una tantum: se c'è, il promemoria è questa data (vince su ultima + frequenza). */
    fertilizingDueDate: string | null;
}

export interface ReminderTask {
    id: number;
    plantId: number;
    name: string;
    intervalDays: number | null;
    lastDoneAt: string | null;
    /** Lavoro una tantum: se c'è, il promemoria è questa data (vince su ultima + frequenza). */
    dueDate: string | null;
}

export interface Reminder {
    type: "watering" | "fertilizing" | "task";
    plantId: number;
    plantName: string;
    taskId: number | null;
    taskName: string | null;
    dueDate: string;
    status: "overdue" | "today" | "upcoming";
    /** Negativo se scaduto, 0 oggi, positivo se futuro. */
    daysUntilDue: number;
}

function describe(dueDate: string, today: string) {
    const daysUntilDue = daysBetween(today, dueDate);
    const status = daysUntilDue < 0 ? "overdue" : daysUntilDue === 0 ? "today" : "upcoming";
    return { dueDate, daysUntilDue, status } as const;
}

/** Scadenza di un'attività: la data singola se c'è, altrimenti ultima + frequenza (senza una delle due niente promemoria). */
function schedule(last: string | null, interval: number | null, dueDate: string | null, today: string) {
    if (dueDate) return describe(dueDate, today);
    if (!last || !interval) return null;
    return describe(addDays(last, interval), today);
}

/** Ordine: scaduti (più vecchi prima), oggi, futuri più vicini = dueDate crescente. */
export function buildReminders(plants: ReminderPlant[], tasks: ReminderTask[], today: string): Reminder[] {
    const reminders: Reminder[] = [];

    for (const plant of plants) {
        const base = { plantId: plant.id, plantName: plant.name, taskId: null, taskName: null };
        const watering = schedule(plant.lastWateredAt, plant.wateringIntervalDays, null, today);
        if (watering) reminders.push({ ...base, type: "watering", ...watering });
        const fertilizing = schedule(plant.lastFertilizedAt, plant.fertilizingIntervalDays, plant.fertilizingDueDate, today);
        if (fertilizing) reminders.push({ ...base, type: "fertilizing", ...fertilizing });
    }

    const plantNames = new Map(plants.map(p => [p.id, p.name]));
    for (const task of tasks) {
        const plantName = plantNames.get(task.plantId);
        const due = schedule(task.lastDoneAt, task.intervalDays, task.dueDate, today);
        if (plantName === undefined || !due) continue;
        reminders.push({
            type: "task",
            plantId: task.plantId,
            plantName,
            taskId: task.id,
            taskName: task.name,
            ...due
        });
    }

    return reminders.sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate) ||
        a.plantName.localeCompare(b.plantName) ||
        a.type.localeCompare(b.type) ||
        (a.taskName ?? "").localeCompare(b.taskName ?? "")
    );
}
