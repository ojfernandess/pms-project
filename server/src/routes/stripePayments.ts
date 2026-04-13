import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { createServiceClient } from "../services/supabase.js";
import { createStripePaymentIntent } from "../services/stripePayments.js";
import { HttpError } from "../utils/httpError.js";

const createIntentBody = z.object({
  establishment_id: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().default("BRL"),
  payment_type: z.string().min(1),
  reservation_id: z.string().uuid().optional().nullable(),
  quote_id: z.string().uuid().optional().nullable(),
  guest_id: z.string().uuid().optional().nullable(),
  guest_email: z.string().email().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  payment_method_id: z.string().optional().nullable(),
  save_payment_method: z.boolean().optional().default(false),
  metadata: z.record(z.unknown()).optional().default({}),
  checkout_date: z.string().optional().nullable(),
  total_amount: z.number().optional().nullable(),
});

export async function registerStripePaymentRoutes(app: FastifyInstance, env: Env): Promise<void> {
  const db = createServiceClient(env);

  app.post("/api/pagamentos/stripe/intent", async (request, reply) => {
    const parsed = createIntentBody.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, "Corpo inválido", "VALIDATION", parsed.error.flatten());
    }

    try {
      const result = await createStripePaymentIntent(db, env, parsed.data);
      await reply.send(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar pagamento";
      throw new HttpError(400, msg, "STRIPE_PAYMENT_INTENT_FAILED");
    }
  });
}
