/**
 * Operações de Auth para funcionários (service role): estado da conta (Supabase Auth)
 * e reenvio de convite / confirmação por e-mail.
 * Requer SITE_URL ou AUTH_REDIRECT_URL nas secrets (redirect permitido no dashboard Auth).
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function canManageEmployees(emp: {
  custom_permissions?: Record<string, unknown> | null;
  employee_roles?: {
    code?: string | null;
    permissions?: Record<string, unknown> | null;
  } | null;
} | null): boolean {
  if (!emp?.employee_roles) return false;
  if (emp.employee_roles.code === "manager") return true;

  const custom = emp.custom_permissions?.employees;
  if (custom !== undefined && custom !== null) {
    if (typeof custom === "boolean") return custom === true;
    if (typeof custom === "object") {
      return Object.values(custom as Record<string, unknown>).some((v) => v === true);
    }
  }

  const p = emp.employee_roles.permissions?.employees;
  if (p === undefined || p === null) return false;
  if (typeof p === "boolean") return p === true;
  if (typeof p === "object") {
    return Object.values(p as Record<string, unknown>).some((v) => v === true);
  }
  return false;
}

async function assertCallerCanManage(
  supabase: ReturnType<typeof createClient>,
  callerId: string,
  establishmentId: string
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const { data: callerProfile } = await supabase
    .from("users")
    .select("is_super_admin")
    .eq("id", callerId)
    .maybeSingle();

  if (callerProfile?.is_super_admin === true) {
    return { ok: true };
  }

  const { data: emp, error: empErr } = await supabase
    .from("employees")
    .select(
      `
      id,
      custom_permissions,
      employee_roles ( code, permissions )
    `
    )
    .eq("user_id", callerId)
    .eq("establishment_id", establishmentId)
    .eq("is_active", true)
    .maybeSingle();

  if (empErr) {
    console.error("employees lookup:", empErr);
    return { ok: false, status: 500, message: "Erro ao validar permissões" };
  }

  if (!emp || !canManageEmployees(emp)) {
    return {
      ok: false,
      status: 403,
      message: "Sem permissão para esta operação neste estabelecimento",
    };
  }

  return { ok: true };
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: caller },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Sessão inválida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = (body as { action?: string }).action;
    const establishment_id = (body as { establishment_id?: string }).establishment_id;

    if (!establishment_id?.trim()) {
      return new Response(
        JSON.stringify({ error: "establishment_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const perm = await assertCallerCanManage(supabase, caller.id, establishment_id);
    if (!perm.ok) {
      return new Response(JSON.stringify({ error: perm.message }), {
        status: perm.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redirectRaw = (Deno.env.get("SITE_URL") ?? Deno.env.get("AUTH_REDIRECT_URL") ?? "").trim();
    const redirectTo = redirectRaw || undefined;

    if (action === "auth_status_batch") {
      const user_ids = (body as { user_ids?: string[] }).user_ids;
      if (!Array.isArray(user_ids) || user_ids.length === 0) {
        return new Response(JSON.stringify({ error: "user_ids (array) é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const unique = [...new Set(user_ids.filter((id) => typeof id === "string" && id.length > 0))];
      if (unique.length > 100) {
        return new Response(JSON.stringify({ error: "Máximo de 100 utilizadores por pedido" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: rows, error: empErr } = await supabase
        .from("employees")
        .select("user_id")
        .eq("establishment_id", establishment_id)
        .in("user_id", unique);

      if (empErr) {
        console.error("employees batch:", empErr);
        return new Response(JSON.stringify({ error: "Erro ao validar funcionários" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const allowed = new Set((rows ?? []).map((r: { user_id: string }) => r.user_id));
      const statuses: Record<string, ReturnType<typeof authSnapshot> | null> = {};

      await Promise.all(
        unique.map(async (uid) => {
          if (!allowed.has(uid)) {
            statuses[uid] = null;
            return;
          }
          const { data, error } = await supabase.auth.admin.getUserById(uid);
          if (error || !data?.user) {
            statuses[uid] = null;
            return;
          }
          statuses[uid] = authSnapshot(data.user);
        })
      );

      return new Response(JSON.stringify({ statuses }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "resend_confirmation") {
      const user_id = (body as { user_id?: string }).user_id;
      if (!user_id?.trim()) {
        return new Response(JSON.stringify({ error: "user_id é obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: row, error: oneErr } = await supabase
        .from("employees")
        .select("user_id")
        .eq("establishment_id", establishment_id)
        .eq("user_id", user_id)
        .maybeSingle();

      if (oneErr || !row) {
        return new Response(
          JSON.stringify({ error: "Funcionário não encontrado neste estabelecimento" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: authData, error: getErr } = await supabase.auth.admin.getUserById(user_id);
      if (getErr || !authData?.user) {
        return new Response(JSON.stringify({ error: "Conta de autenticação não encontrada" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const u = authData.user;
      const email = (u.email ?? "").trim().toLowerCase();
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Este utilizador não tem e-mail para envio do link" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (u.email_confirmed_at) {
        return new Response(
          JSON.stringify({ error: "O e-mail deste utilizador já está confirmado no Supabase Auth." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mesmo template que "Confirm sign up" no dashboard (não "Invite user").
      const { error: resendErr } = await supabase.auth.resend({
        type: "signup",
        email,
        options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
      });

      if (resendErr) {
        return new Response(
          JSON.stringify({
            error: resendErr.message || "Falha ao reenviar e-mail de confirmação",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ ok: true, method: "resend_signup" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Ação inválida. Use auth_status_batch ou resend_confirmation." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
