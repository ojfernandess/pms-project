import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { invokeLegacyFunction } from "../services/legacyFunctionsProxy.js";
import { HttpError } from "../utils/httpError.js";

const templatesBody = z.object({
  establishment_id: z.string().uuid(),
});

const sendBody = z
  .object({
    reservation_id: z.string().uuid().optional(),
    reservation_ids: z.array(z.string().uuid()).optional(),
    intent: z.string().optional(),
    template_id_override: z.string().uuid().optional(),
    phone_overrides: z.record(z.string()).optional(),
  })
  .refine((v) => Boolean(v.reservation_id) || Boolean(v.reservation_ids?.length), {
    message: "Informe reservation_id ou reservation_ids",
    path: ["reservation_id"],
  });

export async function registerCheckinChargeRoutes(app: FastifyInstance, env: Env): Promise<void> {
  const authPre = requireAuth(env);

  app.post("/api/checkin-charge/templates", { preHandler: authPre }, async (request, reply) => {
    const parsed = templatesBody.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "Corpo inválido", "VALIDATION", parsed.error.flatten());
    try {
      const data = await invokeLegacyFunction(env, "list-channel-templates", parsed.data);
      await reply.send(data);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "Erro ao listar templates", "LIST_TEMPLATES_FAILED");
    }
  });

  app.post("/api/checkin-charge/send", { preHandler: authPre }, async (request, reply) => {
    const parsed = sendBody.safeParse(request.body);
    if (!parsed.success) throw new HttpError(400, "Corpo inválido", "VALIDATION", parsed.error.flatten());
    try {
      const data = await invokeLegacyFunction(env, "send-checkin-charge", parsed.data);
      await reply.send(data);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "Erro ao enviar cobrança/checkin", "SEND_CHECKIN_CHARGE_FAILED");
    }
  });
}
