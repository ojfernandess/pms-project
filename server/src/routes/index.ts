import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { createServiceClient } from "../services/supabase.js";
import { criarReserva } from "../services/reservas.js";
import { disponibilidadePorCategoria } from "../services/disponibilidade.js";
import { checkinReserva } from "../services/checkin.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../utils/httpError.js";
import type { Logger } from "../utils/logger.js";
import { registerStripeWebhookRoute } from "./stripeWebhook.js";
import { registerStripePaymentRoutes } from "./stripePayments.js";
import { registerStripePaymentOpsRoutes } from "./stripePaymentsOps.js";
import { registerEmployeeAuthAdminRoutes } from "./employeeAuthAdmin.js";
import { registerCheckinChargeRoutes } from "./checkinCharge.js";
import { registerIntegrationOpsRoutes } from "./integrationOps.js";
import { registerLegacyUserEdgeProxyRoutes } from "./legacyUserEdgeProxy.js";

const uuidLoose = z.string().uuid();

const criarReservaBody = z
  .object({
    establishment_id: uuidLoose,
    checkin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checkout_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    room_id: uuidLoose.nullish(),
    category_id: uuidLoose.nullish(),
    guest_id: uuidLoose.nullish(),
    client_id: uuidLoose.nullish(),
    financial_responsible_id: uuidLoose.nullish(),
    guest_name: z.string().max(500).nullish(),
    adults: z.number().int().min(1).optional(),
    children: z.number().int().min(0).optional(),
    total_amount: z.number().optional(),
    paid_amount: z.number().optional(),
    payment_status: z.string().max(32).optional(),
    status: z.string().max(32).optional(),
    notes: z.string().max(10000).nullish(),
    checkin_time: z.string().max(16).nullish(),
    checkout_time: z.string().max(16).nullish(),
    pricing_plan_id: uuidLoose.nullish(),
    expiration_date: z.string().max(40).nullish(),
    channel: z.string().max(64).optional(),
    coupon_id: uuidLoose.nullish(),
  })
  .refine((b) => Boolean(b.room_id) || Boolean(b.category_id), {
    message: "Informe room_id ou category_id",
    path: ["room_id"],
  });

const disponibilidadeQuery = z.object({
  establishment_id: z.string().uuid(),
  category_id: z.string().uuid(),
  checkin_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkout_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const checkinBody = z.object({
  reservation_id: z.string().uuid(),
  establishment_id: z.string().uuid(),
});

export async function registerRoutes(app: FastifyInstance, env: Env, logger: Logger): Promise<void> {
  const db = createServiceClient(env);
  const authPre = requireAuth(env);

  app.get("/health", async (_req, reply) => {
    const { error } = await db.from("establishments").select("id").limit(1);
    await reply.send({
      ok: true,
      status: error ? "degraded" : "ok",
      database: error ? error.message : "reachable",
    });
  });

  app.post("/api/reservas", { preHandler: authPre }, async (request, reply) => {
    const parsed = criarReservaBody.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, "Corpo inválido", "VALIDATION", parsed.error.flatten());
    }
    try {
      const { reservation } = await criarReserva(db, {
        ...parsed.data,
        created_by: request.user?.id ?? null,
      });
      await reply.status(201).send({ ok: true, reservation });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new HttpError(400, msg, "CREATE_RESERVATION_FAILED");
    }
  });

  app.get("/api/disponibilidade", { preHandler: authPre }, async (request, reply) => {
    const parsed = disponibilidadeQuery.safeParse(request.query);
    if (!parsed.success) {
      throw new HttpError(400, "Query inválida", "VALIDATION", parsed.error.flatten());
    }
    const result = await disponibilidadePorCategoria(db, parsed.data);
    await reply.send({ ok: true, ...result, period: parsed.data });
  });

  app.post("/api/checkin", { preHandler: authPre }, async (request, reply) => {
    const parsed = checkinBody.safeParse(request.body);
    if (!parsed.success) {
      throw new HttpError(400, "Corpo inválido", "VALIDATION", parsed.error.flatten());
    }
    try {
      await checkinReserva(db, parsed.data);
      await reply.send({ ok: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("não encontrada") || msg.includes("não pertence")) {
        throw new HttpError(404, msg, "NOT_FOUND");
      }
      if (msg.includes("não permitido")) {
        throw new HttpError(409, msg, "INVALID_STATE");
      }
      throw new HttpError(400, msg, "CHECKIN_FAILED");
    }
  });

  await registerEmployeeAuthAdminRoutes(app, env);
  await registerCheckinChargeRoutes(app, env);
  await registerIntegrationOpsRoutes(app, env);
  await registerLegacyUserEdgeProxyRoutes(app, env);
  await registerStripePaymentRoutes(app, env);
  await registerStripePaymentOpsRoutes(app, env);
  await registerStripeWebhookRoute(app, env, logger);
}
