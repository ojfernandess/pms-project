// Dispara o webhook configurado na empresa (Configurações Avançadas do motor)
// quando eventos ocorrem (ex.: reserva criada). Recebe establishment_id, event e payload.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmacSha256(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { establishment_id: establishmentId, event, payload } = body as {
      establishment_id?: string;
      event?: string;
      payload?: unknown;
    };

    if (!establishmentId || !event) {
      return new Response(
        JSON.stringify({ error: "establishment_id and event are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: establishment, error: estError } = await supabase
      .from("establishments")
      .select("company_id")
      .eq("id", establishmentId)
      .maybeSingle();

    if (estError || !establishment?.company_id) {
      return new Response(
        JSON.stringify({ error: "Establishment or company not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("booking_engine_webhook_url, booking_engine_webhook_secret")
      .eq("id", establishment.company_id)
      .maybeSingle();

    if (companyError || !company?.booking_engine_webhook_url) {
      return new Response(
        JSON.stringify({ ok: true, message: "No webhook configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const webhookUrl = (company.booking_engine_webhook_url as string).trim();
    const secret = (company.booking_engine_webhook_secret as string)?.trim() || null;

    const webhookBody = JSON.stringify({
      event,
      payload: payload ?? null,
      timestamp: new Date().toISOString(),
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Event": event,
      "User-Agent": "PMS-BookingEngine-Webhook/1",
    };

    if (secret) {
      const signature = await hmacSha256(webhookBody, secret);
      headers["X-Webhook-Signature"] = `sha256=${signature}`;
    }

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: webhookBody,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Webhook delivery failed:", res.status, text);
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Webhook delivery failed",
          status: res.status,
          response: text.slice(0, 500),
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, status: res.status }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("call-company-webhook error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", message: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
