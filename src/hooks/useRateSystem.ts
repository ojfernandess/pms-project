import { useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { fetchRatesMap } from "@/lib/ratesApi";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";
import { format, eachDayOfInterval, startOfDay, addDays } from "date-fns";
import { logActivity } from "@/lib/activityLogger";
import {
  getCalendarRange,
  MAX_DAYS_PER_REQUEST,
  MAX_TOTAL_DAYS_ALLOWED,
  getRequestQueue,
  getFromCache,
  setInCache,
  invalidateCalendarCache,
  createPerfMonitor,
  createDebouncedInvalidate,
  useStaggerPhase1,
  useStaggerPhase2,
} from "@/lib/rateSystem";
import {
  flushChannelSyncAfterBulkCalendarSave,
  flushChannelSyncNow,
  scheduleChannelSyncAfterRateEdit,
} from "@/lib/channelSyncAfterRates";

export interface RatePlan {
  id: string;
  name: string;
  code?: string;
  description?: string;
  plan_type?: string; // Agora é uma string que referencia pricing_plan_types.name
  base_plan_id?: string;
  base_plan_id_for_rate?: string; // DB column: plano base para Tarifa Base + Flutuação
  fluctuation_type?: 'percentage' | 'fixed' | null;
  fluctuation_value?: number | null;
  color?: string;
  is_active: boolean;
  sort_order?: number;
  created_at: string;
  updated_at: string;
}

export interface RateCalendarEntry {
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
  /** ARI / rate_calendar — usado por Channel Manager (ex.: Aiosell LOS) */
  min_stay?: number;
  max_stay?: number;
  closed_to_arrival?: boolean;
  closed_to_departure?: boolean;
  stop_sell_ota?: boolean;
  stop_sell_booking_engine?: boolean;
  sales_status?: string;
  /** Dias de antecedência (mínimo / máximo) para reserva — canal CM */
  min_advance_days?: number;
  max_advance_days?: number;
}

export interface DynamicPricingRule {
  id: string;
  establishment_id: string;
  name: string;
  description?: string;
  trigger_type: 'occupancy' | 'booking_velocity' | 'day_of_week' | 'advance_booking' | 'local_event' | 'custom';
  trigger_condition: any; // JSONB
  adjustment_type: 'percentage' | 'fixed' | 'multiplier';
  adjustment_value: number;
  priority: number;
  is_active: boolean;
  applicable_categories?: string[];
  applicable_plans?: string[];
  start_date?: string;
  end_date?: string;
  use_occupancy?: boolean;
  use_establishment_occupancy?: boolean;
  use_pickup_rate?: boolean;
  use_demand_history?: boolean;
}

export interface RateRestriction {
  id: string;
  establishment_id: string;
  restriction_type: 'stop_sell' | 'min_los' | 'max_los' | 'cta' | 'ctd' | 'closed_to_arrival' | 'closed_to_departure';
  pricing_plan_id?: string | null;
  category_id?: string | null;
  start_date: string;
  end_date: string;
  value?: number;
  notes?: string | null;
  is_active: boolean;
}

/** Postgres rejects "" for UUID columns; optional selects use "" in the UI. */
function sanitizeRateRestrictionPayload<T extends Partial<RateRestriction>>(r: T): T {
  const next = { ...r };
  if ("category_id" in next && typeof next.category_id === "string" && next.category_id.trim() === "") {
    (next as { category_id?: string | null }).category_id = null;
  }
  if ("pricing_plan_id" in next && typeof next.pricing_plan_id === "string" && next.pricing_plan_id.trim() === "") {
    (next as { pricing_plan_id?: string | null }).pricing_plan_id = null;
  }
  return next;
}

export interface UseRateSystemOptions {
  /** Período visível para fetch otimizado (rates-map enriquece só esse intervalo) */
  dateRange?: { start: Date; end: Date };
  /** Usar rate_calendar_summary (MV) para leituras - melhora performance em cenários complexos */
  useMaterializedView?: boolean;
}

const USE_RATE_CALENDAR_SUMMARY =
  import.meta.env.VITE_USE_RATE_CALENDAR_SUMMARY === "true" || import.meta.env.VITE_USE_RATE_CALENDAR_SUMMARY === "1";

function mapMvRowToEntry(row: Record<string, unknown>): RateCalendarEntry {
  const sales =
    (row.sales_status as string | undefined) ??
    (row.availability as string | undefined) ??
    "open";
  return {
    id: row.id as string,
    establishment_id: row.establishment_id as string,
    pricing_plan_id: (row.rate_plan_id ?? row.pricing_plan_id) as string,
    category_id: row.category_id as string,
    date: row.date as string,
    base_price: Number(row.final_price ?? row.base_price ?? 0),
    projected_occupancy: row.projected_occupancy as number | undefined,
    pickup_rate: row.pickup_rate as number | undefined,
    adult_price: row.adult_price as number | undefined,
    child_price: row.child_price as number | undefined,
    occupancy_percentage: row.occupancy_percentage as number | undefined,
    min_stay: row.min_stay != null ? Number(row.min_stay) : undefined,
    max_stay: row.max_stay != null ? Number(row.max_stay) : undefined,
    closed_to_arrival: Boolean(row.closed_to_arrival),
    closed_to_departure: Boolean(row.closed_to_departure),
    stop_sell_ota: Boolean(row.stop_sell_ota),
    stop_sell_booking_engine: Boolean(row.stop_sell_booking_engine),
    sales_status: sales,
    min_advance_days: row.min_advance_days != null ? Number(row.min_advance_days) : undefined,
    max_advance_days: row.max_advance_days != null ? Number(row.max_advance_days) : undefined,
  };
}

export const useRateSystem = (options?: UseRateSystemOptions) => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();

  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  const establishmentReady = !!selectedEstablishment?.id || !!getEstablishmentId();
  const enablePhase1 = useStaggerPhase1(establishmentReady);
  const enablePhase2 = useStaggerPhase2(establishmentReady);

  // Debounce invalidação do rate_calendar para evitar múltiplos reloads em sequência
  const debouncedCalendarInvalidate = useRef(
    createDebouncedInvalidate(() => {
      invalidateCalendarCache(getEstablishmentId() ?? undefined);
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
    }, 500)
  ).current;

  // Configuração de resiliência para queries tarifárias (retry, refetch automático)
  const rateQueryOptions = {
    retry: 3,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10000),
    refetchOnWindowFocus: true,
    staleTime: 60 * 1000, // 1 minuto
  };

  // ========== RATE SYSTEM SETTINGS (via queue) ==========
  const establishmentIdForSettings = selectedEstablishment?.id ?? getSelectedEstablishmentId();
  const rateSettingsQuery = useQuery({
    queryKey: ["rate_system_settings", establishmentIdForSettings],
    ...rateQueryOptions,
    queryFn: async () => {
      return getRequestQueue().addRequest(async () => {
        const id = establishmentIdForSettings || getEstablishmentId();
        if (!id) return null;
        const { data } = await supabase
          .from("hotel_settings")
          .select("rate_system_settings")
          .eq("establishment_id", id)
          .maybeSingle();
        return data?.rate_system_settings ?? null;
      });
    },
    enabled: !!establishmentIdForSettings,
  });

  const persistDynamicRates =
    rateSettingsQuery.data?.persist_dynamic_rates === true ||
    rateSettingsQuery.data?.persist_dynamic_rates === "true";

  const autoApplyDynamicRules =
    rateSettingsQuery.data?.auto_apply_dynamic_rules === true ||
    rateSettingsQuery.data?.auto_apply_dynamic_rules === "true";

  // ========== RATE PLANS (via queue) ==========
  const ratePlansQuery = useQuery({
    queryKey: ["rate_plans", selectedEstablishment?.id],
    ...rateQueryOptions,
    queryFn: async () => {
      return getRequestQueue().addRequest(async () => {
        const establishmentId = getEstablishmentId();
        let query = supabase
          .from("pricing_plans")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true });

        if (establishmentId) {
          query = query.eq("establishment_id", establishmentId);
        }

        const { data, error } = await query.range(0, 499);

        if (error) throw error;
        return (data || []) as RatePlan[];
      });
    },
  });

  const createRatePlan = useMutation({
    mutationFn: async (plan: Partial<RatePlan>) => {
      const establishmentId = getEstablishmentId();
      const { data, error } = await supabase
        .from("pricing_plans")
        .insert([{ ...plan, establishment_id: establishmentId }])
        .select()
        .single();

      if (error) throw error;
      
      // Registrar log de atividade
      await logActivity({
        actionType: "created",
        entityType: "pricing_plan",
        entityId: data.id,
        entityCode: data.code || data.name,
        description: `Plano tarifário "${data.name}" criado`,
        newValues: {
          name: data.name,
          code: data.code,
          plan_type: data.plan_type,
          is_active: data.is_active,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_plans"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Plano tarifário criado com sucesso!");
      scheduleChannelSyncAfterRateEdit(getEstablishmentId());
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar plano tarifário");
    },
  });

  const updateRatePlan = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<RatePlan>) => {
      const establishmentId = getEstablishmentId();
      const { data: oldData } = await supabase
        .from("pricing_plans")
        .select("*")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("pricing_plans")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      const baseOrFluctuationChanged =
        "base_plan_id_for_rate" in updates ||
        "fluctuation_type" in updates ||
        "fluctuation_value" in updates;
      const hasBasePlan = data?.base_plan_id_for_rate && (data?.fluctuation_type || data?.fluctuation_value != null);

      if (establishmentId && baseOrFluctuationChanged && hasBasePlan) {
        const basePlanId = data.base_plan_id_for_rate as string;
        const fType = data.fluctuation_type as "percentage" | "fixed" | null;
        const fVal = data.fluctuation_value as number | null;

        const { data: derivedEntries } = await supabase
          .from("rate_calendar")
          .select("id, category_id, date, establishment_id")
          .eq("establishment_id", establishmentId)
          .eq("pricing_plan_id", id);

        if (derivedEntries?.length) {
          const categoryDates = derivedEntries.map((e: { category_id: string; date: string }) => ({ category_id: e.category_id, date: e.date }));
          const categoryIds = [...new Set(categoryDates.map((c: { category_id: string }) => c.category_id))];
          const dates = [...new Set(categoryDates.map((c: { date: string }) => c.date))];

          const { data: baseEntries } = await supabase
            .from("rate_calendar")
            .select("category_id, date, base_price")
            .eq("establishment_id", establishmentId)
            .eq("pricing_plan_id", basePlanId)
            .in("category_id", categoryIds)
            .in("date", dates);

          const baseMap = new Map<string, number>();
          (baseEntries || []).forEach((e: { category_id: string; date: string; base_price: number }) => {
            baseMap.set(`${e.category_id}::${e.date}`, Number(e.base_price || 0));
          });

          const toUpsert: Partial<RateCalendarEntry>[] = [];
          for (const e of derivedEntries) {
            const basePrice = baseMap.get(`${e.category_id}::${e.date}`) ?? 0;
            if (basePrice <= 0) continue;
            let newPrice = basePrice;
            if (fType === "percentage" && fVal != null) newPrice = basePrice * (1 + fVal / 100);
            else if (fType === "fixed" && fVal != null) newPrice = basePrice + fVal;
            toUpsert.push({
              establishment_id: establishmentId,
              pricing_plan_id: id,
              category_id: e.category_id,
              date: e.date,
              base_price: Math.round(Math.max(0, newPrice) * 100) / 100,
            });
          }

          if (toUpsert.length > 0) {
            const chunkSize = 200;
            for (let i = 0; i < toUpsert.length; i += chunkSize) {
              const chunk = toUpsert.slice(i, i + chunkSize);
              await supabase.from("rate_calendar").upsert(chunk, {
                onConflict: "establishment_id,pricing_plan_id,category_id,date",
              });
            }
            invalidateCalendarCache(establishmentId);
            debouncedCalendarInvalidate();
          }
        }
      }

      await logActivity({
        actionType: "updated",
        entityType: "pricing_plan",
        entityId: data.id,
        entityCode: data.code || data.name,
        description: `Plano tarifário "${data.name}" atualizado`,
        oldValues: oldData ? {
          name: oldData.name,
          code: oldData.code,
          plan_type: oldData.plan_type,
          is_active: oldData.is_active,
        } : undefined,
        newValues: {
          name: data.name,
          code: data.code,
          plan_type: data.plan_type,
          is_active: data.is_active,
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_plans"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Plano tarifário atualizado com sucesso!");
      scheduleChannelSyncAfterRateEdit(getEstablishmentId());
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar plano tarifário");
    },
  });

  const deleteRatePlan = useMutation({
    mutationFn: async (id: string) => {
      // Buscar dados antes de deletar para o log
      const { data: oldData } = await supabase
        .from("pricing_plans")
        .select("*")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("pricing_plans")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      // Registrar log de atividade
      if (oldData) {
        await logActivity({
          actionType: "deleted",
          entityType: "pricing_plan",
          entityId: id,
          entityCode: oldData.code || oldData.name,
          description: `Plano tarifário "${oldData.name}" excluído`,
          oldValues: {
            name: oldData.name,
            code: oldData.code,
            plan_type: oldData.plan_type,
            is_active: oldData.is_active,
          },
        });
      }
    },
    onSuccess: () => {
      invalidateCalendarCache(getEstablishmentId() ?? undefined);
      queryClient.invalidateQueries({ queryKey: ["rate_plans"] });
      debouncedCalendarInvalidate();
      toast.success("Plano tarifário excluído com sucesso!");
      scheduleChannelSyncAfterRateEdit(getEstablishmentId());
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir plano tarifário");
    },
  });

  // ========== RATE CALENDAR ==========
  const dateRange = options?.dateRange;
  const { effectiveDateRange, exceedsLimit, exceedsMaxAllowed, chunks } = useMemo(() => {
    if (!dateRange?.start || !dateRange?.end) {
      return { effectiveDateRange: dateRange, exceedsLimit: false, exceedsMaxAllowed: false, chunks: [] as { start: Date; end: Date }[] };
    }
    const result = getCalendarRange(dateRange.start, dateRange.end);
    return {
      effectiveDateRange: { start: result.effective.start, end: result.effective.end },
      exceedsLimit: result.exceedsLimit,
      exceedsMaxAllowed: result.exceedsMaxAllowed,
      chunks: result.chunks,
    };
  }, [dateRange]);

  const rateCalendarQuery = useQuery({
    queryKey: [
      "rate_calendar",
      selectedEstablishment?.id,
      dateRange?.start?.toISOString?.()?.slice(0, 10),
      dateRange?.end?.toISOString?.()?.slice(0, 10),
      autoApplyDynamicRules,
    ],
    ...rateQueryOptions,
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      if (!effectiveDateRange || exceedsMaxAllowed || chunks.length === 0) return [];

      const perf = createPerfMonitor("rate_calendar");
      const queue = getRequestQueue();
      const PAGE_SIZE = 1000;

      const useMv = options?.useMaterializedView ?? USE_RATE_CALENDAR_SUMMARY;
      const tableName = useMv ? "rate_calendar_summary" : "rate_calendar";

      const fetchChunk = async (range: { start: Date; end: Date }): Promise<RateCalendarEntry[]> => {
        const cached = getFromCache<RateCalendarEntry[]>(establishmentId, range);
        if (cached) return cached;

        const startStr = format(range.start, "yyyy-MM-dd");
        const endStr = format(range.end, "yyyy-MM-dd");
        if (!useMv) {
          const apiData = await fetchRatesMap(establishmentId, { startDate: startStr, endDate: endStr });
          if (apiData?.rateCalendar?.length !== undefined) {
            setInCache(establishmentId, range, apiData.rateCalendar as RateCalendarEntry[]);
            return apiData.rateCalendar as RateCalendarEntry[];
          }
        }
        const allRows: RateCalendarEntry[] = [];
        let from = 0;
        let hasMore = true;
        while (hasMore) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rate_calendar_summary MV existe mas não está nos tipos gerados
          const { data, error } = await (supabase as any)
            .from(tableName)
            .select("*")
            .eq("establishment_id", establishmentId)
            .gte("date", startStr)
            .lte("date", endStr)
            .order("date", { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw error;
          const chunk = (data || []) as Record<string, unknown>[];
          const mapped = useMv ? chunk.map(mapMvRowToEntry) : (chunk as RateCalendarEntry[]);
          allRows.push(...mapped);
          hasMore = chunk.length >= PAGE_SIZE;
          from += PAGE_SIZE;
        }
        setInCache(establishmentId, range, allRows);
        return allRows;
      };

      const doFetch = async (): Promise<RateCalendarEntry[]> => {
        const merged: RateCalendarEntry[] = [];
        for (const chunk of chunks) {
          const rows = await fetchChunk(chunk);
          merged.push(...rows);
        }
        return merged;
      };

      try {
        const results = await queue.addRequest(doFetch);
        perf.finish(results.length);
        return results;
      } catch (err) {
        perf.finish(undefined, err instanceof Error ? err.message : "Unknown error");
        throw err;
      }
    },
    enabled: !!selectedEstablishment?.id && !!effectiveDateRange && !exceedsMaxAllowed && chunks.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const calendarExceedsLimit = exceedsLimit;
  const calendarExceedsMaxAllowed = exceedsMaxAllowed;

  useEffect(() => {
    if (calendarExceedsMaxAllowed) {
      toast.error(`Intervalo muito grande (máx. ${MAX_TOTAL_DAYS_ALLOWED} dias) — refine o período.`, { duration: 6000 });
    } else if (calendarExceedsLimit) {
      toast.warning(`Intervalo grande — carregando em lotes de ${MAX_DAYS_PER_REQUEST} dias.`, { duration: 4000 });
    }
  }, [calendarExceedsLimit, calendarExceedsMaxAllowed]);

  const getRateCalendarForPeriod = async (
    planId: string,
    categoryId: string,
    startDate: Date,
    endDate: Date
  ): Promise<RateCalendarEntry[]> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) return [];

    const allRows: RateCalendarEntry[] = [];
    let from = 0;
    const pageSize = 500;
    let hasMore = true;
    const startStr = format(startDate, "yyyy-MM-dd");
    const endStr = format(endDate, "yyyy-MM-dd");
    while (hasMore) {
      const { data, error } = await supabase
        .from("rate_calendar")
        .select("*")
        .eq("establishment_id", establishmentId)
        .eq("pricing_plan_id", planId)
        .eq("category_id", categoryId)
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const chunk = (data || []) as RateCalendarEntry[];
      allRows.push(...chunk);
      hasMore = chunk.length >= pageSize;
      from += pageSize;
    }
    return allRows;
  };

  // Buscar preço base da categoria (fallback quando não há entrada no rate_calendar)
  const getCategoryBasePrice = async (categoryId: string): Promise<number> => {
    const { data, error } = await supabase
      .from("room_categories")
      .select("base_price")
      .eq("id", categoryId)
      .single();

    if (error || !data) return 0;
    return Number(data.base_price || 0);
  };

  type RateUpdateSource = 'manual' | 'dynamic_rule' | 'system_recalc' | 'restriction' | 'channel_sync' | 'api_import';

  type UpsertRateCalendarInput =
    | Partial<RateCalendarEntry>[]
    | { entries: Partial<RateCalendarEntry>[]; update_source?: RateUpdateSource; skipSuccessToast?: boolean };

  const upsertRateCalendar = useMutation({
    mutationFn: async (input: UpsertRateCalendarInput) => {
      const entries = Array.isArray(input) ? input : input.entries;
      const updateSource = Array.isArray(input) ? 'manual' : (input.update_source ?? 'manual');
      const skipSuccessToast = !Array.isArray(input) && input.skipSuccessToast === true;

      const establishmentId = getEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      const entriesWithEstablishment = entries.map(entry => ({
        ...entry,
        establishment_id: establishmentId,
      }));

      const categoryIds = [...new Set(entries.map(e => e.category_id).filter(Boolean))];
      const planIds = [...new Set(entries.map(e => e.pricing_plan_id).filter(Boolean))];

      const { data, error } = await supabase
        .from("rate_calendar")
        .upsert(entriesWithEstablishment, {
          onConflict: "establishment_id,pricing_plan_id,category_id,date",
        })
        .select();

      if (error) throw error;
      
      // Registrar log em background (sem aguardar, não bloqueia resposta)
      const dates = [...new Set(entries.map(e => e.date))].sort();
      const dateRangeStr = dates.length > 0 ? (dates.length === 1 ? dates[0] : `${dates[0]} até ${dates[dates.length - 1]}`) : "";
      logActivity({
        actionType: "updated",
        entityType: "rate_calendar",
        description: `Tarifas atualizadas (${entries.length} entrada(s), ${dateRangeStr || 'N/A'})`,
        newValues: {
          entries_count: entries.length,
          date_range: dateRangeStr || "N/A",
        },
        metadata: {
          categories_count: categoryIds.length,
          plans_count: planIds.length,
          dates_count: dates.length,
          update_source: updateSource,
        },
      }).catch((logErr: unknown) => console.warn('[useRateSystem] Log em background falhou:', logErr));
      
      return data;
    },
    onSuccess: (_data, variables) => {
      invalidateCalendarCache(getEstablishmentId() ?? undefined);
      debouncedCalendarInvalidate();
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      if (USE_RATE_CALENDAR_SUMMARY) {
        void (async () => {
          try {
            await (supabase.rpc as (name: string) => Promise<unknown>)("refresh_rate_calendar_summary");
          } catch (err) {
            console.warn("[useRateSystem] refresh_rate_calendar_summary falhou:", err);
          }
        })();
      }
      const skipToast = !Array.isArray(variables) && (variables as { skipSuccessToast?: boolean }).skipSuccessToast;
      const updateSource = Array.isArray(variables) ? 'manual' : (variables as { update_source?: RateUpdateSource }).update_source ?? 'manual';
      if (updateSource === 'manual' && !skipToast) {
        toast.success("Tarifário atualizado");
      }
      if (updateSource !== "channel_sync") {
        const entries = Array.isArray(variables)
          ? variables
          : (variables as { entries: Partial<RateCalendarEntry>[] }).entries;
        const estId = getEstablishmentId();
        // Uma linha = célula: envio imediato. Várias linhas no mesmo upsert = mesmo padrão que bulkUpdateRates (debounce curto), não o debounce longo de 1,2s (parecia que o CM só atualizava em operações «grandes»).
        if (entries.length === 1) {
          flushChannelSyncNow(estId);
        } else {
          flushChannelSyncAfterBulkCalendarSave(estId);
        }
      }
    },
    onError: (error: unknown) => {
      toast.error(error instanceof Error ? error.message : "Erro ao atualizar tarifas");
    },
  });

  const bulkUpdateRates = useMutation({
    mutationFn: async ({
      planId,
      categoryId,
      startDate,
      endDate,
      adjustmentType,
      adjustmentValue,
    }: {
      planId: string;
      categoryId: string;
      startDate: Date;
      endDate: Date;
      adjustmentType: 'percentage' | 'fixed' | 'replace';
      adjustmentValue: number;
    }): Promise<any> => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      // Buscar tarifas existentes
      const existingRates = await getRateCalendarForPeriod(planId, categoryId, startDate, endDate);
      
      // Buscar preço base da categoria (fallback)
      const categoryBasePrice = await getCategoryBasePrice(categoryId);
      
      const dates = eachDayOfInterval({ start: startDate, end: endDate });

      const entries: Partial<RateCalendarEntry>[] = dates.map(date => {
        const dateStr = format(date, "yyyy-MM-dd");
        const existing = existingRates.find(r => r.date === dateStr);
        
        // Usar preço existente ou preço base da categoria
        let currentPrice: number;
        if (existing && existing.base_price && Number(existing.base_price) > 0) {
          currentPrice = Number(existing.base_price);
        } else {
          currentPrice = categoryBasePrice || 0;
        }

        let newPrice = currentPrice;

        if (adjustmentType === 'percentage') {
          newPrice = currentPrice * (1 + adjustmentValue / 100);
        } else if (adjustmentType === 'fixed') {
          newPrice = currentPrice + adjustmentValue;
        } else if (adjustmentType === 'replace') {
          newPrice = adjustmentValue;
        }

        return {
          pricing_plan_id: planId,
          category_id: categoryId,
          date: dateStr,
          base_price: Math.max(0, newPrice),
        };
      });

      // Usar upsert diretamente ao invés de mutation
      const entriesWithEstablishment = entries.map(entry => ({
        ...entry,
        establishment_id: establishmentId,
      }));

      const { data, error } = await supabase
        .from("rate_calendar")
        .upsert(entriesWithEstablishment, {
          onConflict: "establishment_id,pricing_plan_id,category_id,date",
        })
        .select();

      if (error) throw error;
      
      // Buscar informações para o log
      const { data: category } = await supabase
        .from("room_categories")
        .select("name")
        .eq("id", categoryId)
        .single();
      
      const { data: plan } = await supabase
        .from("pricing_plans")
        .select("name, code")
        .eq("id", planId)
        .single();
      
      // Registrar log de atividade
      await logActivity({
        actionType: "bulk_updated",
        entityType: "rate_calendar",
        description: `Tarifas atualizadas em lote: ${category?.name || categoryId} - ${plan?.code || plan?.name || planId} (${format(startDate, "dd/MM/yyyy")} até ${format(endDate, "dd/MM/yyyy")})`,
        newValues: {
          adjustment_type: adjustmentType,
          adjustment_value: adjustmentValue,
          category: category?.name,
          plan: plan?.code || plan?.name,
          date_range: `${format(startDate, "dd/MM/yyyy")} até ${format(endDate, "dd/MM/yyyy")}`,
          entries_count: entries.length,
        },
        metadata: {
          category_id: categoryId,
          plan_id: planId,
          start_date: format(startDate, "yyyy-MM-dd"),
          end_date: format(endDate, "yyyy-MM-dd"),
        },
      });
      
      invalidateCalendarCache(establishmentId);
      debouncedCalendarInvalidate();
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      if (USE_RATE_CALENDAR_SUMMARY) {
        void (async () => {
          try {
            await (supabase.rpc as (name: string) => Promise<unknown>)("refresh_rate_calendar_summary");
          } catch (err) {
            console.warn("[useRateSystem] refresh_rate_calendar_summary falhou:", err);
          }
        })();
      }
      toast.success("Tarifas atualizadas com sucesso!");
      flushChannelSyncAfterBulkCalendarSave(getEstablishmentId());
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar tarifas");
    },
  });

  // ========== DYNAMIC RULES (Phase 1 - carrega após 400ms) ==========
  const dynamicRulesQuery = useQuery({
    queryKey: ["dynamic_pricing_rules", selectedEstablishment?.id],
    ...rateQueryOptions,
    enabled: enablePhase1,
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      return getRequestQueue().addRequest(async () => {
        const perf = createPerfMonitor("dynamic_pricing_rules");
        try {
          const allData: DynamicPricingRule[] = [];
          let from = 0;
          const pageSize = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from("dynamic_pricing_rules")
              .select("*")
              .eq("establishment_id", establishmentId)
              .order("priority", { ascending: true })
              .order("created_at", { ascending: false })
              .range(from, from + pageSize - 1);
            if (error) {
              perf.finish(undefined, error.message);
              throw error;
            }
            allData.push(...((data || []) as DynamicPricingRule[]));
            hasMore = (data?.length ?? 0) >= pageSize;
            from += pageSize;
          }
          perf.finish(allData.length);
          return allData;
        } catch (e) {
          perf.finish(undefined, e instanceof Error ? e.message : "Unknown");
          throw e;
        }
      });
    },
  });

  const createDynamicRule = useMutation({
    mutationFn: async (rule: Partial<DynamicPricingRule>) => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      const { data, error } = await supabase
        .from("dynamic_pricing_rules")
        .insert([{ ...rule, establishment_id: establishmentId }])
        .select()
        .single();

      if (error) throw error;
      
      // Registrar log de atividade
      await logActivity({
        actionType: "created",
        entityType: "dynamic_pricing_rule",
        entityId: data.id,
        entityCode: data.name,
        description: `Regra dinâmica "${data.name}" criada`,
        newValues: {
          name: data.name,
          trigger_type: data.trigger_type,
          adjustment_type: data.adjustment_type,
          adjustment_value: data.adjustment_value,
          priority: data.priority,
          is_active: data.is_active,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      invalidateCalendarCache(getEstablishmentId() ?? undefined);
      queryClient.invalidateQueries({ queryKey: ["dynamic_pricing_rules"] });
      debouncedCalendarInvalidate();
      queryClient.invalidateQueries({ queryKey: ["hotel_settings_rate_system"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Regra dinâmica criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar regra dinâmica");
    },
  });

  const updateDynamicRule = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<DynamicPricingRule>) => {
      // Buscar valores antigos antes de atualizar
      const { data: oldData } = await supabase
        .from("dynamic_pricing_rules")
        .select("*")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("dynamic_pricing_rules")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      
      // Registrar log de atividade
      await logActivity({
        actionType: "updated",
        entityType: "dynamic_pricing_rule",
        entityId: data.id,
        entityCode: data.name,
        description: `Regra dinâmica "${data.name}" atualizada`,
        oldValues: oldData ? {
          name: oldData.name,
          trigger_type: oldData.trigger_type,
          adjustment_type: oldData.adjustment_type,
          adjustment_value: oldData.adjustment_value,
          priority: oldData.priority,
          is_active: oldData.is_active,
        } : undefined,
        newValues: {
          name: data.name,
          trigger_type: data.trigger_type,
          adjustment_type: data.adjustment_type,
          adjustment_value: data.adjustment_value,
          priority: data.priority,
          is_active: data.is_active,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      invalidateCalendarCache(getEstablishmentId() ?? undefined);
      queryClient.invalidateQueries({ queryKey: ["dynamic_pricing_rules"] });
      debouncedCalendarInvalidate();
      queryClient.invalidateQueries({ queryKey: ["hotel_settings_rate_system"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Regra dinâmica atualizada com sucesso!");
      scheduleChannelSyncAfterRateEdit(getEstablishmentId());
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar regra dinâmica");
    },
  });

  const deleteDynamicRule = useMutation({
    mutationFn: async (id: string) => {
      // Buscar dados antes de deletar para o log
      const { data: oldData } = await supabase
        .from("dynamic_pricing_rules")
        .select("*")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("dynamic_pricing_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      // Registrar log de atividade
      if (oldData) {
        await logActivity({
          actionType: "deleted",
          entityType: "dynamic_pricing_rule",
          entityId: id,
          entityCode: oldData.name,
          description: `Regra dinâmica "${oldData.name}" excluída`,
          oldValues: {
            name: oldData.name,
            trigger_type: oldData.trigger_type,
            adjustment_type: oldData.adjustment_type,
            adjustment_value: oldData.adjustment_value,
            priority: oldData.priority,
            is_active: oldData.is_active,
          },
        });
      }
    },
    onSuccess: () => {
      invalidateCalendarCache(getEstablishmentId() ?? undefined);
      queryClient.invalidateQueries({ queryKey: ["dynamic_pricing_rules"] });
      debouncedCalendarInvalidate();
      queryClient.invalidateQueries({ queryKey: ["hotel_settings_rate_system"] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Regra dinâmica excluída com sucesso!");
      scheduleChannelSyncAfterRateEdit(getEstablishmentId());
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir regra dinâmica");
    },
  });

  // ========== RESTRICTIONS (Phase 2 - carrega após 700ms) ==========
  const restrictionsQuery = useQuery({
    queryKey: ["rate_restrictions", selectedEstablishment?.id],
    ...rateQueryOptions,
    enabled: enablePhase2,
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      return getRequestQueue().addRequest(async () => {
        const perf = createPerfMonitor("rate_restrictions");
        try {
          const allData: RateRestriction[] = [];
          let from = 0;
          const pageSize = 1000;
          let hasMore = true;
          while (hasMore) {
            const { data, error } = await supabase
              .from("rate_restrictions")
              .select("*")
              .eq("establishment_id", establishmentId)
              .order("start_date", { ascending: true })
              .range(from, from + pageSize - 1);
            if (error) {
              perf.finish(undefined, error.message);
              throw error;
            }
            allData.push(...((data || []) as RateRestriction[]));
            hasMore = (data?.length ?? 0) >= pageSize;
            from += pageSize;
          }
          perf.finish(allData.length);
          return allData;
        } catch (e) {
          perf.finish(undefined, e instanceof Error ? e.message : "Unknown");
          throw e;
        }
      });
    },
  });

  const createRestriction = useMutation({
    mutationFn: async (restriction: Partial<RateRestriction>) => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      const row = sanitizeRateRestrictionPayload({
        ...restriction,
        establishment_id: establishmentId,
      });

      const { data, error } = await supabase
        .from("rate_restrictions")
        .insert([row])
        .select()
        .single();

      if (error) throw error;
      
      // Registrar log de atividade
      await logActivity({
        actionType: "created",
        entityType: "rate_restriction",
        entityId: data.id,
        description: `Restrição de tarifa criada: ${data.restriction_type} (${format(new Date(data.start_date), "dd/MM/yyyy")} até ${format(new Date(data.end_date), "dd/MM/yyyy")})`,
        newValues: {
          restriction_type: data.restriction_type,
          start_date: data.start_date,
          end_date: data.end_date,
          value: data.value,
          is_active: data.is_active,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      invalidateCalendarCache(getEstablishmentId() ?? undefined);
      queryClient.invalidateQueries({ queryKey: ["rate_restrictions"] });
      debouncedCalendarInvalidate();
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Restrição criada com sucesso!");
      scheduleChannelSyncAfterRateEdit(getEstablishmentId());
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar restrição");
    },
  });

  const updateRestriction = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<RateRestriction>) => {
      // Buscar valores antigos antes de atualizar
      const { data: oldData } = await supabase
        .from("rate_restrictions")
        .select("*")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("rate_restrictions")
        .update(sanitizeRateRestrictionPayload(updates))
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      
      // Registrar log de atividade
      await logActivity({
        actionType: "updated",
        entityType: "rate_restriction",
        entityId: data.id,
        description: `Restrição de tarifa atualizada: ${data.restriction_type} (${format(new Date(data.start_date), "dd/MM/yyyy")} até ${format(new Date(data.end_date), "dd/MM/yyyy")})`,
        oldValues: oldData ? {
          restriction_type: oldData.restriction_type,
          start_date: oldData.start_date,
          end_date: oldData.end_date,
          value: oldData.value,
          is_active: oldData.is_active,
        } : undefined,
        newValues: {
          restriction_type: data.restriction_type,
          start_date: data.start_date,
          end_date: data.end_date,
          value: data.value,
          is_active: data.is_active,
        },
      });
      
      return data;
    },
    onSuccess: () => {
      invalidateCalendarCache(getEstablishmentId() ?? undefined);
      queryClient.invalidateQueries({ queryKey: ["rate_restrictions"] });
      debouncedCalendarInvalidate();
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Restrição atualizada com sucesso!");
      scheduleChannelSyncAfterRateEdit(getEstablishmentId());
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar restrição");
    },
  });

  const deleteRestriction = useMutation({
    mutationFn: async (id: string) => {
      // Buscar dados antes de deletar para o log
      const { data: oldData } = await supabase
        .from("rate_restrictions")
        .select("*")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("rate_restrictions")
        .delete()
        .eq("id", id);

      if (error) throw error;
      
      // Registrar log de atividade
      if (oldData) {
        await logActivity({
          actionType: "deleted",
          entityType: "rate_restriction",
          entityId: id,
          description: `Restrição de tarifa excluída: ${oldData.restriction_type} (${format(new Date(oldData.start_date), "dd/MM/yyyy")} até ${format(new Date(oldData.end_date), "dd/MM/yyyy")})`,
          oldValues: {
            restriction_type: oldData.restriction_type,
            start_date: oldData.start_date,
            end_date: oldData.end_date,
            value: oldData.value,
            is_active: oldData.is_active,
          },
        });
      }
    },
    onSuccess: () => {
      invalidateCalendarCache(getEstablishmentId() ?? undefined);
      queryClient.invalidateQueries({ queryKey: ["rate_restrictions"] });
      debouncedCalendarInvalidate();
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      toast.success("Restrição excluída com sucesso!");
      scheduleChannelSyncAfterRateEdit(getEstablishmentId());
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir restrição");
    },
  });

  // ========== CALCULATE PRICE ==========
  const calculateRatePrice = async (
    categoryId: string,
    planId: string,
    date: Date,
    adults: number = 1,
    children: number = 0,
    useEdgeFunction: boolean = false,
    retryCount: number = 0
  ): Promise<number> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) return 0;

    // Limitar número de tentativas (retry para erros QUIC/rede transitórios)
    const MAX_RETRIES = 2;

    // Se useEdgeFunction for true, usar Edge Function
    if (useEdgeFunction) {
      try {
        const result = await applyDynamicPricingRules(categoryId, planId, date, adults, children);
        return result.final_price;
      } catch (error) {
        console.error("Erro ao usar Edge Function, usando fallback:", error);
        // Fallback para função PostgreSQL apenas se não exceder retries
        if (retryCount < MAX_RETRIES) {
          return calculateRatePrice(categoryId, planId, date, adults, children, false, retryCount + 1);
        }
        return 0;
      }
    }

    // Usar função PostgreSQL (padrão)
    try {
      const { data, error } = await supabase.rpc("calculate_rate_price", {
        p_establishment_id: establishmentId,
        p_category_id: categoryId,
        p_pricing_plan_id: planId,
        p_date: format(date, "yyyy-MM-dd"),
        p_adults: adults,
        p_children: children,
      });

      if (error) {
        const isNetworkError = 
          error.message?.includes("CORS") || 
          error.message?.includes("Failed to fetch") || 
          error.message?.includes("ERR_INSUFFICIENT_RESOURCES") ||
          error.message?.includes("ERR_QUIC_PROTOCOL_ERROR") ||
          error.code === "PGRST301";

        if (isNetworkError && retryCount < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 300 * (retryCount + 1)));
          return calculateRatePrice(categoryId, planId, date, adults, children, false, retryCount + 1);
        }
        if (isNetworkError) {
          try {
            const { data: categoryData } = await supabase
              .from("room_categories")
              .select("base_price")
              .eq("id", categoryId)
              .maybeSingle();
            if (categoryData?.base_price) return Number(categoryData.base_price);
          } catch (e) { /* fallback */ }
        }
        return 0;
      }

      return Number(data || 0);
    } catch (fetchError: any) {
      const isNetworkError = 
        fetchError?.message?.includes("Failed to fetch") || 
        fetchError?.message?.includes("CORS") || 
        fetchError?.message?.includes("502") ||
        fetchError?.message?.includes("ERR_INSUFFICIENT_RESOURCES") ||
        fetchError?.message?.includes("ERR_QUIC_PROTOCOL_ERROR") ||
        fetchError?.code === "PGRST301";

      if (isNetworkError && retryCount < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 300 * (retryCount + 1)));
        return calculateRatePrice(categoryId, planId, date, adults, children, false, retryCount + 1);
      }
      if (isNetworkError) {
        try {
          const { data: categoryData } = await supabase
            .from("room_categories")
            .select("base_price")
            .eq("id", categoryId)
            .maybeSingle();
          if (categoryData?.base_price) return Number(categoryData.base_price);
        } catch (e) { /* fallback */ }
      }
      return 0;
    }
  };

  // Função para aplicar regras dinâmicas via Edge Function (com informações detalhadas)
  const applyDynamicPricingRules = async (
    categoryId: string,
    planId: string,
    date: Date | string,
    adults: number = 1,
    children: number = 0
  ): Promise<{
    final_price: number;
    base_price: number;
    adjustments_applied: Array<{
      rule_id: string;
      rule_name: string;
      adjustment_type: string;
      adjustment_value: number;
      final_adjustment: number;
    }>;
    auto_apply_enabled: boolean;
    metrics?: {
      occupancy: number;
      pickup_rate: number;
      has_local_event: boolean;
      event_impact: number;
    };
  }> => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) {
      throw new Error("Establishment ID não encontrado");
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!supabaseUrl) {
      throw new Error("VITE_SUPABASE_URL não configurado");
    }

    const functionUrl = `${supabaseUrl}/functions/v1/apply-dynamic-pricing-rules`;
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": session ? `Bearer ${session.access_token}` : "",
      },
      body: JSON.stringify({
        establishment_id: establishmentId,
        category_id: categoryId,
        pricing_plan_id: planId,
        date: format(date, "yyyy-MM-dd"),
        adults,
        children,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Erro desconhecido" }));
      throw new Error(errorData.error || `Erro ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  };

  return {
    // Rate Plans
    ratePlans: ratePlansQuery.data || [],
    isLoadingRatePlans: ratePlansQuery.isLoading,
    createRatePlan: createRatePlan.mutateAsync,
    updateRatePlan: updateRatePlan.mutateAsync,
    deleteRatePlan: deleteRatePlan.mutateAsync,

    // Rate Calendar
    rateCalendar: rateCalendarQuery.data || [],
    isLoadingCalendar: rateCalendarQuery.isLoading,
    getRateCalendarForPeriod,
    upsertRateCalendar: upsertRateCalendar.mutateAsync,
    bulkUpdateRates: bulkUpdateRates.mutateAsync,

    // Dynamic Rules
    dynamicRules: dynamicRulesQuery.data || [],
    isLoadingRules: dynamicRulesQuery.isLoading,
    createDynamicRule: createDynamicRule.mutateAsync,
    updateDynamicRule: updateDynamicRule.mutateAsync,
    deleteDynamicRule: deleteDynamicRule.mutateAsync,

    // Restrictions
    restrictions: restrictionsQuery.data || [],
    isLoadingRestrictions: restrictionsQuery.isLoading,
    createRestriction: createRestriction.mutateAsync,
    updateRestriction: updateRestriction.mutateAsync,
    deleteRestriction: deleteRestriction.mutateAsync,

    // Calculate Price
    calculateRatePrice,
    applyDynamicPricingRules,

    // Loading states
    isLoading: ratePlansQuery.isLoading || rateCalendarQuery.isLoading || dynamicRulesQuery.isLoading || restrictionsQuery.isLoading,
    
    // Settings
    persistDynamicRates,
    autoApplyDynamicRules,

    // Refetch functions
    refetch: () => {
      ratePlansQuery.refetch();
      rateCalendarQuery.refetch();
      dynamicRulesQuery.refetch();
      restrictionsQuery.refetch();
      rateSettingsQuery.refetch();
    },

    // Limite de intervalo
    calendarExceedsLimit,
    calendarExceedsMaxAllowed,
    maxCalendarDays: MAX_DAYS_PER_REQUEST,
    maxTotalDaysAllowed: MAX_TOTAL_DAYS_ALLOWED,
  };
};

// Hook para buscar recomendações de preços
export const useRateRecommendations = (startDate: Date, endDate: Date, categoryId?: string, featureEnabled: boolean = true) => {
  const { selectedEstablishment } = useEstablishment();
  
  return useQuery({
    queryKey: ["rate_recommendations", selectedEstablishment?.id, startDate, endDate, categoryId],
    queryFn: async () => {
      if (!selectedEstablishment?.id) return [];

      const { data, error } = await supabase.rpc('generate_rate_recommendations', {
        p_establishment_id: selectedEstablishment.id,
        p_start_date: format(startDate, 'yyyy-MM-dd'),
        p_end_date: format(endDate, 'yyyy-MM-dd'),
        p_category_id: categoryId || null,
      });

      if (error) {
        console.error('Erro ao buscar recomendações:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!selectedEstablishment?.id && featureEnabled,
  });
};

// Função para aplicar preço sugerido de uma recomendação
export const applyRecommendationPrice = async (
  establishmentId: string,
  categoryId: string,
  pricingPlanId: string,
  date: Date,
  suggestedPrice: number
): Promise<{ success: boolean; action: string; price: number; date: string }> => {
  if (!establishmentId) {
    throw new Error('Estabelecimento não selecionado');
  }

  if (!categoryId) {
    throw new Error('Categoria não selecionada');
  }

  if (!pricingPlanId) {
    throw new Error('Plano tarifário não selecionado');
  }

  const { data, error } = await supabase.rpc('apply_recommendation_price', {
    p_establishment_id: establishmentId,
    p_category_id: categoryId,
    p_pricing_plan_id: pricingPlanId,
    p_date: format(date, 'yyyy-MM-dd'),
    p_suggested_price: suggestedPrice,
  });

  if (error) {
    console.error('Erro ao aplicar preço sugerido:', error);
    throw new Error(`Erro ao aplicar preço sugerido: ${error.message}`);
  }

  // A função agora retorna JSONB com {success: boolean, error?: string, action?: string}
  if (!data || typeof data !== 'object') {
    throw new Error('Resposta inválida do servidor');
  }

  const result = data as { success: boolean; error?: string; action?: string };

  if (!result.success) {
    const errorMessage = result.error || 'Falha ao aplicar preço sugerido. Verifique os dados e tente novamente.';
    throw new Error(errorMessage);
  }

  // Retornar informações sobre a ação realizada
  return {
    success: true,
    action: result.action || 'applied',
    price: suggestedPrice,
    date: format(date, 'yyyy-MM-dd'),
  };
};

