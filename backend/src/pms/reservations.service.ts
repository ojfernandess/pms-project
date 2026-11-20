import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import { reservation_status, room_status } from "@prisma/client";
import { AuthService, SessionUser } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { reservationPublicSelect } from "./company.select";

export interface ReservationListQuery {
  from: string;
  to: string;
  status?: reservation_status;
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Optional() private readonly realtime?: RealtimeGateway,
  ) {}

  async list(user: SessionUser, establishmentId: string, query: ReservationListQuery) {
    await this.auth.assertEstablishment(user, establishmentId);
    const from = parseDateOnly(query.from);
    const to = parseDateOnly(query.to);
    if (from.getTime() > to.getTime()) {
      throw new BadRequestException("from must be on or before to");
    }

    const rows = await this.prisma.reservations.findMany({
      where: {
        establishment_id: establishmentId,
        checkout_date: { gte: from },
        checkin_date: { lte: to },
        ...(query.status ? { status: query.status } : { status: { not: reservation_status.cancelled } }),
      },
      select: reservationPublicSelect,
      orderBy: [{ checkin_date: "asc" }, { reservation_code: "asc" }],
    });

    return rows.map((row) => serializeReservationRow(row));
  }

  async createWithLock(body: {
    p_reservation_data: Record<string, unknown>;
    p_checkin_date: string;
    p_checkout_date: string;
    p_establishment_id: string;
    p_room_id?: string | null;
    p_category_id?: string | null;
  }) {
    if (!body?.p_reservation_data || !body.p_checkin_date || !body.p_checkout_date || !body.p_establishment_id) {
      throw new BadRequestException("Dados da reserva incompletos");
    }
    const startedAt = performance.now();
    const rows = await this.prisma.$queryRaw<Array<{ result: { success?: boolean; error?: string; reservation_id?: string } }>>`
      SELECT public.create_reservation_with_lock(
        ${JSON.stringify(body.p_reservation_data)}::jsonb,
        ${body.p_checkin_date}::date,
        ${body.p_checkout_date}::date,
        ${body.p_establishment_id}::uuid,
        ${body.p_room_id ?? null}::uuid,
        ${body.p_category_id ?? null}::uuid
      ) AS result
    `;
    const result = rows[0]?.result ?? { success: false, error: "A função de reserva não retornou resultado" };
    const ms = Math.round(performance.now() - startedAt);
    if (ms >= 400 || process.env.PMS_LOG_RESERVATION_LOCK_TIMING === "1") {
      this.logger.log(
        `createWithLock ${ms}ms success=${Boolean(result.success)} establishment=${body.p_establishment_id}`,
      );
    }
    if (result.success && result.reservation_id) {
      this.realtime?.publish({
        table: "reservations",
        event: "INSERT",
        row: { id: result.reservation_id, establishment_id: body.p_establishment_id },
      });
    }
    return result;
  }

  async checkIn(user: SessionUser, reservationId: string, roomId?: string) {
    const current = await this.requireReservation(user, reservationId);
    const row = await this.prisma.$transaction(async (tx) => {
      if (roomId) {
        await tx.rooms.update({ where: { id: roomId }, data: { status: room_status.occupied } });
      }
      return tx.reservations.update({
        where: { id: reservationId },
        data: { status: reservation_status.checkedin, ...(roomId ? { room_id: roomId } : {}) },
        select: { ...reservationPublicSelect, room_id: true },
      });
    });
    this.realtime?.publish({
      table: "reservations",
      event: "UPDATE",
      row: { id: row.id, establishment_id: row.establishment_id, status: row.status, room_id: roomId || current.room_id },
    });
    if (roomId) {
      this.realtime?.publish({
        table: "rooms",
        event: "UPDATE",
        row: { id: roomId, establishment_id: current.establishment_id, status: room_status.occupied },
      });
    }
    return {
      ...serializeReservationRow(row),
      room_id: roomId || current.room_id,
    };
  }

  async checkOut(user: SessionUser, reservationId: string) {
    const current = await this.requireReservation(user, reservationId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.reservations.update({
        where: { id: reservationId },
        data: { status: reservation_status.checkedout },
        select: reservationPublicSelect,
      });
      if (current.room_id) {
        await tx.rooms.update({ where: { id: current.room_id }, data: { status: room_status.cleaning } });
      }
      return row;
    });
    this.realtime?.publish({
      table: "reservations",
      event: "UPDATE",
      row: { id: updated.id, establishment_id: updated.establishment_id, status: updated.status, room_id: current.room_id },
    });
    if (current.room_id) {
      this.realtime?.publish({
        table: "rooms",
        event: "UPDATE",
        row: { id: current.room_id, establishment_id: current.establishment_id, status: room_status.cleaning },
      });
    }
    return serializeReservationRow(updated);
  }

  private async requireReservation(user: SessionUser, reservationId: string) {
    const current = await this.prisma.reservations.findUnique({
      where: { id: reservationId },
      select: { id: true, establishment_id: true, room_id: true },
    });
    if (!current?.establishment_id) throw new NotFoundException("Reservation not found");
    await this.auth.assertEstablishment(user, current.establishment_id);
    return current;
  }
}

function serializeReservationRow<
  T extends {
    identification_number: bigint;
    total_amount: { toString(): string };
    paid_amount: { toString(): string };
  },
>(row: T) {
  return {
    ...row,
    identification_number: row.identification_number.toString(),
    total_amount: row.total_amount.toString(),
    paid_amount: row.paid_amount.toString(),
  };
}

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException("Dates must use YYYY-MM-DD");
  }
  return new Date(`${value}T00:00:00.000Z`);
}
