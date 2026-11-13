import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { SYSTEM_QUEUE } from "./queue.constants";

@Injectable()
export class SystemQueueService {
  constructor(@InjectQueue(SYSTEM_QUEUE) private readonly queue: Queue) {}

  enqueuePing() {
    return this.queue.add(
      "ping",
      { requestedAt: new Date().toISOString() },
      {
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        jobId: undefined,
      },
    );
  }
}
