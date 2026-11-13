import { InjectQueue, Processor, WorkerHost } from "@nestjs/bullmq";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Job, Queue } from "bullmq";
import { CheckoutRemindersService } from "../edge/checkout-reminders.service";
import { DailyDigestService } from "../edge/daily-digest.service";
import { PMS_QUEUE } from "./queue.constants";

@Injectable()
@Processor(PMS_QUEUE)
export class PmsScheduleProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(PmsScheduleProcessor.name);

  constructor(
    @InjectQueue(PMS_QUEUE) private readonly queue: Queue,
    private readonly digest: DailyDigestService,
    private readonly checkout: CheckoutRemindersService,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler("daily-digest", { pattern: "0 * * * *" }, { name: "daily-digest", data: {} });
    await this.queue.upsertJobScheduler("checkout-reminders", { pattern: "0 12 * * *" }, { name: "checkout-reminders", data: {} });
  }

  async process(job: Job): Promise<unknown> {
    if (job.name === "daily-digest") return this.digest.schedule();
    if (job.name === "checkout-reminders") return this.checkout.run({ days: 1, hints: {} });
    this.logger.warn(`Job ignorado: ${job.name}`);
    return { ok: false };
  }
}
