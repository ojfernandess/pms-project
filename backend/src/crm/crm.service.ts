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
import { computeLtv, normalizeContactMatchKey } from "./crm-aggregation";
import { CrmAutomationsService } from "./crm-automations.service";

export type UpsertContactDto = {
  companyId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  source?: string | null;
  tags?: unknown;
  classification?: string | null;
  notes?: string | null;
  clientId?: string | null;
  establishmentId?: string | null;
};

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Optional()
    @Inject(forwardRef(() => CrmAutomationsService))
    private readonly automations?: CrmAutomationsService,
  ) {}

  private async assertCompanyAccess(user: SessionUser, companyId: string) {
    this.auth.assertCompany(user, companyId);
  }

  async listContacts(
    user: SessionUser,
    companyId: string,
    opts: { q?: string; page?: number; pageSize?: number } = {},
  ) {
    await this.assertCompanyAccess(user, companyId);
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
    const q = opts.q?.trim();

    const where: Prisma.crm_contactsWhereInput = {
      company_id: companyId,
      deleted_at: null,
      ...(q
        ? {
            OR: [
              { full_name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { document_number: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.crm_contacts.count({ where }),
      this.prisma.crm_contacts.findMany({
        where,
        orderBy: { updated_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client_links: { select: { client_id: true, establishment_id: true } },
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  async getContact(user: SessionUser, contactId: string) {
    const contact = await this.prisma.crm_contacts.findFirst({
      where: { id: contactId, deleted_at: null },
      include: {
        client_links: true,
        activities: { orderBy: { created_at: "desc" }, take: 50 },
        consents: true,
      },
    });
    if (!contact) throw new NotFoundException("Contact not found");
    await this.assertCompanyAccess(user, contact.company_id);
    return contact;
  }

  async getContact360(user: SessionUser, contactId: string) {
    const contact = await this.getContact(user, contactId);
    const clientIds = contact.client_links.map((l) => l.client_id);

    const [reservations, quotes, linkedClients] = await Promise.all([
      clientIds.length
        ? this.prisma.reservations.findMany({
            where: {
              OR: [{ client_id: { in: clientIds } }, { guest_id: { in: clientIds } }],
            },
            orderBy: { checkin_date: "desc" },
            take: 100,
            select: {
              id: true,
              reservation_code: true,
              status: true,
              checkin_date: true,
              checkout_date: true,
              total_amount: true,
              paid_amount: true,
              payment_status: true,
              establishment_id: true,
              client_id: true,
              guest_id: true,
              created_at: true,
            },
          })
        : Promise.resolve([]),
      clientIds.length
        ? this.prisma.quotes.findMany({
            where: {
              OR: [{ client_id: { in: clientIds } }, { guest_id: { in: clientIds } }],
            },
            orderBy: { created_at: "desc" },
            take: 50,
          })
        : Promise.resolve([]),
      clientIds.length
        ? this.prisma.clients.findMany({
            where: { id: { in: clientIds } },
            select: { id: true, document_type: true, document_number: true },
          })
        : Promise.resolve(
            [] as Array<{
              id: string;
              document_type: string | null;
              document_number: string | null;
            }>,
          ),
    ]);

    // Documento costuma existir em clients e faltar no crm_contacts (outbox antigo sem document_*).
    let enrichedContact = contact;
    if (!contact.document_number && linkedClients.length) {
      const withDoc = linkedClients.find((c) => Boolean(c.document_number));
      if (withDoc?.document_number) {
        enrichedContact = {
          ...contact,
          document_type: contact.document_type || withDoc.document_type || null,
          document_number: withDoc.document_number,
        };
        // Backfill assíncrono — não bloqueia a resposta
        void this.prisma.crm_contacts
          .update({
            where: { id: contact.id },
            data: {
              document_type: enrichedContact.document_type,
              document_number: enrichedContact.document_number,
              updated_at: new Date(),
            },
          })
          .catch(() => undefined);
      }
    }

    const indicators = computeLtv(
      reservations.map((r) => ({
        id: r.id,
        status: r.status,
        total_amount: r.total_amount as unknown as number | string | null,
      })),
    );

    return {
      contact: enrichedContact,
      reservations,
      quotes,
      indicators,
      linkedClientIds: clientIds,
    };
  }

  async upsertContact(user: SessionUser, dto: UpsertContactDto) {
    if (!dto.companyId || !dto.fullName?.trim()) {
      throw new BadRequestException("companyId and fullName are required");
    }
    await this.assertCompanyAccess(user, dto.companyId);

    const keys = normalizeContactMatchKey({
      email: dto.email,
      phone: dto.phone,
      document_number: dto.documentNumber,
    });

    let existing = null as Awaited<ReturnType<typeof this.prisma.crm_contacts.findFirst>>;
    if (keys.email || keys.phone || keys.document) {
      existing = await this.prisma.crm_contacts.findFirst({
        where: {
          company_id: dto.companyId,
          deleted_at: null,
          OR: [
            ...(keys.email ? [{ email: { equals: keys.email, mode: "insensitive" as const } }] : []),
            ...(keys.phone ? [{ phone: { contains: keys.phone } }] : []),
            ...(keys.document ? [{ document_number: keys.document }] : []),
          ],
        },
      });
    }

    const data = {
      full_name: dto.fullName.trim(),
      email: dto.email?.trim() || null,
      phone: dto.phone?.trim() || null,
      whatsapp: dto.whatsapp?.trim() || dto.phone?.trim() || null,
      // Não apagar documento já salvo quando o payload não traz doc (outbox parcial)
      document_type: dto.documentType || existing?.document_type || null,
      document_number: dto.documentNumber || existing?.document_number || null,
      source: dto.source || existing?.source || null,
      tags: (dto.tags ?? []) as Prisma.InputJsonValue,
      classification: dto.classification || existing?.classification || null,
      notes: dto.notes || existing?.notes || null,
      updated_at: new Date(),
    };

    const contact = existing
      ? await this.prisma.crm_contacts.update({ where: { id: existing.id }, data })
      : await this.prisma.crm_contacts.create({
          data: {
            company_id: dto.companyId,
            ...data,
          },
        });

    if (dto.clientId) {
      await this.linkClient(contact.id, dto.clientId, dto.establishmentId ?? null);
    }

    return contact;
  }

  async linkClient(crmContactId: string, clientId: string, establishmentId: string | null) {
    await this.prisma.crm_contact_client_links.upsert({
      where: {
        crm_contact_id_client_id: {
          crm_contact_id: crmContactId,
          client_id: clientId,
        },
      },
      create: {
        crm_contact_id: crmContactId,
        client_id: clientId,
        establishment_id: establishmentId,
      },
      update: {
        establishment_id: establishmentId ?? undefined,
      },
    });
  }

  async syncFromClient(
    user: SessionUser,
    input: {
      companyId: string;
      clientId: string;
      establishmentId?: string | null;
      fullName: string;
      email?: string | null;
      phone?: string | null;
      documentType?: string | null;
      documentNumber?: string | null;
      source?: string | null;
    },
  ) {
    return this.upsertContact(user, {
      companyId: input.companyId,
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      documentType: input.documentType,
      documentNumber: input.documentNumber,
      source: input.source || "pms_client",
      clientId: input.clientId,
      establishmentId: input.establishmentId,
    });
  }

  async addActivity(
    user: SessionUser,
    input: {
      contactId: string;
      activityType: string;
      subject?: string;
      body?: string;
      metadata?: unknown;
    },
  ) {
    const contact = await this.getContact(user, input.contactId);
    return this.prisma.crm_activities.create({
      data: {
        company_id: contact.company_id,
        crm_contact_id: contact.id,
        activity_type: input.activityType,
        subject: input.subject || null,
        body: input.body || null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        created_by: user.id,
      },
    });
  }

  async upsertConsent(
    user: SessionUser,
    input: { contactId: string; channel: string; purpose: string; granted: boolean },
  ) {
    const contact = await this.getContact(user, input.contactId);
    const channel = input.channel.trim().toLowerCase();
    const purpose = input.purpose.trim().toLowerCase() || "marketing";
    return this.prisma.crm_consent.upsert({
      where: {
        crm_contact_id_channel_purpose: {
          crm_contact_id: contact.id,
          channel,
          purpose,
        },
      },
      create: {
        company_id: contact.company_id,
        crm_contact_id: contact.id,
        channel,
        purpose,
        granted: input.granted,
        granted_at: input.granted ? new Date() : null,
        revoked_at: input.granted ? null : new Date(),
      },
      update: {
        granted: input.granted,
        granted_at: input.granted ? new Date() : undefined,
        revoked_at: input.granted ? null : new Date(),
        updated_at: new Date(),
      },
    });
  }

  async mergePreview(user: SessionUser, sourceId: string, targetId: string) {
    const [source, target] = await Promise.all([
      this.getContact(user, sourceId),
      this.getContact(user, targetId),
    ]);
    if (source.company_id !== target.company_id) {
      throw new BadRequestException("Contacts must belong to the same company");
    }
    return {
      source,
      target,
      willMoveLinks: source.client_links.length,
      willMoveActivities: source.activities.length,
      stub: true,
      message: "Merge apply available; preview only in etapa 1 stub path if apply not called",
    };
  }

  async mergeApply(user: SessionUser, sourceId: string, targetId: string) {
    const preview = await this.mergePreview(user, sourceId, targetId);
    const source = preview.source;
    const target = preview.target;

    await this.prisma.$transaction(async (tx) => {
      for (const link of source.client_links) {
        await tx.crm_contact_client_links.upsert({
          where: {
            crm_contact_id_client_id: {
              crm_contact_id: target.id,
              client_id: link.client_id,
            },
          },
          create: {
            crm_contact_id: target.id,
            client_id: link.client_id,
            establishment_id: link.establishment_id,
          },
          update: {},
        });
      }
      await tx.crm_contact_client_links.deleteMany({ where: { crm_contact_id: source.id } });
      await tx.crm_activities.updateMany({
        where: { crm_contact_id: source.id },
        data: { crm_contact_id: target.id },
      });
      await tx.crm_consent.updateMany({
        where: { crm_contact_id: source.id },
        data: { crm_contact_id: target.id },
      });
      await tx.crm_contacts.update({
        where: { id: source.id },
        data: { deleted_at: new Date() },
      });
      await tx.crm_audit_logs.create({
        data: {
          company_id: target.company_id,
          crm_contact_id: target.id,
          action: "contact.merge",
          actor_user_id: user.id,
          before_data: { sourceId: source.id } as Prisma.InputJsonValue,
          after_data: { targetId: target.id } as Prisma.InputJsonValue,
          metadata: {} as Prisma.InputJsonValue,
        },
      });
    });

    return this.getContact360(user, target.id);
  }

  async enqueueOutbox(input: {
    companyId?: string | null;
    establishmentId?: string | null;
    eventType: string;
    payload: unknown;
    idempotencyKey: string;
  }) {
    let companyId = input.companyId || null;
    if (!companyId && input.establishmentId) {
      const est = await this.prisma.establishments.findUnique({
        where: { id: input.establishmentId },
        select: { company_id: true },
      });
      companyId = est?.company_id ?? null;
    }

    let event;
    try {
      event = await this.prisma.crm_outbox_events.create({
        data: {
          company_id: companyId,
          establishment_id: input.establishmentId || null,
          event_type: input.eventType,
          payload: (input.payload ?? {}) as Prisma.InputJsonValue,
          idempotency_key: input.idempotencyKey,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        event = await this.prisma.crm_outbox_events.findUnique({
          where: { idempotency_key: input.idempotencyKey },
        });
      } else {
        throw err;
      }
    }

    // Processa na hora (não depende de cron) para motor/staff verem o contato imediatamente
    if (event?.id && !event.processed_at) {
      await this.processPendingOutbox(1, event.id);
      return this.prisma.crm_outbox_events.findUnique({ where: { id: event.id } });
    }
    return event;
  }

  async processPendingOutbox(limit = 50, onlyId?: string) {
    const pending = await this.prisma.crm_outbox_events.findMany({
      where: onlyId ? { id: onlyId, processed_at: null } : { processed_at: null },
      orderBy: { created_at: "asc" },
      take: limit,
    });

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const event of pending) {
      try {
        const payload = (event.payload || {}) as Record<string, unknown>;
        let companyId = event.company_id || (payload.company_id ? String(payload.company_id) : null);
        if (!companyId && event.establishment_id) {
          const est = await this.prisma.establishments.findUnique({
            where: { id: event.establishment_id },
            select: { company_id: true },
          });
          companyId = est?.company_id ?? null;
          if (companyId) {
            await this.prisma.crm_outbox_events.update({
              where: { id: event.id },
              data: { company_id: companyId },
            });
          }
        }

        const syncTypes = new Set([
          "contact.upserted",
          "booking.created",
          "booking.checked_in",
          "booking.checked_out",
        ]);
        if (syncTypes.has(event.event_type) && companyId) {
          const clientId = payload.client_id ? String(payload.client_id) : null;
          let fullName = String(payload.full_name || payload.guest_name || "").trim();
          let email = (payload.email as string) || null;
          let phone = (payload.phone as string) || null;
          let documentType = (payload.document_type as string) || null;
          let documentNumber = (payload.document_number as string) || null;

          // Completar documento/nome a partir do cliente PMS quando o outbox veio incompleto
          if (clientId && (!documentNumber || !fullName)) {
            try {
              const client = await this.prisma.clients.findUnique({
                where: { id: clientId },
                select: {
                  full_name: true,
                  email: true,
                  phone: true,
                  document_type: true,
                  document_number: true,
                },
              });
              if (client) {
                if (!fullName) fullName = String(client.full_name || "").trim();
                if (!email) email = client.email || null;
                if (!phone) phone = client.phone || null;
                if (!documentType) documentType = client.document_type || null;
                if (!documentNumber) documentNumber = client.document_number || null;
              }
            } catch {
              /* ignore */
            }
          }

          if (fullName) {
            const systemUser = {
              id: "00000000-0000-0000-0000-000000000000",
              email: "system@crm.local",
              isSuperAdmin: true,
              companyIds: [companyId],
              establishmentIds: [],
            } as SessionUser;
            await this.upsertContact(systemUser, {
              companyId,
              clientId,
              establishmentId: event.establishment_id,
              fullName,
              email,
              phone,
              documentType,
              documentNumber,
              source: String(payload.source || event.event_type),
            });
          }
        }

        await this.prisma.crm_outbox_events.update({
          where: { id: event.id },
          data: { processed_at: new Date(), error: null },
        });

        if (this.automations && companyId) {
          try {
            await this.automations.onOutboxEvent({
              companyId,
              eventType: event.event_type,
              payload: {
                ...payload,
                company_id: companyId,
                establishment_id: event.establishment_id,
              },
            });
          } catch (autoErr) {
            console.warn("CRM automation dispatch:", autoErr);
          }
        }

        results.push({ id: event.id, ok: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await this.prisma.crm_outbox_events.update({
          where: { id: event.id },
          data: { error: message },
        });
        results.push({ id: event.id, ok: false, error: message });
      }
    }

    return { processed: results.length, results };
  }
}
