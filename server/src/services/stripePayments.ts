import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../config/env.js";

type CreatePaymentIntentInput = {
  establishment_id: string;
  amount: number;
  currency?: string;
  payment_type: string;
  reservation_id?: string | null;
  quote_id?: string | null;
  guest_id?: string | null;
  guest_email?: string | null;
  description?: string | null;
  payment_method_id?: string | null;
  save_payment_method?: boolean;
  metadata?: Record<string, unknown>;
  checkout_date?: string | null;
  total_amount?: number | null;
};

type StripeConfig = {
  id: string;
  stripe_customer_id: string | null;
  test_secret_key: string | null;
  live_secret_key: string | null;
};

type StripePaymentRow = {
  id: string;
  establishment_id: string;
  reservation_id: string | null;
  quote_id?: string | null;
  stripe_payment_intent_id: string;
  amount: number;
  status: string;
};

function mapStripeMethodToPms(method: string | null | undefined): "credit_card" | "debit_card" | "pix" | "deposit" {
  if (!method) return "credit_card";
  if (method === "card") return "credit_card";
  if (method === "credit_card" || method === "debit_card" || method === "pix" || method === "deposit") return method;
  return "credit_card";
}

async function getOrCreateStripeCarrier(db: SupabaseClient, establishmentId: string): Promise<string | null> {
  const { data: byEst } = await db
    .from("payment_carriers")
    .select("id")
    .eq("code", "STRIPE")
    .eq("establishment_id", establishmentId)
    .maybeSingle<{ id: string }>();
  if (byEst?.id) return byEst.id;

  const { data: global } = await db
    .from("payment_carriers")
    .select("id")
    .eq("code", "STRIPE")
    .maybeSingle<{ id: string }>();
  if (global?.id) return global.id;

  // Try with establishment_id first, fallback without it for older schemas.
  const createWithEst = await db
    .from("payment_carriers")
    .insert({
      code: "STRIPE",
      description: "Stripe - Gateway de Pagamento",
      establishment_id: establishmentId,
      is_active: true,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  if (createWithEst.data?.id) return createWithEst.data.id;

  const createLegacy = await db
    .from("payment_carriers")
    .insert({
      code: "STRIPE",
      description: "Stripe - Gateway de Pagamento",
      is_active: true,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  return createLegacy.data?.id ?? null;
}

async function getOrCreateStripePaymentType(
  db: SupabaseClient,
  carrierId: string,
  paymentMethod: "credit_card" | "debit_card" | "pix" | "deposit",
  cardBrand: string | null
): Promise<string | null> {
  const normalizedBrand = paymentMethod === "credit_card" || paymentMethod === "debit_card" ? cardBrand ?? "unknown" : null;
  const { data: existing } = await db
    .from("payment_types")
    .select("id")
    .eq("carrier_id", carrierId)
    .eq("payment_method", paymentMethod)
    .eq("card_brand", normalizedBrand)
    .maybeSingle<{ id: string }>();
  if (existing?.id) return existing.id;

  const name =
    paymentMethod === "credit_card"
      ? `Stripe - Cartão de Crédito ${normalizedBrand?.toUpperCase() ?? ""}`.trim()
      : paymentMethod === "debit_card"
        ? `Stripe - Cartão de Débito ${normalizedBrand?.toUpperCase() ?? ""}`.trim()
        : `Stripe - ${paymentMethod.toUpperCase()}`;

  const { data: created } = await db
    .from("payment_types")
    .insert({
      carrier_id: carrierId,
      name,
      payment_method: paymentMethod,
      card_brand: normalizedBrand,
      is_active: true,
    })
    .select("id")
    .maybeSingle<{ id: string }>();
  return created?.id ?? null;
}

async function registerPaymentCarrierEntry(
  db: SupabaseClient,
  payment: StripePaymentRow,
  paymentIntent: Stripe.PaymentIntent
): Promise<void> {
  if (!payment.reservation_id) return;

  const { data: existing } = await db
    .from("payments")
    .select("id")
    .eq("reservation_id", payment.reservation_id)
    .ilike("notes", `%${paymentIntent.id}%`)
    .maybeSingle<{ id: string }>();
  if (existing?.id) return;

  const charge = (paymentIntent as unknown as { charges?: { data?: Array<any> } }).charges?.data?.[0];
  const paymentMethod = mapStripeMethodToPms(charge?.payment_method_details?.type);
  const cardBrand = charge?.payment_method_details?.card?.brand ?? null;
  const installments = charge?.payment_method_details?.card?.installments?.count ?? 1;

  const carrierId = await getOrCreateStripeCarrier(db, payment.establishment_id);
  if (!carrierId) return;
  const paymentTypeId = await getOrCreateStripePaymentType(db, carrierId, paymentMethod, cardBrand);

  const notes = `[STRIPE] Payment Intent: ${paymentIntent.id}\n[COMPONENT:base]`;
  const amountInReais = Number(payment.amount ?? 0) / 100;

  // Try rich schema first; fallback for older schemas.
  const richInsert = await db.from("payments").insert({
    reservation_id: payment.reservation_id,
    establishment_id: payment.establishment_id,
    carrier_id: carrierId,
    payment_type_id: paymentTypeId,
    amount: amountInReais,
    payment_method: paymentMethod,
    payment_date: new Date((paymentIntent.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    installments,
    notes,
  });
  if (!richInsert.error) return;

  await db.from("payments").insert({
    reservation_id: payment.reservation_id,
    amount: amountInReais,
    payment_method: paymentMethod,
    payment_date: new Date((paymentIntent.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    notes,
  });
}

async function getStripeClientForEstablishment(db: SupabaseClient, establishmentId: string): Promise<Stripe> {
  const { data: config } = await db
    .from("stripe_establishment_config")
    .select("test_secret_key, live_secret_key")
    .eq("establishment_id", establishmentId)
    .eq("is_enabled", true)
    .single<{ test_secret_key: string | null; live_secret_key: string | null }>();

  if (!config) throw new Error("Stripe not configured for this establishment");

  const { data: globalConfig } = await db.from("stripe_global_config").select("test_mode").single<{ test_mode: boolean | null }>();
  const isTestMode = globalConfig?.test_mode ?? true;
  const secretKey = isTestMode ? config.test_secret_key : config.live_secret_key;
  if (!secretKey) throw new Error("Stripe secret key not configured");
  return new Stripe(secretKey, { apiVersion: "2025-02-24.acacia" });
}

export async function createStripePaymentIntent(
  db: SupabaseClient,
  env: Env,
  input: CreatePaymentIntentInput,
): Promise<{ client_secret: string | null; payment_intent_id: string; payment_id?: string; status: string }> {
  const { data: config } = await db
    .from("stripe_establishment_config")
    .select("id, stripe_customer_id, test_secret_key, live_secret_key")
    .eq("establishment_id", input.establishment_id)
    .eq("is_enabled", true)
    .single<StripeConfig>();

  if (!config) throw new Error("Stripe not configured for this establishment");

  const stripe = await getStripeClientForEstablishment(db, input.establishment_id);
  let customerId = config.stripe_customer_id;
  let finalGuestId = input.guest_id ?? null;
  let guestEmail = input.guest_email ?? null;
  let guestName = "";

  if (!finalGuestId && input.quote_id) {
    const { data: quote } = await db
      .from("quotes")
      .select("guest_id, guest_email, guest_name")
      .eq("id", input.quote_id)
      .single<{ guest_id: string | null; guest_email: string | null; guest_name: string | null }>();
    if (quote) {
      finalGuestId = quote.guest_id;
      guestEmail = quote.guest_email ?? guestEmail;
      guestName = quote.guest_name ?? "";
    }
  }

  if (!customerId && finalGuestId) {
    const { data: guest } = await db
      .from("clients")
      .select("full_name, email, phone")
      .eq("id", finalGuestId)
      .single<{ full_name: string | null; email: string | null; phone: string | null }>();
    if (guest) {
      const customer = await stripe.customers.create({
        email: guest.email ?? undefined,
        name: guest.full_name ?? undefined,
        phone: guest.phone ?? undefined,
        metadata: { guest_id: finalGuestId, establishment_id: input.establishment_id },
      });
      customerId = customer.id;
      await db.from("stripe_establishment_config").update({ stripe_customer_id: customerId }).eq("id", config.id);
    }
  } else if (!customerId && guestEmail) {
    const customer = await stripe.customers.create({
      email: guestEmail,
      name: guestName || undefined,
      metadata: { establishment_id: input.establishment_id, quote_id: input.quote_id ?? "" },
    });
    customerId = customer.id;
  }

  const amountAsNumber = Number(input.amount);
  const amountInCents = input.payment_type === "quote_payment" ? Math.round(amountAsNumber) : Math.round(amountAsNumber * 100);

  const paymentIntentData: Stripe.PaymentIntentCreateParams = {
    amount: amountInCents,
    currency: (input.currency ?? "BRL").toLowerCase(),
    description: input.description ?? `Payment for ${input.payment_type}`,
    metadata: {
      establishment_id: input.establishment_id,
      payment_type: input.payment_type,
      reservation_id: input.reservation_id ?? "",
      quote_id: input.quote_id ?? "",
      guest_id: finalGuestId ?? "",
      ...(input.checkout_date ? { checkout_date: input.checkout_date } : {}),
      ...(input.total_amount != null ? { total_amount: String(input.total_amount) } : {}),
      ...(input.metadata ?? {}),
    },
    ...(customerId ? { customer: customerId } : {}),
  };

  if (input.payment_method_id) {
    paymentIntentData.payment_method = input.payment_method_id;
    paymentIntentData.confirm = true;
    paymentIntentData.return_url = `${env.SITE_URL ?? "http://localhost:8080"}/payment/return`;
  }

  const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

  const { data: payment } = await db
    .from("stripe_payments")
    .insert({
      establishment_id: input.establishment_id,
      reservation_id: input.reservation_id ?? null,
      quote_id: input.quote_id ?? null,
      guest_id: finalGuestId ?? null,
      stripe_payment_intent_id: paymentIntent.id,
      stripe_customer_id: customerId ?? null,
      stripe_payment_method_id: input.payment_method_id ?? null,
      amount: amountInCents,
      currency: input.currency ?? "BRL",
      status: paymentIntent.status,
      payment_type: input.payment_type,
      description: input.description ?? null,
      metadata: { ...(input.metadata ?? {}), payment_intent: paymentIntent.id },
    })
    .select("id")
    .single<{ id: string }>();

  if (input.quote_id) {
    await db.from("quotes").update({ payment_intent_id: paymentIntent.id }).eq("id", input.quote_id);
  }

  if (input.save_payment_method && input.payment_method_id && customerId) {
    try {
      const paymentMethod = await stripe.paymentMethods.retrieve(input.payment_method_id);
      await db.from("stripe_payment_methods").insert({
        establishment_id: input.establishment_id,
        guest_id: finalGuestId ?? null,
        reservation_id: input.reservation_id ?? null,
        stripe_payment_method_id: input.payment_method_id,
        stripe_customer_id: customerId,
        type: paymentMethod.type,
        card_brand: paymentMethod.card?.brand ?? null,
        card_last4: paymentMethod.card?.last4 ?? null,
        card_exp_month: paymentMethod.card?.exp_month ?? null,
        card_exp_year: paymentMethod.card?.exp_year ?? null,
        is_default: false,
        is_active: true,
      });
    } catch {
      // best effort
    }
  }

  return {
    client_secret: paymentIntent.client_secret,
    payment_intent_id: paymentIntent.id,
    payment_id: payment?.id,
    status: paymentIntent.status,
  };
}

export async function getStripePaymentStatus(
  db: SupabaseClient,
  input: { payment_intent_id: string; get_client_secret?: boolean },
): Promise<{ status: string; updated: boolean; payment_intent_id: string; previous_status: string; client_secret?: string | null }> {
  const { data: payment } = await db
    .from("stripe_payments")
    .select("id, establishment_id, reservation_id, stripe_payment_intent_id, amount, status")
    .eq("stripe_payment_intent_id", input.payment_intent_id)
    .single<StripePaymentRow>();
  if (!payment) throw new Error("Payment not found");

  const stripe = await getStripeClientForEstablishment(db, payment.establishment_id);
  const paymentIntent = await stripe.paymentIntents.retrieve(input.payment_intent_id, { expand: ["charges"] });

  const previousStatus = payment.status;
  let updated = false;
  if (previousStatus !== paymentIntent.status) {
    await db
      .from("stripe_payments")
      .update({
        status: paymentIntent.status,
      })
      .eq("stripe_payment_intent_id", input.payment_intent_id);
    updated = true;
  }

  // Idempotency: only apply reservation credit when transitioning into succeeded.
  const transitionedToSucceeded = paymentIntent.status === "succeeded" && previousStatus !== "succeeded";
  if (transitionedToSucceeded && payment.reservation_id) {
    const { data: reservation } = await db
      .from("reservations")
      .select("paid_amount, total_amount, status, payment_status")
      .eq("id", payment.reservation_id)
      .single<{ paid_amount: number | null; total_amount: number | null; status: string; payment_status: string | null }>();

    if (reservation) {
      const currentPaid = Number(reservation.paid_amount ?? 0);
      const paymentAmount = Number(payment.amount ?? 0) / 100;
      const totalAmount = Number(reservation.total_amount ?? 0);
      const nextPaid = Math.min(currentPaid + paymentAmount, totalAmount || Number.MAX_SAFE_INTEGER);
      const isPreregistration = reservation.status === "preregistration";
      const nextStatus = totalAmount > 0 && nextPaid >= totalAmount ? "confirmed" : nextPaid > 0 ? "pending" : reservation.status;
      const nextPaymentStatus = totalAmount > 0 && nextPaid >= totalAmount ? "paid" : nextPaid > 0 ? "partial" : reservation.payment_status;
      const patch: { paid_amount: number; status?: string; payment_status?: string | null } = {
        paid_amount: nextPaid,
        payment_status: nextPaymentStatus,
      };
      if (isPreregistration || nextStatus === "confirmed") patch.status = nextStatus;
      await db.from("reservations").update(patch).eq("id", payment.reservation_id);
    }

    // Ensure financial "payment carriers" entry is created in PMS.
    await registerPaymentCarrierEntry(db, payment, paymentIntent);
  }

  const response = {
    status: paymentIntent.status,
    updated,
    payment_intent_id: input.payment_intent_id,
    previous_status: previousStatus,
  } as { status: string; updated: boolean; payment_intent_id: string; previous_status: string; client_secret?: string | null };

  if (input.get_client_secret && paymentIntent.status !== "succeeded" && paymentIntent.status !== "canceled") {
    response.client_secret = paymentIntent.client_secret;
  }
  return response;
}

export async function createStripeRefund(
  db: SupabaseClient,
  input: { payment_id: string; amount: number; establishment_id: string; reason?: string; description?: string },
): Promise<{ refund_id: string; refund_record_id?: string; status: string | null; amount: number }> {
  const { data: payment } = await db
    .from("stripe_payments")
    .select("id, reservation_id, stripe_payment_intent_id, amount, status")
    .eq("id", input.payment_id)
    .eq("establishment_id", input.establishment_id)
    .single<StripePaymentRow>();
  if (!payment) throw new Error("Payment not found");
  if (payment.status !== "succeeded") throw new Error("Payment must be succeeded to refund");

  const stripe = await getStripeClientForEstablishment(db, input.establishment_id);
  const refund = await stripe.refunds.create({
    payment_intent: payment.stripe_payment_intent_id,
    amount: Math.round(input.amount * 100),
    ...(input.reason ? { reason: input.reason as Stripe.RefundCreateParams.Reason } : {}),
    metadata: {
      payment_id: payment.id,
      establishment_id: input.establishment_id,
      reservation_id: payment.reservation_id ?? "",
      reason: input.reason ?? "",
      description: input.description ?? "",
    },
  });

  const { data: refundRecord } = await db
    .from("stripe_refunds")
    .insert({
      establishment_id: input.establishment_id,
      payment_id: payment.id,
      reservation_id: payment.reservation_id ?? null,
      stripe_refund_id: refund.id,
      amount: refund.amount / 100,
      currency: refund.currency,
      status: refund.status,
      reason: refund.reason ?? null,
      description: input.description ?? null,
      metadata: refund.metadata,
    })
    .select("id")
    .single<{ id: string }>();

  const isFullRefund = refund.amount === Number(payment.amount) * 100;
  await db.from("stripe_payments").update({ status: isFullRefund ? "refunded" : "partially_refunded" }).eq("id", payment.id);

  return {
    refund_id: refund.id,
    refund_record_id: refundRecord?.id,
    status: refund.status,
    amount: refund.amount / 100,
  };
}
