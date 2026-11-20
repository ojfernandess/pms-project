import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthService, SessionUser } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CrmB2bService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async listCompanies(user: SessionUser, companyId: string, q?: string) {
    this.auth.assertCompany(user, companyId);
    return this.prisma.crm_companies.findMany({
      where: {
        company_id: companyId,
        deleted_at: null,
        ...(q?.trim()
          ? {
              OR: [
                { legal_name: { contains: q.trim(), mode: "insensitive" } },
                { trade_name: { contains: q.trim(), mode: "insensitive" } },
                { document_number: { contains: q.trim(), mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { updated_at: "desc" },
      include: {
        contacts: {
          include: {
            crm_contact: { select: { id: true, full_name: true, email: true, phone: true } },
          },
        },
        _count: { select: { contacts: true } },
      },
    });
  }

  async upsertCompany(
    user: SessionUser,
    input: {
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
    this.auth.assertCompany(user, input.companyId);
    if (!input.legalName?.trim()) throw new BadRequestException("legalName is required");

    const data = {
      legal_name: input.legalName.trim(),
      trade_name: input.tradeName?.trim() || null,
      document_number: input.documentNumber?.trim() || null,
      partner_type: input.partnerType?.trim() || "corporate",
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      address: input.address?.trim() || null,
      commercial_owner: input.commercialOwner?.trim() || null,
      notes: input.notes?.trim() || null,
      commercial_terms: (input.commercialTerms ?? {}) as Prisma.InputJsonValue,
      updated_at: new Date(),
    };

    if (input.id) {
      const existing = await this.prisma.crm_companies.findUnique({ where: { id: input.id } });
      if (!existing || existing.deleted_at) throw new NotFoundException("Company not found");
      this.auth.assertCompany(user, existing.company_id);
      return this.prisma.crm_companies.update({ where: { id: input.id }, data });
    }

    return this.prisma.crm_companies.create({
      data: {
        company_id: input.companyId,
        ...data,
      },
    });
  }

  async linkContact(
    user: SessionUser,
    input: { crmCompanyId: string; crmContactId: string; role?: string; isPrimary?: boolean },
  ) {
    const company = await this.prisma.crm_companies.findUnique({
      where: { id: input.crmCompanyId },
    });
    if (!company || company.deleted_at) throw new NotFoundException("Company not found");
    this.auth.assertCompany(user, company.company_id);

    const contact = await this.prisma.crm_contacts.findUnique({
      where: { id: input.crmContactId },
    });
    if (!contact || contact.deleted_at) throw new NotFoundException("Contact not found");
    if (contact.company_id !== company.company_id) {
      throw new BadRequestException("Contact belongs to another tenant");
    }

    return this.prisma.crm_company_contacts.upsert({
      where: {
        crm_company_id_crm_contact_id: {
          crm_company_id: input.crmCompanyId,
          crm_contact_id: input.crmContactId,
        },
      },
      create: {
        crm_company_id: input.crmCompanyId,
        crm_contact_id: input.crmContactId,
        role: input.role || null,
        is_primary: input.isPrimary ?? false,
      },
      update: {
        role: input.role || null,
        is_primary: input.isPrimary ?? false,
      },
    });
  }

  async softDelete(user: SessionUser, crmCompanyId: string) {
    const company = await this.prisma.crm_companies.findUnique({ where: { id: crmCompanyId } });
    if (!company) throw new NotFoundException("Company not found");
    this.auth.assertCompany(user, company.company_id);
    return this.prisma.crm_companies.update({
      where: { id: crmCompanyId },
      data: { deleted_at: new Date(), updated_at: new Date() },
    });
  }
}
