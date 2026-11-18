export type FinancialTitleStatus = "pending" | "partial" | "paid" | "overdue" | "cancelled";

const MONEY_EPSILON = 0.02;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function titleOpenBalance(amount: number, paidAmount: number): number {
  return Math.max(0, roundMoney(amount - paidAmount));
}

export type ComputeTitleStatusInput = {
  amount: number;
  paidAmount: number;
  dueDate: string | Date;
  /** Data de referência para vencimento (padrão: hoje, início do dia local). */
  asOf?: Date;
  cancelled?: boolean;
};

/** Status automático de título a pagar ou a receber (spec §5). */
export function computeFinancialTitleStatus(input: ComputeTitleStatusInput): FinancialTitleStatus {
  if (input.cancelled) return "cancelled";

  const amount = roundMoney(Number(input.amount) || 0);
  const paid = roundMoney(Number(input.paidAmount) || 0);
  const balance = titleOpenBalance(amount, paid);

  if (amount <= MONEY_EPSILON && paid <= MONEY_EPSILON) {
    return "paid";
  }

  if (balance <= MONEY_EPSILON) {
    return "paid";
  }

  if (paid > MONEY_EPSILON && balance > MONEY_EPSILON) {
    const due = normalizeDueDate(input.dueDate);
    const asOf = startOfLocalDay(input.asOf ?? new Date());
    if (due < asOf) return "overdue";
    return "partial";
  }

  const due = normalizeDueDate(input.dueDate);
  const asOf = startOfLocalDay(input.asOf ?? new Date());
  if (due < asOf) return "overdue";
  return "pending";
}

function startOfLocalDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function normalizeDueDate(dueDate: string | Date): Date {
  if (dueDate instanceof Date) {
    return startOfLocalDay(dueDate);
  }
  const raw = String(dueDate).split("T")[0];
  const [y, m, day] = raw.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1);
}

export type ReservationReceivableInput = {
  totalAmount: number;
  serviceFeesTotal: number;
  paidAmount: number;
};

/** Saldo devido da reserva que pode virar título a receber. */
export function reservationReceivableBalance(input: ReservationReceivableInput): {
  grossAmount: number;
  paidAmount: number;
  openBalance: number;
  shouldHaveOpenTitle: boolean;
} {
  const grossAmount = roundMoney((Number(input.totalAmount) || 0) + (Number(input.serviceFeesTotal) || 0));
  const paidAmount = roundMoney(Number(input.paidAmount) || 0);
  const openBalance = titleOpenBalance(grossAmount, paidAmount);
  const shouldHaveOpenTitle = grossAmount > MONEY_EPSILON && openBalance > MONEY_EPSILON;
  return { grossAmount, paidAmount, openBalance, shouldHaveOpenTitle };
}