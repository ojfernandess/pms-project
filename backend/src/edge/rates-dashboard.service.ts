import { Injectable } from "@nestjs/common";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RatesDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: StaffIdentityService,
  ) {}

  async run(authorization: string | undefined, establishmentId: string | undefined) {
    if (!authorization) return { status: 401, body: { error: "Autorização obrigatória" } };
    if (!establishmentId) return { status: 400, body: { error: "establishment_id é obrigatório" } };
    const userId = await this.identity.resolve(authorization);
    if (!userId) return { status: 401, body: { error: "Token inválido" } };

    const [categories, ratePlans, planTypes, hotelSettings] = await Promise.all([
      this.prisma.room_categories.findMany({
        where: { establishment_id: establishmentId },
        select: { id: true, name: true, base_price: true },
        orderBy: { name: "asc" },
      }),
      this.prisma.pricing_plans.findMany({
        where: { establishment_id: establishmentId, is_active: true },
        select: { id: true, name: true, code: true, plan_type: true, is_active: true },
        orderBy: [{ sort_order: "asc" }, { name: "asc" }],
      }),
      this.prisma.pricing_plan_types.findMany({
        where: { is_active: true },
        select: { id: true, name: true, description: true, color: true, is_active: true },
        orderBy: [{ sort_order: "asc" }, { name: "asc" }],
      }),
      this.prisma.hotel_settings.findFirst({
        where: { establishment_id: establishmentId },
        select: { rate_system_settings: true },
      }),
    ]);

    return {
      status: 200,
      body: {
        categories: categories.map((row) => ({ ...row, base_price: Number(row.base_price) })),
        ratePlans,
        planTypes,
        hotelSettings,
      },
    };
  }
}
