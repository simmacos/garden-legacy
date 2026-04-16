// web-ui.service.ts
import { Service, ServiceBroker, ServiceSchema } from "moleculer";
import ApiGateway from "moleculer-web";
import path from "path";
import cookie from "cookie";
export default class WebUIService extends Service {

    public constructor(broker: ServiceBroker) {
        super(broker);

        const schema: ServiceSchema = {
            name: "web-ui",
            mixins: [ApiGateway],
            methods: {
                async authenticate(ctx, route, req) {
                    const cookies = cookie.parse(req.headers.cookie || "");
                    const token = cookies.auth_token;

                    if (!token) {
                        throw new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_INVALID_TOKEN, "Login required");
                    }

                    const user = await ctx.call("auth.resolveToken", { token });
                    if (!user) {
                        throw new ApiGateway.Errors.UnAuthorizedError(ApiGateway.Errors.ERR_INVALID_TOKEN, "Token not valid!");
                    }

                    return user;
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
                            "POST /login": "plants.login",
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
