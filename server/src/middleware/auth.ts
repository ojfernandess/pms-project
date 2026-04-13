import { createClient } from "@supabase/supabase-js";
import type { preHandlerHookHandler } from "fastify";
import type { Env } from "../config/env.js";

/** Exige `Authorization: Bearer <access_token>` válido no projeto Supabase. */
export function requireAuth(env: Env): preHandlerHookHandler {
  const auth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return async function requireAuthHook(request, reply): Promise<void> {
    const h = request.headers.authorization;
    if (!h?.startsWith("Bearer ")) {
      await reply.status(401).send({ error: "Unauthorized", code: "NO_BEARER" });
      return;
    }
    const jwt = h.slice(7).trim();
    if (!jwt) {
      await reply.status(401).send({ error: "Unauthorized", code: "EMPTY_JWT" });
      return;
    }
    const { data, error } = await auth.auth.getUser(jwt);
    if (error || !data.user) {
      await reply.status(401).send({ error: "Invalid or expired token", code: "INVALID_JWT" });
      return;
    }
    request.user = { id: data.user.id, email: data.user.email ?? undefined };
  };
}
