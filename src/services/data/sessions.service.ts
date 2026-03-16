import { ServiceBroker } from "moleculer";
import DataService from "../../services/data/data.base";
import sessionsModel from "../../models/sessions.model";
import Sequelize from "sequelize";

export default class SessionsService extends DataService {
    public constructor(broker: ServiceBroker) {
        super(broker);
        const baseSchema = this.getBaseSchema();
        this.parseServiceSchema({
            name: "sessions",
            ...baseSchema,
            model: sessionsModel,
            actions: {
                create: {
                    params: {
                        token: "string",
                        userId: "number",
                        expiresAt: "any"
                    },
                    async handler(ctx) {
                        const rawExpiresAt = (ctx.params as any).expiresAt;
                        const expiresAt = rawExpiresAt instanceof Date ? rawExpiresAt : new Date(rawExpiresAt);

                        if (Number.isNaN(expiresAt.getTime())) {
                            throw new Error("expiresAt non valido");
                        }

                        return this.adapter.insert({
                            token: ctx.params.token,
                            userId: ctx.params.userId,
                            expiresAt
                        });
                    }
                },
                // Azione per pulire le sessioni vecchie (opzionale, da chiamare ogni tanto)
                cleanOld: {
                    async handler() {
                        const Op = Sequelize.Op;
                        return this.adapter.model.destroy({
                            where: {
                                expiresAt: { [Op.lt]: new Date() } // Elimina dove scadenza < oggi
                            }
                        });
                    }
                }
            }
        });
    }
}
