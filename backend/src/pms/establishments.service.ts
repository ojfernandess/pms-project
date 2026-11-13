import { Injectable, NotFoundException } from "@nestjs/common";
import { AuthService, SessionUser } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { establishmentPublicSelect } from "./company.select";

@Injectable()
export class EstablishmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async listByCompany(user: SessionUser, companyId: string) {
    this.auth.assertCompany(user, companyId);
    return this.prisma.establishments.findMany({
      where: { company_id: companyId },
      select: establishmentPublicSelect,
      orderBy: { name: "asc" },
    });
  }

  async get(user: SessionUser, establishmentId: string) {
    await this.auth.assertEstablishment(user, establishmentId);
    const establishment = await this.prisma.establishments.findUnique({
      where: { id: establishmentId },
      select: establishmentPublicSelect,
    });
    if (!establishment) throw new NotFoundException("Establishment not found");
    return establishment;
  }
}
