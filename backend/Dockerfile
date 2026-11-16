FROM node:20-bookworm-slim AS build

WORKDIR /app

# Debian: bcrypt/openssl; toolchain só se algum pacote compilar no postinstall.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src

# Easypanel envia NODE_ENV=production como build-arg; não propagar — build precisa de devDependencies.
ENV NODE_ENV=development
ENV NPM_CONFIG_PRODUCTION=false
ENV NODE_OPTIONS=--max-old-space-size=4096
ARG DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
ENV DATABASE_URL=$DATABASE_URL

RUN npm ci --include=dev --no-audit --no-fund
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl postgresql-client \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
COPY scripts/docker-entrypoint-worker.sh ./scripts/docker-entrypoint-worker.sh
COPY scripts/import-supabase-data.sh ./scripts/import-supabase-data.sh
COPY scripts/import-supabase-schema.sh ./scripts/import-supabase-schema.sh
COPY scripts/import-supabase-data.mjs ./scripts/import-supabase-data.mjs
COPY scripts/lib ./scripts/lib
COPY scripts/print-database-url-libpq.mjs ./scripts/print-database-url-libpq.mjs
COPY scripts/migration ./scripts/migration
COPY scripts/apply-bundled-rpcs.sh ./scripts/apply-bundled-rpcs.sh
COPY scripts/ensure-bundled-rpcs.mjs ./scripts/ensure-bundled-rpcs.mjs
COPY scripts/apply-db-grants.mjs ./scripts/apply-db-grants.mjs
COPY scripts/sync-foreign-keys-from-supabase.mjs ./scripts/sync-foreign-keys-from-supabase.mjs
COPY scripts/sync-public-functions-from-supabase.mjs ./scripts/sync-public-functions-from-supabase.mjs
RUN chmod +x ./scripts/docker-entrypoint.sh ./scripts/docker-entrypoint-worker.sh ./scripts/import-supabase-data.sh ./scripts/import-supabase-schema.sh ./scripts/apply-bundled-rpcs.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD sh -c 'if [ "$$PMS_RUN_MODE" = "worker" ]; then exit 0; fi; node -e "fetch(\"http://127.0.0.1:\"+(process.env.PORT||3000)+\"/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"'

CMD ["./scripts/docker-entrypoint.sh"]