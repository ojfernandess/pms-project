import type { Env } from "../config/env.js";

type InvokeLegacyOptions = {
  extraHeaders?: Record<string, string>;
  query?: URLSearchParams;
  useServiceRoleAuth?: boolean;
};

/** Corpo para Edge: objeto → JSON; string já JSON → repasse sem duplo stringify; Buffer → UTF-8. */
export function serializeLegacyFunctionBody(body: unknown): string {
  if (body === undefined || body === null) return "{}";
  if (typeof body === "string") {
    const t = body.trim();
    return t || "{}";
  }
  if (Buffer.isBuffer(body)) {
    const t = body.toString("utf8").trim();
    return t || "{}";
  }
  return JSON.stringify(body);
}

export async function invokeLegacyFunction<T>(env: Env, functionName: string, body: unknown): Promise<T> {
  return invokeLegacyFunctionWithOptions<T>(env, functionName, body, { useServiceRoleAuth: true });
}

export async function invokeLegacyFunctionWithOptions<T>(
  env: Env,
  functionName: string,
  body: unknown,
  options: InvokeLegacyOptions = {}
): Promise<T> {
  const base = (env.FUNCTIONS_INVOKE_BASE_URL ?? `${env.SUPABASE_URL}/functions/v1`).replace(/\/+$/, "");
  const url = new URL(`${base}/${functionName}`);
  if (options.query) {
    for (const [key, value] of options.query.entries()) {
      url.searchParams.append(key, value);
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.extraHeaders ?? {}),
  };

  if (options.useServiceRoleAuth !== false) {
    headers.Authorization = `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`;
    headers.apikey = env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    // Gateway das Edge Functions exige `apikey` do projeto; webhooks externos não o enviam.
    headers.apikey = env.SUPABASE_ANON_KEY;
    if (!String(headers.Authorization ?? "").trim()) {
      headers.Authorization = `Bearer ${env.SUPABASE_ANON_KEY}`;
    }
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: serializeLegacyFunctionBody(body),
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data?.error || `Legacy function ${functionName} failed (${response.status})`);
  }
  return data as T;
}

/** Chama uma Edge Function com o JWT do cliente (ou anon key), como o browser faria com `functions.invoke`. */
export async function invokeLegacyFunctionForwardAuth<T>(
  env: Env,
  functionName: string,
  options: {
    method: "GET" | "POST";
    body?: unknown;
    query?: URLSearchParams;
    /** Valor completo do header, ex.: `Bearer <access_token>`. */
    authorization: string;
  }
): Promise<T> {
  const base = (env.FUNCTIONS_INVOKE_BASE_URL ?? `${env.SUPABASE_URL}/functions/v1`).replace(/\/+$/, "");
  const url = new URL(`${base}/${functionName}`);
  if (options.query) {
    for (const [key, value] of options.query.entries()) {
      url.searchParams.append(key, value);
    }
  }

  const auth =
    options.authorization.trim().startsWith("Bearer ") ? options.authorization.trim() : `Bearer ${options.authorization.trim()}`;

  const headers: Record<string, string> = {
    Authorization: auth,
    apikey: env.SUPABASE_ANON_KEY,
  };

  const init: RequestInit = { method: options.method, headers };
  if (options.method === "POST") {
    headers["Content-Type"] = "application/json";
    init.body = serializeLegacyFunctionBody(options.body ?? {});
  }

  const response = await fetch(url.toString(), init);
  const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string } & T;
  if (!response.ok) {
    const msg =
      (typeof data?.message === "string" && data.message) ||
      (typeof data?.error === "string" && data.error) ||
      `Legacy function ${functionName} failed (${response.status})`;
    throw new Error(msg);
  }
  return data as T;
}
