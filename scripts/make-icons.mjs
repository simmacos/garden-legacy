// Genera le icone PNG della PWA da public/img/favicon.svg.  Uso: npm run icons
//   icon-192.png, icon-512.png      icone "any": quadrato beige con angoli arrotondati
//   icon-maskable-512.png           a tutto campo: Android la ritaglia in cerchio/squircle, la foglia sta nella "safe zone"
//   apple-touch-icon.png (180)      per l'iPhone (iOS arrotonda da solo)
import sharp from "sharp";
import { readFileSync } from "node:fs";

const SVG = readFileSync(new URL("../public/img/favicon.svg", import.meta.url));
const OUT = new URL("../public/img/", import.meta.url);
const BEIGE = "#ece7dc";

/** size: lato in px · leaf: dimensione della foglia rispetto al lato · radius: angoli arrotondati (frazione del lato) */
async function icon(file, { size, leaf, radius = 0 }) {
    const leafPng = await sharp(SVG, { density: 600 })
        .resize({ width: Math.round(size * leaf), height: Math.round(size * leaf), fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer();

    let image = sharp({ create: { width: size, height: size, channels: 4, background: BEIGE } })
        .composite([{ input: leafPng, gravity: "center" }]);

    if (radius) {
        const r = Math.round(size * radius);
        const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`);
        image = sharp(await image.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
    }

    await image.png({ compressionLevel: 9 }).toFile(new URL(file, OUT).pathname);
    console.log("scritto", file, `${size}x${size}`);
}

await icon("icon-192.png", { size: 192, leaf: 0.8, radius: 0.2 });
await icon("icon-512.png", { size: 512, leaf: 0.8, radius: 0.2 });
// Safe zone Android: un cerchio al centro di diametro 80% del lato. La foglia (con il suo margine nell'SVG) sta dentro a 0.62.
await icon("icon-maskable-512.png", { size: 512, leaf: 0.62 });
await icon("apple-touch-icon.png", { size: 180, leaf: 0.78 });
