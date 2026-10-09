import sharp from "sharp";

// Stile foto scelto: "Ultra" con vivacità "Extra" (vedi confronto fatto in fase di design).
// Foto -> griglia di pixel piccola, colori vivaci, palette ridotta, salvata come PNG di pochi KB.
// Il browser la ingrandisce con `image-rendering: pixelated`.

/** Lato lungo della griglia (in pixel "grandi"). */
const GRID = 192;
/** Ogni pixel della griglia è la mediana di un blocco BLOCK x BLOCK della foto ridotta. */
const BLOCK = 4;
/** Colori della palette PNG. */
const COLOURS = 96;
/** Ampiezza del dithering ordinato (Bayer 4x4), in livelli di colore 0..255. */
const DITHER_SPREAD = 14;
/** Vivacità "Extra": vibrance (alza di più i colori spenti), saturazione globale, curva a S sul contrasto. */
const VIVID = { vibrance: 1.2, saturation: 1.2, curve: 0.32 };
/** Contorni scuri sui bordi netti: quanto scurire (0..1) e soglia del gradiente di luminanza. */
const INK = { amount: 0.22, threshold: 0.2 };
/** Foto in ingresso oltre questo numero di pixel vengono rifiutate (protezione da bombe di decompressione). */
const MAX_INPUT_PIXELS = 100_000_000;

export interface ProcessedPhoto {
    data: Buffer;
    mimeType: "image/png";
    width: number;
    height: number;
}

export class InvalidImageError extends Error {}

interface Grid {
    data: Buffer; // RGB, 3 byte per pixel
    width: number;
    height: number;
}

/** Foto -> griglia RGB: mediana per canale su blocchi, così i bordi restano netti (niente medie sporche). */
async function toGrid(input: Buffer): Promise<Grid> {
    const { data, info } = await sharp(input, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
        .rotate() // orientamento EXIF (foto da telefono)
        .flatten({ background: "#ffffff" }) // trasparenze su bianco
        .toColourspace("srgb")
        .resize({ width: GRID * BLOCK, height: GRID * BLOCK, fit: "inside", kernel: "lanczos3" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const width = Math.floor(info.width / BLOCK);
    const height = Math.floor(info.height / BLOCK);
    if (width < 1 || height < 1) throw new InvalidImageError("Image is too small");

    const out = Buffer.alloc(width * height * 3);
    const samples = new Uint8Array(BLOCK * BLOCK);
    const mid = (BLOCK * BLOCK) / 2;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            for (let c = 0; c < 3; c++) {
                let n = 0;
                for (let dy = 0; dy < BLOCK; dy++) {
                    for (let dx = 0; dx < BLOCK; dx++) {
                        samples[n++] = data[((y * BLOCK + dy) * info.width + (x * BLOCK + dx)) * 3 + c]!;
                    }
                }
                samples.sort();
                out[(y * width + x) * 3 + c] = (samples[mid - 1]! + samples[mid]!) >> 1;
            }
        }
    }
    return { data: out, width, height };
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const curveS = (x: number) => {
    const v = clamp01(x);
    return v + VIVID.curve * (v * v * (3 - 2 * v) - v);
};

/** Vibrance + saturazione + curva a S. */
function applyVivid(data: Buffer): void {
    for (let i = 0; i < data.length; i += 3) {
        let r = data[i]! / 255, g = data[i + 1]! / 255, b = data[i + 2]! / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const s = max ? (max - min) / max : 0;
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        const k = (1 + VIVID.vibrance * (1 - s)) * VIVID.saturation;
        r = luma + (r - luma) * k;
        g = luma + (g - luma) * k;
        b = luma + (b - luma) * k;
        data[i] = Math.round(curveS(r) * 255);
        data[i + 1] = Math.round(curveS(g) * 255);
        data[i + 2] = Math.round(curveS(b) * 255);
    }
}

/** Scurisce i pixel sui bordi netti (Sobel sulla luminanza): effetto "pixel art" con contorno. */
function applyInk({ data, width, height }: Grid): void {
    const lum = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
        lum[i] = (0.299 * data[i * 3]! + 0.587 * data[i * 3 + 1]! + 0.114 * data[i * 3 + 2]!) / 255;
    }
    const L = (x: number, y: number) => lum[y * width + x]!;
    const darkness = new Float32Array(width * height);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const gx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1)) / 4;
            const gy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1) - L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1)) / 4;
            const magnitude = Math.hypot(gx, gy);
            if (magnitude > INK.threshold) darkness[y * width + x] = Math.min(1, 0.5 + (magnitude - INK.threshold) / 0.3);
        }
    }
    for (let i = 0; i < width * height; i++) {
        if (!darkness[i]) continue;
        const f = 1 - INK.amount * darkness[i]!;
        data[i * 3] = data[i * 3]! * f;
        data[i * 3 + 1] = data[i * 3 + 1]! * f;
        data[i * 3 + 2] = data[i * 3 + 2]! * f;
    }
}

/** Palette (PLTE) di un PNG indicizzato. */
function readPalette(png: Buffer): Buffer {
    let p = 8; // dopo la firma PNG
    while (p + 8 <= png.length) {
        const length = png.readUInt32BE(p);
        if (png.toString("latin1", p + 4, p + 8) === "PLTE") return png.subarray(p + 8, p + 8 + length);
        p += 12 + length;
    }
    throw new Error("PNG palette not found");
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Palette ottimale (libimagequant) + dithering ordinato Bayer 4x4 -> PNG indicizzato. */
async function quantize({ data, width, height }: Grid): Promise<Buffer> {
    const raw = { raw: { width, height, channels: 3 as const } };
    const probe = await sharp(data, raw).png({ palette: true, colours: COLOURS, dither: 0, effort: 10 }).toBuffer();
    const palette = readPalette(probe);
    const size = palette.length / 3;

    const mapped = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const threshold = (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16 - 0.5;
            const i = (y * width + x) * 3;
            const r = data[i]! + threshold * DITHER_SPREAD;
            const g = data[i + 1]! + threshold * DITHER_SPREAD;
            const b = data[i + 2]! + threshold * DITHER_SPREAD;
            let best = 0, bestDistance = Infinity;
            for (let k = 0; k < size; k++) {
                const dr = r - palette[k * 3]!, dg = g - palette[k * 3 + 1]!, db = b - palette[k * 3 + 2]!;
                const distance = dr * dr + dg * dg + db * db;
                if (distance < bestDistance) { bestDistance = distance; best = k; }
            }
            mapped[i] = palette[best * 3]!;
            mapped[i + 1] = palette[best * 3 + 1]!;
            mapped[i + 2] = palette[best * 3 + 2]!;
        }
    }
    return sharp(mapped, raw).png({ palette: true, colours: COLOURS, dither: 0, effort: 10 }).toBuffer();
}

/** Foto qualsiasi (JPEG, PNG, WebP, ...) -> PNG pixelato e vivace. Lancia InvalidImageError se non è un'immagine valida. */
export async function pixelate(input: Buffer): Promise<ProcessedPhoto> {
    try {
        const grid = await toGrid(input);
        applyVivid(grid.data);
        applyInk(grid);
        const data = await quantize(grid);
        return { data, mimeType: "image/png", width: grid.width, height: grid.height };
    } catch (err: any) {
        if (err instanceof InvalidImageError) throw err;
        throw new InvalidImageError(err?.message ?? "Unsupported or corrupted image");
    }
}
