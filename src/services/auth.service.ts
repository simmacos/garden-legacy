import { Context, Errors, Service, ServiceBroker } from "moleculer";
import crypto from "crypto"; // Per generare il token random
import type { ClientInfo } from "../lib/client";
import { FailureLimiter } from "../lib/rate-limit";

const SESSION_DAYS = 30;

// Limiti sui login falliti (finestra di 15 minuti), in memoria:
// - per coppia IP + utente: protegge un account dal tentativo di indovinare la password;
// - per IP: protegge da chi prova tanti utenti diversi.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginByUser = new FailureLimiter(5, LOGIN_WINDOW_MS);
const loginByIp = new FailureLimiter(20, LOGIN_WINDOW_MS);
setInterval(() => { loginByUser.sweep(); loginByIp.sweep(); }, LOGIN_WINDOW_MS).unref();

/** Flag Secure del cookie: COOKIE_SECURE=true|false forza il valore, "auto" (default) lo mette se la richiesta è HTTPS. */
function cookieIsSecure(client: ClientInfo | undefined): boolean {
    const setting = (process.env.COOKIE_SECURE ?? "auto").toLowerCase();
    if (setting === "true") return true;
    if (setting === "false") return false;
    return Boolean(client?.https);
}

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

                        // 3. Calcoliamo la scadenza (30 giorni da oggi)
                        const expiryDate = new Date();
                        expiryDate.setDate(expiryDate.getDate() + SESSION_DAYS);

                        // 4. Salviamo la sessione nel DB
                        await ctx.call("sessions.create", {
                            token: token,
                            userId: foundUser.id,
                            expiresAt: expiryDate
                        });

                        // 5. Impostiamo il cookie (che dura anch'esso 30 giorni)
                        // Attenzione: Max-Age è in secondi! 30gg * 24h * 60m * 60s
                        const maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60;
                        const secure = cookieIsSecure(client) ? "; Secure" : "";

                        (ctx.meta as any).$responseHeaders = {
                            "Set-Cookie": [
                                `auth_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`
                            ],
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
                // Azione per verificare il token (chiamata dal Gateway)
                resolveToken: {
                    params: { token: "string" },
                    async handler(ctx: Context<{ token: string }>) {
                        // 1. Cerchiamo il token nel DB
                        const sessions = await ctx.call("sessions.find", { query: { token: ctx.params.token } }) as any[];
                        const session = sessions[0];

                        // 2. Se non c'è o è scaduto -> errore
                        if (!session || new Date(session.expiresAt) < new Date()) {
                            return null;
                        }

                        // 3. Se valido, recuperiamo l'utente (disattivato -> non autenticato)
                        const user = await ctx.call("users.get", { id: session.userId }) as any;
                        if (!user || !user.isActive) {
                            return null;
                        }

                        // Solo i campi pubblici: la password non deve finire in ctx.meta.user
                        return { id: user.id, username: user.username };
                    }
                }
            }
        });
    }
}
