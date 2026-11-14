/**
 * Copia funções/procedures public.* em falta no Postgres destino (ex.: calculate_rate_price).
 * Use quando pg_restore do schema falhou em parte (erro 42883 / RPC não encontrada).
 *
 * Env: SUPABASE_DATABASE_URL, DATABASE_URL
 * Opcional: SYNC_FUNCTIONS_SCHEMA=public (default)
 */
import pg from "pg";

function clientConfig(url) {
  const ssl =
    /supabase\.com/i.test(url) || process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : undefined;
  return { connectionString: url, ssl };
}

async function listRoutines(client, schema) {
  const { rows } = await client.query(
    `SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = $1 AND p.prokind IN ('f', 'p')
     ORDER BY p.proname, args`,
    [schema],
  );
  return rows;
}

async function routineExists(client, schema, name, args) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = $1 AND p.proname = $2
       AND pg_get_function_identity_arguments(p.oid) = $3
     LIMIT 1`,
    [schema, name, args],
  );
  return rows.length > 0;
}

const CRITICAL = [
  "calculate_rate_price",
  "cancel_expired_preregistrations",
  "create_reservation_with_lock",
];

async function main() {
  const sourceUrl = process.env.SUPABASE_DATABASE_URL?.trim();
  const targetUrl = process.env.DATABASE_URL?.trim();
  if (!sourceUrl || !targetUrl) {
    console.error("SUPABASE_DATABASE_URL e DATABASE_URL são obrigatórias.");
    process.exit(1);
  }

  const schema = (process.env.SYNC_FUNCTIONS_SCHEMA || "public").trim();
  const onlyCritical = (process.env.SYNC_FUNCTIONS_CRITICAL_ONLY || "false").toLowerCase() === "true";

  const source = new pg.Client(clientConfig(sourceUrl));
  const target = new pg.Client(clientConfig(targetUrl));
  await source.connect();
  await target.connect();

  let routines = await listRoutines(source, schema);
  if (onlyCritical) {
    routines = routines.filter((r) => CRITICAL.includes(r.proname));
  }

  console.log(`Sincronizando rotinas ${schema}.* (${routines.length} na origem)...`);
  let created = 0;
  let failed = 0;

  for (const row of routines) {
    if (await routineExists(target, schema, row.proname, row.args)) continue;

    const { rows: defRows } = await source.query(`SELECT pg_get_functiondef($1::oid) AS def`, [row.oid]);
    const def = defRows[0]?.def;
    if (!def) continue;

    try {
      await target.query(def);
      created += 1;
      if (CRITICAL.includes(row.proname)) {
        console.log(`  + ${row.proname}(${row.args})`);
      }
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  ! ${row.proname}(${row.args}): ${msg.slice(0, 200)}`);
    }
  }

  console.log(`Rotinas criadas: ${created}, falhas: ${failed}`);
  for (const name of CRITICAL) {
    const srcFns = routines.filter((r) => r.proname === name);
    let any = false;
    for (const f of srcFns) {
      if (await routineExists(target, schema, f.proname, f.args)) any = true;
    }
    if (!any && srcFns.length > 0) {
      console.warn(`WARN: ${schema}.${name} ainda ausente no destino.`);
    } else if (srcFns.length === 0) {
      console.warn(`WARN: ${schema}.${name} não existe na origem Supabase.`);
    }
  }

  await source.end();
  await target.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});