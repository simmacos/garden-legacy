# Garden Legacy MCP

Server MCP (stdio) che permette a Claude (Claude Code, Claude Desktop) di usare Garden Legacy:
leggere piante e promemoria, segnare annaffiature, concimazioni e lavori, creare e modificare piante, lavori e categorie.

Non richiede modifiche al backend: chiama le API REST in `/api` facendo login come il browser
(`POST /api/auth/login`) e tenendo il cookie `auth_token` in memoria. Se la sessione scade rifà il login.
Le eliminazioni non sono esposte di proposito: non si possono annullare.

## Installazione

```sh
cd mcp
npm install
```

Variabili d'ambiente:

| Variabile     | Default                      |
|---------------|------------------------------|
| `GARDEN_URL`  | `https://garden.cocchy.casa` |
| `GARDEN_USER` | obbligatoria                 |
| `GARDEN_PASS` | obbligatoria                 |

## Claude Code

```sh
claude mcp add garden --scope user \
  -e GARDEN_URL=https://garden.cocchy.casa -e GARDEN_USER=<utente> -e GARDEN_PASS=<password> \
  -- node /percorso/assoluto/garden-legacy/mcp/server.mjs
```

Poi `/mcp` in Claude Code per verificare che sia connesso.

## Claude Desktop: estensione `.mcpb` (consigliata)

```sh
cd mcp
npm run pack        # crea mcp/garden-legacy.mcpb
```

Su Windows o macOS: doppio clic su `garden-legacy.mcpb` (oppure Claude Desktop → Settings → Extensions →
trascinare il file). Claude Desktop chiede indirizzo dell'app, utente e password (la password va nel portachiavi
del sistema) e usa il proprio Node: non serve installarlo. Il pacchetto è descritto da `manifest.json`;
`.mcpbignore` dice cosa lasciare fuori. Dopo una modifica a `server.mjs` aumentare `version` in `manifest.json`
e rigenerare il pacchetto.

## Claude Desktop: a mano

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "garden": {
      "command": "node",
      "args": ["/percorso/assoluto/garden-legacy/mcp/server.mjs"],
      "env": { "GARDEN_URL": "https://garden.cocchy.casa", "GARDEN_USER": "<utente>", "GARDEN_PASS": "<password>" }
    }
  }
}
```

## Tool

- Lettura: `list_reminders`, `list_plants`, `get_plant` (con i lavori), `list_categories`
- Cura: `water_plant`, `fertilize_plant`, `complete_task` (data facoltativa, default oggi)
- Modifica: `create_plant`, `update_plant`, `create_category`, `add_task`, `update_task`

Note: ogni avvio del server fa un login, quindi crea una sessione nel DB. Cinque login falliti in 15 minuti
bloccano temporaneamente l'utente (rate limiting dell'app): se la password è sbagliata correggerla prima di riprovare.
