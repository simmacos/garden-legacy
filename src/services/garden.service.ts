import { Context, Service, ServiceBroker, ServiceSchema } from "moleculer";


export default class TestDashboardService extends Service {

    public constructor(broker: ServiceBroker) {
        super(broker);


        const schema: ServiceSchema = {
            name: "plants",
            created: this.serviceCreated.bind(this),
            started: this.serviceStarted.bind(this),
            stopped: this.serviceStopped.bind(this),
            actions: {
                // auth.service.ts (o scintilla.service.ts)
                login: {
                    params: { user: "string", pass: "string" }, // Nota: i nomi devono matchare quelli dell'HTML/JS
                    async handler(ctx: Context<any>) {
                        const { user, pass } = ctx.params;

                        if (user === "simmaco" && pass === "segreto") {

                            // Invece di chiamare una funzione su un oggetto che non esiste...
                            // ...scriviamo i dati in un oggetto meta speciale!

                            (ctx.meta as any).$responseHeaders = {
                                "Set-Cookie": [
                                    `auth_token=questo-è-il-tuo-pass-segreto-123; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400`
                                ],
                                // Puoi aggiungere altri header se vuoi
                                "X-Login-Status": "Success"
                            };

                            // Se vuoi cambiare lo status code (es. 201 Created)
                            (ctx.meta as any).$statusCode = 200;

                            return { success: true };
                        }
                        throw new Error("Credenziali errate");
                    }
                }

            }
        };

        this.parseServiceSchema(schema);
    }




    private serviceCreated(): void {
        this.logger.info("Scintilla created.");
    }

    private async serviceStarted() {
        this.logger.info("Scintilla partita ⚡");

    }

    private async serviceStopped() {
        this.logger.info("Scintilla chiusa ⚡");
    }
}
