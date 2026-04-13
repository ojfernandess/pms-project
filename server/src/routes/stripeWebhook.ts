import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import type { Logger } from "../utils/logger.js";
import { verificarEventoStripe } from "../services/stripeWebhook.js";
import { createServiceClient } from "../services/supabase.js";
import {
  extractEstablishmentIdFromStripePayload,
  getStripeSigningConfigByEstablishment,
  type StripeSigningConfig,
} from "../services/stripeConfig.js";

/**
 * Plugin encapsulado: JSON do Stripe chega como **Buffer** (verificação HMAC).
 */
export async function registerStripeWebhookRoute(parent: FastifyInstance, env: Env, logger: Logger): Promise<void> {
  const db = createServiceClient(env);
  await parent.register(
    async function stripePlugin(f) {
      f.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
        done(null, body);
      });

      f.post("/", async (request, reply) => {
        const sig = request.headers["stripe-signature"];
        if (!sig || typeof sig !== "string") {
          await reply.status(400).send({ error: "Missing stripe-signature" });
          return;
        }
        const raw = request.body as Buffer;
        if (!Buffer.isBuffer(raw) || raw.length === 0) {
          await reply.status(400).send({ error: "Empty body" });
          return;
        }

        const fromQuery =
          typeof (request.query as { establishment_id?: unknown })?.establishment_id === "string"
            ? (request.query as { establishment_id?: string }).establishment_id ?? null
            : null;
        const fromPayload = extractEstablishmentIdFromStripePayload(raw);
        const establishmentId = fromQuery || fromPayload;

        if (!establishmentId) {
          await reply.status(400).send({
            error: "Missing establishment_id (query ou metadata do evento)",
            code: "MISSING_ESTABLISHMENT_ID",
          });
          return;
        }

        const candidates: StripeSigningConfig[] = [];
        const byEstablishment = await getStripeSigningConfigByEstablishment(db, establishmentId);
        if (byEstablishment) {
          candidates.push(byEstablishment);
        } else {
          logger.warn({ establishmentId }, "stripe config not found for establishment");
        }

        if (candidates.length === 0) {
          await reply.status(503).send({
            error: "Stripe não configurado para este estabelecimento",
            code: "STRIPE_DISABLED",
          });
          return;
        }

        try {
          let lastError: unknown = null;
          let event = null;
          let matched: StripeSigningConfig | null = null;
          for (const candidate of candidates) {
            try {
              event = verificarEventoStripe({
                rawBody: raw,
                signature: sig,
                webhookSecret: candidate.webhookSecret,
                stripeSecretKey: candidate.stripeSecretKey,
              });
              matched = candidate;
              break;
            } catch (e) {
              lastError = e;
            }
          }

          if (!event) throw lastError ?? new Error("Invalid signature");

          logger.info(
            {
              type: event.type,
              id: event.id,
              establishmentId: matched?.establishmentId,
              mode: matched?.mode,
            },
            "stripe webhook",
          );
          await reply.send({ received: true, type: event.type });
        } catch (e) {
          logger.warn({ err: e }, "stripe verify failed");
          await reply.status(400).send({ error: "Invalid signature" });
        }
      });
    },
    { prefix: "/api/webhooks/stripe" },
  );
}
