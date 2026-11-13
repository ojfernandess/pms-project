import { randomUUID } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { hashPassword } from "../auth/password";
import { PrismaService } from "../prisma/prisma.service";

type EmployeeAccess = {
  custom_permissions: Prisma.JsonValue | null;
  employee_roles: { code: string | null; permissions: Prisma.JsonValue | null } | null;
};

@Injectable()
export class EmployeeAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: StaffIdentityService,
  ) {}

  async create(authorization: string | undefined, body: { email?: string; password?: string; full_name?: string; establishment_id?: string }) {
    const caller = await this.caller(authorization);
    if (!caller.ok) return { status: caller.status, body: caller.body };
    if (!body.email?.trim() || !body.password || !body.establishment_id) {
      return { status: 400, body: { error: "email, password e establishment_id são obrigatórios" } };
    }
    const allowed = await this.canManage(caller.userId, body.establishment_id);
    if (!allowed.ok) {
      return { status: allowed.status, body: { error: allowed.status === 403 ? "Sem permissão para criar contas neste estabelecimento" : allowed.message } };
    }
    const email = body.email.trim().toLowerCase();
    const existing = await this.prisma.auth_users.findFirst({ where: { email: { equals: email, mode: "insensitive" }, deleted_at: null }, select: { id: true } });
    if (existing) return { status: 400, body: { error: "Este email já está registado no sistema de autenticação." } };
    const userId = randomUUID();
    const instance = await this.prisma.instances.findFirst({ select: { id: true } });
    const now = new Date();
    await this.prisma.auth_users.create({
      data: {
        id: userId,
        instance_id: instance?.id,
        aud: "authenticated",
        role: "authenticated",
        email,
        encrypted_password: await hashPassword(body.password),
        email_confirmed_at: null,
        confirmation_token: "",
        raw_app_meta_data: { provider: "email", providers: ["email"] },
        raw_user_meta_data: { full_name: body.full_name?.trim() || undefined },
        created_at: now,
        updated_at: now,
        is_sso_user: false,
        is_anonymous: false,
        identities: {
          create: {
            provider: "email",
            provider_id: userId,
            identity_data: { sub: userId, email, email_verified: false, full_name: body.full_name?.trim() || undefined },
            created_at: now,
            updated_at: now,
          },
        },
      },
    });
    return { status: 200, body: { user_id: userId, email, auth_email_sent: false } };
  }

  async admin(authorization: string | undefined, body: { action?: string; establishment_id?: string; user_ids?: string[]; user_id?: string }) {
    const caller = await this.caller(authorization);
    if (!caller.ok) return { status: caller.status, body: caller.body };
    if (!body.establishment_id?.trim()) return { status: 400, body: { error: "establishment_id é obrigatório" } };
    const allowed = await this.canManage(caller.userId, body.establishment_id);
    if (!allowed.ok) return { status: allowed.status, body: { error: allowed.message } };
    if (body.action === "auth_status_batch") return this.statuses(body.establishment_id, body.user_ids);
    if (body.action === "resend_confirmation") return this.resend(body.establishment_id, body.user_id);
    return { status: 400, body: { error: "Ação inválida. Use auth_status_batch ou resend_confirmation." } };
  }

  private async statuses(establishmentId: string, userIds: string[] | undefined) {
    if (!Array.isArray(userIds) || userIds.length === 0) return { status: 400, body: { error: "user_ids (array) é obrigatório" } };
    const unique = [...new Set(userIds.filter((id) => typeof id === "string" && id.length > 0))];
    if (unique.length > 100) return { status: 400, body: { error: "Máximo de 100 utilizadores por pedido" } };
    const rows = await this.prisma.employees.findMany({ where: { establishment_id: establishmentId, user_id: { in: unique } }, select: { user_id: true } });
    const allowed = new Set(rows.map((row) => row.user_id));
    const users = await this.prisma.auth_users.findMany({
      where: { id: { in: [...allowed] } },
      select: { id: true, email: true, email_confirmed_at: true, last_sign_in_at: true, banned_until: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    const statuses: Record<string, unknown> = {};
    for (const id of unique) {
      const user = allowed.has(id) ? byId.get(id) : undefined;
      statuses[id] = user ? snapshot(user) : null;
    }
    return { status: 200, body: { statuses } };
  }

  private async resend(establishmentId: string, userId: string | undefined) {
    if (!userId?.trim()) return { status: 400, body: { error: "user_id é obrigatório" } };
    const employee = await this.prisma.employees.findFirst({ where: { establishment_id: establishmentId, user_id: userId }, select: { user_id: true } });
    if (!employee) return { status: 404, body: { error: "Funcionário não encontrado neste estabelecimento" } };
    const user = await this.prisma.auth_users.findUnique({ where: { id: userId }, select: { email: true, email_confirmed_at: true } });
    if (!user) return { status: 404, body: { error: "Conta de autenticação não encontrada" } };
    if (!user.email?.trim()) return { status: 400, body: { error: "Este utilizador não tem e-mail para envio do link" } };
    if (user.email_confirmed_at) return { status: 400, body: { error: "O e-mail deste utilizador já está confirmado no Supabase Auth." } };
    return { status: 400, body: { error: "Falha ao reenviar e-mail de confirmação: o servidor ainda não tem transporte de e-mail para o template Confirm sign up." } };
  }

  private async caller(authorization: string | undefined): Promise<{ ok: true; userId: string } | { ok: false; status: number; body: { error: string } }> {
    if (!authorization?.startsWith("Bearer ")) return { ok: false, status: 401, body: { error: "Não autorizado" } };
    const userId = await this.identity.resolve(authorization);
    if (!userId) return { ok: false, status: 401, body: { error: "Sessão inválida" } };
    return { ok: true, userId };
  }

  private async canManage(userId: string, establishmentId: string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    const admin = await this.prisma.admin_users.findUnique({ where: { user_id: userId }, select: { is_super_admin: true } });
    if (admin?.is_super_admin === true) return { ok: true };
    const employee = await this.prisma.employees.findFirst({
      where: { user_id: userId, establishment_id: establishmentId, is_active: true },
      select: { custom_permissions: true, employee_roles: { select: { code: true, permissions: true } } },
    });
    if (!employee || !canManageEmployees(employee)) {
      return { ok: false, status: 403, message: "Sem permissão para esta operação neste estabelecimento" };
    }
    return { ok: true };
  }
}

export function canManageEmployees(employee: EmployeeAccess | null): boolean {
  if (!employee?.employee_roles) return false;
  if (employee.employee_roles.code === "manager") return true;
  return permissionOn(employee.custom_permissions, "employees") ?? permissionOn(employee.employee_roles.permissions, "employees") ?? false;
}

function permissionOn(source: Prisma.JsonValue | null, key: string): boolean | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const value = (source as Record<string, unknown>)[key];
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some((item) => item === true);
  return false;
}

function snapshot(user: { email: string | null; email_confirmed_at: Date | null; last_sign_in_at: Date | null; banned_until: Date | null }) {
  const banned = Boolean(user.banned_until && user.banned_until > new Date());
  const confirmed = Boolean(user.email_confirmed_at);
  return {
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    last_sign_in_at: user.last_sign_in_at,
    banned_until: user.banned_until,
    is_banned: banned,
    email_confirmed: confirmed,
    auth_label: banned ? "suspenso" : confirmed ? "ativo" : "pendente",
  };
}
