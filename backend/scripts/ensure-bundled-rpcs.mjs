/**
 * Garante calculate_rate_price no destino (auto no arranque se APP_APPLY_BUNDLED_RPCS=auto|once|force).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SIGNATURE =
  "p_establishment_id uuid, p_category_id uuid, p_pricing_plan_id uuid, p_date date, p_adults integer, p_children integer";

function clientConfig(url) {
  const ssl =
    /supabase\.com/i.test(url) || process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : undefined;
  return { connectionString: url, ssl };
}

async function hasCalculateRatePrice(client) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'calculate_rate_price'
       AND pg_get_function_identity_arguments(p.oid) = $1
     LIMIT 1`,
    [SIGNATURE],
  );
  return rows.length > 0;
}

function applySqlFileWithPsql(url, filePath) {
  const result = spawnSync("psql", [url, "-v", "ON_ERROR_STOP=0", "-f", filePath], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.stderr?.trim()) console.log(result.stderr.trim());
  if (result.status !== 0) {
    console.error(`psql saiu com código ${result.status} em ${path.basename(filePath)}`);
  }
}

async function main() {
  const mode = (process.env.APP_APPLY_BUNDLED_RPCS || "auto").trim().toLowerCase();
  if (["false", "0", "skip", "no", "off"].includes(mode)) return;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;

  const marker = process.env.BUNDLED_RPCS_STATE_FILE || "/app/storage/.bundled-rpcs-applied";
  if ((mode === "once" || mode === "true") && fs.existsSync(marker)) {
    console.log(`Bundled RPCs: marcador ${marker} existe (APP_APPLY_BUNDLED_RPCS=${mode}).`);
    return;
  }

  const client = new pg.Client(clientConfig(url));
  await client.connect();

  if (mode === "auto" && (await hasCalculateRatePrice(client))) {
    await client.end();
    return;
  }

  const rpcDir = process.env.BUNDLED_RPCS_DIR || path.join(__dirname, "migration", "rpc");
  const files = ["calculate_rate_price.sql", "grant_calculate_rate_price.sql"];

  console.log(`=== Bundled RPCs (modo=${mode}) ===`);
  for (const name of files) {
    const filePath = path.join(rpcDir, name);
    if (!fs.existsSync(filePath)) {
      console.error(`Ficheiro em falta: ${filePath}`);
      continue;
    }
    console.log(`  aplicando ${name}...`);
    applySqlFileWithPsql(url, filePath);
  }

  const ok = await hasCalculateRatePrice(client);
  if (ok) {
    console.log("OK: public.calculate_rate_price(uuid, uuid, uuid, date, integer, integer)");
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString());
  } else {
    console.error(
      "ERROR: calculate_rate_price ainda ausente. Verifique permissões CREATE no Postgres e tabelas rate_calendar / dynamic_pricing_rules.",
    );
    if ((process.env.APP_APPLY_BUNDLED_RPCS_STRICT || "false").toLowerCase() === "true") {
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  if ((process.env.APP_APPLY_BUNDLED_RPCS_STRICT || "false").toLowerCase() === "true") {
    process.exit(1);
  }
});