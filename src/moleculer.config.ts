import type { BrokerOptions } from "moleculer";

/**
 * Configurazione del Broker Moleculer per il progetto "Scintilla".
 * Versione minimale per sviluppo locale.
 */
const brokerConfig: BrokerOptions = {
    namespace: "scintilla",
    nodeID: `scintilla-node-${process.pid}`,
    logger: true,
    logLevel: "info",
    transporter: "TCP",
    cacher: "Memory",
    validator: true,
    tracing: {
        enabled: true,
        exporter: "Console"
    },
};

export = brokerConfig;
