import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NoShowService {
  constructor(private readonly prisma: PrismaService) {}

  async run(establishmentId: string | null) {
    const rows = establishmentId
      ? await this.prisma.$queryRaw<Array<{ processed: number }>>`
          SELECT public.process_no_shows(${establishmentId}::uuid)::int AS processed
        `
      : await this.prisma.$queryRaw<Array<{ processed: number }>>`
          SELECT public.process_no_shows(NULL)::int AS processed
        `;
    const processed = Number(rows[0]?.processed ?? 0);
    return {
      success: true,
      processed,
      method: "rpc",
      message: `${processed} no-show(s) processado(s)`,
    };
  }
}
