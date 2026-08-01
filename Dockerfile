# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# openssl wird von den Prisma-Query-Engines benoetigt
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
# Die Lockdatei wurde auf arm64 erzeugt. npm ci sollte auf x64 trotzdem greifen,
# weil alle plattformspezifischen optionalDependencies mitgeschrieben sind -
# faellt es doch aus, wird die Lockdatei neu aufgebaut statt den Build zu kippen.
RUN if [ -f package-lock.json ]; then npm ci || npm install; else npm install; fi

# ---------------------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npx next build

# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV UPLOAD_DIR=/data/uploads

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /data/uploads \
  && chown -R node:node /data

USER node
EXPOSE 3000

# Node bringt fetch mit, das spart curl im Image. --start-period deckt den Seed
# beim ersten Start ab, der laenger dauern kann als der erste Intervall.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
