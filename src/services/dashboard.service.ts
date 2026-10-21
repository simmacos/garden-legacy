import { Service, ServiceBroker } from "moleculer";
import { todayISO } from "../lib/dates";
import { buildReminders, ReminderPlant, ReminderTask } from "../lib/reminders";

export default class DashboardService extends Service {
    public constructor(broker: ServiceBroker) {
        super(broker);
        this.parseServiceSchema({
            name: "dashboard",
            dependencies: ["plants", "plantTasks", "plantPhotos"],
            actions: {
                // Tutto quello che serve alla dashboard in una sola richiesta: piante, promemoria, foto.
                // Le tre azioni sono già filtrate per utente (ctx.meta.user); i promemoria si calcolano
                // sugli stessi dati delle piante, quindi sono coerenti con l'elenco.
                get: {
                    async handler(ctx) {
                        const [plants, tasks, photos] = await Promise.all([
                            ctx.call("plants.list") as Promise<(ReminderPlant & object)[]>,
                            ctx.call("plantTasks.list") as Promise<ReminderTask[]>,
                            ctx.call("plantPhotos.list")
                        ]);
                        return { plants, reminders: buildReminders(plants, tasks, todayISO()), photos };
                    }
                }
            }
        });
    }
}
