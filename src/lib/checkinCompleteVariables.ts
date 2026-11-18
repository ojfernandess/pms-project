import { format, parseISO } from "date-fns";

export type CheckinGuestInfoType = "wifi" | "arrival" | "parking" | "custom";

export interface CheckinWifiConfig {
  network?: string;
  password?: string;
  notes?: string;
}

export interface CheckinArrivalConfig {
  title?: string;
  body?: string;
}

export interface CheckinParkingConfig {
  fee_amount?: string;
  instructions?: string;
}

export interface CheckinCustomConfig {
  title?: string;
  body?: string;
}

export type CheckinGuestConfig =
  | CheckinWifiConfig
  | CheckinArrivalConfig
  | CheckinParkingConfig
  | CheckinCustomConfig;

export const CHECKIN_TEMPLATE_VARIABLES = [
  { key: "guest_name", label: "Nome do hóspede", aliases: ["nome_hospede", "nome_hóspede"] },
  { key: "room_password", label: "Senha do quarto", aliases: ["senha_quarto", "senha_do_quarto"] },
  { key: "category", label: "Categoria", aliases: ["categoria"] },
  { key: "locator", label: "Localizador", aliases: ["localizador"] },
  { key: "accommodation", label: "Acomodação (categoria + quarto)", aliases: ["acomodacao", "acomodação"] },
  { key: "checkin", label: "Data check-in", aliases: ["checkin_date", "data_checkin"] },
  { key: "checkout", label: "Data check-out", aliases: ["checkout_date", "data_checkout"] },
  { key: "reservation_code", label: "Código da reserva", aliases: ["codigo_reserva"] },
] as const;

export interface CheckinTemplateContext {
  guest_name?: string | null;
  room_password?: string | null;
  category?: string | null;
  locator?: string | null;
  accommodation?: string | null;
  checkin?: string | null;
  checkout?: string | null;
  reservation_code?: string | null;
}

export function buildCheckinTemplateContext(input: {
  guestName?: string | null;
  roomPassword?: string | null;
  categoryName?: string | null;
  locator?: string | null;
  accommodationTitle?: string | null;
  checkinDate?: string | null;
  checkoutDate?: string | null;
  reservationCode?: string | null;
  formatDate?: (isoDate: string) => string;
}): CheckinTemplateContext {
  const formatDate =
    input.formatDate ??
    ((iso) => {
      try {
        return format(parseISO(iso), "dd/MM/yyyy");
      } catch {
        return iso;
      }
    });

  return {
    guest_name: input.guestName?.trim() || null,
    room_password: input.roomPassword?.trim() || null,
    category: input.categoryName?.trim() || null,
    locator: input.locator?.trim() || null,
    accommodation: input.accommodationTitle?.trim() || null,
    checkin: input.checkinDate ? formatDate(input.checkinDate) : null,
    checkout: input.checkoutDate ? formatDate(input.checkoutDate) : null,
    reservation_code: input.reservationCode?.trim() || null,
  };
}

/** Substitui {{chave}}; chaves sem valor viram string vazia (não exibe placeholder literal). */
export function substituteCheckinTemplateVars(
  text: string | null | undefined,
  ctx: CheckinTemplateContext,
): string {
  if (!text) return "";
  const valueByKey = new Map<string, string>();
  for (const def of CHECKIN_TEMPLATE_VARIABLES) {
    const v = ctx[def.key as keyof CheckinTemplateContext];
    const str = v != null && String(v).length > 0 ? String(v) : "";
    valueByKey.set(def.key, str);
    for (const alias of def.aliases) {
      valueByKey.set(alias, str);
    }
  }

  return text.replace(/\{\{\s*([\w\u00C0-\u024F]+)\s*\}\}/gi, (_match, rawKey: string) => {
    const key = rawKey.normalize("NFC");
    return valueByKey.get(key) ?? "";
  });
}