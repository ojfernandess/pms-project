/**
 * Sincronização em tempo real do Sistema Tarifário
 * 
 * Inscreve-se em alterações no Supabase Realtime para:
 * - rate_calendar (tarifas)
 * - dynamic_pricing_rules (regras dinâmicas)
 * - rate_restrictions (restrições)
 * - hotel_settings (configurações auto_apply)
 * 
 * Ao detectar mudanças, invalida as queries relacionadas para refetch automático,
 * garantindo atualização sem refresh manual em:
 * - Dashboard de Preços
 * - Mapa de Tarifas
 * - Grade ARI
 * - Motor de Reservas
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";

const RATE_QUERY_KEYS = [
  "rate_calendar",
  "rate_plans",
  "dynamic_pricing_rules",
  "rate_restrictions",
  "hotel_settings_rate_system",
  "price_dashboard_categories",
  "price_dashboard_rate_plans",
  "rate_system_categories",
  "ari_inventory",
  "ari_sales_status",
] as const;

export function useRateSystemRealtime() {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) return selectedEstablishment.id;
    return getSelectedEstablishmentId();
  };

  const establishmentId = getEstablishmentId();

  useEffect(() => {
    if (!establishmentId) return;

    const invalidateRateQueries = () => {
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
      queryClient.invalidateQueries({ queryKey: ["dynamic_pricing_rules"] });
      queryClient.invalidateQueries({ queryKey: ["rate_restrictions"] });
      queryClient.invalidateQueries({ queryKey: ["hotel_settings_rate_system"] });
    };

    const channel = supabase
      .channel(`rate-system-realtime-${establishmentId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rate_calendar",
          filter: `establishment_id=eq.${establishmentId}`,
        },
        () => {
          invalidateRateQueries();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dynamic_pricing_rules",
          filter: `establishment_id=eq.${establishmentId}`,
        },
        () => {
          invalidateRateQueries();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rate_restrictions",
          filter: `establishment_id=eq.${establishmentId}`,
        },
        () => {
          invalidateRateQueries();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "hotel_settings",
          filter: `establishment_id=eq.${establishmentId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["hotel_settings_rate_system"] });
          queryClient.invalidateQueries({ queryKey: ["rates_dashboard"] });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.debug("[RateSystemRealtime] Inscrito para atualizações em tempo real");
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [establishmentId, queryClient]);
}
