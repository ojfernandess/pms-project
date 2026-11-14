/**
 * Garante RPCs críticas no destino (auto no arranque se APP_APPLY_BUNDLED_RPCS=auto|once|force).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RATE_PRICE_SIGNATURE =
  "p_establishment_id uuid, p_category_id uuid, p_pricing_plan_id uuid, p_date date, p_adults integer, p_children integer";

const FNRH_SIGNATURE = "p_establishment_id uuid";

const BUNDLED_FILES = [
  "calculate_rate_price.sql",
  "grant_calculate_rate_price.sql",
  "cancel_expired_preregistrations.sql",
  "get_fnrh_settings_public.sql",
];

function clientConfig(url) {
  const ssl =
    /supabase\.com/i.test(url) || process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : undefined;
  return { connectionString: url, ssl };
}

async function hasPublicFunction(client, name, identityArgs = null) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = $1
       AND ($2::text IS NULL OR pg_get_function_identity_arguments(p.oid) = $2)
     LIMIT 1`,
    [name, identityArgs],
  );
  return rows.length > 0;
}

async function bundledRpcsComplete(client) {
  const rate = await hasPublicFunction(client, "calculate_rate_price", RATE_PRICE_SIGNATURE);
  const cancel = await hasPublicFunction(client, "cancel_expired_preregistrations", "");
  const fnrh = await hasPublicFunction(client, "get_fnrh_settings_public", FNRH_SIGNATURE);
  return rate && cancel && fnrh;
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

  if (mode === "auto" && (await bundledRpcsComplete(client))) {
    await client.end();
    return;
  }

  const rpcDir = process.env.BUNDLED_RPCS_DIR || path.join(__dirname, "migration", "rpc");

  console.log(`=== Bundled RPCs (modo=${mode}) ===`);
  for (const name of BUNDLED_FILES) {
    const filePath = path.join(rpcDir, name);
    if (!fs.existsSync(filePath)) {
      console.error(`Ficheiro em falta: ${filePath}`);
      continue;
    }
    console.log(`  aplicando ${name}...`);
    applySqlFileWithPsql(url, filePath);
  }

  let rateOk = await hasPublicFunction(client, "calculate_rate_price", RATE_PRICE_SIGNATURE);
  if (!rateOk) {
    const minimal = path.join(rpcDir, "calculate_rate_price_minimal.sql");
    if (fs.existsSync(minimal)) {
      console.warn("  tentando calculate_rate_price_minimal.sql (fallback)...");
      applySqlFileWithPsql(url, minimal);
      rateOk = await hasPublicFunction(client, "calculate_rate_price", RATE_PRICE_SIGNATURE);
    }
  }

  const cancelOk = await hasPublicFunction(client, "cancel_expired_preregistrations", "");
  const fnrhOk = await hasPublicFunction(client, "get_fnrh_settings_public", FNRH_SIGNATURE);

  if (rateOk) {
    console.log("OK: public.calculate_rate_price(uuid, uuid, uuid, date, integer, integer)");
  } else {
    console.error(
      "ERROR: calculate_rate_price ainda ausente. Verifique rate_calendar / room_categories e permissões CREATE.",
    );
  }
  if (cancelOk) {
    console.log("OK: public.cancel_expired_preregistrations()");
  } else {
    console.error("ERROR: cancel_expired_preregistrations ainda ausente.");
  }
  if (fnrhOk) {
    console.log("OK: public.get_fnrh_settings_public(uuid)");
  } else {
    console.error("ERROR: get_fnrh_settings_public ainda ausente.");
  }

  const strict = (process.env.APP_APPLY_BUNDLED_RPCS_STRICT || "false").toLowerCase() === "true";
  if (rateOk && cancelOk && fnrhOk) {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, new Date().toISOString());
  } else if (strict) {
    await client.end();
    process.exit(1);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  if ((process.env.APP_APPLY_BUNDLED_RPCS_STRICT || "false").toLowerCase() === "true") {
    process.exit(1);
  }
});