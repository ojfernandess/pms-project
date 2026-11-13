const STRIPE_VERSION = "2023-10-16";

export function encodeStripe(data: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && !Array.isArray(value)) {
      parts.push(encodeStripe(value as Record<string, unknown>, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

export async function stripeRequest<T>(secretKey: string, method: string, path: string, data?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": STRIPE_VERSION,
      ...(data ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: data ? encodeStripe(data) : undefined,
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(body.error?.message || `Stripe HTTP ${response.status}`);
  }
  return body;
}
