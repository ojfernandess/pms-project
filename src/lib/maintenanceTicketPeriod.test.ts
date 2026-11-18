import { parseISO } from "date-fns";
import { describe, expect, it } from "vitest";
import {
  isDateInMaintenancePeriod,
  roomHasWholeRoomMaintenance,
} from "./maintenanceTicketPeriod";

describe("maintenanceTicketPeriod", () => {
  it("não bloqueia quarto inteiro quando só há chamado parcial", () => {
    const room = { status: "available", is_blocked: false };
    const tickets = [
      {
        room_id: "r1",
        status: "open",
        blocks_entire_room: false,
        maintenance_start_date: "2026-11-18",
        maintenance_end_date: "2026-11-20",
      },
    ];
    expect(roomHasWholeRoomMaintenance(room, tickets, "r1")).toBe(false);
    expect(isDateInMaintenancePeriod(parseISO("2026-11-19"), tickets[0])).toBe(true);
    expect(isDateInMaintenancePeriod(parseISO("2026-11-21"), tickets[0])).toBe(false);
  });
});