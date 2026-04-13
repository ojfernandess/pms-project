import type { Env } from "../config/env.js";

type InvokeLegacyOptions = {
  extraHeaders?: Record<string, string>;
  query?: URLSearchParams;
  useServiceRoleAuth?: boolean;
};

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
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data?.error || `Legacy function ${functionName} failed (${response.status})`);
  }
  return data as T;
}
