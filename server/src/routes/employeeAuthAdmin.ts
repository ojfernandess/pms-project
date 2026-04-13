import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { createServiceClient } from "../services/supabase.js";
import { HttpError } from "../utils/httpError.js";

function canManageEmployees(emp: {
  custom_permissions?: Record<string, unknown> | null;
  employee_roles?: { code?: string | null; permissions?: Record<string, unknown> | null } | null;
} | null): boolean {
  if (!emp?.employee_roles) return false;
  if (emp.employee_roles.code === "manager") return true;
  const custom = emp.custom_permissions?.employees;
  if (typeof custom === "boolean") return custom;
  if (custom && typeof custom === "object") return Object.values(custom).some((v) => v === true);
  const p = emp.employee_roles.permissions?.employees;
  if (typeof p === "boolean") return p;
  if (p && typeof p === "object") return Object.values(p).some((v) => v === true);
  return false;
}

async function assertCallerCanManage(db: ReturnType<typeof createServiceClient>, callerId: string, establishmentId: string): Promise<void> {
  const { data: profile } = await db.from("users").select("is_super_admin").eq("id", callerId).maybeSingle<{ is_super_admin: boolean | null }>();
  if (profile?.is_super_admin) return;
  const { data: emp, error } = await db
    .from("employees")
    .select("id, custom_permissions, employee_roles(code, permissions)")
    .eq("user_id", callerId)
    .eq("establishment_id", establishmentId)
    .eq("is_active", true)
    .maybeSingle<{
      id: string;
      custom_permissions: Record<string, unknown> | null;
      employee_roles: { code?: string | null; permissions?: Record<string, unknown> | null } | null;
    }>();
  if (error) throw new HttpError(500, "Erro ao validar permissões", "PERMISSION_CHECK_FAILED");
  if (!emp || !canManageEmployees(emp)) {
    throw new HttpError(403, "Sem permissão para esta operação neste estabelecimento", "FORBIDDEN");
  }
}

function authSnapshot(user: {
  email?: string | null;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
  banned_until?: string | null;
}) {
  const bannedUntil = user.banned_until ?? null;
  const isBanned = !!(bannedUntil && new Date(bannedUntil) > new Date());
  const emailConfirmed = !!user.email_confirmed_at;
  let auth_label: "ativo" | "pendente" | "suspenso" = "pendente";
  if (isBanned) auth_label = "suspenso";
  else if (emailConfirmed) auth_label = "ativo";
  return {
    email: user.email ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
    banned_until: bannedUntil,
    is_banned: isBanned,
    email_confirmed: emailConfirmed,
    auth_label,
  };
}

const authStatusBatchSchema = z.object({
  action: z.literal("auth_status_batch"),
  establishment_id: z.string().uuid(),
  user_ids: z.array(z.string().uuid()).min(1).max(100),
});

const resendSchema = z.object({
  action: z.literal("resend_confirmation"),
  establishment_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

export async function registerEmployeeAuthAdminRoutes(app: FastifyInstance, env: Env): Promise<void> {
  const db = createServiceClient(env);
  const authPre = requireAuth(env);

  app.post("/api/employees/auth-admin", { preHandler: authPre }, async (request, reply) => {
    const raw = request.body as Record<string, unknown>;
    const action = raw?.action;

    if (action === "auth_status_batch") {
      const parsed = authStatusBatchSchema.safeParse(raw);
      if (!parsed.success) throw new HttpError(400, "Corpo inválido", "VALIDATION", parsed.error.flatten());
      await assertCallerCanManage(db, request.user!.id, parsed.data.establishment_id);

      const { data: rows, error } = await db
        .from("employees")
        .select("user_id")
        .eq("establishment_id", parsed.data.establishment_id)
        .in("user_id", parsed.data.user_ids);
      if (error) throw new HttpError(500, "Erro ao validar funcionários", "EMPLOYEE_LOOKUP_FAILED");

      const allowed = new Set((rows ?? []).map((r: { user_id: string }) => r.user_id));
      const statuses: Record<string, ReturnType<typeof authSnapshot> | null> = {};
      await Promise.all(
        parsed.data.user_ids.map(async (uid) => {
          if (!allowed.has(uid)) {
            statuses[uid] = null;
            return;
          }
          const { data, error: getErr } = await db.auth.admin.getUserById(uid);
          if (getErr || !data?.user) statuses[uid] = null;
          else statuses[uid] = authSnapshot(data.user);
        }),
      );
      await reply.send({ statuses });
      return;
    }

    if (action === "resend_confirmation") {
      const parsed = resendSchema.safeParse(raw);
      if (!parsed.success) throw new HttpError(400, "Corpo inválido", "VALIDATION", parsed.error.flatten());
      await assertCallerCanManage(db, request.user!.id, parsed.data.establishment_id);

      const { data: row } = await db
        .from("employees")
        .select("user_id")
        .eq("establishment_id", parsed.data.establishment_id)
        .eq("user_id", parsed.data.user_id)
        .maybeSingle<{ user_id: string }>();
      if (!row) throw new HttpError(404, "Funcionário não encontrado neste estabelecimento", "EMPLOYEE_NOT_FOUND");

      const { data: authData, error: getErr } = await db.auth.admin.getUserById(parsed.data.user_id);
      if (getErr || !authData?.user) throw new HttpError(404, "Conta de autenticação não encontrada", "AUTH_USER_NOT_FOUND");
      const email = (authData.user.email ?? "").trim().toLowerCase();
      if (!email) throw new HttpError(400, "Este utilizador não tem e-mail para envio do link", "MISSING_EMAIL");
      if (authData.user.email_confirmed_at) {
        throw new HttpError(400, "O e-mail deste utilizador já está confirmado no Supabase Auth.", "ALREADY_CONFIRMED");
      }

      const redirectRaw = (env.SITE_URL ?? "").trim();
      const { error: resendErr } = await db.auth.resend({
        type: "signup",
        email,
        options: redirectRaw ? { emailRedirectTo: redirectRaw } : undefined,
      });
      if (resendErr) throw new HttpError(400, resendErr.message || "Falha ao reenviar e-mail de confirmação", "RESEND_FAILED");

      await reply.send({ ok: true, method: "resend_signup" });
      return;
    }

    throw new HttpError(400, "Ação inválida. Use auth_status_batch ou resend_confirmation.", "INVALID_ACTION");
  });
}
