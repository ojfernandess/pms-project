/**
 * Garante RPCs críticas no destino (auto no arranque se APP_APPLY_BUNDLED_RPCS=auto|once|force).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const REQUIRED_RPCS = [
  {
    name: "calculate_rate_price",
    args: "p_establishment_id uuid, p_category_id uuid, p_pricing_plan_id uuid, p_date date, p_adults integer, p_children integer",
  },
  { name: "cancel_expired_preregistrations", args: "" },
  { name: "get_fnrh_settings_public", args: "p_establishment_id uuid" },
  {
    name: "calculate_category_availability",
    args: "p_establishment_id uuid, p_category_id uuid, p_date date",
  },
  {
    name: "sync_rate_inventory_from_reservations",
    args: "p_establishment_id uuid, p_category_id uuid, p_date date",
  },
];

function loadApplyOrder(rpcDir) {
  const orderFile = path.join(rpcDir, "apply-order.txt");
  if (!fs.existsSync(orderFile)) {
    return fs
      .readdirSync(rpcDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
  }
  return fs
    .readFileSync(orderFile, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function clientConfig(url) {
  const ssl =
    /supabase\.com/i.test(url) || process.env.PGSSLMODE === "require"
      ? { rejectUnauthorized: false }
      : undefined;
  return { connectionString: url, ssl };
}

async function hasPublicFunction(client, name, identityArgs) {
  const { rows } = await client.query(
    `SELECT 1 FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = $1
       AND pg_get_function_identity_arguments(p.oid) = $2
     LIMIT 1`,
    [name, identityArgs],
  );
  return rows.length > 0;
}

async function bundledRpcsComplete(client) {
  for (const rpc of REQUIRED_RPCS) {
    if (!(await hasPublicFunction(client, rpc.name, rpc.args))) return false;
  }
  return true;
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
  const files = loadApplyOrder(rpcDir);

  console.log(`=== Bundled RPCs (modo=${mode}, ${files.length} ficheiros) ===`);
  for (const name of files) {
    const filePath = path.join(rpcDir, name);
    if (!fs.existsSync(filePath)) {
      console.error(`Ficheiro em falta: ${filePath}`);
      continue;
    }
    console.log(`  aplicando ${name}...`);
    applySqlFileWithPsql(url, filePath);
  }

  let rateOk = await hasPublicFunction(client, REQUIRED_RPCS[0].name, REQUIRED_RPCS[0].args);
  if (!rateOk) {
    const minimal = path.join(rpcDir, "calculate_rate_price_minimal.sql");
    if (fs.existsSync(minimal)) {
      console.warn("  tentando calculate_rate_price_minimal.sql (fallback)...");
      applySqlFileWithPsql(url, minimal);
      rateOk = await hasPublicFunction(client, REQUIRED_RPCS[0].name, REQUIRED_RPCS[0].args);
    }
  }

  let allOk = true;
  for (const rpc of REQUIRED_RPCS) {
    const ok = await hasPublicFunction(client, rpc.name, rpc.args);
    if (ok) {
      console.log(`OK: public.${rpc.name}(${rpc.args || ""})`);
    } else {
      console.error(`ERROR: public.${rpc.name} ainda ausente.`);
      allOk = false;
    }
  }

  const strict = (process.env.APP_APPLY_BUNDLED_RPCS_STRICT || "false").toLowerCase() === "true";
  if (allOk) {
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