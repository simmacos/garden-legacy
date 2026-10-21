// Service worker: rende l'app installabile e tiene i file statici (pagine, CSS, JS, icone) sul dispositivo.
// L'interfaccia si apre subito dalla copia salvata, senza aspettare la rete (utile quando Cloudflare è lento).
// NON tocca mai /api: sono dati personali, vanno sempre in rete e non finiscono nella cache.
//
// AD OGNI RILASCIO che cambia file statici: aumentare VERSION. Senza, i dispositivi continuano a usare la copia vecchia.

const VERSION = "v6";
const CACHE = `garden-static-${VERSION}`;

// File che devono stare TUTTI nella cache, della stessa versione: se uno non si scarica l'installazione fallisce
// e resta in uso la versione precedente (meglio di un dashboard.js vecchio con un lib.js nuovo).
const CORE = [
    "/dashboard.html", "/plant.html", "/auth/auth.html",
    "/css/style.css",
    "/js/theme.js", "/js/lib.js", "/js/dashboard.js", "/js/plant.js", "/js/pwa.js",
    "/manifest.webmanifest"
];

// Utili offline ma non essenziali: se uno manca non fallisce l'installazione.
const OPTIONAL = [
    "/img/favicon.svg", "/img/apple-touch-icon.png",
    "/img/icon-192.png", "/img/icon-512.png", "/img/icon-maskable-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // cache: "reload" salta la cache HTTP del browser: si salva davvero la versione nuova del server
        const fetchFresh = url => cache.add(new Request(url, { cache: "reload" }));
        await Promise.all(CORE.map(fetchFresh));
        await Promise.allSettled(OPTIONAL.map(fetchFresh));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) {
            if (key.startsWith("garden-static-") && key !== CACHE) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const request = event.request;
    if (request.method !== "GET") return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;     // Google Fonts ecc.: le gestisce il browser
    if (url.pathname.startsWith("/api/")) return;         // dati personali: sempre in rete, mai in cache

    event.respondWith(cacheFirst(request, url));
});

/** Prima la copia salvata (istantanea); se non c'è si va in rete e si salva per la prossima volta. */
async function cacheFirst(request, url) {
    const cache = await caches.open(CACHE);
    // la chiave è solo il percorso: /plant.html?id=3 e ?id=7 sono la stessa pagina
    const key = new Request(url.origin + url.pathname);
    const cached = await cache.match(key);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(key, response.clone());
    return response;
}
