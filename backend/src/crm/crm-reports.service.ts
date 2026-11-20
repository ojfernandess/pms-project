import { Injectable } from "@nestjs/common";
import { AuthService, SessionUser } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildCampaignPerformanceCsv,
  buildCommercialSummary,
  buildLeadsBySourceCsv,
  type DealRow,
} from "./crm-reports.logic";

@Injectable()
export class CrmReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async getDashboard(
    user: SessionUser,
    companyId: string,
    opts: { from?: string; to?: string; source?: string } = {},
  ) {
    this.auth.assertCompany(user, companyId);
    const from = opts.from ? new Date(opts.from) : null;
    const to = opts.to ? new Date(opts.to) : null;

    const [deals, contacts, campaigns, automationsActive, loyaltyAccounts] =
      await Promise.all([
        this.prisma.crm_deals.findMany({
          where: { company_id: companyId, deleted_at: null },
          select: {
            id: true,
            status: true,
            source: true,
            amount: true,
            reservation_id: true,
            converted_at: true,
            created_at: true,
            lost_reason: true,
          },
        }),
        this.prisma.crm_contacts.findMany({
          where: { company_id: companyId, deleted_at: null },
          select: {
            id: true,
            source: true,
            classification: true,
            created_at: true,
            tags: true,
          },
        }),
        this.prisma.crm_campaigns.findMany({
          where: { company_id: companyId },
          select: {
            id: true,
            name: true,
            status: true,
            channel: true,
            _count: { select: { recipients: true } },
          },
        }),
        this.prisma.crm_automations.count({
          where: { company_id: companyId, is_active: true },
        }),
        this.prisma.crm_loyalty_accounts.findMany({
          where: { company_id: companyId },
          select: { tier_key: true, points_balance: true },
        }),
      ]);

    const dealRows: DealRow[] = deals.map((d) => ({
      ...d,
      amount: Number(d.amount),
    }));

    const summary = buildCommercialSummary(dealRows, contacts, {
      from,
      to,
      source: opts.source || null,
    });

    const campaignStats = campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      channel: c.channel,
      recipients: c._count.recipients,
    }));

    const loyaltyByTier: Record<string, number> = {};
    for (const a of loyaltyAccounts) {
      loyaltyByTier[a.tier_key] = (loyaltyByTier[a.tier_key] || 0) + 1;
    }

    const b2bCount = await this.prisma.crm_companies.count({
      where: { company_id: companyId, deleted_at: null },
    });

    return {
      summary: {
        ...summary,
        campaignsTotal: campaigns.length,
        automationsActive,
        b2bCompanies: b2bCount,
        loyaltyMembers: loyaltyAccounts.length,
        loyaltyByTier,
      },
      campaigns: campaignStats,
      generatedAt: new Date().toISOString(),
    };
  }

  async exportCsv(
    user: SessionUser,
    companyId: string,
    report: "leads_by_source" | "campaigns",
  ) {
    this.auth.assertCompany(user, companyId);

    if (report === "leads_by_source") {
      const deals = await this.prisma.crm_deals.findMany({
        where: { company_id: companyId, deleted_at: null },
        select: {
          id: true,
          status: true,
          source: true,
          amount: true,
          reservation_id: true,
          converted_at: true,
          created_at: true,
          lost_reason: true,
        },
      });
      const csv = buildLeadsBySourceCsv(
        deals.map((d) => ({ ...d, amount: Number(d.amount) })),
      );
      return { filename: `crm-leads-by-source-${companyId.slice(0, 8)}.csv`, csv };
    }

    const campaigns = await this.prisma.crm_campaigns.findMany({
      where: { company_id: companyId },
      include: {
        recipients: { select: { status: true } },
      },
    });
    const csv = buildCampaignPerformanceCsv(
      campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        channel: c.channel,
        status: c.status,
        recipient_count: c.recipients.length,
        sent_count: c.recipients.filter((r) => r.status === "sent").length,
      })),
    );
    return { filename: `crm-campaigns-${companyId.slice(0, 8)}.csv`, csv };
  }
}
