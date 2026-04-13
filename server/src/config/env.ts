import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** Só servidor: validar `Authorization: Bearer` com `auth.getUser`. */
  SUPABASE_ANON_KEY: z.string().min(1),
  FUNCTIONS_INVOKE_BASE_URL: z.string().url().optional(),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  SITE_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(): Env {
  const r = schema.safeParse(process.env);
  if (!r.success) {
    throw new Error(`Variáveis de ambiente inválidas: ${JSON.stringify(r.error.flatten().fieldErrors)}`);
  }
  return r.data;
}
