FROM node:20-alpine AS build

WORKDIR /app

# bcrypt e outros precisam de toolchain no Alpine; Easypanel pode injetar NODE_ENV=production no build.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src

ENV NODE_ENV=development
RUN npm ci --include=dev
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
COPY scripts/docker-entrypoint-worker.sh ./scripts/docker-entrypoint-worker.sh
RUN chmod +x ./scripts/docker-entrypoint.sh ./scripts/docker-entrypoint-worker.sh

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD sh -c 'if [ "$$PMS_RUN_MODE" = "worker" ]; then exit 0; fi; node -e "fetch(\"http://127.0.0.1:\"+(process.env.PORT||3000)+\"/health\").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"'

CMD ["./scripts/docker-entrypoint.sh"]
