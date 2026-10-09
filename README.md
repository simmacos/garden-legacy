# Garden Legacy

A small self-hosted web app to keep track of your plants and garden: what to water, what to feed, what needs doing, with a photo of each plant. Made for phones and desktops, with a "field notebook" look and light/dark themes.

## Features

- **Plants grouped by category**: dashboard with one-tap watering.
- **Reminders** for watering, fertilizing and custom per-plant tasks (e.g. pruning), each with an optional interval in days. Sorted overdue → today → upcoming.
- **One photo per plant**, taken with the phone camera or uploaded. It is processed on the server into a vivid pixel-art image (a few KB) and stored in the database.
- **Multi-user**: each account only sees its own data.
- Responsive UI in plain HTML/CSS/JS, no frontend build step.

## Tech stack

Node.js · TypeScript · [Moleculer](https://moleculer.services) (services + `moleculer-web` gateway) · Sequelize · MariaDB · [sharp](https://sharp.pixelplumbing.com) · Docker.

## Quick start (development)

Requires Node.js ≥ 20 and Docker.

```bash
cd dev-compose && docker compose up -d && cd ..   # MariaDB (3306) + Adminer (http://localhost:8080)
cp .env.example .env                              # defaults match dev-compose
npm install
npm run dev                                       # http://localhost:4005
```

Tables are created on first start. There is no sign-up: create the first user in the database (passwords are stored as plain text, see [Known limitations](#known-limitations)):

```bash
docker exec garden-db mariadb -usimmaco -psimmacopass garden -e \
  "INSERT INTO users (username,password,isActive,createdAt,updatedAt) VALUES ('demo','demo123',1,NOW(),NOW());"
```

## Configuration

Environment variables (see `.env.example`; a `.env` file is loaded at startup, real environment variables win):

| Variable | Default | Description |
|---|---|---|
| `DB_DIALECT`, `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USER`, `DB_PASSWORD` | – | Database connection (required). In Docker, `DB_HOST` is the DB service name. |
| `WEB_UI_PORT` | `4005` | HTTP port. |
| `TRUST_PROXY` | `false` | Number of trusted reverse proxies in front of the app (`true` = 1, e.g. `2` for Cloudflare + Nginx). Used for the client IP (rate limiting) and HTTPS detection. |
| `COOKIE_SECURE` | `auto` | `Secure` flag of the session cookie: `auto` (only on HTTPS), `true`, `false`. |

## Scripts

| Command | |
|---|---|
| `npm run dev` | Run from `src/` with ts-node |
| `npm run typecheck` | Type-check only |
| `npm run build` | Compile `src/` into `dist/` |
| `npm start` | Run the compiled app (`dist/index.js`) |

## API

JSON under `/api`; everything except login requires the session cookie. A resource owned by another user answers `404`.

| | |
|---|---|
| `POST /auth/login` · `GET /me` | Sign in · current user |
| `GET/POST /categories` · `PUT/DELETE /categories/:id` | Categories (deleting one keeps its plants) |
| `GET/POST /plants` · `GET/PUT/DELETE /plants/:id` | Plants |
| `POST /plants/:id/water` · `POST /plants/:id/fertilize` | Record watering / fertilizing (optional `date`, default today) |
| `GET/POST /plants/:id/tasks` · `PUT/DELETE /tasks/:id` · `POST /tasks/:id/done` | Per-plant tasks |
| `GET /photos` · `GET/PUT/DELETE /plants/:id/photo` | Photos; `PUT` takes the raw image file as body (max 12 MB) |
| `GET /reminders` | Upcoming and overdue reminders, sorted by due date |

## Project structure

```
src/
  index.ts            entry point (Moleculer broker)
  models/             Sequelize models
  lib/                dates, validation, reminders, photo processing, rate limiting, client info
  services/           gateway, auth, reminders
  services/data/      DB-backed services: users, sessions, categories, plants, tasks, photos
public/               static frontend (HTML, CSS, ES modules)
deploy/               production compose file + home-server guide
dev-compose/          MariaDB + Adminer for development
Dockerfile            multi-stage image, runs as non-root
.github/workflows/    builds and publishes the image to GHCR on every push to main
```

## Deployment

`docker.yml` publishes `ghcr.io/simmacos/garden-legacy` (amd64) on every push to `main`. [`deploy/`](deploy/README.md) has the production compose file (app + MariaDB) and a step-by-step guide for Dockge behind Nginx Proxy Manager and Cloudflare, including backups and rollback.

## Known limitations

- Internal-use app: passwords are stored in plain text, there is no sign-up and no logout.
- Login is rate-limited (5 failures per IP+user and 20 per IP in 15 minutes) with counters kept in memory.
- The DB schema is created with Sequelize `sync` (no migrations).
- No automated tests yet.

## License

[ISC](LICENSE)
