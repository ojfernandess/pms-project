import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthService, SessionUser } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildConvertDealPatch,
  defaultPipelineStageSeeds,
  resolveDealStatusAfterMove,
} from "./crm-deals.logic";
import { CrmAutomationsService } from "./crm-automations.service";

@Injectable()
export class CrmDealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Optional()
    @Inject(forwardRef(() => CrmAutomationsService))
    private readonly automations?: CrmAutomationsService,
  ) {}

  async ensureDefaultPipeline(user: SessionUser, companyId: string) {
    this.auth.assertCompany(user, companyId);
    const existing = await this.prisma.crm_pipelines.findFirst({
      where: { company_id: companyId, is_default: true, is_active: true },
      include: { stages: { orderBy: { position: "asc" } } },
    });
    if (existing) return existing;

    return this.prisma.$transaction(async (tx) => {
      const pipeline = await tx.crm_pipelines.create({
        data: {
          company_id: companyId,
          name: "Vendas",
          is_default: true,
          is_active: true,
        },
      });
      await tx.crm_pipeline_stages.createMany({
        data: defaultPipelineStageSeeds().map((s) => ({
          pipeline_id: pipeline.id,
          ...s,
        })),
      });
      return tx.crm_pipelines.findUniqueOrThrow({
        where: { id: pipeline.id },
        include: { stages: { orderBy: { position: "asc" } } },
      });
    });
  }

  async listPipelines(user: SessionUser, companyId: string) {
    this.auth.assertCompany(user, companyId);
    await this.ensureDefaultPipeline(user, companyId);
    return this.prisma.crm_pipelines.findMany({
      where: { company_id: companyId, is_active: true },
      include: { stages: { orderBy: { position: "asc" } } },
      orderBy: [{ is_default: "desc" }, { name: "asc" }],
    });
  }

  async getBoard(user: SessionUser, companyId: string, pipelineId?: string) {
    this.auth.assertCompany(user, companyId);
    const pipeline = pipelineId
      ? await this.prisma.crm_pipelines.findFirst({
          where: { id: pipelineId, company_id: companyId, is_active: true },
          include: { stages: { orderBy: { position: "asc" } } },
        })
      : await this.ensureDefaultPipeline(user, companyId);

    if (!pipeline) throw new NotFoundException("Pipeline not found");

    const deals = await this.prisma.crm_deals.findMany({
      where: {
        company_id: companyId,
        pipeline_id: pipeline.id,
        deleted_at: null,
      },
      include: {
        crm_contact: {
          select: { id: true, full_name: true, email: true, phone: true },
        },
      },
      orderBy: { updated_at: "desc" },
      take: 500,
    });

    const columns = pipeline.stages.map((stage) => ({
      stage,
      deals: deals.filter((d) => d.stage_id === stage.id),
    }));

    return { pipeline, columns, totalDeals: deals.length };
  }

  async createDeal(
    user: SessionUser,
    input: {
      companyId: string;
      title: string;
      amount?: number;
      stageId?: string;
      pipelineId?: string;
      contactId?: string;
      quoteId?: string;
      establishmentId?: string;
      source?: string;
      metadata?: unknown;
    },
  ) {
    this.auth.assertCompany(user, input.companyId);
    const pipeline = input.pipelineId
      ? await this.prisma.crm_pipelines.findFirst({
          where: { id: input.pipelineId, company_id: input.companyId },
          include: { stages: { orderBy: { position: "asc" } } },
        })
      : await this.ensureDefaultPipeline(user, input.companyId);

    if (!pipeline) throw new NotFoundException("Pipeline not found");

    const stage =
      pipeline.stages.find((s) => s.id === input.stageId) ||
      pipeline.stages.find((s) => s.stage_key === "lead") ||
      pipeline.stages[0];

    if (!stage) throw new BadRequestException("Pipeline has no stages");

    return this.prisma.crm_deals.create({
      data: {
        company_id: input.companyId,
        pipeline_id: pipeline.id,
        stage_id: stage.id,
        crm_contact_id: input.contactId || null,
        title: input.title.trim(),
        amount: input.amount ?? 0,
        source: input.source || "manual",
        quote_id: input.quoteId || null,
        establishment_id: input.establishmentId || null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  async moveDeal(user: SessionUser, dealId: string, stageId: string) {
    const deal = await this.prisma.crm_deals.findFirst({
      where: { id: dealId, deleted_at: null },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    this.auth.assertCompany(user, deal.company_id);

    const stage = await this.prisma.crm_pipeline_stages.findFirst({
      where: { id: stageId, pipeline_id: deal.pipeline_id },
    });
    if (!stage) throw new BadRequestException("Invalid stage for pipeline");

    const next = resolveDealStatusAfterMove(stage);
    return this.prisma.crm_deals.update({
      where: { id: deal.id },
      data: {
        stage_id: stage.id,
        status: next.status,
        converted_at: next.status === "won" ? next.convertedAt : deal.converted_at,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Conversão Etapa 2: vincula deal a uma reserva já existente.
   * Não cria reserva, não altera lock/tarifas.
   */
  async convertDeal(user: SessionUser, dealId: string, reservationId: string) {
    const deal = await this.prisma.crm_deals.findFirst({
      where: { id: dealId, deleted_at: null },
      include: { pipeline: { include: { stages: true } } },
    });
    if (!deal) throw new NotFoundException("Deal not found");
    this.auth.assertCompany(user, deal.company_id);

    const reservation = await this.prisma.reservations.findUnique({
      where: { id: reservationId },
      select: { id: true, establishment_id: true, total_amount: true, status: true },
    });
    if (!reservation) throw new NotFoundException("Reservation not found");

    const wonStage =
      deal.pipeline.stages.find((s) => s.is_won || s.stage_key === "won") || null;

    const patch = buildConvertDealPatch(reservationId, wonStage?.id);
    const currentAmount = Number(deal.amount ?? 0);
    const updated = await this.prisma.crm_deals.update({
      where: { id: deal.id },
      data: {
        ...patch,
        amount: currentAmount > 0 ? deal.amount : reservation.total_amount ?? deal.amount,
        establishment_id: reservation.establishment_id ?? deal.establishment_id,
      },
    });

    await this.prisma.crm_audit_logs.create({
      data: {
        company_id: deal.company_id,
        crm_contact_id: deal.crm_contact_id,
        action: "deal.convert",
        actor_user_id: user.id,
        before_data: { dealId: deal.id } as Prisma.InputJsonValue,
        after_data: { reservationId, dealId: deal.id } as Prisma.InputJsonValue,
        metadata: {} as Prisma.InputJsonValue,
      },
    });

    if (this.automations) {
      try {
        await this.automations.dispatchTrigger({
          companyId: deal.company_id,
          triggerType: "deal.won",
          payload: {
            company_id: deal.company_id,
            crm_contact_id: deal.crm_contact_id || undefined,
            reservation_id: reservationId,
            deal_id: deal.id,
            source: deal.source || undefined,
          },
        });
      } catch (e) {
        console.warn("CRM deal.won automation:", e);
      }
    }

    return updated;
  }

  async upsertFromQuote(
    user: SessionUser | null,
    input: {
      companyId: string;
      establishmentId?: string | null;
      quoteId: string;
      title: string;
      amount?: number;
      fullName?: string | null;
      email?: string | null;
      phone?: string | null;
      clientId?: string | null;
      source?: string;
      stageKey?: string;
    },
  ) {
    if (user) this.auth.assertCompany(user, input.companyId);

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT public.crm_upsert_deal_from_quote(
        ${input.companyId}::uuid,
        ${input.establishmentId || null}::uuid,
        ${input.quoteId}::uuid,
        ${input.title},
        ${input.amount ?? 0}::numeric,
        ${input.fullName || null},
        ${input.email || null},
        ${input.phone || null},
        ${input.clientId || null}::uuid,
        ${input.source || "quote"},
        ${input.stageKey || "proposal"}
      ) AS id
    `;
    const id = rows[0]?.id;
    if (!id) throw new BadRequestException("Failed to upsert deal from quote");
    return this.prisma.crm_deals.findUnique({ where: { id } });
  }
}
