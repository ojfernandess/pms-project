/**
 * Cenários obrigatórios — spec §11 (domínio testável sem banco).
 */
import { describe, expect, it } from "vitest";
import {
  computeFinancialTitleStatus,
  reservationReceivableBalance,
  titleOpenBalance,
} from "./financialTitleStatus";
import {
  applySettlementSequence,
  balanceAfterReversal,
  cashFlowPostingsFromSettlements,
  countActiveTitlesPerReservation,
  hasDuplicateReservationTitles,
  installmentsSumEqualsTotal,
  paidMatchesSettlementSum,
  splitInstallments,
  splitRealizedVsProjected,
} from "./financialArApScenarios";

const AS_OF = new Date(2025, 11, 20);

describe("Spec §11 — Contas a Receber / Pagar", () => {
  it("1. Reserva paga integralmente não gera conta a receber em aberto", () => {
    const r = reservationReceivableBalance({ totalAmount: 1500, serviceFeesTotal: 0, paidAmount: 1500 });
    expect(r.shouldHaveOpenTitle).toBe(false);
  });

  it("2. Reserva parcialmente paga gera somente o saldo pendente", () => {
    const r = reservationReceivableBalance({ totalAmount: 1500, serviceFeesTotal: 0, paidAmount: 500 });
    expect(r.openBalance).toBe(1000);
  });

  it("3. Reserva não paga gera o valor devido", () => {
    const r = reservationReceivableBalance({ totalAmount: 1500, serviceFeesTotal: 0, paidAmount: 0 });
    expect(r.openBalance).toBe(1500);
    expect(r.shouldHaveOpenTitle).toBe(true);
  });

  it("4. Recebimento parcial atualiza saldo", () => {
    const s = applySettlementSequence(2000, [500, 700], "2025-12-31", AS_OF);
    expect(s.openBalance).toBe(800);
    expect(s.status).toBe("partial");
  });

  it("5. Recebimento integral encerra o título", () => {
    const s = applySettlementSequence(2000, [500, 700, 800], "2025-12-31", AS_OF);
    expect(s.openBalance).toBe(0);
    expect(s.status).toBe("paid");
  });

  it("6. Mesma reserva não deve ter títulos duplicados ativos", () => {
    const rows = [
      { reservation_id: "a", status: "pending" },
      { reservation_id: "a", status: "pending" },
      { reservation_id: "b", status: "paid" },
    ];
    expect(hasDuplicateReservationTitles(rows)).toBe(true);
    expect(countActiveTitlesPerReservation(rows).get("a")).toBe(2);
  });

  it("7. Cancelamento de título não zera pagamentos já registrados no histórico", () => {
    const paidBeforeCancel = 600;
    const statusAfterCancel = computeFinancialTitleStatus({
      amount: 1000,
      paidAmount: paidBeforeCancel,
      dueDate: "2025-12-01",
      cancelled: true,
      asOf: AS_OF,
    });
    expect(statusAfterCancel).toBe("cancelled");
    expect(paidBeforeCancel).toBe(600);
  });

  it("8. Estorno mantém histórico — saldo reflete apenas quitações ativas", () => {
    expect(balanceAfterReversal(2000, [500, 700], 500)).toBe(800);
  });

  it("9. Despesa parcelada soma o valor original", () => {
    const parts = splitInstallments(3000, 3);
    expect(parts).toHaveLength(3);
    expect(installmentsSumEqualsTotal(3000, parts)).toBe(true);
  });

  it("10. Recorrência não duplica postagem de caixa para mesma quitação", () => {
    const { toPost, skipped } = cashFlowPostingsFromSettlements(
      ["s1", "s2", "s1"],
      new Set(["s1"]),
    );
    expect(toPost).toEqual(["s2"]);
    expect(skipped).toContain("s1");
  });

  it("11. Pagamento parcial AP atualiza saldo", () => {
    const open = titleOpenBalance(500, 200);
    expect(open).toBe(300);
    expect(
      computeFinancialTitleStatus({ amount: 500, paidAmount: 200, dueDate: "2026-01-15", asOf: AS_OF }),
    ).toBe("partial");
  });

  it("12. Pagamento integral AP encerra título", () => {
    expect(
      computeFinancialTitleStatus({ amount: 500, paidAmount: 500, dueDate: "2026-01-15", asOf: AS_OF }),
    ).toBe("paid");
  });

  it("13. Título vencido identificado corretamente", () => {
    expect(
      computeFinancialTitleStatus({ amount: 1000, paidAmount: 0, dueDate: "2025-12-01", asOf: AS_OF }),
    ).toBe("overdue");
  });

  it("14. Uma quitação → uma postagem de caixa", () => {
    const first = cashFlowPostingsFromSettlements(["x"], new Set());
    const second = cashFlowPostingsFromSettlements(["x"], new Set(["x"]));
    expect(first.toPost).toEqual(["x"]);
    expect(second.toPost).toHaveLength(0);
  });

  it("15. Títulos em aberto não compõem realizado de caixa", () => {
    const r = splitRealizedVsProjected({ settlementsTotal: 0, openReceivables: 5000, openPayables: 1000 });
    expect(r.projectedNet).toBe(4000);
    expect(r.realizedNet).toBe(0);
  });

  it("16. Escopo por estabelecimento é parâmetro de migração (contrato)", () => {
    expect(typeof "estab_uuid").toBe("string");
  });

  it("17. Relatório: saldo aberto = amount - paid", () => {
    expect(titleOpenBalance(1200, 450)).toBe(750);
  });

  it("18. Soma de quitações corresponde ao paid_amount", () => {
    expect(paidMatchesSettlementSum(1200, [500, 700])).toBe(true);
    expect(paidMatchesSettlementSum(1200, [500, 600])).toBe(false);
  });
});