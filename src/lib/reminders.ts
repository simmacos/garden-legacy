import { addDays, daysBetween } from "./dates";

export interface ReminderPlant {
    id: number;
    name: string;
    lastWateredAt: string | null;
    wateringIntervalDays: number | null;
    lastFertilizedAt: string | null;
    fertilizingIntervalDays: number | null;
}

export interface ReminderTask {
    id: number;
    plantId: number;
    name: string;
    intervalDays: number | null;
    lastDoneAt: string | null;
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

function schedule(last: string | null, interval: number | null, today: string) {
    // Senza ultima data o senza frequenza non c'è promemoria.
    if (!last || !interval) return null;
    const dueDate = addDays(last, interval);
    const daysUntilDue = daysBetween(today, dueDate);
    const status = daysUntilDue < 0 ? "overdue" : daysUntilDue === 0 ? "today" : "upcoming";
    return { dueDate, daysUntilDue, status } as const;
}

/** Ordine: scaduti (più vecchi prima), oggi, futuri più vicini = dueDate crescente. */
export function buildReminders(plants: ReminderPlant[], tasks: ReminderTask[], today: string): Reminder[] {
    const reminders: Reminder[] = [];

    for (const plant of plants) {
        const base = { plantId: plant.id, plantName: plant.name, taskId: null, taskName: null };
        const watering = schedule(plant.lastWateredAt, plant.wateringIntervalDays, today);
        if (watering) reminders.push({ ...base, type: "watering", ...watering });
        const fertilizing = schedule(plant.lastFertilizedAt, plant.fertilizingIntervalDays, today);
        if (fertilizing) reminders.push({ ...base, type: "fertilizing", ...fertilizing });
    }

    const plantNames = new Map(plants.map(p => [p.id, p.name]));
    for (const task of tasks) {
        const plantName = plantNames.get(task.plantId);
        const due = schedule(task.lastDoneAt, task.intervalDays, today);
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
