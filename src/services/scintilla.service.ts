// test-dashboard.service.ts
import { Context, Service, ServiceBroker, ServiceSchema } from "moleculer";


export default class TestDashboardService extends Service {

    public constructor(broker: ServiceBroker) {
        super(broker);


        const schema: ServiceSchema = {
            name: "scintilla",
            created: this.serviceCreated.bind(this),
            started: this.serviceStarted.bind(this),
            stopped: this.serviceStopped.bind(this),
            actions: {

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
