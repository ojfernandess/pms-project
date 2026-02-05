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
      }
    });
  }

  // Log para debug
  console.log("stripe-payment function called:", {
    method: req.method,
    url: req.url,
    hasAuth: req.headers.get("authorization") ? "yes" : "no"
  });

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const body = await req.json();
    const {
      establishment_id,
      amount,
      currency = "BRL",
      payment_type,
      reservation_id,
      quote_id, // Para pagamentos de orçamentos
      guest_id,
      guest_email, // Para pagamentos de orçamentos sem guest_id
      description,
      payment_method_id,
      save_payment_method = false,
      metadata = {},
      checkout_date, // Para extensões: nova data de checkout
      total_amount, // Para extensões: novo valor total
    } = body;

    // Se checkout_date e total_amount vierem no metadata, extrair de lá
    const finalCheckoutDate = checkout_date || metadata?.checkout_date;
    const finalTotalAmount = total_amount || metadata?.total_amount;
    
    console.log("[stripe-payment] Dados recebidos:", {
      payment_type,
      reservation_id,
      checkout_date: finalCheckoutDate,
      total_amount: finalTotalAmount,
      metadata_keys: Object.keys(metadata || {}),
    });

    if (!establishment_id || !amount || !payment_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
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

    // Criar ou buscar customer
    let customerId = config.stripe_customer_id;

    // Se não tem guest_id mas tem quote_id, buscar dados do orçamento
    let finalGuestId = guest_id;
    let guestEmail = guest_email;
    let guestName = "";

    if (!finalGuestId && quote_id) {
      const { data: quote } = await supabaseClient
        .from("quotes")
        .select("guest_id, guest_email, guest_name")
        .eq("id", quote_id)
        .single();

      if (quote) {
        finalGuestId = quote.guest_id || null;
        guestEmail = quote.guest_email || guestEmail;
        guestName = quote.guest_name || "";
      }
    }

    if (!customerId && finalGuestId) {
      // Buscar dados do hóspede (tabela clients)
      const { data: guest } = await supabaseClient
        .from("clients")
        .select("full_name, email, phone")
        .eq("id", finalGuestId)
        .single();

      if (guest) {
        // Criar customer no Stripe
        const customer = await stripe.customers.create({
          email: guest.email,
          name: guest.full_name,
          phone: guest.phone,
          metadata: {
            guest_id: finalGuestId,
            establishment_id: establishment_id,
          },
        });

        customerId = customer.id;

        // Atualizar configuração com customer ID
        await supabaseClient
          .from("stripe_establishment_config")
          .update({ stripe_customer_id: customerId })
          .eq("id", config.id);
      }
    } else if (!customerId && guestEmail) {
      // Criar customer com email do orçamento
      const customer = await stripe.customers.create({
        email: guestEmail,
        name: guestName,
        metadata: {
          establishment_id: establishment_id,
          quote_id: quote_id || "",
        },
      });

      customerId = customer.id;
    }

    // Criar Payment Intent
    const paymentIntentData: any = {
      amount: Math.round(amount * 100), // Converter para centavos
      currency: currency.toLowerCase(),
      description: description || `Payment for ${payment_type}`,
      metadata: {
        establishment_id,
        payment_type,
        reservation_id: reservation_id || "",
        quote_id: quote_id || "",
        guest_id: finalGuestId || "",
        ...(finalCheckoutDate ? { checkout_date: finalCheckoutDate } : {}),
        ...(finalTotalAmount ? { total_amount: String(finalTotalAmount) } : {}),
        ...metadata,
      },
    };

    if (customerId) {
      paymentIntentData.customer = customerId;
    }

    if (payment_method_id) {
      paymentIntentData.payment_method = payment_method_id;
      paymentIntentData.confirm = true;
      // Detectar domínio base automaticamente
      const siteUrl = Deno.env.get("SITE_URL");
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      let baseUrl = siteUrl || "http://localhost:8080";
      
      // Se não tem SITE_URL, tentar inferir do SUPABASE_URL
      if (!siteUrl && supabaseUrl) {
        try {
          const url = new URL(supabaseUrl);
          // Se não for um domínio .supabase.co, pode ser um domínio customizado
          if (!url.hostname.includes('.supabase.co')) {
            const parts = url.hostname.split('.');
            if (parts.length > 2) {
              const domain = parts.slice(-2).join('.');
              baseUrl = `${url.protocol}//${domain}`;
            }
          }
        } catch {
          // Usar fallback
        }
      }
      
      paymentIntentData.return_url = `${baseUrl}/payment/return`;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);
    
    console.log("[stripe-payment] Payment Intent criado:", {
      id: paymentIntent.id,
      metadata: paymentIntent.metadata,
      has_checkout_date: !!paymentIntent.metadata?.checkout_date,
      has_total_amount: !!paymentIntent.metadata?.total_amount,
    });

    // Salvar no banco de dados
    const { data: payment, error: dbError } = await supabaseClient
      .from("stripe_payments")
      .insert({
        establishment_id,
        reservation_id: reservation_id || null,
        quote_id: quote_id || null,
        guest_id: finalGuestId || null,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_customer_id: customerId || null,
        stripe_payment_method_id: payment_method_id || null,
        amount,
        currency,
        status: paymentIntent.status,
        payment_type,
        description,
        metadata: { ...metadata, payment_intent: paymentIntent.id },
      })
      .select()
      .single();

    if (dbError) {
      console.error("Error saving payment to database:", dbError);
    }

    // Se for um pagamento de orçamento, atualizar o quote com o payment_intent_id
    if (quote_id && paymentIntent.id) {
      const { error: updateQuoteError } = await supabaseClient
        .from("quotes")
        .update({
          payment_intent_id: paymentIntent.id,
        })
        .eq("id", quote_id);

      if (updateQuoteError) {
        console.error("Error updating quote with payment_intent_id:", updateQuoteError);
        // Não lançar erro aqui, pois o pagamento já foi criado
      } else {
        console.log(`[stripe-payment] ✅ Quote ${quote_id} atualizado com payment_intent_id: ${paymentIntent.id}`);
      }
    }

    // Se save_payment_method e payment_method_id, salvar método de pagamento
    if (save_payment_method && payment_method_id && customerId) {
      try {
        const paymentMethod = await stripe.paymentMethods.retrieve(payment_method_id);
        
        await supabaseClient
          .from("stripe_payment_methods")
          .insert({
            establishment_id,
            guest_id: guest_id || null,
            reservation_id: reservation_id || null,
            stripe_payment_method_id: payment_method_id,
            stripe_customer_id: customerId,
            type: paymentMethod.type,
            card_brand: paymentMethod.card?.brand,
            card_last4: paymentMethod.card?.last4,
            card_exp_month: paymentMethod.card?.exp_month,
            card_exp_year: paymentMethod.card?.exp_year,
            is_default: false,
            is_active: true,
          });
      } catch (error) {
        console.error("Error saving payment method:", error);
      }
    }

    return new Response(
      JSON.stringify({
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        payment_id: payment?.id,
        status: paymentIntent.status,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error processing payment:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

