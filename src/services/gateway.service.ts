// web-ui.service.ts
import { Service, ServiceBroker, ServiceSchema } from "moleculer";
import ApiGateway from "moleculer-web";
import path from "path";
// "cookie" è CommonJS senza default export: si importa la funzione nominata
import { parse as parseCookie } from "cookie";
import { clientInfo } from "../lib/client";
import { cookieIsSecure, sessionCookie } from "../lib/session";
export default class WebUIService extends Service {

    public constructor(broker: ServiceBroker) {
        super(broker);

        const schema: ServiceSchema = {
            name: "web-ui",
            mixins: [ApiGateway],
            methods: {
                async authenticate(ctx, route, req, res) {
                    const cookies = parseCookie(req.headers.cookie || "");
                    const token = cookies.auth_token;

                    if (!token) {
                        throw new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_INVALID_TOKEN, "Login required");
                    }

                    const result = await ctx.call("auth.resolveToken", { token }) as
                        { user: unknown; renewal?: { maxAgeSeconds: number } } | null;
                    if (!result) {
                        throw new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_INVALID_TOKEN, "Token not valid!");
                    }

                    // Sessione scorrevole: se il server l'ha prolungata, si prolunga anche il cookie nel browser
                    if (result.renewal) {
                        res.setHeader("Set-Cookie", sessionCookie(token, result.renewal.maxAgeSeconds, cookieIsSecure(clientInfo(req))));
                    }

                    return result.user;
                }
            },

            settings: {
                port: process.env.WEB_UI_PORT || 4005,

                routes: [
                    // 1. ROTTA API PROTETTA (Per i dati)
                    {
                        path: "/api",

                        // Qui attiviamo il controllo!
                        authentication: true,

                        // Con degli alias la route è "restrict": solo questi endpoint sono esposti,
                        // non le azioni grezze di moleculer-db (es. users.find).
                        aliases: {
                            "GET /me": "auth.me",

                            "GET /categories": "categories.list",
                            "POST /categories": "categories.create",
                            "PUT /categories/:id": "categories.update",
                            "DELETE /categories/:id": "categories.remove",

                            "GET /plants": "plants.list",
                            "POST /plants": "plants.create",
                            "GET /plants/:id": "plants.get",
                            "PUT /plants/:id": "plants.update",
                            "DELETE /plants/:id": "plants.remove",
                            "POST /plants/:id/water": "plants.water",
                            "POST /plants/:id/fertilize": "plants.fertilize",

                            "GET /plants/:plantId/tasks": "plantTasks.list",
                            "POST /plants/:plantId/tasks": "plantTasks.create",
                            "PUT /tasks/:id": "plantTasks.update",
                            "DELETE /tasks/:id": "plantTasks.remove",
                            "POST /tasks/:id/done": "plantTasks.done",

                            // Foto: una per pianta. PUT riceve il file grezzo (stream), non JSON.
                            "GET /photos": "plantPhotos.list",
                            "GET /plants/:id/photo": "plantPhotos.get",
                            "PUT /plants/:id/photo": { type: "stream", action: "plantPhotos.save" },
                            "DELETE /plants/:id/photo": "plantPhotos.remove",

                            "GET /reminders": "reminders.list"
                        }
                    },

                    // 2. ROTTA API PUBBLICA (Per il Login)
                    // Chiamiamo auth.login DIRETTAMENTE (senza passare da plants.login):
                    // solo così il Set-Cookie scritto nel ctx arriva al browser.
                    {
                        path: "/api/auth",
                        authentication: false,

                        // IP e protocollo del client, serve al rate limiting del login e al flag Secure del cookie
                        onBeforeCall(ctx: any, _route: any, req: any) {
                            ctx.meta.$client = clientInfo(req);
                        },
                        aliases: {
                            "POST /login": "auth.login",
                        }

                    },

                    // 3. ROTTA STATICA (Per l'HTML/JS/CSS)
                    {
                        path: "/",

                        authentication: false,
                        use: [
                            ApiGateway.serveStatic(path.join(__dirname, "../../public"))
                        ]
                    }
                ]
            },


            created: this.serviceCreated.bind(this),
            started: this.serviceStarted.bind(this),
            stopped: this.serviceStopped.bind(this)
        };

        this.parseServiceSchema(schema);
    }


    private serviceCreated(): void {
        this.logger.info("gateway 🌍 created.");
    }

    private async serviceStarted() {
        this.logger.info(`web-ui started on http://localhost:${this.settings.port} ✅`);
    }

    private async serviceStopped() {
        this.logger.info("gateway 🌍 stopped.");
    }
}
