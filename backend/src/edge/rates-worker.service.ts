import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

const REDIS_TTL_SEC = 900;
const MAX_ENRICH = 300;
const MAX_VIRTUAL_BASE_PLAN = 200;
const BATCH_SIZE = 25;

@Injectable()
export class RatesWorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: StaffIdentityService,
    private readonly redis: RedisService,
  ) {}

  async recalc(authorization: string | undefined, establishmentId: string | undefined, daysAheadRaw: string | undefined) {
    if (!authorization) return { status: 401, body: { error: "Autorização obrigatória" } };
    const daysAhead = Math.min(Number.parseInt(daysAheadRaw || "7", 10) || 7, 30);
    const today = new Date().toISOString().split("T")[0];
    const end = new Date();
    end.setDate(end.getDate() + daysAhead - 1);
    const endDate = end.toISOString().split("T")[0];
    const establishmentIds = establishmentId
      ? [establishmentId]
      : (await this.prisma.establishments.findMany({ where: { is_active: true }, select: { id: true } })).map((row) => row.id);
    let totalUpdated = 0;
    const results: Array<{ establishment_id: string; updated: number }> = [];
    for (const estId of establishmentIds) {
      const settings = await this.prisma.hotel_settings.findFirst({
        where: { establishment_id: estId },
        select: { rate_system_settings: true, public_pricing_plan_1_id: true, public_pricing_plan_2_id: true },
      });
      const persist = jsonFlag(settings?.rate_system_settings, "persist_dynamic_rates");
      if (!persist) continue;
      const categories = await this.prisma.room_categories.findMany({ where: { establishment_id: estId }, select: { id: true, base_price: true } });
      const plans = await this.prisma.pricing_plans.findMany({ where: { establishment_id: estId, is_active: true }, select: { id: true } });
      const planIds = [...new Set([settings?.public_pricing_plan_1_id, settings?.public_pricing_plan_2_id, ...plans.map((plan) => plan.id)].filter(Boolean))] as string[];
      const rows: Prisma.dynamic_pricing_resultsCreateManyInput[] = [];
      for (const category of categories) {
        for (const planId of planIds) {
          const cursor = new Date(today);
          const last = new Date(endDate);
          while (cursor <= last) {
            const date = cursor.toISOString().split("T")[0];
            const calendar = await this.prisma.rate_calendar.findFirst({
              where: { establishment_id: estId, category_id: category.id, pricing_plan_id: planId, date: new Date(`${date}T00:00:00.000Z`) },
              select: { base_price: true },
            });
            let basePrice = Number(calendar?.base_price ?? 0);
            if (basePrice <= 0) basePrice = Number(category.base_price ?? 0);
            const price = await this.price(estId, category.id, planId, date);
            if (price > 0 && basePrice > 0) {
              rows.push({
                establishment_id: estId,
                category_id: category.id,
                rate_plan_id: planId,
                date: new Date(`${date}T00:00:00.000Z`),
                base_price: basePrice,
                final_price: price,
                dynamic_adjustment_percent: Math.round(((price - basePrice) / basePrice) * 10000) / 100,
                last_recalculated_at: new Date(),
              });
            }
            cursor.setDate(cursor.getDate() + 1);
          }
        }
      }
      for (const row of rows) {
        await this.prisma.dynamic_pricing_results.upsert({
          where: {
            establishment_id_category_id_rate_plan_id_date: {
              establishment_id: row.establishment_id,
              category_id: row.category_id,
              rate_plan_id: row.rate_plan_id,
              date: row.date as Date,
            },
          },
          create: row,
          update: {
            base_price: row.base_price,
            final_price: row.final_price,
            dynamic_adjustment_percent: row.dynamic_adjustment_percent,
            last_recalculated_at: new Date(),
          },
        });
      }
      totalUpdated += rows.length;
      results.push({ establishment_id: estId, updated: rows.length });
    }
    return { status: 200, body: { success: true, total_updated: totalUpdated, establishments: results, period: { start: today, end: endDate } } };
  }

  async map(authorization: string | undefined, establishmentId: string | undefined, startDate: string | undefined, endDate: string | undefined) {
    if (!authorization) return { status: 401, body: { error: "Autorização obrigatória" } };
    const userId = await this.identity.resolve(authorization);
    if (!userId) return { status: 401, body: { error: "Token inválido" } };
    if (!establishmentId) return { status: 400, body: { error: "establishment_id é obrigatório" } };
    const entries = await this.prisma.rate_calendar.findMany({
      where: {
        establishment_id: establishmentId,
        ...(startDate || endDate
          ? { date: { ...(startDate ? { gte: new Date(`${startDate}T00:00:00.000Z`) } : {}), ...(endDate ? { lte: new Date(`${endDate}T00:00:00.000Z`) } : {}) } }
          : {}),
      },
      orderBy: { date: "asc" },
    }) as Array<Record<string, unknown>>;
    const settings = await this.prisma.hotel_settings.findFirst({
      where: { establishment_id: establishmentId },
      select: { rate_system_settings: true },
    });
    const persist = jsonFlag(settings?.rate_system_settings, "persist_dynamic_rates");
    const autoApply = jsonFlag(settings?.rate_system_settings, "auto_apply_dynamic_rules");
    const today = new Date().toISOString().split("T")[0];
    const defaultEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const dateMin = startDate || dateOnly(entries[0]?.date) || today;
    const dateMax = endDate || dateOnly(entries[entries.length - 1]?.date) || defaultEnd;
    const dynMap = new Map<string, { base_price: number; final_price: number }>();
    let enriched = false;
    if (persist && autoApply) {
      const dyn = await this.prisma.dynamic_pricing_results.findMany({
        where: { establishment_id: establishmentId, date: { gte: new Date(`${dateMin}T00:00:00.000Z`), lte: new Date(`${dateMax}T00:00:00.000Z`) } },
        select: { category_id: true, rate_plan_id: true, date: true, base_price: true, final_price: true },
      });
      for (const row of dyn) dynMap.set(`${row.category_id}:${row.rate_plan_id}:${dateOnly(row.date)}`, { base_price: Number(row.base_price), final_price: Number(row.final_price) });
      for (const entry of entries) {
        const hit = dynMap.get(`${entry.category_id}:${entry.pricing_plan_id}:${dateOnly(entry.date)}`);
        if (hit && hit.final_price > 0 && Math.abs(hit.final_price - Number(entry.base_price ?? 0)) > 0.01) {
          entry.original_base_price = hit.base_price;
          entry.base_price = hit.final_price;
          enriched = true;
        }
      }
    } else if (autoApply && entries.length > 0) {
      for (const entry of entries.slice(0, MAX_ENRICH)) {
        const original = Number(entry.base_price ?? 0);
        const price = await this.cachedPrice(establishmentId, String(entry.pricing_plan_id), String(entry.category_id), dateOnly(entry.date));
        if (price > 0 && Math.abs(price - original) > 0.01) {
          entry.original_base_price = original;
          entry.base_price = price;
          enriched = true;
        }
      }
    }
    const existing = new Set(entries.map((entry) => `${entry.pricing_plan_id}:${entry.category_id}:${dateOnly(entry.date)}`));
    const plans = await this.prisma.pricing_plans.findMany({
      where: { establishment_id: establishmentId, is_active: true, base_plan_id_for_rate: { not: null } },
      select: { id: true },
    });
    if (plans.length) {
      const links = await this.prisma.pricing_plan_categories.findMany({
        where: { pricing_plan_id: { in: plans.map((plan) => plan.id) } },
        select: { pricing_plan_id: true, category_id: true },
      });
      const tasks: Array<{ planId: string; catId: string; dateStr: string }> = [];
      for (const link of links) {
        for (let time = new Date(`${dateMin}T00:00:00.000Z`).getTime(); time <= new Date(`${dateMax}T00:00:00.000Z`).getTime() && tasks.length < MAX_VIRTUAL_BASE_PLAN; time += 86400000) {
          const dateStr = new Date(time).toISOString().split("T")[0];
          const key = `${link.pricing_plan_id}:${link.category_id}:${dateStr}`;
          if (!existing.has(key)) {
            tasks.push({ planId: link.pricing_plan_id, catId: link.category_id, dateStr });
            existing.add(key);
          }
        }
      }
      if (persist) {
        const bases = await this.prisma.room_categories.findMany({ where: { id: { in: [...new Set(tasks.map((task) => task.catId))] } }, select: { id: true, base_price: true } });
        const baseByCat = new Map(bases.map((row) => [row.id, Number(row.base_price ?? 0)]));
        for (const task of tasks) {
          const hit = dynMap.get(`${task.catId}:${task.planId}:${task.dateStr}`);
          const price = hit?.final_price ?? baseByCat.get(task.catId) ?? 0;
          if (price > 0) {
            entries.push({ id: randomUUID(), establishment_id: establishmentId, pricing_plan_id: task.planId, category_id: task.catId, date: task.dateStr, base_price: price, ...(hit ? { original_base_price: hit.base_price } : {}) });
            if (hit) enriched = true;
          }
        }
      } else {
        for (let index = 0; index < Math.min(tasks.length, MAX_VIRTUAL_BASE_PLAN); index += BATCH_SIZE) {
          const batch = await Promise.all(tasks.slice(index, index + BATCH_SIZE).map(async (task) => {
            const price = await this.cachedPrice(establishmentId, task.planId, task.catId, task.dateStr);
            return price > 0 ? { ...task, price } : null;
          }));
          for (const row of batch) {
            if (row) entries.push({ id: randomUUID(), establishment_id: establishmentId, pricing_plan_id: row.planId, category_id: row.catId, date: row.dateStr, base_price: row.price });
          }
        }
      }
      if (tasks.length) entries.sort((left, right) => dateOnly(left.date).localeCompare(dateOnly(right.date)));
    }
    return { status: 200, body: { rateCalendar: serialize(entries), ...(enriched ? { _enriched: true } : {}) } };
  }

  private async cachedPrice(establishmentId: string, planId: string, categoryId: string, date: string) {
    const key = `rate:${establishmentId}:${planId}:${categoryId}:${date}`;
    try {
      const cached = await this.redis.client.get(key);
      const value = cached == null ? 0 : Number(cached);
      if (value > 0) return value;
    } catch {
      // Cache indisponível não impede o cálculo.
    }
    const price = await this.price(establishmentId, categoryId, planId, date);
    if (price > 0) await this.redis.client.set(key, String(price), "EX", REDIS_TTL_SEC).catch(() => undefined);
    return price;
  }

  private async price(establishmentId: string, categoryId: string, planId: string, date: string) {
    const rows = await this.prisma.$queryRaw<Array<{ price: string | number | null }>>`
      SELECT public.calculate_rate_price(${establishmentId}::uuid, ${categoryId}::uuid, ${planId}::uuid, ${date}::date, 2::int, 0::int) AS price
    `;
    return rows[0]?.price == null ? 0 : Number(rows[0].price);
  }
}

function jsonFlag(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") return false;
  const flag = (value as Record<string, unknown>)[key];
  return flag === true || flag === "true";
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().split("T")[0];
  return String(value ?? "").slice(0, 10);
}

function serialize(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item && typeof item === "object" && "toFixed" in item) return Number(item);
    return item;
  }));
}
