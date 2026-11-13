import { Injectable } from "@nestjs/common";
import { Prisma, reservation_status } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { stripeRequest } from "./stripe-client";

type StripeIntent = {
  id: string;
  status: string;
  client_secret?: string | null;
  amount: number;
  currency: string;
  customer?: string | null;
  payment_method?: string | null;
  charges?: { data?: Array<{ status?: string; receipt_url?: string | null; paid?: boolean; amount?: number; id?: string }> } | Array<{ status?: string; receipt_url?: string | null }>;
};

type StripeCustomer = { id: string };
type StripeRefund = { id: string; amount: number; currency: string; status: string; reason?: string | null; metadata?: Record<string, string> };
type StripePaymentMethod = { type: string; card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number } };

@Injectable()
export class StripePaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(body: Record<string, unknown>) {
    const establishmentId = stringValue(body.establishment_id);
    const amount = body.amount;
    const paymentType = stringValue(body.payment_type);
    if (!establishmentId || amount == null || amount === "" || !paymentType) {
      return { status: 400, body: { error: "Missing required fields" } };
    }
    const config = await this.enabledConfig(establishmentId);
    if (!config) return { status: 400, body: { error: "Stripe not configured for this establishment" } };
    const secretKey = await this.secretKey(config.test_secret_key, config.live_secret_key);
    if (!secretKey) return { status: 400, body: { error: "Stripe secret key not configured" } };

    const metadata = (body.metadata && typeof body.metadata === "object" ? body.metadata : {}) as Record<string, unknown>;
    const checkoutDate = stringValue(body.checkout_date) || stringValue(metadata.checkout_date);
    const totalAmount = body.total_amount ?? metadata.total_amount;
    let guestId = stringValue(body.guest_id);
    let guestEmail = stringValue(body.guest_email);
    let guestName = "";
    const quoteId = stringValue(body.quote_id);
    if (!guestId && quoteId) {
      const quote = await this.prisma.quotes.findUnique({
        where: { id: quoteId },
        select: { guest_id: true, guest_email: true, guest_name: true },
      });
      if (quote) {
        guestId = quote.guest_id || "";
        guestEmail = quote.guest_email || guestEmail;
        guestName = quote.guest_name || "";
      }
    }

    let customerId = config.stripe_customer_id || "";
    if (!customerId && guestId) {
      const guest = await this.prisma.clients.findUnique({
        where: { id: guestId },
        select: { full_name: true, email: true, phone: true },
      });
      if (guest) {
        const customer = await stripeRequest<StripeCustomer>(secretKey, "POST", "/customers", {
          email: guest.email,
          name: guest.full_name,
          phone: guest.phone,
          metadata: { guest_id: guestId, establishment_id: establishmentId },
        });
        customerId = customer.id;
        await this.prisma.stripe_establishment_config.update({
          where: { id: config.id },
          data: { stripe_customer_id: customerId },
        });
      }
    } else if (!customerId && guestEmail) {
      const customer = await stripeRequest<StripeCustomer>(secretKey, "POST", "/customers", {
        email: guestEmail,
        name: guestName,
        metadata: { establishment_id: establishmentId, quote_id: quoteId || "" },
      });
      customerId = customer.id;
    }

    const amountAsNumber = Number(amount);
    const amountInCents = paymentType === "quote_payment" ? Math.round(amountAsNumber) : Math.round(amountAsNumber * 100);
    const paymentMethodId = stringValue(body.payment_method_id);
    const intentData: Record<string, unknown> = {
      amount: amountInCents,
      currency: (stringValue(body.currency) || "BRL").toLowerCase(),
      description: stringValue(body.description) || `Payment for ${paymentType}`,
      metadata: {
        establishment_id: establishmentId,
        payment_type: paymentType,
        reservation_id: stringValue(body.reservation_id),
        quote_id: quoteId,
        guest_id: guestId,
        ...(checkoutDate ? { checkout_date: checkoutDate } : {}),
        ...(totalAmount != null && totalAmount !== "" ? { total_amount: String(totalAmount) } : {}),
        ...metadata,
      },
    };
    if (customerId) intentData.customer = customerId;
    if (paymentMethodId) {
      intentData.payment_method = paymentMethodId;
      intentData.confirm = "true";
      intentData.return_url = `${process.env.SITE_URL || "http://localhost:8080"}/payment/return`;
    }
    const paymentIntent = await stripeRequest<StripeIntent>(secretKey, "POST", "/payment_intents", intentData);
    const payment = await this.prisma.stripe_payments.create({
      data: {
        establishment_id: establishmentId,
        reservation_id: stringValue(body.reservation_id) || null,
        quote_id: quoteId || null,
        guest_id: guestId || null,
        stripe_payment_intent_id: paymentIntent.id,
        stripe_customer_id: customerId || null,
        stripe_payment_method_id: paymentMethodId || null,
        amount: amountInCents,
        currency: stringValue(body.currency) || "BRL",
        status: paymentIntent.status,
        payment_type: paymentType,
        description: stringValue(body.description) || null,
        metadata: { ...metadata, payment_intent: paymentIntent.id } as Prisma.InputJsonValue,
      },
    }).catch(() => null);

    if (quoteId) {
      await this.prisma.quotes.update({ where: { id: quoteId }, data: { payment_intent_id: paymentIntent.id } }).catch(() => undefined);
    }
    if (body.save_payment_method && paymentMethodId && customerId) {
      try {
        const method = await stripeRequest<StripePaymentMethod>(secretKey, "GET", `/payment_methods/${paymentMethodId}`);
        await this.prisma.stripe_payment_methods.create({
          data: {
            establishment_id: establishmentId,
            guest_id: stringValue(body.guest_id) || null,
            reservation_id: stringValue(body.reservation_id) || null,
            stripe_payment_method_id: paymentMethodId,
            stripe_customer_id: customerId,
            type: method.type,
            card_brand: method.card?.brand,
            card_last4: method.card?.last4,
            card_exp_month: method.card?.exp_month,
            card_exp_year: method.card?.exp_year,
            is_default: false,
            is_active: true,
          },
        });
      } catch {
        // A função original ignora a falha ao gravar o método.
      }
    }
    return {
      status: 200,
      body: {
        client_secret: paymentIntent.client_secret,
        payment_intent_id: paymentIntent.id,
        payment_id: payment?.id,
        status: paymentIntent.status,
      },
    };
  }

  async status(body: { payment_intent_id?: string; get_client_secret?: boolean }) {
    if (!body.payment_intent_id) return { status: 400, body: { error: "payment_intent_id is required" } };
    const payment = await this.prisma.stripe_payments.findUnique({ where: { stripe_payment_intent_id: body.payment_intent_id } });
    if (!payment) return { status: 404, body: { error: "Payment not found" } };
    const config = await this.enabledConfig(payment.establishment_id);
    if (!config) return { status: 400, body: { error: "Stripe not configured for this establishment" } };
    const secretKey = await this.secretKey(config.test_secret_key, config.live_secret_key);
    if (!secretKey) return { status: 400, body: { error: "Stripe secret key not configured" } };
    const paymentIntent = await stripeRequest<StripeIntent>(secretKey, "GET", `/payment_intents/${body.payment_intent_id}?expand[]=charges`);
    const charges = Array.isArray(paymentIntent.charges) ? paymentIntent.charges : paymentIntent.charges?.data || [];
    let updated = false;
    if (payment.status !== paymentIntent.status) {
      await this.prisma.stripe_payments.update({
        where: { stripe_payment_intent_id: body.payment_intent_id },
        data: { status: paymentIntent.status, receipt_url: charges[0]?.receipt_url || null },
      });
      updated = true;
    }
    if (paymentIntent.status === "succeeded" && payment.reservation_id) {
      const reservation = await this.prisma.reservations.findUnique({
        where: { id: payment.reservation_id },
        select: { paid_amount: true, total_amount: true, status: true },
      });
      if (reservation) {
        const currentPaid = Number(reservation.paid_amount || 0);
        const paymentAmount = Number(payment.amount || 0);
        const total = Number(reservation.total_amount || 0);
        const newPaid = Math.min(currentPaid + paymentAmount, total);
        const isPreregistration = reservation.status === "preregistration";
        const newStatus = newPaid >= total && total > 0 ? "confirmed" : newPaid > 0 ? "pending" : reservation.status;
        const data: { paid_amount: number; status?: reservation_status } = { paid_amount: newPaid };
        if (isPreregistration || newStatus === "confirmed") data.status = newStatus as reservation_status;
        await this.prisma.reservations.update({ where: { id: payment.reservation_id }, data });
      }
    }
    const response: Record<string, unknown> = {
      status: paymentIntent.status,
      updated,
      payment_intent_id: body.payment_intent_id,
      previous_status: payment.status,
    };
    if (body.get_client_secret && paymentIntent.status !== "succeeded" && paymentIntent.status !== "canceled") {
      response.client_secret = paymentIntent.client_secret;
    }
    return { status: 200, body: response };
  }

  async refund(body: { payment_id?: string; amount?: number; reason?: string; description?: string; establishment_id?: string }) {
    if (!body.payment_id || body.amount == null || !body.establishment_id) {
      return { status: 400, body: { error: "Missing required fields" } };
    }
    const payment = await this.prisma.stripe_payments.findFirst({
      where: { id: body.payment_id, establishment_id: body.establishment_id },
    });
    if (!payment) return { status: 404, body: { error: "Payment not found" } };
    if (payment.status !== "succeeded") return { status: 400, body: { error: "Payment must be succeeded to refund" } };
    const config = await this.enabledConfig(body.establishment_id);
    if (!config) return { status: 400, body: { error: "Stripe not configured for this establishment" } };
    const secretKey = await this.secretKey(config.test_secret_key, config.live_secret_key);
    if (!secretKey) return { status: 400, body: { error: "Stripe secret key not configured" } };
    const refund = await stripeRequest<StripeRefund>(secretKey, "POST", "/refunds", {
      payment_intent: payment.stripe_payment_intent_id,
      amount: Math.round(Number(body.amount) * 100),
      reason: body.reason || undefined,
      metadata: {
        payment_id: payment.id,
        establishment_id: body.establishment_id,
        reservation_id: payment.reservation_id || "",
        reason: body.reason || "",
        ...(body.description ? { description: body.description } : {}),
      },
    });
    const record = await this.prisma.stripe_refunds.create({
      data: {
        establishment_id: body.establishment_id,
        payment_id: payment.id,
        reservation_id: payment.reservation_id,
        stripe_refund_id: refund.id,
        amount: refund.amount / 100,
        currency: refund.currency,
        status: refund.status || "pending",
        reason: refund.reason,
        description: body.description || null,
        metadata: (refund.metadata || {}) as Prisma.InputJsonValue,
      },
    }).catch(() => null);
    const full = refund.amount === Number(payment.amount) * 100;
    await this.prisma.stripe_payments.update({
      where: { id: payment.id },
      data: { status: full ? "refunded" : "partially_refunded" },
    });
    return {
      status: 200,
      body: { refund_id: refund.id, refund_record_id: record?.id, status: refund.status, amount: refund.amount / 100 },
    };
  }

  private async enabledConfig(establishmentId: string) {
    return this.prisma.stripe_establishment_config.findFirst({
      where: { establishment_id: establishmentId, is_enabled: true },
    });
  }

  private async secretKey(testKey: string | null, liveKey: string | null) {
    const global = await this.prisma.stripe_global_config.findFirst({ select: { test_mode: true } });
    const testMode = global?.test_mode ?? true;
    return testMode ? testKey : liveKey;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}
