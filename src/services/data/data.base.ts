import { Service, ServiceBroker } from "moleculer";
import DbService from "moleculer-db";
import SqlAdapter from "moleculer-db-adapter-sequelize";
import dotenv from "dotenv";
dotenv.config();


export default class DataService extends Service {
    protected readonly connectionString: string;

    public constructor(broker: ServiceBroker) {
        super(broker);

        this.connectionString = `${process.env.DB_DIALECT}://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_DATABASE}`;
    }

    protected getBaseSchema() {
        return {
            mixins: [DbService],
            adapter: new SqlAdapter(this.connectionString),
        };
    }
}
