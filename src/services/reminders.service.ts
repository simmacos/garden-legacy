import { Service, ServiceBroker } from "moleculer";
import { todayISO } from "../lib/dates";
import { buildReminders, ReminderPlant, ReminderTask } from "../lib/reminders";

export default class RemindersService extends Service {
    public constructor(broker: ServiceBroker) {
        super(broker);
        this.parseServiceSchema({
            name: "reminders",
            dependencies: ["plants", "plantTasks"],
            actions: {
                // Promemoria dell'utente (annaffiatura, concimazione, attività), ordinati per scadenza.
                list: {
                    async handler(ctx) {
                        // plants.list / plantTasks.list sono già filtrate per utente (ctx.meta.user).
                        const [plants, tasks] = await Promise.all([
                            ctx.call("plants.list") as Promise<ReminderPlant[]>,
                            ctx.call("plantTasks.list") as Promise<ReminderTask[]>
                        ]);
                        return buildReminders(plants, tasks, todayISO());
                    }
                }
            }
        });
    }
}
