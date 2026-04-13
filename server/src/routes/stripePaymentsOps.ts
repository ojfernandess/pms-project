import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { createServiceClient } from "../services/supabase.js";
import { createStripeRefund, getStripePaymentStatus } from "../services/stripePayments.js";
import { HttpError } from "../utils/httpError.js";

const statusBody = z.object({
  payment_intent_id: z.string().min(1),
  get_client_secret: z.boolean().optional().default(false),
});

const refundBody = z.object({
  payment_id: z.string().uuid(),
  amount: z.number().positive(),
  reason: z.string().optional(),
  description: z.string().max(500).optional(),
  establishment_id: z.string().uuid(),
});

export async function registerStripePaymentOpsRoutes(app: FastifyInstance, env: Env): Promise<void> {
  const db = createServiceClient(env);

  app.post("/api/pagamentos/stripe/status", async (request, reply) => {
    const parsed = statusBody.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "Corpo inválido", "VALIDATION", parsed.error.flatten());
    try {
      const result = await getStripePaymentStatus(db, parsed.data);
      await reply.send(result);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "Erro ao verificar status", "STRIPE_STATUS_FAILED");
    }
  });

  app.post("/api/pagamentos/stripe/refund", async (request, reply) => {
    const parsed = refundBody.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "Corpo inválido", "VALIDATION", parsed.error.flatten());
    try {
      const result = await createStripeRefund(db, parsed.data);
      await reply.send(result);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "Erro ao processar reembolso", "STRIPE_REFUND_FAILED");
    }
  });
}
