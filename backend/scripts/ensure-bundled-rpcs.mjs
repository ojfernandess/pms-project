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
  {
    name: "user_can_access_establishment",
    args: "p_user_id uuid, p_establishment_id uuid",
  },
  { name: "generate_reservation_code", args: "" },
  {
    name: "create_reservation_with_lock",
    args:
      "p_reservation_data jsonb, p_checkin_date date, p_checkout_date date, p_establishment_id uuid, p_room_id uuid, p_category_id uuid",
  },
  { name: "get_fnrh_settings_public", args: "p_establishment_id uuid" },
  {
    name: "calculate_category_availability",
    args: "p_establishment_id uuid, p_category_id uuid, p_date date",
  },
  {
    name: "calculate_category_availability",
    args: "p_establishment_id uuid, p_category_id uuid, p_date date",
  },
  {
    name: "sync_rate_inventory_from_reservations",
    args: "p_establishment_id uuid, p_category_id uuid, p_date date",
  },
  {
    name: "company_has_feature_access",
    args: "p_feature_key text, p_company_id uuid",
  },
  {
    name: "get_company_api_credentials_status",
    args: "p_company_id uuid",
  },
  {
    name: "rotate_company_api_credentials",
    args: "p_company_id uuid",
  },
  {
    name: "create_notification_for_establishment",
    args:
      "p_establishment_id uuid, p_type notification_type, p_title text, p_message text, p_priority notification_priority, p_metadata jsonb",
  },
  {
    name: "get_resolved_email_template",
    args: "p_event_type email_event_type, p_establishment_id uuid",
  },
  {
    name: "log_activity",
    args:
      "p_establishment_id uuid, p_user_id uuid, p_action_type text, p_entity_type text, p_description text, p_entity_id uuid, p_entity_code text, p_old_values jsonb, p_new_values jsonb, p_metadata jsonb",
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

/** Compara só tipos (pg às vezes omite nomes: "uuid" vs "p_company_id uuid"). */
function normalizeIdentityArgTypes(identityArgs) {
  const raw = (identityArgs ?? "").trim();
  if (!raw) return "";
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .map((part) => {
      const tokens = part.split(/\s+/);
      return tokens[tokens.length - 1];
    })
    .join(",");
}

async function listPublicFunctionSignatures(client, name) {
  const { rows } = await client.query(
    `SELECT pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = $1`,
    [name],
  );
  return rows.map((r) => r.args);
}

async function hasPublicFunction(client, name, identityArgs) {
  const expected = normalizeIdentityArgTypes(identityArgs);
  const signatures = await listPublicFunctionSignatures(client, name);
  return signatures.some((args) => normalizeIdentityArgTypes(args) === expected);
}

async function bundledRpcsComplete(client) {
  for (const rpc of REQUIRED_RPCS) {
    if (!(await hasPublicFunction(client, rpc.name, rpc.args))) return false;
  }
  return true;
}

/** SQL aplicado mesmo em modo auto quando as RPCs ainda não existem (schema parcial em produção). */
const INCREMENTAL_PATCHES = [
  {
    sql: "company_api_credentials.sql",
    checks: [
      { name: "get_company_api_credentials_status", args: "p_company_id uuid" },
      { name: "rotate_company_api_credentials", args: "p_company_id uuid" },
    ],
  },
];

async function applyIncrementalPatches(client, url, rpcDir) {
  for (const patch of INCREMENTAL_PATCHES) {
    let needs = false;
    for (const check of patch.checks) {
      if (!(await hasPublicFunction(client, check.name, check.args))) {
        needs = true;
        break;
      }
    }
    if (!needs) continue;
    const filePath = path.normalize(path.join(rpcDir, patch.sql));
    if (!fs.existsSync(filePath)) {
      console.error(`Patch em falta: ${filePath}`);
      continue;
    }
    console.log(`=== Patch incremental: ${patch.sql} (RPC de credenciais API ausente) ===`);
    const ok = applySqlFileWithPsql(url, filePath, { stopOnError: true });
    if (!ok) {
      console.error(`Patch ${patch.sql} falhou — veja erros psql acima.`);
    }
  }
}

function applySqlFileWithPsql(url, filePath, { stopOnError = false } = {}) {
  const result = spawnSync(
    "psql",
    [url, "-v", `ON_ERROR_STOP=${stopOnError ? 1 : 0}`, "-f", filePath],
    {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.stdout?.trim()) console.log(result.stdout.trim());
  if (result.stderr?.trim()) console.log(result.stderr.trim());
  if (result.status !== 0) {
    console.error(`psql saiu com código ${result.status} em ${path.basename(filePath)}`);
  }
  return result.status === 0;
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

  const rpcDir = process.env.BUNDLED_RPCS_DIR || path.join(__dirname, "migration", "rpc");

  if (mode === "auto") {
    await applyIncrementalPatches(client, url, rpcDir);
    if (await bundledRpcsComplete(client)) {
      await client.end();
      return;
    }
  }

  const files = loadApplyOrder(rpcDir);

  console.log(`=== Bundled RPCs (modo=${mode}, ${files.length} ficheiros) ===`);
  for (const name of files) {
    const filePath = path.normalize(path.join(rpcDir, name));
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
      const found = await listPublicFunctionSignatures(client, rpc.name);
      if (found.length > 0) {
        console.error(
          `ERROR: public.${rpc.name} — esperado (${rpc.args || "sem args"}); no DB: ${found.join(" | ")}`,
        );
      } else {
        console.error(`ERROR: public.${rpc.name} ainda ausente.`);
      }
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