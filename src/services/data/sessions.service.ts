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
                // Niente cache (resolveToken usa find): create e cleanOld scrivono via adapter
                // senza invalidarla, quindi una sessione cancellata resterebbe valida.
                get: { cache: false },
                find: { cache: false },
                list: { cache: false },
                count: { cache: false },

                // Sessione scorrevole: sposta in avanti la scadenza di una sessione esistente.
                renew: {
                    cache: false,
                    params: { id: "number", expiresAt: "any" },
                    async handler(ctx) {
                        const { id, expiresAt } = ctx.params as { id: number; expiresAt: Date | string };
                        const date = new Date(expiresAt);
                        if (Number.isNaN(date.getTime())) throw new Error("expiresAt is not valid");
                        const [updated] = await this.adapter.model.update({ expiresAt: date }, { where: { id } });
                        return { id, updated };
                    }
                },

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
                            throw new Error("expiresAt is not valid");
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
