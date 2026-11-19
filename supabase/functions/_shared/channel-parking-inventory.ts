/** Categorias de estacionamento (category_kind=parking) com mapeamento OTA — inventário sem tarifário de hospedagem. */

export type ChannelCalRow = {
  date: string;
  category_id: string;
  pricing_plan_id: string;
  base_price: number;
  min_stay?: number | null;
  max_stay?: number | null;
  closed_to_arrival?: boolean | null;
  closed_to_departure?: boolean | null;
  stop_sell_ota?: boolean | null;
  stop_sell_booking_engine?: boolean | null;
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
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    inCalendar.add(categoryId);
  }
}

export function occupiedParkingSpotsOnDate(
  catRes: Array<{ checkin_date: unknown; checkout_date: unknown }>,
  dateYmd: string,
): number {
  const currentDate = new Date(`${dateYmd}T12:00:00Z`);
  return catRes.filter((r) => {
    const checkin = new Date(String(r.checkin_date).slice(0, 10) + "T00:00:00Z");
    const checkout = new Date(String(r.checkout_date).slice(0, 10) + "T00:00:00Z");
    return currentDate >= checkin && currentDate < checkout;
  }).length;
}