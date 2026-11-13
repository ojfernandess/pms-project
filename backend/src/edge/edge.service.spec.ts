import { StaffIdentityService } from "../auth/staff-identity.service";
import { PrismaService } from "../prisma/prisma.service";
import { GetReservationService } from "./get-reservation.service";
import { HealthCheckService } from "./health-check.service";
import { CompanyWebhookService } from "./company-webhook.service";
import { EmailDispatchService } from "./email-dispatch.service";
import { canManageEmployees } from "./employee-auth.service";
import { escapeXml } from "./sitemap.service";
import { renderRobots } from "./robots.service";

const reservation = {
  id: "res-1",
  reservation_code: "RSV1",
  identification_number: 42n,
  checkin_date: new Date("2026-11-01T00:00:00.000Z"),
  checkout_date: new Date("2026-11-03T00:00:00.000Z"),
  checkin_time: null,
  checkout_time: null,
  total_amount: { toString: () => "200.00" },
  paid_amount: { toString: () => "0.00" },
  payment_status: "pending",
  status: "confirmed",
  guest_id: null,
  client_id: null,
  room_id: null,
  category_id: "cat-1",
  establishment_id: null,
};

function reservationService(stay: boolean) {
  const prisma = {
    reservations: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { identification_number?: bigint; reservation_code?: string; id?: string } }) => {
        if (where.identification_number === 42n || where.reservation_code === "RSV1" || where.id === "res-1") return reservation;
        return null;
      }),
    },
    guest_stay_history: { findFirst: jest.fn().mockResolvedValue(stay ? { guest_account_id: "guest-1" } : null) },
    clients: { findUnique: jest.fn() },
    rooms: { findUnique: jest.fn() },
    room_categories: { findUnique: jest.fn().mockResolvedValue({ id: "cat-1", name: "Standard", capacity_adults: 2, capacity_children: 0, building_id: null }) },
    establishments: { findUnique: jest.fn() },
    payments: { findMany: jest.fn().mockResolvedValue([]) },
    web_checkin: { findUnique: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  const identity = {
    resolve: async (authorization?: string) => (authorization === "Bearer staff" ? "staff-1" : null),
  } as StaffIdentityService;
  return { service: new GetReservationService(prisma, identity) };
}

describe("escapeXml", () => {
  it("escapes sitemap characters", () => {
    expect(escapeXml(`a&b<c>"'`)).toBe("a&amp;b&lt;c&gt;&quot;&apos;");
  });
});

describe("CompanyWebhookService", () => {
  it("requires establishment and event", async () => {
    const service = new CompanyWebhookService({} as PrismaService);
    await expect(service.send({})).resolves.toEqual({
      status: 400,
      body: { error: "establishment_id and event are required" },
    });
  });
});

describe("ported edge contracts", () => {
  const email = new EmailDispatchService();

  it("rejects a Resend payload without the required fields", async () => {
    await expect(email.resend({})).resolves.toMatchObject({ status: 400, body: { error: "Missing required fields" } });
  });

  it("treats a manager as allowed to manage employees", () => {
    expect(canManageEmployees({ custom_permissions: null, employee_roles: { code: "manager", permissions: {} } })).toBe(true);
    expect(canManageEmployees({ custom_permissions: null, employee_roles: { code: "reception", permissions: {} } })).toBe(false);
  });
});

describe("renderRobots", () => {
  it("builds the default file with the sitemap url", () => {
    expect(renderRobots({ baseUrl: "https://hotel.test/", robotsTxt: null })).toContain("Sitemap: https://hotel.test/sitemap.xml");
  });

  it("keeps a custom robots file", () => {
    expect(renderRobots({ baseUrl: "https://hotel.test", robotsTxt: "User-agent: *\nDisallow: /" })).toBe("User-agent: *\nDisallow: /");
  });
});

describe("HealthCheckService", () => {
  it("stays degraded when storage fails and the database answers", async () => {
    const prisma = {
      establishments: { findFirst: jest.fn().mockResolvedValue({ id: "1" }) },
      buckets: { findFirst: jest.fn().mockRejectedValue(new Error("storage down")) },
    } as unknown as PrismaService;
    const result = await new HealthCheckService(prisma).run();
    expect(result.status).toBe("degraded");
    expect(result.checks.database.status).toBe("ok");
    expect(result.checks.storage.status).toBe("error");
  });
});

describe("GetReservationService", () => {
  it("requires an identifier", async () => {
    const { service } = reservationService(false);
    await expect(service.lookup({})).resolves.toEqual(expect.objectContaining({ status: 400 }));
  });

  it("requires staff or a guest account", async () => {
    const { service } = reservationService(false);
    await expect(service.lookup({ identifier: "42" })).resolves.toEqual(expect.objectContaining({ status: 401 }));
  });

  it("denies a guest who is not linked to the reservation", async () => {
    const { service } = reservationService(false);
    await expect(service.lookup({ identifier: "42", guestAccountId: "guest-1" })).resolves.toEqual(
      expect.objectContaining({ status: 403 }),
    );
  });

  it("returns the reservation for a linked guest", async () => {
    const { service } = reservationService(true);
    const result = await service.lookup({ identifier: "42", guestAccountId: "guest-1" });
    expect(result.status).toBe(200);
    expect(result.body.reservation).toEqual(expect.objectContaining({
      reservation_code: "RSV1",
      identification_number: "42",
      checkin_date: "2026-11-01",
      total_amount: "200.00",
    }));
  });

  it("allows staff with the Nest JWT without a guest link", async () => {
    const { service } = reservationService(false);
    const result = await service.lookup({ identifier: "42", authorization: "Bearer staff" });
    expect(result.status).toBe(200);
  });
});
