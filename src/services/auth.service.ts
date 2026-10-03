import { Context, Errors, Service, ServiceBroker } from "moleculer";
import crypto from "crypto"; // Per generare il token random

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

                        // 1. Cerchiamo l'utente nel DB
                        // Usiamo l'azione 'users.find' che ci regala moleculer-db
                        const users = await ctx.call("users.find", { query: { username: user } }) as any[];
                        const foundUser = users[0];

                        // Stesso errore per utente inesistente, disattivato o password errata
                        if (!foundUser || !foundUser.isActive || foundUser.password !== pass) {
                            throw new Errors.MoleculerClientError("Invalid credentials", 401, "INVALID_CREDENTIALS");
                        }

                        // 2. Generiamo un token sicuro
                        const token = crypto.randomUUID();

                        // 3. Calcoliamo la scadenza (30 giorni da oggi)
                        const expiryDate = new Date();
                        expiryDate.setDate(expiryDate.getDate() + 30);

                        // 4. Salviamo la sessione nel DB
                        await ctx.call("sessions.create", {
                            token: token,
                            userId: foundUser.id,
                            expiresAt: expiryDate
                        });

                        // 5. Impostiamo il cookie (che dura anch'esso 30 giorni)
                        // Attenzione: Max-Age è in secondi! 30gg * 24h * 60m * 60s
                        const maxAgeSeconds = 30 * 24 * 60 * 60;

                        (ctx.meta as any).$responseHeaders = {
                            "Set-Cookie": [
                                `auth_token=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}`
                            ]
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
