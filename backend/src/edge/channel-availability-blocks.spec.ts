import {
  baseSellableRoomsByCategory,
  bookedCountFromOccupiedMap,
  buildOccupiedRoomsByCategoryDate,
  resolveMaintenancePeriodForChannel,
} from "./channel-availability-blocks";

describe("channel-availability-blocks", () => {
  const rooms = [
    { id: "r1", category_id: "cat1", is_blocked: false },
    { id: "r2", category_id: "cat1", is_blocked: false },
  ];

  it("reduz disponibilidade só no período da manutenção", () => {
    const occupied = buildOccupiedRoomsByCategoryDate({
      rooms,
      reservations: [],
      maintenanceTickets: [
        {
          room_id: "r1",
          maintenance_start_date: "2026-06-10",
          maintenance_end_date: "2026-06-12",
          status: "open",
        },
      ],
      windowStart: "2026-06-01",
      windowEndInclusive: "2026-06-20",
    });

    expect(bookedCountFromOccupiedMap(occupied, "cat1", "2026-06-09")).toBe(0);
    expect(bookedCountFromOccupiedMap(occupied, "cat1", "2026-06-10")).toBe(1);
    expect(bookedCountFromOccupiedMap(occupied, "cat1", "2026-06-12")).toBe(1);
    expect(bookedCountFromOccupiedMap(occupied, "cat1", "2026-06-13")).toBe(0);

    const base = baseSellableRoomsByCategory(rooms).get("cat1") ?? 0;
    expect(base - bookedCountFromOccupiedMap(occupied, "cat1", "2026-06-11")).toBe(1);
  });

  it("inclui reservas com status blocked", () => {
    const occupied = buildOccupiedRoomsByCategoryDate({
      rooms,
      reservations: [
        {
          id: "b1",
          category_id: "cat1",
          room_id: "r2",
          checkin_date: "2026-07-01",
          checkout_date: "2026-07-03",
          status: "blocked",
        },
      ],
      maintenanceTickets: [],
      windowStart: "2026-07-01",
      windowEndInclusive: "2026-07-05",
    });

    expect(bookedCountFromOccupiedMap(occupied, "cat1", "2026-07-01")).toBe(1);
    expect(bookedCountFromOccupiedMap(occupied, "cat1", "2026-07-02")).toBe(1);
    expect(bookedCountFromOccupiedMap(occupied, "cat1", "2026-07-03")).toBe(0);
  });

  it("resolveMaintenancePeriodForChannel ignora tickets fechados", () => {
    expect(
      resolveMaintenancePeriodForChannel(
        { room_id: "r1", maintenance_start_date: "2026-01-01", maintenance_end_date: "2026-01-05", status: "resolved" },
        "2026-12-31",
      ),
    ).toBeNull();
  });
});