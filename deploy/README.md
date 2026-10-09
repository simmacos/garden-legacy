# Deploy su home server (Dockge + Nginx Proxy Manager + Cloudflare)

Sito: **https://garden.cocchy.casa**

```
Internet ─► Cloudflare ─► router :443 ─► Nginx Proxy Manager ─► IP-server:4005 ─► app ─► db:3306
            (DNS, HTTPS)   (port forward)   (HTTPS, certificato)  (porta pubblicata)       (rete "internal")
```

- **Immagine:** `ghcr.io/simmacos/garden-legacy:latest`, costruita da GitHub Actions a ogni push su `main`
  (`.github/workflows/docker.yml`). È pubblica: il server la scarica senza login.
- **Stack:** `compose.yaml` in questa cartella = due servizi, `app` (l'app) e `db` (MariaDB).
- **Porte:** solo l'app pubblica una porta sull'host (4005, cambiabile con `APP_PORT`); NPM la raggiunge lì.
  Il DB non pubblica nulla.
- **Rete del DB:** il DB sta su una rete `internal` condivisa solo con l'app: nessun altro stack può raggiungerlo e
  non ha accesso a internet.
- **Dati:** tutto (piante, foto, utenti) sta nel DB, nella cartella `data/db/` dello stack.

## Prima installazione

### 1. Cloudflare
- DNS: record `garden` → **CNAME** verso il tuo nome DDNS già esistente, con la nuvola **arancione** (proxied).
- SSL/TLS → modalità **Full (strict)**.

### 2. Dockge: creare lo stack
1. *+ Compose*, nome stack **`garden`**, incolla il contenuto di `compose.yaml`.
2. Nell'editor `.env` dello stack (modello: `.env.example`) scrivi:
   ```
   DB_PASSWORD=<openssl rand -base64 24>
   DB_ROOT_PASSWORD=<openssl rand -base64 24>
   ```
   (opzionale `APP_PORT=...` se la 4005 è già occupata sul server).
3. **Le password vanno scelte ora.** MariaDB le legge solo al primo avvio: se le cambi dopo, il database tiene
   le vecchie e l'app non si collega più (si cambiano con `ALTER USER` dentro il DB).
4. *Deploy*. Il primo avvio crea il database; l'app parte quando il DB è `healthy`.

### 3. Nginx Proxy Manager: proxy host
- **Details:** Domain `garden.cocchy.casa` · Scheme `http` · Forward Hostname = **IP del server** (quello della
  LAN, es. `192.168.x.x`) · Forward Port `4005` (o il tuo `APP_PORT`) · *Block Common Exploits* attivo.
- **SSL:** nuovo certificato Let's Encrypt (consigliata la challenge DNS con il token API di Cloudflare) ·
  *Force SSL* · *HTTP/2*.
- **Foto:** l'app accetta file fino a 12 MB (il browser li riduce prima di inviarli). Se un upload fallisce con
  errore **413**, è Nginx: in *Advanced* aggiungi `client_max_body_size 15m;`.

### 4. Creare il primo utente
Non c'è registrazione: l'utente si crea nel DB (la password è in chiaro, per scelta del progetto).
In Dockge apri il **Terminale** del servizio `db` (oppure `docker compose exec db bash`) ed esegui:

```bash
mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" garden -e \
  "INSERT INTO users (username,password,isActive,createdAt,updatedAt) VALUES ('NOME','PASSWORD',1,NOW(),NOW());"
```

### 5. Controlli
- `https://garden.cocchy.casa` mostra la pagina di login e il login funziona.
- In Dockge, `app` e `db` risultano **healthy**.
- Se il login risponde *Too many login attempts*, il limite (5 errori in 15 minuti per utente e IP) è scattato:
  si azzera aspettando o riavviando l'app.

## Sicurezza della porta pubblicata
La porta 4005 dell'app è raggiungibile da **tutta la rete di casa**, non solo da NPM. Cosa comporta (verificato):
- **Mai** aprire la 4005 sul router: sul router va inoltrata solo la 443 verso NPM.
- Chi è sulla LAN può usare `http://IP-SERVER:4005` saltando HTTPS e Cloudflare: la password del login passerebbe
  in chiaro sulla rete di casa.
- **Rate limiting:** con accesso diretto e senza header funziona. Ma `TRUST_PROXY=2` fa fidare l'app degli header
  `X-Forwarded-For`: un dispositivo della LAN che li falsifica a rotazione può aggirare il limite dei 5 tentativi.
  Via NPM questo non è possibile dall'esterno.
- Per ridurre l'esposizione, nel compose si può legare la porta a un solo indirizzo, ad esempio
  `"192.168.x.x:4005:4005"` invece di `"4005:4005"` (il firewall `ufw` da solo non basta: Docker aggira le sue regole).
- Alternativa più chiusa: far entrare l'app nella rete Docker di NPM e non pubblicare nessuna porta.

## Aggiornare
Dopo ogni push su `main` GitHub costruisce la nuova immagine (1-2 minuti, scheda *Actions* del repo).
In Dockge: stack `garden` → **Update** (scarica l'immagine nuova e ricrea solo i container cambiati).
I dati non si toccano.

### Tornare a una versione precedente
Ogni immagine ha anche il tag con il commit (`sha-xxxxxxx`, visibile nella pagina del pacchetto su GitHub).
Nel `.env` dello stack: `GARDEN_IMAGE=ghcr.io/simmacos/garden-legacy:sha-xxxxxxx` e *Update*.
Per tornare alla più recente togli la riga.

## Backup (da fare!)
Il DB contiene tutto, foto comprese. Dump completo, dalla cartella dello stack sul server
(in Dockge di solito `/opt/stacks/garden`):

```bash
cd /opt/stacks/garden
docker compose exec -T db sh -c 'mariadb-dump -uroot -p"$MARIADB_ROOT_PASSWORD" --single-transaction garden' \
  | gzip > garden-$(date +%F).sql.gz
```

Mettilo in un cron e copia i file su un altro disco. Per ripristinare (provato: dump, stack distrutto e ricreato
vuoto, ripristino, login con l'utente salvato):

```bash
gunzip -c garden-AAAA-MM-GG.sql.gz | docker compose exec -T db sh -c 'mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" garden'
```

## Note
- `data/db/` è di proprietà dell'utente `mysql` del container: per cancellarla serve `sudo`.
- `TRUST_PROXY=2` (nel compose) dice all'app che ci sono **due** proxy davanti (Cloudflare + NPM): così il rate
  limiting del login usa l'IP vero del client e non quello di Cloudflare. Se un giorno togli Cloudflare, mettilo a `1`.
- L'app ha un solo processo e tiene i contatori del rate limiting in memoria: riavviandola si azzerano.
