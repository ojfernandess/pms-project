import { Injectable } from "@nestjs/common";
import { Prisma, reservation_status } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { PrismaService } from "../prisma/prisma.service";

type Result = { status: number; body: Record<string, unknown> };
type RuleRow = {
  id: string;
  name: string;
  trigger_type: string;
  trigger_condition: Prisma.JsonValue;
  adjustment_type: string;
  adjustment_value: Prisma.Decimal;
  priority: number;
  use_occupancy: boolean | null;
  use_pickup_rate: boolean | null;
  use_local_events: boolean | null;
  use_establishment_occupancy: boolean | null;
  applicable_categories: string[];
  applicable_plans: string[];
};

const ACTIVE_STAY: reservation_status[] = [
  reservation_status.confirmed,
  reservation_status.checkedin,
];

@Injectable()
export class ApplyDynamicPricingRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: StaffIdentityService,
    private readonly auth: AuthService,
  ) {}

  async run(authorization: string | undefined, body: unknown): Promise<Result> {
    if (!authorization) return { status: 401, body: { error: "Não autorizado" } };
    const userId = await this.identity.resolve(authorization);
    if (!userId) return { status: 401, body: { error: "Sessão inválida ou expirada" } };

    const payload = asRecord(body);
    const establishmentId = text(payload?.establishment_id);
    const categoryId = text(payload?.category_id);
    const planId = text(payload?.pricing_plan_id);
    const date = text(payload?.date);
    const adults = Math.max(1, numberOr(payload?.adults, 1));
    const children = Math.max(0, numberOr(payload?.children, 0));
    if (!establishmentId || !categoryId || !planId || !date) {
      return { status: 400, body: { error: "establishment_id, category_id, pricing_plan_id e date são obrigatórios" } };
    }

    try {
      await this.auth.assertEstablishment(await this.auth.me(userId), establishmentId);
    } catch {
      return { status: 403, body: { error: "Sem permissão para este estabelecimento" } };
    }

    const day = utcDate(date);
    const [settingsRow, calendar, category, persisted] = await Promise.all([
      this.prisma.hotel_settings.findFirst({ where: { establishment_id: establishmentId }, select: { rate_system_settings: true } }),
      this.prisma.rate_calendar.findFirst({
        where: { establishment_id: establishmentId, category_id: categoryId, pricing_plan_id: planId, date: day },
        select: { base_price: true, occupancy_percentage: true, projected_occupancy: true, pickup_rate: true },
      }),
      this.prisma.room_categories.findFirst({ where: { id: categoryId, establishment_id: establishmentId }, select: { base_price: true } }),
      this.prisma.dynamic_pricing_results.findUnique({
        where: {
          establishment_id_category_id_rate_plan_id_date: {
            establishment_id: establishmentId,
            category_id: categoryId,
            rate_plan_id: planId,
            date: day,
          },
        },
        select: { base_price: true, final_price: true, rule_id_applied: true, occupancy_snapshot: true, pickup_snapshot: true },
      }),
    ]);

    const autoApply = jsonFlag(settingsRow?.rate_system_settings, "auto_apply_dynamic_rules");
    const persist = jsonFlag(settingsRow?.rate_system_settings, "persist_dynamic_rates");

    const finalPrice = await this.finalPrice(establishmentId, categoryId, planId, date, adults, children);
    let basePrice = Number(calendar?.base_price ?? category?.base_price ?? 0);
    if (basePrice <= 0 && persisted) basePrice = Number(persisted.base_price);

    const [categoryOcc, establishmentOcc, pickupRate, event] = await Promise.all([
      this.categoryOccupancy(establishmentId, categoryId, date),
      this.establishmentOccupancy(establishmentId, date),
      this.pickupRate(establishmentId, categoryId, date, Number(calendar?.pickup_rate)),
      this.localEvent(establishmentId, date),
    ]);

    const occupancy =
      categoryOcc >= 0
        ? categoryOcc
        : Number(calendar?.occupancy_percentage ?? calendar?.projected_occupancy ?? 0);

    let adjustments: Array<Record<string, unknown>> = [];
    if (autoApply) {
      if (persist && persisted?.rule_id_applied) {
        const rule = await this.prisma.dynamic_pricing_rules.findUnique({ where: { id: persisted.rule_id_applied } });
        if (rule) {
          adjustments = [
            {
              rule_id: rule.id,
              rule_name: rule.name,
              adjustment_type: rule.adjustment_type,
              adjustment_value: Number(rule.adjustment_value),
              final_adjustment: Number(persisted.final_price) - Number(persisted.base_price),
            },
          ];
        }
      } else {
        adjustments = await this.matchedAdjustments(establishmentId, categoryId, planId, date, {
          categoryOccupancy: categoryOcc,
          establishmentOccupancy: establishmentOcc,
          pickupRate,
          hasLocalEvent: event.hasEvent,
        });
      }
    }

    const resolvedFinal = persist && persisted && autoApply ? Number(persisted.final_price) : finalPrice;
    const resolvedBase = persist && persisted && autoApply ? Number(persisted.base_price) : basePrice;

    return {
      status: 200,
      body: {
        final_price: resolvedFinal,
        base_price: resolvedBase > 0 ? resolvedBase : resolvedFinal,
        adjustments_applied: adjustments,
        auto_apply_enabled: autoApply,
        metrics: {
          occupancy,
          pickup_rate: pickupRate,
          has_local_event: event.hasEvent,
          event_impact: event.impact,
        },
      },
    };
  }

  private async finalPrice(
    establishmentId: string,
    categoryId: string,
    planId: string,
    date: string,
    adults: number,
    children: number,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ price: string | number | null }>>`
      SELECT public.calculate_rate_price(
        ${establishmentId}::uuid,
        ${categoryId}::uuid,
        ${planId}::uuid,
        ${date}::date,
        ${adults}::int,
        ${children}::int
      ) AS price
    `;
    return rows[0]?.price == null ? 0 : Number(rows[0].price);
  }

  private async categoryOccupancy(establishmentId: string, categoryId: string, date: string): Promise<number> {
    const [total, occupied] = await Promise.all([
      this.prisma.rooms.count({ where: { establishment_id: establishmentId, category_id: categoryId } }),
      this.prisma.reservations.count({
        where: {
          establishment_id: establishmentId,
          status: { in: ACTIVE_STAY },
          cancelled_at: null,
          checkin_date: { lte: utcDate(date) },
          checkout_date: { gt: utcDate(date) },
          rooms: { category_id: categoryId },
        },
      }),
    ]);
    return total > 0 ? (occupied / total) * 100 : 0;
  }

  private async establishmentOccupancy(establishmentId: string, date: string): Promise<number> {
    const [total, occupied] = await Promise.all([
      this.prisma.rooms.count({ where: { establishment_id: establishmentId } }),
      this.prisma.reservations.count({
        where: {
          establishment_id: establishmentId,
          status: { in: ACTIVE_STAY },
          cancelled_at: null,
          checkin_date: { lte: utcDate(date) },
          checkout_date: { gt: utcDate(date) },
        },
      }),
    ]);
    return total > 0 ? (occupied / total) * 100 : 0;
  }

  private async pickupRate(establishmentId: string, categoryId: string, date: string, fromCalendar: number): Promise<number> {
    if (fromCalendar > 0) return fromCalendar;
    const rows = await this.prisma.$queryRaw<Array<{ rate: string | number | null }>>`
      SELECT public.calculate_pickup_rate(${establishmentId}::uuid, ${categoryId}::uuid, ${date}::date, 7) AS rate
    `;
    return rows[0]?.rate == null ? 0 : Number(rows[0].rate);
  }

  private async localEvent(establishmentId: string, date: string): Promise<{ hasEvent: boolean; impact: number }> {
    const d = utcDate(date);
    const events = await this.prisma.local_events.findMany({
      where: { establishment_id: establishmentId, is_active: true, start_date: { lte: d }, end_date: { gte: d } },
      select: { expected_demand_increase: true },
    });
    if (!events.length) return { hasEvent: false, impact: 0 };
    const impact = Math.max(...events.map((row) => Number(row.expected_demand_increase ?? 0)));
    return { hasEvent: true, impact };
  }

  private async matchedAdjustments(
    establishmentId: string,
    categoryId: string,
    planId: string,
    date: string,
    ctx: { categoryOccupancy: number; establishmentOccupancy: number; pickupRate: number; hasLocalEvent: boolean },
  ): Promise<Array<Record<string, unknown>>> {
    const rules = await this.prisma.dynamic_pricing_rules.findMany({
      where: {
        establishment_id: establishmentId,
        is_active: true,
        AND: [
          { OR: [{ start_date: null }, { start_date: { lte: utcDate(date) } }] },
          { OR: [{ end_date: null }, { end_date: { gte: utcDate(date) } }] },
        ],
      },
      orderBy: [{ priority: "asc" }, { created_at: "asc" }],
    });

    const roomCount = await this.prisma.rooms.count({ where: { establishment_id: establishmentId, category_id: categoryId } });
    const scale = scaleFactor(roomCount);
    const dayOfWeek = utcDate(date).getUTCDay();
    const daysUntil = Math.floor((utcDate(date).getTime() - startOfTodayUtc().getTime()) / 86400000);

    const out: Array<Record<string, unknown>> = [];
    for (const rule of rules as RuleRow[]) {
      if (rule.applicable_categories?.length && !rule.applicable_categories.includes(categoryId)) continue;
      if (rule.applicable_plans?.length && !rule.applicable_plans.includes(planId)) continue;

      const condition = asRecord(rule.trigger_condition);
      let shouldApply = false;
      let finalAdjustment = Number(rule.adjustment_value) * scale;

      if (rule.trigger_type === "occupancy") {
        const occ =
          rule.use_establishment_occupancy === true
            ? ctx.establishmentOccupancy
            : rule.use_occupancy === false
              ? NaN
              : ctx.categoryOccupancy;
        if (!Number.isFinite(occ) || occ < 0) continue;
        const ranges = Array.isArray(condition?.occupancy_ranges) ? condition.occupancy_ranges : null;
        if (ranges?.length) {
          for (const item of ranges) {
            const row = asRecord(item);
            const min = numberOr(row?.min, NaN);
            const max = numberOr(row?.max, NaN);
            const adj = numberOr(row?.adjustment, NaN);
            if (Number.isFinite(min) && Number.isFinite(max) && occ >= min && occ <= max) {
              shouldApply = true;
              finalAdjustment = Number.isFinite(adj) ? adj * scale : finalAdjustment;
              break;
            }
          }
        } else {
          const minOcc = condition?.min_occupancy != null ? Number(condition.min_occupancy) : null;
          const maxOcc = condition?.max_occupancy != null ? Number(condition.max_occupancy) : null;
          if (minOcc == null && maxOcc == null) shouldApply = occ > 0;
          else {
            const min = minOcc ?? 0;
            const max = maxOcc ?? 100;
            shouldApply = occ >= min && occ <= max;
          }
        }
      } else if (rule.trigger_type === "booking_velocity") {
        if (rule.use_pickup_rate === false) continue;
        const minBookings = condition?.min_bookings != null ? Number(condition.min_bookings) : null;
        if (minBookings == null) shouldApply = ctx.pickupRate > 0;
        else shouldApply = ctx.pickupRate >= minBookings;
      } else if (rule.trigger_type === "day_of_week") {
        const days = Array.isArray(condition?.days) ? condition.days.map((d) => Number(d)) : [];
        shouldApply = days.length ? days.includes(dayOfWeek) : true;
      } else if (rule.trigger_type === "advance_booking") {
        const minDays = condition?.min_days != null ? Number(condition.min_days) : null;
        const maxDays = condition?.max_days != null ? Number(condition.max_days) : null;
        if (daysUntil < 0) continue;
        if (minDays == null && maxDays == null) shouldApply = true;
        else {
          const min = minDays ?? 0;
          const max = maxDays ?? 365;
          shouldApply = daysUntil >= min && daysUntil <= max;
        }
      } else if (rule.trigger_type === "custom") {
        shouldApply = true;
      } else if (rule.use_local_events && ctx.hasLocalEvent) {
        shouldApply = true;
      }

      if (!shouldApply) continue;
      out.push({
        rule_id: rule.id,
        rule_name: rule.name,
        adjustment_type: rule.adjustment_type,
        adjustment_value: Number(rule.adjustment_value),
        final_adjustment: finalAdjustment,
      });
    }
    return out;
  }
}

function jsonFlag(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  const flag = (value as Record<string, unknown>)[key];
  return flag === true || flag === "true" || flag === "1";
}

function scaleFactor(roomCount: number): number {
  if (roomCount >= 10) return 1;
  if (roomCount >= 5) return 0.75 + ((roomCount - 5) / 4) * 0.25;
  if (roomCount >= 2) return 0.6 + ((roomCount - 2) / 2) * 0.15;
  if (roomCount === 1) return 0.5;
  return 1;
}

function utcDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
