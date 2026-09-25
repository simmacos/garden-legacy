# Garden Legacy — obiettivo e requisiti concordati

Questo file conserva la visione del prodotto e le decisioni emerse nel brainstorming. Usarlo come riferimento quando si progetta o si implementa il gestionale. I punti che richiedono ancora una scelta sono raccolti in **Questioni aperte**; non inventare requisiti per colmarli.

## Prodotto

Applicazione web per la gestione personale di piante e orto, con interfaccia ispirata al verde e utilizzabile comodamente da desktop e smartphone. L'app può essere usata da più account: i dati di ciascun account devono appartenere al relativo utente.

## Flusso principale

1. L'utente accede con un'autenticazione semplice ma efficace, adatta al progetto; la sicurezza potrà essere migliorata in seguito.
2. La dashboard mostra le piante raggruppate per categoria e gli avvisi delle attività in scadenza.
3. Dalla dashboard si può aggiungere una pianta e registrare rapidamente un'annaffiatura.
4. Si può aprire la scheda di una pianta per visualizzarla o modificarla.
5. Il flusso di visualizzazione e modifica deve essere comodo anche da smartphone, compresa l'acquisizione di una foto con la fotocamera.

## Piante

Ogni pianta appartiene a un solo account e può avere una sola categoria, oppure nessuna. Il **nome è obbligatorio**. Gli altri dati sono facoltativi:

- foto singola, sostituibile con una nuova;
- descrizione;
- campo libero per informazioni e note varie;
- data dell'ultima annaffiatura;
- frequenza di annaffiatura in giorni, facoltativa;
- data dell'ultima concimazione;
- frequenza di concimazione in giorni, facoltativa;
- più attività/lavori associati alla pianta.

L'annaffiatura rapida dalla dashboard registra/aggiorna la data dell'ultima annaffiatura. Per annaffiatura e concimazione si conserva solo la data più recente, senza uno storico degli eventi.

La foto potrà essere caricata da file o acquisita con la fotocamera del telefono. Si vuole ridimensionarla/comprimerla e salvarla nel database SQL. La dimensione/formato precisi non sono ancora stati decisi e non sono necessari per la prima progettazione.

## Categorie

- Servono a raggruppare le piante nella dashboard.
- In creazione o modifica della pianta si può scegliere una categoria esistente o aggiungerne una nuova senza uscire dal flusso.
- Le categorie si possono eliminare.
- Eliminando una categoria, le piante associate rimangono e diventano senza categoria.
- Anche le categorie appartengono all'account che le ha create.

## Attività e promemoria

- Le attività ricorrenti considerate finora sono annaffiatura, concimazione e lavori vari.
- Per annaffiatura, concimazione e ciascun lavoro si può impostare facoltativamente una frequenza in giorni.
- I promemoria sono avvisi visibili nella dashboard; non sono richieste notifiche esterne.
- Una pianta può avere più lavori vari distinti. Ogni lavoro ha un **nome**, può essere modificato e può avere un intervallo in giorni facoltativo. Non è previsto un campo descrizione per il singolo lavoro.
- Ogni lavoro conserva la data dell'ultima esecuzione, come annaffiatura e concimazione. La data viene precompilata con la data corrente quando si aggiunge l'attività, ma può essere impostata o modificata dall'utente.
- Segnare un lavoro come eseguito aggiorna la sua data dell'ultima esecuzione; il promemoria corrente scompare e il prossimo si calcola da quella data usando la frequenza configurata.

## Stato attuale del codice

La base esistente è Node.js/TypeScript con Moleculer, Sequelize e MariaDB. Sono presenti autenticazione con login e sessioni tramite cookie, una dashboard protetta e modelli/servizi per utenti e sessioni. Le funzionalità di dominio per piante, categorie, attività e promemoria devono ancora essere progettate e implementate. Le API/azioni relative alle piante presenti nel gateway non corrispondono ancora a un servizio completo. Il README descrive ancora in parte il template iniziale.

Questa sezione fotografa lo stato visto durante il brainstorming e va aggiornata quando il codice cambia.

## Sequenza suggerita per la prima versione

1. Definire i modelli e le relazioni, includendo la proprietà dei dati per account.
2. Implementare categorie e schede pianta: creazione, visualizzazione, modifica, eliminazione definitiva e categoria facoltativa.
3. Costruire una dashboard responsive raggruppata per categoria, con l'azione rapida per l'annaffiatura.
4. Aggiungere attività nominate per pianta, con modifica e frequenza facoltativa.
5. Calcolare e mostrare in dashboard le scadenze di annaffiatura, concimazione e attività.
6. Aggiungere il caricamento, la visualizzazione e la sostituzione della foto, verificando l'esperienza da smartphone.
7. Rivedere la gestione delle password: l'autenticazione resta semplice, ma le password non devono essere conservate in chiaro. Per ora la registrazione pubblica degli account è disattivata; la modalità di creazione degli account resta da definire.
8. Aggiornare il README con istruzioni e funzionalità reali.

## Regole concordate per i promemoria

- Le frequenze sono numeri interi di giorni e sono facoltative, separatamente per annaffiatura, concimazione e ciascun lavoro.
- Il promemoria si mostra il giorno della scadenza. In dashboard l'ordine è: promemoria scaduti (più vecchi prima), promemoria in scadenza oggi, poi quelli futuri più vicini.
- Se non è stata ancora inserita una data dell'ultima esecuzione, non si mostra alcun promemoria per quell'attività.
- La data dell'ultima esecuzione è precompilata con la data corrente quando si aggiunge l'attività; si può inserire o correggere una data diversa.
- Quando si registra l'esecuzione (per esempio annaffiatura rapida o completamento di un lavoro), il promemoria attuale scompare; se esiste una frequenza, il successivo viene calcolato dalla nuova data.
- Per annaffiatura e concimazione si conserva solo l'ultima data, senza storico. Per i lavori si conserva l'ultima data per ciascuna attività.
- Non sono previste notifiche esterne: gli avvisi appaiono nella dashboard.

## Account

Sono previsti più account e i dati devono essere isolati per utente. Per ora la registrazione pubblica non è aperta; resta da scegliere come creare gli account (per esempio manualmente o tramite un'azione amministrativa).

## Questioni ancora aperte

- Come si creano gli account mentre la registrazione pubblica è disattivata?
- La data dell'ultima attività deve essere precompilata con oggi anche quando si crea una pianta, oppure solo quando si aggiunge per la prima volta una singola attività? La data resta comunque modificabile.
