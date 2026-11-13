import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { PrismaService } from "../prisma/prisma.service";

const reservationSelect = {
  id: true,
  reservation_code: true,
  identification_number: true,
  checkin_date: true,
  checkout_date: true,
  checkin_time: true,
  checkout_time: true,
  total_amount: true,
  paid_amount: true,
  payment_status: true,
  status: true,
  guest_id: true,
  client_id: true,
  room_id: true,
  category_id: true,
  establishment_id: true,
} satisfies Prisma.reservationsSelect;

type ReservationRow = Prisma.reservationsGetPayload<{ select: typeof reservationSelect }>;

export type ReservationLookupResult =
  | { status: number; body: Record<string, unknown> };

@Injectable()
export class GetReservationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: StaffIdentityService,
  ) {}

  async lookup(input: {
    authorization?: string;
    identifier?: string | null;
    locator?: string | null;
    reservationCode?: string | null;
    guestAccountId?: string | null;
  }): Promise<ReservationLookupResult> {
    const identifier = emptyToNull(input.identifier);
    const locator = emptyToNull(input.locator);
    const reservationCode = emptyToNull(input.reservationCode);
    const guestAccountId = emptyToNull(input.guestAccountId);

    if (!identifier && !locator && !reservationCode) {
      return {
        status: 400,
        body: {
          error: "Missing identifier",
          message: "É necessário fornecer pelo menos um dos seguintes: identifier, locator ou reservation_code",
        },
      };
    }

    const staffId = await this.identity.resolve(input.authorization);
    if (!staffId && !guestAccountId) {
      return {
        status: 401,
        body: {
          error: "Authentication required",
          message: "Autenticação necessária. Forneça um token de usuário ou guest_account_id",
        },
      };
    }

    const found = await this.findReservation({ identifier, locator, reservationCode });
    if (!found.reservation) {
      return {
        status: 404,
        body: {
          error: "Reservation not found",
          message: "Reserva não encontrada com os identificadores fornecidos",
        },
      };
    }

    if (guestAccountId && !staffId) {
      const stay = await this.prisma.guest_stay_history.findFirst({
        where: { reservation_id: found.reservation.id, guest_account_id: guestAccountId },
        select: { guest_account_id: true },
      });
      if (!stay) {
        return {
          status: 403,
          body: {
            error: "Access denied",
            message: "Você não tem permissão para acessar esta reserva. A reserva precisa estar vinculada à sua conta.",
          },
        };
      }
    }

    const reservation = found.reservation;
    const [guest, financialResponsible, room, category, establishment, payments, webCheckin] = await Promise.all([
      reservation.guest_id
        ? this.prisma.clients.findUnique({
            where: { id: reservation.guest_id },
            select: { id: true, full_name: true, email: true, phone: true, document_number: true, birth_date: true },
          })
        : null,
      reservation.client_id
        ? this.prisma.clients.findUnique({
            where: { id: reservation.client_id },
            select: { id: true, full_name: true, email: true, phone: true, document_number: true },
          })
        : null,
      reservation.room_id
        ? this.prisma.rooms.findUnique({
            where: { id: reservation.room_id },
            select: { id: true, room_number: true, name: true, fixed_password: true, authentication_type: true },
          })
        : null,
      this.prisma.room_categories.findUnique({
        where: { id: reservation.category_id },
        select: { id: true, name: true, capacity_adults: true, capacity_children: true, building_id: true },
      }),
      reservation.establishment_id
        ? this.prisma.establishments.findUnique({
            where: { id: reservation.establishment_id },
            select: { id: true, name: true },
          })
        : null,
      this.prisma.payments.findMany({
        where: { reservation_id: reservation.id },
        select: { id: true, amount: true, payment_date: true, payment_method: true, notes: true },
        orderBy: { payment_date: "desc" },
      }),
      found.webCheckin ??
        this.prisma.web_checkin.findUnique({
          where: { reservation_id: reservation.id },
          select: { id: true, locator: true, status: true, token: true, expires_at: true },
        }),
    ]);

    return {
      status: 200,
      body: {
        success: true,
        reservation: {
          ...serializeReservation(reservation),
          guest: guest ? { ...guest, birth_date: dateOnly(guest.birth_date) } : null,
          financial_responsible: financialResponsible,
          room,
          category,
          establishment,
          payments: payments.map((payment) => ({ ...payment, amount: payment.amount.toString() })),
          web_checkin: webCheckin,
        },
      },
    };
  }

  private async findReservation(input: {
    identifier: string | null;
    locator: string | null;
    reservationCode: string | null;
  }): Promise<{ reservation: ReservationRow | null; webCheckin: { id: string; reservation_id: string; locator: string; status: string; token: string; expires_at: Date } | null }> {
    if (input.identifier && /^\d+$/.test(input.identifier)) {
      const byIdentifier = await this.prisma.reservations.findUnique({
        where: { identification_number: BigInt(input.identifier) },
        select: reservationSelect,
      });
      if (byIdentifier) return { reservation: byIdentifier, webCheckin: null };
    }

    const code = input.reservationCode || input.locator;
    if (code) {
      const byCode = await this.prisma.reservations.findUnique({
        where: { reservation_code: code },
        select: reservationSelect,
      });
      if (byCode) return { reservation: byCode, webCheckin: null };
    }

    if (input.locator) {
      const webCheckin = await this.prisma.web_checkin.findUnique({
        where: { locator: input.locator },
        select: { id: true, reservation_id: true, locator: true, status: true, token: true, expires_at: true },
      });
      if (webCheckin) {
        const reservation = await this.prisma.reservations.findUnique({
          where: { id: webCheckin.reservation_id },
          select: reservationSelect,
        });
        return { reservation, webCheckin };
      }
    }

    return { reservation: null, webCheckin: null };
  }
}

function emptyToNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function dateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function serializeReservation(row: ReservationRow) {
  return {
    ...row,
    identification_number: row.identification_number.toString(),
    checkin_date: dateOnly(row.checkin_date),
    checkout_date: dateOnly(row.checkout_date),
    total_amount: row.total_amount.toString(),
    paid_amount: row.paid_amount.toString(),
  };
}
