import { Service, ServiceBroker } from "moleculer";
import DbService from "moleculer-db";
import SqlAdapter from "moleculer-db-adapter-sequelize";
import dotenv from "dotenv";
dotenv.config();


export default class DataService extends Service {
    protected readonly connectionString: string;

    public constructor(broker: ServiceBroker) {
        super(broker);

        // Utente e password vanno codificati: con caratteri come @ : / # nell'URL verrebbero letti host e database sbagliati.
        const user = encodeURIComponent(process.env.DB_USER ?? "");
        const password = encodeURIComponent(process.env.DB_PASSWORD ?? "");
        this.connectionString = `${process.env.DB_DIALECT}://${user}:${password}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;
    }

    protected getBaseSchema() {
        return {
            mixins: [DbService],
            adapter: new SqlAdapter(this.connectionString),
        };
    }
}
