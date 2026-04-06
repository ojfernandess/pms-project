/**
 * Cria utilizador Auth para funcionário com a palavra-passe definida pelo gerente.
 * Usa `createUser` com `email_confirm: false` para o Supabase enviar o template
 * "Confirm sign up" (ex.: "Confirme sua conta - StayOS - PMS"), não o de convite ("Invite user").
 * Requer SITE_URL ou AUTH_REDIRECT_URL nas secrets (URL permitida em Authentication → URL Configuration).
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
    const { email, password, full_name, establishment_id } = body as {
      email?: string;
      password?: string;
      full_name?: string;
      establishment_id?: string;
    };

    if (!email?.trim() || !password || !establishment_id) {
      return new Response(
        JSON.stringify({
          error: "email, password e establishment_id são obrigatórios",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: callerProfile } = await supabase
      .from("users")
      .select("is_super_admin")
      .eq("id", caller.id)
      .maybeSingle();

    const isSuperAdmin = callerProfile?.is_super_admin === true;

    if (!isSuperAdmin) {
      const { data: emp, error: empErr } = await supabase
        .from("employees")
        .select(
          `
          id,
          custom_permissions,
          employee_roles ( code, permissions )
        `
        )
        .eq("user_id", caller.id)
        .eq("establishment_id", establishment_id)
        .eq("is_active", true)
        .maybeSingle();

      if (empErr) {
        console.error("employees lookup:", empErr);
        return new Response(JSON.stringify({ error: "Erro ao validar permissões" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!emp || !canManageEmployees(emp)) {
        return new Response(
          JSON.stringify({
            error:
              "Sem permissão para criar contas neste estabelecimento",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const emailNorm = email.trim().toLowerCase();
    const redirectRaw = (Deno.env.get("SITE_URL") ?? Deno.env.get("AUTH_REDIRECT_URL") ?? "").trim();
    const redirectTo = redirectRaw || undefined;

    const meta = { full_name: full_name?.trim() || undefined };

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: emailNorm,
      password,
      email_confirm: false,
      user_metadata: meta,
    });

    if (createErr) {
      const msg = (createErr.message ?? "").toLowerCase();
      if (
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists") ||
        msg.includes("duplicate")
      ) {
        return new Response(
          JSON.stringify({ error: "Este email já está registado no sistema de autenticação." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!created.user) {
      return new Response(JSON.stringify({ error: "Falha ao criar utilizador" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Com email_confirm: false o GoTrue envia o template "Confirm sign up" (não o de convite).
    return new Response(
      JSON.stringify({
        user_id: created.user.id,
        email: created.user.email ?? emailNorm,
        auth_email_sent: true,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
