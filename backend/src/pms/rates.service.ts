import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RatesService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(input: {
    p_establishment_id: string;
    p_category_id: string;
    p_pricing_plan_id: string;
    p_date: string;
    p_adults?: number;
    p_children?: number;
  }) {
    if (!input.p_establishment_id || !input.p_category_id || !input.p_pricing_plan_id || !input.p_date) {
      throw new BadRequestException("Parâmetros do tarifário incompletos");
    }
    const rows = await this.prisma.$queryRaw<Array<{ price: string | number | null }>>`
      SELECT public.calculate_rate_price(
        ${input.p_establishment_id}::uuid,
        ${input.p_category_id}::uuid,
        ${input.p_pricing_plan_id}::uuid,
        ${input.p_date}::date,
        ${input.p_adults ?? 1}::int,
        ${input.p_children ?? 0}::int
      ) AS price
    `;
    return { data: rows[0]?.price == null ? 0 : Number(rows[0].price) };
  }
}
