# Immagine base: lo stesso node:22-slim di Docker Hub (stesso digest) preso dal mirror ufficiale di AWS.
# Docker Hub limita i download anonimi per indirizzo IP e i server di GitHub Actions li esauriscono
# ("429 Too Many Requests"), il mirror no. Per usare Docker Hub: --build-arg NODE_IMAGE=node:22-slim
ARG NODE_IMAGE=public.ecr.aws/docker/library/node:22-slim

# ---------- Fase 1: build ----------
# Qui serve tutto il necessario per compilare (TypeScript, tipi, ...). Questa fase NON finisce nell'immagine finale.
FROM ${NODE_IMAGE} AS build
WORKDIR /app

# Prima solo i file delle dipendenze: se non cambiano, Docker riusa questo strato e salta `npm ci`.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build        # src/ -> dist/


# ---------- Fase 2: runtime ----------
# Parte da un'immagine pulita: dentro finiscono solo dipendenze di produzione, dist/ e public/.
FROM ${NODE_IMAGE} AS runtime

# Collega il pacchetto su GHCR a questo repository GitHub.
LABEL org.opencontainers.image.source="https://github.com/simmacos/garden-legacy" \
      org.opencontainers.image.description="Garden Legacy - gestionale personale di piante e orto" \
      org.opencontainers.image.licenses="ISC"

# TZ: il server calcola "oggi" per i promemoria con il fuso del processo; senza questo sarebbe UTC
# e fra mezzanotte e le 2 il giorno sarebbe sbagliato. Si può cambiare con `-e TZ=...`.
ENV NODE_ENV=production \
    TZ=Europe/Rome \
    WEB_UI_PORT=4005

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY public ./public

# Utente non privilegiato (già presente nell'immagine node, uid 1000): l'app non scrive su disco.
USER node

EXPOSE 4005

# Pagina principale servita dall'app: se risponde, il gateway è su. (Node 22 ha fetch integrato.)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.WEB_UI_PORT||4005)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "dist/index.js"]
