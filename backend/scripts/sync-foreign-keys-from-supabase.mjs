/**
 * Copia FOREIGN KEY constraints da origem Supabase para o Postgres destino.
 * Necessário quando tabelas foram criadas com APP_IMPORT_SCHEMA=from_supabase (sem FKs).
 *
 * Env: SUPABASE_DATABASE_URL, DATABASE_URL
 * Opcional: IMPORT_FK_TABLES_FILE ou APP_IMPORT_DISCOVER_TABLES=public
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function clientConfig(url) {
  const ssl =
    /supabase\.com/i.test(url) || process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : undefined;
  return { connectionString: url, ssl };
}

function loadTables(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

async function discoverTables(client, schemas) {
  const { rows } = await client.query(
    `SELECT n.nspname || '.' || c.relname AS fq
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r' AND n.nspname = ANY($1::text[])
     ORDER BY 1`,
    [schemas],
  );
  return rows.map((r) => r.fq);
}

async function fkExists(target, schema, table, conname) {
  const { rows } = await target.query(
    `SELECT 1 FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = $1 AND rel.relname = $2 AND con.conname = $3 AND con.contype = 'f'`,
    [schema, table, conname],
  );
  return rows.length > 0;
}

async function syncTableFks(source, target, schema, table) {
  const fq = `"${schema}"."${table}"`;
  const { rows } = await source.query(
    `SELECT c.conname AS name, pg_get_constraintdef(c.oid) AS def
     FROM pg_constraint c
     JOIN pg_class rel ON rel.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = rel.relnamespace
     WHERE n.nspname = $1 AND rel.relname = $2 AND c.contype = 'f'
     ORDER BY c.conname`,
    [schema, table],
  );
  let added = 0;
  for (const row of rows) {
    if (await fkExists(target, schema, table, row.name)) continue;
    const sql = `ALTER TABLE ${fq} ADD CONSTRAINT "${row.name}" ${row.def}`;
    try {
      await target.query(sql);
      added += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/already exists|duplicate/i.test(msg)) {
        console.warn(`  ${fq} ${row.name}: ${msg}`);
      }
    }
  }
  return added;
}

async function main() {
  const sourceUrl = process.env.SUPABASE_DATABASE_URL?.trim();
  const targetUrl = process.env.DATABASE_URL?.trim();
  if (!sourceUrl || !targetUrl) {
    console.error("SUPABASE_DATABASE_URL e DATABASE_URL são obrigatórias.");
    process.exit(1);
  }

  const source = new pg.Client(clientConfig(sourceUrl));
  const target = new pg.Client(clientConfig(targetUrl));
  await source.connect();
  await target.connect();

  let tableNames = [];
  const discover = process.env.APP_IMPORT_DISCOVER_TABLES?.trim();
  if (discover) {
    const schemas = discover.split(",").map((s) => s.trim()).filter(Boolean);
    tableNames = await discoverTables(source, schemas);
  } else {
    const file =
      process.env.IMPORT_FK_TABLES_FILE ||
      path.join(__dirname, "migration", "core-data-tables.txt");
    tableNames = loadTables(file);
  }

  console.log(`Sincronizando FKs (${tableNames.length} tabelas)...`);
  let total = 0;
  for (const name of tableNames) {
    const [schema, table] = name.includes(".") ? name.split(".") : ["public", name];
    total += await syncTableFks(source, target, schema, table);
  }
  console.log(`FKs adicionadas: ${total}`);
  await source.end();
  await target.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});