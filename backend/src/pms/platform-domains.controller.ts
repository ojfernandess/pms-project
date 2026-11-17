import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { SessionUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PlatformDomainsService } from "../edge/platform-domains.service";

@Controller("platform-custom-domains")
@UseGuards(JwtAuthGuard)
export class PlatformDomainsController {
  constructor(private readonly domains: PlatformDomainsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.domains.listAll(user);
  }

  @Post()
  create(
    @CurrentUser() user: SessionUser,
    @Body() body: { hostname?: string; company_id?: string | null; service_type?: "web_checkin" | "booking_engine" },
  ) {
    return this.domains.create(user, {
      hostname: body.hostname ?? "",
      company_id: body.company_id,
      service_type: body.service_type,
    });
  }

  @Post("import-legacy-web-checkin")
  importLegacy(@CurrentUser() user: SessionUser) {
    return this.domains.importLegacyFromSiteSettings(user);
  }

  @Post(":id/verify")
  verify(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.domains.verify(user, id);
  }

  @Get(":id/diagnose")
  diagnose(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.domains.diagnose(user, id);
  }

  @Patch(":id/status")
  setStatus(
    @CurrentUser() user: SessionUser,
    @Param("id") id: string,
    @Body() body: { status?: "active" | "suspended" | "pending_verification" },
  ) {
    return this.domains.setStatus(user, id, body.status ?? "pending_verification");
  }

  @Delete(":id")
  remove(@CurrentUser() user: SessionUser, @Param("id") id: string) {
    return this.domains.remove(user, id);
  }
}