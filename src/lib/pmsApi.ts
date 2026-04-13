const apiBase = (import.meta.env.VITE_PMS_API_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

function buildUrl(path: string): string {
  if (!path.startsWith("/")) return apiBase ? `${apiBase}/${path}` : `/${path}`;
  return apiBase ? `${apiBase}${path}` : path;
}

export async function postPmsApi<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data?.error || "Erro na API PMS");
  }
  return data as T;
}

export async function postPmsApiAuth<T>(path: string, body: unknown, accessToken: string): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) {
    throw new Error(data?.error || "Erro na API PMS");
  }
  return data as T;
}
