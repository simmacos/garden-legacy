// Service worker minimale: rende l'app installabile e tiene una copia dei file statici (pagine, CSS, JS, icone)
// per poterla aprire anche senza rete.
// NON tocca mai /api: sono dati personali, vanno sempre in rete e non finiscono nella cache.

const CACHE = "garden-static-v1";

const PRECACHE = [
    "/dashboard.html", "/plant.html", "/auth/auth.html",
    "/css/style.css",
    "/js/theme.js", "/js/lib.js", "/js/dashboard.js", "/js/plant.js", "/js/pwa.js",
    "/img/favicon.svg", "/manifest.webmanifest"
];

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // ogni file a parte: se uno manca non fallisce l'installazione
        await Promise.allSettled(PRECACHE.map(url => cache.add(url)));
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

    event.respondWith(networkFirst(request, url));
});

/** Prima la rete (così dopo un aggiornamento si vede subito la versione nuova), se manca la rete la copia salvata. */
async function networkFirst(request, url) {
    const cache = await caches.open(CACHE);
    // la chiave è solo il percorso: /plant.html?id=3 e ?id=7 sono la stessa pagina
    const key = new Request(url.origin + url.pathname);
    try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") await cache.put(key, response.clone());
        return response;
    } catch (err) {
        const cached = await cache.match(key);
        if (cached) return cached;
        throw err;
    }
}
