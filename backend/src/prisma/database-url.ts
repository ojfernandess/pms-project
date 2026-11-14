/**
 * Supabase pooler transaction mode (:6543) não suporta prepared statements do Prisma
 * sem ?pgbouncer=true (SQLSTATE 42P05 — "prepared statement s0 already exists").
 */
export function normalizePooledDatabaseUrl(raw: string): string {
  const trimmed = raw.trim();
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
