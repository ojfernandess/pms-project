/** Categorias de estacionamento (category_kind=parking) com mapeamento OTA — inventário sem tarifário de hospedagem. */

export type ChannelCalRow = {
  date: string;
  category_id: string;
  pricing_plan_id: string;
  base_price: number;
  min_stay: number | null;
  max_stay: number | null;
  closed_to_arrival: boolean | null;
  closed_to_departure: boolean | null;
  stop_sell_ota: boolean | null;
  stop_sell_booking_engine: boolean | null;
};

export function parkingCategoryIdSet(
  categories: Array<{ id: string; category_kind?: string | null }>,
): Set<string> {
  const set = new Set<string>();
  for (const c of categories) {
    if (String(c.category_kind ?? "lodging") === "parking") set.add(String(c.id));
  }
  return set;
}

/** Inclui dias no calendário sintético para parking mapeado sem linhas em rate_calendar. */
export function appendParkingMappedCalendarRows(params: {
  calendarLikeRows: ChannelCalRow[];
  mappingRows: Array<{ category_id?: string | null; pricing_plan_id?: string | null }>;
  parkingCategoryIds: Set<string>;
  categoryBasePriceById: Map<string, number>;
  windowStartYmd: string;
  windowEndInclusiveYmd: string;
}): void {
  const inCalendar = new Set(params.calendarLikeRows.map((r) => String(r.category_id)));
  const mappedParking = new Set<string>();
  for (const mapping of params.mappingRows) {
    const categoryId = String(mapping.category_id ?? "").trim();
    if (!categoryId || !params.parkingCategoryIds.has(categoryId)) continue;
    mappedParking.add(categoryId);
  }

  for (const categoryId of mappedParking) {
    if (inCalendar.has(categoryId)) continue;
    const mapping = params.mappingRows.find((m) => String(m.category_id ?? "") === categoryId);
    const planId = String(mapping?.pricing_plan_id ?? "");
    const base = params.categoryBasePriceById.get(categoryId) ?? 0;
    let cursor = new Date(`${params.windowStartYmd}T00:00:00.000Z`);
    const end = new Date(`${params.windowEndInclusiveYmd}T00:00:00.000Z`);
    while (cursor.getTime() <= end.getTime()) {
      params.calendarLikeRows.push({
        date: cursor.toISOString().slice(0, 10),
        category_id: categoryId,
        pricing_plan_id: planId,
        base_price: base,
        min_stay: null,
        max_stay: null,
        closed_to_arrival: null,
        closed_to_departure: null,
        stop_sell_ota: null,
        stop_sell_booking_engine: null,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    inCalendar.add(categoryId);
  }
}

export function netParkingAvailabilityForDate(
  categoryId: string,
  dateYmd: string,
  sellableByCategory: Map<string, number>,
  bookedByCategoryDate: Map<string, number>,
  keySeparator: string,
): number {
  const total = sellableByCategory.get(categoryId) ?? 0;
  const booked = bookedByCategoryDate.get(`${categoryId}${keySeparator}${dateYmd}`) ?? 0;
  return Math.max(0, total - booked);
}