import { computeFinancialTitleStatus, roundMoney, titleOpenBalance } from "@/lib/financial/financialTitleStatus";

/** Após pagamentos parciais, saldo e status (spec §11 cenários 4–5, 11–12). */
export function applySettlementSequence(
  amount: number,
  settlements: number[],
  dueDate: string,
  asOf?: Date,
): { openBalance: number; status: ReturnType<typeof computeFinancialTitleStatus>; paidTotal: number } {
  const paidTotal = roundMoney(settlements.reduce((s, v) => s + v, 0));
  const openBalance = titleOpenBalance(amount, paidTotal);
  const status = computeFinancialTitleStatus({ amount, paidAmount: paidTotal, dueDate, asOf });
  return { openBalance, status, paidTotal };
}

/** Parcelas devem somar o valor original (cenário 9). */
export function splitInstallments(total: number, count: number): number[] {
  const base = roundMoney(total / count);
  const parts = Array.from({ length: count }, () => base);
  const drift = roundMoney(total - parts.reduce((s, v) => s + v, 0));
  if (parts.length > 0) parts[parts.length - 1] = roundMoney(parts[parts.length - 1] + drift);
  return parts;
}

export function installmentsSumEqualsTotal(total: number, installments: number[]): boolean {
  return Math.abs(roundMoney(installments.reduce((s, v) => s + v, 0)) - roundMoney(total)) <= 0.02;
}

/** Uma reserva → no máximo um título ativo (cenário 6). */
export function countActiveTitlesPerReservation(
  rows: Array<{ reservation_id: string | null; status: string }>,
): Map<string, number> {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    if (!r.reservation_id || r.status === "cancelled") return;
    map.set(r.reservation_id, (map.get(r.reservation_id) || 0) + 1);
  });
  return map;
}

export function hasDuplicateReservationTitles(
  rows: Array<{ reservation_id: string | null; status: string }>,
): boolean {
  return [...countActiveTitlesPerReservation(rows).values()].some((c) => c > 1);
}

/** Estorno: histórico original permanece; saldo sobe (cenário 8). */
export function balanceAfterReversal(
  amount: number,
  activeSettlements: number[],
  reversedAmount: number,
): number {
  const activePaid = roundMoney(activeSettlements.reduce((s, v) => s + v, 0));
  void reversedAmount;
  return titleOpenBalance(amount, activePaid);
}

/** Caixa: uma movimentação por quitação (cenário 14). */
export function cashFlowPostingsFromSettlements(
  settlementIds: string[],
  alreadyPosted: Set<string>,
): { toPost: string[]; skipped: string[] } {
  const toPost: string[] = [];
  const skipped: string[] = [];
  settlementIds.forEach((id) => {
    if (alreadyPosted.has(id)) skipped.push(id);
    else toPost.push(id);
  });
  return { toPost, skipped };
}

/** Projetado vs realizado (cenários 15, 18). */
export function splitRealizedVsProjected(input: {
  settlementsTotal: number;
  openReceivables: number;
  openPayables: number;
}): { realizedNet: number; projectedNet: number; openTitlesShouldNotBeInRealized: boolean } {
  const realizedNet = roundMoney(input.settlementsTotal);
  const projectedNet = roundMoney(input.openReceivables - input.openPayables);
  return {
    realizedNet,
    projectedNet,
    openTitlesShouldNotBeInRealized: projectedNet !== 0 && input.settlementsTotal === 0,
  };
}

/** Soma de quitações = paid_amount do título (cenário 18). */
export function paidMatchesSettlementSum(titlePaid: number, settlementAmounts: number[]): boolean {
  const sum = roundMoney(settlementAmounts.reduce((s, v) => s + v, 0));
  return Math.abs(titlePaid - sum) <= 0.02;
}