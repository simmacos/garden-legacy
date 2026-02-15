// web-ui.service.ts
import { Service, ServiceBroker, ServiceSchema } from "moleculer";
import ApiGateway from "moleculer-web";
import path from "path";

export default class WebUIService extends Service {

    public constructor(broker: ServiceBroker) {
        super(broker);

        const schema: ServiceSchema = {
            name: "web-ui",
            mixins: [ApiGateway],
            methods: {
                async authenticate(ctx, route, req) {
                    let auth = req.headers["authorization"];

                    if (auth && auth.startsWith("Bearer ")) {
                        let token = auth.slice(7);

                        if (token === "questo-è-il-tuo-pass-segreto-123") {

                            // Questo oggetto finirà in ctx.meta.user nelle action successive
                            return {
                                id: 1,
                                username: "simmaco",
                                role: "admin"
                            };
                        }
                    }

                    throw new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_INVALID_TOKEN, "non autorizzato?????");
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

                        aliases: {
                            "GET /plants": "plants.list",
                            "POST /plant": "plant.create"
                        }
                    },

                    // 2. ROTTA API PUBBLICA (Per il Login)
                    {
                        path: "/api/auth",

                        authentication: false,
                        aliases: {
                            "POST /login": "auth.login"
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
