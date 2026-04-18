/** Remove sufixos/prefixos "null" ou "undefined" de concatenações incorretas (ex.: OTA). */
export function sanitizeGuestNameArtifacts(s: string | null | undefined): string {
  if (s == null) return "";
  let t = String(s).trim().replace(/\s+/g, " ");
  t = t.replace(/\s+(null|undefined)\s*$/gi, "").trim();
  t = t.replace(/^(null|undefined)\s+/gi, "").trim();
  if (/^(null|undefined)$/i.test(t)) return "";
  return t;
}

/**
 * Nome do hóspede para exibição: cliente (guest_id) > responsável financeiro > texto na reserva (ex.: OTA/Aiosell).
 */
export function reservationGuestDisplayName(
  r: {
    guest?: { full_name?: string | null } | null;
    financial_responsible?: { full_name?: string | null } | null;
    guest_name?: string | null;
  },
  whenEmpty: string = "N/A"
): string {
  const fromClient = r.guest?.full_name || r.financial_responsible?.full_name;
  const clientSan = sanitizeGuestNameArtifacts(fromClient != null ? String(fromClient) : "");
  if (clientSan) return clientSan;
  const rawSan = sanitizeGuestNameArtifacts(r.guest_name != null ? String(r.guest_name) : "");
  if (rawSan) return rawSan;
  return whenEmpty;
}
