import { Service, ServiceBroker } from "moleculer";
import DbService from "moleculer-db";
import SqlAdapter from "moleculer-db-adapter-sequelize";
import dotenv from "dotenv";
dotenv.config();


export default class DataService extends Service {

    public constructor(broker: ServiceBroker) {
        super(broker);

        const connectionString = `${process.env.DB_DIALECT}://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;


        this.parseServiceSchema({
            name: "data",
            mixins: [DbService],
            

            adapter: new SqlAdapter(connectionString),

            // Modello generico (sovrascritto dai figli)
            model: {
                name: "data_generic",
                define: {}
            },

            async started() {
                // Log di conferma connessione
                this.logger.info(`Connected to DB ${process.env.DB_DIALECT} on ${process.env.DB_HOST}`);
            }
        });
    }
}
