import { Context, ServiceBroker } from "moleculer";
import DataService from "./data.base";
import plantTaskModel from "../../models/plant-task.model";
import { currentUserId, dateOrToday, idParam, notFound, parseDate, parseInterval, parseName } from "../../lib/validation";

const serialize = (row: any) => {
    const { id, plantId, name, intervalDays, lastDoneAt, createdAt, updatedAt } = row.get({ plain: true });
    return { id, plantId, name, intervalDays, lastDoneAt, createdAt, updatedAt };
};

const optionalAny = { type: "any", optional: true };

// Il modello non ha userId: la proprietà si verifica tramite la pianta
// (plants.get lancia 404 se la pianta non è dell'utente).
// `cache: false`: vedi categories.service.ts.
export default class PlantTasksService extends DataService {
    public constructor(broker: ServiceBroker) {
        super(broker);

        const baseSchema = this.getBaseSchema();
        this.parseServiceSchema({
            name: "plantTasks",
            ...baseSchema,
            dependencies: ["plants"],

            model: plantTaskModel,

            methods: {
                async assertPlantOwned(ctx: Context<any, any>, plantId: number) {
                    currentUserId(ctx);
                    await ctx.call("plants.get", { id: plantId });
                },

                /** Attività di una pianta dell'utente, altrimenti 404. */
                async findOwned(ctx: Context<any, any>, id: number) {
                    const task = await this.adapter.model.findByPk(id);
                    if (!task) throw notFound("Task");
                    try {
                        await this.assertPlantOwned(ctx, task.plantId);
                    } catch (err: any) {
                        if (err.code === 404) throw notFound("Task");
                        throw err;
                    }
                    return task;
                }
            },

            actions: {
                // Con `plantId`: attività di quella pianta. Senza: di tutte le piante dell'utente.
                list: {
                    cache: false,
                    params: { plantId: { ...idParam, optional: true } },
                    async handler(ctx) {
                        const { plantId } = ctx.params as { plantId?: number };
                        let where: { plantId: number | number[] };
                        if (plantId !== undefined) {
                            await this.assertPlantOwned(ctx, plantId);
                            where = { plantId };
                        } else {
                            currentUserId(ctx);
                            const plants = await ctx.call("plants.list") as { id: number }[];
                            if (!plants.length) return [];
                            where = { plantId: plants.map(p => p.id) };
                        }
                        const rows = await this.adapter.model.findAll({ where, order: [["plantId", "ASC"], ["name", "ASC"]] });
                        return rows.map(serialize);
                    }
                },

                create: {
                    cache: false,
                    params: {
                        plantId: idParam,
                        name: { type: "any" },
                        intervalDays: optionalAny,
                        lastDoneAt: optionalAny
                    },
                    async handler(ctx) {
                        const params = ctx.params as Record<string, unknown>;
                        await this.assertPlantOwned(ctx, params.plantId as number);
                        const task = await this.adapter.model.create({
                            plantId: params.plantId,
                            name: parseName(params.name, "Name", 120),
                            intervalDays: parseInterval(params.intervalDays, "Frequency"),
                            lastDoneAt: parseDate(params.lastDoneAt, "Last done")
                        });
                        return serialize(task);
                    }
                },

                update: {
                    cache: false,
                    params: { id: idParam, name: optionalAny, intervalDays: optionalAny, lastDoneAt: optionalAny },
                    async handler(ctx) {
                        const params = ctx.params as Record<string, unknown>;
                        const task = await this.findOwned(ctx, params.id as number);
                        const patch: Record<string, unknown> = {};
                        if (params.name !== undefined) patch.name = parseName(params.name, "Name", 120);
                        if (params.intervalDays !== undefined) patch.intervalDays = parseInterval(params.intervalDays, "Frequency");
                        if (params.lastDoneAt !== undefined) patch.lastDoneAt = parseDate(params.lastDoneAt, "Last done");
                        await task.update(patch);
                        return serialize(task);
                    }
                },

                remove: {
                    cache: false,
                    params: { id: idParam },
                    async handler(ctx) {
                        const task = await this.findOwned(ctx, (ctx.params as any).id);
                        await task.destroy();
                        return { id: task.id };
                    }
                },

                // Registra l'esecuzione: data = parametro `date` o oggi.
                done: {
                    cache: false,
                    params: { id: idParam, date: optionalAny },
                    async handler(ctx) {
                        const params = ctx.params as Record<string, unknown>;
                        const task = await this.findOwned(ctx, params.id as number);
                        await task.update({ lastDoneAt: dateOrToday(params.date) });
                        return serialize(task);
                    }
                }
            }
        });
    }
}
