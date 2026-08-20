# syntax=docker/dockerfile:1

# Imagen multi-etapa de TaskFlow.
# La etapa 'deps' resuelve las dependencias nativas (better-sqlite3) y la etapa
# final solo copia el resultado, lo que reduce el tamano y la superficie de ataque.
# Las pruebas y el lint corren en el runner de CI antes de construir la imagen.

# ---------- Etapa 1: dependencias de produccion ----------
FROM node:20-bookworm-slim AS deps

WORKDIR /app

# Se copian solo los manifiestos para aprovechar la cache de capas de Docker:
# mientras package*.json no cambie, no se reinstalan dependencias
COPY package.json package-lock.json ./

# npm ci instala exactamente lo fijado en el lockfile (builds reproducibles).
# better-sqlite3 descarga un binario precompilado para la plataforma, asi que
# normalmente no hace falta un compilador. Se verifica que el modulo nativo
# carga y, solo si falla, se instalan las herramientas de build y se recompila:
# esto evita anadir 300 MB de compiladores al caso habitual.
RUN npm ci --omit=dev \
    && node -e "require('better-sqlite3')" \
    || ( apt-get update \
         && apt-get install -y --no-install-recommends python3 make g++ \
         && npm rebuild better-sqlite3 --build-from-source \
         && apt-get purge -y python3 make g++ \
         && apt-get autoremove -y \
         && rm -rf /var/lib/apt/lists/* )

# ---------- Etapa 2: imagen final de ejecucion ----------
FROM node:20-bookworm-slim AS runtime

# Version inyectada por el pipeline (tag de git o SHA del commit)
ARG APP_VERSION=1.0.0

# tini gestiona senales y procesos zombis: garantiza que SIGTERM llegue a Node
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/taskflow.db \
    LOG_DIR=/app/logs \
    APP_VERSION=${APP_VERSION}

WORKDIR /app

# Solo las dependencias de produccion, ya compiladas en la etapa deps
COPY --from=deps /app/node_modules ./node_modules

# Codigo de la aplicacion y frontend estatico
COPY package.json ./
COPY src ./src
COPY public ./public

# Directorios de datos y logs con permisos para el usuario sin privilegios
RUN mkdir -p /app/data /app/logs && chown -R node:node /app

# Se ejecuta como usuario no root: buena practica de seguridad en contenedores
USER node

EXPOSE 3000

# Healthcheck nativo de Docker: marca el contenedor unhealthy si /health falla
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/server.js"]
