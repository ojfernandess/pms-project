const LIBPQ_UNSUPPORTED_QUERY_PARAMS = [
  "connection_limit",
  "pool_timeout",
  "pgbouncer",
  "schema",
] as const;

/**
 * Valor colado no Easypanel por engano como linha .env inteira:
 * `DATABASE_URL=postgresql://...` — libpq/psql interpretam "DATABASE_URL" como opção inválida.
 */
export function sanitizeDatabaseUrlValue(raw: string): string {
  let trimmed = raw.trim();
  if (/^DATABASE_URL=/i.test(trimmed)) {
    trimmed = trimmed.replace(/^DATABASE_URL=/i, "").trim();
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/** URL sem parâmetros exclusivos do Prisma (válida para psql, pg_restore -d, node-pg). */
export function databaseUrlForLibpq(raw: string): string {
  const trimmed = sanitizeDatabaseUrlValue(raw);
  if (!trimmed) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.replace(/^postgresql:/i, "postgres:"));
  } catch {
    return trimmed;
  }

  for (const key of LIBPQ_UNSUPPORTED_QUERY_PARAMS) {
    url.searchParams.delete(key);
  }

  const out = url.toString();
  return trimmed.startsWith("postgresql:")
    ? out.replace(/^postgres:/i, "postgresql:")
    : out;
}

export function describeDatabaseUrlTarget(raw: string): string {
  const trimmed = sanitizeDatabaseUrlValue(raw);
  if (!trimmed) return "(empty)";
  try {
    const url = new URL(trimmed.replace(/^postgresql:/i, "postgres:"));
    const db = url.pathname.replace(/^\//, "") || "(no database)";
    return `${url.hostname}:${url.port || "5432"}/${db}`;
  } catch {
    return "(invalid DATABASE_URL)";
  }
}

/**
 * Supabase pooler transaction mode (:6543) não suporta prepared statements do Prisma
 * sem ?pgbouncer=true (SQLSTATE 42P05 — "prepared statement s0 already exists").
 */
export function normalizePooledDatabaseUrl(raw: string): string {
  const trimmed = sanitizeDatabaseUrlValue(raw);
  if (!trimmed) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed.replace(/^postgresql:/i, "postgres:"));
  } catch {
    return trimmed;
  }

  const port = url.port || "5432";
  const pooledTransaction = port === "6543" || url.searchParams.get("pgbouncer") === "true";

  if (pooledTransaction && url.searchParams.get("pgbouncer") !== "true") {
    url.searchParams.set("pgbouncer", "true");
  }

  const out = url.toString();
  return trimmed.startsWith("postgresql:") ? out.replace(/^postgres:/i, "postgresql:") : out;
}

export function assertDatabaseUrlForPooler(raw: string): void {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed.replace(/^postgresql:/i, "postgres:"));
  } catch {
    return;
  }
  if (url.port === "6543" && url.searchParams.get("pgbouncer") !== "true") {
    throw new Error(
      'DATABASE_URL usa pooler :6543 sem "pgbouncer=true". Acrescente ?pgbouncer=true à URL (ou deixe o backend normalizar em runtime).',
    );
  }
}
