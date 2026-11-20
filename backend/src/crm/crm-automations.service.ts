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
  evaluateConditions,
  parseActions,
  parseConditions,
  renderTemplate,
  TriggerPayload,
  type AutomationAction,
} from "./crm-automations.logic";

@Injectable()
export class CrmAutomationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly queue: CrmCampaignQueueService,
  ) {}

  listTemplates() {
    return this.prisma.crm_automation_templates.findMany({
      orderBy: { name: "asc" },
    });
  }

  async listAutomations(user: SessionUser, companyId: string) {
    this.auth.assertCompany(user, companyId);
    return this.prisma.crm_automations.findMany({
      where: { company_id: companyId },
      orderBy: { updated_at: "desc" },
    });
  }

  async createFromTemplate(
    user: SessionUser,
    input: { companyId: string; templateKey: string; name?: string },
  ) {
    this.auth.assertCompany(user, input.companyId);
    const template = await this.prisma.crm_automation_templates.findUnique({
      where: { template_key: input.templateKey },
    });
    if (!template) throw new NotFoundException("Template not found");

    return this.prisma.crm_automations.create({
      data: {
        company_id: input.companyId,
        name: input.name?.trim() || template.name,
        description: template.description,
        template_key: template.template_key,
        trigger_type: template.trigger_type,
        conditions: template.conditions as Prisma.InputJsonValue,
        actions: template.actions as Prisma.InputJsonValue,
        is_active: true,
        created_by: user.id,
      },
    });
  }

  async createAutomation(
    user: SessionUser,
    input: {
      companyId: string;
      name: string;
      description?: string;
      triggerType: string;
      conditions?: unknown;
      actions?: unknown;
    },
  ) {
    this.auth.assertCompany(user, input.companyId);
    if (!input.name?.trim() || !input.triggerType?.trim()) {
      throw new BadRequestException("name and triggerType are required");
    }
    return this.prisma.crm_automations.create({
      data: {
        company_id: input.companyId,
        name: input.name.trim(),
        description: input.description || null,
        trigger_type: input.triggerType.trim(),
        conditions: (input.conditions ?? []) as Prisma.InputJsonValue,
        actions: (input.actions ?? []) as Prisma.InputJsonValue,
        created_by: user.id,
      },
    });
  }

  async setActive(user: SessionUser, automationId: string, isActive: boolean) {
    const row = await this.prisma.crm_automations.findUnique({ where: { id: automationId } });
    if (!row) throw new NotFoundException("Automation not found");
    this.auth.assertCompany(user, row.company_id);
    return this.prisma.crm_automations.update({
      where: { id: automationId },
      data: { is_active: isActive, updated_at: new Date() },
    });
  }

  async listRuns(user: SessionUser, companyId: string, limit = 50) {
    this.auth.assertCompany(user, companyId);
    return this.prisma.crm_automation_runs.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: "desc" },
      take: Math.min(100, Math.max(1, limit)),
      include: { automation: { select: { id: true, name: true, trigger_type: true } } },
    });
  }

  async dispatchForUser(
    user: SessionUser,
    companyId: string,
    triggerType: string,
    payload: TriggerPayload,
  ) {
    this.auth.assertCompany(user, companyId);
    return this.dispatchTrigger({ companyId, triggerType, payload });
  }

  /**
   * Dispara automações ativas para um evento (outbox / domínio).
   * Enfileira execução assíncrona por automação.
   */
  async dispatchTrigger(input: {
    companyId: string;
    triggerType: string;
    payload: TriggerPayload;
  }) {
    const automations = await this.prisma.crm_automations.findMany({
      where: {
        company_id: input.companyId,
        trigger_type: input.triggerType,
        is_active: true,
      },
    });

    const queued: string[] = [];
    for (const auto of automations) {
      const conditions = parseConditions(auto.conditions);
      if (!evaluateConditions(conditions, input.payload)) continue;

      const run = await this.prisma.crm_automation_runs.create({
        data: {
          company_id: input.companyId,
          automation_id: auto.id,
          trigger_type: input.triggerType,
          trigger_payload: input.payload as Prisma.InputJsonValue,
          status: "queued",
        },
      });
      await this.queue.enqueueAutomationRun(run.id);
      queued.push(run.id);
    }
    return { matched: automations.length, queued: queued.length, runIds: queued };
  }

  async processRunJob(runId: string) {
    const run = await this.prisma.crm_automation_runs.findUnique({
      where: { id: runId },
      include: { automation: true },
    });
    if (!run?.automation) return { ok: false, error: "not_found" };

    await this.prisma.crm_automation_runs.update({
      where: { id: runId },
      data: { status: "running", started_at: new Date() },
    });

    const payload = (run.trigger_payload || {}) as TriggerPayload;
    const actions = parseActions(run.automation.actions);
    const results: Array<{ type: string; ok: boolean; detail?: unknown; error?: string }> = [];

    try {
      for (const action of actions) {
        try {
          const detail = await this.executeAction(run.company_id, payload, action);
          results.push({ type: action.type, ok: true, detail });
        } catch (e) {
          results.push({
            type: action.type,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      await this.prisma.crm_automation_runs.update({
        where: { id: runId },
        data: {
          status: "completed",
          result: { actions: results } as Prisma.InputJsonValue,
          finished_at: new Date(),
        },
      });
      return { ok: true, results };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.prisma.crm_automation_runs.update({
        where: { id: runId },
        data: {
          status: "failed",
          error: message,
          result: { actions: results } as Prisma.InputJsonValue,
          finished_at: new Date(),
        },
      });
      return { ok: false, error: message, results };
    }
  }

  private async resolveContactId(companyId: string, payload: TriggerPayload): Promise<string | null> {
    if (payload.crm_contact_id) return String(payload.crm_contact_id);
    if (payload.client_id) {
      const link = await this.prisma.crm_contact_client_links.findFirst({
        where: { client_id: String(payload.client_id) },
        include: { crm_contact: { select: { id: true, company_id: true, deleted_at: true } } },
      });
      if (link?.crm_contact && link.crm_contact.company_id === companyId && !link.crm_contact.deleted_at) {
        return link.crm_contact.id;
      }
    }
    const email = String(payload.email || "").trim().toLowerCase();
    if (email) {
      const contact = await this.prisma.crm_contacts.findFirst({
        where: { company_id: companyId, deleted_at: null, email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (contact) return contact.id;
    }
    return null;
  }

  private async executeAction(
    companyId: string,
    payload: TriggerPayload,
    action: AutomationAction,
  ): Promise<unknown> {
    if (action.type === "create_activity") {
      const contactId = await this.resolveContactId(companyId, payload);
      if (!contactId) return { skipped: "no_contact" };
      const row = await this.prisma.crm_activities.create({
        data: {
          company_id: companyId,
          crm_contact_id: contactId,
          activity_type: action.activity_type || "system",
          subject: renderTemplate(action.subject, payload) || "Automação",
          body: renderTemplate(action.body, payload) || null,
          metadata: { automation: true, trigger_payload_keys: Object.keys(payload) } as Prisma.InputJsonValue,
        },
      });
      return { activityId: row.id };
    }

    if (action.type === "set_contact_classification") {
      const contactId = await this.resolveContactId(companyId, payload);
      if (!contactId) return { skipped: "no_contact" };
      await this.prisma.crm_contacts.update({
        where: { id: contactId },
        data: { classification: action.classification, updated_at: new Date() },
      });
      return { contactId, classification: action.classification };
    }

    if (action.type === "add_contact_tag") {
      const contactId = await this.resolveContactId(companyId, payload);
      if (!contactId) return { skipped: "no_contact" };
      const contact = await this.prisma.crm_contacts.findUnique({ where: { id: contactId } });
      const tags = Array.isArray(contact?.tags) ? (contact!.tags as string[]) : [];
      if (!tags.includes(action.tag)) tags.push(action.tag);
      await this.prisma.crm_contacts.update({
        where: { id: contactId },
        data: { tags: tags as Prisma.InputJsonValue, updated_at: new Date() },
      });
      return { contactId, tags };
    }

    if (action.type === "enqueue_outbox") {
      const key = `auto:${action.event_type}:${payload.reservation_id || payload.client_id || Date.now()}`;
      try {
        await this.prisma.crm_outbox_events.create({
          data: {
            company_id: companyId,
            event_type: action.event_type,
            payload: payload as Prisma.InputJsonValue,
            idempotency_key: key,
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return { deduped: true };
        }
        throw err;
      }
      return { enqueued: action.event_type };
    }

    return { skipped: "unknown_action" };
  }

  /** Chamado após processar outbox CRM — dispara automações do mesmo event_type. */
  async onOutboxEvent(input: {
    companyId: string | null | undefined;
    eventType: string;
    payload: TriggerPayload;
  }) {
    if (!input.companyId) return { queued: 0 };
    return this.dispatchTrigger({
      companyId: input.companyId,
      triggerType: input.eventType,
      payload: { ...input.payload, company_id: input.companyId },
    });
  }
}
