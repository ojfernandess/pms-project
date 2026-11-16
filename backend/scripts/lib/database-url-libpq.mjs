const LIBPQ_UNSUPPORTED_QUERY_PARAMS = [
  "connection_limit",
  "pool_timeout",
  "pgbouncer",
  "schema",
];

export function sanitizeDatabaseUrlValue(raw) {
  let trimmed = String(raw ?? "").trim();
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

export function databaseUrlForLibpq(raw) {
  const trimmed = sanitizeDatabaseUrlValue(raw);
  if (!trimmed) return trimmed;

  let url;
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