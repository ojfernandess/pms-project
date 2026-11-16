import { Controller, Get, Query } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  check(@Query("deep") deep?: string) {
    const includeSchema = deep === "1" || deep === "true";
    return this.health.check(includeSchema);
  }
}
