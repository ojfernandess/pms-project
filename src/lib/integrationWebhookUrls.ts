/**
 * URLs de webhooks recebidos pelo PMS (API Node vs Edge Supabase).
 * Manter alinhado com `server/README.md` e rotas em `server/src/routes`.
 */

export type IntegrationWebhookRow = {
  id: string;
  title: string;
  subtitle: string;
  method: "POST";
  /** URL na API Node (`VITE_PMS_API_URL`), quando configurada */
  nodeUrl: string | null;
  /** URL legada na Edge (`VITE_SUPABASE_URL`) */
  edgeUrl: string | null;
  /** Dica de query params ou corpo */
  notes?: string;
};

function trimBase(v: string | null | undefined): string | null {
  const t = (v ?? "").trim().replace(/\/+$/, "");
  return t || null;
}

/**
 * Lista webhooks de integração (Stripe, Aiosell, Channex).
 * `establishmentId` só afeta o exemplo de URL do Stripe no Node.
 */
export function getIntegrationWebhookRows(
  pmsApiUrl: string | null | undefined,
  supabaseUrl: string | null | undefined,
  establishmentId?: string | null,
): IntegrationWebhookRow[] {
  const node = trimBase(pmsApiUrl ?? null);
  const edge = trimBase(supabaseUrl ?? null);

  const stripeQuery = establishmentId
    ? `?establishment_id=${encodeURIComponent(establishmentId)}`
    : "?establishment_id=<uuid_do_estabelecimento>";

  return [
    {
      id: "stripe",
      title: "Stripe",
      subtitle: "Eventos de pagamento (ex.: payment_intent.succeeded)",
      method: "POST",
      nodeUrl: node ? `${node}/api/webhooks/stripe${stripeQuery}` : null,
      edgeUrl: edge ? `${edge}/functions/v1/stripe-webhook` : null,
      notes:
        "Na API Node, pode passar `establishment_id` na query ou no metadata do evento. Na Edge, use o fluxo e segredos já configurados no projeto Supabase.",
    },
    {
      id: "aiosell",
      title: "Aiosell — reservas",
      subtitle: "Webhook de reservas do canal Aiosell",
      method: "POST",
      nodeUrl: node ? `${node}/api/webhooks/aiosell-reservation` : null,
      edgeUrl: edge ? `${edge}/functions/v1/aiosell-reservation-webhook` : null,
      notes: "Autenticação: repasse os mesmos headers/segredos que o painel Aiosell envia (`x-aiosell-secret`, `Authorization`, etc.).",
    },
    {
      id: "channex",
      title: "Channex — reservas",
      subtitle: "Webhook de reservas / bookings (Channex)",
      method: "POST",
      nodeUrl: node ? `${node}/api/webhooks/channex-reservation` : null,
      edgeUrl: edge ? `${edge}/functions/v1/channex-reservation-webhook` : null,
      notes: "Pode incluir `property_id` na query quando aplicável. Headers como `user-api-key` são repassados à Edge.",
    },
  ];
}
