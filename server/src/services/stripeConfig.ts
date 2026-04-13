import type { SupabaseClient } from "@supabase/supabase-js";

type StripeConfigRow = {
  is_enabled: boolean | null;
  test_secret_key: string | null;
  live_secret_key: string | null;
  webhook_secret_test: string | null;
  webhook_secret_live: string | null;
};

type StripeGlobalRow = {
  test_mode: boolean | null;
};

export type StripeSigningConfig = {
  establishmentId: string;
  stripeSecretKey: string;
  webhookSecret: string;
  mode: "test" | "live";
};

export async function getStripeSigningConfigByEstablishment(
  db: SupabaseClient,
  establishmentId: string,
): Promise<StripeSigningConfig | null> {
  const { data: globalConfig } = await db
    .from("stripe_global_config")
    .select("test_mode")
    .single<StripeGlobalRow>();

  const { data: config, error } = await db
    .from("stripe_establishment_config")
    .select("is_enabled, test_secret_key, live_secret_key, webhook_secret_test, webhook_secret_live")
    .eq("establishment_id", establishmentId)
    .maybeSingle<StripeConfigRow>();

  if (error || !config || config.is_enabled === false) return null;

  const isTestMode = globalConfig?.test_mode ?? true;
  const stripeSecretKey = isTestMode ? config.test_secret_key : config.live_secret_key;
  const webhookSecret = isTestMode ? config.webhook_secret_test : config.webhook_secret_live;

  if (!stripeSecretKey || !webhookSecret) return null;

  return {
    establishmentId,
    stripeSecretKey,
    webhookSecret,
    mode: isTestMode ? "test" : "live",
  };
}

export function extractEstablishmentIdFromStripePayload(rawBody: Buffer): string | null {
  try {
    const payload = JSON.parse(rawBody.toString("utf8")) as {
      data?: { object?: { metadata?: { establishment_id?: unknown } } };
    };
    const value = payload?.data?.object?.metadata?.establishment_id;
    return typeof value === "string" && value.trim() ? value : null;
  } catch {
    return null;
  }
}
