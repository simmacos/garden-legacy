import { Context, Errors } from "moleculer";
import { isValidDate, todayISO } from "./dates";

const { MoleculerClientError } = Errors;

export const badRequest = (message: string) => new MoleculerClientError(message, 422, "VALIDATION_ERROR");
export const notFound = (what: string) => new MoleculerClientError(`${what} not found`, 404, "NOT_FOUND");
export const conflict = (message: string) => new MoleculerClientError(message, 409, "CONFLICT");

export function isUniqueViolation(err: any): boolean {
    return err?.name === "SequelizeUniqueConstraintError";
}

/** Id dell'utente autenticato (messo in ctx.meta.user dal gateway). */
export function currentUserId(ctx: Context<any, any>): number {
    const id = ctx.meta.user?.id;
    if (typeof id !== "number") {
        throw new MoleculerClientError("Login required", 401, "UNAUTHORIZED");
    }
    return id;
}

export function parseName(value: unknown, label: string, max: number): string {
    if (typeof value !== "string" || !value.trim()) {
        throw badRequest(`${label} is required`);
    }
    const name = value.trim();
    if (name.length > max) {
        throw badRequest(`${label} is too long (max ${max} characters)`);
    }
    return name;
}

/** Testo libero facoltativo: null o stringa vuota -> null. */
export function parseText(value: unknown, label: string): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") throw badRequest(`${label} is not valid`);
    const text = value.trim();
    if (text.length > 65535) throw badRequest(`${label} is too long`);
    return text || null;
}

/** Frequenza in giorni: intero 1..65535, null o vuoto -> nessuna frequenza. */
export function parseInterval(value: unknown, label: string): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = typeof value === "string" ? Number(value) : value;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 65535) {
        throw badRequest(`${label}: whole number of days between 1 and 65535`);
    }
    return n;
}

/** Data YYYY-MM-DD facoltativa: null o vuoto -> null. */
export function parseDate(value: unknown, label: string): string | null {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value !== "string" || !isValidDate(value)) {
        throw badRequest(`${label}: use format YYYY-MM-DD`);
    }
    return value;
}

/** Data di esecuzione: se assente, oggi. */
export function dateOrToday(value: unknown): string {
    return parseDate(value, "Date") ?? todayISO();
}

/** Parametro id numerico (anche da path, quindi con conversione). */
export const idParam = { type: "number", integer: true, positive: true, convert: true };
