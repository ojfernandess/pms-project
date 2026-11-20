/**
 * Rótulos pt-BR para CRM (origem, status, datas).
 */

/** Data de estadia / check-in / check-out sem deslocar fuso (YYYY-MM-DD ou ISO). */
export function formatCrmDate(value: unknown): string {
  if (value == null || value === "") return "—";
  const raw = String(value).trim();
  if (!raw) return "—";

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${d}/${m}/${y}`;
  }

  const isoDay = /^(\d{4})-(\d{2})-(\d{2})[T\s]/.exec(raw);
  if (isoDay) {
    const [, y, m, d] = isoDay;
    return `${d}/${m}/${y}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  motor: "Motor de reservas",
  motor_public: "Motor de reservas",
  quote_motor: "Orçamento (motor)",
  pms: "PMS",
  pms_staff: "Recepção (PMS)",
  pms_client: "Cliente PMS",
  pms_checkin: "Check-in",
  pms_checkout: "Check-out",
  "contact.upserted": "Atualização de contato",
  "booking.created": "Nova reserva",
  "booking.checked_in": "Check-in",
  "booking.checked_out": "Check-out",
  "booking.cancelled": "Cancelamento",
  import: "Importação",
  campaign: "Campanha",
  website: "Site",
  ota: "OTA",
  bukly: "Bukly",
  aiosell: "Aiosell",
  channex: "Channex",
};

export function formatCrmSource(source: unknown): string {
  if (source == null || source === "") return "—";
  const key = String(source).trim();
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  if (SOURCE_LABELS[key.toLowerCase()]) return SOURCE_LABELS[key.toLowerCase()];
  // quote_motor_xyz → humanizar snake_case
  return key
    .replace(/[._]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  checkedin: "Check-in",
  checked_in: "Check-in",
  checkedout: "Check-out",
  checked_out: "Check-out",
  cancelled: "Cancelada",
  canceled: "Cancelada",
  no_show: "No-show",
  noshow: "No-show",
  draft: "Rascunho",
  blocked: "Bloqueio",
  preregistration: "Pré-registro",
  maintenance: "Manutenção",
};

export function formatCrmReservationStatus(status: unknown): string {
  if (status == null || status === "") return "—";
  const key = String(status).trim().toLowerCase();
  return RESERVATION_STATUS_LABELS[key] || String(status);
}

const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  pending: "Pendente",
  sent: "Enviado",
  accepted: "Aceito",
  approved: "Aprovado",
  rejected: "Recusado",
  declined: "Recusado",
  expired: "Expirado",
  converted: "Convertido",
  cancelled: "Cancelado",
  canceled: "Cancelado",
};

export function formatCrmQuoteStatus(status: unknown): string {
  if (status == null || status === "") return "—";
  const key = String(status).trim().toLowerCase();
  return QUOTE_STATUS_LABELS[key] || formatCrmReservationStatus(status);
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  note: "Nota",
  call: "Ligação",
  email: "E-mail",
  whatsapp: "WhatsApp",
  sms: "SMS",
  meeting: "Reunião",
  task: "Tarefa",
  system: "Sistema",
};

export function formatCrmActivityType(type: unknown): string {
  if (type == null || type === "") return "—";
  const key = String(type).trim().toLowerCase();
  return ACTIVITY_TYPE_LABELS[key] || String(type);
}

/** Documento para exibição (CPF formatado quando aplicável). */
export function formatCrmDocument(
  documentType: unknown,
  documentNumber: unknown,
): string {
  const type = documentType != null && String(documentType).trim() ? String(documentType).trim() : "";
  const numberRaw =
    documentNumber != null && String(documentNumber).trim() ? String(documentNumber).trim() : "";
  if (!type && !numberRaw) return "—";

  let number = numberRaw;
  const digits = numberRaw.replace(/\D/g, "");
  if ((type.toUpperCase() === "CPF" || (!type && digits.length === 11)) && digits.length === 11) {
    number = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  return [type || null, number || null].filter(Boolean).join(" ");
}
