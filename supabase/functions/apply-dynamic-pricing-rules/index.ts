import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface RequestBody {
  establishment_id: string;
  category_id: string;
  pricing_plan_id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  adults?: number;
  children?: number;
}

interface DynamicRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_condition: any;
  adjustment_type: 'percentage' | 'fixed' | 'multiplier';
  adjustment_value: number;
  priority: number;
  is_active: boolean;
  use_occupancy?: boolean;
  use_pickup_rate?: boolean;
  use_local_events?: boolean;
  use_demand_history?: boolean;
  applicable_categories?: string[];
  applicable_plans?: string[];
  start_date?: string;
  end_date?: string;
}

serve(async (req) => {
  // Permitir CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    // Verificar método
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Método não permitido. Use POST." }),
        {
          status: 405,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: "Configuração do Supabase não encontrada" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse do body
    const body: RequestBody = await req.json();
    
    // Validar campos obrigatórios
    if (!body.establishment_id || !body.category_id || !body.pricing_plan_id || !body.date) {
      return new Response(
        JSON.stringify({ 
          error: "Campos obrigatórios: establishment_id, category_id, pricing_plan_id, date" 
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const {
      establishment_id,
      category_id,
      pricing_plan_id,
      date,
      adults = 1,
      children = 0,
    } = body;

    // 1. Verificar se auto_apply_dynamic_rules está habilitado
    const { data: hotelSettings } = await supabase
      .from("hotel_settings")
      .select("rate_system_settings")
      .eq("establishment_id", establishment_id)
      .maybeSingle();

    const autoApplyRules = hotelSettings?.rate_system_settings?.auto_apply_dynamic_rules ?? false;

    if (!autoApplyRules) {
      // Se não está habilitado, apenas calcular preço base usando a função PostgreSQL
      const { data: priceData, error: priceError } = await supabase.rpc(
        "calculate_rate_price",
        {
          p_establishment_id: establishment_id,
          p_category_id: category_id,
          p_pricing_plan_id: pricing_plan_id,
          p_date: date,
          p_adults: adults,
          p_children: children,
        }
      );

      if (priceError) {
        console.error("Erro ao calcular preço:", priceError);
        return new Response(
          JSON.stringify({ error: "Erro ao calcular preço base", details: priceError.message }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      return new Response(
        JSON.stringify({
          final_price: priceData,
          base_price: priceData,
          adjustments_applied: [],
          auto_apply_enabled: false,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 2. Buscar preço base do rate_calendar
    const { data: rateCalendarEntry } = await supabase
      .from("rate_calendar")
      .select("base_price, adult_price, child_price, occupancy_percentage, projected_occupancy, pickup_rate")
      .eq("establishment_id", establishment_id)
      .eq("category_id", category_id)
      .eq("pricing_plan_id", pricing_plan_id)
      .eq("date", date)
      .maybeSingle();

    let basePrice = rateCalendarEntry?.base_price;
    let adultPrice = rateCalendarEntry?.adult_price;
    let childPrice = rateCalendarEntry?.child_price;
    let occupancy = rateCalendarEntry?.occupancy_percentage ?? 0;
    let projectedOccupancy = rateCalendarEntry?.projected_occupancy ?? 0;
    let pickupRate = rateCalendarEntry?.pickup_rate ?? 0;

    // Se não encontrou no calendário, buscar preço base da categoria
    if (!basePrice || basePrice === 0) {
      const { data: category } = await supabase
        .from("room_categories")
        .select("base_price")
        .eq("id", category_id)
        .maybeSingle();

      basePrice = category?.base_price ?? 0;
    }

    if (!basePrice || basePrice === 0) {
      return new Response(
        JSON.stringify({ error: "Preço base não encontrado" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 3. Calcular preço base com adultos/crianças
    let finalPrice = Number(basePrice);
    
    if (adults > 1 && adultPrice) {
      finalPrice += Number(adultPrice) * (adults - 1);
    }
    
    if (children > 0 && childPrice) {
      finalPrice += Number(childPrice) * children;
    }

    // 4. Verificar eventos locais
    let hasLocalEvent = false;
    let eventImpact = 0;

    try {
      const { data: localEvents } = await supabase
        .from("local_events")
        .select("expected_demand_increase, impact_level")
        .eq("establishment_id", establishment_id)
        .or(`is_active.is.null,is_active.eq.true`)
        .lte("start_date", date)
        .gte("end_date", date)
        .order("impact_level", { ascending: false })
        .limit(1);

      if (localEvents && localEvents.length > 0) {
        hasLocalEvent = true;
        eventImpact = localEvents[0].expected_demand_increase ?? 0;
      }
    } catch (error) {
      // Tabela pode não existir, ignorar
      console.debug("Tabela local_events não encontrada ou erro ao buscar:", error);
    }

    // 5. Calcular métricas adicionais
    const currentDate = new Date(date);
    const currentDayOfWeek = currentDate.getDay(); // 0 = domingo, 6 = sábado
    const daysUntilDate = Math.floor((currentDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    const demandScore = 50; // Score neutro (pode ser calculado futuramente)

    // 6. Buscar regras dinâmicas ativas
    const { data: rules, error: rulesError } = await supabase
      .from("dynamic_pricing_rules")
      .select("*")
      .eq("establishment_id", establishment_id)
      .or(`is_active.is.null,is_active.eq.true`)
      .or(`start_date.is.null,start_date.lte.${date}`)
      .or(`end_date.is.null,end_date.gte.${date}`)
      .order("priority", { ascending: true });

    if (rulesError) {
      console.error("Erro ao buscar regras:", rulesError);
      // Continuar sem regras se houver erro
    }

    const appliedAdjustments: Array<{
      rule_id: string;
      rule_name: string;
      adjustment_type: string;
      adjustment_value: number;
      final_adjustment: number;
    }> = [];

    // 7. Aplicar regras dinâmicas
    if (rules && rules.length > 0) {
      for (const rule of rules as DynamicRule[]) {
        // Verificar se a regra está ativa
        if (rule.is_active === false) {
          continue;
        }

        // Verificar datas
        if (rule.start_date && rule.start_date > date) {
          continue;
        }
        if (rule.end_date && rule.end_date < date) {
          continue;
        }

        // Verificar categorias aplicáveis
        if (rule.applicable_categories && rule.applicable_categories.length > 0) {
          if (!rule.applicable_categories.includes(category_id)) {
            continue;
          }
        }

        // Verificar planos aplicáveis
        if (rule.applicable_plans && rule.applicable_plans.length > 0) {
          if (!rule.applicable_plans.includes(pricing_plan_id)) {
            continue;
          }
        }

        // Verificar condições do trigger
        let shouldApply = false;
        const triggerCondition = rule.trigger_condition || {};

        // Trigger: Ocupação
        if (rule.trigger_type === 'occupancy') {
          if (rule.use_occupancy !== false) {
            const minOccupancy = triggerCondition.min_occupancy;
            const maxOccupancy = triggerCondition.max_occupancy;
            const currentOccupancy = occupancy || projectedOccupancy;

            if (currentOccupancy > 0) {
              if (minOccupancy === undefined && maxOccupancy === undefined) {
                shouldApply = true;
              } else {
                const min = minOccupancy ?? 0;
                const max = maxOccupancy ?? 100;
                if (currentOccupancy >= min && currentOccupancy <= max) {
                  shouldApply = true;
                }
              }
            }
          }
        }

        // Trigger: Pickup Rate (Booking Velocity)
        if (rule.trigger_type === 'booking_velocity') {
          if (rule.use_pickup_rate !== false) {
            const minBookings = triggerCondition.min_bookings;

            if (pickupRate > 0) {
              if (minBookings === undefined) {
                shouldApply = true;
              } else {
                if (pickupRate >= minBookings) {
                  shouldApply = true;
                }
              }
            }
          }
        }

        // Trigger: Day of Week
        if (rule.trigger_type === 'day_of_week') {
          const days = triggerCondition.days;
          if (days && Array.isArray(days) && days.length > 0) {
            if (days.includes(currentDayOfWeek)) {
              shouldApply = true;
            }
          } else {
            // Se não há dias especificados, aplicar sempre
            shouldApply = true;
          }
        }

        // Trigger: Advance Booking
        if (rule.trigger_type === 'advance_booking') {
          if (daysUntilDate >= 0) {
            const minDays = triggerCondition.min_days;
            const maxDays = triggerCondition.max_days;

            if (minDays === undefined && maxDays === undefined) {
              shouldApply = true;
            } else {
              const min = minDays ?? 0;
              const max = maxDays ?? 365;
              if (daysUntilDate >= min && daysUntilDate <= max) {
                shouldApply = true;
              }
            }
          }
        }

        // Trigger: Local Event
        if (rule.trigger_type === 'local_event') {
          if (rule.use_local_events !== false && hasLocalEvent) {
            shouldApply = true;
          }
        }

        // Trigger: Custom (Demand History)
        if (rule.trigger_type === 'custom') {
          if (rule.use_demand_history !== false) {
            const minScore = triggerCondition.min_score;
            const maxScore = triggerCondition.max_score;

            if (minScore === undefined && maxScore === undefined) {
              if (demandScore > 70) {
                shouldApply = true;
              }
            } else {
              const min = minScore ?? 0;
              const max = maxScore ?? 100;
              if (demandScore >= min && demandScore <= max) {
                shouldApply = true;
              }
            }
          }
        }

        // Aplicar ajuste se a condição foi atendida
        if (shouldApply) {
          let adjustment = 0;

          if (rule.adjustment_type === 'percentage') {
            adjustment = finalPrice * (rule.adjustment_value / 100);
            finalPrice += adjustment;
          } else if (rule.adjustment_type === 'fixed') {
            adjustment = rule.adjustment_value;
            finalPrice += adjustment;
          } else if (rule.adjustment_type === 'multiplier') {
            const oldPrice = finalPrice;
            finalPrice = finalPrice * rule.adjustment_value;
            adjustment = finalPrice - oldPrice;
          }

          appliedAdjustments.push({
            rule_id: rule.id,
            rule_name: rule.name,
            adjustment_type: rule.adjustment_type,
            adjustment_value: rule.adjustment_value,
            final_adjustment: adjustment,
          });
        }
      }
    }

    // 8. Aplicar impacto de eventos locais (sempre aplicar, independente da configuração)
    if (eventImpact > 0) {
      const oldPrice = finalPrice;
      finalPrice = finalPrice * (1 + eventImpact / 100);
      appliedAdjustments.push({
        rule_id: 'local_event',
        rule_name: 'Evento Local',
        adjustment_type: 'percentage',
        adjustment_value: eventImpact,
        final_adjustment: finalPrice - oldPrice,
      });
    }

    // 9. Garantir que o preço não seja negativo
    if (finalPrice < 0) {
      finalPrice = 0;
    }

    // 10. Retornar resultado
    return new Response(
      JSON.stringify({
        final_price: Math.round(finalPrice * 100) / 100,
        base_price: Number(basePrice),
        adjustments_applied: appliedAdjustments,
        auto_apply_enabled: true,
        metrics: {
          occupancy: occupancy || projectedOccupancy,
          pickup_rate: pickupRate,
          has_local_event: hasLocalEvent,
          event_impact: eventImpact,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Erro na função:", error);
    return new Response(
      JSON.stringify({ 
        error: "Erro interno do servidor",
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

