import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { PMS_QUEUE } from "./queue.constants";

const JOB_ID = "booking-engine-infra-sync-debounced";

@Injectable()
export class InfraSyncQueueService {
  private readonly logger = new Logger(InfraSyncQueueService.name);

  constructor(@InjectQueue(PMS_QUEUE) private readonly queue: Queue) {}

  async enqueueBookingEngineSync(data: { reason: string; companyId?: string }): Promise<boolean> {
    const delayMs = Number(process.env.BOOKING_ENGINE_INFRA_SYNC_DEBOUNCE_MS ?? 8000);
    try {
      const existing = await this.queue.getJob(JOB_ID);
      if (existing) {
        await existing.remove();
      }
    } catch {
      /* ignore */
    }
    try {
      await this.queue.add("booking-engine-infra-sync", data, {
        jobId: JOB_ID,
        delay: delayMs,
        removeOnComplete: 30,
        removeOnFail: 30,
        attempts: 4,
        backoff: { type: "exponential", delay: 15_000 },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Falha ao enfileirar sync Traefik: ${error instanceof Error ? error.message : error}`,
      );
      return false;
    }
  }
}