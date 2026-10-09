# Garden Legacy — obiettivo e requisiti concordati

Questo file conserva la visione del prodotto e le decisioni emerse nel brainstorming. Usarlo come riferimento quando si progetta o si implementa il gestionale. I punti che richiedono ancora una scelta sono raccolti in **Questioni aperte**; non inventare requisiti per colmarli.

## Prodotto

Applicazione web per la gestione personale di piante e orto, utilizzabile comodamente da desktop e smartphone. L'app può essere usata da più account: i dati di ciascun account devono appartenere al relativo utente.

**Lingua:** l'interfaccia e i messaggi di errore delle API sono in **inglese**. Documentazione e commenti nel codice restano in italiano.

**Stile:** direzione "Field Notebook" (quaderno da campo): bordi netti da 2px, nessun raggio, ombra rigida, Archivo condensato + IBM Plex Mono, accento giallo, rosso per lo scaduto, tema chiaro/scuro. Token e componenti in `public/css/style.css`. Il design di riferimento è in `Garden Legacy design system/` (ignorata da git, solo consultazione).

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

La foto può essere caricata da file o acquisita con la fotocamera del telefono. Viene elaborata **lato server** con `sharp` e salvata nel database SQL (tabella `plant_photos`, una per pianta; la foto originale non viene conservata).

**Stile foto (deciso): "Ultra" con vivacità "Extra"** — implementato in `src/lib/photo.ts`:

- griglia di pixel con lato lungo 192; ogni pixel è la mediana per canale di un blocco 4×4 (bordi netti, niente medie sporche);
- vivacità: vibrance 1.2, saturazione ×1.2, curva a S 0.32;
- contorni scuri sui bordi netti (Sobel sulla luminanza);
- palette a 96 colori (libimagequant) con dithering ordinato Bayer 4×4;
- risultato: PNG indicizzato di ~12–26 KB. Il browser lo ingrandisce con `image-rendering: pixelated`.

Tutti i parametri sono costanti in cima a `photo.ts`. Limiti: upload max 12 MB, immagini oltre 100 megapixel rifiutate; si accettano i formati letti da `sharp` (JPEG, PNG, WebP, GIF, TIFF, ...); EXIF applicato; trasparenze appiattite su bianco.

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
- Ogni lavoro conserva la data dell'ultima esecuzione, come annaffiatura e concimazione. La data resta vuota finché l'attività non viene registrata per la prima volta; in seguito può essere aggiornata dall'utente.
- Segnare un lavoro come eseguito aggiorna la sua data dell'ultima esecuzione; il promemoria corrente scompare e il prossimo si calcola da quella data usando la frequenza configurata.

## Stato attuale del codice

La base è Node.js/TypeScript con Moleculer, Sequelize e MariaDB. Sono implementati:

- autenticazione con login e sessioni tramite cookie (`auth`, `users`, `sessions`);
- servizi dati `categories`, `plants`, `plantTasks` (in `src/services/data/`) e `reminders`, tutti filtrati per `ctx.meta.user.id`: una risorsa di un altro utente risponde 404;
- API REST in `/api` (alias nel gateway): `/categories`, `/plants` (+ `/water`, `/fertilize`), `/plants/:plantId/tasks`, `/tasks/:id` (+ `/done`), `/reminders`;
- servizio `plantPhotos` (backend foto), con API: `GET/PUT/DELETE /plants/:id/photo` e `GET /photos` (elenco `{plantId, updatedAt}` delle piante con foto). `PUT` riceve il file grezzo nel body (stream, es. `fetch(url, { method: "PUT", body: file })`), non JSON; `GET` accetta `?v=<updatedAt>` per una cache di un anno (senza `v` va rivalidata);
- sicurezza del login:
  - **rate limiting** in memoria (`src/lib/rate-limit.ts`, si azzera al riavvio), finestra scorrevole di 15 minuti: 5 login falliti per coppia IP+utente e 20 per IP; oltre, `429` con `Retry-After`, anche se la password è giusta (non si controlla finché è bloccato). Un login riuscito azzera il contatore IP+utente. Il messaggio compare nella pagina di login;
  - **cookie** `auth_token`: `HttpOnly; SameSite=Lax; Path=/; Max-Age=30 giorni`, più `Secure` quando la richiesta è HTTPS (`COOKIE_SECURE=auto`, default; `true`/`false` per forzarlo). Su HTTP semplice (non localhost) `Secure` farebbe scartare il cookie al browser, quindi non va forzato lì. La risposta di login ha `Cache-Control: no-store`;
  - **dietro un reverse proxy** HTTPS fidato impostare `TRUST_PROXY=true`: si leggono `X-Forwarded-For` (si usa l'**ultimo** valore, il primo lo scrive il client) e `X-Forwarded-Proto`. Senza, quegli header sono ignorati. `.env` viene caricato all'avvio (`src/index.ts`);
  - password in chiaro per scelta (uso interno), nessun logout per ora.
- logica condivisa in `src/lib/` (date, validazione, calcolo promemoria, elaborazione foto, rate limiting, info client).

Le azioni dei servizi dati sostituiscono quelle di moleculer-db con `cache: false` (la cache di moleculer-db non è per utente). Le route del gateway hanno gli alias, quindi espongono solo quelli (policy `restrict`).

Frontend (HTML/CSS/JS semplici in `public/`, moduli ES, nessun build):

- `auth/auth.html` login; `dashboard.html` promemoria + piante per categoria + annaffiatura rapida; `plant.html` scheda pianta (senza `?id=` crea una pianta; con `?id=N` visualizza/modifica, cura, attività, categorie, eliminazione);
- `js/lib.js` (API, DOM senza `innerHTML`, date, chip di stato, tema), `js/dashboard.js`, `js/plant.js`, `js/theme.js` (tema prima del paint).

Foto nella scheda pianta (`plant.html`, come la sezione 4c del design): box 4:5 con la foto (o segnaposto con iniziale), pulsanti "Take photo" (`capture="environment"`, solo mobile/touch) e "Upload photo" (sempre; su desktop è l'unico, a tutta larghezza). In modifica la foto si carica subito (la scheda ridimensiona prima le foto grandi a 2048px con `prepareImage` in `lib.js`); in creazione si vede un'anteprima locale e l'upload parte dopo il primo salvataggio (se fallisce, l'errore compare nella scheda della pianta appena creata).

Foto nelle card della dashboard (come 4a/4b del design): area foto 150px su desktop; su mobile 120px con foto e 72px senza; senza foto iniziale grande e "+ ADD PHOTO". La dashboard legge `GET /photos` per costruire gli URL con versione.

**Regola di lavoro per la UI:** misure, testi e comportamento si prendono dal file di design (`Garden Legacy design system/`, sezioni 4a/4b/4c). I due file coincidono su 4a/4b; su 4c vale `Garden Legacy.dc.html` (il più recente: "Take photo" solo mobile, secondo pulsante "Upload photo").

Mancano: un'azione "rimuovi foto" nella UI (l'API `DELETE` esiste, il design non la prevede), logout, README aggiornato. Il README descrive ancora in parte il template iniziale.

Questa sezione fotografa lo stato visto durante il brainstorming e va aggiornata quando il codice cambia.

## Sequenza suggerita per la prima versione

1. Definire i modelli e le relazioni, includendo la proprietà dei dati per account.
2. Implementare categorie e schede pianta: creazione, visualizzazione, modifica, eliminazione definitiva e categoria facoltativa.
3. Costruire una dashboard responsive raggruppata per categoria, con l'azione rapida per l'annaffiatura.
4. Aggiungere attività nominate per pianta, con modifica e frequenza facoltativa.
5. Calcolare e mostrare in dashboard le scadenze di annaffiatura, concimazione e attività.
6. Aggiungere il caricamento, la visualizzazione e la sostituzione della foto, verificando l'esperienza da smartphone.
7. ~~Hash delle password~~: decisione presa, non serve. Il progetto è interno, le password restano in chiaro e la registrazione pubblica è disattivata. Rivalutare solo se l'app esce dall'uso interno.
8. Aggiornare il README con istruzioni e funzionalità reali.

## Regole concordate per i promemoria

- Le frequenze sono numeri interi di giorni e sono facoltative, separatamente per annaffiatura, concimazione e ciascun lavoro.
- Il promemoria si mostra il giorno della scadenza. In dashboard l'ordine è: promemoria scaduti (più vecchi prima), promemoria in scadenza oggi, poi quelli futuri più vicini.
- Se non è stata ancora inserita una data dell'ultima esecuzione, non si mostra alcun promemoria per quell'attività.
- La data dell'ultima esecuzione resta vuota fino alla prima registrazione dell'attività; in quel momento viene impostata alla data corrente, modificabile dall'utente.
- Quando si registra l'esecuzione (per esempio annaffiatura rapida o completamento di un lavoro), il promemoria attuale scompare; se esiste una frequenza, il successivo viene calcolato dalla nuova data.
- Per annaffiatura e concimazione si conserva solo l'ultima data, senza storico. Per i lavori si conserva l'ultima data per ciascuna attività.
- Non sono previste notifiche esterne: gli avvisi appaiono nella dashboard.

## Account

Sono previsti più account e i dati devono essere isolati per utente. La registrazione pubblica non è aperta e, essendo un progetto interno, gli account si creano a mano nel database (password in chiaro, vedi punto 7).

## Questioni ancora aperte

- Nessuna al momento.
