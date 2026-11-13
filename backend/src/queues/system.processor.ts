import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { SYSTEM_QUEUE } from "./queue.constants";

@Processor(SYSTEM_QUEUE)
export class SystemProcessor extends WorkerHost {
  private readonly logger = new Logger(SystemProcessor.name);

  async process(job: Job<{ requestedAt: string }>): Promise<{ ok: true; requestedAt: string }> {
    if (job.name !== "ping") {
      throw new Error(`Unsupported system job: ${job.name}`);
    }
    this.logger.log(`Processed ping job ${job.id}`);
    return { ok: true, requestedAt: job.data.requestedAt };
  }
}
