import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { SessionUser } from "../auth/auth.service";
import { CurrentUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CrmService } from "./crm.service";
import { CrmDealsService } from "./crm-deals.service";
import { CrmCampaignsService } from "./crm-campaigns.service";
import { CrmAutomationsService } from "./crm-automations.service";
import { CrmB2bService } from "./crm-b2b.service";
import { CrmLoyaltyService } from "./crm-loyalty.service";
import { CrmReportsService } from "./crm-reports.service";

class ListContactsQuery {
  @IsUUID()
  companyId!: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

class UpsertContactBody {
  @IsUUID()
  companyId!: string;

  @IsString()
  fullName!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  documentNumber?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  tags?: unknown;

  @IsOptional()
  @IsString()
  classification?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  establishmentId?: string;
}

class ActivityBody {
  @IsString()
  activityType!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  metadata?: unknown;
}

class MergeBody {
  @IsUUID()
  sourceId!: string;

  @IsUUID()
  targetId!: string;
}

class OutboxBody {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  establishmentId?: string;

  @IsString()
  eventType!: string;

  payload!: unknown;

  @IsString()
  idempotencyKey!: string;
}

class BoardQuery {
  @IsUUID()
  companyId!: string;

  @IsOptional()
  @IsUUID()
  pipelineId?: string;
}

class CreateDealBody {
  @IsUUID()
  companyId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  amount?: number;

  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsUUID()
  pipelineId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @IsOptional()
  @IsUUID()
  establishmentId?: string;

  @IsOptional()
  @IsString()
  source?: string;
}

class MoveDealBody {
  @IsUUID()
  stageId!: string;
}

class ConvertDealBody {
  @IsUUID()
  reservationId!: string;
}

class DealFromQuoteBody {
  @IsUUID()
  companyId!: string;

  @IsOptional()
  @IsUUID()
  establishmentId?: string;

  @IsUUID()
  quoteId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  amount?: number;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  stageKey?: string;
}

@Controller("crm")
@UseGuards(JwtAuthGuard)
export class CrmController {
  constructor(
    private readonly crm: CrmService,
    private readonly deals: CrmDealsService,
    private readonly campaigns: CrmCampaignsService,
    private readonly automations: CrmAutomationsService,
    private readonly b2b: CrmB2bService,
    private readonly loyalty: CrmLoyaltyService,
    private readonly reports: CrmReportsService,
  ) {}

  @Get("contacts")
  list(@CurrentUser() user: SessionUser, @Query() query: ListContactsQuery) {
    return this.crm.listContacts(user, query.companyId, {
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get("contacts/:contactId")
  get(@CurrentUser() user: SessionUser, @Param("contactId") contactId: string) {
    return this.crm.getContact(user, contactId);
  }

  @Get("contacts/:contactId/360")
  get360(@CurrentUser() user: SessionUser, @Param("contactId") contactId: string) {
    return this.crm.getContact360(user, contactId);
  }

  @Post("contacts/upsert")
  upsert(@CurrentUser() user: SessionUser, @Body() body: UpsertContactBody) {
    return this.crm.upsertContact(user, body);
  }

  @Post("contacts/:contactId/activities")
  activity(
    @CurrentUser() user: SessionUser,
    @Param("contactId") contactId: string,
    @Body() body: ActivityBody,
  ) {
    return this.crm.addActivity(user, {
      contactId,
      activityType: body.activityType,
      subject: body.subject,
      body: body.body,
      metadata: body.metadata,
    });
  }

  @Post("contacts/merge/preview")
  mergePreview(@CurrentUser() user: SessionUser, @Body() body: MergeBody) {
    return this.crm.mergePreview(user, body.sourceId, body.targetId);
  }

  @Post("contacts/merge/apply")
  mergeApply(@CurrentUser() user: SessionUser, @Body() body: MergeBody) {
    return this.crm.mergeApply(user, body.sourceId, body.targetId);
  }

  @Post("outbox")
  enqueueOutbox(@CurrentUser() _user: SessionUser, @Body() body: OutboxBody) {
    return this.crm.enqueueOutbox(body);
  }

  @Post("outbox/process")
  processOutbox(@CurrentUser() user: SessionUser, @Query("limit") limit?: string) {
    // Staff autenticado pode drenar a fila da empresa; útil após deploy / recovery
    if (!user.isSuperAdmin && !(user.companyIds?.length > 0)) {
      return { processed: 0, results: [], error: "forbidden" };
    }
    return this.crm.processPendingOutbox(limit ? Number(limit) : 50);
  }

  @Get("pipelines")
  pipelines(@CurrentUser() user: SessionUser, @Query("companyId") companyId: string) {
    return this.deals.listPipelines(user, companyId);
  }

  @Get("board")
  board(@CurrentUser() user: SessionUser, @Query() query: BoardQuery) {
    return this.deals.getBoard(user, query.companyId, query.pipelineId);
  }

  @Post("deals")
  createDeal(@CurrentUser() user: SessionUser, @Body() body: CreateDealBody) {
    return this.deals.createDeal(user, body);
  }

  @Post("deals/from-quote")
  fromQuote(@CurrentUser() user: SessionUser, @Body() body: DealFromQuoteBody) {
    return this.deals.upsertFromQuote(user, body);
  }

  @Post("deals/:dealId/move")
  moveDeal(
    @CurrentUser() user: SessionUser,
    @Param("dealId") dealId: string,
    @Body() body: MoveDealBody,
  ) {
    return this.deals.moveDeal(user, dealId, body.stageId);
  }

  @Post("deals/:dealId/convert")
  convertDeal(
    @CurrentUser() user: SessionUser,
    @Param("dealId") dealId: string,
    @Body() body: ConvertDealBody,
  ) {
    return this.deals.convertDeal(user, dealId, body.reservationId);
  }

  @Get("segments")
  listSegments(@CurrentUser() user: SessionUser, @Query("companyId") companyId: string) {
    return this.campaigns.listSegments(user, companyId);
  }

  @Post("segments")
  createSegment(
    @CurrentUser() user: SessionUser,
    @Body()
    body: {
      companyId: string;
      name: string;
      description?: string;
      rules?: Record<string, unknown>;
    },
  ) {
    return this.campaigns.createSegment(user, body as any);
  }

  @Post("segments/:segmentId/preview")
  previewSegment(@CurrentUser() user: SessionUser, @Param("segmentId") segmentId: string) {
    return this.campaigns.previewSegment(user, segmentId);
  }

  @Get("campaigns")
  listCampaigns(@CurrentUser() user: SessionUser, @Query("companyId") companyId: string) {
    return this.campaigns.listCampaigns(user, companyId);
  }

  @Post("campaigns")
  createCampaign(
    @CurrentUser() user: SessionUser,
    @Body()
    body: {
      companyId: string;
      name: string;
      channel?: string;
      subject?: string;
      body?: string;
      segmentId?: string;
    },
  ) {
    return this.campaigns.createCampaign(user, body);
  }

  @Get("campaigns/:campaignId")
  getCampaign(@CurrentUser() user: SessionUser, @Param("campaignId") campaignId: string) {
    return this.campaigns.getCampaign(user, campaignId);
  }

  @Post("campaigns/:campaignId/build-recipients")
  buildRecipients(@CurrentUser() user: SessionUser, @Param("campaignId") campaignId: string) {
    return this.campaigns.buildRecipients(user, campaignId);
  }

  @Post("campaigns/:campaignId/enqueue")
  enqueueCampaign(@CurrentUser() user: SessionUser, @Param("campaignId") campaignId: string) {
    return this.campaigns.enqueueCampaign(user, campaignId);
  }

  @Post("contacts/:contactId/consent")
  upsertConsent(
    @CurrentUser() user: SessionUser,
    @Param("contactId") contactId: string,
    @Body() body: { channel: string; purpose?: string; granted: boolean },
  ) {
    return this.crm.upsertConsent(user, {
      contactId,
      channel: body.channel,
      purpose: body.purpose || "marketing",
      granted: body.granted,
    });
  }

  @Get("automation-templates")
  listAutomationTemplates(@CurrentUser() _user: SessionUser) {
    return this.automations.listTemplates();
  }

  @Get("automations")
  listAutomations(@CurrentUser() user: SessionUser, @Query("companyId") companyId: string) {
    return this.automations.listAutomations(user, companyId);
  }

  @Post("automations/from-template")
  createAutomationFromTemplate(
    @CurrentUser() user: SessionUser,
    @Body() body: { companyId: string; templateKey: string; name?: string },
  ) {
    return this.automations.createFromTemplate(user, body);
  }

  @Post("automations")
  createAutomation(
    @CurrentUser() user: SessionUser,
    @Body()
    body: {
      companyId: string;
      name: string;
      description?: string;
      triggerType: string;
      conditions?: unknown;
      actions?: unknown;
    },
  ) {
    return this.automations.createAutomation(user, body);
  }

  @Post("automations/:automationId/active")
  setAutomationActive(
    @CurrentUser() user: SessionUser,
    @Param("automationId") automationId: string,
    @Body() body: { isActive: boolean },
  ) {
    return this.automations.setActive(user, automationId, body.isActive);
  }

  @Get("automation-runs")
  listAutomationRuns(
    @CurrentUser() user: SessionUser,
    @Query("companyId") companyId: string,
    @Query("limit") limit?: string,
  ) {
    return this.automations.listRuns(user, companyId, limit ? Number(limit) : 50);
  }

  @Post("automations/dispatch")
  dispatchAutomation(
    @CurrentUser() user: SessionUser,
    @Body() body: { companyId: string; triggerType: string; payload?: Record<string, unknown> },
  ) {
    return this.automations.dispatchForUser(user, body.companyId, body.triggerType, body.payload || {});
  }

  @Get("companies")
  listB2bCompanies(
    @CurrentUser() user: SessionUser,
    @Query("companyId") companyId: string,
    @Query("q") q?: string,
  ) {
    return this.b2b.listCompanies(user, companyId, q);
  }

  @Post("companies")
  upsertB2bCompany(
    @CurrentUser() user: SessionUser,
    @Body()
    body: {
      id?: string;
      companyId: string;
      legalName: string;
      tradeName?: string;
      documentNumber?: string;
      partnerType?: string;
      email?: string;
      phone?: string;
      address?: string;
      commercialOwner?: string;
      notes?: string;
      commercialTerms?: unknown;
    },
  ) {
    return this.b2b.upsertCompany(user, body);
  }

  @Post("companies/:crmCompanyId/contacts")
  linkB2bContact(
    @CurrentUser() user: SessionUser,
    @Param("crmCompanyId") crmCompanyId: string,
    @Body() body: { crmContactId: string; role?: string; isPrimary?: boolean },
  ) {
    return this.b2b.linkContact(user, { crmCompanyId, ...body });
  }

  @Post("companies/:crmCompanyId/delete")
  deleteB2bCompany(@CurrentUser() user: SessionUser, @Param("crmCompanyId") crmCompanyId: string) {
    return this.b2b.softDelete(user, crmCompanyId);
  }

  @Get("loyalty/program")
  getLoyaltyProgram(@CurrentUser() user: SessionUser, @Query("companyId") companyId: string) {
    return this.loyalty.getProgram(user, companyId);
  }

  @Get("loyalty/accounts")
  listLoyaltyAccounts(@CurrentUser() user: SessionUser, @Query("companyId") companyId: string) {
    return this.loyalty.listAccounts(user, companyId);
  }

  @Get("loyalty/transactions")
  listLoyaltyTransactions(
    @CurrentUser() user: SessionUser,
    @Query("companyId") companyId: string,
    @Query("limit") limit?: string,
  ) {
    return this.loyalty.listTransactions(user, companyId, limit ? Number(limit) : 50);
  }

  @Post("loyalty/earn")
  earnLoyalty(
    @CurrentUser() user: SessionUser,
    @Body()
    body: {
      companyId: string;
      crmContactId: string;
      amount: number;
      reservationId?: string;
      note?: string;
    },
  ) {
    return this.loyalty.earnPoints(user, body);
  }

  @Get("reports/dashboard")
  reportsDashboard(
    @CurrentUser() user: SessionUser,
    @Query("companyId") companyId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("source") source?: string,
  ) {
    return this.reports.getDashboard(user, companyId, { from, to, source });
  }

  @Get("reports/export")
  reportsExport(
    @CurrentUser() user: SessionUser,
    @Query("companyId") companyId: string,
    @Query("report") report: "leads_by_source" | "campaigns",
  ) {
    return this.reports.exportCsv(user, companyId, report || "leads_by_source");
  }
}
