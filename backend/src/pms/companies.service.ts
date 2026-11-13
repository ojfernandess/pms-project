import { Injectable, NotFoundException } from "@nestjs/common";
import { AuthService, SessionUser } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { companyPublicSelect } from "./company.select";

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  list(user: SessionUser) {
    return this.prisma.companies.findMany({
      where: user.isSuperAdmin ? {} : { id: { in: user.companyIds } },
      select: companyPublicSelect,
      orderBy: { name: "asc" },
    });
  }

  async get(user: SessionUser, companyId: string) {
    this.auth.assertCompany(user, companyId);
    const company = await this.prisma.companies.findUnique({
      where: { id: companyId },
      select: companyPublicSelect,
    });
    if (!company) throw new NotFoundException("Company not found");
    return company;
  }
}
