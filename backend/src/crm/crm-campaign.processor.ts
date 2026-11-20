import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { Job } from "bullmq";
import { CRM_QUEUE } from "../queues/queue.constants";
import { CrmCampaignsService } from "./crm-campaigns.service";
import { CrmAutomationsService } from "./crm-automations.service";

@Processor(CRM_QUEUE)
export class CrmCampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(CrmCampaignProcessor.name);

  constructor(
    private readonly campaigns: CrmCampaignsService,
    private readonly automations: CrmAutomationsService,
  ) {
    super();
  }

  async process(job: Job<Record<string, string>>) {
    if (job.name === "campaign.send") {
      this.logger.log(`Processing campaign.send ${job.data.campaignId}`);
      return this.campaigns.processCampaignJob(job.data.campaignId);
    }
    if (job.name === "automation.run") {
      this.logger.log(`Processing automation.run ${job.data.runId}`);
      return this.automations.processRunJob(job.data.runId);
    }
    throw new Error(`Unsupported CRM job: ${job.name}`);
  }
}
