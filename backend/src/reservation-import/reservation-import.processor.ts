import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { RESERVATION_IMPORT_QUEUE } from "../queues/queue.constants";
import { ReservationImportService } from "./reservation-import.service";

@Processor(RESERVATION_IMPORT_QUEUE)
export class ReservationImportProcessor extends WorkerHost {
  private readonly logger = new Logger(ReservationImportProcessor.name);

  constructor(private readonly service: ReservationImportService) {
    super();
  }

  async process(job: Job<{ jobId: string }>) {
    if (job.name === "import.run") {
      this.logger.log(`Processing reservation import job ${job.data.jobId}`);
      return this.service.processJob(job.data.jobId);
    }
    throw new Error(`Unsupported reservation-import job: ${job.name}`);
  }
}
