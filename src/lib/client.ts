import type { IncomingMessage } from "http";

export interface ClientInfo {
    /** Indirizzo IP del client (dietro un proxy fidato, quello inoltrato dal proxy). */
    ip: string;
    /** true se la richiesta è arrivata su HTTPS (direttamente o tramite il proxy fidato). */
    https: boolean;
}

const first = (value: string | string[] | undefined): string | undefined =>
    (Array.isArray(value) ? value[0] : value)?.trim() || undefined;

/**
 * Quanti proxy fidati ci sono davanti all'app (variabile TRUST_PROXY):
 * `false`/vuoto = 0, `true` = 1, un numero = quel numero (es. 2 con Cloudflare + Nginx Proxy Manager).
 */
export function parseProxyCount(value: string | undefined): number {
    const text = (value ?? "").trim().toLowerCase();
    if (text === "true") return 1;
    return /^[1-9]\d?$/.test(text) ? Number(text) : 0;
}

/**
 * Con N proxy fidati, ognuno aggiunge a destra di X-Forwarded-For l'indirizzo da cui ha ricevuto la richiesta:
 * l'IP del client è quindi l'N-esimo valore CONTANDO DA DESTRA (i valori a sinistra li può scrivere il client).
 * Se ci sono meno valori di proxy dichiarati, non ci si può fidare e si usa l'indirizzo della connessione.
 */
export function clientInfo(req: IncomingMessage, proxies: number = parseProxyCount(process.env.TRUST_PROXY)): ClientInfo {
    let ip = req.socket.remoteAddress ?? "unknown";
    let proto: string | undefined;

    if (proxies > 0) {
        const chain = (first(req.headers["x-forwarded-for"]) ?? "").split(",").map(v => v.trim()).filter(Boolean);
        if (chain.length >= proxies) ip = chain[chain.length - proxies]!;
        // il protocollo lo scrive l'ultimo proxy, quello a contatto con l'app
        proto = first(req.headers["x-forwarded-proto"])?.split(",").pop()!.trim().toLowerCase();
    }

    return {
        ip: ip.replace(/^::ffff:/, ""), // IPv4 "mappato" in IPv6
        https: Boolean((req.socket as any).encrypted) || proto === "https"
    };
}
