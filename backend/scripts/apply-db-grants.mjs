/**
 * Aplica GRANTs de papéis Supabase (authenticated/anon/service_role) no Postgres próprio.
 * Env: DATABASE_URL. Útil após import parcial ou sem migração RLS completa.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sqlFile =
  process.env.IMPORT_GRANTS_SQL || path.join(__dirname, "migration", "grant-app-roles.sql");

async function main() {
  const url = process.env.DATABASE_URL?.trim();
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
  const sql = fs.readFileSync(sqlFile, "utf8");
  await client.query(sql);
  await client.end();
  console.log("GRANTs aplicados (authenticated / anon / service_role).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});