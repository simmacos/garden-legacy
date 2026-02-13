import { ServiceBroker } from "moleculer";

// 2. Importiamo la configurazione che abbiamo creato nel file a parte
import brokerConfig from "./moleculer.config";

// --- INIZIO LOGICA DI AVVIO ---

// 3. Creiamo una nuova istanza del ServiceBroker, passandogli la nostra configurazione.
// Pensa al broker come al direttore d'orchestra che coordina tutti i musicisti (i servizi).
const broker = new ServiceBroker(brokerConfig);

// 4. Diciamo al broker di cercare e caricare tutti i file che finiscono in ".service.ts"
// dentro la cartella "src" e le sue sottocartelle.
// In questo modo, non dovrai mai aggiungere manualmente i nuovi servizi che creerai.
broker.loadServices(__dirname, "**/*.service.ts");

// 5. Avviamo il broker. Questa è un'operazione asincrona (restituisce una Promise).
// Una volta che il broker è pronto, avvierà tutti i servizi caricati.
broker.start()
    .then(() => {
        // 6. (Opzionale ma UTILISSIMO) Avviamo il REPL di Moleculer.
        // Questo ti darà una console interattiva per chiamare azioni,
        // emettere eventi e controllare lo stato dei servizi in tempo reale.
        broker.repl();
    })
    .catch(err => {
        // Se qualcosa va storto durante l'avvio, lo stampiamo in console ed usciamo.
        console.error("Errore fatale durante l'avvio del broker:", err);
        process.exit(1);
    });
