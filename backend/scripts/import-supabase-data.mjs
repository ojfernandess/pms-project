/**
 * Cópia Supabase → DATABASE_URL (destino Easypanel) em COPY_MODE=node.
 * Env: APP_IMPORT_SUPABASE_DATA, SUPABASE_DATABASE_URL, DATABASE_URL
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BATCH = Number(process.env.IMPORT_BATCH_SIZE || 500);
const MODE = (process.env.APP_IMPORT_SUPABASE_DATA || "").trim().toLowerCase();
const MARKER = process.env.IMPORT_STATE_FILE || "/app/storage/.supabase-data-imported";
const TABLES_FILE =
  process.env.IMPORT_TABLES_FILE || path.join(__dirname, "migration", "core-data-tables.txt");
const BOOTSTRAP_SQL =
  process.env.IMPORT_BOOTSTRAP_SQL || path.join(__dirname, "migration", "bootstrap-target-postgres.sql");
const RUN_BOOTSTRAP = (process.env.APP_IMPORT_RUN_BOOTSTRAP || "true").toLowerCase() !== "false";
const IMPORT_SCHEMA = (process.env.APP_IMPORT_SCHEMA || "from_supabase").trim().toLowerCase();

function loadTables(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function fqTable(name) {
  const parts = name.split(".");
  if (parts.length !== 2) throw new Error(`Tabela inválida (use schema.tabela): ${name}`);
  return `"${parts[0]}"."${parts[1]}"`;
}

function parseTable(name) {
  const parts = name.split(".");
  return { schema: parts[0], table: parts[1] };
}

function clientConfig(url) {
  const ssl =
    /supabase\.com/i.test(url) || process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : undefined;
  return { connectionString: url, ssl };
}

async function tableExists(client, fq) {
  const [schema, table] = fq.replace(/"/g, "").split(".");
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return rows.length > 0;
}

async function rowCount(client, fq) {
  const { rows } = await client.query(`SELECT count(*)::int AS c FROM ${fq}`);
  return Number(rows[0]?.c ?? 0);
}

async function enumExists(client, schema, typeName) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_type t
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = $1 AND t.typname = $2 AND t.typtype = 'e'`,
    [schema, typeName],
  );
  return rows.length > 0;
}

/** Cria ENUMs usados por colunas da tabela (lidos na origem). */
async function ensureEnumsForTable(source, target, schema, table) {
  const { rows } = await source.query(
    `SELECT DISTINCT n.nspname AS enum_schema, t.typname AS enum_name
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace ns ON ns.oid = c.relnamespace
     JOIN pg_type t ON t.oid = a.atttypid
     JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE ns.nspname = $1 AND c.relname = $2
       AND a.attnum > 0 AND NOT a.attisdropped
       AND t.typtype = 'e'`,
    [schema, table],
  );
  for (const row of rows) {
    if (await enumExists(target, row.enum_schema, row.enum_name)) continue;
    const { rows: labels } = await source.query(
      `SELECT e.enumlabel
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = $1 AND t.typname = $2
       ORDER BY e.enumsortorder`,
      [row.enum_schema, row.enum_name],
    );
    if (labels.length === 0) continue;
    await target.query(`CREATE SCHEMA IF NOT EXISTS "${row.enum_schema}"`);
    const literals = labels.map((l) => `'${String(l.enumlabel).replace(/'/g, "''")}'`).join(", ");
    await target.query(`CREATE TYPE "${row.enum_schema}"."${row.enum_name}" AS ENUM (${literals})`);
    console.log(`  tipo ${row.enum_schema}.${row.enum_name} criado no destino`);
  }
}

/** Replica DDL da tabela (colunas + PK) da origem se faltar no destino. */
async function ensureTableFromSource(source, target, schema, table) {
  const fq = fqTable(`${schema}.${table}`);
  if (await tableExists(target, fq)) return;

  await target.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await ensureEnumsForTable(source, target, schema, table);

  const { rows: cols } = await source.query(
    `SELECT a.attname AS name,
            pg_catalog.format_type(a.atttypid, a.atttypmod) AS pg_type,
            NOT a.attnotnull AS nullable,
            pg_get_expr(ad.adbin, ad.adrelid) AS default_expr
     FROM pg_catalog.pg_attribute a
     JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
     JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
     WHERE n.nspname = $1 AND c.relname = $2 AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`,
    [schema, table],
  );
  if (cols.length === 0) {
    throw new Error(`Origem sem colunas para ${fq}`);
  }

  const colDefs = cols.map((c) => {
    let def = `"${c.name}" ${c.pg_type}`;
    if (c.nullable === false) def += " NOT NULL";
    if (c.default_expr) def += ` DEFAULT ${c.default_expr}`;
    return def;
  });

  console.log(`  criando tabela ${fq} no destino (${cols.length} colunas)`);
  await target.query(`CREATE TABLE IF NOT EXISTS ${fq} (${colDefs.join(", ")})`);

  const { rows: pks } = await source.query(
    `SELECT pg_get_constraintdef(con.oid) AS def
     FROM pg_constraint con
     JOIN pg_class rel ON rel.oid = con.conrelid
     JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE nsp.nspname = $1 AND rel.relname = $2 AND con.contype = 'p'`,
    [schema, table],
  );
  if (pks[0]?.def) {
    try {
      await target.query(`ALTER TABLE ${fq} ADD CONSTRAINT ${table}_pkey ${pks[0].def}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/already exists/i.test(msg)) {
        console.warn(`  PK em ${fq}: ${msg}`);
      }
    }
  }
}

async function syncSchemasFromSource(source, target, tableNames) {
  console.log("Sincronizando schema das tabelas listadas (APP_IMPORT_SCHEMA=from_supabase)...");
  for (const name of tableNames) {
    const { schema, table } = parseTable(name);
    const fq = fqTable(name);
    if (!(await tableExists(source, fq))) {
      console.warn(`  Origem sem ${fq}, ignorando schema.`);
      continue;
    }
    await ensureTableFromSource(source, target, schema, table);
  }
}

async function copyTable(source, target, fq) {
  const { rows } = await source.query(`SELECT * FROM ${fq}`);
  if (rows.length === 0) {
    console.log(`  ${fq}: 0 linhas (vazio)`);
    return 0;
  }
  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(", ");
  let copied = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = [];
    const placeholders = chunk.map((row, rowIndex) => {
      const base = rowIndex * columns.length;
      const ph = columns.map((_, colIndex) => `$${base + colIndex + 1}`);
      columns.forEach((col) => values.push(row[col]));
      return `(${ph.join(", ")})`;
    });
    const sql = `INSERT INTO ${fq} (${colList}) VALUES ${placeholders.join(", ")}`;
    await target.query(sql, values);
    copied += chunk.length;
  }
  console.log(`  ${fq}: ${copied} linhas`);
  return copied;
}

async function main() {
  if (!MODE || MODE === "false" || MODE === "0" || MODE === "skip") {
    return;
  }

  const sourceUrl = process.env.SUPABASE_DATABASE_URL?.trim();
  const targetUrl = process.env.DATABASE_URL?.trim();
  if (!sourceUrl) {
    throw new Error("SUPABASE_DATABASE_URL é obrigatória para importação");
  }
  if (!targetUrl) {
    throw new Error("DATABASE_URL é obrigatória (Postgres destino no Easypanel)");
  }

  if ((MODE === "once" || MODE === "true") && fs.existsSync(MARKER)) {
    console.log(`Import já concluído (marcador ${MARKER}). Use APP_IMPORT_SUPABASE_DATA=force para repetir.`);
    return;
  }

  const tables = loadTables(TABLES_FILE);
  if (tables.length === 0) throw new Error(`Nenhuma tabela em ${TABLES_FILE}`);

  const source = new pg.Client(clientConfig(sourceUrl));
  const target = new pg.Client(clientConfig(targetUrl));

  console.log(`Import Supabase → destino (${tables.length} tabelas, modo=${MODE}, COPY_MODE=node)`);
  await source.connect();
  await target.connect();

  if (MODE === "once" || MODE === "true") {
    try {
      const existing = await rowCount(target, `"public"."site_settings"`);
      if (existing > 0) {
        console.log(`Destino já tem ${existing} linha(s) em site_settings — importação ignorada (modo once).`);
        fs.mkdirSync(path.dirname(MARKER), { recursive: true });
        fs.writeFileSync(MARKER, new Date().toISOString());
        await source.end();
        await target.end();
        return;
      }
    } catch {
      // tabela inexistente → segue
    }
  }

  if (RUN_BOOTSTRAP && fs.existsSync(BOOTSTRAP_SQL)) {
    console.log("Aplicando bootstrap SQL no destino...");
    const bootstrap = fs.readFileSync(BOOTSTRAP_SQL, "utf8");
    await target.query(bootstrap);
  }

  if (IMPORT_SCHEMA === "from_supabase") {
    await syncSchemasFromSource(source, target, tables);
  }

  if (MODE === "force") {
    console.log("Modo force: TRUNCATE nas tabelas listadas (ordem inversa)...");
    await target.query("SET session_replication_role = replica");
    for (const name of [...tables].reverse()) {
      const fq = fqTable(name);
      if (await tableExists(target, fq)) {
        await target.query(`TRUNCATE TABLE ${fq} CASCADE`);
      }
    }
    await target.query("SET session_replication_role = DEFAULT");
  }

  await target.query("SET session_replication_role = replica");

  let total = 0;
  for (const name of tables) {
    const fq = fqTable(name);
    if (!(await tableExists(source, fq))) {
      console.warn(`  Origem sem tabela ${fq}, ignorando.`);
      continue;
    }
    if (!(await tableExists(target, fq))) {
      throw new Error(
        `Tabela ${fq} não existe no destino após sync de schema. Verifique SUPABASE_DATABASE_URL ou APP_IMPORT_SCHEMA=from_supabase.`,
      );
    }
    total += await copyTable(source, target, fq);
  }

  await target.query("SET session_replication_role = DEFAULT");

  fs.mkdirSync(path.dirname(MARKER), { recursive: true });
  fs.writeFileSync(MARKER, new Date().toISOString());
  console.log(`Importação concluída (${total} linhas). Marcador: ${MARKER}`);

  await source.end();
  await target.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : err);
  process.exit(1);
});