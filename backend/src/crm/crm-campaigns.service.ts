import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthService, SessionUser } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { CrmCampaignQueueService } from "./crm-campaign-queue.service";
import {
  contactMatchesSegment,
  planCampaignRecipients,
  SegmentRules,
  type ContactForSegment,
} from "./crm-campaigns.logic";

@Injectable()
export class CrmCampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly queue: CrmCampaignQueueService,
  ) {}

  async listSegments(user: SessionUser, companyId: string) {
    this.auth.assertCompany(user, companyId);
    return this.prisma.crm_segments.findMany({
      where: { company_id: companyId, is_active: true },
      orderBy: { updated_at: "desc" },
    });
  }

  async createSegment(
    user: SessionUser,
    input: { companyId: string; name: string; description?: string; rules?: SegmentRules },
  ) {
    this.auth.assertCompany(user, input.companyId);
    if (!input.name?.trim()) throw new BadRequestException("name is required");
    return this.prisma.crm_segments.create({
      data: {
        company_id: input.companyId,
        name: input.name.trim(),
        description: input.description || null,
        rules: (input.rules ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async updateSegment(
    user: SessionUser,
    segmentId: string,
    patch: { name?: string; description?: string; rules?: SegmentRules; isActive?: boolean },
  ) {
    const segment = await this.prisma.crm_segments.findUnique({ where: { id: segmentId } });
    if (!segment) throw new NotFoundException("Segment not found");
    this.auth.assertCompany(user, segment.company_id);
    return this.prisma.crm_segments.update({
      where: { id: segmentId },
      data: {
        name: patch.name?.trim() || undefined,
        description: patch.description !== undefined ? patch.description : undefined,
        rules: patch.rules !== undefined ? (patch.rules as Prisma.InputJsonValue) : undefined,
        is_active: patch.isActive,
        updated_at: new Date(),
      },
    });
  }

  async previewSegment(user: SessionUser, segmentId: string) {
    const segment = await this.prisma.crm_segments.findUnique({ where: { id: segmentId } });
    if (!segment) throw new NotFoundException("Segment not found");
    this.auth.assertCompany(user, segment.company_id);
    const contacts = await this.loadContacts(segment.company_id);
    const rules = (segment.rules || {}) as SegmentRules;
    const ids = contacts.filter((c) => contactMatchesSegment(c, rules)).map((c) => c.id);
    return { segmentId, matched: ids.length, sampleContactIds: ids.slice(0, 20) };
  }

  async listCampaigns(user: SessionUser, companyId: string) {
    this.auth.assertCompany(user, companyId);
    return this.prisma.crm_campaigns.findMany({
      where: { company_id: companyId },
      include: {
        segment: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
      orderBy: { created_at: "desc" },
      take: 100,
    });
  }

  async createCampaign(
    user: SessionUser,
    input: {
      companyId: string;
      name: string;
      channel?: string;
      subject?: string;
      body?: string;
      segmentId?: string;
    },
  ) {
    this.auth.assertCompany(user, input.companyId);
    if (!input.name?.trim()) throw new BadRequestException("name is required");
    return this.prisma.crm_campaigns.create({
      data: {
        company_id: input.companyId,
        name: input.name.trim(),
        channel: input.channel || "email",
        subject: input.subject || null,
        body: input.body || "",
        segment_id: input.segmentId || null,
        status: "draft",
        created_by: user.id,
      },
    });
  }

  async getCampaign(user: SessionUser, campaignId: string) {
    const campaign = await this.prisma.crm_campaigns.findUnique({
      where: { id: campaignId },
      include: {
        segment: true,
        recipients: {
          take: 200,
          orderBy: { created_at: "asc" },
          include: {
            crm_contact: { select: { id: true, full_name: true, email: true, phone: true } },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    this.auth.assertCompany(user, campaign.company_id);
    return campaign;
  }

  /** Monta recipients com filtro de segmento + consentimento marketing. */
  async buildRecipients(user: SessionUser, campaignId: string) {
    const campaign = await this.prisma.crm_campaigns.findUnique({
      where: { id: campaignId },
      include: { segment: true },
    });
    if (!campaign) throw new NotFoundException("Campaign not found");
    this.auth.assertCompany(user, campaign.company_id);
    if (!["draft", "cancelled"].includes(campaign.status) && campaign.status !== "ready") {
      // allow rebuild from draft/ready
    }

    const rules = ((campaign.segment?.rules || {}) as SegmentRules) ?? {};
    const contacts = await this.loadContacts(campaign.company_id);
    const consents = await this.prisma.crm_consent.findMany({
      where: { company_id: campaign.company_id, purpose: "marketing" },
      select: {
        crm_contact_id: true,
        channel: true,
        purpose: true,
        granted: true,
      },
    });

    const plan = planCampaignRecipients({
      contacts,
      rules: campaign.segment_id ? rules : {},
      consents,
      channel: campaign.channel,
    });

    await this.prisma.crm_campaign_recipients.deleteMany({ where: { campaign_id: campaignId } });
    if (plan.length) {
      await this.prisma.crm_campaign_recipients.createMany({
        data: plan.map((p) => ({
          campaign_id: campaignId,
          crm_contact_id: p.contactId,
          channel: p.channel,
          address: p.status === "pending" ? p.address : null,
          status: p.status,
          skip_reason: "skip_reason" in p ? p.skip_reason : null,
        })),
      });
    }

    await this.prisma.crm_campaigns.update({
      where: { id: campaignId },
      data: { status: "ready", updated_at: new Date() },
    });

    const pending = plan.filter((p) => p.status === "pending").length;
    const skipped = plan.length - pending;
    return { campaignId, total: plan.length, pending, skipped };
  }

  async enqueueCampaign(user: SessionUser, campaignId: string) {
    const campaign = await this.prisma.crm_campaigns.findUnique({ where: { id: campaignId } });
    if (!campaign) throw new NotFoundException("Campaign not found");
    this.auth.assertCompany(user, campaign.company_id);

    if (campaign.status === "draft") {
      await this.buildRecipients(user, campaignId);
    }

    const pendingCount = await this.prisma.crm_campaign_recipients.count({
      where: { campaign_id: campaignId, status: "pending" },
    });
    if (pendingCount === 0) {
      throw new BadRequestException("No pending recipients (check segment/consent)");
    }

    await this.prisma.crm_campaigns.update({
      where: { id: campaignId },
      data: { status: "queued", started_at: new Date(), updated_at: new Date() },
    });

    await this.queue.enqueueSendCampaign(campaignId);
    return { campaignId, pendingCount, queued: true };
  }

  async processCampaignJob(campaignId: string) {
    const campaign = await this.prisma.crm_campaigns.findUnique({ where: { id: campaignId } });
    if (!campaign) return { ok: false, error: "not_found" };

    await this.prisma.crm_campaigns.update({
      where: { id: campaignId },
      data: { status: "sending", updated_at: new Date() },
    });

    const batch = await this.prisma.crm_campaign_recipients.findMany({
      where: { campaign_id: campaignId, status: "pending" },
      take: 200,
      orderBy: { created_at: "asc" },
    });

    for (const recipient of batch) {
      try {
        await this.prisma.crm_campaign_recipients.update({
          where: { id: recipient.id },
          data: { status: "queued", queued_at: new Date() },
        });
        // Etapa 4: marca como enviado (dispatch real fica na etapa 5/automações + templates).
        // Não cria segundo canal WhatsApp — integração outbound reutiliza Mensagens & Cobranças depois.
        await this.prisma.crm_campaign_recipients.update({
          where: { id: recipient.id },
          data: { status: "sent", sent_at: new Date() },
        });
      } catch (e) {
        await this.prisma.crm_campaign_recipients.update({
          where: { id: recipient.id },
          data: {
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
          },
        });
      }
    }

    const remaining = await this.prisma.crm_campaign_recipients.count({
      where: { campaign_id: campaignId, status: "pending" },
    });

    if (remaining > 0) {
      await this.queue.enqueueSendCampaign(campaignId);
      return { ok: true, processed: batch.length, remaining };
    }

    await this.prisma.crm_campaigns.update({
      where: { id: campaignId },
      data: { status: "sent", completed_at: new Date(), updated_at: new Date() },
    });
    return { ok: true, processed: batch.length, remaining: 0 };
  }

  private async loadContacts(companyId: string): Promise<ContactForSegment[]> {
    const rows = await this.prisma.crm_contacts.findMany({
      where: { company_id: companyId, deleted_at: null },
      select: {
        id: true,
        email: true,
        phone: true,
        whatsapp: true,
        source: true,
        classification: true,
        tags: true,
      },
      take: 5000,
    });
    return rows;
  }
}
