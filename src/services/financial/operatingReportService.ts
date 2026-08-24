import { supabase } from "@/integrations/supabase/client";
import {
  computeDailySalesResult,
  computePeriodReport,
  dailyLineLabels,
  occupancyPct,
  previousThreeCalendarMonths,
  previousYearRange,
  rankMonthsByGross,
  toDateOnly,
  yoyChange,
  type BillingMode,
  type GroupBy,
  type MetricTotals,
  type MonthRank,
  type NormalizedReservation,
  type PeriodReport,
  adr,
} from "@/lib/financial/operatingReportEngine";

const RESERVATION_SELECT = `
  id,
  establishment_id,
  reservation_code,
  status,
  cancelled_at,
  checkin_date,
  checkout_date,
  created_at,
  total_amount,
  paid_amount,
  payment_status,
  channel,
  room_id,
  category_id,
  reservation_service_fees(amount, quantity)
`;

type RawReservation = {
  id: string;
  establishment_id: string;
  reservation_code?: string;
  status: string;
  cancelled_at: string | null;
  checkin_date: string;
  checkout_date: string;
  created_at: string;
  total_amount: number;
  paid_amount: number;
  payment_status: string;
  channel: string | null;
  room_id: string | null;
  category_id: string | null;
  reservation_service_fees?: Array<{ amount?: number; quantity?: number }>;
};

async function fetchAllRows<T>(build: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const page = 1000;
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    const chunk = data || [];
    all.push(...chunk);
    if (chunk.length < page) break;
    from += page;
  }
  return all;
}

function serviceFeesTotal(fees?: Array<{ amount?: number; quantity?: number }>): number {
  return (fees || []).reduce((sum, f) => sum + Number(f.amount || 0) * Number(f.quantity ?? 1), 0);
}

function isLodgingUnit(room: {
  exclude_from_billing?: boolean | null;
  hide_from_map?: boolean | null;
  is_blocked?: boolean | null;
  category_type?: string | null;
}): boolean {
  if (room.exclude_from_billing) return false;
  if (room.hide_from_map) return false;
  if (room.is_blocked) return false;
  const type = String(room.category_type || "").toLowerCase();
  if (type.includes("comum") || type.includes("common_area") || type === "common") return false;
  return true;
}

function matchChannelCommission(
  reservation: RawReservation,
  otaByReservation: Map<string, number>,
  channels: Array<{ name?: string | null; commission_rate?: number | null }>,
): number {
  const fromOta = otaByReservation.get(reservation.id);
  if (fromOta != null) return Number(fromOta) || 0;
  const ch = String(reservation.channel || "").trim().toLowerCase();
  if (!ch || ch === "direct" || ch === "direto" || ch === "balcão" || ch === "balcao") return 0;
  const found = channels.find((c) => String(c.name || "").trim().toLowerCase() === ch);
  return Number(found?.commission_rate) || 0;
}

async function loadReservationsOverlapping(
  establishmentIds: string[],
  startDate: string,
  endDate: string,
): Promise<RawReservation[]> {
  if (!establishmentIds.length) return [];
  const unique = new Map<string, RawReservation>();

  const createdRows = await fetchAllRows<RawReservation>(async (from, to) => {
    const { data, error } = await supabase
      .from("reservations")
      .select(RESERVATION_SELECT)
      .in("establishment_id", establishmentIds)
      .gte("created_at", `${startDate}T00:00:00`)
      .lte("created_at", `${endDate}T23:59:59.999`)
      .range(from, to);
    if (error) return { data: null, error };
    return { data: (data || []) as RawReservation[], error: null };
  });
  for (const row of createdRows) unique.set(row.id, row);

  const overlapRows = await fetchAllRows<RawReservation>(async (from, to) => {
    const { data, error } = await supabase
      .from("reservations")
      .select(RESERVATION_SELECT)
      .in("establishment_id", establishmentIds)
      .lte("checkin_date", endDate)
      .gt("checkout_date", startDate)
      .range(from, to);
    if (error) return { data: null, error };
    return { data: (data || []) as RawReservation[], error: null };
  });
  for (const row of overlapRows) unique.set(row.id, row);

  return [...unique.values()];
}

async function loadPaymentsAndRefunds(
  reservationIds: string[],
  establishmentIds: string[],
  extraPaymentStart?: string,
  extraPaymentEnd?: string,
) {
  const netByReservation = new Map<string, number>();
  const firstPaymentByReservation = new Map<string, string>();
  const extraReservationIds: string[] = [];

  const payments: any[] = [];

  if (reservationIds.length) {
    for (let i = 0; i < reservationIds.length; i += 200) {
      const chunk = reservationIds.slice(i, i + 200);
      const { data, error } = await supabase
        .from("payments")
        .select("id, reservation_id, amount, payment_date, establishment_id")
        .in("reservation_id", chunk);
      if (error) throw new Error(error.message);
      payments.push(...(data || []));
    }
  }

  if (extraPaymentStart && extraPaymentEnd && establishmentIds.length) {
    const { data, error } = await supabase
      .from("payments")
      .select("id, reservation_id, amount, payment_date, establishment_id")
      .in("establishment_id", establishmentIds)
      .gte("payment_date", `${extraPaymentStart}T00:00:00`)
      .lte("payment_date", `${extraPaymentEnd}T23:59:59.999`);
    if (error) throw new Error(error.message);
    const known = new Set(payments.map((p) => p.id));
    for (const p of data || []) {
      if (!known.has((p as any).id)) payments.push(p);
    }
  }

  const paymentIds = payments.map((p) => p.id).filter(Boolean);
  const refundedByPayment = new Map<string, number>();
  for (let i = 0; i < paymentIds.length; i += 200) {
    const chunk = paymentIds.slice(i, i + 200);
    const { data: refunds, error: refError } = await supabase
      .from("financial_refunds")
      .select("payment_id, amount, status")
      .in("payment_id", chunk)
      .in("status", ["processed", "approved"]);
    if (refError) break;
    for (const r of refunds || []) {
      const pid = String((r as any).payment_id || "");
      refundedByPayment.set(pid, (refundedByPayment.get(pid) || 0) + Number((r as any).amount || 0));
    }
  }

  const knownReservations = new Set(reservationIds);
  for (const p of payments) {
    const rid = String(p.reservation_id || "");
    if (!rid) continue;
    const pd = toDateOnly(p.payment_date);
    if (!knownReservations.has(rid)) {
      if (extraPaymentStart && extraPaymentEnd && pd >= extraPaymentStart && pd <= extraPaymentEnd) {
        extraReservationIds.push(rid);
      } else {
        continue;
      }
    }
    const net = Number(p.amount || 0) - (refundedByPayment.get(p.id) || 0);
    netByReservation.set(rid, (netByReservation.get(rid) || 0) + net);
    if (pd && net > 0) {
      const prev = firstPaymentByReservation.get(rid);
      if (!prev || pd < prev) firstPaymentByReservation.set(rid, pd);
    }
  }

  return { netByReservation, firstPaymentByReservation, extraReservationIds: [...new Set(extraReservationIds)] };
}

async function normalizeReservations(
  rows: RawReservation[],
  establishmentIds: string[],
  paymentWindow?: { startDate: string; endDate: string },
): Promise<NormalizedReservation[]> {
  const ids = rows.map((r) => r.id);
  const { netByReservation, firstPaymentByReservation, extraReservationIds } = await loadPaymentsAndRefunds(
    ids,
    establishmentIds,
    paymentWindow?.startDate,
    paymentWindow?.endDate,
  );

  let extraRows: RawReservation[] = [];
  const missing = extraReservationIds.filter((id) => !ids.includes(id));
  if (missing.length) {
    const { data } = await supabase.from("reservations").select(RESERVATION_SELECT).in("id", missing);
    extraRows = (data || []) as RawReservation[];
  }
  const allRows = [...rows, ...extraRows];

  const roomIds = [...new Set(allRows.map((r) => r.room_id).filter(Boolean))] as string[];
  const ownerByRoom = new Map<string, number>();
  if (roomIds.length) {
    const { data: rooms } = await supabase.from("rooms").select("id, commission").in("id", roomIds);
    for (const room of rooms || []) {
      ownerByRoom.set((room as any).id, Number((room as any).commission || 0));
    }
  }

  const { data: channels } = await supabase
    .from("ota_channels")
    .select("id, name, commission_rate, establishment_id")
    .in("establishment_id", establishmentIds);

  const otaByReservation = new Map<string, number>();
  if (allRows.length) {
    const otaLinks: any[] = [];
    const ids = allRows.map((r) => r.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase
        .from("ota_reservations")
        .select("reservation_id, ota_channel_id")
        .in("reservation_id", ids.slice(i, i + 200));
      otaLinks.push(...(data || []));
    }
    const rateByChannel = new Map((channels || []).map((c: any) => [c.id, Number(c.commission_rate || 0)]));
    for (const link of otaLinks) {
      const rid = String(link.reservation_id || "");
      const rate = rateByChannel.get(link.ota_channel_id);
      if (rid && rate != null) otaByReservation.set(rid, rate);
    }
  }

  return allRows.map((r) => ({
    id: r.id,
    establishmentId: r.establishment_id,
    status: r.status,
    cancelledAt: r.cancelled_at,
    checkinDate: toDateOnly(r.checkin_date),
    checkoutDate: toDateOnly(r.checkout_date),
    createdAtDate: toDateOnly(r.created_at),
    totalAmount: Number(r.total_amount || 0),
    serviceFeesTotal: serviceFeesTotal(r.reservation_service_fees),
    paymentStatus: r.payment_status,
    paidAmount: Number(r.paid_amount || 0),
    netPayments: netByReservation.get(r.id) || 0,
    firstPaymentDate: firstPaymentByReservation.get(r.id) || null,
    channelCommissionPct: matchChannelCommission(r, otaByReservation, channels || []),
    ownerPct: r.room_id ? ownerByRoom.get(r.room_id) || 0 : 0,
  }));
}

export async function countActiveLodgingUnits(establishmentIds: string[]): Promise<number> {
  if (!establishmentIds.length) return 0;
  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("id, exclude_from_billing, hide_from_map, is_blocked, category_id")
    .in("establishment_id", establishmentIds);
  if (error) throw new Error(error.message);

  const categoryIds = [...new Set((rooms || []).map((r: any) => r.category_id).filter(Boolean))];
  const typeByCategory = new Map<string, string>();
  if (categoryIds.length) {
    const { data: cats } = await supabase.from("room_categories").select("id, type").in("id", categoryIds);
    for (const c of cats || []) typeByCategory.set((c as any).id, (c as any).type || "");
  }

  return (rooms || []).filter((r: any) =>
    isLodgingUnit({
      exclude_from_billing: r.exclude_from_billing,
      hide_from_map: r.hide_from_map,
      is_blocked: r.is_blocked,
      category_type: typeByCategory.get(r.category_id),
    }),
  ).length;
}

export type OperatingFilters = {
  startDate: string;
  endDate: string;
  establishmentIds: string[];
  groupBy: GroupBy;
  billingMode: BillingMode;
  compareYoy: boolean;
};

export type TotalsView = MetricTotals & {
  adr: number;
  occupancy: number;
  availableNights: number;
};

function withRates(t: MetricTotals, availableNights: number): TotalsView {
  return {
    ...t,
    availableNights,
    adr: adr(t.gross, t.billedNights),
    occupancy: occupancyPct(t.billedNights, availableNights),
  };
}

export type OperatingReportResult = {
  period: PeriodReport & { billingView: TotalsView };
  previousMonths: Array<{
    key: string;
    label: string;
    startDate: string;
    endDate: string;
    view: TotalsView;
    rank: MonthRank;
  }>;
  previousMonthsTotal: TotalsView;
  yoy: null | {
    startDate: string;
    endDate: string;
    billingView: TotalsView;
    grossChange: number | null;
    netChange: number | null;
    occupancyChange: number | null;
  };
};

export async function fetchOperatingReport(filters: OperatingFilters): Promise<OperatingReportResult> {
  const { startDate, endDate, establishmentIds, groupBy, billingMode, compareYoy } = filters;
  const prevMonths = previousThreeCalendarMonths(startDate);
  const yoyRange = compareYoy ? previousYearRange(startDate, endDate) : null;
  const fetchStart = [startDate, prevMonths[0].startDate, yoyRange?.startDate].filter(Boolean).sort()[0] as string;
  const fetchEnd = [endDate, prevMonths[2].endDate, yoyRange?.endDate].filter(Boolean).sort().at(-1) as string;

  const [raw, activeUnitCount] = await Promise.all([
    loadReservationsOverlapping(establishmentIds, fetchStart, fetchEnd),
    countActiveLodgingUnits(establishmentIds),
  ]);

  const paymentWindow = billingMode === "payment_attribution" ? { startDate: fetchStart, endDate: fetchEnd } : undefined;
  const normalized = await normalizeReservations(raw, establishmentIds, paymentWindow);

  const period = computePeriodReport({
    reservations: normalized,
    startDate,
    endDate,
    groupBy,
    billingMode,
    activeUnitCount,
  });

  const monthReports = prevMonths.map((m) => {
    const r = computePeriodReport({
      reservations: normalized,
      startDate: m.startDate,
      endDate: m.endDate,
      groupBy: "month",
      billingMode,
      activeUnitCount,
    });
    return { ...m, report: r };
  });
  const ranks = rankMonthsByGross(monthReports.map((m) => ({ key: m.key, gross: m.report.billing.gross })));
  const previousMonthsAcc = {
    gross: 0,
    channelCommission: 0,
    ownerShare: 0,
    net: 0,
    billedNights: 0,
    reservationCount: 0,
    availableNights: 0,
    adr: 0,
    occupancy: 0,
  };
  for (const m of monthReports) {
    previousMonthsAcc.gross += m.report.billing.gross;
    previousMonthsAcc.channelCommission += m.report.billing.channelCommission;
    previousMonthsAcc.ownerShare += m.report.billing.ownerShare;
    previousMonthsAcc.net += m.report.billing.net;
    previousMonthsAcc.billedNights += m.report.billing.billedNights;
    previousMonthsAcc.reservationCount += m.report.billing.reservationCount;
    previousMonthsAcc.availableNights += m.report.availableNights;
  }
  previousMonthsAcc.adr = adr(previousMonthsAcc.gross, previousMonthsAcc.billedNights);
  previousMonthsAcc.occupancy = occupancyPct(previousMonthsAcc.billedNights, previousMonthsAcc.availableNights);

  let yoy: OperatingReportResult["yoy"] = null;
  if (yoyRange) {
    const yoyReport = computePeriodReport({
      reservations: normalized,
      startDate: yoyRange.startDate,
      endDate: yoyRange.endDate,
      groupBy,
      billingMode,
      activeUnitCount,
    });
    const yoyView = withRates(yoyReport.billing, yoyReport.availableNights);
    const currentView = withRates(period.billing, period.availableNights);
    yoy = {
      startDate: yoyRange.startDate,
      endDate: yoyRange.endDate,
      billingView: yoyView,
      grossChange: yoyChange(currentView.gross, yoyView.gross),
      netChange: yoyChange(currentView.net, yoyView.net),
      occupancyChange: yoyChange(currentView.occupancy, yoyView.occupancy),
    };
  }

  return {
    period: { ...period, billingView: withRates(period.billing, period.availableNights) },
    previousMonths: monthReports.map((m) => ({
      key: m.key,
      label: m.label,
      startDate: m.startDate,
      endDate: m.endDate,
      view: withRates(m.report.billing, m.report.availableNights),
      rank: ranks[m.key],
    })),
    previousMonthsTotal: previousMonthsAcc,
    yoy,
  };
}

export type DailyResultLineConfig = {
  id: string;
  label: string;
  establishmentIds: string[];
  displayOrder: number;
  isUnified: boolean;
  isActive: boolean;
};

export type DailyResultRow = {
  lineId: string;
  nightsLabel: string;
  revenueLabel: string;
  nights: number;
  gross: number;
};

export async function fetchDailyResult(args: {
  day: string;
  lines: DailyResultLineConfig[];
}): Promise<DailyResultRow[]> {
  const active = args.lines.filter((l) => l.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  const establishmentIds = [...new Set(active.flatMap((l) => l.establishmentIds))];
  if (!establishmentIds.length) return [];

  const raw = await loadReservationsOverlapping(establishmentIds, args.day, args.day);
  const createdOnly = raw.filter((r) => toDateOnly(r.created_at) === toDateOnly(args.day));
  const normalized = await normalizeReservations(createdOnly, establishmentIds);

  return active.map((line) => {
    const metrics = computeDailySalesResult(normalized, args.day, line.establishmentIds);
    const labels = dailyLineLabels(line.label, line.isUnified);
    return {
      lineId: line.id,
      nightsLabel: labels.nights,
      revenueLabel: labels.revenue,
      nights: metrics.nights,
      gross: metrics.gross,
    };
  });
}
