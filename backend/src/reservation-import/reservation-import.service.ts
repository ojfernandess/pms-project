import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { randomBytes, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SITE_SETTINGS_ID } from "../edge/robots.service";
import { RESERVATION_IMPORT_QUEUE } from "../queues/queue.constants";
import { RESERVATION_IMPORT_EXAMPLE } from "./reservation-import.example";
import type {
  ReservationImportError,
  ReservationImportItem,
  ReservationImportPayload,
  ReservationImportPerson,
} from "./reservation-import.types";

const DEFAULT_BATCH = 25;
const MAX_BATCH = 100;

type StatusMap = "pending" | "confirmed" | "checked_in" | "checked_out" | "cancelled";
type PayStatusMap = "pending" | "partial" | "paid" | "refunded";

@Injectable()
export class ReservationImportService {
  private readonly logger = new Logger(ReservationImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(RESERVATION_IMPORT_QUEUE) private readonly queue: Queue,
  ) {}

  getExample() {
    return RESERVATION_IMPORT_EXAMPLE;
  }

  async assertFeatureEnabled(establishmentId: string) {
    const site = await this.prisma.site_settings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { features_enabled: true },
    });
    const features = (site?.features_enabled as Record<string, unknown> | null) || {};
    if (!isFeatureEnabled(features.reservation_import_export, establishmentId)) {
      throw new ForbiddenException("Importação/exportação de reservas não habilitada para este estabelecimento");
    }
  }

  async exportReservations(params: {
    establishmentId: string;
    checkinFrom?: string;
    checkinTo?: string;
    status?: string;
  }) {
    await this.assertFeatureEnabled(params.establishmentId);

    const where: Prisma.reservationsWhereInput = {
      establishment_id: params.establishmentId,
    };
    if (params.status) {
      where.status = mapStatus(params.status) as any;
    }
    if (params.checkinFrom || params.checkinTo) {
      where.checkin_date = {};
      if (params.checkinFrom) where.checkin_date.gte = parseDateOnly(params.checkinFrom);
      if (params.checkinTo) where.checkin_date.lte = parseDateOnly(params.checkinTo);
    }

    const rows = await this.prisma.reservations.findMany({
      where,
      include: {
        clients_reservations_client_idToclients: true,
        clients_reservations_guest_idToclients: true,
        payments: true,
        web_checkin: { include: { web_checkin_guests: true } },
        room_categories: { select: { id: true, external_pms_code: true, building_id: true } },
        rooms: { select: { id: true, external_pms_code: true } },
        pricing_plans: { select: { id: true, external_pms_code: true } },
      },
      orderBy: { checkin_date: "asc" },
      take: 5000,
    });

    const buildingIds = [
      ...new Set(
        rows
          .map((r) => r.room_categories?.building_id)
          .filter((id): id is string => !!id),
      ),
    ];
    const buildings = buildingIds.length
      ? await this.prisma.buildings.findMany({
          where: { id: { in: buildingIds } },
          select: { id: true, external_pms_code: true },
        })
      : [];
    const buildingMap = new Map(buildings.map((b) => [b.id, b.external_pms_code]));

    const payload: ReservationImportPayload = {
      version: "1.0",
      exported_at: new Date().toISOString(),
      establishment: { id: params.establishmentId },
      reservations: rows.map((r) => {
        const financial = r.clients_reservations_client_idToclients;
        const guest = r.clients_reservations_guest_idToclients;
        const wc = r.web_checkin;
        return {
          external_id: null,
          reservation_code: r.reservation_code,
          identification_number: r.identification_number != null ? String(r.identification_number) : null,
          status: exportStatus(String(r.status)),
          payment_status: String(r.payment_status),
          channel: r.channel || "direct",
          checkin_date: formatDateOnly(r.checkin_date),
          checkout_date: formatDateOnly(r.checkout_date),
          checkin_time: formatTime(r.checkin_time),
          checkout_time: formatTime(r.checkout_time),
          adults: r.adults,
          children: r.children,
          total_amount: Number(r.total_amount),
          paid_amount: Number(r.paid_amount),
          notes: r.notes || "",
          mapping: {
            building_external_code: r.room_categories?.building_id
              ? buildingMap.get(r.room_categories.building_id) || null
              : null,
            category_external_code: r.room_categories?.external_pms_code || null,
            room_external_code: r.rooms?.external_pms_code || null,
            pricing_plan_external_code: r.pricing_plans?.external_pms_code || null,
          },
          financial_responsible: personFromClient(financial),
          guest: personFromClient(guest) || (r.guest_name ? { full_name: r.guest_name } : null),
          checkin: wc
            ? {
                completed: wc.status === "completed" || !!wc.completed_at,
                locator: wc.locator,
                guests: (wc.web_checkin_guests || []).map((g) => ({
                  name: g.name,
                  document_number: g.document_number,
                  document_type: g.document_type,
                  email: g.email,
                  phone: g.phone,
                  birth_date: g.birth_date ? formatDateOnly(g.birth_date) : null,
                  is_main_guest: !!g.is_main_guest,
                  nationality: g.nationality,
                  city: g.city,
                  state: g.state,
                  country: g.country,
                  postal_code: g.postal_code || g.zip_code,
                  street: g.street,
                  number: g.number,
                  neighborhood: g.neighborhood,
                })),
              }
            : null,
          payments: (r.payments || []).map((p) => ({
            amount: Number(p.amount),
            payment_method: p.payment_method,
            payment_date: p.payment_date?.toISOString?.() || null,
            notes: p.notes,
          })),
        };
      }),
    };

    return payload;
  }

  async createJob(params: {
    establishmentId: string;
    userId?: string | null;
    batchSize?: number;
    payload: ReservationImportPayload;
  }) {
    await this.assertFeatureEnabled(params.establishmentId);

    const reservations = Array.isArray(params.payload?.reservations) ? params.payload.reservations : null;
    if (!reservations || reservations.length === 0) {
      throw new BadRequestException("payload.reservations é obrigatório e não pode ser vazio");
    }

    const batchSize = clampBatch(params.batchSize);
    const job = await this.prisma.reservation_import_jobs.create({
      data: {
        establishment_id: params.establishmentId,
        created_by: params.userId || null,
        status: "pending",
        batch_size: batchSize,
        total: reservations.length,
        processed: 0,
        created_count: 0,
        updated_count: 0,
        error_count: 0,
        errors: [],
        payload: params.payload as any,
      },
    });

    await this.queue.add(
      "import.run",
      { jobId: job.id },
      { removeOnComplete: 100, removeOnFail: 200, attempts: 1 },
    );

    return this.serializeJob(job);
  }

  async getJob(jobId: string, establishmentId?: string) {
    const job = await this.prisma.reservation_import_jobs.findUnique({ where: { id: jobId } });
    if (!job) throw new NotFoundException("Job não encontrado");
    if (establishmentId && job.establishment_id !== establishmentId) {
      throw new ForbiddenException("Job não pertence a este estabelecimento");
    }
    await this.assertFeatureEnabled(job.establishment_id);
    return this.serializeJob(job);
  }

  async processJob(jobId: string) {
    const job = await this.prisma.reservation_import_jobs.findUnique({ where: { id: jobId } });
    if (!job) {
      this.logger.warn(`Job ${jobId} não encontrado`);
      return;
    }
    if (job.status === "completed" || job.status === "running") {
      return;
    }

    await this.prisma.reservation_import_jobs.update({
      where: { id: jobId },
      data: { status: "running", updated_at: new Date() },
    });

    const payload = (job.payload || {}) as ReservationImportPayload;
    const items = Array.isArray(payload.reservations) ? payload.reservations : [];
    const batchSize = clampBatch(job.batch_size);
    const errors: ReservationImportError[] = Array.isArray(job.errors)
      ? ([...(job.errors as any[])] as ReservationImportError[])
      : [];

    let processed = job.processed || 0;
    let createdCount = job.created_count || 0;
    let updatedCount = job.updated_count || 0;
    let errorCount = job.error_count || 0;

    try {
      while (processed < items.length) {
        const slice = items.slice(processed, processed + batchSize);
        for (let i = 0; i < slice.length; i++) {
          const index = processed + i;
          const item = slice[i];
          try {
            const result = await this.upsertReservation(job.establishment_id, item, index);
            if (result === "created") createdCount += 1;
            else updatedCount += 1;
          } catch (err: any) {
            errorCount += 1;
            const mapped = err?.importError as ReservationImportError | undefined;
            errors.push(
              mapped || {
                code: "IMPORT_ERROR",
                reservation_code: item?.reservation_code || null,
                guest_name: item?.guest?.full_name || item?.financial_responsible?.full_name || null,
                message: err?.message || "Erro ao importar reserva",
                index,
              },
            );
          }
        }
        processed += slice.length;
        await this.prisma.reservation_import_jobs.update({
          where: { id: jobId },
          data: {
            processed,
            created_count: createdCount,
            updated_count: updatedCount,
            error_count: errorCount,
            errors: errors as any,
            updated_at: new Date(),
          },
        });
      }

      await this.prisma.reservation_import_jobs.update({
        where: { id: jobId },
        data: {
          status: "completed",
          processed,
          created_count: createdCount,
          updated_count: updatedCount,
          error_count: errorCount,
          errors: errors as any,
          updated_at: new Date(),
        },
      });
    } catch (err: any) {
      this.logger.error(`Falha no job ${jobId}: ${err?.message || err}`);
      await this.prisma.reservation_import_jobs.update({
        where: { id: jobId },
        data: {
          status: "failed",
          errors: [
            ...errors,
            { code: "JOB_FAILED", message: err?.message || "Falha no processamento do job" },
          ] as any,
          updated_at: new Date(),
        },
      });
      throw err;
    }
  }

  private async upsertReservation(
    establishmentId: string,
    item: ReservationImportItem,
    index: number,
  ): Promise<"created" | "updated"> {
    if (!item?.checkin_date || !item?.checkout_date) {
      throwImportError({
        code: "MISSING_DATES",
        reservation_code: item?.reservation_code,
        guest_name: item?.guest?.full_name,
        message: "checkin_date e checkout_date são obrigatórios",
        index,
      });
    }

    const mapping = item.mapping || {};
    const category = await this.resolveByExternalCode(
      "room_categories",
      establishmentId,
      mapping.category_external_code,
      "category_external_code",
      item,
      index,
      true,
    );
    const room = await this.resolveByExternalCode(
      "rooms",
      establishmentId,
      mapping.room_external_code,
      "room_external_code",
      item,
      index,
      false,
    );
    const plan = await this.resolveByExternalCode(
      "pricing_plans",
      establishmentId,
      mapping.pricing_plan_external_code,
      "pricing_plan_external_code",
      item,
      index,
      false,
    );
    if (mapping.building_external_code) {
      await this.resolveByExternalCode(
        "buildings",
        establishmentId,
        mapping.building_external_code,
        "building_external_code",
        item,
        index,
        false,
      );
    }

    if (!category?.id) {
      throwImportError({
        code: "MAPPING_REQUIRED",
        reservation_code: item.reservation_code,
        guest_name: item.guest?.full_name,
        mapping_field: "category_external_code",
        external_code: mapping.category_external_code || null,
        message: "Categoria (category_external_code) é obrigatória para importar a reserva",
        index,
      });
    }

    if (room?.category_id && room.category_id !== category.id) {
      // allow but prefer mapped room category if category omitted would have failed already
    }

    const existing = await this.findExistingReservation(establishmentId, item);
    const financialId = await this.upsertClient(establishmentId, item.financial_responsible);
    const guestId = await this.upsertClient(establishmentId, item.guest);
    const guestName =
      item.guest?.full_name ||
      item.financial_responsible?.full_name ||
      existing?.guest_name ||
      null;

    const data = {
      category_id: category.id,
      room_id: room?.id || null,
      pricing_plan_id: plan?.id || null,
      client_id: financialId,
      guest_id: guestId,
      guest_name: guestName,
      checkin_date: parseDateOnly(item.checkin_date!),
      checkout_date: parseDateOnly(item.checkout_date!),
      checkin_time: parseTime(item.checkin_time),
      checkout_time: parseTime(item.checkout_time),
      adults: Number(item.adults ?? 1) || 1,
      children: Number(item.children ?? 0) || 0,
      status: mapStatus(item.status || "confirmed") as any,
      payment_status: mapPaymentStatus(item.payment_status || "pending") as any,
      total_amount: toDecimal(item.total_amount ?? 0),
      paid_amount: toDecimal(item.paid_amount ?? 0),
      notes: item.notes || null,
      channel: item.channel || "import",
      establishment_id: establishmentId,
      updated_at: new Date(),
    };

    let reservationId: string;
    let result: "created" | "updated";

    if (existing) {
      await this.prisma.reservations.update({
        where: { id: existing.id },
        data,
      });
      reservationId = existing.id;
      result = "updated";
    } else {
      const code =
        (item.reservation_code && String(item.reservation_code).trim()) ||
        (await this.generateReservationCode());
      const created = await this.prisma.reservations.create({
        data: {
          ...data,
          reservation_code: code,
        },
      });
      reservationId = created.id;
      result = "created";
    }

    if (Array.isArray(item.payments)) {
      await this.prisma.payments.deleteMany({ where: { reservation_id: reservationId } });
      for (const pay of item.payments) {
        const amount = Number(pay.amount);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        await this.prisma.payments.create({
          data: {
            reservation_id: reservationId,
            establishment_id: establishmentId,
            amount: toDecimal(amount),
            payment_method: pay.payment_method || "import",
            payment_date: pay.payment_date ? new Date(pay.payment_date) : new Date(),
            notes: pay.notes || null,
          },
        });
      }
    }

    if (item.checkin) {
      await this.upsertWebCheckin(establishmentId, reservationId, item);
    }

    return result;
  }

  private async findExistingReservation(establishmentId: string, item: ReservationImportItem) {
    const locator =
      (item.checkin?.locator && String(item.checkin.locator).trim()) ||
      (item.reservation_code && String(item.reservation_code).trim()) ||
      null;

    if (locator) {
      const wc = await this.prisma.web_checkin.findFirst({
        where: { establishment_id: establishmentId, locator },
        select: { reservation_id: true },
      });
      if (wc?.reservation_id) {
        const byWc = await this.prisma.reservations.findFirst({
          where: { id: wc.reservation_id, establishment_id: establishmentId },
        });
        if (byWc) return byWc;
      }
    }

    if (item.reservation_code) {
      const byCode = await this.prisma.reservations.findFirst({
        where: {
          establishment_id: establishmentId,
          reservation_code: String(item.reservation_code).trim(),
        },
      });
      if (byCode) return byCode;
    }

    const idNum = parseIdentification(item.identification_number);
    if (idNum != null) {
      const byId = await this.prisma.reservations.findFirst({
        where: {
          establishment_id: establishmentId,
          identification_number: idNum,
        },
      });
      if (byId) return byId;
    }

    return null;
  }

  private async resolveByExternalCode(
    table: "buildings" | "room_categories" | "rooms" | "pricing_plans",
    establishmentId: string,
    code: string | null | undefined,
    mappingField: string,
    item: ReservationImportItem,
    index: number,
    required: boolean,
  ): Promise<any | null> {
    const value = code != null ? String(code).trim() : "";
    if (!value) {
      if (required) {
        throwImportError({
          code: "MAPPING_MISSING",
          reservation_code: item.reservation_code,
          guest_name: item.guest?.full_name || item.financial_responsible?.full_name,
          mapping_field: mappingField,
          external_code: null,
          message: `Campo de mapeamento ${mappingField} é obrigatório`,
          index,
        });
      }
      return null;
    }

    const row = await (this.prisma as any)[table].findFirst({
      where: { establishment_id: establishmentId, external_pms_code: value },
    });
    if (!row) {
      throwImportError({
        code: "MAPPING_NOT_FOUND",
        reservation_code: item.reservation_code,
        guest_name: item.guest?.full_name || item.financial_responsible?.full_name,
        mapping_field: mappingField,
        external_code: value,
        message: `Código externo "${value}" não encontrado em ${mappingField}`,
        index,
      });
    }
    return row;
  }

  private async upsertClient(establishmentId: string, person?: ReservationImportPerson | null) {
    if (!person?.full_name && !person?.document_number && !person?.email) return null;
    const fullName = (person.full_name || "Cliente importado").trim();
    const documentNumber = person.document_number ? String(person.document_number).trim() : null;
    const email = person.email ? String(person.email).trim().toLowerCase() : null;

    let existing = null as { id: string } | null;
    if (documentNumber) {
      existing = await this.prisma.clients.findFirst({
        where: { establishment_id: establishmentId, document_number: documentNumber },
        select: { id: true },
      });
    }
    if (!existing && email) {
      existing = await this.prisma.clients.findFirst({
        where: { establishment_id: establishmentId, email },
        select: { id: true },
      });
    }

    const data = {
      full_name: fullName,
      email,
      phone: person.phone || null,
      document_type: person.document_type || null,
      document_number: documentNumber,
      birth_date: person.birth_date ? parseDateOnly(person.birth_date) : null,
      nationality: person.nationality || null,
      address: person.address || null,
      city: person.city || null,
      state: person.state || null,
      postal_code: person.postal_code || null,
      country: person.country || "Brasil",
      notes: person.notes || null,
      establishment_id: establishmentId,
      updated_at: new Date(),
    };

    if (existing) {
      await this.prisma.clients.update({ where: { id: existing.id }, data });
      return existing.id;
    }
    const created = await this.prisma.clients.create({ data });
    return created.id;
  }

  private async upsertWebCheckin(
    establishmentId: string,
    reservationId: string,
    item: ReservationImportItem,
  ) {
    const locator =
      (item.checkin?.locator && String(item.checkin.locator).trim()) ||
      (item.reservation_code && String(item.reservation_code).trim()) ||
      (await this.generateReservationCode());
    const completed = !!item.checkin?.completed;
    const existing = await this.prisma.web_checkin.findUnique({
      where: { reservation_id: reservationId },
    });

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    let webCheckinId: string;
    if (existing) {
      await this.prisma.web_checkin.update({
        where: { id: existing.id },
        data: {
          locator,
          status: completed ? "completed" : existing.status || "pending",
          completed_at: completed ? existing.completed_at || new Date() : existing.completed_at,
          updated_at: new Date(),
        },
      });
      webCheckinId = existing.id;
    } else {
      const created = await this.prisma.web_checkin.create({
        data: {
          reservation_id: reservationId,
          establishment_id: establishmentId,
          token: randomUUID().replace(/-/g, ""),
          locator,
          status: completed ? "completed" : "pending",
          completed_at: completed ? new Date() : null,
          expires_at: expiresAt,
        },
      });
      webCheckinId = created.id;
    }

    const guests = item.checkin?.guests;
    if (Array.isArray(guests)) {
      await this.prisma.web_checkin_guests.deleteMany({ where: { web_checkin_id: webCheckinId } });
      let order = 0;
      for (const g of guests) {
        if (!g?.name) continue;
        await this.prisma.web_checkin_guests.create({
          data: {
            web_checkin_id: webCheckinId,
            name: g.name,
            document_number: g.document_number || null,
            document_type: g.document_type || null,
            email: g.email || null,
            phone: g.phone || null,
            birth_date: g.birth_date ? parseDateOnly(g.birth_date) : null,
            is_main_guest: !!g.is_main_guest,
            nationality: g.nationality || null,
            city: g.city || null,
            state: g.state || null,
            country: g.country || null,
            postal_code: g.postal_code || null,
            street: g.street || null,
            number: g.number || null,
            neighborhood: g.neighborhood || null,
            order: order++,
          },
        });
      }
    }
  }

  private async generateReservationCode() {
    for (let i = 0; i < 8; i++) {
      const code = randomBytes(4).toString("hex").toUpperCase();
      const exists = await this.prisma.reservations.findUnique({
        where: { reservation_code: code },
        select: { id: true },
      });
      if (!exists) return code;
    }
    return `IMP${Date.now().toString(36).toUpperCase()}`;
  }

  private serializeJob(job: any) {
    const total = job.total || 0;
    const processed = job.processed || 0;
    return {
      id: job.id,
      establishment_id: job.establishment_id,
      status: job.status,
      batch_size: job.batch_size,
      total,
      processed,
      created_count: job.created_count,
      updated_count: job.updated_count,
      error_count: job.error_count,
      errors: job.errors || [],
      progress_pct: total > 0 ? Math.round((processed / total) * 100) : 0,
      created_at: job.created_at,
      updated_at: job.updated_at,
    };
  }
}

function clampBatch(value?: number | null) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_BATCH;
  return Math.min(MAX_BATCH, Math.max(1, Math.floor(n)));
}

function isFeatureEnabled(config: unknown, establishmentId: string): boolean {
  if (!establishmentId) return false;
  if (typeof config === "boolean") return config;
  if (typeof config !== "object" || config === null) return false;
  const record = config as { enabled?: boolean; establishment_ids?: string[] };
  if (record.enabled !== true) return false;
  if (!Array.isArray(record.establishment_ids)) return true;
  return record.establishment_ids.includes(establishmentId);
}

function mapStatus(raw: string): StatusMap {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (s === "checkedin" || s === "checked_in") return "checked_in";
  if (s === "checkedout" || s === "checked_out") return "checked_out";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "pending") return "pending";
  return "confirmed";
}

function exportStatus(raw: string): string {
  const s = String(raw || "").toLowerCase();
  if (s === "checkedin") return "checked_in";
  if (s === "checkedout") return "checked_out";
  if (s === "noshow" || s === "no_show") return "cancelled";
  return s || "confirmed";
}

function mapPaymentStatus(raw: string): PayStatusMap {
  const s = String(raw || "")
    .trim()
    .toLowerCase();
  if (s === "partial" || s === "paid" || s === "refunded" || s === "pending") return s;
  return "pending";
}

function parseDateOnly(value: string): Date {
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new BadRequestException(`Data inválida: ${value}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function parseTime(value?: string | null): Date | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const d = new Date("1970-01-01T00:00:00.000Z");
  d.setUTCHours(Number(m[1]), Number(m[2]), Number(m[3] || 0), 0);
  return d;
}

function formatDateOnly(value?: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function formatTime(value?: Date | null): string | null {
  if (!value) return null;
  const iso = value.toISOString();
  return iso.slice(11, 16);
}

function toDecimal(value: number | string) {
  return new Prisma.Decimal(Number(value) || 0);
}

function parseIdentification(value: string | number | null | undefined): bigint | null {
  if (value == null || value === "") return null;
  const raw = String(value).replace(/^#/, "").trim();
  if (!/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

function personFromClient(client: any): ReservationImportPerson | null {
  if (!client) return null;
  return {
    full_name: client.full_name,
    email: client.email,
    phone: client.phone,
    document_type: client.document_type,
    document_number: client.document_number,
    birth_date: client.birth_date ? formatDateOnly(client.birth_date) : null,
    nationality: client.nationality,
    address: client.address,
    city: client.city,
    state: client.state,
    postal_code: client.postal_code,
    country: client.country,
    notes: client.notes,
  };
}

function throwImportError(error: ReservationImportError): never {
  const err = new Error(error.message) as Error & { importError: ReservationImportError };
  err.importError = error;
  throw err;
}
