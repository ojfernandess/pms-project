/**
 * Segurança tarifário → Channel Manager: datas sem linha em `rate_calendar`
 * não devem enviar disponibilidade «positiva» nem deixar o CM com estado antigo (ex.: valor 1).
 * Usado pelo sync Bukly (cliente); Channex/Aiosell replicam a mesma regra nas Edge Functions.
 */

export function buildTariffCategoryDateKeySet(
  rows: Array<{ category_id: string; date: string }>
): Set<string> {
  const set = new Set<string>();
  for (const r of rows) {
    const d = String(r.date ?? "").slice(0, 10);
    const cid = String(r.category_id ?? "").trim();
    if (cid && d) set.add(`${cid}|${d}`);
  }
  return set;
}

/** Lista YYYY-MM-DD de start a end (inclusive), em UTC por string ISO. */
export function eachDateInRangeInclusive(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  let c = new Date(`${startIso}T12:00:00.000Z`);
  const end = new Date(`${endIso}T12:00:00.000Z`);
  while (c.getTime() <= end.getTime()) {
    out.push(c.toISOString().slice(0, 10));
    c.setUTCDate(c.getUTCDate() + 1);
  }
  return out;
}
