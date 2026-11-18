import { describe, expect, it } from "vitest";
import {
  computeFinancialTitleStatus,
  reservationReceivableBalance,
  titleOpenBalance,
} from "@/lib/financial/financialTitleStatus";

describe("reservationReceivableBalance", () => {
  it("reserva paga integralmente não deve gerar título em aberto", () => {
    const r = reservationReceivableBalance({
      totalAmount: 1500,
      serviceFeesTotal: 0,
      paidAmount: 1500,
    });
    expect(r.openBalance).toBe(0);
    expect(r.shouldHaveOpenTitle).toBe(false);
  });

  it("reserva parcial gera saldo pendente", () => {
    const r = reservationReceivableBalance({
      totalAmount: 1500,
      serviceFeesTotal: 0,
      paidAmount: 500,
    });
    expect(r.openBalance).toBe(1000);
    expect(r.shouldHaveOpenTitle).toBe(true);
  });

  it("inclui taxas no valor bruto", () => {
    const r = reservationReceivableBalance({
      totalAmount: 1000,
      serviceFeesTotal: 200,
      paidAmount: 500,
    });
    expect(r.grossAmount).toBe(1200);
    expect(r.openBalance).toBe(700);
  });
});

describe("computeFinancialTitleStatus", () => {
  const asOf = new Date(2025, 11, 20); // 20/12/2025 local

  it("quitado quando saldo zero", () => {
    expect(
      computeFinancialTitleStatus({
        amount: 1000,
        paidAmount: 1000,
        dueDate: "2025-12-10",
        asOf,
      }),
    ).toBe("paid");
  });

  it("parcial antes do vencimento", () => {
    expect(
      computeFinancialTitleStatus({
        amount: 1000,
        paidAmount: 400,
        dueDate: "2025-12-25",
        asOf,
      }),
    ).toBe("partial");
  });

  it("vencido com saldo pendente", () => {
    expect(
      computeFinancialTitleStatus({
        amount: 1000,
        paidAmount: 0,
        dueDate: "2025-12-01",
        asOf,
      }),
    ).toBe("overdue");
  });
});

describe("titleOpenBalance", () => {
  it("não retorna negativo", () => {
    expect(titleOpenBalance(100, 150)).toBe(0);
  });
});