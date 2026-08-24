import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subYears,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export type BillingMode = "stay_nights" | "payment_attribution";
export type GroupBy = "day" | "week" | "month";
export type MonthRank = "melhor" | "intermediario" | "pior";

export type SplitAmounts = {
  gross: number;
  channelCommission: number;
  ownerShare: number;
  net: number;
};

export type MetricTotals = SplitAmounts & {
  billedNights: number;
  reservationCount: number;
};

export type NormalizedReservation = {
  id: string;
  establishmentId: string;
  status: string;
  cancelledAt: string | null;
  checkinDate: string;
  checkoutDate: string;
  createdAtDate: string;
  totalAmount: number;
  serviceFeesTotal: number;
  paymentStatus: string;
  paidAmount: number;
  netPayments: number;
  firstPaymentDate: string | null;
  channelCommissionPct: number;
  ownerPct: number;
};

export const CANCELLED_STATUSES = new Set(["cancelled"]);
export const NON_REVENUE_STATUSES = new Set(["cancelled", "blocked"]);
const PAID_STATUSES = new Set(["paid"]);

export function toDateOnly(value: string): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function isCancelledReservation(status: string, cancelledAt: string | null): boolean {
  if (cancelledAt && String(cancelledAt).trim() !== "") return true;
  return CANCELLED_STATUSES.has(String(status || "").toLowerCase());
}

export function isRevenueStatus(status: string, cancelledAt: string | null): boolean {
  if (isCancelledReservation(status, cancelledAt)) return false;
  return !NON_REVENUE_STATUSES.has(String(status || "").toLowerCase());
}

export function stayNightCount(checkinDate: string, checkoutDate: string): number {
  const nights = differenceInCalendarDays(parseISO(toDateOnly(checkoutDate)), parseISO(toDateOnly(checkinDate)));
  return Math.max(nights, 1);
}

/** Noites da estadia (check-in inclusivo, check-out exclusivo; day-use = 1 noite no check-in). */
export function enumerateStayNights(checkinDate: string, checkoutDate: string): string[] {
  const start = parseISO(toDateOnly(checkinDate));
  const count = stayNightCount(checkinDate, checkoutDate);
  const nights: string[] = [];
  for (let i = 0; i < count; i++) {
    nights.push(format(addDays(start, i), "yyyy-MM-dd"));
  }
  return nights;
}

export function nightRevenueStayMode(totalAmount: number, nights: number): number {
  if (nights <= 0) return 0;
  return Number(totalAmount || 0) / nights;
}

/**
 * 1. comissão = bruto × (% canal / 100)
 * 2. proprietário = (bruto − comissão) × (% proprietário / 100)
 * 3. líquido = bruto − comissão − proprietário
 */
export function splitRevenue(gross: number, channelPct: number, ownerPct: number): SplitAmounts {
  const g = Number(gross) || 0;
  const channelCommission = g * ((Number(channelPct) || 0) / 100);
  const ownerShare = (g - channelCommission) * ((Number(ownerPct) || 0) / 100);
  const net = g - channelCommission - ownerShare;
  return { gross: g, channelCommission, ownerShare, net };
}

export function emptyTotals(): MetricTotals {
  return { gross: 0, channelCommission: 0, ownerShare: 0, net: 0, billedNights: 0, reservationCount: 0 };
}

export function addSplit(target: MetricTotals, split: SplitAmounts, nights: number, reservationId?: string, seen?: Set<string>) {
  target.gross += split.gross;
  target.channelCommission += split.channelCommission;
  target.ownerShare += split.ownerShare;
  target.net += split.net;
  target.billedNights += nights;
  if (reservationId && seen && !seen.has(reservationId)) {
    seen.add(reservationId);
    target.reservationCount += 1;
  } else if (!seen) {
    target.reservationCount += 1;
  }
}

export function adr(gross: number, billedNights: number): number {
  if (!billedNights) return 0;
  return gross / billedNights;
}

export function occupancyPct(billedNights: number, availableNights: number): number {
  if (!availableNights) return 0;
  return (billedNights / availableNights) * 100;
}

export function inclusiveDayCount(startDate: string, endDate: string): number {
  return differenceInCalendarDays(parseISO(toDateOnly(endDate)), parseISO(toDateOnly(startDate))) + 1;
}

export function dateInRange(date: string, startDate: string, endDate: string): boolean {
  const d = toDateOnly(date);
  return d >= toDateOnly(startDate) && d <= toDateOnly(endDate);
}

export function bucketKey(date: string, groupBy: GroupBy): string {
  const d = parseISO(toDateOnly(date));
  if (groupBy === "day") return format(d, "yyyy-MM-dd");
  if (groupBy === "week") return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
  return format(d, "yyyy-MM");
}

export function bucketLabel(key: string, groupBy: GroupBy): string {
  if (groupBy === "month") {
    const [y, m] = key.split("-").map(Number);
    return format(new Date(y, m - 1, 1), "MMM yyyy", { locale: ptBR });
  }
  if (groupBy === "week") {
    const start = parseISO(key);
    const end = addDays(start, 6);
    return `${format(start, "dd/MM")} – ${format(end, "dd/MM")}`;
  }
  return format(parseISO(key), "dd/MM/yyyy");
}

export function bucketRange(key: string, groupBy: GroupBy, clampStart: string, clampEnd: string): { start: string; end: string } {
  let start: Date;
  let end: Date;
  if (groupBy === "month") {
    const [y, m] = key.split("-").map(Number);
    start = startOfMonth(new Date(y, m - 1, 1));
    end = endOfMonth(start);
  } else if (groupBy === "week") {
    start = parseISO(key);
    end = addDays(start, 6);
  } else {
    start = parseISO(key);
    end = start;
  }
  const s = toDateOnly(format(start, "yyyy-MM-dd"));
  const e = toDateOnly(format(end, "yyyy-MM-dd"));
  return {
    start: s < clampStart ? clampStart : s,
    end: e > clampEnd ? clampEnd : e,
  };
}

export function previousYearRange(startDate: string, endDate: string): { startDate: string; endDate: string } {
  return {
    startDate: format(subYears(parseISO(toDateOnly(startDate)), 1), "yyyy-MM-dd"),
    endDate: format(subYears(parseISO(toDateOnly(endDate)), 1), "yyyy-MM-dd"),
  };
}

/** Três meses calendário imediatamente anteriores ao mês de início do período aplicado. */
export function previousThreeCalendarMonths(appliedStartDate: string): Array<{ startDate: string; endDate: string; key: string; label: string }> {
  const startMonth = startOfMonth(parseISO(toDateOnly(appliedStartDate)));
  const months: Array<{ startDate: string; endDate: string; key: string; label: string }> = [];
  for (let i = 3; i >= 1; i--) {
    const m = subMonths(startMonth, i);
    const start = startOfMonth(m);
    const end = endOfMonth(m);
    months.push({
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(end, "yyyy-MM-dd"),
      key: format(start, "yyyy-MM"),
      label: format(start, "MMM yyyy", { locale: ptBR }),
    });
  }
  return months;
}

export function rankMonthsByGross(
  months: Array<{ key: string; gross: number }>,
): Record<string, MonthRank> {
  const ranks: Record<string, MonthRank> = {};
  if (months.length === 0) return ranks;
  const values = months.map((m) => m.gross);
  const allEqual = values.every((v) => v === values[0]);
  if (allEqual) {
    months.forEach((m) => {
      ranks[m.key] = "intermediario";
    });
    return ranks;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  months.forEach((m) => {
    if (m.gross === max) ranks[m.key] = "melhor";
    else if (m.gross === min) ranks[m.key] = "pior";
    else ranks[m.key] = "intermediario";
  });
  return ranks;
}

export function isPaidReservation(paymentStatus: string, netPayments: number, paidAmount: number): boolean {
  if (PAID_STATUSES.has(String(paymentStatus || "").toLowerCase())) return true;
  if ((Number(netPayments) || 0) > 0) return true;
  return (Number(paidAmount) || 0) > 0;
}

export function attributionDate(firstPaymentDate: string | null, checkinDate: string, createdAtDate: string): string {
  if (firstPaymentDate && toDateOnly(firstPaymentDate)) return toDateOnly(firstPaymentDate);
  if (checkinDate) return toDateOnly(checkinDate);
  return toDateOnly(createdAtDate);
}

export function yoyChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function currentCalendarMonth(): { startDate: string; endDate: string } {
  const now = new Date();
  return {
    startDate: format(startOfMonth(now), "yyyy-MM-dd"),
    endDate: format(endOfMonth(now), "yyyy-MM-dd"),
  };
}

export function validateReportFilters(input: {
  startDate: string;
  endDate: string;
  establishmentIds: string[];
}): string | null {
  if (!input.establishmentIds.length) return "Selecione pelo menos um estabelecimento.";
  if (!input.startDate || !input.endDate) return "Informe o intervalo de datas.";
  if (input.startDate > input.endDate) return "A data inicial não pode ser maior que a final.";
  if (inclusiveDayCount(input.startDate, input.endDate) > 366) {
    return "O intervalo máximo é de 366 dias.";
  }
  return null;
}

export type SalesMetrics = {
  salesCount: number;
  salesNights: number;
  salesGross: number;
};

export type PeriodReport = {
  billing: MetricTotals;
  sales: SalesMetrics;
  availableNights: number;
  buckets: Array<{
    key: string;
    label: string;
    startDate: string;
    endDate: string;
    billing: MetricTotals;
    availableNights: number;
  }>;
};

function reservationGrossStayMode(r: NormalizedReservation): number {
  return Number(r.totalAmount) || 0;
}

function reservationGrossPaymentMode(r: NormalizedReservation): number {
  return (Number(r.totalAmount) || 0) + (Number(r.serviceFeesTotal) || 0);
}

export function computePeriodReport(args: {
  reservations: NormalizedReservation[];
  startDate: string;
  endDate: string;
  groupBy: GroupBy;
  billingMode: BillingMode;
  activeUnitCount: number;
}): PeriodReport {
  const { reservations, startDate, endDate, groupBy, billingMode, activeUnitCount } = args;
  const billingSeen = new Set<string>();
  const billing = emptyTotals();
  const salesSeen = new Set<string>();
  const sales: SalesMetrics = { salesCount: 0, salesNights: 0, salesGross: 0 };
  const bucketMap = new Map<string, { billing: MetricTotals; seen: Set<string> }>();

  const ensureBucket = (key: string) => {
    let b = bucketMap.get(key);
    if (!b) {
      b = { billing: emptyTotals(), seen: new Set() };
      bucketMap.set(key, b);
    }
    return b;
  };

  for (const r of reservations) {
    if (!isRevenueStatus(r.status, r.cancelledAt)) continue;

    const nights = enumerateStayNights(r.checkinDate, r.checkoutDate);
    const stayNightRev = nightRevenueStayMode(reservationGrossStayMode(r), nights.length);

    if (dateInRange(r.createdAtDate, startDate, endDate) && !salesSeen.has(r.id)) {
      salesSeen.add(r.id);
      sales.salesCount += 1;
      sales.salesNights += nights.length;
      sales.salesGross += nights.length * stayNightRev;
    }

    if (billingMode === "stay_nights") {
      const nightsInRange = nights.filter((n) => dateInRange(n, startDate, endDate));
      if (nightsInRange.length === 0) continue;
      for (const night of nightsInRange) {
        const split = splitRevenue(stayNightRev, r.channelCommissionPct, r.ownerPct);
        addSplit(billing, split, 1, r.id, billingSeen);
        const b = ensureBucket(bucketKey(night, groupBy));
        addSplit(b.billing, split, 1, r.id, b.seen);
      }
    } else {
      if (!isPaidReservation(r.paymentStatus, r.netPayments, r.paidAmount)) continue;
      const attr = attributionDate(r.firstPaymentDate, r.checkinDate, r.createdAtDate);
      if (!dateInRange(attr, startDate, endDate)) continue;
      const billedNights = nights.length;
      const split = splitRevenue(reservationGrossPaymentMode(r), r.channelCommissionPct, r.ownerPct);
      addSplit(billing, split, billedNights, r.id, billingSeen);
      const b = ensureBucket(bucketKey(attr, groupBy));
      addSplit(b.billing, split, billedNights, r.id, b.seen);
    }
  }

  const availableNights = activeUnitCount * inclusiveDayCount(startDate, endDate);
  const keys = [...bucketMap.keys()].sort();
  const buckets = keys.map((key) => {
    const range = bucketRange(key, groupBy, startDate, endDate);
    const days = inclusiveDayCount(range.start, range.end);
    return {
      key,
      label: bucketLabel(key, groupBy),
      startDate: range.start,
      endDate: range.end,
      billing: bucketMap.get(key)!.billing,
      availableNights: activeUnitCount * days,
    };
  });

  return { billing, sales, availableNights, buckets };
}

export function computeDailySalesResult(
  reservations: NormalizedReservation[],
  day: string,
  establishmentIds: string[],
): { nights: number; gross: number } {
  const ids = new Set(establishmentIds);
  let nights = 0;
  let gross = 0;
  for (const r of reservations) {
    if (!isRevenueStatus(r.status, r.cancelledAt)) continue;
    if (!ids.has(r.establishmentId)) continue;
    if (toDateOnly(r.createdAtDate) !== toDateOnly(day)) continue;
    const stay = enumerateStayNights(r.checkinDate, r.checkoutDate);
    const perNight = nightRevenueStayMode(reservationGrossStayMode(r), stay.length);
    nights += stay.length;
    gross += stay.length * perNight;
  }
  return { nights, gross };
}

export function dailyLineLabels(label: string, isUnified: boolean): { nights: string; revenue: string } {
  const name = (label || "").trim() || "Linha";
  if (isUnified) {
    return {
      nights: `DIÁRIAS (${name})`,
      revenue: `RECEITA (${name})`,
    };
  }
  return {
    nights: `DIÁRIAS ${name}`,
    revenue: `RECEITA ${name}`,
  };
}
