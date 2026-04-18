/**
 * Rate Plan Code(s) Aiosell guardados em `channel_pricing.channel_rate_plan_code`.
 * Vários códigos CM por linha PMS: separados por vírgula, ponto e vírgula ou nova linha.
 */

/** Parte o texto em códigos únicos (case-insensitive ao deduplicar). */
export function splitAiosellRatePlanCodes(raw: string | null | undefined): string[] {
  const s = String(raw ?? "").replace(/\u00a0/g, " ");
  if (!s.trim()) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of s.split(/[,;\n\r]+/)) {
    const t = part.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Normaliza para gravar na BD (lista única, separada por vírgula + espaço). */
export function normalizeAiosellRatePlanCodesStored(input: string): string {
  return splitAiosellRatePlanCodes(input).join(", ");
}
