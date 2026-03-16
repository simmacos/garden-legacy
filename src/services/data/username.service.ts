import { ServiceBroker, Context } from "moleculer";
import DataService from "./data.base";
import UserModel from "../../models/user.model"; // modello

export default class UsersService extends DataService {
    public constructor(broker: ServiceBroker) {
        super(broker);

        const baseSchema = this.getBaseSchema();
        this.parseServiceSchema({
            name: "users",
            ...baseSchema,
            
            model: UserModel,

            settings: {
                // Scegliamo quali campi mostrare di default quando facciamo una "get" o "find"
                fields: ["id", "username", "isActive", "createdAt"],
                
                // Valida i dati in ingresso prima di salvare
                entityValidator: {
                    username: "string|min:3",
                    password: "string|min:6"
                }
            },
            
            // Azioni custom (oltre alle operazioni CRUD base)
            actions: {
                // Esempio: cambia lo stato di un utente per disabilitarlo
                deactivate: {
                    params: {
                        id: "number"
                    },
                    async handler(ctx: Context<{ id: number }>) {
                        // "this.adapter" è l'accesso diretto ai comandi Sequelize/Database
                        return this.adapter.updateById(ctx.params.id, { isActive: false });
                    }
                }
            }
        });
    }
}
