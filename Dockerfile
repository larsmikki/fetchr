FROM node:26-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY tsconfig.base.json ./
COPY server/ server/
COPY client/ client/
RUN npm run build -w client
RUN npm run build -w server

FROM node:26-slim

WORKDIR /app

# Deno is the JS runtime yt-dlp uses to solve YouTube's signature / n-challenge
# (EJS). Copied from the official image so we get a glibc binary — note the
# runtime stage is intentionally Debian-based (not Alpine): Deno's musl support
# is unreliable and hangs in containers. See https://github.com/yt-dlp/yt-dlp/wiki/EJS
COPY --from=denoland/deno:bin /deno /usr/local/bin/deno

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp[default] pulls the bundled EJS challenge-solver scripts so the n-sig
# can be solved offline. Bump CACHEBUST to force a fresh yt-dlp on rebuild:
#   docker compose build --build-arg CACHEBUST=$(date +%s)
ARG CACHEBUST=1
RUN pip3 install --break-system-packages --no-cache-dir -U "yt-dlp[default]"

COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci -w server --omit=dev

COPY --from=builder /app/server/dist server/dist
COPY --from=builder /app/server/src/db/migrations server/dist/db/migrations
COPY --from=builder /app/client/dist client/dist

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3030
ENV DATA_DIR=/app/data
ENV FFMPEG_PATH=/usr/bin/ffmpeg

EXPOSE 3030

HEALTHCHECK --interval=5m --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://localhost:3030/api/health || exit 1

CMD ["node", "server/dist/index.js"]
