import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { payment_intent_id, get_client_secret } = await req.json();

    if (!payment_intent_id) {
      return new Response(
        JSON.stringify({ error: "payment_intent_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Buscar o pagamento no banco de dados
    const { data: payment, error: paymentError } = await supabaseClient
      .from("stripe_payments")
      .select("*")
      .eq("stripe_payment_intent_id", payment_intent_id)
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

    // Buscar configuração do estabelecimento para obter a chave secreta do Stripe
    const { data: config } = await supabaseClient
      .from("stripe_establishment_config")
      .select("*")
      .eq("establishment_id", payment.establishment_id)
      .eq("is_enabled", true)
      .single();

    if (!config) {
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

    // Buscar o Payment Intent no Stripe
    console.log(`[stripe-payment-status] Buscando Payment Intent: ${payment_intent_id}`);
    // Expandir apenas 'charges' - não podemos expandir 'charges.data.payment_method'
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id, {
      expand: ['charges']
    });
    
    console.log(`[stripe-payment-status] Status no Stripe: ${paymentIntent.status}, Status no banco: ${payment.status}`);
    console.log(`[stripe-payment-status] Detalhes do Payment Intent:`, {
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      charges_count: Array.isArray(paymentIntent.charges) 
        ? paymentIntent.charges.length 
        : paymentIntent.charges?.data?.length || 0,
      last_payment_error: paymentIntent.last_payment_error,
      payment_method: paymentIntent.payment_method,
      created: new Date(paymentIntent.created * 1000).toISOString(),
    });

    let updated = false;

    // Verificar se há charges (indicam que o pagamento foi processado)
    // Nota: charges pode ser um array ou um objeto com data
    const chargesData = Array.isArray(paymentIntent.charges) 
      ? paymentIntent.charges 
      : paymentIntent.charges?.data || [];
    const hasCharges = chargesData.length > 0;
    const hasSucceededCharge = hasCharges && chargesData.some((charge: any) => charge.status === 'succeeded');
    
    console.log(`[stripe-payment-status] Verificando charges:`, {
      hasCharges,
      chargesCount: chargesData.length,
      hasSucceededCharge,
      chargeStatuses: chargesData.map((c: any) => c.status),
    });

    // Se o status mudou, atualizar no banco de dados
    // OU se há uma charge bem-sucedida mas o status ainda é requires_payment_method
    const shouldUpdate = payment.status !== paymentIntent.status || 
                        (hasSucceededCharge && paymentIntent.status === 'requires_payment_method');
    
    if (shouldUpdate && payment.status !== paymentIntent.status) {
      console.log(`[stripe-payment-status] Status mudou de ${payment.status} para ${paymentIntent.status}, atualizando banco...`);
      const { error: updateError } = await supabaseClient
        .from("stripe_payments")
        .update({
          status: paymentIntent.status,
          receipt_url: paymentIntent.charges?.data[0]?.receipt_url || null,
        })
        .eq("stripe_payment_intent_id", payment_intent_id);

      if (updateError) {
        console.error("[stripe-payment-status] Erro ao atualizar status do pagamento:", updateError);
      } else {
        updated = true;
        console.log(`[stripe-payment-status] ✅ Status atualizado no banco para: ${paymentIntent.status}`);
      }
    } else {
      if (hasSucceededCharge && paymentIntent.status === 'requires_payment_method') {
        console.log(`[stripe-payment-status] ⚠️ ATENÇÃO: Há uma charge bem-sucedida mas o status ainda é requires_payment_method. Isso pode indicar um problema.`);
        const chargesArray = Array.isArray(paymentIntent.charges) 
          ? paymentIntent.charges 
          : paymentIntent.charges?.data || [];
        console.log(`[stripe-payment-status] Charge details:`, chargesArray.map((c: any) => ({
          id: c.id,
          status: c.status,
          paid: c.paid,
          amount: c.amount,
        })));
      } else {
        console.log(`[stripe-payment-status] Status não mudou, mantendo: ${payment.status}`);
        console.log(`[stripe-payment-status] Status atual: ${paymentIntent.status}, Status no banco: ${payment.status}`);
        if (paymentIntent.status === 'requires_payment_method') {
          console.log(`[stripe-payment-status] ℹ️ O pagamento ainda não foi completado. O usuário precisa realizar o pagamento.`);
        }
      }
    }

    // Se o pagamento foi bem-sucedido, atualizar a reserva
    if (paymentIntent.status === "succeeded" && payment.reservation_id) {
      const { data: reservation, error: reservationFetchError } = await supabaseClient
        .from("reservations")
        .select("paid_amount, total_amount")
        .eq("id", payment.reservation_id)
        .single();

      if (!reservationFetchError && reservation) {
        const currentPaidAmount = Number(reservation.paid_amount || 0);
        const paymentAmount = Number(payment.amount || 0);
        const totalAmount = Number(reservation.total_amount || 0);
        const newPaidAmount = Math.min(currentPaidAmount + paymentAmount, totalAmount);

        const { error: reservationUpdateError } = await supabaseClient
          .from("reservations")
          .update({
            status: "confirmed",
            paid_amount: newPaidAmount,
          })
          .eq("id", payment.reservation_id);

        if (reservationUpdateError) {
          console.error("Error updating reservation:", reservationUpdateError);
        } else {
          console.log(`✅ Reserva ${payment.reservation_id} atualizada para status "confirmed" com paid_amount: ${newPaidAmount}`);
        }
      }
    }

    const response: any = {
      status: paymentIntent.status,
      updated,
      payment_intent_id: payment_intent_id,
      previous_status: payment.status,
    };

    // Se solicitado, incluir o client_secret (apenas se o status permitir)
    if (get_client_secret && paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'canceled') {
      response.client_secret = paymentIntent.client_secret;
    }

    console.log(`[stripe-payment-status] Resposta final:`, JSON.stringify({
      ...response,
      client_secret: response.client_secret ? '***' : undefined, // Não logar o client_secret completo
    }));
    
    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[stripe-payment-status] Erro ao verificar status:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

