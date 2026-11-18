import { allocateCleaningFeePerNight } from "@/lib/cleaningFeeConfig";
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
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

export type CleaningFeeReportMode = "lodging_only" | "with_cleaning_allocated";

export type NormalizedReservation = {
  id: string;
  establishmentId: string;
  roomId: string | null;
  status: string;
  cancelledAt: string | null;
  checkinDate: string;
  checkoutDate: string;
  createdAtDate: string;
  totalAmount: number;
  serviceFeesTotal: number;
  cleaningFeeTotal: number;
  parkingFeeTotal: number;
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

/** Distribui o valor da reserva em centavos; resto na última diária (doc. Dashboard Vendas e Faturamento). */
export function distributeNightAmounts(totalAmount: number, nightCount: number): number[] {
  if (nightCount <= 0) return [];
  const totalCents = Math.round((Number(totalAmount) || 0) * 100);
  const baseCents = Math.floor(totalCents / nightCount);
  const remainder = totalCents - baseCents * nightCount;
  return Array.from({ length: nightCount }, (_, i) => (baseCents + (i === nightCount - 1 ? remainder : 0)) / 100);
}

export function nightAmountsForStay(totalAmount: number, checkinDate: string, checkoutDate: string): Map<string, number> {
  const nights = enumerateStayNights(checkinDate, checkoutDate);
  const amounts = distributeNightAmounts(totalAmount, nights.length);
  const map = new Map<string, number>();
  nights.forEach((d, i) => map.set(d, amounts[i] ?? 0));
  return map;
}

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "this_month"
  | "prev_month"
  | "this_year"
  | "custom";

export function resolvePeriodPreset(
  preset: PeriodPreset,
  custom?: { startDate: string; endDate: string },
): { startDate: string; endDate: string } {
  const today = toDateOnly(format(new Date(), "yyyy-MM-dd"));
  if (preset === "today") return { startDate: today, endDate: today };
  if (preset === "yesterday") {
    const y = format(subDays(parseISO(today), 1), "yyyy-MM-dd");
    return { startDate: y, endDate: y };
  }
  if (preset === "last7") {
    return { startDate: format(subDays(parseISO(today), 6), "yyyy-MM-dd"), endDate: today };
  }
  if (preset === "last30") {
    return { startDate: format(subDays(parseISO(today), 29), "yyyy-MM-dd"), endDate: today };
  }
  if (preset === "this_month") {
    const d = parseISO(today);
    return { startDate: format(startOfMonth(d), "yyyy-MM-dd"), endDate: format(endOfMonth(d), "yyyy-MM-dd") };
  }
  if (preset === "prev_month") {
    const d = subMonths(parseISO(today), 1);
    return { startDate: format(startOfMonth(d), "yyyy-MM-dd"), endDate: format(endOfMonth(d), "yyyy-MM-dd") };
  }
  if (preset === "this_year") {
    const d = parseISO(today);
    return { startDate: format(startOfYear(d), "yyyy-MM-dd"), endDate: format(endOfYear(d), "yyyy-MM-dd") };
  }
  return {
    startDate: custom?.startDate || today,
    endDate: custom?.endDate || today,
  };
}

export function monthsSpanningRange(
  startDate: string,
  endDate: string,
): Array<{ key: string; label: string; startDate: string; endDate: string }> {
  const out: Array<{ key: string; label: string; startDate: string; endDate: string }> = [];
  let cursor = startOfMonth(parseISO(toDateOnly(startDate)));
  const end = endOfMonth(parseISO(toDateOnly(endDate)));
  while (cursor <= end) {
    const start = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    out.push({
      key: format(start, "yyyy-MM"),
      label: format(start, "MMMM yyyy", { locale: ptBR }),
      startDate: format(start, "yyyy-MM-dd"),
      endDate: format(monthEnd, "yyyy-MM-dd"),
    });
    cursor = addMonths(cursor, 1);
  }
  return out;
}

export type MonthlySalesBillingRow = {
  key: string;
  label: string;
  salesGross: number;
  billingGross: number;
};

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

export function occupancyPct(occupiedNights: number, availableNights: number): number {
  if (!availableNights) return 0;
  return (occupiedNights / availableNights) * 100;
}

/** Taxa ponderada; `null` quando não há capacidade disponível (evita divisão por zero na UI). */
export function occupancyRate(occupiedNights: number, availableNights: number): number | null {
  if (!availableNights) return null;
  return (occupiedNights / availableNights) * 100;
}

export type LodgingUnitSnapshot = {
  id: string;
  establishmentId: string;
  isBlocked: boolean;
  status: string;
};

export type OccupancyNightBlock = {
  roomId: string;
  establishmentId: string;
  checkinDate: string;
  checkoutDate: string;
};

export type OccupancyTotals = {
  occupiedNights: number;
  availableNights: number;
  rate: number | null;
};

export type EstablishmentReportRow = {
  establishmentId: string;
  name: string;
  reservationCount: number;
  billedNights: number;
  occupiedNights: number;
  availableNights: number;
  occupancyRate: number | null;
  receitaGross: number;
  periodBillingGross: number;
  adr: number;
  net: number;
};

export function enumerateInclusiveDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  let cursor = parseISO(toDateOnly(startDate));
  const end = parseISO(toDateOnly(endDate));
  while (cursor <= end) {
    days.push(format(cursor, "yyyy-MM-dd"));
    cursor = addDays(cursor, 1);
  }
  return days;
}

/** Indisponibilidade permanente (interdição cadastral), não confundir com manutenção temporária. */
export function isRoomUnavailableStatic(unit: LodgingUnitSnapshot): boolean {
  return unit.isBlocked;
}

export type MaintenanceTicketSnapshot = {
  roomId: string;
  establishmentId: string;
  status: string;
  openedAt: string;
  reportedAt: string | null;
  completedAt: string | null;
  resolvedAt: string | null;
};

const MAINTENANCE_ACTIVE_STATUSES = new Set(["open", "in_progress"]);

/**
 * Converte chamados de manutenção em bloqueios por noite (check-out exclusivo no encerramento).
 * Abertos / em progresso: até o último dia de `capEndDate`. Concluídos: do abertura até o dia da conclusão.
 */
export function maintenanceTicketsToNightBlocks(
  tickets: MaintenanceTicketSnapshot[],
  capEndDate: string,
): OccupancyNightBlock[] {
  const cap = toDateOnly(capEndDate);
  const blocks: OccupancyNightBlock[] = [];
  for (const t of tickets) {
    const status = String(t.status || "").toLowerCase();
    if (status === "cancelled" || !t.roomId) continue;

    const checkinDate = toDateOnly(t.openedAt || t.reportedAt || "");
    if (!checkinDate) continue;

    let checkoutDate: string;
    if (MAINTENANCE_ACTIVE_STATUSES.has(status)) {
      checkoutDate = format(addDays(parseISO(cap), 1), "yyyy-MM-dd");
    } else if (status === "completed") {
      const doneDay = toDateOnly(t.completedAt || t.resolvedAt || "");
      if (!doneDay) continue;
      checkoutDate = format(addDays(parseISO(doneDay), 1), "yyyy-MM-dd");
    } else {
      continue;
    }

    if (checkoutDate <= checkinDate) continue;

    blocks.push({
      roomId: t.roomId,
      establishmentId: t.establishmentId,
      checkinDate,
      checkoutDate,
    });
  }
  return blocks;
}

export function mergeNightBlocks(...groups: OccupancyNightBlock[][]): OccupancyNightBlock[] {
  return groups.flat();
}

function blockedRoomNightsInRange(
  blocks: OccupancyNightBlock[],
  startDate: string,
  endDate: string,
  establishmentFilter?: Set<string>,
): Set<string> {
  const keys = new Set<string>();
  for (const b of blocks) {
    if (establishmentFilter && !establishmentFilter.has(b.establishmentId)) continue;
    const nights = enumerateStayNights(b.checkinDate, b.checkoutDate).filter((n) => dateInRange(n, startDate, endDate));
    for (const night of nights) {
      keys.add(`${b.roomId}|${night}`);
    }
  }
  return keys;
}

/** Diárias ocupadas = unidades distintas por noite (check-out exclusivo). */
export function computeOccupiedUnitNights(
  reservations: NormalizedReservation[],
  establishmentIds: string[],
  startDate: string,
  endDate: string,
): number {
  const allowed = new Set(establishmentIds);
  const keys = new Set<string>();
  for (const r of reservations) {
    if (!allowed.has(r.establishmentId)) continue;
    if (!isRevenueStatus(r.status, r.cancelledAt)) continue;
    const nights = enumerateStayNights(r.checkinDate, r.checkoutDate).filter((n) => dateInRange(n, startDate, endDate));
    for (const night of nights) {
      const key = r.roomId ? `${r.roomId}|${night}` : `res:${r.id}|${night}`;
      keys.add(key);
    }
  }
  return keys.size;
}

export function computeAvailableUnitNights(
  units: LodgingUnitSnapshot[],
  nightBlocks: OccupancyNightBlock[],
  establishmentIds: string[],
  startDate: string,
  endDate: string,
): number {
  const allowed = new Set(establishmentIds);
  const scopedUnits = units.filter((u) => allowed.has(u.establishmentId));
  const blocked = blockedRoomNightsInRange(nightBlocks, startDate, endDate, allowed);
  let total = 0;
  for (const day of enumerateInclusiveDays(startDate, endDate)) {
    for (const unit of scopedUnits) {
      if (isRoomUnavailableStatic(unit)) continue;
      if (blocked.has(`${unit.id}|${day}`)) continue;
      total += 1;
    }
  }
  return total;
}

export function computeOccupancyTotals(
  reservations: NormalizedReservation[],
  units: LodgingUnitSnapshot[],
  nightBlocks: OccupancyNightBlock[],
  establishmentIds: string[],
  startDate: string,
  endDate: string,
): OccupancyTotals {
  const occupiedNights = computeOccupiedUnitNights(reservations, establishmentIds, startDate, endDate);
  const availableNights = computeAvailableUnitNights(units, nightBlocks, establishmentIds, startDate, endDate);
  return {
    occupiedNights,
    availableNights,
    rate: occupancyRate(occupiedNights, availableNights),
  };
}

export function computeEstablishmentReportRows(args: {
  reservations: NormalizedReservation[];
  units: LodgingUnitSnapshot[];
  nightBlocks: OccupancyNightBlock[];
  establishmentIds: string[];
  establishmentNames: Map<string, string>;
  startDate: string;
  endDate: string;
  billingMode: BillingMode;
  groupBy: GroupBy;
  cleaningFeeReportMode?: CleaningFeeReportMode;
}): EstablishmentReportRow[] {
  const {
    reservations,
    units,
    nightBlocks,
    establishmentIds,
    establishmentNames,
    startDate,
    endDate,
    billingMode,
    groupBy,
    cleaningFeeReportMode = "lodging_only",
  } = args;
  const activeUnitCountByEst = new Map<string, number>();
  for (const u of units) {
    if (isRoomUnavailableStatic(u)) continue;
    activeUnitCountByEst.set(u.establishmentId, (activeUnitCountByEst.get(u.establishmentId) || 0) + 1);
  }

  return establishmentIds.map((establishmentId) => {
    const estReservations = reservations.filter((r) => r.establishmentId === establishmentId);
    const unitCount = activeUnitCountByEst.get(establishmentId) || 0;
    const report = computePeriodReport({
      reservations: estReservations,
      startDate,
      endDate,
      groupBy,
      billingMode,
      activeUnitCount: unitCount,
      cleaningFeeReportMode,
    });
    const occupancy = computeOccupancyTotals(
      reservations,
      units,
      nightBlocks,
      [establishmentId],
      startDate,
      endDate,
    );
    return {
      establishmentId,
      name: establishmentNames.get(establishmentId) || establishmentId,
      reservationCount: report.billing.reservationCount,
      billedNights: report.billing.billedNights,
      occupiedNights: occupancy.occupiedNights,
      availableNights: occupancy.availableNights,
      occupancyRate: occupancy.rate,
      receitaGross: report.sales.salesGross,
      periodBillingGross: report.billing.gross,
      adr: adr(report.billing.gross, report.billing.billedNights),
      net: report.billing.net,
    };
  });
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

/** Taxas extras rateadas por noite da estadia (limpeza sob filtro; estacionamento sempre quando lançado). */
function lodgingExtraFeesPerNight(
  nights: string[],
  fees: { cleaningFeeTotal: number; parkingFeeTotal: number },
): Map<string, number> {
  const map = new Map<string, number>();
  if (nights.length === 0) return map;

  const addAllocated = (feeTotal: number) => {
    if (feeTotal <= 0) return;
    const parts = allocateCleaningFeePerNight(feeTotal, nights.length);
    nights.forEach((d, i) => {
      map.set(d, (map.get(d) ?? 0) + (parts[i] ?? 0));
    });
  };

  addAllocated(Number(fees.cleaningFeeTotal) || 0);
  addAllocated(Number(fees.parkingFeeTotal) || 0);
  return map;
}

export function computePeriodReport(args: {
  reservations: NormalizedReservation[];
  startDate: string;
  endDate: string;
  groupBy: GroupBy;
  billingMode: BillingMode;
  activeUnitCount: number;
  cleaningFeeReportMode?: CleaningFeeReportMode;
}): PeriodReport {
  const {
    reservations,
    startDate,
    endDate,
    groupBy,
    billingMode,
    activeUnitCount,
    cleaningFeeReportMode = "lodging_only",
  } = args;
  const includeCleaningInSales = cleaningFeeReportMode === "with_cleaning_allocated";
  const allocateCleaningInBilling = cleaningFeeReportMode === "with_cleaning_allocated";
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
    const nightAmounts = nightAmountsForStay(reservationGrossStayMode(r), r.checkinDate, r.checkoutDate);
    const extraFeesPerNight = lodgingExtraFeesPerNight(nights, {
      cleaningFeeTotal: allocateCleaningInBilling ? r.cleaningFeeTotal : 0,
      parkingFeeTotal: r.parkingFeeTotal,
    });

    if (dateInRange(r.createdAtDate, startDate, endDate) && !salesSeen.has(r.id)) {
      salesSeen.add(r.id);
      sales.salesCount += 1;
      sales.salesNights += nights.length;
      let saleGross = reservationGrossStayMode(r);
      if (includeCleaningInSales) saleGross += Number(r.cleaningFeeTotal) || 0;
      saleGross += Number(r.parkingFeeTotal) || 0;
      sales.salesGross += saleGross;
    }

    if (billingMode === "stay_nights") {
      const nightsInRange = nights.filter((n) => dateInRange(n, startDate, endDate));
      if (nightsInRange.length === 0) continue;
      for (const night of nightsInRange) {
        const nightGross = (nightAmounts.get(night) ?? 0) + (extraFeesPerNight.get(night) ?? 0);
        const split = splitRevenue(nightGross, r.channelCommissionPct, r.ownerPct);
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

export function computeMonthlySalesBillingTable(
  reservations: NormalizedReservation[],
  rangeStart: string,
  rangeEnd: string,
  billingMode: BillingMode,
  cleaningFeeReportMode: CleaningFeeReportMode = "lodging_only",
): MonthlySalesBillingRow[] {
  const allMonths = monthsSpanningRange(toDateOnly(rangeStart), toDateOnly(rangeEnd));

  return allMonths.map((m) => {
    const slice = computePeriodReport({
      reservations,
      startDate: m.startDate,
      endDate: m.endDate,
      groupBy: "month",
      billingMode,
      activeUnitCount: 0,
      cleaningFeeReportMode,
    });
    return {
      key: m.key,
      label: m.label,
      salesGross: slice.sales.salesGross,
      billingGross: slice.billing.gross,
    };
  });
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
    nights += enumerateStayNights(r.checkinDate, r.checkoutDate).length;
    gross += reservationGrossStayMode(r);
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

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Reserva Confirmada",
  pending: "Pendente",
  checkedin: "Check-in realizado",
  cancelled: "Cancelada",
  blocked: "Bloqueio",
  preregistration: "Pré-reserva",
  unpaid: "Não paga",
  noshow: "No-show",
};

export function reservationStatusLabel(status: string): string {
  const key = String(status || "").toLowerCase();
  return STATUS_LABELS[key] || status;
}

export type AnalyticReservation = NormalizedReservation & {
  reservationCode: string;
  identificationNumber: string | null;
  displayReservation: string;
  guestName: string;
  companyName: string;
  channelLabel: string;
  establishmentName: string;
  establishmentNumericId: number | null;
  rateCodeLabel: string;
  rateTypeLabel: string;
  createdAtIso: string;
  checkinTime: string | null;
  checkoutTime: string | null;
};

export type SalesAnalyticRow = {
  key: string;
  establishmentName: string;
  reservationDisplay: string;
  createdAtLabel: string;
  checkinLabel: string;
  checkoutLabel: string;
  statusLabel: string;
  companyOrChannel: string;
  nights: number;
  gross: number;
  adr: number;
  net: number;
};

export type BillingAnalyticRow = {
  key: string;
  establishmentLabel: string;
  reservationDisplay: string;
  identificationNumber: string;
  guestName: string;
  nightDate: string;
  nightDateLabel: string;
  rateCodeLabel: string;
  rateTypeLabel: string;
  originLabel: string;
  createdAtLabel: string;
  checkinLabel: string;
  checkoutLabel: string;
  statusLabel: string;
  companyName: string;
  nightAttributedAmount: number;
  periodAmount: number;
};

export function formatAnalyticDateTime(date: string, time?: string | null, createdAtIso?: string): string {
  if (createdAtIso && !date) {
    return format(parseISO(createdAtIso), "dd/MM/yyyy HH:mm");
  }
  const day = format(parseISO(toDateOnly(date)), "dd/MM/yyyy");
  if (time && String(time).trim()) {
    const t = String(time).slice(0, 8);
    const hm = t.length >= 5 ? t.slice(0, 5) : t;
    return `${day} ${hm}`;
  }
  return `${day} 00:00`;
}

export function formatAnalyticNightDate(date: string): string {
  return format(parseISO(toDateOnly(date)), "dd/MM/yyyy");
}

function splitReservationNet(
  r: AnalyticReservation,
  cleaningFeeReportMode: CleaningFeeReportMode = "lodging_only",
): { gross: number; net: number } {
  let gross = Number(r.totalAmount) || 0;
  gross += Number(r.parkingFeeTotal) || 0;
  if (cleaningFeeReportMode === "with_cleaning_allocated") gross += Number(r.cleaningFeeTotal) || 0;
  const split = splitRevenue(gross, r.channelCommissionPct, r.ownerPct);
  return { gross, net: split.net };
}

export function computeSalesAnalyticRows(
  reservations: AnalyticReservation[],
  startDate: string,
  endDate: string,
  cleaningFeeReportMode: CleaningFeeReportMode = "lodging_only",
): SalesAnalyticRow[] {
  const rows: SalesAnalyticRow[] = [];
  for (const r of reservations) {
    if (!isRevenueStatus(r.status, r.cancelledAt)) continue;
    if (!dateInRange(r.createdAtDate, startDate, endDate)) continue;
    const nights = enumerateStayNights(r.checkinDate, r.checkoutDate).length;
    const { gross, net } = splitReservationNet(r, cleaningFeeReportMode);
    rows.push({
      key: r.id,
      establishmentName: r.establishmentName,
      reservationDisplay: r.displayReservation,
      createdAtLabel: formatAnalyticDateTime(r.createdAtDate, null, r.createdAtIso),
      checkinLabel: formatAnalyticDateTime(r.checkinDate, r.checkinTime),
      checkoutLabel: formatAnalyticDateTime(r.checkoutDate, r.checkoutTime),
      statusLabel: reservationStatusLabel(r.status),
      companyOrChannel: r.channelLabel,
      nights,
      gross,
      adr: adr(gross, nights),
      net,
    });
  }
  return rows.sort((a, b) => b.createdAtLabel.localeCompare(a.createdAtLabel));
}

export function computeBillingAnalyticRows(
  reservations: AnalyticReservation[],
  startDate: string,
  endDate: string,
  cleaningFeeReportMode: CleaningFeeReportMode = "lodging_only",
): BillingAnalyticRow[] {
  const rows: BillingAnalyticRow[] = [];
  const allocateCleaning = cleaningFeeReportMode === "with_cleaning_allocated";
  for (const r of reservations) {
    if (!isRevenueStatus(r.status, r.cancelledAt)) continue;
    const nights = enumerateStayNights(r.checkinDate, r.checkoutDate);
    const nightAmounts = nightAmountsForStay(Number(r.totalAmount) || 0, r.checkinDate, r.checkoutDate);
    const extraFeesPerNight = lodgingExtraFeesPerNight(nights, {
      cleaningFeeTotal: allocateCleaning ? r.cleaningFeeTotal : 0,
      parkingFeeTotal: r.parkingFeeTotal,
    });
    const estLabel =
      r.establishmentNumericId != null
        ? `${r.establishmentName} (#${r.establishmentNumericId})`
        : r.establishmentName;
    const originLabel =
      r.rateTypeLabel === "Pacote" ? "Rateio de pacote" : r.displayReservation || r.reservationCode;
    const idNum = r.identificationNumber || "—";

    for (const night of nights) {
      if (!dateInRange(night, startDate, endDate)) continue;
      const amount = (nightAmounts.get(night) ?? 0) + (extraFeesPerNight.get(night) ?? 0);
      rows.push({
        key: `${r.id}|${night}`,
        establishmentLabel: estLabel,
        reservationDisplay: r.displayReservation,
        identificationNumber: idNum,
        guestName: r.guestName,
        nightDate: night,
        nightDateLabel: formatAnalyticNightDate(night),
        rateCodeLabel: r.rateCodeLabel,
        rateTypeLabel: r.rateTypeLabel,
        originLabel,
        createdAtLabel: formatAnalyticDateTime(r.createdAtDate, null, r.createdAtIso),
        checkinLabel: formatAnalyticDateTime(r.checkinDate, r.checkinTime),
        checkoutLabel: formatAnalyticDateTime(r.checkoutDate, r.checkoutTime),
        statusLabel: reservationStatusLabel(r.status),
        companyName: r.companyName,
        nightAttributedAmount: amount,
        periodAmount: amount,
      });
    }
  }
  return rows.sort((a, b) => {
    const c = a.nightDate.localeCompare(b.nightDate);
    if (c !== 0) return c;
    return a.reservationDisplay.localeCompare(b.reservationDisplay);
  });
}
