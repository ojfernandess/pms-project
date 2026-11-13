#!/usr/bin/env node
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Uso: node validate-template-json.mjs <ficheiro.json>");
  process.exit(1);
}

const data = JSON.parse(readFileSync(path, "utf8"));
const errors = [];

if (!data.services || !Array.isArray(data.services)) {
  errors.push("Falta array services");
} else {
  const types = data.services.map((s) => s.type);
  const names = data.services.map((s) => s.data?.serviceName).filter(Boolean);

  if (!names.includes("pms-backend")) errors.push("Falta serviço pms-backend");
  if (!names.includes("pms-worker")) errors.push("Falta serviço pms-worker");
  if (!names.includes("pms-frontend")) errors.push("Falta serviço pms-frontend");
  if (!names.includes("pms-redis")) errors.push("Falta serviço pms-redis");
  const hasPostgres = data.services.some((s) => s.type === "postgres");
  if (!hasPostgres && !data.services.some((s) => s.data?.env?.includes("supabase.com"))) {
    console.warn("⚠ Sem serviço postgres — confirme se é intencional (modo transitório Supabase).");
  }
  if (hasPostgres && data.services.length !== 5) {
    errors.push(`Esperados 5 serviços com Postgres interno; encontrado ${data.services.length}`);
  }

  for (const s of data.services) {
    if (s.type === "app" && s.data?.source?.type === "github") {
      const src = s.data.source;
      if (!src.owner || !src.repo || !src.ref || !src.path?.startsWith("/")) {
        errors.push(`GitHub source inválido em ${s.data.serviceName}`);
      }
    }
    if (s.data?.env?.includes("postgresql://") && s.data.env.includes("PASSWORD@HOST")) {
      console.warn(`⚠ ${s.data.serviceName}: DATABASE_URL ainda é placeholder — substitua antes do deploy.`);
    }
  }

  console.log(`Serviços: ${types.join(", ")} (${data.services.length} total)`);
}

if (errors.length) {
  console.error("Validação falhou:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("Validação OK.");
process.exit(0);
