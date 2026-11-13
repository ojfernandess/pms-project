#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

/**
 * Gera JSON do template StayOS PMS para "Create template from JSON" no Easypanel.
 * Não substitui o playground oficial; útil para validar antes de abrir PR em easypanel-io/templates.
 *
 * Uso: node deploy/easypanel-template/scripts/export-template-json.mjs > stayos-pms.json
 */

const chars = "abcdefghijklmnopqrstuvwxyz0123456789";

function randomString(length = 10) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function randomPassword() {
  return randomString(20);
}

/** @param {import('../stayos-pms/meta.ts').Input} input */
function generate(input) {
  const postgresPassword = randomPassword();
  const redisPassword = randomPassword();
  const jwtSecret = randomString(48);
  const internalApiToken = randomString(32);
  const socketAuthToken = randomString(32);

  function databaseUrl() {
    if (!input.useInternalPostgres && input.externalDatabaseUrl?.trim()) {
      return input.externalDatabaseUrl.trim();
    }
    return `postgresql://postgres:${postgresPassword}@$(PROJECT_NAME)_${input.databaseServiceName}:5432/$(PROJECT_NAME)`;
  }

  const redisUrl = `redis://default:${redisPassword}@$(PROJECT_NAME)_${input.redisServiceName}:6379`;

  const backendEnv = [
    "NODE_ENV=production",
    "PORT=3000",
    `DATABASE_URL=${databaseUrl()}`,
    `PRISMA_MIGRATE_ON_START=${input.prismaMigrateOnStart ? "true" : "false"}`,
    `REDIS_URL=${redisUrl}`,
    `JWT_SECRET=${jwtSecret}`,
    "JWT_ACCESS_TTL=15m",
    "JWT_REFRESH_TTL_DAYS=7",
    `INTERNAL_API_TOKEN=${internalApiToken}`,
    `SOCKET_AUTH_TOKEN=${socketAuthToken}`,
    "PUBLIC_APP_URL=https://$(PRIMARY_DOMAIN)",
    "SITE_URL=https://$(PRIMARY_DOMAIN)",
    "SUPABASE_URL=",
    "SUPABASE_ANON_KEY=",
    "PASSWORD_RESET_DEBUG=false",
  ].join("\n");

  const backendUpstream = `http://$(PROJECT_NAME)_${input.backendServiceName}:3000`;
  /** @type {{ services: object[] }} */
  const out = { services: [] };

  if (input.useInternalPostgres) {
    out.services.push({
      type: "postgres",
      data: {
        serviceName: input.databaseServiceName,
        image: input.postgresImage || "postgres:16-alpine",
        password: postgresPassword,
      },
    });
  }

  out.services.push({
    type: "redis",
    data: {
      serviceName: input.redisServiceName,
      image: "redis:7",
      password: redisPassword,
    },
  });

  out.services.push({
    type: "app",
    data: {
      serviceName: input.backendServiceName,
      env: backendEnv,
      source: {
        type: "github",
        owner: input.githubOwner,
        repo: input.githubRepo,
        ref: input.githubRef,
        path: "/backend",
        autoDeploy: true,
      },
      build: { type: "dockerfile", file: "Dockerfile" },
      ...(input.exposeApiDomain
        ? { domains: [{ host: "$(EASYPANEL_DOMAIN)", port: 3000, path: "/" }] }
        : {}),
      mounts: [
        { type: "volume", name: "storage", mountPath: "/app/storage" },
      ],
    },
  });

  out.services.push({
    type: "app",
    data: {
      serviceName: input.workerServiceName,
      env: backendEnv,
      source: {
        type: "github",
        owner: input.githubOwner,
        repo: input.githubRepo,
        ref: input.githubRef,
        path: "/backend",
        autoDeploy: true,
      },
      build: { type: "dockerfile", file: "Dockerfile" },
      deploy: { command: "node dist/worker.js" },
      mounts: [
        {
          type: "bind",
          hostPath: `/etc/easypanel/projects/$(PROJECT_NAME)/${input.backendServiceName}/volumes/storage`,
          mountPath: "/app/storage",
        },
      ],
    },
  });

  out.services.push({
    type: "app",
    data: {
      serviceName: input.frontendServiceName,
      env: [
        "VITE_PMS_API_URL=https://$(PRIMARY_DOMAIN)",
        "VITE_APP_URL=https://$(PRIMARY_DOMAIN)",
        "VITE_SUPABASE_URL=",
        "VITE_SUPABASE_PUBLISHABLE_KEY=",
        `BACKEND_UPSTREAM=${backendUpstream}`,
      ].join("\n"),
      source: {
        type: "github",
        owner: input.githubOwner,
        repo: input.githubRepo,
        ref: input.githubRef,
        path: "/",
        autoDeploy: true,
      },
      build: { type: "dockerfile", file: "Dockerfile" },
      domains: [{ host: "$(EASYPANEL_DOMAIN)", port: 80, path: "/" }],
    },
  });

  return out;
}

const defaultInput = {
  githubOwner: "ojfernandess",
  githubRepo: "pms-project",
  githubRef: "PMS-Backend",
  useInternalPostgres: true,
  externalDatabaseUrl: "",
  prismaMigrateOnStart: false,
  exposeApiDomain: false,
  frontendServiceName: "pms-frontend",
  backendServiceName: "pms-backend",
  workerServiceName: "pms-worker",
  databaseServiceName: "pms-postgres",
  redisServiceName: "pms-redis",
  postgresImage: "postgres:16-alpine",
};

function loadInput() {
  const args = process.argv.slice(2);
  const inputIdx = args.indexOf("--input");
  if (inputIdx !== -1) {
    const file = args[inputIdx + 1];
    if (!file) {
      console.error("Uso: --input <caminho.json>");
      process.exit(1);
    }
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw);
    delete parsed._comment;
    return { ...defaultInput, ...parsed };
  }
  const inline = args.find((a) => a.startsWith("{"));
  if (inline) {
    return { ...defaultInput, ...JSON.parse(inline) };
  }
  return defaultInput;
}

const input = loadInput();
const json = JSON.stringify(generate(input), null, 2);

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
if (outIdx !== -1) {
  const outFile = args[outIdx + 1];
  if (!outFile) {
    console.error("Uso: --out <ficheiro.json>");
    process.exit(1);
  }
  writeFileSync(outFile, json, "utf8");
  console.error(`Escrito: ${outFile}`);
} else {
  console.log(json);
}
