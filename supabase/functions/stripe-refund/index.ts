import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const {
      payment_id,
      amount,
      reason,
      description,
      establishment_id,
    } = await req.json();

    if (!payment_id || !amount || !establishment_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Buscar pagamento no banco
    const { data: payment, error: paymentError } = await supabaseClient
      .from("stripe_payments")
      .select("*")
      .eq("id", payment_id)
      .eq("establishment_id", establishment_id)
      .single();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: "Payment not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (payment.status !== "succeeded") {
      return new Response(
        JSON.stringify({ error: "Payment must be succeeded to refund" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Buscar configuração do estabelecimento
    const { data: config, error: configError } = await supabaseClient
      .from("stripe_establishment_config")
      .select("*")
      .eq("establishment_id", establishment_id)
      .eq("is_enabled", true)
      .single();

    if (configError || !config) {
      return new Response(
        JSON.stringify({ error: "Stripe not configured for this establishment" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Buscar configuração global para determinar modo de teste
    const { data: globalConfig } = await supabaseClient
      .from("stripe_global_config")
      .select("test_mode")
      .single();

    const isTestMode = globalConfig?.test_mode ?? true;
    const secretKey = isTestMode ? config.test_secret_key : config.live_secret_key;

    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "Stripe secret key not configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const stripe = new Stripe(secretKey, {
      apiVersion: "2023-10-16",
    });

    // Criar reembolso no Stripe
    const refundData: any = {
      payment_intent: payment.stripe_payment_intent_id,
      amount: Math.round(amount * 100), // Converter para centavos
      metadata: {
        payment_id: payment.id,
        establishment_id,
        reservation_id: payment.reservation_id || "",
        reason: reason || "",
      },
    };

    if (reason) {
      refundData.reason = reason;
    }

    if (description) {
      refundData.metadata.description = description;
    }

    const refund = await stripe.refunds.create(refundData);

    // Salvar reembolso no banco
    const { data: refundRecord, error: dbError } = await supabaseClient
      .from("stripe_refunds")
      .insert({
        establishment_id,
        payment_id: payment.id,
        reservation_id: payment.reservation_id || null,
        stripe_refund_id: refund.id,
        amount: refund.amount / 100,
        currency: refund.currency,
        status: refund.status,
        reason: refund.reason || null,
        description: description || null,
        metadata: refund.metadata,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Error saving refund to database:", dbError);
    }

    // Atualizar status do pagamento se for reembolso total
    if (refund.amount === payment.amount * 100) {
      await supabaseClient
        .from("stripe_payments")
        .update({ status: "refunded" })
        .eq("id", payment.id);
    } else {
      // Reembolso parcial - pode adicionar lógica adicional aqui
      await supabaseClient
        .from("stripe_payments")
        .update({ status: "partially_refunded" })
        .eq("id", payment.id);
    }

    return new Response(
      JSON.stringify({
        refund_id: refund.id,
        refund_record_id: refundRecord?.id,
        status: refund.status,
        amount: refund.amount / 100,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing refund:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

