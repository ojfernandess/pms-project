import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Env } from "../config/env.js";

const EDGE_FUNCTION = "company-public-api";

/** Cabeçalhos que a Edge `company-public-api` lê para auth e logging (case-insensitive no Node). */
const PASSTHROUGH = [
  "clientid",
  "clientsecret",
  "x-client-id",
  "x-client-secret",
  "cf-connecting-ip",
  "x-forwarded-for",
  "x-real-ip",
] as const;

function applyPublicApiCors(request: FastifyRequest, reply: FastifyReply): void {
  const origin = request.headers.origin;
  if (typeof origin === "string" && origin.trim()) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
  } else {
    reply.header("Access-Control-Allow-Origin", "*");
  }
  reply.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  reply.header(
    "Access-Control-Allow-Headers",
    "authorization, x-client-info, apikey, content-type, clientid, clientsecret, x-client-id, x-client-secret, accept",
  );
  reply.header("Access-Control-Max-Age", "86400");
}

function buildEdgeUrl(request: FastifyRequest, env: Env): URL {
  const base = (env.FUNCTIONS_INVOKE_BASE_URL ?? `${env.SUPABASE_URL}/functions/v1`).replace(/\/+$/, "");
  const target = new URL(`${base}/${EDGE_FUNCTION}`);
  const incoming = new URL(request.raw.url ?? "/", "http://127.0.0.1");
  incoming.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return target;
}

function collectForwardHeaders(request: FastifyRequest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of PASSTHROUGH) {
    const v = request.headers[name];
    if (typeof v === "string" && v.trim()) out[name] = v;
  }
  const ip = request.ip;
  if (ip && !out["x-forwarded-for"] && !out["x-real-ip"]) {
    out["x-forwarded-for"] = ip;
  }
  return out;
}

/**
 * Proxy público para a Edge `company-public-api` (ClientId / ClientSecret).
 * CORS explícito só neste prefixo (integradores / browser).
 */
export async function registerCompanyPublicApiProxyRoutes(app: FastifyInstance, env: Env): Promise<void> {
  await app.register(
    async (scope) => {
      scope.options("/company-public-api", async (request, reply) => {
        applyPublicApiCors(request, reply);
        await reply.status(204).send();
      });

      const proxy = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        applyPublicApiCors(request, reply);

        if (request.method !== "GET" && request.method !== "POST") {
          await reply.status(405).send({ success: false, error: "Method not allowed" });
          return;
        }

        const target = buildEdgeUrl(request, env);
        const headers: Record<string, string> = {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          ...collectForwardHeaders(request),
        };

        const init: RequestInit = {
          method: request.method,
          headers,
        };

        if (request.method === "POST") {
          const ct = request.headers["content-type"];
          if (typeof ct === "string") headers["Content-Type"] = ct;
          if (request.body === undefined || request.body === null) {
            init.body = "{}";
            if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
          } else if (typeof request.body === "string") {
            init.body = request.body;
          } else if (Buffer.isBuffer(request.body)) {
            init.body = new Uint8Array(request.body);
          } else {
            init.body = JSON.stringify(request.body);
            if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
          }
        }

        let res: Response;
        try {
          res = await fetch(target.toString(), init);
        } catch {
          await reply.status(502).send({ success: false, error: "Falha ao contactar a API legada (company-public-api)." });
          return;
        }

        const bodyText = await res.text();
        const resCt = res.headers.get("content-type");
        await reply.status(res.status).type(resCt || "application/json").send(bodyText);
      };

      scope.get("/company-public-api", proxy);
      scope.post("/company-public-api", proxy);
    },
    { prefix: "/api/public" },
  );
}
