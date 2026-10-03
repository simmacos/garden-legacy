import { Context, ServiceBroker } from "moleculer";
import DataService from "./data.base";
import plantModel from "../../models/plant.model";
import {
    badRequest, currentUserId, dateOrToday, idParam, notFound,
    parseDate, parseInterval, parseName, parseText
} from "../../lib/validation";

interface CategoryRef { id: number; name: string }
type CategoryMap = Map<number, CategoryRef>;

// Campi facoltativi: se assenti dai parametri non vengono toccati.
const OPTIONAL_FIELDS: Record<string, (value: unknown, categories: CategoryMap) => unknown> = {
    description: v => parseText(v, "Description"),
    notes: v => parseText(v, "Notes"),
    categoryId: (v, categories) => {
        if (v === null || v === "") return null;
        const id = typeof v === "string" ? Number(v) : v;
        if (typeof id !== "number" || !categories.has(id)) throw badRequest("Invalid category");
        return id;
    },
    lastWateredAt: v => parseDate(v, "Last watered"),
    wateringIntervalDays: v => parseInterval(v, "Watering frequency"),
    lastFertilizedAt: v => parseDate(v, "Last fertilized"),
    fertilizingIntervalDays: v => parseInterval(v, "Fertilizing frequency")
};

function parseOptionalFields(params: Record<string, unknown>, categories: CategoryMap) {
    const fields: Record<string, unknown> = {};
    for (const [key, parse] of Object.entries(OPTIONAL_FIELDS)) {
        if (params[key] !== undefined) fields[key] = parse(params[key], categories);
    }
    return fields;
}

async function loadCategories(ctx: Context<any, any>): Promise<CategoryMap> {
    const list = await ctx.call("categories.list") as CategoryRef[];
    return new Map(list.map(c => [c.id, { id: c.id, name: c.name }]));
}

function serialize(row: any, categories: CategoryMap) {
    const p = row.get({ plain: true });
    return {
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        notes: p.notes ?? null,
        categoryId: p.categoryId ?? null,
        category: categories.get(p.categoryId) ?? null,
        lastWateredAt: p.lastWateredAt,
        wateringIntervalDays: p.wateringIntervalDays,
        lastFertilizedAt: p.lastFertilizedAt,
        fertilizingIntervalDays: p.fertilizingIntervalDays,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
    };
}

const optionalAny = { type: "any", optional: true };
const plantFieldParams = {
    description: optionalAny,
    notes: optionalAny,
    categoryId: optionalAny,
    lastWateredAt: optionalAny,
    wateringIntervalDays: optionalAny,
    lastFertilizedAt: optionalAny,
    fertilizingIntervalDays: optionalAny
};

// Le azioni list/get/create/update/remove sostituiscono quelle di moleculer-db:
// sempre filtrate per utente, quindi `cache: false` (la cache di moleculer-db
// è per parametri, non per utente, e non verrebbe invalidata dalle scritture).
export default class PlantsService extends DataService {
    public constructor(broker: ServiceBroker) {
        super(broker);

        const baseSchema = this.getBaseSchema();
        this.parseServiceSchema({
            name: "plants",
            ...baseSchema,
            dependencies: ["users", "categories"],

            model: plantModel,

            methods: {
                /** Pianta dell'utente, altrimenti 404 (anche se esiste ma è di un altro). */
                async findOwned(id: number, userId: number) {
                    const plant = await this.adapter.model.findOne({ where: { id, userId } });
                    if (!plant) throw notFound("Plant");
                    return plant;
                },

                /** Registra l'esecuzione (annaffiatura/concimazione): data = parametro `date` o oggi. */
                async recordDone(ctx: Context<any, any>, field: "lastWateredAt" | "lastFertilizedAt") {
                    const userId = currentUserId(ctx);
                    const plant = await this.findOwned(ctx.params.id, userId);
                    await plant.update({ [field]: dateOrToday(ctx.params.date) });
                    return serialize(plant, await loadCategories(ctx));
                }
            },

            actions: {
                list: {
                    cache: false,
                    params: {},
                    async handler(ctx) {
                        const userId = currentUserId(ctx);
                        const [rows, categories] = await Promise.all([
                            this.adapter.model.findAll({ where: { userId }, order: [["name", "ASC"]] }),
                            loadCategories(ctx)
                        ]);
                        return rows.map((row: any) => serialize(row, categories));
                    }
                },

                get: {
                    cache: false,
                    params: { id: idParam },
                    async handler(ctx) {
                        const userId = currentUserId(ctx);
                        const plant = await this.findOwned((ctx.params as any).id, userId);
                        return serialize(plant, await loadCategories(ctx));
                    }
                },

                create: {
                    cache: false,
                    params: { name: { type: "any" }, ...plantFieldParams },
                    async handler(ctx) {
                        const userId = currentUserId(ctx);
                        const params = ctx.params as Record<string, unknown>;
                        const categories = await loadCategories(ctx);
                        const plant = await this.adapter.model.create({
                            userId,
                            name: parseName(params.name, "Name", 120),
                            ...parseOptionalFields(params, categories)
                        });
                        return serialize(plant, categories);
                    }
                },

                update: {
                    cache: false,
                    params: { id: idParam, name: optionalAny, ...plantFieldParams },
                    async handler(ctx) {
                        const userId = currentUserId(ctx);
                        const params = ctx.params as Record<string, unknown>;
                        const plant = await this.findOwned(params.id as number, userId);
                        const categories = await loadCategories(ctx);
                        const patch = parseOptionalFields(params, categories);
                        if (params.name !== undefined) patch.name = parseName(params.name, "Name", 120);
                        await plant.update(patch);
                        return serialize(plant, categories);
                    }
                },

                // Attività e foto collegate vengono eliminate dalle FK (ON DELETE CASCADE).
                remove: {
                    cache: false,
                    params: { id: idParam },
                    async handler(ctx) {
                        const userId = currentUserId(ctx);
                        const { id } = ctx.params as any;
                        const deleted = await this.adapter.model.destroy({ where: { id, userId } });
                        if (!deleted) throw notFound("Plant");
                        return { id };
                    }
                },

                water: {
                    cache: false,
                    params: { id: idParam, date: optionalAny },
                    handler(ctx) {
                        return this.recordDone(ctx, "lastWateredAt");
                    }
                },

                fertilize: {
                    cache: false,
                    params: { id: idParam, date: optionalAny },
                    handler(ctx) {
                        return this.recordDone(ctx, "lastFertilizedAt");
                    }
                }
            }
        });
    }
}
