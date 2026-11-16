/**
 * Aplica GRANTs de papéis Supabase (authenticated/anon/service_role) no Postgres próprio.
 * Env: DATABASE_URL. Útil após import parcial ou sem migração RLS completa.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  releaseMigrationLock,
  tryMigrationLock,
  withRetry,
} from "./lib/pg-migration-lock.mjs";
import { databaseUrlForLibpq } from "./lib/database-url-libpq.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile =
  process.env.IMPORT_GRANTS_SQL || path.join(__dirname, "migration", "grant-app-roles.sql");

function splitSqlStatements(sql) {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("--"));
}

async function main() {
  if (
    (process.env.PMS_MIGRATION_COMPLETE || "").toLowerCase() === "true" &&
    (process.env.APP_RUN_DB_GRANTS || "").toLowerCase() !== "true"
  ) {
    console.log("PMS_MIGRATION_COMPLETE — GRANTs ignorados (use APP_RUN_DB_GRANTS=true uma vez se precisar).");
    return;
  }

  const url = databaseUrlForLibpq(process.env.DATABASE_URL ?? "");
  if (!url) {
    console.error("DATABASE_URL obrigatória");
    process.exit(1);
  }
  if (!fs.existsSync(sqlFile)) {
    console.error(`Ficheiro não encontrado: ${sqlFile}`);
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: /supabase\.com/i.test(url) ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();

  if (!(await tryMigrationLock(client))) {
    console.log("Outro pod/processo de migração ativo — GRANTs ignorados neste arranque.");
    await client.end();
    return;
  }

  try {
    const statements = splitSqlStatements(fs.readFileSync(sqlFile, "utf8"));
    for (const stmt of statements) {
      await withRetry("GRANT", () => client.query(`${stmt};`));
    }
    console.log("GRANTs aplicados (authenticated / anon / service_role).");
  } finally {
    await releaseMigrationLock(client);
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  const strict = (process.env.APP_RUN_DB_GRANTS_STRICT || "false").toLowerCase() === "true";
  process.exit(strict ? 1 : 0);
});