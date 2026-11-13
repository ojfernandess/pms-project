/**
 * API otimizada para o sistema tarifário.
 * Endpoints: GET /rates/dashboard, GET /rates/map
 * Fallback: queries Supabase diretas quando o endpoint não está disponível.
 */

import { supabase } from "@/integrations/supabase/client";

const getFunctionUrl = (path: string) => {
  const base = import.meta.env.VITE_PMS_API_URL;
  if (!base) return null;
  return `${base}/functions/v1/${path}`;
};

/** Buscar token de sessão para Edge Functions */
const getAuthHeaders = async (): Promise<HeadersInit> => {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
};

export interface RatesDashboardResponse {
  categories: Array<{ id: string; name: string; base_price: number }>;
  ratePlans: Array<{
    id: string;
    name: string;
    code?: string;
    plan_type?: string;
    is_active: boolean;
  }>;
  planTypes: Array<{
    id: string;
    name: string;
    description?: string;
    color?: string;
    is_active: boolean;
  }>;
  hotelSettings: {
    rate_system_settings?: {
      auto_apply_dynamic_rules?: boolean | string;
      persist_dynamic_rates?: boolean | string;
    };
  } | null;
}

/** GET /rates/dashboard - agrega categories, ratePlans, planTypes, hotelSettings */
export async function fetchRatesDashboard(
  establishmentId: string
): Promise<RatesDashboardResponse | null> {
  const url = getFunctionUrl("rates-dashboard");
  if (!url) return null;

  try {
    const params = new URLSearchParams({ establishment_id: establishmentId });
    const headers = await getAuthHeaders();
    const response = await fetch(`${url}?${params}`, { headers });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export interface RatesMapResponse {
  rateCalendar: Array<{
    id: string;
    establishment_id: string;
    pricing_plan_id: string;
    category_id: string;
    date: string;
    base_price: number;
    adult_price?: number;
    child_price?: number;
    occupancy_percentage?: number;
    projected_occupancy?: number;
    pickup_rate?: number;
  }>;
}

/** POST /recalc-rates - recalcular preços dinâmicos em background */
export async function invokeRecalcRates(
  options?: { establishmentId?: string; daysAhead?: number }
): Promise<{ success: boolean; total_updated: number; error?: string }> {
  const url = getFunctionUrl("recalc-rates");
  if (!url) {
    return { success: false, total_updated: 0, error: "URL da função não configurada" };
  }

  try {
    const params = new URLSearchParams();
    if (options?.establishmentId) params.set("establishment_id", options.establishmentId);
    if (options?.daysAhead != null) params.set("days_ahead", String(options.daysAhead));

    const headers = await getAuthHeaders();
    const response = await fetch(`${url}?${params}`, {
      method: "POST",
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return {
        success: false,
        total_updated: 0,
        error: data?.error || `Erro ${response.status}`,
      };
    }

    return {
      success: data.success === true,
      total_updated: data.total_updated ?? 0,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro de conexão";
    return { success: false, total_updated: 0, error: msg };
  }
}

/** GET /rates/map - rate_calendar com filtros opcionais */
export async function fetchRatesMap(
  establishmentId: string,
  options?: { startDate?: string; endDate?: string }
): Promise<RatesMapResponse | null> {
  const url = getFunctionUrl("rates-map");
  if (!url) return null;

  try {
    const params = new URLSearchParams({ establishment_id: establishmentId });
    if (options?.startDate) params.set("start_date", options.startDate);
    if (options?.endDate) params.set("end_date", options.endDate);

    const headers = await getAuthHeaders();
    const response = await fetch(`${url}?${params}`, { headers });

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
