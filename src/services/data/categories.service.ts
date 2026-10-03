import { ServiceBroker } from "moleculer";
import DataService from "./data.base";
import categoryModel from "../../models/category.model";
import { conflict, currentUserId, idParam, isUniqueViolation, notFound, parseName } from "../../lib/validation";

const serialize = (row: any) => {
    const { id, name, createdAt, updatedAt } = row.get({ plain: true });
    return { id, name, createdAt, updatedAt };
};

// Le azioni list/create/update/remove sostituiscono quelle di moleculer-db:
// sempre filtrate per utente, quindi `cache: false` (la cache di moleculer-db
// è per parametri, non per utente, e non verrebbe invalidata dalle scritture).
export default class CategoriesService extends DataService {
    public constructor(broker: ServiceBroker) {
        super(broker);

        const baseSchema = this.getBaseSchema();
        this.parseServiceSchema({
            name: "categories",
            ...baseSchema,
            dependencies: ["users"],

            model: categoryModel,

            actions: {
                list: {
                    cache: false,
                    params: {},
                    async handler(ctx) {
                        const userId = currentUserId(ctx);
                        const rows = await this.adapter.model.findAll({ where: { userId }, order: [["name", "ASC"]] });
                        return rows.map(serialize);
                    }
                },

                create: {
                    cache: false,
                    params: { name: { type: "any" } },
                    async handler(ctx) {
                        const userId = currentUserId(ctx);
                        const name = parseName((ctx.params as any).name, "Name", 80);
                        try {
                            return serialize(await this.adapter.model.create({ userId, name }));
                        } catch (err) {
                            if (isUniqueViolation(err)) throw conflict("Category already exists");
                            throw err;
                        }
                    }
                },

                update: {
                    cache: false,
                    params: { id: idParam, name: { type: "any" } },
                    async handler(ctx) {
                        const userId = currentUserId(ctx);
                        const { id, name } = ctx.params as any;
                        const category = await this.adapter.model.findOne({ where: { id, userId } });
                        if (!category) throw notFound("Category");
                        try {
                            return serialize(await category.update({ name: parseName(name, "Name", 80) }));
                        } catch (err) {
                            if (isUniqueViolation(err)) throw conflict("Category already exists");
                            throw err;
                        }
                    }
                },

                // Le piante collegate restano, con categoryId = NULL (FK ON DELETE SET NULL).
                remove: {
                    cache: false,
                    params: { id: idParam },
                    async handler(ctx) {
                        const userId = currentUserId(ctx);
                        const { id } = ctx.params as any;
                        const deleted = await this.adapter.model.destroy({ where: { id, userId } });
                        if (!deleted) throw notFound("Category");
                        return { id };
                    }
                }
            }
        });
    }
}
