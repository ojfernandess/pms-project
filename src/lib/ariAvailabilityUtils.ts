import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

/**
 * Converte string YYYY-MM-DD em Date local (evita bug de timezone: new Date("YYYY-MM-DD") = UTC)
 */
export const parseLocalDate = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Verifica se uma data está disponível para venda considerando status ARI
 */
export const checkDateAvailabilityForSale = async (
  establishmentId: string,
  categoryId: string,
  date: Date,
  channel: 'booking_engine' | 'ota' | 'all' = 'booking_engine'
): Promise<{ available: boolean; reason?: string; status?: string }> => {
  try {
    const { data, error } = await supabase.rpc('is_date_available_for_sale', {
      p_establishment_id: establishmentId,
      p_category_id: categoryId,
      p_date: format(date, 'yyyy-MM-dd'),
      p_channel: channel,
    });

    if (error) {
      console.error('Erro ao verificar disponibilidade ARI:', error);
      // Em caso de erro, NÃO permitir venda (fail closed — evita reserva indevida)
      return { available: false };
    }

    if (!data) {
      return { available: false, reason: 'Data não disponível para venda', status: 'closed' };
    }

    return { available: data, reason: data ? undefined : 'Data fechada para venda', status: data ? 'open' : 'closed' };
  } catch (error) {
    console.error('Erro ao verificar disponibilidade ARI:', error);
    // Em caso de erro, NÃO permitir venda (fail closed — evita reserva indevida)
    return { available: false };
  }
};

/**
 * Verifica se um período está disponível para venda
 */
export const checkPeriodAvailabilityForSale = async (
  establishmentId: string,
  categoryId: string,
  checkinDate: Date,
  checkoutDate: Date,
  channel: 'booking_engine' | 'ota' | 'all' = 'booking_engine'
): Promise<{ available: boolean; reason?: string; blockedDates?: Date[] }> => {
  const dates: Date[] = [];
  const current = new Date(checkinDate);
  const end = new Date(checkoutDate);

  // Gerar todas as datas do período (checkin até checkout-1)
  while (current < end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const blockedDates: Date[] = [];

  // Verificar datas em paralelo (com limite) — evita N round-trips sequenciais no motor
  const DATE_CHECK_CONCURRENCY = 8;
  for (let i = 0; i < dates.length; i += DATE_CHECK_CONCURRENCY) {
    const chunk = dates.slice(i, i + DATE_CHECK_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (date) => {
        const check = await checkDateAvailabilityForSale(
          establishmentId,
          categoryId,
          date,
          channel
        );
        return { date, available: check.available };
      })
    );
    for (const { date, available } of chunkResults) {
      if (!available) blockedDates.push(date);
    }
  }

  if (blockedDates.length > 0) {
    return {
      available: false,
      reason: `Período contém ${blockedDates.length} ${blockedDates.length === 1 ? 'data fechada' : 'datas fechadas'} para venda`,
      blockedDates,
    };
  }

  return { available: true };
};

/**
 * Verifica inventário disponível para uma data
 */
export const checkInventoryAvailability = async (
  establishmentId: string,
  categoryId: string,
  date: Date,
  requiredRooms: number = 1
): Promise<{ available: boolean; availableRooms: number; reason?: string }> => {
  try {
    // Usar .maybeSingle() ao invés de .single() para evitar erro 406 quando não há dados
    const { data, error } = await supabase
      .from('rate_inventory')
      .select('available_rooms, total_rooms, confirmed_reservations')
      .eq('establishment_id', establishmentId)
      .eq('category_id', categoryId)
      .eq('date', format(date, 'yyyy-MM-dd'))
      .maybeSingle();

    // Se houver erro que não seja "no rows", logar e usar fallback
    if (error) {
      // PGRST116 = no rows returned (isso é OK, vamos calcular)
      if (error.code === 'PGRST116' || error.code === 'PGRST200') {
        // Não há dados, calcular automaticamente
      } else {
        console.error('Erro ao buscar inventário:', error);
        // Tentar calcular automaticamente mesmo com erro
      }
      
      // Calcular automaticamente se não houver entrada
      const { data: calculated, error: calcError } = await supabase.rpc('calculate_category_availability', {
        p_establishment_id: establishmentId,
        p_category_id: categoryId,
        p_date: format(date, 'yyyy-MM-dd'),
      });

      if (!calcError && calculated) {
        const availableRooms = calculated.available_rooms || 0;
        return {
          available: availableRooms >= requiredRooms,
          availableRooms,
          reason: availableRooms < requiredRooms ? `Apenas ${availableRooms} ${availableRooms === 1 ? 'quarto disponível' : 'quartos disponíveis'}` : undefined,
        };
      }

      // Fallback: assumir disponível
      return { available: true, availableRooms: requiredRooms };
    }

    // Se não houver dados, calcular automaticamente
    if (!data) {
      const { data: calculated, error: calcError } = await supabase.rpc('calculate_category_availability', {
        p_establishment_id: establishmentId,
        p_category_id: categoryId,
        p_date: format(date, 'yyyy-MM-dd'),
      });

      if (!calcError && calculated) {
        const availableRooms = calculated.available_rooms || 0;
        return {
          available: availableRooms >= requiredRooms,
          availableRooms,
          reason: availableRooms < requiredRooms ? `Apenas ${availableRooms} ${availableRooms === 1 ? 'quarto disponível' : 'quartos disponíveis'}` : undefined,
        };
      }

      // Fallback: assumir disponível
      return { available: true, availableRooms: requiredRooms };
    }

    // Se houver dados, usar diretamente
    const availableRooms = data.available_rooms || 0;
    return {
      available: availableRooms >= requiredRooms,
      availableRooms,
      reason: availableRooms < requiredRooms ? `Apenas ${availableRooms} ${availableRooms === 1 ? 'quarto disponível' : 'quartos disponíveis'}` : undefined,
    };
  } catch (error) {
    console.error('Erro ao verificar inventário:', error);
    // Fallback: assumir disponível
    return { available: true, availableRooms: requiredRooms };
  }
};

/**
 * Verifica restrições de tarifa para um período
 */
export const checkRateRestrictions = async (
  establishmentId: string,
  categoryId: string,
  planId: string,
  checkinDate: Date,
  checkoutDate: Date,
  nights: number
): Promise<{ allowed: boolean; reason?: string; restriction?: string; minNights?: number }> => {
  try {
    const dates: Date[] = [];
    const current = new Date(checkinDate);
    const end = new Date(checkoutDate);

    // Gerar todas as datas do período
    while (current < end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    // Buscar restrições do rate_calendar
    const dateStrings = dates.map(d => format(d, 'yyyy-MM-dd'));
    
    const { data: restrictions, error } = await supabase
      .from('rate_calendar')
      .select('date, min_stay, max_stay, closed_to_arrival, closed_to_departure, stop_sell_booking_engine')
      .eq('establishment_id', establishmentId)
      .eq('category_id', categoryId)
      .eq('pricing_plan_id', planId)
      .in('date', dateStrings);

    if (error) {
      console.error('Erro ao buscar restrições:', error);
      return { allowed: true };
    }

    if (!restrictions || restrictions.length === 0) {
      return { allowed: true };
    }

    // Verificar Min Stay
    const firstDateRestriction = restrictions.find(r => r.date === format(checkinDate, 'yyyy-MM-dd'));
    if (firstDateRestriction?.min_stay && nights < firstDateRestriction.min_stay) {
      return {
        allowed: false,
        reason: `Período mínimo de ${firstDateRestriction.min_stay} ${firstDateRestriction.min_stay === 1 ? 'noite' : 'noites'} necessário`,
        restriction: 'min_stay',
        minNights: firstDateRestriction.min_stay,
      };
    }

    // Verificar Max Stay
    if (firstDateRestriction?.max_stay && nights > firstDateRestriction.max_stay) {
      return {
        allowed: false,
        reason: `Período máximo de ${firstDateRestriction.max_stay} ${firstDateRestriction.max_stay === 1 ? 'noite' : 'noites'} permitido`,
        restriction: 'max_stay',
      };
    }

    // Verificar Closed to Arrival (CTA)
    if (firstDateRestriction?.closed_to_arrival) {
      return {
        allowed: false,
        reason: 'Check-in não permitido nesta data',
        restriction: 'closed_to_arrival',
      };
    }

    // Verificar Closed to Departure (CTD)
    const lastDateRestriction = restrictions.find(r => r.date === format(new Date(checkoutDate.getTime() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd'));
    if (lastDateRestriction?.closed_to_departure) {
      return {
        allowed: false,
        reason: 'Check-out não permitido nesta data',
        restriction: 'closed_to_departure',
      };
    }

    // Verificar Stop Sell no Motor de Reservas
    const hasStopSell = restrictions.some(r => r.stop_sell_booking_engine);
    if (hasStopSell) {
      return {
        allowed: false,
        reason: 'Venda bloqueada para este período',
        restriction: 'stop_sell_booking_engine',
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('Erro ao verificar restrições:', error);
    return { allowed: true };
  }
};

