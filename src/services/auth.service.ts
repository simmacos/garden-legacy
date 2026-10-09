import { Context, Errors, Service, ServiceBroker } from "moleculer";
import crypto from "crypto"; // Per generare il token random
import type { ClientInfo } from "../lib/client";
import { FailureLimiter } from "../lib/rate-limit";
import { SESSION_DAYS, cookieIsSecure, isSessionValid, renewedExpiry, sessionCookie, sessionExpiry } from "../lib/session";

// Limiti sui login falliti (finestra di 15 minuti), in memoria:
// - per coppia IP + utente: protegge un account dal tentativo di indovinare la password;
// - per IP: protegge da chi prova tanti utenti diversi.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginByUser = new FailureLimiter(5, LOGIN_WINDOW_MS);
const loginByIp = new FailureLimiter(20, LOGIN_WINDOW_MS);
setInterval(() => { loginByUser.sweep(); loginByIp.sweep(); }, LOGIN_WINDOW_MS).unref();

export default class AuthService extends Service {
    public constructor(broker: ServiceBroker) {
        super(broker);
        this.parseServiceSchema({
            name: "auth",
            actions: {
                login: {
                    params: { user: "string", pass: "string" },
                    async handler(ctx: Context<any>) {
                        const { user, pass } = ctx.params;
                        const client = (ctx.meta as any).$client as ClientInfo | undefined;
                        const ip = client?.ip ?? "unknown";
                        const userKey = `${ip}|${user.toLowerCase()}`;

                        // 0. Troppi tentativi falliti: si risponde 429 senza nemmeno controllare la password
                        const wait = Math.max(loginByUser.retryAfter(userKey), loginByIp.retryAfter(ip));
                        if (wait > 0) {
                            (ctx.meta as any).$responseHeaders = { "Retry-After": String(wait) };
                            throw new Errors.MoleculerClientError(
                                `Too many login attempts. Try again in ${Math.ceil(wait / 60)} min.`, 429, "TOO_MANY_ATTEMPTS", { retryAfter: wait }
                            );
                        }

                        // 1. Cerchiamo l'utente nel DB
                        // Usiamo l'azione 'users.find' che ci regala moleculer-db
                        const users = await ctx.call("users.find", { query: { username: user } }) as any[];
                        const foundUser = users[0];

                        // Stesso errore per utente inesistente, disattivato o password errata
                        if (!foundUser || !foundUser.isActive || foundUser.password !== pass) {
                            loginByUser.fail(userKey);
                            loginByIp.fail(ip);
                            throw new Errors.MoleculerClientError("Invalid credentials", 401, "INVALID_CREDENTIALS");
                        }
                        loginByUser.reset(userKey);

                        // 2. Generiamo un token sicuro
                        const token = crypto.randomUUID();

                        // 3. Calcoliamo la scadenza (30 giorni da oggi; poi si prolunga a ogni uso, vedi resolveToken)
                        const expiryDate = sessionExpiry(new Date());

                        // 4. Salviamo la sessione nel DB
                        await ctx.call("sessions.create", {
                            token: token,
                            userId: foundUser.id,
                            expiresAt: expiryDate
                        });

                        // 5. Impostiamo il cookie (che dura anch'esso 30 giorni)
                        // Attenzione: Max-Age è in secondi! 30gg * 24h * 60m * 60s
                        const maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60;

                        (ctx.meta as any).$responseHeaders = {
                            "Set-Cookie": [sessionCookie(token, maxAgeSeconds, cookieIsSecure(client))],
                            // la risposta contiene un cookie di sessione: niente cache
                            "Cache-Control": "no-store"
                        };

                        return { success: true };
                    }
                },

                // Azione per dire al frontend "sei loggato?" (il Gateway ha già validato il token)
                me: {
                    async handler(ctx: Context<any>) {
                        const { id, username } = (ctx.meta as any).user;
                        return { ok: true, user: { id, username } };
                    }
                },
                // Azione per verificare il token (chiamata dal Gateway).
                // Ritorna { user, renewal? } oppure null. `renewal` c'è quando la sessione è stata prolungata:
                // il gateway deve allora rinnovare anche il cookie nel browser.
                resolveToken: {
                    params: { token: "string" },
                    async handler(ctx: Context<{ token: string }>) {
                        // 1. Cerchiamo il token nel DB
                        const sessions = await ctx.call("sessions.find", { query: { token: ctx.params.token } }) as any[];
                        const session = sessions[0];

                        // 2. Se non c'è, è scaduto o ha superato il limite assoluto dal login -> non autenticato
                        const now = new Date();
                        if (!session || !isSessionValid(session, now)) {
                            return null;
                        }

                        // 3. Se valido, recuperiamo l'utente (disattivato -> non autenticato)
                        const user = await ctx.call("users.get", { id: session.userId }) as any;
                        if (!user || !user.isActive) {
                            return null;
                        }

                        // 4. Sessione scorrevole: se serve (al massimo una volta al giorno) si prolunga di altri 30 giorni
                        let renewal: { maxAgeSeconds: number } | undefined;
                        const newExpiry = renewedExpiry(session, now);
                        if (newExpiry) {
                            try {
                                await ctx.call("sessions.renew", { id: session.id, expiresAt: newExpiry });
                                renewal = { maxAgeSeconds: Math.floor((newExpiry.getTime() - now.getTime()) / 1000) };
                            } catch (err) {
                                // il rinnovo è un di più: se fallisce l'utente resta autenticato fino alla scadenza attuale
                                this.logger.warn("Session renewal failed", err);
                            }
                        }

                        // Solo i campi pubblici: la password non deve finire in ctx.meta.user
                        return { user: { id: user.id, username: user.username }, renewal };
                    }
                }
            }
        });
    }
}
