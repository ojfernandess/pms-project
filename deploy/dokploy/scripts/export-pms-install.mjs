#!/usr/bin/env node
/**
 * Gera deploy/dokploy/pms-install.json para Import no Dokploy (Compose → Advanced → Import).
 * O campo base64 é o payload {"compose","config"} codificado (sem segredos — senhas via template.toml).
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dokployDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(dokployDir, "../..");

// Dokploy clona o monorepo em .../code/ — compose na raiz evita path backend not found.
const composePath =
  process.env.DOKPLOY_COMPOSE_FILE === "subpath"
    ? path.join(dokployDir, "docker-compose.yml")
    : path.join(repoRoot, "docker-compose.dokploy.yml");
const compose = readFileSync(composePath, "utf8");
const config = readFileSync(path.join(dokployDir, "template.toml"), "utf8");

const importPayload = { compose, config };
const base64 = Buffer.from(JSON.stringify(importPayload), "utf8").toString("base64");

const out = {
  id: "pms-install",
  name: "StayOS PMS",
  version: "1.0.0",
  description:
    "PMS (frontend + Nest API + worker BullMQ + Postgres + Redis). Build a partir do GitHub ojfernandess/pms-project (branch PMS-Backend).",
  github: {
    owner: "ojfernandess",
    repo: "pms-project",
    ref: "PMS-Backend",
    composeFile: "docker-compose.dokploy.yml",
  },
  dokploy: {
    importPayload,
    base64,
  },
  notes: [
    "No Dokploy: Import → cole SÓ deploy/dokploy/pms-install.base64 (não o .json).",
    "Ligue o repositório Git na raiz do monorepo (mesma branch).",
    "Primeiro Postgres vazio: defina PRISMA_MIGRATE_ON_START=true no Environment, deploy, depois volte a false.",
    "DATABASE_URL no painel: só a URL, sem prefixo DATABASE_URL=.",
  ],
};

const outPath = path.join(dokployDir, "pms-install.json");
const base64OnlyPath = path.join(dokployDir, "pms-install.base64");
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`, "utf8");
writeFileSync(base64OnlyPath, base64, "utf8");
console.error(`Escrito: ${outPath}`);
console.error(`Escrito: ${base64OnlyPath} (cole SÓ este ficheiro no Dokploy)`);
console.error(`Base64 length: ${base64.length}`);