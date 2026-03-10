import { ServiceBroker } from "moleculer";
import DataService from "../../services/data/data.service";
import sessionsModel from "../../models/sessions.model";
import Sequelize from "sequelize";

export default class SessionsService extends DataService {
    public constructor(broker: ServiceBroker) {
        super(broker);
        this.parseServiceSchema({
            name: "sessions",
            model: {
                name: "session",
                define: sessionsModel
            },
            actions: {
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
