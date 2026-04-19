import { supabase } from "@/integrations/supabase/client";
import {
  buildTariffCategoryDateKeySet,
  eachDateInRangeInclusive,
} from "@/lib/channelTariffAvailabilityGuard";
import { toast } from "sonner";

const RATE_CALENDAR_PAGE_SIZE = 1000;

async function fetchAllRateCalendarForBukly(
  establishmentId: string,
  today: string,
  futureDateStr: string
) {
  const select = `
        *,
        pricing_plans (*),
        room_categories (*)
      `;
  const all: unknown[] = [];
  let offset = 0;
  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tipagem gerada incompleta para rate_calendar
    const { data, error } = await (supabase as any)
      .from("rate_calendar")
      .select(select)
      .eq("establishment_id", establishmentId)
      .gte("date", today)
      .lte("date", futureDateStr)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + RATE_CALENDAR_PAGE_SIZE - 1);
    if (error) return { data: null as unknown[] | null, error };
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < RATE_CALENDAR_PAGE_SIZE) break;
    offset += RATE_CALENDAR_PAGE_SIZE;
  }
  return { data: all, error: null };
}

/** Sincronização Bukly (tarifas, disponibilidade, restrições) — extraído para reutilização. */
export async function invokeBuklySync(
  channelId: string,
  establishmentId: string,
  opts?: { silent?: boolean }
) {
  const today = new Date().toISOString().split("T")[0];
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 365);
  const futureDateStr = futureDate.toISOString().split("T")[0];

  const { data: rateCalendar, error: rateError } = await fetchAllRateCalendarForBukly(
    establishmentId,
    today,
    futureDateStr
  );

  if (rateError) throw rateError;

  const { data: channelPricingRows } = await supabase
    .from("channel_pricing")
    .select("category_id")
    .eq("ota_channel_id", channelId)
    .eq("is_active", true);

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, category_id")
    .eq("establishment_id", establishmentId);

  if (roomsError) throw roomsError;

  const { data: reservations, error: reservationsError } = await supabase
    .from("reservations")
    .select("category_id, checkin_date, checkout_date, room_id")
    .eq("establishment_id", establishmentId)
    .in("status", ["pending", "confirmed", "checkedin"]);

  if (reservationsError) throw reservationsError;

  const rates: Array<{
    categoryId: string;
    categoryName?: string;
    planId: string;
    planCode?: string;
    date: string;
    basePrice: unknown;
    adultPrice: unknown;
    childPrice: unknown;
  }> = [];
  const availability: Array<{
    categoryId: string;
    date: string;
    available: number;
    total: number;
  }> = [];
  const restrictions: Array<{
    categoryId: string;
    planId: string;
    date: string;
    minLOS: unknown;
    cta: boolean;
    ctd: boolean;
    maxLOS: unknown;
  }> = [];

  const tariffCategoryDateKeys = buildTariffCategoryDateKeySet(
    (rateCalendar || []) as Array<{ category_id: string; date: string }>
  );
  const mappedCategoryIds = [
    ...new Set((channelPricingRows || []).map((r) => String(r.category_id ?? "").trim()).filter(Boolean)),
  ];
  const datesInWindow = eachDateInRangeInclusive(today, futureDateStr);

  const categoryDates = new Map<string, Set<string>>();
  (rateCalendar || []).forEach((rate: { category_id: string; date: string }) => {
    const key = rate.category_id;
    if (!categoryDates.has(key)) {
      categoryDates.set(key, new Set());
    }
    categoryDates.get(key)!.add(rate.date);
  });

  (rateCalendar || []).forEach((rate: Record<string, unknown>) => {
    const rc = rate.room_categories as { name?: string } | null | undefined;
    const pp = rate.pricing_plans as { code?: string } | null | undefined;
    rates.push({
      categoryId: rate.category_id as string,
      categoryName: rc?.name,
      planId: rate.pricing_plan_id as string,
      planCode: pp?.code,
      date: rate.date as string,
      basePrice: rate.base_price,
      adultPrice: rate.adult_price,
      childPrice: rate.child_price,
    });
  });

  categoryDates.forEach((dates, categoryId) => {
    const categoryRooms = rooms?.filter((r) => r.category_id === categoryId) || [];
    const totalRooms = categoryRooms.length;

    dates.forEach((date) => {
      const occupiedRooms =
        reservations?.filter((r) => {
          if (r.category_id !== categoryId) return false;
          const checkin = new Date(r.checkin_date);
          const checkout = new Date(r.checkout_date);
          const currentDate = new Date(date);
          return currentDate >= checkin && currentDate < checkout;
        }).length || 0;

      availability.push({
        categoryId,
        date,
        available: Math.max(0, totalRooms - occupiedRooms),
        total: totalRooms,
      });
    });
  });

  /** Datas sem linha em rate_calendar: disponibilidade 0 (só com tarifário parcial na janela). */
  if (tariffCategoryDateKeys.size > 0) {
    for (const categoryId of mappedCategoryIds) {
      const categoryRooms = rooms?.filter((r) => r.category_id === categoryId) || [];
      const totalRooms = categoryRooms.length;
      for (const date of datesInWindow) {
        if (tariffCategoryDateKeys.has(`${categoryId}|${date}`)) continue;
        availability.push({
          categoryId,
          date,
          available: 0,
          total: totalRooms,
        });
      }
    }
  }

  (rateCalendar || []).forEach((rate: Record<string, unknown>) => {
    const minLOS = rate.min_stay ?? rate.min_los;
    const maxLOS = rate.max_stay ?? rate.max_los;
    const cta = rate.closed_to_arrival ?? rate.cta;
    const ctd = rate.closed_to_departure ?? rate.ctd;
    if (minLOS || cta || ctd || maxLOS) {
      restrictions.push({
        categoryId: rate.category_id as string,
        planId: rate.pricing_plan_id as string,
        date: rate.date as string,
        minLOS,
        cta: !!cta,
        ctd: !!ctd,
        maxLOS,
      });
    }
  });

  const { data: channel, error: channelError } = await supabase
    .from("ota_channels")
    .select("*")
    .eq("id", channelId)
    .single();

  if (channelError || !channel) {
    throw new Error("Canal Bukly não encontrado");
  }

  const apiUrl = (channel.bukly_api_url as string) || "https://api.bukly.com.br";
  const hotelId = channel.bukly_hotel_id;
  const apiKey = channel.api_key;
  const apiSecret = channel.api_secret;

  if (!hotelId || !apiKey || !apiSecret) {
    throw new Error("Credenciais do Bukly não configuradas");
  }

  let syncLog: { id?: string } | null = null;
  try {
    const { data, error: logError } = await supabase
      .from("bukly_sync_logs")
      .insert({
        ota_channel_id: channelId,
        establishment_id: establishmentId,
        sync_type: "full",
        status: "pending",
        sync_data: { rates, availability, restrictions },
      })
      .select()
      .single();

    if (!logError) {
      syncLog = data;
    }
  } catch {
    console.warn("Tabela bukly_sync_logs não encontrada, continuando sem log");
  }

  try {
    await supabase
      .from("ota_channels")
      .update({
        bukly_sync_status: "syncing",
        sync_status: "syncing",
      })
      .eq("id", channelId);

    if (rates.length > 0) {
      const ratesResponse = await fetch(`${apiUrl}/api/rates`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey as string,
          "X-API-Secret": apiSecret as string,
          "X-Hotel-Id": hotelId as string,
        },
        body: JSON.stringify({
          hotelId,
          rates: rates.reduce((acc, rate) => {
            const key = `${rate.categoryId}_${rate.planId}`;
            if (!acc[key]) {
              acc[key] = {
                categoryId: rate.categoryId,
                categoryName: rate.categoryName,
                planId: rate.planId,
                planCode: rate.planCode,
                rates: [] as Array<{
                  date: string;
                  basePrice: unknown;
                  adultPrice: unknown;
                  childPrice: unknown;
                }>,
              };
            }
            acc[key].rates.push({
              date: rate.date,
              basePrice: rate.basePrice,
              adultPrice: rate.adultPrice,
              childPrice: rate.childPrice,
            });
            return acc;
          }, {} as Record<string, { categoryId: string; categoryName?: string; planId: string; planCode?: string; rates: Array<{ date: string; basePrice: unknown; adultPrice: unknown; childPrice: unknown }> }>),
        }),
      });

      if (!ratesResponse.ok) {
        const errorData = await ratesResponse.json().catch(() => ({}));
        throw new Error(
          (errorData as { message?: string }).message ||
            `Erro ao sincronizar tarifas: ${ratesResponse.statusText}`
        );
      }
    }

    if (availability.length > 0) {
      const availabilityResponse = await fetch(`${apiUrl}/api/availability`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey as string,
          "X-API-Secret": apiSecret as string,
          "X-Hotel-Id": hotelId as string,
        },
        body: JSON.stringify({
          hotelId,
          availability,
        }),
      });

      if (!availabilityResponse.ok) {
        const errorData = await availabilityResponse.json().catch(() => ({}));
        throw new Error(
          (errorData as { message?: string }).message ||
            `Erro ao sincronizar disponibilidade: ${availabilityResponse.statusText}`
        );
      }
    }

    if (restrictions.length > 0) {
      const restrictionsResponse = await fetch(`${apiUrl}/api/restrictions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey as string,
          "X-API-Secret": apiSecret as string,
          "X-Hotel-Id": hotelId as string,
        },
        body: JSON.stringify({
          hotelId,
          restrictions,
        }),
      });

      if (!restrictionsResponse.ok) {
        const errorData = await restrictionsResponse.json().catch(() => ({}));
        throw new Error(
          (errorData as { message?: string }).message ||
            `Erro ao sincronizar restrições: ${restrictionsResponse.statusText}`
        );
      }
    }

    if (syncLog?.id) {
      try {
        const totalRecords = rates.length + availability.length + restrictions.length;
        await supabase
          .from("bukly_sync_logs")
          .update({
            status: "success",
            records_synced: totalRecords,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);
      } catch {
        console.warn("Erro ao atualizar log de sincronização");
      }
    }

    const { data: updatedChannel, error: updateError } = await supabase
      .from("ota_channels")
      .update({
        bukly_last_sync_at: new Date().toISOString(),
        bukly_sync_status: "success",
        last_sync_at: new Date().toISOString(),
        sync_status: "success",
        sync_error: null,
      })
      .eq("id", channelId)
      .select()
      .single();

    if (updateError) throw updateError;

    if (!opts?.silent) {
      toast.success(
        `Sincronizadas ${rates.length} tarifas, ${availability.length} disponibilidades e ${restrictions.length} restrições com Bukly!`
      );
    }
    return updatedChannel;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (syncLog?.id) {
      try {
        await supabase
          .from("bukly_sync_logs")
          .update({
            status: "error",
            error_message: message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);
      } catch {
        console.warn("Erro ao atualizar log de sincronização");
      }
    }

    await supabase
      .from("ota_channels")
      .update({
        bukly_sync_status: "error",
        sync_status: "error",
        sync_error: message,
      })
      .eq("id", channelId);

    throw error;
  }
}
