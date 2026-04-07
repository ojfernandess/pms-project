type OtaBookingShape = {
  ota_source_channel_name?: string | null;
  ota_segment?: string | null;
  ota_channels?: { name?: string | null; channel_manager_type?: string | null } | null;
};

function normalizeManagerName(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Channel Manager";
  const lower = value.toLowerCase();
  if (lower.includes("aiosell")) return "Aiosell";
  if (lower.includes("bukly")) return "Bukly";
  return value;
}

function normalizePartnerName(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "não informado";
  const lower = value.toLowerCase();
  if (lower === "direct") return "Direct";
  if (lower === "booking" || lower === "booking.com") return "Booking.com";
  if (lower === "airbnb") return "Airbnb";
  if (lower === "expedia") return "Expedia";
  return value;
}

/** Texto único para «Origem / Canal» na ficha da reserva ou listas. */
export function formatReservationChannelOrigin(r: {
  channel?: string | null;
  origin?: string | null;
  ota_booking?: OtaBookingShape | null;
  /** PostgREST: relação inversa 1:N (usar [0] na lista). */
  ota_reservations?: OtaBookingShape[] | null;
}): string {
  if (r.origin && String(r.origin).trim()) return String(r.origin).trim();

  const ch = r.channel;
  const ota = r.ota_booking ?? r.ota_reservations?.[0] ?? null;
  const cmName = ota?.ota_channels?.name;
  const partner = ota?.ota_source_channel_name;
  const seg = ota?.ota_segment;

  if (ch === "direct") {
    return "Direto (PMS / balcão)";
  }

  if (ota || ch === "ota") {
    const manager = normalizeManagerName(cmName);
    const partnerName = normalizePartnerName(partner);
    // Ex.: "Aiosell / Booking.com" ou "Aiosell / Direct"
    // Segmento fica fora da exibição principal para evitar ruído no Financeiro/Detalhes.
    return `${manager} / ${partnerName}`;
  }

  return ch ? String(ch) : "—";
}

/** Email e telefone: cliente cadastrado ou dados do payload OTA (Aiosell). */
export function reservationGuestContactFields(r: {
  ota_booking?: {
    ota_guest_email?: string | null;
    ota_guest_phone?: string | null;
  } | null;
  ota_reservations?: {
    ota_guest_email?: string | null;
    ota_guest_phone?: string | null;
  }[] | null;
  guest?: { email?: string | null; phone?: string | null } | null;
  financial_responsible?: { email?: string | null; phone?: string | null } | null;
}): { email: string | null; phone: string | null } {
  const ota = r.ota_booking ?? r.ota_reservations?.[0];
  const email =
    r.guest?.email ||
    r.financial_responsible?.email ||
    (ota?.ota_guest_email && String(ota.ota_guest_email).trim()) ||
    null;
  const phone =
    r.guest?.phone ||
    r.financial_responsible?.phone ||
    (ota?.ota_guest_phone && String(ota.ota_guest_phone).trim()) ||
    null;
  return { email, phone };
}

/** Nome para e-mails/templates quando não há `clients` ligado (ex.: OTA/Aiosell). */
export function reservationGuestDisplayName(r: {
  guest?: { full_name?: string | null } | null;
  financial_responsible?: { full_name?: string | null } | null;
  ota_booking?: { ota_guest_name?: string | null } | null;
  ota_reservations?: { ota_guest_name?: string | null }[] | null;
  guest_name?: string | null;
}): string {
  const g = r.guest?.full_name?.trim();
  if (g) return g;
  const f = r.financial_responsible?.full_name?.trim();
  if (f) return f;
  const ota = r.ota_booking ?? r.ota_reservations?.[0];
  const on = ota?.ota_guest_name?.trim();
  if (on) return on;
  const gn = r.guest_name?.trim();
  if (gn) return gn;
  return "Hóspede";
}

export function formatOtaGuestAddressLines(addr: Record<string, unknown> | null | undefined): string[] {
  if (!addr || typeof addr !== "object") return [];
  const line1 = addr.line1 ?? addr.line_1 ?? addr.street;
  const city = addr.city;
  const state = addr.state;
  const country = addr.country;
  const zip = addr.zipCode ?? addr.zip;
  const parts: string[] = [];
  if (line1) parts.push(String(line1).trim());
  const cityState = [city, state].filter(Boolean).map(String).join(", ").trim();
  if (cityState) parts.push(cityState);
  const countryZip = [country, zip].filter(Boolean).map(String).join(" ").trim();
  if (countryZip) parts.push(countryZip);
  return parts.filter(Boolean);
}
