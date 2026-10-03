// Date "solo giorno" come stringhe YYYY-MM-DD (come DATEONLY di Sequelize).
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

const toMs = (date: string): number => Date.parse(`${date}T00:00:00Z`);

export function isValidDate(value: string): boolean {
    if (!ISO_DATE.test(value)) return false;
    const ms = toMs(value);
    return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** Data odierna (fuso del server). */
export function todayISO(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(date: string, days: number): string {
    return new Date(toMs(date) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Giorni da `from` a `to` (positivo se `to` è dopo `from`). */
export function daysBetween(from: string, to: string): number {
    return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}
