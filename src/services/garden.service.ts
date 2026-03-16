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
                    params: { user: "string", pass: "string" },
                    async handler(ctx: Context<any>) {
                        const { user, pass } = ctx.params;

                        // DOBBIAMO MANDARE RICHIESTA A CON USER E PASS A AUTH E LUI CI RISPONDE O SUCCESS O FAIL
                        // se true restituisci cookies e return true
                        // se false ritorna false

                        return await broker.call("auth.login", {user, pass});

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
