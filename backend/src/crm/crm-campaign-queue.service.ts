import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import { Queue } from "bullmq";
import { CRM_QUEUE } from "../queues/queue.constants";

@Injectable()
export class CrmCampaignQueueService {
  constructor(@InjectQueue(CRM_QUEUE) private readonly queue: Queue) {}

  enqueueSendCampaign(campaignId: string) {
    return this.queue.add(
      "campaign.send",
      { campaignId, requestedAt: new Date().toISOString() },
      {
        jobId: `crm-campaign-send:${campaignId}:${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );
  }

  enqueueAutomationRun(runId: string) {
    return this.queue.add(
      "automation.run",
      { runId, requestedAt: new Date().toISOString() },
      {
        jobId: `crm-automation-run:${runId}`,
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      },
    );
  }
}
