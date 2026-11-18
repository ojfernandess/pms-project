export const RECEIVABLE_CATEGORIES = [
  { id: "lodging", label: "Hospedagem" },
  { id: "extras", label: "Extras e consumos" },
  { id: "penalty", label: "Multas" },
  { id: "corporate", label: "Faturamento corporativo" },
  { id: "events", label: "Eventos" },
  { id: "services", label: "Serviços" },
  { id: "deposit", label: "Depósito / caução" },
  { id: "other", label: "Outros" },
] as const;

export type ReceivableCategoryId = (typeof RECEIVABLE_CATEGORIES)[number]["id"];

export const EXPECTED_PAYMENT_METHODS = [
  { id: "pix", label: "PIX" },
  { id: "transfer", label: "Transferência" },
  { id: "cash", label: "Dinheiro" },
  { id: "card", label: "Cartão" },
  { id: "boleto", label: "Boleto" },
  { id: "other", label: "Outro" },
] as const;

export type ExpectedPaymentMethodId = (typeof EXPECTED_PAYMENT_METHODS)[number]["id"];

export function receivableCategoryLabel(id: string | null | undefined): string {
  return RECEIVABLE_CATEGORIES.find((c) => c.id === id)?.label ?? id ?? "—";
}

export function resolveReceivableDebtorLabel(row: {
  debtor_name?: string | null;
  debtor_type?: string | null;
  description?: string;
  metadata?: unknown;
}): string {
  if (row.debtor_name?.trim()) return row.debtor_name.trim();
  const md = (row.metadata ?? {}) as Record<string, unknown>;
  const fromMeta = typeof md.debtor_name === "string" ? md.debtor_name.trim() : "";
  if (fromMeta) return fromMeta;
  const parts = row.description?.split(" - ");
  if (parts && parts.length > 1) return parts.slice(1).join(" - ").trim();
  return row.description || "—";
}