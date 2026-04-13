/**
 * Gera uma Postman Collection v2.1 para a API pública da empresa (`company-public-api`).
 * A `apiUrl` pode ser o proxy no Node (`…/api/public/company-public-api`) ou a Edge no Supabase (`…/functions/v1/company-public-api`).
 * Variáveis da coleção: apiUrl, clientId, clientSecret, bookingId, roomId.
 */

export type CompanyPublicApiPostmanEndpoint = {
  title: string;
  description: string;
  method: "GET" | "POST";
  /** URL completa já montada (ex.: https://.../company-public-api?action=...) */
  fullUrl: string;
  /** Corpo JSON para POST; ignorado em GET */
  payloadExample?: string;
};

const POSTMAN_SCHEMA = "https://schema.getpostman.com/json/collection/v2.1.0/collection.json";

function authHeaders(): { key: string; value: string; type: string }[] {
  return [
    { key: "ClientId", value: "{{clientId}}", type: "text" },
    { key: "ClientSecret", value: "{{clientSecret}}", type: "text" },
  ];
}

function toPostmanRawUrl(fullUrl: string, endpointBase: string): string {
  let raw = fullUrl.replace(endpointBase, "{{apiUrl}}");
  if (raw.includes("room-clean-status")) {
    raw = raw.replace("{id}", "{{roomId}}");
  } else {
    raw = raw.replace("{id}", "{{bookingId}}");
  }
  return raw;
}

export function buildCompanyPublicApiPostmanCollectionV21(
  endpointBase: string,
  endpoints: CompanyPublicApiPostmanEndpoint[],
  credentials: { clientId: string; clientSecret: string },
): Record<string, unknown> {
  const variables = [
    { key: "apiUrl", value: endpointBase },
    { key: "clientId", value: credentials.clientId },
    { key: "clientSecret", value: credentials.clientSecret },
    { key: "bookingId", value: "" },
    { key: "roomId", value: "" },
  ];

  const item = endpoints.map((e) => {
    const rawUrl = toPostmanRawUrl(e.fullUrl, endpointBase);
    const request: Record<string, unknown> = {
      method: e.method,
      header: authHeaders(),
      url: rawUrl,
      description: e.description,
    };

    if (e.method === "POST" && e.payloadExample?.trim()) {
      request.body = {
        mode: "raw",
        raw: e.payloadExample.trim(),
        options: { raw: { language: "json" } },
      };
    }

    return { name: e.title, request };
  });

  return {
    info: {
      name: "PMS — API pública da empresa",
      description:
        "Coleção para a API pública `company-public-api` (ClientId / ClientSecret). A variável `apiUrl` deve ser a base completa: proxy PMS (`…/api/public/company-public-api`) ou Edge Supabase (`…/functions/v1/company-public-api`). Após importar, confira `clientId` e `clientSecret`. Para placeholders, use `bookingId` ou `roomId`.",
      schema: POSTMAN_SCHEMA,
    },
    variable: variables,
    item,
  };
}

export function downloadJsonFile(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
