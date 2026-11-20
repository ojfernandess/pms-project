import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthDirectory, AuthUserRecord, ScopeFacts } from "./auth.types";

interface AuthUserRow {
  id: string;
  email: string | null;
  encrypted_password: string | null;
  email_confirmed_at: Date | null;
  banned_until: Date | null;
}

@Injectable()
export class PrismaAuthDirectory implements AuthDirectory {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<AuthUserRecord | null> {
    const rows = await this.prisma.$queryRaw<AuthUserRow[]>`
      SELECT id, email, encrypted_password, email_confirmed_at, banned_until
      FROM auth.users
      WHERE lower(email) = lower(${email})
        AND deleted_at IS NULL
      LIMIT 1
    `;
    return this.mapUser(rows[0]);
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    const rows = await this.prisma.$queryRaw<AuthUserRow[]>`
      SELECT id, email, encrypted_password, email_confirmed_at, banned_until
      FROM auth.users
      WHERE id = ${id}::uuid
        AND deleted_at IS NULL
      LIMIT 1
    `;
    return this.mapUser(rows[0]);
  }

  async loadScope(userId: string): Promise<ScopeFacts> {
    const rows = await this.prisma.$queryRaw<
      Array<{ is_super_admin: boolean; company_ids: string[] | null }>
    >`
      SELECT
        COALESCE((
          SELECT bool_or(is_super_admin)
          FROM public.admin_users
          WHERE user_id = ${userId}::uuid
        ), false) AS is_super_admin,
        (
          SELECT array_agg(DISTINCT cid)
          FROM (
            SELECT company_id::text AS cid
            FROM public.user_companies
            WHERE user_id = ${userId}::uuid
            UNION
            SELECT est.company_id::text AS cid
            FROM public.employees emp
            JOIN public.establishments est ON est.id = emp.establishment_id
            WHERE emp.user_id = ${userId}::uuid
              AND COALESCE(emp.is_active, true) = true
          ) scope_companies
        ) AS company_ids
    `;
    const row = rows[0];
    return {
      isSuperAdmin: row?.is_super_admin === true,
      companyIds: row?.company_ids?.filter(Boolean) ?? [],
    };
  }

  async establishmentCompanyId(establishmentId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ company_id: string }>>`
      SELECT company_id
      FROM public.establishments
      WHERE id = ${establishmentId}::uuid
      LIMIT 1
    `;
    return rows[0]?.company_id ?? null;
  }

  async updatePassword(userId: string, bcryptHash: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE auth.users
      SET encrypted_password = ${bcryptHash}, updated_at = now()
      WHERE id = ${userId}::uuid
    `;
  }

  private mapUser(row: AuthUserRow | undefined): AuthUserRecord | null {
    if (!row?.email) return null;
    return {
      id: row.id,
      email: row.email,
      encryptedPassword: row.encrypted_password,
      emailConfirmedAt: row.email_confirmed_at,
      bannedUntil: row.banned_until,
    };
  }
}
