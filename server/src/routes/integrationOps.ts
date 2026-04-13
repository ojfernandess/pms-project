import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { requireAuth } from "../middleware/auth.js";
import { invokeLegacyFunction, invokeLegacyFunctionWithOptions } from "../services/legacyFunctionsProxy.js";
import { HttpError } from "../utils/httpError.js";

type LegacyMap = { path: string; functionName: string };

const routes: LegacyMap[] = [
  { path: "/api/integrations/send-daily-digest", functionName: "send-daily-digest" },
  { path: "/api/integrations/channex-sync", functionName: "channex-sync" },
  { path: "/api/integrations/channex-reservations-sync", functionName: "channex-reservations-sync" },
  { path: "/api/integrations/channex-booking-crs-update", functionName: "channex-booking-crs-update" },
  { path: "/api/integrations/channex-mapping-options", functionName: "channex-mapping-options" },
  { path: "/api/integrations/aiosell-sync", functionName: "aiosell-sync" },
  { path: "/api/integrations/aiosell-reservations-sync", functionName: "aiosell-reservations-sync" },
  { path: "/api/integrations/call-company-webhook", functionName: "call-company-webhook" },
];

function asHeaderString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

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

export async function registerIntegrationOpsRoutes(app: FastifyInstance, env: Env): Promise<void> {
  const authPre = requireAuth(env);

  for (const r of routes) {
    app.post(r.path, { preHandler: authPre }, async (request, reply) => {
      try {
        const data = await invokeLegacyFunction(env, r.functionName, request.body ?? {});
        await reply.send(data);
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : `Erro em ${r.functionName}`, "INTEGRATION_OP_FAILED");
      }
    });
  }

  // Public webhook endpoint for Aiosell. We proxy headers/query so legacy auth still works.
  app.post("/api/webhooks/aiosell-reservation", async (request, reply) => {
    try {
      const forwardedHeaders: Record<string, string> = {};
      const auth = asHeaderString(request.headers.authorization);
      const xAiosellSecret = asHeaderString(request.headers["x-aiosell-secret"]);
      const xWebhookSecret = asHeaderString(request.headers["x-webhook-secret"]);
      const xApiSecret = asHeaderString(request.headers["x-api-secret"]);
      const xApiKey = asHeaderString(request.headers["x-api-key"]);
      const apikey = asHeaderString(request.headers.apikey);

      if (auth) forwardedHeaders.Authorization = auth;
      if (xAiosellSecret) forwardedHeaders["x-aiosell-secret"] = xAiosellSecret;
      if (xWebhookSecret) forwardedHeaders["x-webhook-secret"] = xWebhookSecret;
      if (xApiSecret) forwardedHeaders["x-api-secret"] = xApiSecret;
      if (xApiKey) forwardedHeaders["x-api-key"] = xApiKey;
      if (apikey) forwardedHeaders.apikey = apikey;

      const query = pickQueryParams(request.query as Record<string, unknown> | undefined);

      const data = await invokeLegacyFunctionWithOptions(
        env,
        "aiosell-reservation-webhook",
        request.body ?? {},
        {
          query,
          extraHeaders: forwardedHeaders,
          useServiceRoleAuth: false,
        }
      );
      await reply.send(data);
    } catch (e) {
      throw new HttpError(
        400,
        e instanceof Error ? e.message : "Erro em aiosell-reservation-webhook",
        "INTEGRATION_OP_FAILED"
      );
    }
  });

  // Public webhook endpoint for Channex. We proxy headers/query so legacy auth still works.
  app.post("/api/webhooks/channex-reservation", async (request, reply) => {
    try {
      const forwardedHeaders: Record<string, string> = {};
      const auth = asHeaderString(request.headers.authorization);
      const userApiKey = asHeaderString(request.headers["user-api-key"]);
      const userApiKeyAlt = asHeaderString(request.headers["User-Api-Key"]);
      const xUserApiKey = asHeaderString(request.headers["x-user-api-key"]);
      const xUserApiKeyAlt = asHeaderString(request.headers["X-User-Api-Key"]);
      const xApiKey = asHeaderString(request.headers["x-api-key"]);
      const apikey = asHeaderString(request.headers.apikey);

      if (auth) forwardedHeaders.Authorization = auth;
      if (userApiKey) forwardedHeaders["user-api-key"] = userApiKey;
      if (userApiKeyAlt) forwardedHeaders["User-Api-Key"] = userApiKeyAlt;
      if (xUserApiKey) forwardedHeaders["x-user-api-key"] = xUserApiKey;
      if (xUserApiKeyAlt) forwardedHeaders["X-User-Api-Key"] = xUserApiKeyAlt;
      if (xApiKey) forwardedHeaders["x-api-key"] = xApiKey;
      if (apikey) forwardedHeaders.apikey = apikey;

      const query = pickQueryParams(request.query as Record<string, unknown> | undefined);

      const data = await invokeLegacyFunctionWithOptions(
        env,
        "channex-reservation-webhook",
        request.body ?? {},
        {
          query,
          extraHeaders: forwardedHeaders,
          useServiceRoleAuth: false,
        }
      );
      await reply.send(data);
    } catch (e) {
      throw new HttpError(
        400,
        e instanceof Error ? e.message : "Erro em channex-reservation-webhook",
        "INTEGRATION_OP_FAILED"
      );
    }
  });
}
