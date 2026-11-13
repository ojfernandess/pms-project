import { Controller, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SystemQueueService } from "./system-queue.service";

@Controller("internal/queues")
export class SystemQueueController {
  constructor(
    private readonly queues: SystemQueueService,
    private readonly config: ConfigService,
  ) {}

  @Post("ping")
  async ping(@Headers("x-internal-token") token?: string) {
    const expected = this.config.get<string>("INTERNAL_API_TOKEN") ?? "";
    if (!expected || token !== expected) {
      throw new UnauthorizedException("Invalid internal token");
    }
    const job = await this.queues.enqueuePing();
    return { queue: "system", jobId: job.id, name: "ping" };
  }
}
