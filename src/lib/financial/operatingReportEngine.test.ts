import { describe, it, expect } from "vitest";
import {
  attributionDate,
  bucketKey,
  computeAvailableUnitNights,
  computeDailySalesResult,
  computeOccupancyTotals,
  computeOccupiedUnitNights,
  computePeriodReport,
  dailyLineLabels,
  maintenanceTicketsToNightBlocks,
  mergeNightBlocks,
  occupancyRate,
  enumerateStayNights,
  isCancelledReservation,
  previousThreeCalendarMonths,
  rankMonthsByGross,
  splitRevenue,
  stayNightCount,
  validateReportFilters,
  yoyChange,
  type NormalizedReservation,
} from "./operatingReportEngine";

function res(partial: Partial<NormalizedReservation> & Pick<NormalizedReservation, "id">): NormalizedReservation {
  return {
    establishmentId: "est-1",
    roomId: null,
    status: "confirmed",
    cancelledAt: null,
    checkinDate: "2026-03-10",
    checkoutDate: "2026-03-13",
    createdAtDate: "2026-03-01",
    totalAmount: 300,
    serviceFeesTotal: 30,
    paymentStatus: "pending",
    paidAmount: 0,
    netPayments: 0,
    firstPaymentDate: null,
    channelCommissionPct: 10,
    ownerPct: 50,
    ...partial,
  };
}

describe("operatingReportEngine", () => {
  it("divide receita na ordem comissão → proprietário → líquido", () => {
    const s = splitRevenue(200, 10, 50);
    expect(s.channelCommission).toBe(20);
    expect(s.ownerShare).toBe(90);
    expect(s.net).toBe(90);
  });

  it("enumera noites com check-out exclusivo e day-use = 1", () => {
    expect(enumerateStayNights("2026-03-10", "2026-03-13")).toEqual([
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
    ]);
    expect(stayNightCount("2026-03-10", "2026-03-10")).toBe(1);
    expect(enumerateStayNights("2026-03-10", "2026-03-10")).toEqual(["2026-03-10"]);
  });

  it("semana começa na segunda-feira", () => {
    expect(bucketKey("2026-03-08", "week")).toBe("2026-03-02");
    expect(bucketKey("2026-03-09", "week")).toBe("2026-03-09");
  });

  it("modo diárias inclui não pago e rateia noites no intervalo", () => {
    const report = computePeriodReport({
      reservations: [res({ id: "a", paymentStatus: "pending", paidAmount: 0 })],
      startDate: "2026-03-11",
      endDate: "2026-03-12",
      groupBy: "day",
      billingMode: "stay_nights",
      activeUnitCount: 2,
    });
    expect(report.billing.reservationCount).toBe(1);
    expect(report.billing.billedNights).toBe(2);
    expect(report.billing.gross).toBe(200);
    expect(report.billing.channelCommission).toBeCloseTo(20);
    expect(report.availableNights).toBe(4);
  });

  it("modo pagamento exige pago e usa data de atribuição", () => {
    const unpaid = computePeriodReport({
      reservations: [res({ id: "a" })],
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      groupBy: "month",
      billingMode: "payment_attribution",
      activeUnitCount: 1,
    });
    expect(unpaid.billing.reservationCount).toBe(0);

    const paid = computePeriodReport({
      reservations: [
        res({
          id: "b",
          paymentStatus: "paid",
          paidAmount: 330,
          netPayments: 330,
          firstPaymentDate: "2026-04-02",
          checkinDate: "2026-03-10",
        }),
      ],
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      groupBy: "month",
      billingMode: "payment_attribution",
      activeUnitCount: 1,
    });
    expect(paid.billing.reservationCount).toBe(1);
    expect(paid.billing.gross).toBe(330);
    expect(paid.billing.billedNights).toBe(3);
  });

  it("vendas usam data de criação e a estadia inteira", () => {
    const report = computePeriodReport({
      reservations: [
        res({
          id: "a",
          createdAtDate: "2026-03-05",
          checkinDate: "2026-04-01",
          checkoutDate: "2026-04-04",
          totalAmount: 300,
        }),
      ],
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      groupBy: "month",
      billingMode: "stay_nights",
      activeUnitCount: 1,
    });
    expect(report.sales.salesCount).toBe(1);
    expect(report.sales.salesNights).toBe(3);
    expect(report.sales.salesGross).toBe(300);
    expect(report.billing.gross).toBe(0);
  });

  it("exclui canceladas", () => {
    expect(isCancelledReservation("confirmed", "2026-03-02")).toBe(true);
    const report = computePeriodReport({
      reservations: [res({ id: "a", status: "cancelled", cancelledAt: "2026-03-02" })],
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      groupBy: "month",
      billingMode: "stay_nights",
      activeUnitCount: 1,
    });
    expect(report.billing.reservationCount).toBe(0);
    expect(report.sales.salesCount).toBe(0);
  });

  it("YoY nulo quando base anterior ≤ 0", () => {
    expect(yoyChange(100, 0)).toBeNull();
    expect(yoyChange(110, 100)).toBeCloseTo(10);
  });

  it("janela dos 3 meses anteriores ao mês de início aplicado", () => {
    const months = previousThreeCalendarMonths("2026-03-15");
    expect(months.map((m) => m.key)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(months[0].startDate).toBe("2025-12-01");
    expect(months[0].endDate).toBe("2025-12-31");
  });

  it("ranking: empate total = intermediário", () => {
    const ranks = rankMonthsByGross([
      { key: "a", gross: 10 },
      { key: "b", gross: 10 },
      { key: "c", gross: 10 },
    ]);
    expect(ranks.a).toBe("intermediario");
    expect(ranks.b).toBe("intermediario");
  });

  it("resultado do dia soma estadia inteira das vendas do dia", () => {
    const out = computeDailySalesResult(
      [
        res({
          id: "a",
          createdAtDate: "2026-03-20",
          checkinDate: "2026-04-01",
          checkoutDate: "2026-04-03",
          totalAmount: 200,
        }),
      ],
      "2026-03-20",
      ["est-1"],
    );
    expect(out.nights).toBe(2);
    expect(out.gross).toBe(200);
  });

  it("rótulo unificado usa parênteses", () => {
    expect(dailyLineLabels("GRUPO X", true).nights).toBe("DIÁRIAS (GRUPO X)");
    expect(dailyLineLabels("Hotel", false).revenue).toBe("RECEITA Hotel");
  });

  it("validação de filtros", () => {
    expect(validateReportFilters({ startDate: "2026-03-02", endDate: "2026-03-01", establishmentIds: ["e"] })).toBeTruthy();
    expect(validateReportFilters({ startDate: "2026-01-01", endDate: "2026-01-10", establishmentIds: [] })).toBeTruthy();
    expect(validateReportFilters({ startDate: "2026-01-01", endDate: "2026-01-10", establishmentIds: ["e"] })).toBeNull();
  });

  it("atribuição: pagamento > check-in > reserva", () => {
    expect(attributionDate("2026-04-01", "2026-03-10", "2026-03-01")).toBe("2026-04-01");
    expect(attributionDate(null, "2026-03-10", "2026-03-01")).toBe("2026-03-10");
  });

  it("critério de aceite: venda em out/2026 e faturamento distribuído em 4 meses (R$ 13.950)", () => {
    const longStay = res({
      id: "long",
      createdAtDate: "2026-10-05",
      checkinDate: "2026-10-13",
      checkoutDate: "2027-01-11",
      totalAmount: 13950,
    });
    const reservations = [longStay];
    const salesOct = computePeriodReport({
      reservations,
      startDate: "2026-10-01",
      endDate: "2026-10-31",
      groupBy: "month",
      billingMode: "stay_nights",
      activeUnitCount: 1,
    });
    expect(salesOct.sales.salesGross).toBe(13950);
    expect(salesOct.billing.gross).toBe(2945);

    const nov = computePeriodReport({
      reservations,
      startDate: "2026-11-01",
      endDate: "2026-11-30",
      groupBy: "month",
      billingMode: "stay_nights",
      activeUnitCount: 1,
    });
    expect(nov.sales.salesGross).toBe(0);
    expect(nov.billing.gross).toBe(4650);

    const dec = computePeriodReport({
      reservations,
      startDate: "2026-12-01",
      endDate: "2026-12-31",
      groupBy: "month",
      billingMode: "stay_nights",
      activeUnitCount: 1,
    });
    expect(dec.billing.gross).toBe(4805);

    const jan = computePeriodReport({
      reservations,
      startDate: "2027-01-01",
      endDate: "2027-01-31",
      groupBy: "month",
      billingMode: "stay_nights",
      activeUnitCount: 1,
    });
    expect(jan.billing.gross).toBe(1550);
    expect(salesOct.billing.gross + nov.billing.gross + dec.billing.gross + jan.billing.gross).toBe(13950);
  });

  it("ocupação: unidades distintas por noite e taxa ponderada", () => {
    const units = [
      { id: "r1", establishmentId: "a", isBlocked: false, status: "available" },
      { id: "r2", establishmentId: "a", isBlocked: false, status: "available" },
      { id: "r3", establishmentId: "b", isBlocked: false, status: "available" },
      { id: "r4", establishmentId: "b", isBlocked: false, status: "available" },
      { id: "r5", establishmentId: "b", isBlocked: false, status: "available" },
    ];
    const reservations = [
      res({ id: "1", establishmentId: "a", roomId: "r1", checkinDate: "2026-10-01", checkoutDate: "2026-10-31" }),
      res({ id: "2", establishmentId: "b", roomId: "r3", checkinDate: "2026-10-01", checkoutDate: "2026-10-31" }),
    ];
    const occA = computeOccupancyTotals(reservations, units, [], ["a"], "2026-10-01", "2026-10-30");
    expect(occA.occupiedNights).toBe(30);
    expect(occA.availableNights).toBe(60);
    expect(occA.rate).toBeCloseTo(50);

    const occB = computeOccupancyTotals(reservations, units, [], ["b"], "2026-10-01", "2026-10-30");
    expect(occB.occupiedNights).toBe(30);
    expect(occB.availableNights).toBe(90);
    expect(occB.rate).toBeCloseTo(33.333, 2);

    const consolidated = computeOccupancyTotals(reservations, units, [], ["a", "b"], "2026-10-01", "2026-10-30");
    expect(consolidated.occupiedNights).toBe(60);
    expect(consolidated.availableNights).toBe(150);
    expect(consolidated.rate).toBeCloseTo(40);
    expect(occupancyRate(1650, 2400)).toBeCloseTo(68.75);
  });

  it("manutenção: só desconta os dias do chamado (aberto e concluído)", () => {
    const units = [
      { id: "u1", establishmentId: "a", isBlocked: false, status: "maintenance" },
      { id: "u2", establishmentId: "a", isBlocked: false, status: "available" },
    ];
    const completedBlocks = maintenanceTicketsToNightBlocks(
      [
        {
          roomId: "u1",
          establishmentId: "a",
          status: "completed",
          openedAt: "2026-11-05T10:00:00Z",
          reportedAt: null,
          completedAt: "2026-11-07T18:00:00Z",
          resolvedAt: null,
        },
      ],
      "2026-11-30",
    );
    expect(completedBlocks[0]?.checkinDate).toBe("2026-11-05");
    expect(completedBlocks[0]?.checkoutDate).toBe("2026-11-08");
    const availCompleted = computeAvailableUnitNights(
      units,
      mergeNightBlocks(completedBlocks, []),
      ["a"],
      "2026-11-01",
      "2026-11-10",
    );
    // 10 dias × 2 quartos = 20; u1 indisponível 05, 06, 07 (3 noites)
    expect(availCompleted).toBe(17);

    const openBlocks = maintenanceTicketsToNightBlocks(
      [
        {
          roomId: "u1",
          establishmentId: "a",
          status: "in_progress",
          openedAt: "2026-11-20T08:00:00Z",
          reportedAt: null,
          completedAt: null,
          resolvedAt: null,
        },
      ],
      "2026-11-25",
    );
    const availOpen = computeAvailableUnitNights(units, openBlocks, ["a"], "2026-11-20", "2026-11-25");
    // 6 dias × 2 = 12; u1 bloqueado em 20–25 (6 noites)
    expect(availOpen).toBe(6);
  });

  it("ocupação: canceladas ignoradas, bloqueio reduz disponíveis, sem duplicar quarto", () => {
    const units = [{ id: "u1", establishmentId: "a", isBlocked: false, status: "available" }];
    const reservations = [
      res({ id: "1", establishmentId: "a", roomId: "u1", checkinDate: "2026-11-01", checkoutDate: "2026-11-04" }),
      res({ id: "2", establishmentId: "a", roomId: "u1", checkinDate: "2026-11-02", checkoutDate: "2026-11-05" }),
      res({
        id: "x",
        establishmentId: "a",
        roomId: "u1",
        status: "cancelled",
        cancelledAt: "2026-11-01",
        checkinDate: "2026-11-01",
        checkoutDate: "2026-11-03",
      }),
    ];
    expect(computeOccupiedUnitNights(reservations, ["a"], "2026-11-01", "2026-11-03")).toBe(3);
    const blocks = [
      { roomId: "u1", establishmentId: "a", checkinDate: "2026-11-02", checkoutDate: "2026-11-03" },
    ];
    expect(computeAvailableUnitNights(units, blocks, ["a"], "2026-11-01", "2026-11-03")).toBe(2);
  });
});
