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
 * Dietro un reverse proxy fidato (TRUST_PROXY=true) si leggono gli header X-Forwarded-*.
 * Con un solo proxy davanti l'IP vero è l'ULTIMO valore di X-Forwarded-For (quello aggiunto dal proxy):
 * i valori precedenti li può scrivere il client, quindi non sono affidabili.
 */
export function clientInfo(req: IncomingMessage, trustProxy: boolean = process.env.TRUST_PROXY === "true"): ClientInfo {
    let ip = req.socket.remoteAddress ?? "unknown";
    let proto: string | undefined;

    if (trustProxy) {
        const forwarded = first(req.headers["x-forwarded-for"]);
        if (forwarded) ip = forwarded.split(",").pop()!.trim() || ip;
        proto = first(req.headers["x-forwarded-proto"])?.split(",").pop()!.trim().toLowerCase();
    }

    return {
        ip: ip.replace(/^::ffff:/, ""), // IPv4 "mappato" in IPv6
        https: Boolean((req.socket as any).encrypted) || proto === "https"
    };
}
