import { createHmac, timingSafeEqual } from "crypto";
import { connect as netConnect, Socket } from "net";
import { connect as tlsConnect } from "tls";
import { Injectable, Optional } from "@nestjs/common";
import {
  Prisma,
  email_event_type,
  email_provider,
  email_status,
  payment_status,
  quote_status,
  reservation_status,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { buildWebCheckinLocatorUrl } from "../lib/web-checkin-public-url";
import { CrmService } from "../crm/crm.service";
import {
  emailLogoVariables,
  renderEmailTemplate,
  resolveEstablishmentEmailTemplate,
} from "./email-template.util";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2023-10-16";
const SIGNATURE_TOLERANCE_SECONDS = 300;

type JsonRecord = Record<string, unknown>;

type StripeEvent = {
  id: string;
  type: string;
  data: { object: JsonRecord };
};

type StripeCharge = {
  id: string;
  receipt_url?: string | null;
  payment_intent?: string | { id?: string } | null;
  payment_method_details?: {
    type?: string;
    card?: {
      brand?: string | null;
      installments?: { count?: number | null } | null;
    } | null;
  } | null;
};

type StripePaymentIntent = {
  id: string;
  amount: number;
  created: number;
  status: string;
  latest_charge?: string | null;
  metadata?: Record<string, string>;
  charges?: { data?: StripeCharge[] };
};

type StripeRefund = {
  id: string;
  amount: number;
  currency?: string | null;
  status: string;
  reason?: string | null;
  metadata?: Record<string, string> | null;
};

type StripePaymentMethod = {
  id: string;
  type?: string;
  customer?: string | { id?: string } | null;
  card?: {
    brand?: string | null;
    last4?: string | null;
    exp_month?: number | null;
    exp_year?: number | null;
  } | null;
};

type ReservationShare = { id: string; code?: string; amount: number; total_amount: number };

type EmailSettingsRow = {
  provider: email_provider;
  api_key: string | null;
  sender_email: string;
  sender_name: string;
  reply_to_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_username: string | null;
  smtp_password: string | null;
  smtp_secure: boolean | null;
};

type HotelSettingsRow = {
  name: string;
  website: string | null;
  email: string | null;
  phone_ddi: string | null;
  phone_number: string | null;
  phone: string | null;
  street: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  logo_url: string | null;
  checkin_time: Date | null;
  checkout_time: Date | null;
  policies: Prisma.JsonValue | null;
  establishment_id: string | null;
};

const reservationEmailInclude = {
  clients_reservations_client_idToclients: true,
  clients_reservations_guest_idToclients: true,
  rooms: { select: { id: true, room_number: true, name: true, fixed_password: true } },
  room_categories: { select: { id: true, name: true, description: true, building_id: true } },
  reservation_service_fees: { select: { amount: true, quantity: true } },
  ota_reservations: { select: { ota_guest_email: true, ota_guest_name: true } },
  web_checkin: { select: { locator: true } },
} satisfies Prisma.reservationsInclude;

type ReservationEmailRow = Prisma.reservationsGetPayload<{ include: typeof reservationEmailInclude }>;

@Injectable()
export class StripeWebhookService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly crm?: CrmService,
  ) {}

  async handle(rawBody: string, signature: string | undefined): Promise<{ status: number; body: unknown }> {
    try {
      if (!signature) {
        return {
          status: 401,
          body: {
            error: "Missing stripe-signature header",
            message: "This endpoint requires Stripe webhook signature for authentication",
          },
        };
      }

      const globalConfig = await this.singleGlobalConfig();
      const isTestMode = globalConfig?.test_mode ?? true;
      const webhookSecret = isTestMode ? globalConfig?.webhook_secret_test : globalConfig?.webhook_secret_live;
      if (!webhookSecret) {
        return { status: 400, body: { error: "Webhook secret not configured" } };
      }

      let event: StripeEvent;
      try {
        event = this.constructEvent(rawBody, signature, webhookSecret);
      } catch (error) {
        console.error("Webhook signature verification failed");
        return { status: 400, body: { error: `Webhook Error: ${this.errorText(error)}` } };
      }

      let webhookId: string | null = null;
      const existingWebhook = await this.prisma.stripe_webhooks.findUnique({
        where: { stripe_event_id: event.id },
      });
      if (existingWebhook) {
        if (existingWebhook.processed) {
          console.log(`[Webhook] Evento ${event.id} já foi processado anteriormente, ignorando...`);
          return {
            status: 200,
            body: {
              received: true,
              processed: true,
              event_type: event.type,
              message: "Already processed",
            },
          };
        }
        webhookId = existingWebhook.id;
      } else {
        try {
          const created = await this.prisma.stripe_webhooks.create({
            data: {
              stripe_event_id: event.id,
              event_type: event.type,
              payload: event as unknown as Prisma.InputJsonValue,
              processed: false,
            },
            select: { id: true },
          });
          webhookId = created.id;
        } catch (webhookError) {
          console.error("Error saving webhook:", this.errorText(webhookError));
        }
      }

      let processed = false;
      let errorMessage: string | null = null;
      try {
        switch (event.type) {
          case "payment_intent.succeeded":
            await this.onPaymentIntentSucceeded(this.asPaymentIntent(event.data.object));
            processed = true;
            break;
          case "payment_intent.payment_failed":
            await this.onPaymentIntentFailed(this.asPaymentIntent(event.data.object));
            processed = true;
            break;
          case "charge.refunded":
            await this.onChargeRefunded(event.data.object as unknown as StripeCharge, isTestMode);
            processed = true;
            break;
          case "payment_method.attached":
            await this.onPaymentMethodAttached(event.data.object as unknown as StripePaymentMethod);
            processed = true;
            break;
          default:
            console.log(`Unhandled event type: ${event.type}`);
            processed = true;
        }

        if (webhookId) {
          await this.prisma.stripe_webhooks.update({
            where: { id: webhookId },
            data: { processed: true, processed_at: new Date() },
          });
        }
      } catch (error) {
        errorMessage = this.errorText(error);
        console.error("Error processing webhook:", errorMessage);
        if (webhookId) {
          await this.prisma.stripe_webhooks.update({
            where: { id: webhookId },
            data: { processed: false, error_message: errorMessage },
          });
        }
      }

      return {
        status: 200,
        body: { received: true, processed, event_type: event.type, error: errorMessage },
      };
    } catch (error) {
      const message = this.errorText(error);
      console.error("Error handling webhook:", message);
      return { status: 500, body: { error: message } };
    }
  }

  private async onPaymentIntentSucceeded(paymentIntent: StripePaymentIntent): Promise<void> {
    const payment = await this.prisma.stripe_payments.findUnique({
      where: { stripe_payment_intent_id: paymentIntent.id },
      select: {
        id: true,
        reservation_id: true,
        quote_id: true,
        amount: true,
        payment_type: true,
        establishment_id: true,
        metadata: true,
      },
    });
    if (!payment) {
      throw new Error("JSON object requested, multiple (or no) rows returned");
    }

    const receiptUrl = paymentIntent.charges?.data?.[0]?.receipt_url || null;
    await this.prisma.stripe_payments.update({
      where: { stripe_payment_intent_id: paymentIntent.id },
      data: { status: paymentIntent.status, receipt_url: receiptUrl },
    });

    if (payment.reservation_id) {
      const reservation = await this.prisma.reservations.findUnique({
        where: { id: payment.reservation_id },
        select: { paid_amount: true, total_amount: true, establishment_id: true, status: true },
      });
      if (!reservation) {
        console.error("Error fetching reservation: not found");
      } else {
        const establishmentId = reservation.establishment_id || payment.establishment_id;
        if (establishmentId) {
          try {
            const stripeSecretKey = await this.establishmentSecret(establishmentId);
            if (stripeSecretKey) {
              await this.registerStripePaymentInPms(
                payment.reservation_id,
                establishmentId,
                paymentIntent,
                stripeSecretKey,
              );
            } else {
              const testMode = (await this.singleGlobalConfig())?.test_mode ?? true;
              console.warn(
                `Chave secreta do Stripe não configurada para estabelecimento ${establishmentId} (modo: ${testMode ? "test" : "live"}), pulando registro no PMS`,
              );
            }
          } catch (pmsError) {
            console.error("Error registering payment in PMS:", this.errorText(pmsError));
          }
        }

        const currentPaidAmount = Number(reservation.paid_amount || 0);
        const paymentAmount = Number(payment.amount || 0) / 100;
        let totalAmount = Number(reservation.total_amount || 0);
        const reservationUpdate: {
          paid_amount?: number;
          status?: reservation_status;
          checkout_date?: Date;
          total_amount?: number;
        } = {};
        let extensionCheckoutDate: string | undefined;

        if (payment.payment_type === "extension") {
          try {
            const stripeSecretKey = establishmentId ? await this.establishmentSecret(establishmentId) : null;
            if (stripeSecretKey) {
              const stripePaymentIntent = await this.stripeGet<StripePaymentIntent>(
                stripeSecretKey,
                `/payment_intents/${encodeURIComponent(paymentIntent.id)}`,
              );
              if (stripePaymentIntent.metadata?.checkout_date) {
                extensionCheckoutDate = stripePaymentIntent.metadata.checkout_date;
                reservationUpdate.checkout_date = new Date(extensionCheckoutDate);
              }
              if (stripePaymentIntent.metadata?.total_amount) {
                const newTotalAmount = Number.parseFloat(stripePaymentIntent.metadata.total_amount);
                reservationUpdate.total_amount = newTotalAmount;
                totalAmount = newTotalAmount;
              }
            }
          } catch (metadataError) {
            console.error("[Webhook] Erro ao buscar metadata do payment intent para extensão:", this.errorText(metadataError));
          }
        }

        const newPaidAmount = currentPaidAmount + paymentAmount;
        reservationUpdate.paid_amount = newPaidAmount;
        const isPreregistration = reservation.status === reservation_status.preregistration;
        if (newPaidAmount >= totalAmount && totalAmount > 0) {
          reservationUpdate.status = reservation_status.confirmed;
        } else if (newPaidAmount > 0) {
          if (isPreregistration) reservationUpdate.status = reservation_status.pending;
          else if (reservation.status !== reservation_status.confirmed) reservationUpdate.status = reservation_status.pending;
        }

        try {
          await this.prisma.reservations.update({
            where: { id: payment.reservation_id },
            data: reservationUpdate,
          });
          try {
            if (payment.payment_type === "extension" && extensionCheckoutDate) {
              await this.sendReservationExtensionEmail(payment.reservation_id, extensionCheckoutDate);
            } else {
              await this.sendPaymentConfirmedEmail(payment.reservation_id);
            }
          } catch (emailError) {
            console.error(`[Webhook] Erro ao enviar email para reserva ${payment.reservation_id}:`, this.errorText(emailError));
          }

          if (newPaidAmount >= totalAmount && totalAmount > 0) {
            await this.notifyCrmBookingPaid({
              reservationId: payment.reservation_id,
              establishmentId: reservation.establishment_id,
              quoteId: this.jsonQuoteId(payment.metadata) || payment.quote_id || paymentIntent.metadata?.quote_id || null,
              paymentIntentId: paymentIntent.id,
              paidAmount: newPaidAmount,
              totalAmount,
            });
          }

          if (newPaidAmount >= totalAmount && totalAmount > 0 && reservation.establishment_id) {
            try {
              const ccConfig = await this.prisma.checkin_charge_config.findFirst({
                where: { establishment_id: reservation.establishment_id, enabled: true },
                select: { send_timing: true },
              });
              if (ccConfig?.send_timing === "after_confirmation") {
                console.warn(
                  `[Webhook] Mensagens & Cobranças (after_confirmation) não enviado para reserva ${payment.reservation_id}: o fluxo send-checkin-charge (WhatsApp/Chatwoot e link de pagamento) fica em outra função e não é chamado daqui`,
                );
              }
            } catch (ccErr) {
              console.error("[Webhook] Erro ao avaliar cobrança de check-in (after_confirmation):", this.errorText(ccErr));
            }
          }
        } catch (reservationUpdateError) {
          console.error("[Webhook] Error updating reservation:", this.errorText(reservationUpdateError));
        }
      }
    }

    const metadataQuoteId = this.jsonQuoteId(payment.metadata);
    const quoteId = payment.quote_id || paymentIntent.metadata?.quote_id || metadataQuoteId;
    if (quoteId) {
      try {
        await this.processQuotePayment(quoteId, payment, paymentIntent);
        if (payment.payment_type === "quote_payment" && !payment.reservation_id) {
          console.log(
            `[Webhook] Orçamento ${quoteId} processado (quote_payment; reservation_id vinculado via notas do quote ou após conversão).`,
          );
        }
      } catch (quoteError) {
        console.error(`[Webhook] Erro ao processar pagamento de orçamento ${quoteId}:`, this.errorText(quoteError));
        try {
          await this.prisma.quotes.updateMany({
            where: { id: quoteId, status: { not: quote_status.converted } },
            data: { status: quote_status.sent },
          });
        } catch (updateError) {
          console.error("[Webhook] Erro ao atualizar status do quote após erro:", this.errorText(updateError));
        }
      }
    }
  }

  private async processQuotePayment(
    quoteId: string,
    payment: { id: string; reservation_id: string | null },
    paymentIntent: StripePaymentIntent,
  ): Promise<void> {
    const quote = await this.prisma.quotes.findUnique({ where: { id: quoteId } });
    if (!quote) throw new Error("Orçamento não encontrado");

    const reservationIds = this.reservationIdsFromNotes(quote.notes);
    if (quote.status === quote_status.converted) {
      if (payment.reservation_id) return;
      if (reservationIds.length > 0) {
        await this.applyPaymentToReservations(reservationIds, paymentIntent, quote.establishment_id);
        await this.settleQuoteLodgingReservationsAfterPayment(reservationIds);
      }
      if (quote.reservation_id) {
        await this.prisma.stripe_payments.update({
          where: { stripe_payment_intent_id: paymentIntent.id },
          data: { reservation_id: quote.reservation_id },
        });
      }
      return;
    }

    if (reservationIds.length > 0) {
      await this.applyPaymentToReservations(reservationIds, paymentIntent, quote.establishment_id);
      await this.settleQuoteLodgingReservationsAfterPayment(reservationIds);
      await this.prisma.quotes.update({
        where: { id: quoteId },
        data: {
          status: quote_status.converted,
          reservation_id: reservationIds[0],
          converted_at: new Date(),
        },
      });
      await this.prisma.stripe_payments.update({
        where: { stripe_payment_intent_id: paymentIntent.id },
        data: { reservation_id: reservationIds[0] },
      });
      try {
        await this.sendPaymentConfirmedEmail(reservationIds[0]);
      } catch (emailError) {
        console.error("[Webhook] Erro ao enviar email:", this.errorText(emailError));
      }
      for (const rid of reservationIds) {
        await this.notifyCrmBookingPaid({
          reservationId: rid,
          establishmentId: quote.establishment_id,
          quoteId,
          paymentIntentId: paymentIntent.id,
        });
      }
      return;
    }

    const recheckQuote = await this.prisma.quotes.findUnique({
      where: { id: quoteId },
      select: { status: true, reservation_id: true },
    });
    if (recheckQuote?.status === quote_status.converted) {
      if (recheckQuote.reservation_id) {
        await this.prisma.stripe_payments.update({
          where: { stripe_payment_intent_id: paymentIntent.id },
          data: { reservation_id: recheckQuote.reservation_id },
        });
      }
      return;
    }
    if (payment.reservation_id) return;

    let clientId = quote.client_id;
    let guestId = quote.guest_id;
    if (!clientId && quote.guest_email) {
      const existingClient = await this.prisma.clients.findFirst({
        where: { email: quote.guest_email },
        select: { id: true },
      });
      if (existingClient) {
        clientId = existingClient.id;
        guestId = existingClient.id;
      } else {
        const newClient = await this.prisma.clients.create({
          data: {
            full_name: quote.guest_name || "Cliente",
            email: quote.guest_email || null,
            phone: quote.guest_phone || null,
          },
          select: { id: true },
        });
        clientId = newClient.id;
        guestId = newClient.id;
      }
    }
    if (!clientId) throw new Error("É necessário ter um cliente associado ao orçamento");

    const created = await this.createReservationWithLock(
      {
        establishment_id: quote.establishment_id,
        room_id: quote.room_id,
        category_id: quote.category_id,
        guest_id: guestId,
        client_id: clientId,
        guest_name: quote.guest_name,
        adults: quote.adults || 1,
        children: quote.children || 0,
        total_amount: Number(quote.total_amount || 0),
        paid_amount: Number(quote.total_amount || 0),
        payment_status: "paid",
        status: "confirmed",
        notes: quote.notes,
        pricing_plan_id: quote.pricing_plan_id,
        created_by: quote.created_by,
        channel: quote.channel || "direct",
      },
      this.dateOnly(quote.checkin_date),
      this.dateOnly(quote.checkout_date),
      quote.establishment_id,
      quote.room_id,
      quote.category_id,
    );
    if (!created?.success || !created.reservation_id) {
      throw new Error(created?.error || "Erro ao criar reserva");
    }
    const newReservationId = created.reservation_id;

    try {
      await this.prisma.quotes.update({
        where: { id: quoteId },
        data: { status: quote_status.converted, reservation_id: newReservationId, converted_at: new Date() },
      });
    } catch (updateQuoteError) {
      console.error(`[Webhook] Erro ao atualizar orçamento ${quoteId}:`, this.errorText(updateQuoteError));
    }

    await this.prisma.stripe_payments.update({
      where: { stripe_payment_intent_id: paymentIntent.id },
      data: { reservation_id: newReservationId },
    });

    try {
      const stripeSecretKey = await this.establishmentSecret(quote.establishment_id);
      if (stripeSecretKey) {
        await this.registerStripePaymentInPms(newReservationId, quote.establishment_id, paymentIntent, stripeSecretKey);
      }
    } catch (pmsError) {
      console.error(`[Webhook] Erro ao registrar pagamento no PMS para reserva ${newReservationId}:`, this.errorText(pmsError));
    }

    try {
      await this.sendPaymentConfirmedEmail(newReservationId);
    } catch (emailError) {
      console.error(`[Webhook] Erro ao enviar email para reserva ${newReservationId}:`, this.errorText(emailError));
    }
    await this.notifyCrmBookingPaid({
      reservationId: newReservationId,
      establishmentId: quote.establishment_id,
      quoteId,
      paymentIntentId: paymentIntent.id,
      paidAmount: Number(quote.total_amount || 0),
      totalAmount: Number(quote.total_amount || 0),
    });
  }

  private async onPaymentIntentFailed(paymentIntent: StripePaymentIntent): Promise<void> {
    await this.prisma.stripe_payments.updateMany({
      where: { stripe_payment_intent_id: paymentIntent.id },
      data: { status: paymentIntent.status },
    });
  }

  private async onChargeRefunded(charge: StripeCharge, isTestMode: boolean): Promise<void> {
    const paymentIntentId = this.stringOrId(charge.payment_intent);
    if (!paymentIntentId) return;
    const payment = await this.prisma.stripe_payments.findUnique({
      where: { stripe_payment_intent_id: paymentIntentId },
    });
    if (!payment) return;

    const establishmentConfig = await this.prisma.stripe_establishment_config.findUnique({
      where: { establishment_id: payment.establishment_id },
      select: { test_secret_key: true, live_secret_key: true },
    });
    const secretKey = isTestMode ? establishmentConfig?.test_secret_key : establishmentConfig?.live_secret_key;
    if (!secretKey) return;

    const refunds = await this.stripeGet<{ data: StripeRefund[] }>(
      secretKey,
      `/refunds?charge=${encodeURIComponent(charge.id)}&limit=1`,
    );
    if (refunds.data.length > 0) {
      const refund = refunds.data[0];
      const data = {
        establishment_id: payment.establishment_id,
        payment_id: payment.id,
        reservation_id: payment.reservation_id,
        amount: refund.amount / 100,
        currency: refund.currency || "BRL",
        status: refund.status,
        reason: refund.reason || null,
        metadata: (refund.metadata || undefined) as Prisma.InputJsonValue | undefined,
      };
      await this.prisma.stripe_refunds.upsert({
        where: { stripe_refund_id: refund.id },
        create: { ...data, stripe_refund_id: refund.id },
        update: data,
      });
    }
    await this.prisma.stripe_payments.update({
      where: { id: payment.id },
      data: { status: "refunded" },
    });
  }

  private async onPaymentMethodAttached(paymentMethod: StripePaymentMethod): Promise<void> {
    try {
      const customerId = this.stringOrId(paymentMethod.customer);
      if (!customerId) return;
      const data = {
        stripe_customer_id: customerId,
        type: paymentMethod.type || "card",
        card_brand: paymentMethod.card?.brand || null,
        card_last4: paymentMethod.card?.last4 || null,
        card_exp_month: paymentMethod.card?.exp_month ?? null,
        card_exp_year: paymentMethod.card?.exp_year ?? null,
        is_active: true,
      };
      const existing = await this.prisma.stripe_payment_methods.findFirst({
        where: { stripe_payment_method_id: paymentMethod.id },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.stripe_payment_methods.update({ where: { id: existing.id }, data });
        return;
      }
      const byCustomer = await this.prisma.stripe_establishment_config.findFirst({
        where: { stripe_customer_id: customerId },
        select: { establishment_id: true },
      });
      const fromPayment = byCustomer
        ? null
        : await this.prisma.stripe_payments.findFirst({
            where: { stripe_customer_id: customerId },
            select: { establishment_id: true },
          });
      const establishmentId = byCustomer?.establishment_id || fromPayment?.establishment_id;
      if (!establishmentId) {
        console.warn(`[Webhook] payment_method.attached ${paymentMethod.id} sem estabelecimento, registro ignorado`);
        return;
      }
      await this.prisma.stripe_payment_methods.create({
        data: { ...data, establishment_id: establishmentId, stripe_payment_method_id: paymentMethod.id },
      });
    } catch (error) {
      console.error("[Webhook] Erro ao salvar payment_method.attached:", this.errorText(error));
    }
  }

  private async applyPaymentToReservations(
    reservationIds: string[],
    paymentIntent: StripePaymentIntent,
    establishmentId: string,
  ): Promise<void> {
    if (reservationIds.length === 0) return;
    const stripeSecretKey = await this.establishmentSecret(establishmentId);
    const totalPaidAmount = Number(paymentIntent.amount) / 100;
    const reservationsInfo: ReservationShare[] = [];
    let totalReservationsAmount = 0;

    for (const reservationId of reservationIds) {
      try {
        const reservation = await this.prisma.reservations.findUnique({
          where: { id: reservationId },
          select: { id: true, reservation_code: true, total_amount: true },
        });
        if (reservation) {
          const feeRows = await this.prisma.reservation_service_fees.findMany({
            where: { reservation_id: reservationId },
            select: { amount: true, quantity: true },
          });
          const feeTotal = feeRows.reduce(
            (sum, f) => sum + Number(f.amount || 0) * Number(f.quantity || 1),
            0,
          );
          const reservationTotal = Math.round((Number(reservation.total_amount || 0) + feeTotal) * 100) / 100;
          totalReservationsAmount += reservationTotal;
          reservationsInfo.push({
            id: reservation.id,
            code: reservation.reservation_code || undefined,
            amount: 0,
            total_amount: reservationTotal,
          });
        } else {
          reservationsInfo.push({ id: reservationId, amount: 0, total_amount: 0 });
        }
      } catch (error) {
        console.warn(`[Webhook] Erro ao buscar informações da reserva ${reservationId}:`, this.errorText(error));
        reservationsInfo.push({ id: reservationId, amount: 0, total_amount: 0 });
      }
    }

    let distributedTotal = 0;
    const amountsPerReservation: number[] = [];
    for (let i = 0; i < reservationsInfo.length; i++) {
      const reservation = reservationsInfo[i];
      let amountForReservation: number;
      if (totalReservationsAmount > 0 && reservation.total_amount > 0) {
        const proportion = reservation.total_amount / totalReservationsAmount;
        amountForReservation = totalPaidAmount * proportion;
        if (i === reservationsInfo.length - 1) amountForReservation = totalPaidAmount - distributedTotal;
        else distributedTotal += amountForReservation;
      } else {
        amountForReservation = totalPaidAmount / reservationsInfo.length;
        if (i === reservationsInfo.length - 1) amountForReservation = totalPaidAmount - distributedTotal;
        else distributedTotal += amountForReservation;
      }
      amountForReservation = Math.round(amountForReservation * 100) / 100;
      amountsPerReservation.push(amountForReservation);
      reservation.amount = amountForReservation;
    }

    for (let i = 0; i < reservationIds.length; i++) {
      const reservationId = reservationIds[i];
      const amountPerReservation = amountsPerReservation[i];
      try {
        const reservation = await this.prisma.reservations.findUnique({
          where: { id: reservationId },
          select: { paid_amount: true, total_amount: true, status: true },
        });
        if (!reservation) {
          console.error(`[Webhook] Erro ao buscar reserva ${reservationId}`);
          continue;
        }
        const feeRowsForStatus = await this.prisma.reservation_service_fees.findMany({
          where: { reservation_id: reservationId },
          select: { amount: true, quantity: true },
        });
        const feeTotalForStatus = feeRowsForStatus.reduce(
          (sum, f) => sum + Number(f.amount || 0) * Number(f.quantity || 1),
          0,
        );
        if (stripeSecretKey) {
          await this.registerStripePaymentInPms(
            reservationId,
            establishmentId,
            paymentIntent,
            stripeSecretKey,
            amountPerReservation,
            reservationsInfo,
          );
        }
        const currentPaidAmount = Number(reservation.paid_amount || 0);
        const newPaidAmount = currentPaidAmount + amountPerReservation;
        const totalAmountReservation =
          Math.round((Number(reservation.total_amount || 0) + feeTotalForStatus) * 100) / 100;
        const reservationUpdate: {
          paid_amount: number;
          status?: reservation_status;
          payment_status?: payment_status;
        } = { paid_amount: newPaidAmount };
        if (newPaidAmount + 0.02 >= totalAmountReservation && totalAmountReservation > 0) {
          reservationUpdate.status = reservation_status.confirmed;
          reservationUpdate.payment_status = payment_status.paid;
        } else if (newPaidAmount > 0) {
          reservationUpdate.payment_status = payment_status.partial;
          if (reservation.status !== reservation_status.confirmed) {
            reservationUpdate.status = reservation_status.pending;
          }
        }
        await this.prisma.reservations.update({ where: { id: reservationId }, data: reservationUpdate });
        if (reservationUpdate.payment_status === payment_status.paid) {
          await this.notifyCrmBookingPaid({
            reservationId,
            establishmentId,
            paymentIntentId: paymentIntent.id,
            paidAmount: newPaidAmount,
            totalAmount: totalAmountReservation,
          });
        }
      } catch (error) {
        console.error(`[Webhook] Erro ao processar reserva ${reservationId}:`, this.errorText(error));
      }
    }

    await this.settleQuoteLodgingReservationsAfterPayment(reservationIds);

    if (reservationIds.length > 1) {
      try {
        await this.sleep(500);
        const reservationsData = await this.prisma.reservations.findMany({
          where: { id: { in: reservationIds } },
          select: { id: true, client_id: true, reservation_code: true },
        });
        const clientIds = reservationsData.map((row) => row.client_id).filter((id): id is string => Boolean(id));
        const uniqueClientIds = new Set(clientIds);
        if (uniqueClientIds.size === 1) {
          await this.sendMultipleReservationsCreatedEmail(reservationIds, establishmentId);
        } else {
          const reservationsByClient = new Map<string, string[]>();
          for (const reservation of reservationsData) {
            if (!reservation.client_id) continue;
            const list = reservationsByClient.get(reservation.client_id) || [];
            list.push(reservation.id);
            reservationsByClient.set(reservation.client_id, list);
          }
          for (const [clientId, clientReservationIds] of reservationsByClient.entries()) {
            const firstReservation = await this.prisma.reservations.findUnique({
              where: { id: clientReservationIds[0] },
              select: { id: true },
            });
            if (!firstReservation) {
              console.error(`[Webhook] Erro ao buscar reserva para cliente ${clientId}`);
              continue;
            }
            for (const reservationId of clientReservationIds) {
              try {
                await this.sendPaymentConfirmedEmail(reservationId);
              } catch (emailError) {
                console.error(`[Webhook] Erro ao enviar email de pagamento confirmado para reserva ${reservationId}:`, this.errorText(emailError));
              }
            }
          }
        }
      } catch (emailError) {
        console.error("[Webhook] Erro ao processar emails:", this.errorText(emailError));
        try {
          await this.sendMultipleReservationsCreatedEmail(reservationIds, establishmentId);
        } catch (fallbackError) {
          console.error("[Webhook] Erro ao enviar email de fallback:", this.errorText(fallbackError));
        }
      }
    }
  }

  private async settleQuoteLodgingReservationsAfterPayment(reservationIds: string[]): Promise<void> {
    if (reservationIds.length === 0) return;

    for (const lodgingId of reservationIds) {
      const reservation = await this.prisma.reservations.findUnique({
        where: { id: lodgingId },
        select: { total_amount: true, paid_amount: true, status: true },
      });
      if (!reservation) continue;

      const feeRows = await this.prisma.reservation_service_fees.findMany({
        where: { reservation_id: lodgingId },
        select: { amount: true, quantity: true },
      });
      const feeTotal = feeRows.reduce(
        (sum, f) => sum + Number(f.amount || 0) * Number(f.quantity || 1),
        0,
      );
      const base = Number(reservation.total_amount || 0);
      const currentPaid = Number(reservation.paid_amount || 0);
      const targetPaid = Math.round((base + feeTotal) * 100) / 100;
      let newPaid = Math.max(currentPaid, targetPaid);
      if (targetPaid > 0 && newPaid > targetPaid + 0.02) {
        newPaid = targetPaid;
      }
      newPaid = Math.round(newPaid * 100) / 100;
      const lodgingFullyPaid = base > 0 && newPaid + 0.02 >= targetPaid;

      const data: {
        paid_amount: number;
        payment_status: payment_status;
        status?: reservation_status;
      } = {
        paid_amount: Math.round(newPaid * 100) / 100,
        payment_status: lodgingFullyPaid
          ? payment_status.paid
          : newPaid > 0.01
            ? payment_status.partial
            : payment_status.pending,
      };
      if (lodgingFullyPaid && reservation.status !== reservation_status.checkedin) {
        data.status = reservation_status.confirmed;
      }
      await this.prisma.reservations.update({ where: { id: lodgingId }, data });

      if (!lodgingFullyPaid) continue;
      await this.prisma.reservations.updateMany({
        where: { lodging_reservation_id: lodgingId },
        data: { payment_status: payment_status.paid, status: reservation_status.confirmed },
      });
    }
  }

  private async registerStripePaymentInPms(
    reservationId: string,
    establishmentId: string,
    paymentIntent: StripePaymentIntent,
    stripeSecretKey: string,
    customAmount?: number,
    allReservationsInfo?: ReservationShare[],
  ): Promise<boolean> {
    try {
      const existingPayment = await this.prisma.payments.findFirst({
        where: { reservation_id: reservationId, notes: { contains: paymentIntent.id } },
        select: { id: true },
      });
      if (existingPayment) return true;

      const carrierId = await this.getOrCreateStripeCarrier();
      if (!carrierId) return false;

      const charge = await this.chargeDetails(stripeSecretKey, paymentIntent.id);
      const paymentTypeId = await this.getOrCreateStripePaymentType(carrierId, charge.paymentMethod, charge.cardBrand);
      if (!paymentTypeId) return false;

      const amountValue = customAmount !== undefined ? customAmount : paymentIntent.amount / 100;
      const amountAsNumber = Number(amountValue.toFixed(2));
      const amount = amountAsNumber.toFixed(2);
      // [COMPONENT:all] — orçamento/pagamento Stripe quitam hospedagem + taxas; [COMPONENT:base] deixava taxas pendentes na UI.
      let notes = `[STRIPE] Payment Intent: ${paymentIntent.id}\n[COMPONENT:all]`;
      if (allReservationsInfo && allReservationsInfo.length > 1) {
        const totalAmountFromReservations = allReservationsInfo.reduce((sum, res) => sum + res.amount, 0);
        notes += `\n\n--- PAGAMENTO MULTIPLO ---\n`;
        notes += `Total de reservas: ${allReservationsInfo.length}\n`;
        notes += `Valor total pago: R$ ${totalAmountFromReservations.toFixed(2)}\n`;
        notes += `Valor desta reserva: R$ ${amount}\n\n`;
        notes += `Detalhes de todas as reservas:\n`;
        allReservationsInfo.forEach((res, index) => {
          notes += `${index + 1}. Reserva ${res.code || res.id}: R$ ${res.amount.toFixed(2)}\n`;
        });
        notes += `\n--- FIM PAGAMENTO MULTIPLO ---`;
      }

      const storedMethod = charge.paymentMethod === "card" ? "credit_card" : charge.paymentMethod;
      await this.prisma.payments.create({
        data: {
          reservation_id: reservationId,
          establishment_id: establishmentId,
          carrier_id: carrierId,
          payment_type_id: paymentTypeId,
          amount: amountAsNumber,
          payment_method: storedMethod,
          payment_date: new Date(paymentIntent.created * 1000),
          installments: charge.installments,
          notes,
        },
      });

      try {
        const reservationData = await this.prisma.reservations.findUnique({
          where: { id: reservationId },
          select: { reservation_code: true, paid_amount: true, total_amount: true },
        });
        const paymentAmountForLog = customAmount !== undefined ? customAmount : amountAsNumber;
        const formattedAmount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(paymentAmountForLog);
        let paymentDescription = `Pagamento Stripe confirmado: ${formattedAmount}`;
        if (allReservationsInfo && allReservationsInfo.length > 1) {
          paymentDescription += ` (${allReservationsInfo.length} reservas - valor proporcional desta reserva)`;
        }
        if (charge.installments > 1) paymentDescription += ` (${charge.installments}x)`;
        if (charge.cardBrand) paymentDescription += ` - ${charge.cardBrand.toUpperCase()}`;
        paymentDescription += ` - Payment Intent: ${paymentIntent.id}`;
        const currentPaidAmount = Number(reservationData?.paid_amount || 0);
        const paymentAmount = customAmount !== undefined ? customAmount : amountAsNumber;
        const newPaidAmount = (currentPaidAmount + paymentAmount).toFixed(2);
        await this.prisma.activity_logs.create({
          data: {
            establishment_id: establishmentId,
            user_id: null,
            action_type: "payment_added",
            entity_type: "reservation",
            description: paymentDescription,
            entity_id: reservationId,
            entity_code: reservationData?.reservation_code || null,
            old_values: reservationData ? { paid_amount: currentPaidAmount } : undefined,
            new_values: reservationData
              ? ({
                  paid_amount: Number.parseFloat(newPaidAmount),
                  payment_method: storedMethod,
                  payment_intent_id: paymentIntent.id,
                  card_brand: charge.cardBrand,
                  installments: charge.installments,
                } as Prisma.InputJsonValue)
              : undefined,
            metadata: {
              stripe_payment_intent_id: paymentIntent.id,
              stripe_charge_id: paymentIntent.latest_charge || null,
              payment_method: charge.paymentMethod,
              card_brand: charge.cardBrand,
              installments: charge.installments,
              amount,
              custom_amount: customAmount !== undefined ? customAmount : null,
              total_reservations: allReservationsInfo?.length || 1,
              source: "stripe_webhook",
              payment_entity_type: "payment",
            } as Prisma.InputJsonValue,
          },
        });
      } catch (logError) {
        console.error("Exceção ao registrar log de atividade do pagamento Stripe:", this.errorText(logError));
      }
      return true;
    } catch (error) {
      console.error("Erro ao registrar pagamento Stripe no PMS:", this.errorText(error));
      return false;
    }
  }

  private async getOrCreateStripeCarrier(): Promise<string | null> {
    try {
      const existingCarrier = await this.prisma.payment_carriers.findUnique({
        where: { code: "STRIPE" },
        select: { id: true },
      });
      if (existingCarrier?.id) return existingCarrier.id;
      const created = await this.prisma.payment_carriers.create({
        data: { code: "STRIPE", description: "Stripe - Gateway de Pagamento", is_active: true },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      console.error("Erro ao buscar/criar portador Stripe:", this.errorText(error));
      return null;
    }
  }

  private async getOrCreateStripePaymentType(
    carrierId: string,
    paymentMethod: string,
    cardBrand?: string | null,
  ): Promise<string | null> {
    try {
      const methodMap: Record<string, string> = {
        card: "credit_card",
        credit_card: "credit_card",
        debit_card: "debit_card",
      };
      const pmsPaymentMethod = methodMap[paymentMethod] || paymentMethod;
      let typeName = "Stripe - ";
      if (pmsPaymentMethod === "credit_card") {
        typeName += cardBrand ? `Cartão de Crédito ${cardBrand.toUpperCase()}` : "Cartão de Crédito";
      } else if (pmsPaymentMethod === "debit_card") {
        typeName += cardBrand ? `Cartão de Débito ${cardBrand.toUpperCase()}` : "Cartão de Débito";
      } else {
        typeName += pmsPaymentMethod.toUpperCase();
      }

      const existingType = await this.prisma.payment_types.findFirst({
        where: { carrier_id: carrierId, payment_method: pmsPaymentMethod, card_brand: cardBrand || null },
        select: { id: true },
      });
      if (existingType?.id) return existingType.id;

      const created = await this.prisma.payment_types.create({
        data: {
          carrier_id: carrierId,
          name: typeName,
          payment_method: pmsPaymentMethod,
          is_active: true,
          ...((pmsPaymentMethod === "credit_card" || pmsPaymentMethod === "debit_card")
            ? { card_brand: cardBrand || "unknown" }
            : {}),
        },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      console.error("Erro ao buscar/criar tipo de pagamento Stripe:", this.errorText(error));
      return null;
    }
  }

  private async chargeDetails(
    secretKey: string,
    paymentIntentId: string,
  ): Promise<{ paymentMethod: string; cardBrand: string | null; installments: number }> {
    let paymentMethod = "credit_card";
    let cardBrand: string | null = null;
    let installments = 1;
    try {
      const expanded = await this.stripeGet<StripePaymentIntent>(
        secretKey,
        `/payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=charges`,
      );
      const charge = expanded.charges?.data?.[0];
      if (charge?.payment_method_details?.type) paymentMethod = charge.payment_method_details.type;
      if (charge?.payment_method_details?.card?.brand) cardBrand = charge.payment_method_details.card.brand;
      if (charge?.payment_method_details?.card?.installments) {
        installments = charge.payment_method_details.card.installments.count || 1;
      }
    } catch (error) {
      console.warn("Erro ao buscar detalhes do método de pagamento:", this.errorText(error));
    }
    return { paymentMethod, cardBrand, installments };
  }

  private async sendReservationExtensionEmail(reservationId: string, newCheckoutDate: string): Promise<void> {
    try {
      const loaded = await this.loadReservationEmail(reservationId);
      if (!loaded) return;
      const reservation = this.mapReservation(loaded);
      const emailSettings = await this.activeEmailSettings();
      if (!emailSettings) return;

      const recipientEmail =
        reservation.guest?.email || reservation.financial_responsible?.email || this.otaGuestEmail(reservation);
      const recipientName =
        reservation.guest?.full_name ||
        reservation.financial_responsible?.full_name ||
        this.otaGuestName(reservation) ||
        "Hóspede";
      if (!recipientEmail) return;

      const hotelSettings = reservation.establishment_id ? await this.hotelSettings(reservation.establishment_id) : null;
      const template = await resolveEstablishmentEmailTemplate(
        this.prisma,
        "reservation.extended",
        reservation.establishment_id,
      );
      if (!template) return;
      const site = await this.siteSettings();
      const baseUrl = this.baseUrlFromSite(site?.pms_base_url || null);
      const webCheckinLink = await this.webCheckinLink(reservationId, reservation.reservation_code, site);
      const logoUrl = this.resolveLogo(hotelSettings?.logo_url || site?.logo_url || null);
      const checkinTime = this.asClock(reservation.checkin_time, this.asClock(hotelSettings?.checkin_time, "14:00"));
      const checkoutTime = this.asClock(reservation.checkout_time, this.asClock(hotelSettings?.checkout_time, "12:00"));
      const serviceFeesTotal = (reservation.reservation_service_fees || []).reduce((sum, fee) => {
        return sum + Number(fee.amount || 0) * Number(fee.quantity || 1);
      }, 0);
      const variables: Record<string, unknown> = {
        guest_name: recipientName || "Hóspede",
        reservation_code: reservation.reservation_code || "",
        checkin_date: this.formatDateBr(reservation.checkin_date),
        checkout_date: this.formatDateBr(reservation.checkout_date),
        new_checkout_date: this.formatDateBr(newCheckoutDate),
        checkin_time: checkinTime,
        checkout_time: checkoutTime,
        total_amount: this.money(Number(reservation.total_amount || 0) + serviceFeesTotal),
        paid_amount: this.money(Number(reservation.paid_amount || 0)),
        room_number: reservation.rooms?.room_number || "",
        room_name: reservation.rooms?.name || "",
        category_name: reservation.room_categories?.name || "",
        room_category: reservation.room_categories?.name || "",
        adults: reservation.adults || 0,
        children: reservation.children || 0,
        hotel_name: hotelSettings?.name || "",
        hotel_address: this.hotelAddress(hotelSettings),
        hotel_contact: this.hotelPhone(hotelSettings),
        hotel_email: hotelSettings?.email || "",
        hotel_phone: this.hotelPhone(hotelSettings),
        hotel_website: hotelSettings?.website || "",
        web_checkin_link: webCheckinLink,
        ...emailLogoVariables(logoUrl),
      };
      const processedSubject = renderEmailTemplate(template.subject, variables);
      const processedBody = renderEmailTemplate(template.body_html, variables);
      let emailSent = false;
      if (emailSettings.provider === email_provider.resend || emailSettings.provider === email_provider.sendgrid) {
        const sent = await this.sendProviderEmail(emailSettings, {
          to: recipientEmail,
          toName: recipientName,
          subject: processedSubject,
          html: processedBody,
        });
        emailSent = sent.ok;
      }
      if (!emailSent) {
        await this.enqueueEmail({
          templateId: template.id,
          eventType: email_event_type.reservation_extended,
          recipientEmail,
          recipientName,
          subject: processedSubject,
          bodyHtml: processedBody,
          reservationId,
          variables,
          priority: 1,
        });
      }
    } catch (error) {
      console.error("Erro geral ao enviar email de extensão:", this.errorText(error));
    }
  }

  private async sendMultipleReservationsCreatedEmail(reservationIds: string[], establishmentId: string): Promise<void> {
    try {
      const reservations = await this.prisma.reservations.findMany({
        where: { id: { in: reservationIds } },
        include: reservationEmailInclude,
      });
      if (reservations.length === 0) return;
      const mapped = reservations.map((row) => this.mapReservation(row));
      const firstReservation = mapped[0];
      const recipientEmail =
        firstReservation.guest?.email ||
        firstReservation.financial_responsible?.email ||
        this.otaGuestEmail(firstReservation);
      const recipientName =
        firstReservation.guest?.full_name ||
        firstReservation.financial_responsible?.full_name ||
        this.otaGuestName(firstReservation) ||
        "Hóspede";
      if (!recipientEmail) return;

      const template = await resolveEstablishmentEmailTemplate(
        this.prisma,
        "reservation.multiple.created",
        establishmentId,
      );
      if (!template) return;

      const hotelSettings = await this.hotelSettings(establishmentId);
      const site = await this.siteSettings();
      const baseUrl = this.baseUrlFromSite(site?.pms_base_url || null);
      const reservationsList = mapped.map((res, index) => {
        const locator = res.web_checkin?.locator || res.reservation_code || "";
        return {
          number: index + 1,
          code: res.reservation_code || "",
          locator,
          checkin_date: this.formatDateBr(res.checkin_date),
          checkout_date: this.formatDateBr(res.checkout_date),
          total_amount: this.money(Number(res.total_amount || 0)),
          paid_amount: this.money(Number(res.paid_amount || 0)),
          room_number: res.rooms?.room_number || "",
          room_name: res.rooms?.name || "",
          category_name: res.room_categories?.name || "",
          web_checkin_link: locator ? buildWebCheckinLocatorUrl(locator, site) : "",
        };
      });
      const variables: Record<string, unknown> = {
        guest_name: recipientName || "Hóspede",
        reservation_code: reservationsList.map((row) => row.code).join(", "),
        reservation_count: reservations.length.toString(),
        reservations_list: reservationsList,
        checkin_date: reservationsList[0]?.checkin_date || "",
        checkout_date: reservationsList[reservationsList.length - 1]?.checkout_date || "",
        total_amount: this.money(mapped.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)),
        hotel_name: hotelSettings?.name || "",
        hotel_address: hotelSettings?.street || "",
        hotel_phone: hotelSettings?.phone || "",
        hotel_email: hotelSettings?.email || "",
        logo_url: site?.logo_url || "",
      };

      let bodyHtml = template.body_html || "";
      const reservationsListRegex = /{{#reservations_list}}([\s\S]*?){{\/reservations_list}}/g;
      const reservationsListMatch = bodyHtml.match(reservationsListRegex);
      if (reservationsListMatch) {
        for (const match of reservationsListMatch) {
          const templateContent = match.replace(/{{#reservations_list}}|{{\/reservations_list}}/g, "");
          let renderedReservations = "";
          for (const reservation of reservationsList) {
            renderedReservations += this.processMultipleTemplate(templateContent, reservation);
          }
          bodyHtml = bodyHtml.replace(match, renderedReservations);
        }
      } else {
        const reservationsHtml = reservationsList
          .map(
            (res) => `
        <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #e5e7eb; border-radius: 8px;">
          <h3 style="margin-top: 0; color: #1f2937;">Reserva ${res.number}: ${res.code}</h3>
          <p><strong>Localizador:</strong> ${res.locator}</p>
          <p><strong>Check-in:</strong> ${res.checkin_date}</p>
          <p><strong>Check-out:</strong> ${res.checkout_date}</p>
          <p><strong>Quarto:</strong> ${res.room_number || res.room_name || "A definir"}</p>
          <p><strong>Categoria:</strong> ${res.category_name || "N/A"}</p>
          <p><strong>Valor Total:</strong> ${res.total_amount}</p>
          ${res.web_checkin_link ? `<p><a href="${res.web_checkin_link}">Realizar Check-in Online</a></p>` : ""}
        </div>
      `,
          )
          .join("");
        bodyHtml = bodyHtml.replace(/{{reservations_list}}/g, reservationsHtml);
      }
      const subject = renderEmailTemplate(template.subject || "", variables);
      bodyHtml = renderEmailTemplate(bodyHtml, variables);

      const emailSettings = await this.activeEmailSettings();
      if (!emailSettings) return;
      const emailQueue = await this.enqueueEmail({
        templateId: template.id,
        eventType: email_event_type.reservation_multiple_created,
        recipientEmail,
        recipientName,
        subject,
        bodyHtml,
        reservationId: firstReservation.id,
        variables,
        priority: 0,
      });
      if (!emailQueue) return;
      await this.processQueuedEmail(emailQueue.id, emailSettings);
    } catch (error) {
      console.error("Erro geral ao enviar email de múltiplas reservas criadas:", this.errorText(error));
    }
  }

  /** Notifica CRM: lead quitou a reserva (outbox booking.paid → deal ganho). */
  private async notifyCrmBookingPaid(input: {
    reservationId: string;
    establishmentId?: string | null;
    quoteId?: string | null;
    paymentIntentId?: string | null;
    paidAmount?: number | null;
    totalAmount?: number | null;
  }): Promise<void> {
    if (!this.crm || !input.reservationId) return;
    try {
      const reservation = await this.prisma.reservations.findUnique({
        where: { id: input.reservationId },
        select: {
          id: true,
          establishment_id: true,
          reservation_code: true,
          guest_name: true,
          client_id: true,
          guest_id: true,
          total_amount: true,
          paid_amount: true,
          clients_reservations_guest_idToclients: { select: { email: true, phone: true, full_name: true } },
          clients_reservations_client_idToclients: { select: { email: true, phone: true, full_name: true } },
        },
      });
      if (!reservation) return;
      const guest = reservation.clients_reservations_guest_idToclients;
      const payer = reservation.clients_reservations_client_idToclients;
      await this.crm.enqueueOutbox({
        eventType: "booking.paid",
        establishmentId: input.establishmentId || reservation.establishment_id,
        idempotencyKey: `booking.paid:${input.reservationId}:${input.paymentIntentId || "stripe"}`,
        payload: {
          reservation_id: reservation.id,
          reservation_code: reservation.reservation_code,
          quote_id: input.quoteId || null,
          client_id: reservation.client_id || reservation.guest_id || null,
          guest_name: guest?.full_name || payer?.full_name || reservation.guest_name || null,
          full_name: guest?.full_name || payer?.full_name || reservation.guest_name || null,
          email: guest?.email || payer?.email || null,
          phone: guest?.phone || payer?.phone || null,
          total_amount: input.totalAmount ?? Number(reservation.total_amount || 0),
          paid_amount: input.paidAmount ?? Number(reservation.paid_amount || 0),
          payment_intent_id: input.paymentIntentId || null,
          source: "stripe",
        },
      });
    } catch (error) {
      console.warn("[Webhook] CRM booking.paid:", this.errorText(error));
    }
  }

  private async sendPaymentConfirmedEmail(reservationId: string): Promise<void> {
    try {
      const loaded = await this.loadReservationEmail(reservationId);
      if (!loaded) return;
      const reservation = this.mapReservation(loaded);
      if (await this.shouldSkipPaymentConfirmedForOverbooking(reservation)) return;

      const emailSettings = await this.activeEmailSettings();
      if (!emailSettings) return;

      const recipientEmail =
        reservation.financial_responsible?.email || reservation.guest?.email || this.otaGuestEmail(reservation);
      const recipientName =
        reservation.guest_name ||
        reservation.financial_responsible?.full_name ||
        reservation.guest?.full_name ||
        this.otaGuestName(reservation) ||
        "Hóspede";
      if (!recipientEmail) return;

      const hotelSettings = reservation.establishment_id ? await this.hotelSettings(reservation.establishment_id) : null;
      const establishmentId = reservation.establishment_id || hotelSettings?.establishment_id || null;
      const template = await resolveEstablishmentEmailTemplate(
        this.prisma,
        "payment.confirmed",
        establishmentId,
      );
      if (!template) return;
      const site = await this.siteSettings();
      const baseUrl = this.baseUrlFromSite(site?.pms_base_url || null);
      const buildingId = reservation.room_categories?.building_id || null;
      const policiesLink = buildingId
        ? this.policiesLink(baseUrl, "building", buildingId, hotelSettings?.name || null)
        : this.policiesLink(baseUrl, "establishment", establishmentId, hotelSettings?.name || null);
      const webCheckinLink = await this.webCheckinLink(reservationId, reservation.reservation_code, site);
      const logoUrl = this.resolveLogo(hotelSettings?.logo_url || site?.logo_url || null);
      const checkinTime = this.asClock(reservation.checkin_time, this.asClock(hotelSettings?.checkin_time, "14:00"));
      const checkoutTime = this.asClock(reservation.checkout_time, this.asClock(hotelSettings?.checkout_time, "12:00"));
      const hotelPhone = this.hotelPhone(hotelSettings);
      const variables: Record<string, unknown> = {
        guest_name: recipientName || "Hóspede",
        reservation_code: reservation.reservation_code || "",
        checkin_date: this.formatDateBr(reservation.checkin_date),
        checkout_date: this.formatDateBr(reservation.checkout_date),
        checkin_time: checkinTime,
        checkout_time: checkoutTime,
        total_amount: this.money(Number(reservation.total_amount || 0)),
        paid_amount: this.money(Number(reservation.paid_amount || 0)),
        payment_status: "Pago",
        room_number: reservation.rooms?.room_number || "",
        room_name: reservation.rooms?.name || "",
        room_password: reservation.rooms?.fixed_password || "",
        room_category: reservation.room_categories?.name || "",
        category_name: reservation.room_categories?.name || "",
        adults: reservation.adults || 0,
        children: reservation.children || 0,
        hotel_name: hotelSettings?.name || "",
        hotel_address: this.hotelAddress(hotelSettings),
        hotel_contact: hotelPhone,
        hotel_email: hotelSettings?.email || "",
        hotel_phone: hotelPhone,
        hotel_website: hotelSettings?.website || "",
        hotel_policies: this.jsonToTemplateString(hotelSettings?.policies),
        policies_link: policiesLink,
        web_checkin_link: webCheckinLink,
        ...emailLogoVariables(logoUrl),
      };
      const subject = renderEmailTemplate(template.subject, variables);
      const bodyHtml = renderEmailTemplate(template.body_html, variables);
      let emailSent = false;
      if (emailSettings.provider === email_provider.resend || emailSettings.provider === email_provider.sendgrid) {
        const sent = await this.sendProviderEmail(emailSettings, {
          to: recipientEmail,
          toName: recipientName,
          subject,
          html: bodyHtml,
        });
        emailSent = sent.ok;
      }
      if (!emailSent) {
        const queued = await this.enqueueEmail({
          templateId: template.id,
          eventType: email_event_type.payment_confirmed,
          recipientEmail,
          recipientName,
          subject,
          bodyHtml,
          reservationId,
          variables,
          priority: 1,
        });
        if (queued) await this.processQueuedEmail(queued.id, emailSettings);
      }
    } catch (error) {
      console.error(`[Webhook] Erro geral ao enviar email de pagamento confirmado para reserva ${reservationId}:`, this.errorText(error));
    }
  }

  private async shouldSkipPaymentConfirmedForOverbooking(reservation: ReservationEmailRow): Promise<boolean> {
    if (!reservation.id) return false;
    if (reservation.pending_resolved_at != null) return false;
    const notes = String(reservation.notes || "").toLowerCase();
    if (notes.includes("overbooking") && !reservation.room_id) return true;
    if (!reservation.room_id || !reservation.establishment_id) return false;
    const others = await this.prisma.reservations.findMany({
      where: {
        establishment_id: reservation.establishment_id,
        room_id: reservation.room_id,
        id: { not: reservation.id },
        status: {
          in: [
            reservation_status.pending,
            reservation_status.confirmed,
            reservation_status.checkedin,
            reservation_status.blocked,
            reservation_status.preregistration,
          ],
        },
      },
      select: { checkin_date: true, checkout_date: true },
    });
    for (const other of others) {
      if (this.overlapStay(reservation.checkin_date, reservation.checkout_date, other.checkin_date, other.checkout_date)) {
        return true;
      }
    }
    return false;
  }

  private async enqueueEmail(input: {
    templateId: string;
    eventType: email_event_type;
    recipientEmail: string;
    recipientName: string;
    subject: string;
    bodyHtml: string;
    reservationId: string;
    variables: Record<string, unknown>;
    priority: number;
  }): Promise<{ id: string } | null> {
    try {
      return await this.prisma.email_queue.create({
        data: {
          template_id: input.templateId,
          event_type: input.eventType,
          recipient_email: input.recipientEmail,
          recipient_name: input.recipientName,
          subject: input.subject,
          body_html: input.bodyHtml,
          reservation_id: input.reservationId,
          variables: this.jsonValue(input.variables),
          priority: input.priority,
          status: email_status.pending,
        },
        select: { id: true },
      });
    } catch (error) {
      console.error("Erro ao adicionar email à fila:", this.errorText(error));
      return null;
    }
  }

  private async processQueuedEmail(queueId: string, emailSettings: EmailSettingsRow): Promise<void> {
    try {
      const queueItem = await this.prisma.email_queue.findUnique({ where: { id: queueId } });
      if (!queueItem) return;
      await this.prisma.email_queue.update({ where: { id: queueId }, data: { status: email_status.sending } });
      try {
        const sent = await this.sendProviderEmail(emailSettings, {
          to: queueItem.recipient_email,
          toName: queueItem.recipient_name,
          subject: queueItem.subject,
          html: queueItem.body_html,
          text: queueItem.body_text || "",
          replyTo: emailSettings.reply_to_email || emailSettings.sender_email,
        });
        if (sent.ok) {
          await this.prisma.email_queue.update({
            where: { id: queueId },
            data: { status: email_status.sent, sent_at: new Date() },
          });
        } else if (sent.errorText) {
          await this.prisma.email_queue.update({
            where: { id: queueId },
            data: { status: email_status.pending, error_message: sent.errorText.slice(0, 500) },
          });
        }
      } catch (processError) {
        await this.prisma.email_queue.update({
          where: { id: queueId },
          data: { status: email_status.pending, error_message: this.errorText(processError).slice(0, 500) },
        });
      }
    } catch (error) {
      console.warn(`[Webhook] Erro ao processar email da fila ${queueId}:`, this.errorText(error));
    }
  }

  private async sendProviderEmail(
    settings: EmailSettingsRow,
    message: { to: string; toName?: string | null; subject: string; html: string; text?: string; replyTo?: string },
  ): Promise<{ ok: boolean; errorText: string }> {
    try {
      if (settings.provider === email_provider.resend) {
        return await this.sendResend(settings, message);
      }
      if (settings.provider === email_provider.sendgrid) {
        return await this.sendSendGrid(settings, message);
      }
      if (settings.provider === email_provider.smtp) {
        return await this.sendSmtpEmail(settings, message);
      }
      return { ok: false, errorText: "" };
    } catch (error) {
      return { ok: false, errorText: this.errorText(error) };
    }
  }

  private async sendResend(
    settings: EmailSettingsRow,
    message: { to: string; toName?: string | null; subject: string; html: string; text?: string; replyTo?: string },
  ): Promise<{ ok: boolean; errorText: string }> {
    const from = settings.sender_name ? `${settings.sender_name} <${settings.sender_email}>` : settings.sender_email;
    const payload: JsonRecord = {
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
    };
    if (message.replyTo) payload.reply_to = message.replyTo;
    if (message.text) payload.text = message.text;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.api_key || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) return { ok: true, errorText: "" };
    return { ok: false, errorText: await response.text() };
  }

  private async sendSendGrid(
    settings: EmailSettingsRow,
    message: { to: string; toName?: string | null; subject: string; html: string; text?: string; replyTo?: string },
  ): Promise<{ ok: boolean; errorText: string }> {
    const payload = {
      personalizations: [{ to: [{ email: message.to, name: message.toName || undefined }] }],
      from: { email: settings.sender_email, name: settings.sender_name || undefined },
      reply_to: { email: message.replyTo || settings.sender_email },
      subject: message.subject,
      content: [
        { type: "text/html", value: message.html },
        ...(message.text ? [{ type: "text/plain", value: message.text }] : []),
      ],
    };
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.api_key || ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (response.ok) return { ok: true, errorText: "" };
    return { ok: false, errorText: await response.text() };
  }

  private async sendSmtpEmail(
    settings: EmailSettingsRow,
    message: { to: string; toName?: string | null; subject: string; html: string; text?: string; replyTo?: string },
  ): Promise<{ ok: boolean; errorText: string }> {
    if (!settings.smtp_host || !settings.smtp_username || !settings.smtp_password) {
      return { ok: false, errorText: "Missing SMTP configuration" };
    }
    await this.deliverSmtp({
      host: settings.smtp_host,
      port: settings.smtp_port || 587,
      secure: settings.smtp_secure || false,
      user: settings.smtp_username,
      pass: settings.smtp_password,
      from: settings.sender_email,
      fromName: settings.sender_name,
      to: message.to,
      toName: message.toName || undefined,
      replyTo: message.replyTo,
      subject: message.subject,
      html: message.html,
    });
    return { ok: true, errorText: "" };
  }

  private async deliverSmtp(input: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    from: string;
    fromName?: string | null;
    to: string;
    toName?: string;
    replyTo?: string;
    subject: string;
    html: string;
  }): Promise<void> {
    const directTls = input.secure || input.port === 465;
    const current: { socket: Socket } = {
      socket: directTls
        ? tlsConnect({ host: input.host, port: input.port, servername: input.host })
        : netConnect({ host: input.host, port: input.port }),
    };
    current.socket.setTimeout(20000);
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error);
      current.socket.once("error", onError);
      current.socket.once(directTls ? "secureConnect" : "connect", () => {
        current.socket.off("error", onError);
        resolve();
      });
      current.socket.once("timeout", () => reject(new Error("SMTP timeout")));
    });

    const read = () => this.readSmtp(current.socket);
    const write = async (command: string) => {
      current.socket.write(`${command}\r\n`);
      return read();
    };
    try {
      await read();
      await write("EHLO pms");
      if (!directTls) {
        await write("STARTTLS");
        const upgraded = tlsConnect({ socket: current.socket, servername: input.host });
        await new Promise<void>((resolve, reject) => {
          upgraded.once("secureConnect", () => resolve());
          upgraded.once("error", reject);
        });
        current.socket = upgraded;
        current.socket.setTimeout(20000);
        await write("EHLO pms");
      }
      await write("AUTH LOGIN");
      await write(Buffer.from(input.user).toString("base64"));
      await write(Buffer.from(input.pass).toString("base64"));
      await write(`MAIL FROM:<${this.emailAddress(input.from)}>`);
      await write(`RCPT TO:<${this.emailAddress(input.to)}>`);
      current.socket.write("DATA\r\n");
      await read();
      const mime = this.buildMime(input);
      current.socket.write(`${mime}\r\n.\r\n`);
      await read();
      current.socket.write("QUIT\r\n");
      current.socket.end();
    } catch (error) {
      current.socket.destroy();
      throw error;
    }
  }

  private readSmtp(socket: Socket): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = "";
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split(/\r?\n/).filter((line) => line.length > 0);
        const last = lines[lines.length - 1];
        if (!last || !/^\d{3} /.test(last)) return;
        cleanup();
        const code = Number(last.slice(0, 3));
        if (code >= 400) reject(new Error(buffer.trim()));
        else resolve(buffer);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
      };
      socket.on("data", onData);
      socket.on("error", onError);
    });
  }

  private buildMime(input: {
    from: string;
    fromName?: string | null;
    to: string;
    toName?: string;
    replyTo?: string;
    subject: string;
    html: string;
  }): string {
    const headers = [
      `From: ${this.formatAddress(input.from, input.fromName)}`,
      `To: ${this.formatAddress(input.to, input.toName)}`,
      ...(input.replyTo ? [`Reply-To: ${input.replyTo}`] : []),
      `Subject: ${this.encodeHeader(input.subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
    ];
    const body = input.html.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    return `${headers.join("\r\n")}\r\n\r\n${body}`;
  }

  private async loadReservationEmail(reservationId: string): Promise<ReservationEmailRow | null> {
    return this.prisma.reservations.findUnique({
      where: { id: reservationId },
      include: reservationEmailInclude,
    });
  }

  private mapReservation(row: ReservationEmailRow): ReservationEmailRow & {
    guest: ReservationEmailRow["clients_reservations_guest_idToclients"];
    financial_responsible: ReservationEmailRow["clients_reservations_client_idToclients"];
  } {
    return {
      ...row,
      guest: row.clients_reservations_guest_idToclients,
      financial_responsible: row.clients_reservations_client_idToclients,
    };
  }

  private async hotelSettings(establishmentId: string): Promise<HotelSettingsRow | null> {
    return this.prisma.hotel_settings.findFirst({
      where: { establishment_id: establishmentId },
      select: {
        name: true,
        website: true,
        email: true,
        phone_ddi: true,
        phone_number: true,
        phone: true,
        street: true,
        number: true,
        neighborhood: true,
        city: true,
        state: true,
        zip_code: true,
        logo_url: true,
        checkin_time: true,
        checkout_time: true,
        policies: true,
        establishment_id: true,
      },
    });
  }

  private async siteSettings(): Promise<{
    logo_url: string | null;
    pms_base_url: string | null;
    web_checkin_public_base_url: string | null;
  } | null> {
    return this.prisma.site_settings.findFirst({
      select: { logo_url: true, pms_base_url: true, web_checkin_public_base_url: true },
    });
  }

  private async singleTemplate(eventType: email_event_type) {
    const rows = await this.prisma.email_templates.findMany({
      where: { event_type: eventType, is_active: true },
      take: 2,
    });
    return rows.length === 1 ? rows[0] : null;
  }

  private async activeEmailSettings(): Promise<EmailSettingsRow | null> {
    const rows = await this.prisma.email_settings.findMany({ where: { is_active: true }, take: 2 });
    if (rows.length !== 1) return null;
    const row = rows[0];
    return {
      provider: row.provider,
      api_key: row.api_key,
      sender_email: row.sender_email,
      sender_name: row.sender_name,
      reply_to_email: row.reply_to_email,
      smtp_host: row.smtp_host,
      smtp_port: row.smtp_port,
      smtp_username: row.smtp_username,
      smtp_password: row.smtp_password,
      smtp_secure: row.smtp_secure,
    };
  }

  private pickEstablishmentTemplate<T extends { establishment_ids: Prisma.JsonValue }>(
    templates: T[],
    establishmentId: string,
  ): T | null {
    for (const template of templates) {
      const establishmentIds = template.establishment_ids;
      if (establishmentIds === null || establishmentIds === undefined) return template;
      if (Array.isArray(establishmentIds)) {
        if (establishmentIds.length === 0) continue;
        if (establishmentIds.includes(establishmentId)) return template;
        continue;
      }
      try {
        const parsed = typeof establishmentIds === "string" ? JSON.parse(establishmentIds) : establishmentIds;
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) continue;
          if (parsed.includes(establishmentId)) return template;
        }
      } catch {
        return template;
      }
    }
    return null;
  }

  private async webCheckinLink(
    reservationId: string,
    reservationCode: string | null,
    site: { pms_base_url: string | null; web_checkin_public_base_url: string | null } | null,
  ): Promise<string> {
    try {
      const webCheckin = await this.prisma.web_checkin.findUnique({
        where: { reservation_id: reservationId },
        select: { locator: true },
      });
      if (webCheckin?.locator) return buildWebCheckinLocatorUrl(webCheckin.locator, site);
      if (reservationCode) return buildWebCheckinLocatorUrl(reservationCode, site);
    } catch (error) {
      console.warn("Erro ao buscar web_checkin:", this.errorText(error));
    }
    return "";
  }

  private policiesLink(baseUrl: string, type: "establishment" | "building", id: string | null, hotelName: string | null): string {
    if (!id) return "";
    try {
      const token = Buffer.from(`${type}:${id}`, "utf8").toString("base64");
      const slug = (hotelName || "hotel")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return `${baseUrl}/policies/${slug}/${token}`;
    } catch {
      return "";
    }
  }

  private processStandardTemplate(templateStr: string, vars: Record<string, unknown>): string {
    let processed = templateStr;
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 100) {
      iterations++;
      changed = false;
      processed = processed.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_full, name: string, ifContent: string, elseContent?: string) => {
        if (this.isTemplateTruthy(vars[name])) {
          changed = true;
          return ifContent;
        }
        if (elseContent !== undefined && elseContent !== null) {
          changed = true;
          return elseContent;
        }
        return "";
      });
    }
    processed = processed.replace(/\{\{\/if\}\}/g, "");
    return this.replaceVars(processed, vars, false);
  }

  private processPaymentTemplate(templateStr: string, vars: Record<string, unknown>): string {
    let processed = templateStr;
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 100) {
      iterations++;
      changed = false;
      processed = processed.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_full, name: string, ifContent: string, elseContent?: string) => {
        if (this.isTemplateTruthy(vars[name])) {
          changed = true;
          return ifContent;
        }
        if (elseContent !== undefined && elseContent !== null) {
          changed = true;
          return elseContent;
        }
        return "";
      });
      processed = processed.replace(/\{\{\/if\}\}/g, "");
    }
    return this.replaceVars(processed, vars, false);
  }

  private processMultipleTemplate(templateStr: string, vars: Record<string, unknown>): string {
    let processed = templateStr;
    let changed = true;
    let iterations = 0;
    while (changed && iterations < 20) {
      iterations++;
      const before = processed;
      processed = processed.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_match, name: string, ifContent: string, elseContent?: string) => {
        const value = vars[name];
        if (value && value !== null && value !== undefined && String(value).trim() !== "") return ifContent || "";
        return elseContent || "";
      });
      changed = before !== processed;
    }
    processed = processed.replace(/\{\{\/if\}\}/g, "");
    return this.replaceVars(processed, vars, true);
  }

  private replaceVars(templateStr: string, vars: Record<string, unknown>, skipNull: boolean): string {
    let processed = templateStr;
    for (const key of Object.keys(vars)) {
      const value = vars[key];
      if (skipNull && (value === null || value === undefined)) continue;
      const text = value == null ? "" : String(value);
      processed = processed.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), text);
    }
    return processed;
  }

  private isTemplateTruthy(value: unknown): boolean {
    return (
      value !== null &&
      value !== undefined &&
      value !== "" &&
      value !== 0 &&
      value !== false &&
      (typeof value === "string" ? value.trim() !== "" : true)
    );
  }

  private async singleGlobalConfig() {
    const rows = await this.prisma.stripe_global_config.findMany({ take: 2 });
    return rows.length === 1 ? rows[0] : null;
  }

  private async establishmentSecret(establishmentId: string): Promise<string | null> {
    const globalConfig = await this.singleGlobalConfig();
    const establishmentConfig = await this.prisma.stripe_establishment_config.findUnique({
      where: { establishment_id: establishmentId },
      select: { test_secret_key: true, live_secret_key: true },
    });
    const isTestMode = globalConfig?.test_mode ?? true;
    return (isTestMode ? establishmentConfig?.test_secret_key : establishmentConfig?.live_secret_key) || null;
  }

  private async stripeGet<T>(secretKey: string, path: string): Promise<T> {
    const response = await fetch(`${STRIPE_API}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Stripe-Version": STRIPE_VERSION,
      },
    });
    const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(body.error?.message || `Stripe HTTP ${response.status}`);
    }
    return body;
  }

  private async createReservationWithLock(
    data: JsonRecord,
    checkinDate: string,
    checkoutDate: string,
    establishmentId: string,
    roomId: string | null,
    categoryId: string,
  ): Promise<{ success?: boolean; reservation_id?: string; error?: string } | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ result: unknown }>>(
      `SELECT public.create_reservation_with_lock($1::jsonb, $2::date, $3::date, $4::uuid, $5::uuid, $6::uuid) AS result`,
      JSON.stringify(data),
      checkinDate,
      checkoutDate,
      establishmentId,
      roomId,
      categoryId,
    );
    const result = rows[0]?.result;
    if (typeof result === "string") return JSON.parse(result) as { success?: boolean; reservation_id?: string; error?: string };
    return (result as { success?: boolean; reservation_id?: string; error?: string }) || null;
  }

  private constructEvent(payload: string, header: string, secret: string): StripeEvent {
    const details = this.parseStripeHeader(header);
    if (!details || details.timestamp === -1) {
      throw new Error("Unable to extract timestamp and signatures from header");
    }
    const expected = createHmac("sha256", secret).update(`${details.timestamp}.${payload}`, "utf8").digest("hex");
    const found = details.signatures.some((signature) => this.secureCompare(expected, signature));
    if (!found) {
      throw new Error(
        "No signatures found matching the expected signature for payload. Are you passing the raw request body you received from Stripe? \n If a webhook request is being forwarded by a third-party tool, ensure that the exact request body, including JSON formatting and new line style, is preserved.\n\nLearn more about webhook signing and explore webhook integration examples for various frameworks at https://github.com/stripe/stripe-node#webhook-signing\n",
      );
    }
    const timestampAge = Math.floor(Date.now() / 1000) - details.timestamp;
    if (timestampAge > SIGNATURE_TOLERANCE_SECONDS) {
      throw new Error("Timestamp outside the tolerance zone");
    }
    return JSON.parse(payload) as StripeEvent;
  }

  private parseStripeHeader(header: string): { timestamp: number; signatures: string[] } | null {
    if (typeof header !== "string") return null;
    return header.split(",").reduce(
      (accum, item) => {
        const kv = item.split("=");
        if (kv[0] === "t") accum.timestamp = Number.parseInt(kv[1] || "", 10);
        if (kv[0] === "v1") accum.signatures.push(kv[1] || "");
        return accum;
      },
      { timestamp: -1, signatures: [] as string[] },
    );
  }

  private secureCompare(leftValue: string, rightValue: string): boolean {
    const left = Buffer.from(leftValue);
    const right = Buffer.from(rightValue);
    if (left.length !== right.length) return false;
    return timingSafeEqual(left, right);
  }

  private detectBaseUrl(): string {
    const publicApp = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
    if (publicApp) return publicApp;
    const siteUrl = process.env.SITE_URL;
    if (siteUrl) return siteUrl;
    const vercelUrl = process.env.VERCEL_URL;
    if (vercelUrl) return `https://${vercelUrl}`;
    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) return renderUrl;
    const netlifyUrl = process.env.URL;
    if (netlifyUrl) return netlifyUrl;
    const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN;
    if (railwayUrl) return `https://${railwayUrl}`;

    const supabaseUrlEnv = process.env.SUPABASE_URL;
    if (supabaseUrlEnv) {
      try {
        const url = new URL(supabaseUrlEnv);
        const hostname = url.hostname;
        if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) return "http://localhost:8080";
        if (!hostname.includes(".supabase.co")) {
          const parts = hostname.split(".");
          if (parts.length > 2) return `${url.protocol}//${parts.slice(-2).join(".")}`;
          return `${url.protocol}//${hostname}`;
        }
      } catch {
        // ignore invalid SUPABASE_URL
      }
    }

    const env = process.env.ENVIRONMENT || process.env.NODE_ENV || process.env.DENO_ENV;
    if ((env === "production" || env === "prod") && supabaseUrlEnv) {
      try {
        const url = new URL(supabaseUrlEnv);
        if (!url.hostname.includes("localhost") && !url.hostname.includes("127.0.0.1")) {
          return `${url.protocol}//${url.hostname}`;
        }
      } catch {
        // ignore invalid SUPABASE_URL
      }
    }
    if (supabaseUrlEnv && (supabaseUrlEnv.includes("localhost") || supabaseUrlEnv.includes("127.0.0.1"))) {
      return "http://localhost:8080";
    }
    return "http://localhost:8080";
  }

  private baseUrlFromSite(pmsBaseUrl: string | null): string {
    let baseUrl = this.detectBaseUrl();
    const pmsUrl = pmsBaseUrl?.trim();
    if (!pmsUrl) return baseUrl;
    try {
      const url = new URL(pmsUrl.startsWith("http://") || pmsUrl.startsWith("https://") ? pmsUrl : `https://${pmsUrl}`);
      baseUrl = url.origin;
    } catch {
      baseUrl = pmsUrl;
    }
    return baseUrl;
  }

  private resolveLogo(url: string | null): string | null {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    const base = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
    if (!base) return url;
    let filePath = url;
    if (filePath.includes("/storage/v1/object/public/")) {
      const match = filePath.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
      if (match?.[1]) filePath = match[1];
    }
    if (!filePath.startsWith("hotel/") && !filePath.includes("/")) filePath = `hotel/${filePath}`;
    return `${base}/storage/v1/object/public/hotel-assets/${filePath}`;
  }

  private otaGuestEmail(reservation: { ota_reservations?: { ota_guest_email: string | null }[] | null }): string | null {
    const row = reservation.ota_reservations?.[0];
    const email = row?.ota_guest_email;
    return email != null && String(email).trim() !== "" ? String(email).trim() : null;
  }

  private otaGuestName(reservation: {
    ota_reservations?: { ota_guest_name: string | null }[] | null;
    guest_name?: string | null;
  }): string | null {
    const name = reservation.ota_reservations?.[0]?.ota_guest_name;
    if (name != null && String(name).trim() !== "") return String(name).trim();
    const guestName = reservation.guest_name;
    return guestName != null && String(guestName).trim() !== "" ? String(guestName).trim() : null;
  }

  private overlapStay(aStart: Date | string, aEnd: Date | string, bStart: Date | string, bEnd: Date | string): boolean {
    return new Date(bStart).getTime() < new Date(aEnd).getTime() && new Date(bEnd).getTime() > new Date(aStart).getTime();
  }

  private reservationIdsFromNotes(notes: string | null): string[] {
    if (!notes) return [];
    const newer = notes.match(/<!--RESERVATION_IDS_START-->(.+?)<!--RESERVATION_IDS_END-->/s);
    if (newer) {
      try {
        const parsed = JSON.parse(newer[1].trim()) as { reservation_ids?: unknown };
        if (Array.isArray(parsed.reservation_ids)) return parsed.reservation_ids.filter((id): id is string => typeof id === "string");
      } catch (error) {
        console.warn("[Webhook] Erro ao parsear reservation_ids (formato novo):", this.errorText(error));
      }
      return [];
    }
    const older = notes.match(/\[RESERVATION_IDS:(\{.*?\})\]/s);
    if (!older) return [];
    try {
      const parsed = JSON.parse(older[1]) as { reservation_ids?: unknown };
      if (Array.isArray(parsed.reservation_ids)) return parsed.reservation_ids.filter((id): id is string => typeof id === "string");
    } catch (error) {
      console.warn("[Webhook] Erro ao parsear reservation_ids (formato antigo):", this.errorText(error));
    }
    return [];
  }

  private hotelAddress(hotelSettings: HotelSettingsRow | null): string {
    if (!hotelSettings) return "";
    const addressParts: string[] = [];
    if (hotelSettings.street) {
      let streetLine = hotelSettings.street;
      if (hotelSettings.number) streetLine += `, ${hotelSettings.number}`;
      addressParts.push(streetLine);
    }
    if (hotelSettings.neighborhood) addressParts.push(hotelSettings.neighborhood);
    if (hotelSettings.city) {
      let cityLine = hotelSettings.city;
      if (hotelSettings.state) cityLine += ` - ${hotelSettings.state}`;
      if (hotelSettings.zip_code) cityLine += ` - CEP: ${hotelSettings.zip_code}`;
      addressParts.push(cityLine);
    }
    if (addressParts.length > 0) return addressParts.join(", ");
    return hotelSettings.street ? `${hotelSettings.street}, ${hotelSettings.city || ""}` : "";
  }

  private hotelPhone(hotelSettings: HotelSettingsRow | null): string {
    if (!hotelSettings) return "";
    if (hotelSettings.phone_ddi && hotelSettings.phone_number) return `${hotelSettings.phone_ddi} ${hotelSettings.phone_number}`;
    return hotelSettings.phone_number || hotelSettings.phone || "";
  }

  private asClock(value: Date | string | null | undefined, fallback: string): string {
    if (value instanceof Date) {
      const hours = String(value.getUTCHours()).padStart(2, "0");
      const minutes = String(value.getUTCMinutes()).padStart(2, "0");
      return `${hours}:${minutes}`;
    }
    if (typeof value === "string" && value.includes(":")) return value.substring(0, 5);
    if (typeof value === "string" && value) return value;
    return fallback;
  }

  private formatDateBr(value: Date | string | null | undefined): string {
    if (!value) return "";
    try {
      return (value instanceof Date ? value : new Date(value)).toLocaleDateString("pt-BR");
    } catch {
      return "";
    }
  }

  private money(value: number): string {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }

  private dateOnly(value: Date | string): string {
    if (typeof value === "string") return value.slice(0, 10);
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  private jsonQuoteId(metadata: Prisma.JsonValue | null): string | undefined {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
    const quoteId = metadata.quote_id;
    return typeof quoteId === "string" ? quoteId : undefined;
  }

  private jsonToTemplateString(value: Prisma.JsonValue | null | undefined): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    return String(value);
  }

  private jsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private asPaymentIntent(value: JsonRecord): StripePaymentIntent {
    return value as unknown as StripePaymentIntent;
  }

  private stringOrId(value: unknown): string | null {
    if (typeof value === "string" && value) return value;
    if (value && typeof value === "object" && "id" in value && typeof (value as { id?: unknown }).id === "string") {
      return (value as { id: string }).id;
    }
    return null;
  }

  private emailAddress(value: string): string {
    const match = value.match(/<([^>]+)>/);
    return (match?.[1] || value).trim();
  }

  private formatAddress(email: string, name?: string | null): string {
    if (!name) return email;
    return `${name.replace(/[\r\n]/g, " ")} <${this.emailAddress(email)}>`;
  }

  private encodeHeader(value: string): string {
    if (/^[\x20-\x7E]*$/.test(value)) return value.replace(/[\r\n]/g, " ");
    return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
  }

  private errorText(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
    return String(error);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
