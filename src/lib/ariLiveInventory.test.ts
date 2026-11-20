import { describe, expect, it } from "vitest";
import { computeCategoryDayInventory, mergeInventoryPreferLive } from "./ariLiveInventory";

describe("computeCategoryDayInventory", () => {
  const rooms = [
    { id: "r1", is_blocked: false },
    { id: "r2", is_blocked: false },
    { id: "r3", is_blocked: true },
  ];

  it("counts occupied rooms and available for a day", () => {
    const inv = computeCategoryDayInventory({
      rooms,
      categoryId: "cat-1",
      date: "2030-06-10",
      reservations: [
        {
          id: "a",
          room_id: "r1",
          category_id: "cat-1",
          checkin_date: "2030-06-09",
          checkout_date: "2030-06-11",
          status: "confirmed",
        },
      ],
    });
    expect(inv.total_rooms).toBe(2);
    expect(inv.confirmed_reservations).toBe(1);
    expect(inv.available_rooms).toBe(1);
    expect(inv.occupancy_percentage).toBe(50);
  });

  it("counts unassigned reservations on category", () => {
    const inv = computeCategoryDayInventory({
      rooms,
      categoryId: "cat-1",
      date: "2030-06-10",
      reservations: [
        {
          id: "b",
          room_id: null,
          category_id: "cat-1",
          checkin_date: "2030-06-10",
          checkout_date: "2030-06-12",
          status: "pending",
        },
      ],
    });
    expect(inv.confirmed_reservations).toBe(1);
    expect(inv.available_rooms).toBe(1);
  });
});

describe("mergeInventoryPreferLive", () => {
  it("prefers live when stored is all zeros with physical rooms", () => {
    const live = {
      total_rooms: 4,
      available_rooms: 2,
      confirmed_reservations: 2,
      blocked_rooms: 0,
      occupancy_percentage: 50,
      source: "live" as const,
    };
    const merged = mergeInventoryPreferLive(
      { total_rooms: 0, available_rooms: 0, confirmed_reservations: 0 },
      live,
      4,
    );
    expect(merged.source).toBe("live");
    expect(merged.available_rooms).toBe(2);
  });
});
