/** Lock Postgres partilhado entre pods (import, grants, sync FKs). */
export const PMS_MIGRATION_LOCK_KEY = 91_524_001;

export function isPgConcurrencyError(err) {
  const code = err?.code;
  return code === "XX000" || code === "40001" || code === "40P01" || code === "55P03";
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry(label, fn, attempts = 6) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isPgConcurrencyError(err) || i === attempts - 1) throw err;
      const wait = 400 * (i + 1);
      console.warn(`${label}: concorrência (${err.code}), retry ${i + 2}/${attempts} em ${wait}ms...`);
      await sleep(wait);
    }
  }
  throw last;
}

export async function tryMigrationLock(client) {
  const { rows } = await client.query("SELECT pg_try_advisory_lock($1::bigint) AS ok", [PMS_MIGRATION_LOCK_KEY]);
  return Boolean(rows[0]?.ok);
}

export async function releaseMigrationLock(client) {
  await client.query("SELECT pg_advisory_unlock($1::bigint)", [PMS_MIGRATION_LOCK_KEY]).catch(() => {});
}