export const EXPENSE_CATEGORIES = [
  { id: "condominium", label: "Condomínio" },
  { id: "electricity", label: "Energia elétrica" },
  { id: "water", label: "Água" },
  { id: "internet", label: "Internet" },
  { id: "maintenance", label: "Manutenção" },
  { id: "cleaning", label: "Limpeza" },
  { id: "laundry", label: "Lavanderia" },
  { id: "cleaning_supplies", label: "Produtos de limpeza" },
  { id: "commissions", label: "Comissões" },
  { id: "payroll", label: "Salários e prestadores" },
  { id: "taxes", label: "Impostos" },
  { id: "marketing", label: "Marketing" },
  { id: "software", label: "Sistemas e softwares" },
  { id: "other", label: "Outros" },
] as const;

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORIES)[number]["id"];

export const RECURRENCE_PATTERNS = [
  { id: "daily", label: "Diária" },
  { id: "weekly", label: "Semanal" },
  { id: "monthly", label: "Mensal" },
  { id: "quarterly", label: "Trimestral" },
  { id: "yearly", label: "Anual" },
  { id: "custom", label: "Personalizada (dias)" },
] as const;

export type RecurrencePatternId = (typeof RECURRENCE_PATTERNS)[number]["id"];

export function expenseCategoryLabel(id: string | null | undefined): string {
  return EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? id ?? "—";
}