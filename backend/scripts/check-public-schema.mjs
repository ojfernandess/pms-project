#!/usr/bin/env node
/**
 * Arranque: avisa se o Postgres não tem schema PMS (tabelas public.*).
 * PMS_REQUIRE_PUBLIC_SCHEMA=true → exit 1 (bloqueia API em deploy sem dump/migração).
 */
import pg from "pg";
import { databaseUrlForLibpq } from "./lib/database-url-libpq.mjs";

const REQUIRED_TABLE = "companies";

async function main() {
  const url = databaseUrlForLibpq(process.env.DATABASE_URL ?? "");
  if (!url) return;

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT to_regclass('public.${REQUIRED_TABLE}')::text AS core,
              (SELECT count(*)::int FROM information_schema.tables
               WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS table_count`,
    );
    const core = rows[0]?.core;
    const tableCount = rows[0]?.table_count ?? 0;
    if (core) {
      console.log(`Schema PMS OK (public.${REQUIRED_TABLE}, ${tableCount} tabelas public).`);
      return;
    }
    const msg =
      `ERRO: schema PMS ausente (${tableCount} tabelas em public; falta public.${REQUIRED_TABLE}). ` +
      "Restaure pg_dump do Easypanel/sandbox OU aplique supabase/migrations. " +
      "PRISMA_MIGRATE_ON_START=false so aplica so migracoes Nest, nao o schema completo.";
    console.error(msg);
    if ((process.env.PMS_REQUIRE_PUBLIC_SCHEMA || "").toLowerCase() === "true") {
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("check-public-schema:", err instanceof Error ? err.message : err);
  if ((process.env.PMS_REQUIRE_PUBLIC_SCHEMA || "").toLowerCase() === "true") {
    process.exit(1);
  }
});