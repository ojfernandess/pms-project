import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthService, SessionUser } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildLoyaltyIdempotencyKey,
  computeEarnPoints,
  DEFAULT_LOYALTY_TIERS,
  parseTiers,
  resolveTierKey,
} from "./crm-loyalty.logic";

@Injectable()
export class CrmLoyaltyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async ensureProgram(user: SessionUser, companyId: string) {
    this.auth.assertCompany(user, companyId);
    const existing = await this.prisma.crm_loyalty_programs.findFirst({
      where: { company_id: companyId, is_active: true },
    });
    if (existing) return existing;
    return this.prisma.crm_loyalty_programs.create({
      data: {
        company_id: companyId,
        name: "Programa StayOS",
        points_per_currency: new Prisma.Decimal(1),
        tiers: DEFAULT_LOYALTY_TIERS as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async getProgram(user: SessionUser, companyId: string) {
    return this.ensureProgram(user, companyId);
  }

  async listAccounts(user: SessionUser, companyId: string) {
    this.auth.assertCompany(user, companyId);
    await this.ensureProgram(user, companyId);
    return this.prisma.crm_loyalty_accounts.findMany({
      where: { company_id: companyId },
      orderBy: { lifetime_points: "desc" },
      take: 100,
      include: {
        crm_contact: { select: { id: true, full_name: true, email: true, classification: true } },
      },
    });
  }

  async ensureAccount(companyId: string, programId: string, contactId: string) {
    const existing = await this.prisma.crm_loyalty_accounts.findUnique({
      where: {
        program_id_crm_contact_id: { program_id: programId, crm_contact_id: contactId },
      },
    });
    if (existing) return existing;
    return this.prisma.crm_loyalty_accounts.create({
      data: {
        company_id: companyId,
        program_id: programId,
        crm_contact_id: contactId,
      },
    });
  }

  async earnPoints(
    user: SessionUser,
    input: {
      companyId: string;
      crmContactId: string;
      amount: number;
      reservationId?: string;
      note?: string;
    },
  ) {
    this.auth.assertCompany(user, input.companyId);
    const program = await this.ensureProgram(user, input.companyId);
    const contact = await this.prisma.crm_contacts.findUnique({
      where: { id: input.crmContactId },
    });
    if (!contact || contact.deleted_at || contact.company_id !== input.companyId) {
      throw new NotFoundException("Contact not found");
    }

    const points = computeEarnPoints(
      input.amount,
      Number(program.points_per_currency),
    );
    if (points <= 0) throw new BadRequestException("No points to award");

    const idempotencyKey = buildLoyaltyIdempotencyKey({
      contactId: input.crmContactId,
      reservationId: input.reservationId,
      txType: "earn",
    });

    const dup = await this.prisma.crm_loyalty_transactions.findFirst({
      where: { company_id: input.companyId, idempotency_key: idempotencyKey },
    });
    if (dup) return { deduped: true, transaction: dup };

    const account = await this.ensureAccount(input.companyId, program.id, input.crmContactId);
    const tiers = parseTiers(program.tiers);
    const newBalance = Number(account.points_balance) + points;
    const newLifetime = Number(account.lifetime_points) + points;
    const tierKey = resolveTierKey(newLifetime, tiers);

    const [transaction, updated] = await this.prisma.$transaction([
      this.prisma.crm_loyalty_transactions.create({
        data: {
          company_id: input.companyId,
          account_id: account.id,
          crm_contact_id: input.crmContactId,
          tx_type: "earn",
          points: new Prisma.Decimal(points),
          reservation_id: input.reservationId || null,
          idempotency_key: idempotencyKey,
          note: input.note || null,
          metadata: { amount: input.amount } as Prisma.InputJsonValue,
        },
      }),
      this.prisma.crm_loyalty_accounts.update({
        where: { id: account.id },
        data: {
          points_balance: new Prisma.Decimal(newBalance),
          lifetime_points: new Prisma.Decimal(newLifetime),
          tier_key: tierKey,
          updated_at: new Date(),
        },
      }),
    ]);

    if (tierKey !== "bronze" && contact.classification !== tierKey) {
      await this.prisma.crm_contacts.update({
        where: { id: contact.id },
        data: { classification: tierKey, updated_at: new Date() },
      });
    }

    return { deduped: false, transaction, account: updated, points };
  }

  async listTransactions(user: SessionUser, companyId: string, limit = 50) {
    this.auth.assertCompany(user, companyId);
    return this.prisma.crm_loyalty_transactions.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: "desc" },
      take: Math.min(100, Math.max(1, limit)),
      include: {
        crm_contact: { select: { id: true, full_name: true } },
      },
    });
  }
}
