import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { invokeLegacyFunctionForwardAuth } from "../services/legacyFunctionsProxy.js";
import { HttpError } from "../utils/httpError.js";

function pickQueryParams(rawQuery: Record<string, unknown> | undefined): URLSearchParams {
  const query = new URLSearchParams();
  if (!rawQuery) return query;
  for (const [key, value] of Object.entries(rawQuery)) {
    if (typeof value === "string") query.append(key, value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") query.append(key, item);
      }
    }
  }
  return query;
}

function bearerFrom(request: { headers: { authorization?: string } }): string {
  const h = request.headers.authorization;
  if (!h?.startsWith("Bearer ") || h.length < 8) {
    throw new HttpError(401, "Unauthorized", "NO_BEARER");
  }
  return h;
}

export async function registerLegacyUserEdgeProxyRoutes(app: FastifyInstance, env: Env): Promise<void> {
  const authPre = requireAuth(env);

  // Público em relação ao Node: repete o contrato da Edge (sessão ou anon + guest_account no body).
  app.post("/api/legacy/get-reservation", async (request, reply) => {
    const authorization = bearerFrom(request);
    try {
      const data = await invokeLegacyFunctionForwardAuth(env, "get-reservation", {
        method: "POST",
        body: request.body ?? {},
        authorization,
      });
      await reply.send(data);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "get-reservation failed", "LEGACY_PROXY_FAILED");
    }
  });

  app.get("/api/legacy/rates-dashboard", { preHandler: authPre }, async (request, reply) => {
    const authorization = bearerFrom(request);
    const query = pickQueryParams(request.query as Record<string, unknown> | undefined);
    if (!query.get("establishment_id")) {
      throw new HttpError(400, "establishment_id é obrigatório", "VALIDATION");
    }
    try {
      const data = await invokeLegacyFunctionForwardAuth(env, "rates-dashboard", {
        method: "GET",
        query,
        authorization,
      });
      await reply.send(data);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "rates-dashboard failed", "LEGACY_PROXY_FAILED");
    }
  });

  app.get("/api/legacy/rates-map", { preHandler: authPre }, async (request, reply) => {
    const authorization = bearerFrom(request);
    const query = pickQueryParams(request.query as Record<string, unknown> | undefined);
    if (!query.get("establishment_id")) {
      throw new HttpError(400, "establishment_id é obrigatório", "VALIDATION");
    }
    try {
      const data = await invokeLegacyFunctionForwardAuth(env, "rates-map", {
        method: "GET",
        query,
        authorization,
      });
      await reply.send(data);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "rates-map failed", "LEGACY_PROXY_FAILED");
    }
  });

  app.post("/api/legacy/recalc-rates", { preHandler: authPre }, async (request, reply) => {
    const authorization = bearerFrom(request);
    const query = pickQueryParams(request.query as Record<string, unknown> | undefined);
    try {
      const data = await invokeLegacyFunctionForwardAuth(env, "recalc-rates", {
        method: "POST",
        body: request.body ?? {},
        query,
        authorization,
      });
      await reply.send(data);
    } catch (e) {
      throw new HttpError(400, e instanceof Error ? e.message : "recalc-rates failed", "LEGACY_PROXY_FAILED");
    }
  });

  app.post("/api/legacy/apply-dynamic-pricing-rules", { preHandler: authPre }, async (request, reply) => {
    const authorization = bearerFrom(request);
    try {
      const data = await invokeLegacyFunctionForwardAuth(env, "apply-dynamic-pricing-rules", {
        method: "POST",
        body: request.body ?? {},
        authorization,
      });
      await reply.send(data);
    } catch (e) {
      throw new HttpError(
        400,
        e instanceof Error ? e.message : "apply-dynamic-pricing-rules failed",
        "LEGACY_PROXY_FAILED"
      );
    }
  });

  for (const name of ["send-email-smtp", "send-email-sendgrid", "send-email-resend"] as const) {
    app.post(`/api/legacy/${name}`, { preHandler: authPre }, async (request, reply) => {
      const authorization = bearerFrom(request);
      try {
        const data = await invokeLegacyFunctionForwardAuth(env, name, {
          method: "POST",
          body: request.body ?? {},
          authorization,
        });
        await reply.send(data);
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : `${name} failed`, "LEGACY_PROXY_FAILED");
      }
    });
  }
}
