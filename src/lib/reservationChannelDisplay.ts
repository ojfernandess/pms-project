type OtaBookingShape = {
  ota_source_channel_name?: string | null;
  ota_reservation_code?: string | null;
  ota_segment?: string | null;
  ota_channels?: { name?: string | null; channel_manager_type?: string | null } | null;
};

function normalizeManagerName(raw: string | null | undefined): string {
  const value = String(raw ?? "").trim();
  if (!value) return "Channel Manager";
  const lower = value.toLowerCase();
  if (lower.includes("aiosell")) return "Aiosell";
  if (lower.includes("bukly")) return "Bukly";
  if (lower.includes("channex")) return "Channex";
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

/** Nome no payload Channex (revisão): prioriza customer_name do webhook resumido; senão name + surname. */
export function channexRevisionPayloadGuestName(payload: Record<string, unknown> | null | undefined): string {
  if (!payload || typeof payload !== "object") return "N/A";
  if (payload.source === "aiosell_lifecycle") {
    const rb = payload.rawBody as Record<string, unknown> | undefined;
    if (rb && typeof rb === "object" && !Array.isArray(rb)) {
      const g = rb.guest as Record<string, unknown> | undefined;
      if (g && typeof g === "object") {
        const fn = String(g.firstName ?? "").trim();
        const ln = String(g.lastName ?? "").trim();
        const full = `${fn} ${ln}`.trim();
        if (full) return full;
      }
      const rooms = rb.rooms as unknown[] | undefined;
      const r0 =
        Array.isArray(rooms) && rooms[0] && typeof rooms[0] === "object" && !Array.isArray(rooms[0])
          ? (rooms[0] as Record<string, unknown>)
          : null;
      const gn = r0 && String(r0.guestName ?? "").trim();
      if (gn) return gn;
    }
  }
  const cn = String(payload.customer_name ?? "").trim();
  if (cn) return cn;
  const c = payload.customer as Record<string, unknown> | undefined;
  if (c && typeof c === "object") {
    const n = String(c.name ?? "").trim();
    const s = String(c.surname ?? "").trim();
    const full = `${n} ${s}`.trim();
    if (full) return full;
    if (n) return n;
  }
  return "N/A";
}

/** Texto de rodapé em «Dados do Hóspede» quando a reserva veio de OTA/CM. */
export function otaContactHintFromOtaBooking(ota: OtaBookingShape | null | undefined): string {
  if (!ota) return "";
  const cmType = String(ota.ota_channels?.channel_manager_type ?? "")
    .toLowerCase()
    .trim();
  const cmName = normalizeManagerName(ota.ota_channels?.name);
  if (cmType === "channex" || cmName === "Channex") {
    return "Contacto enviado pelo canal (Channex / OTA) quando aplicável.";
  }
  if (cmType === "aiosell" || cmName === "Aiosell") {
    return "Contacto enviado pelo canal (Aiosell / OTA) quando aplicável.";
  }
  if (cmType === "bukly" || cmName === "Bukly") {
    return "Contacto enviado pelo canal (Bukly / OTA) quando aplicável.";
  }
  if (cmName && cmName !== "Channel Manager") {
    return `Contacto enviado pelo canal (${cmName} / OTA) quando aplicável.`;
  }
  return "Contacto enviado pelo canal (OTA) quando aplicável.";
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

const OTA_SOURCE_CODE_TO_DOMAIN: Record<string, string> = {
  BDC: "booking.com",
  ABB: "airbnb.com",
  EXP: "expedia.com",
  HTL: "hotels.com",
  AGO: "agoda.com",
  HBD: "hotelbeds.com",
  HWL: "hostelworld.com",
  TRK: "traveloka.com",
  VRB: "vrbo.com",
  CTP: "trip.com",
  DDC: "despegar.com",
};

function sourceCodeFromOtaBooking(ota: OtaBookingShape | null | undefined): string | null {
  const raw = String(ota?.ota_reservation_code ?? "").trim();
  if (!raw) return null;
  const code = raw.split("-")[0]?.trim().toUpperCase();
  if (!code || code.length < 3 || code.length > 5) return null;
  return code;
}

function domainFromPartnerName(name: string | null | undefined): string | null {
  const v = String(name ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v.includes("booking")) return "booking.com";
  if (v.includes("airbnb")) return "airbnb.com";
  if (v.includes("expedia")) return "expedia.com";
  if (v.includes("hotels.com") || v === "hotels") return "hotels.com";
  if (v.includes("agoda")) return "agoda.com";
  if (v.includes("hotelbeds")) return "hotelbeds.com";
  if (v.includes("hostelworld")) return "hostelworld.com";
  if (v.includes("trip.com") || v === "trip") return "trip.com";
  if (v.includes("traveloka")) return "traveloka.com";
  if (v.includes("vrbo")) return "vrbo.com";
  if (v.includes("despegar") || v.includes("decolar")) return "despegar.com";
  return null;
}

export function resolveReservationBookingSourceLogo(r: {
  ota_booking?: OtaBookingShape | null;
  ota_reservations?: OtaBookingShape[] | null;
}): { logoUrl: string | null; sourceCode: string | null } {
  const ota = r.ota_booking ?? r.ota_reservations?.[0] ?? null;
  if (!ota) return { logoUrl: null, sourceCode: null };

  const sourceCode = sourceCodeFromOtaBooking(ota);
  const byCode = sourceCode ? OTA_SOURCE_CODE_TO_DOMAIN[sourceCode] ?? null : null;
  const byName = domainFromPartnerName(ota.ota_source_channel_name);
  const domain = byCode || byName;
  if (!domain) return { logoUrl: null, sourceCode };

  return {
    logoUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
    sourceCode,
  };
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
