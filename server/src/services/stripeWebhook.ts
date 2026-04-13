import Stripe from "stripe";

export function verificarEventoStripe(args: {
  rawBody: Buffer;
  signature: string;
  webhookSecret: string;
  stripeSecretKey: string;
}): Stripe.Event {
  const stripe = new Stripe(args.stripeSecretKey, { apiVersion: "2025-02-24.acacia" });
  return stripe.webhooks.constructEvent(args.rawBody, args.signature, args.webhookSecret);
}
