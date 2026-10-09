import type { ClientInfo } from "./client";

const DAY_MS = 86_400_000;

/** Durata della sessione "scorrevole": ogni uso la riporta a 30 giorni da oggi. */
export const SESSION_DAYS = 30;

/** Durata massima assoluta dal login: oltre, serve rifare il login anche se si usa l'app ogni giorno. */
export const SESSION_MAX_DAYS = 180;

/** Si rinnova al massimo una volta al giorno: evita una scrittura nel DB a ogni richiesta. */
const RENEW_MIN_GAIN_MS = DAY_MS;

export interface SessionTimes {
    expiresAt: Date | string;
    createdAt: Date | string;
}

/** Scadenza di una sessione usata adesso. */
export function sessionExpiry(now: Date): Date {
    return new Date(now.getTime() + SESSION_DAYS * DAY_MS);
}

/** Limite assoluto: dopo questo istante la sessione non vale più, qualunque sia la sua scadenza. */
function hardLimit(createdAt: Date | string): number {
    const created = new Date(createdAt).getTime();
    return Number.isNaN(created) ? Infinity : created + SESSION_MAX_DAYS * DAY_MS;
}

/** Valida = non scaduta e entro il limite assoluto. */
export function isSessionValid(session: SessionTimes, now: Date = new Date()): boolean {
    return new Date(session.expiresAt).getTime() > now.getTime() && now.getTime() < hardLimit(session.createdAt);
}

/**
 * Nuova scadenza se conviene rinnovare (almeno un giorno in più di quella attuale), altrimenti null.
 * Mai oltre il limite assoluto dal login.
 */
export function renewedExpiry(session: SessionTimes, now: Date = new Date()): Date | null {
    const target = Math.min(sessionExpiry(now).getTime(), hardLimit(session.createdAt));
    return target - new Date(session.expiresAt).getTime() > RENEW_MIN_GAIN_MS ? new Date(target) : null;
}

/** Flag Secure del cookie: COOKIE_SECURE=true|false forza il valore, "auto" (default) lo mette se la richiesta è HTTPS. */
export function cookieIsSecure(client: ClientInfo | undefined): boolean {
    const setting = (process.env.COOKIE_SECURE ?? "auto").toLowerCase();
    if (setting === "true") return true;
    if (setting === "false") return false;
    return Boolean(client?.https);
}

export function sessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
    return `auth_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}
