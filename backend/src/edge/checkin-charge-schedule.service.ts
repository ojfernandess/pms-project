import { Injectable } from "@nestjs/common";
import { reservation_status } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CheckinChargeService } from "./checkin-charge.service";

const OPEN_STATUSES = [reservation_status.pending, reservation_status.unpaid, reservation_status.confirmed];

@Injectable()
export class CheckinChargeScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly charges: CheckinChargeService,
  ) {}

  async run(establishmentId?: string) {
    const ids: string[] = [];
    const dayConfigs = await this.prisma.checkin_charge_config.findMany({
      where: { enabled: true, send_timing: "days_before_checkin", days_before_checkin: { not: null } },
      select: { establishment_id: true, days_before_checkin: true },
    });
    const today = new Date();
    for (const config of dayConfigs) {
      if (establishmentId && config.establishment_id !== establishmentId) continue;
      const target = new Date(today);
      target.setUTCDate(target.getUTCDate() + Number(config.days_before_checkin || 0));
      const start = new Date(`${target.toISOString().split("T")[0]}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      ids.push(...await this.pending(config.establishment_id, { checkin_date: { gte: start, lt: end }, status: { in: OPEN_STATUSES } }));
    }
    const otaConfigs = await this.prisma.checkin_charge_config.findMany({
      where: { enabled: true, send_timing: "after_ota" },
      select: { establishment_id: true },
    });
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    for (const config of otaConfigs) {
      if (establishmentId && config.establishment_id !== establishmentId) continue;
      ids.push(...await this.pending(config.establishment_id, { created_at: { gte: since }, status: { in: OPEN_STATUSES }, channel: { not: "direct" } }));
    }
    const unique = [...new Set(ids)];
    if (!unique.length) return { status: 200, body: { success: true, sent: 0, message: "Nenhuma reserva elegível para envio automático." } };
    const sent = await this.charges.run({ reservation_ids: unique, intent: "checkin_reminder" });
    const results = ((sent.body as { results?: Array<{ success: boolean }> }).results ?? []);
    return {
      status: sent.status,
      body: { success: sent.status < 300, sent: results.filter((row) => row.success).length, errors: results.filter((row) => !row.success).length, total: unique.length, results },
    };
  }

  private async pending(establishmentId: string, where: Record<string, unknown>) {
    const sent = await this.prisma.checkin_charges.findMany({ where: { establishment_id: establishmentId, sent_at: { not: null } }, select: { reservation_id: true } });
    const sentIds = new Set(sent.map((row) => row.reservation_id));
    const reservations = await this.prisma.reservations.findMany({ where: { establishment_id: establishmentId, ...where }, select: { id: true } });
    return reservations.map((row) => row.id).filter((id) => !sentIds.has(id));
  }
}
