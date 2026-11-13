import { ForbiddenException } from "@nestjs/common";
import { reservation_status } from "@prisma/client";
import { AuthService, SessionUser } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { CompaniesService } from "./companies.service";
import { ReservationsService } from "./reservations.service";
import { RoomsService } from "./rooms.service";
import { roomPublicSelect } from "./company.select";

const companyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const companyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const establishmentA = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const establishmentB = "dddddddd-dddd-dddd-dddd-dddddddddddd";

const member: SessionUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "staff@hotel.test",
  isSuperAdmin: false,
  companyIds: [companyA],
};

function authService(): AuthService {
  return new AuthService(
    {
      establishmentCompanyId: async (id: string) => {
        if (id === establishmentA) return companyA;
        if (id === establishmentB) return companyB;
        return null;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );
}

describe("CompaniesService", () => {
  it("limits the list to the caller's companies", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { companies: { findMany, findUnique: jest.fn() } } as unknown as PrismaService;
    const service = new CompaniesService(prisma, authService());

    await service.list(member);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [companyA] } } }),
    );
  });

  it("does not read another company", async () => {
    const findUnique = jest.fn();
    const prisma = { companies: { findMany: jest.fn(), findUnique } } as unknown as PrismaService;
    const service = new CompaniesService(prisma, authService());

    await expect(service.get(member, companyB)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("ReservationsService", () => {
  it("rejects another establishment before querying", async () => {
    const findMany = jest.fn();
    const prisma = { reservations: { findMany } } as unknown as PrismaService;
    const service = new ReservationsService(prisma, authService());

    await expect(
      service.list(member, establishmentB, { from: "2026-11-01", to: "2026-11-30" }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("uses the occupancy-map overlap and omits cancelled reservations", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        identification_number: 15n,
        total_amount: { toString: () => "100.00" },
        paid_amount: { toString: () => "0.00" },
      },
    ]);
    const prisma = { reservations: { findMany } } as unknown as PrismaService;
    const service = new ReservationsService(prisma, authService());

    const rows = await service.list(member, establishmentA, { from: "2026-11-01", to: "2026-11-30" });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          establishment_id: establishmentA,
          checkout_date: { gte: new Date("2026-11-01T00:00:00.000Z") },
          checkin_date: { lte: new Date("2026-11-30T00:00:00.000Z") },
          status: { not: reservation_status.cancelled },
        },
      }),
    );
    expect(rows[0].identification_number).toBe("15");
    expect(rows[0].total_amount).toBe("100.00");
  });
});

describe("ReservationsService writes", () => {
  it("calls create_reservation_with_lock with the same arguments", async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ result: { success: true, reservation_id: "res-1" } }]);
    const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
    const service = new ReservationsService(prisma, authService());
    const result = await service.createWithLock({
      p_reservation_data: { category_id: "cat" },
      p_checkin_date: "2026-11-01",
      p_checkout_date: "2026-11-03",
      p_establishment_id: establishmentA,
      p_room_id: null,
      p_category_id: "cat",
    });
    expect(queryRaw).toHaveBeenCalled();
    expect(result).toEqual({ success: true, reservation_id: "res-1" });
  });
});

describe("RoomsService", () => {
  it("does not select the room password", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { rooms: { findMany } } as unknown as PrismaService;
    const service = new RoomsService(prisma, authService());

    await service.list(member, establishmentA);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ select: roomPublicSelect }));
    expect(roomPublicSelect).not.toHaveProperty("fixed_password");
  });
});
