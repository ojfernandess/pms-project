import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { SessionUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CompaniesService } from "./companies.service";
import { EstablishmentsService } from "./establishments.service";

@Controller("companies")
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly establishments: EstablishmentsService,
  ) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.companies.list(user);
  }

  @Get(":companyId")
  get(@CurrentUser() user: SessionUser, @Param("companyId") companyId: string) {
    return this.companies.get(user, companyId);
  }

  @Get(":companyId/establishments")
  establishmentsByCompany(@CurrentUser() user: SessionUser, @Param("companyId") companyId: string) {
    return this.establishments.listByCompany(user, companyId);
  }
}
