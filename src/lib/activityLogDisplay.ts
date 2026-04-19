import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Chave estável para agrupar logs do mesmo autor (usuário ou sistema). */
export function activityUserKey(log: { user_id: string | null }): string {
  return log.user_id ?? "__system__";
}

const RESERVATION_STATUS: Record<string, string> = {
  pending: "Pendente",
  preregistration: "Pré-registro",
  confirmed: "Confirmada",
  checkedin: "Em hospedagem (check-in)",
  checkedout: "Finalizada (check-out)",
  cancelled: "Cancelada",
  noshow: "No-show",
  blocked: "Bloqueada",
  active: "Ativa",
};

const PAYMENT_STATUS: Record<string, string> = {
  pending: "Pagamento pendente",
  partial: "Parcialmente pago",
  paid: "Pago",
  refunded: "Estornado",
  overdue: "Em atraso",
};

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  payment_status: "Status do pagamento",
  checkin_date: "Check-in",
  checkout_date: "Check-out",
  checkin_time: "Horário de entrada",
  checkout_time: "Horário de saída",
  room_id: "Quarto (ID)",
  category_id: "Categoria (ID)",
  guest_id: "Hóspede (ID)",
  client_id: "Cliente / responsável (ID)",
  total_amount: "Valor total",
  paid_amount: "Valor pago",
  notes: "Observações",
  adults: "Adultos",
  children: "Crianças",
  channel: "Canal",
  reservation_code: "Código da reserva",
  identification_number: "Localizador",
  old_status: "Status anterior",
  new_status: "Novo status",
  checkin_method: "Meio de check-in",
  web_checkin_id: "Pré check-in (ID)",
  completed_at: "Concluído em",
  performed_by: "Realizado por",
  performed_by_type: "Tipo de autor",
  cancellation_reason: "Motivo do cancelamento",
  refund_payments: "Estornar pagamentos",
  room_number: "Número do quarto",
  amount: "Valor",
  payment_method: "Método de pagamento",
  payment_date: "Data do pagamento",
  installments: "Parcelas",
  total_amount_metadata: "Valor (metadado)",
};

function humanizeKey(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function tryFormatDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s) && !/^\d{4}-\d{2}-\d{2}T/.test(s)) return null;
  try {
    const d = parseISO(s);
    if (!isValid(d)) return null;
    if (s.length <= 10) return format(d, "dd/MM/yyyy", { locale: ptBR });
    return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return null;
  }
}

function formatCurrencyBrl(value: unknown): string | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
  if (Number.isNaN(n)) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

const PAYMENT_METHODS: Record<string, string> = {
  deposit: "Depósito",
  pix: "PIX",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  cash: "Dinheiro",
  transfer: "Transferência",
};

function formatScalar(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (key === "status" && typeof value === "string") {
    return RESERVATION_STATUS[value] ?? value;
  }
  if (key === "payment_status" && typeof value === "string") {
    return PAYMENT_STATUS[value] ?? value;
  }
  if (key === "payment_method" && typeof value === "string") {
    return PAYMENT_METHODS[value] ?? value;
  }
  if (
    (key.includes("amount") || key.includes("total") || key === "paid_amount") &&
    (typeof value === "number" || (typeof value === "string" && /^\d/.test(String(value))))
  ) {
    const cur = formatCurrencyBrl(value);
    if (cur) return cur;
  }
  const dateStr = tryFormatDate(value);
  if (dateStr) return dateStr;
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function flattenEntries(
  obj: Record<string, unknown>,
  prefix = "",
): Array<{ key: string; value: unknown }> {
  const out: Array<{ key: string; value: unknown }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      out.push(...flattenEntries(v as Record<string, unknown>, fullKey));
    } else if (Array.isArray(v)) {
      out.push({ key: fullKey, value: JSON.stringify(v) });
    } else {
      out.push({ key: fullKey, value: v });
    }
  }
  return out;
}

export type ActivityValueLine = { label: string; value: string };

/**
 * Converte old_values / new_values (ou metadados) em linhas legíveis para a UI.
 */
export function formatActivityPayloadLines(
  payload: Record<string, unknown> | null | undefined,
): ActivityValueLine[] {
  if (!payload || typeof payload !== "object") return [];
  const flat = flattenEntries(payload as Record<string, unknown>);
  return flat.map(({ key, value }) => {
    const leaf = key.split(".").pop() || key;
    const label = key.includes(".")
      ? key.split(".").map((k) => humanizeKey(k)).join(" → ")
      : humanizeKey(leaf);
    return {
      label,
      value: formatScalar(leaf, value),
    };
  });
}
