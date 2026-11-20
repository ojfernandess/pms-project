import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { AuthModule } from "../auth/auth.module";
import { CRM_QUEUE } from "../queues/queue.constants";
import { CrmController } from "./crm.controller";
import { CrmService } from "./crm.service";
import { CrmDealsService } from "./crm-deals.service";
import { CrmCampaignsService } from "./crm-campaigns.service";
import { CrmCampaignQueueService } from "./crm-campaign-queue.service";
import { CrmAutomationsService } from "./crm-automations.service";
import { CrmB2bService } from "./crm-b2b.service";
import { CrmLoyaltyService } from "./crm-loyalty.service";
import { CrmReportsService } from "./crm-reports.service";

@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: CRM_QUEUE })],
  controllers: [CrmController],
  providers: [
    CrmService,
    CrmDealsService,
    CrmCampaignsService,
    CrmCampaignQueueService,
    CrmAutomationsService,
    CrmB2bService,
    CrmLoyaltyService,
    CrmReportsService,
  ],
  exports: [
    CrmService,
    CrmDealsService,
    CrmCampaignsService,
    CrmCampaignQueueService,
    CrmAutomationsService,
    CrmB2bService,
    CrmLoyaltyService,
    CrmReportsService,
  ],
})
export class CrmModule {}
