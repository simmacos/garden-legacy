import { Context, Errors, ServiceBroker } from "moleculer";
import type { Readable } from "stream";
import DataService from "./data.base";
import plantPhotoModel from "../../models/plant-photo.model";
import { InvalidImageError, pixelate } from "../../lib/photo";
import { badRequest, currentUserId, idParam, notFound } from "../../lib/validation";

/** Dimensione massima della foto caricata (prima del ridimensionamento). */
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const tooLarge = () => new Errors.MoleculerClientError(
    `Photo is too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024} MB)`, 413, "PAYLOAD_TOO_LARGE"
);

/**
 * Legge il corpo della richiesta. Oltre il limite smette di accumulare ma continua a leggere
 * fino alla fine: distruggere subito lo stream chiuderebbe la connessione e il client non
 * riceverebbe l'errore 413. Solo se il file è enorme (4x il limite) si interrompe.
 */
function readUpload(stream: Readable, maxBytes: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let exceeded = false;
        let done = false;
        const finish = (fn: () => void) => { if (!done) { done = true; fn(); } };

        stream.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes) {
                exceeded = true;
                chunks.length = 0;
                if (size > maxBytes * 4) stream.destroy();
            } else if (!exceeded) {
                chunks.push(chunk);
            }
        });
        stream.on("end", () => finish(() => (exceeded ? reject(tooLarge()) : resolve(Buffer.concat(chunks)))));
        stream.on("error", err => finish(() => reject(err)));
        stream.on("close", () => finish(() => reject(exceeded ? tooLarge() : badRequest("Upload interrupted"))));
    });
}

// Una foto per pianta. Il modello non ha userId: la proprietà si verifica tramite la pianta
// (plants.get lancia 404 se la pianta non è dell'utente).
// `cache: false`: vedi categories.service.ts.
export default class PlantPhotosService extends DataService {
    public constructor(broker: ServiceBroker) {
        super(broker);

        const baseSchema = this.getBaseSchema();
        this.parseServiceSchema({
            name: "plantPhotos",
            ...baseSchema,
            dependencies: ["plants"],

            model: plantPhotoModel,

            methods: {
                async assertPlantOwned(ctx: Context<any, any>, plantId: number) {
                    currentUserId(ctx);
                    await ctx.call("plants.get", { id: plantId });
                }
            },

            actions: {
                // Quali piante dell'utente hanno una foto e quando è stata aggiornata
                // (serve a costruire l'URL con versione). Non legge i dati dell'immagine.
                list: {
                    cache: false,
                    params: {},
                    async handler(ctx) {
                        currentUserId(ctx);
                        const plants = await ctx.call("plants.list") as { id: number }[];
                        if (!plants.length) return [];
                        const rows = await this.adapter.model.findAll({
                            where: { plantId: plants.map(p => p.id) },
                            attributes: ["plantId", "updatedAt"]
                        });
                        return rows.map((r: any) => ({ plantId: r.plantId, updatedAt: r.updatedAt }));
                    }
                },

                // Immagine binaria. Con `?v=` (versione) la cache dura un anno, senza va rivalidata.
                get: {
                    cache: false,
                    params: { id: idParam, v: { type: "any", optional: true } },
                    async handler(ctx) {
                        const { id, v } = ctx.params as { id: number; v?: unknown };
                        await this.assertPlantOwned(ctx, id);
                        const photo = await this.adapter.model.findOne({ where: { plantId: id } });
                        if (!photo) throw notFound("Photo");

                        ctx.meta.$responseType = photo.mimeType;
                        ctx.meta.$responseHeaders = {
                            "Cache-Control": v !== undefined ? "private, max-age=31536000, immutable" : "private, no-cache"
                        };
                        return photo.imageData;
                    }
                },

                // Salva o sostituisce la foto. Il corpo della richiesta è il file (stream);
                // l'id della pianta arriva dal path in ctx.meta.$params.
                save: {
                    cache: false,
                    async handler(ctx) {
                        const plantId = Number((ctx.meta as any).$params?.id);
                        if (!Number.isInteger(plantId) || plantId < 1) throw badRequest("Invalid plant id");
                        await this.assertPlantOwned(ctx, plantId);

                        // Se il client dichiara già un file troppo grande, si risponde senza leggerlo
                        const declared = Number((ctx.params as any).headers?.["content-length"]);
                        if (declared > MAX_UPLOAD_BYTES) throw tooLarge();

                        const upload = await readUpload(ctx.params as unknown as Readable, MAX_UPLOAD_BYTES);
                        if (!upload.length) throw badRequest("Photo is empty");

                        let processed;
                        try {
                            processed = await pixelate(upload);
                        } catch (err) {
                            if (err instanceof InvalidImageError) throw badRequest("Unsupported or corrupted image");
                            throw err;
                        }

                        await this.adapter.model.upsert({
                            plantId,
                            imageData: processed.data,
                            mimeType: processed.mimeType
                        });
                        const saved = await this.adapter.model.findOne({ where: { plantId }, attributes: ["plantId", "updatedAt"] });
                        return {
                            plantId,
                            updatedAt: saved.updatedAt,
                            width: processed.width,
                            height: processed.height,
                            bytes: processed.data.length
                        };
                    }
                },

                remove: {
                    cache: false,
                    params: { id: idParam },
                    async handler(ctx) {
                        const { id } = ctx.params as { id: number };
                        await this.assertPlantOwned(ctx, id);
                        const deleted = await this.adapter.model.destroy({ where: { plantId: id } });
                        if (!deleted) throw notFound("Photo");
                        return { plantId: id };
                    }
                }
            }
        });
    }
}
