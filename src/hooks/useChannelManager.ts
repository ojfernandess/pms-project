import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";

export const useChannelManager = () => {
  const queryClient = useQueryClient();

  // Buscar canais OTA
  const channelsQuery = useQuery({
    queryKey: ["ota_channels"],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      let query = supabase.from("ota_channels").select("*");
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query.order("name");

      if (error) {
        toast.error("Erro ao carregar canais OTA");
        throw error;
      }
      return data;
    },
  });

  // Buscar reservas OTA
  const otaReservationsQuery = useQuery({
    queryKey: ["ota_reservations", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      
      // Abordagem otimizada: buscar todas as reservas OTA e filtrar client-side
      // Isso evita problemas com URLs muito longas quando há muitas reservas
      const { data: allOtaReservations, error } = await supabase
        .from("ota_reservations")
        .select(`
          *,
          reservations (*),
          ota_channels (*)
        `)
        .order("created_at", { ascending: false })
        .limit(1000); // Limitar a 1000 registros para evitar sobrecarga

      if (error) {
        toast.error("Erro ao carregar reservas OTA");
        throw error;
      }

      // Filtrar client-side por establishment_id se necessário
      if (establishmentId && allOtaReservations) {
        return allOtaReservations.filter((ota: any) => 
          ota.reservations && ota.reservations.establishment_id === establishmentId
        );
      }
      
      return allOtaReservations || [];
    },
  });

  // Buscar tarifas por canal (integração com novo sistema tarifário)
  const channelPricingQuery = useQuery({
    queryKey: ["channel_pricing", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];
      
      // Buscar canais do estabelecimento primeiro
      let channelsQuery = supabase.from("ota_channels").select("id");
      if (establishmentId) {
        channelsQuery = channelsQuery.eq("establishment_id", establishmentId);
      }
      const { data: channels } = await channelsQuery;
      const channelIds = channels?.map((c: any) => c.id) || [];
      
      // Se não há canais, retornar array vazio
      if (channelIds.length === 0) return [];
      
      // Buscar channel_pricing que pertence aos canais do estabelecimento
      // Agora também busca dados do novo sistema tarifário (rate_calendar)
      let query = supabase
        .from("channel_pricing")
        .select(`
          *,
          ota_channels (*),
          room_categories (*),
          pricing_plans (*)
        `)
        .in("ota_channel_id", channelIds);
      
      const { data, error } = await query.order("created_at", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar tarifas por canal");
        throw error;
      }
      return data || [];
    },
  });

  // Criar canal OTA
  const createChannel = useMutation({
    mutationFn: async (channel: any) => {
      const establishmentId = getSelectedEstablishmentId();
      const { data, error } = await supabase
        .from("ota_channels")
        .insert([{ ...channel, establishment_id: establishmentId || undefined }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota_channels"] });
      toast.success("Canal OTA criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar canal OTA");
    },
  });

  // Atualizar canal OTA
  const updateChannel = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const { data, error } = await supabase
        .from("ota_channels")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota_channels"] });
      toast.success("Canal OTA atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar canal OTA");
    },
  });

  // Deletar canal OTA
  const deleteChannel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ota_channels")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota_channels"] });
      queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
      toast.success("Canal OTA excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir canal OTA");
    },
  });

  // Criar tarifa por canal
  const createChannelPricing = useMutation({
    mutationFn: async (pricing: any) => {
      const { data, error } = await supabase
        .from("channel_pricing")
        .insert([pricing])
        .select(`
          *,
          ota_channels (*),
          room_categories (*)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
      toast.success("Tarifa por canal criada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar tarifa por canal");
    },
  });

  // Atualizar tarifa por canal
  const updateChannelPricing = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const { data, error } = await supabase
        .from("channel_pricing")
        .update(updates)
        .eq("id", id)
        .select(`
          *,
          ota_channels (*),
          room_categories (*)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
      toast.success("Tarifa por canal atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar tarifa por canal");
    },
  });

  // Deletar tarifa por canal
  const deleteChannelPricing = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("channel_pricing")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
      toast.success("Tarifa por canal excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir tarifa por canal");
    },
  });

  // Função auxiliar para sincronizar canal Bukly
  const syncBuklyChannel = async (channelId: string, establishmentId: string) => {
    // Buscar tarifas do novo sistema tarifário (rate_calendar) para os próximos 365 dias
    const today = new Date().toISOString().split("T")[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 365);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const { data: rateCalendar, error: rateError } = await supabase
      .from("rate_calendar")
      .select(`
        *,
        pricing_plans (*),
        room_categories (*)
      `)
      .eq("establishment_id", establishmentId)
      .gte("date", today)
      .lte("date", futureDateStr)
      .order("date", { ascending: true });

    if (rateError) throw rateError;

    // Buscar disponibilidade (quartos disponíveis por categoria)
    const { data: rooms, error: roomsError } = await supabase
      .from("rooms")
      .select("id, category_id")
      .eq("establishment_id", establishmentId);

    if (roomsError) throw roomsError;

    // Buscar reservas para calcular disponibilidade
    const { data: reservations, error: reservationsError } = await supabase
      .from("reservations")
      .select("category_id, checkin_date, checkout_date, room_id")
      .eq("establishment_id", establishmentId)
      .in("status", ["pending", "confirmed", "checked_in"]);

    if (reservationsError) throw reservationsError;

    // Preparar dados para Bukly
    const rates: any[] = [];
    const availability: any[] = [];
    const restrictions: any[] = [];

    // Agrupar por categoria e data
    const categoryDates = new Map<string, Set<string>>();
    (rateCalendar || []).forEach(rate => {
      const key = rate.category_id;
      if (!categoryDates.has(key)) {
        categoryDates.set(key, new Set());
      }
      categoryDates.get(key)!.add(rate.date);
    });

    // Preparar tarifas
    (rateCalendar || []).forEach(rate => {
      rates.push({
        categoryId: rate.category_id,
        categoryName: rate.room_categories?.name,
        planId: rate.pricing_plan_id,
        planCode: rate.pricing_plans?.code,
        date: rate.date,
        basePrice: rate.base_price,
        adultPrice: rate.adult_price,
        childPrice: rate.child_price,
      });
    });

    // Preparar disponibilidade
    categoryDates.forEach((dates, categoryId) => {
      const categoryRooms = rooms?.filter(r => r.category_id === categoryId) || [];
      const totalRooms = categoryRooms.length;

      dates.forEach(date => {
        // Calcular quartos ocupados nesta data
        const occupiedRooms = reservations?.filter(r => {
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

    // Preparar restrições (rate_calendar: min_stay, max_stay, closed_to_arrival, closed_to_departure por plano)
    (rateCalendar || []).forEach(rate => {
      const minLOS = rate.min_stay ?? rate.min_los;
      const maxLOS = rate.max_stay ?? rate.max_los;
      const cta = rate.closed_to_arrival ?? rate.cta;
      const ctd = rate.closed_to_departure ?? rate.ctd;
      if (minLOS || cta || ctd || maxLOS) {
        restrictions.push({
          categoryId: rate.category_id,
          planId: rate.pricing_plan_id,
          date: rate.date,
          minLOS,
          cta: !!cta,
          ctd: !!ctd,
          maxLOS,
        });
      }
    });

    // Buscar configuração do canal Bukly
    const { data: channel, error: channelError } = await supabase
      .from("ota_channels")
      .select("*")
      .eq("id", channelId)
      .single();

    if (channelError || !channel) {
      throw new Error("Canal Bukly não encontrado");
    }

    const apiUrl = channel.bukly_api_url || "https://api.bukly.com.br";
    const hotelId = channel.bukly_hotel_id;
    const apiKey = channel.api_key;
    const apiSecret = channel.api_secret;

    if (!hotelId || !apiKey || !apiSecret) {
      throw new Error("Credenciais do Bukly não configuradas");
    }

    // Criar log de sincronização (se a tabela existir)
    let syncLog: any = null;
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
    } catch (error) {
      // Se a tabela não existir, continuar sem log
      console.warn("Tabela bukly_sync_logs não encontrada, continuando sem log");
    }

    try {
      // Atualizar status para syncing
      await supabase
        .from("ota_channels")
        .update({
          bukly_sync_status: "syncing",
          sync_status: "syncing",
        })
        .eq("id", channelId);

      // Enviar tarifas para API do Bukly
      if (rates.length > 0) {
        const ratesResponse = await fetch(`${apiUrl}/api/rates`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
            "X-API-Secret": apiSecret,
            "X-Hotel-Id": hotelId,
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
                  rates: [],
                };
              }
              acc[key].rates.push({
                date: rate.date,
                basePrice: rate.basePrice,
                adultPrice: rate.adultPrice,
                childPrice: rate.childPrice,
              });
              return acc;
            }, {} as Record<string, any>),
          }),
        });

        if (!ratesResponse.ok) {
          const errorData = await ratesResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `Erro ao sincronizar tarifas: ${ratesResponse.statusText}`);
        }
      }

      // Enviar disponibilidade para API do Bukly
      if (availability.length > 0) {
        const availabilityResponse = await fetch(`${apiUrl}/api/availability`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
            "X-API-Secret": apiSecret,
            "X-Hotel-Id": hotelId,
          },
          body: JSON.stringify({
            hotelId,
            availability,
          }),
        });

        if (!availabilityResponse.ok) {
          const errorData = await availabilityResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `Erro ao sincronizar disponibilidade: ${availabilityResponse.statusText}`);
        }
      }

      // Enviar restrições para API do Bukly
      if (restrictions.length > 0) {
        const restrictionsResponse = await fetch(`${apiUrl}/api/restrictions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
            "X-API-Secret": apiSecret,
            "X-Hotel-Id": hotelId,
          },
          body: JSON.stringify({
            hotelId,
            restrictions,
          }),
        });

        if (!restrictionsResponse.ok) {
          const errorData = await restrictionsResponse.json().catch(() => ({}));
          throw new Error(errorData.message || `Erro ao sincronizar restrições: ${restrictionsResponse.statusText}`);
        }
      }

      // Atualizar log de sincronização (se existir)
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
        } catch (error) {
          // Ignorar erro se a tabela não existir
          console.warn("Erro ao atualizar log de sincronização:", error);
        }
      }

      // Atualizar status do canal
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

      toast.success(`Sincronizadas ${rates.length} tarifas, ${availability.length} disponibilidades e ${restrictions.length} restrições com Bukly!`);
      return updatedChannel;
    } catch (error: any) {
      // Atualizar log com erro (se existir)
      if (syncLog?.id) {
        try {
          await supabase
            .from("bukly_sync_logs")
            .update({
              status: "error",
              error_message: error.message,
              completed_at: new Date().toISOString(),
            })
            .eq("id", syncLog.id);
        } catch (logError) {
          // Ignorar erro se a tabela não existir
          console.warn("Erro ao atualizar log de sincronização:", logError);
        }
      }

      // Atualizar status do canal
      await supabase
        .from("ota_channels")
        .update({
          bukly_sync_status: "error",
          sync_status: "error",
          sync_error: error.message,
        })
        .eq("id", channelId);

      throw error;
    }
  };

  // Sincronizar canal usando o novo sistema tarifário (rate_calendar)
  const syncChannel = useMutation({
    mutationFn: async (channelId: string) => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      // Buscar informações do canal
      const { data: channel, error: channelError } = await supabase
        .from("ota_channels")
        .select("*")
        .eq("id", channelId)
        .single();

      if (channelError || !channel) {
        throw new Error("Canal não encontrado");
      }

      // Verificar se é um channel manager (Bukly)
      if (channel.channel_type === "channel_manager" && channel.channel_manager_type === "bukly") {
        // Usar integração do Bukly
        return await syncBuklyChannel(channelId, establishmentId);
      }

      // Sincronização padrão para OTAs diretas
      // Atualizar status para syncing
      await supabase
        .from("ota_channels")
        .update({
          sync_status: "syncing",
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", channelId);

      try {
        // Buscar tarifas do novo sistema tarifário (rate_calendar) para os próximos 365 dias
        const today = new Date().toISOString().split("T")[0];
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 365);
        const futureDateStr = futureDate.toISOString().split("T")[0];

        const { data: rateCalendar, error: rateError } = await supabase
          .from("rate_calendar")
          .select(`
            *,
            pricing_plans (*),
            room_categories (*)
          `)
          .eq("establishment_id", establishmentId)
          .gte("date", today)
          .lte("date", futureDateStr)
          .order("date", { ascending: true });

        if (rateError) throw rateError;

        // Buscar configurações de channel_pricing para este canal
        const { data: channelPricingConfig } = await supabase
          .from("channel_pricing")
          .select("*")
          .eq("ota_channel_id", channelId)
          .eq("is_active", true);

        // Preparar dados de sincronização seguindo a lógica do PMS
        // Aplicar multiplicadores e preços fixos do channel_pricing
        const syncData = (rateCalendar || []).map(rate => {
          // Buscar configuração específica para este canal/categoria/plano
          const config = channelPricingConfig?.find(
            (cp: any) =>
              cp.category_id === rate.category_id &&
              (cp.pricing_plan_id === rate.pricing_plan_id || !cp.pricing_plan_id)
          );

          let finalPrice = rate.base_price;
          
          if (config) {
            if (config.fixed_price) {
              finalPrice = config.fixed_price;
            } else if (config.price_multiplier) {
              finalPrice = rate.base_price * config.price_multiplier;
            }
          }

          return {
            categoryId: rate.category_id,
            categoryName: rate.room_categories?.name,
            planId: rate.pricing_plan_id,
            planCode: rate.pricing_plans?.code,
            date: rate.date,
            basePrice: rate.base_price,
            finalPrice: finalPrice,
            adultPrice: rate.adult_price,
            childPrice: rate.child_price,
            restrictions: {
              occupancy: rate.occupancy_percentage,
              projectedOccupancy: rate.projected_occupancy,
            },
          };
        });

        // Aqui você faria a chamada real para a API do canal
        // Por exemplo: await syncWithBooking(channelId, syncData);
        // await syncWithExpedia(channelId, syncData);
        
        // Simular sincronização (em produção, aqui seria a chamada real à API da OTA)
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Atualizar status para success
        const { data, error } = await supabase
          .from("ota_channels")
          .update({
            sync_status: "success",
            last_sync_at: new Date().toISOString(),
            sync_error: null,
          })
          .eq("id", channelId)
          .select()
          .single();

        if (error) throw error;
        
        toast.success(`Sincronizadas ${syncData.length} tarifas com sucesso!`);
        return data;
      } catch (error: any) {
        // Atualizar status para error
        await supabase
          .from("ota_channels")
          .update({
            sync_status: "error",
            sync_error: error.message || "Erro desconhecido",
          })
          .eq("id", channelId);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ota_channels"] });
      queryClient.invalidateQueries({ queryKey: ["ota_reservations"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao sincronizar canal");
    },
  });

  return {
    channels: channelsQuery.data || [],
    otaReservations: otaReservationsQuery.data || [],
    channelPricing: channelPricingQuery.data || [],
    isLoading:
      channelsQuery.isLoading ||
      otaReservationsQuery.isLoading ||
      channelPricingQuery.isLoading,
    refetch: () => {
      channelsQuery.refetch();
      otaReservationsQuery.refetch();
      channelPricingQuery.refetch();
    },
    createChannel: createChannel.mutateAsync,
    updateChannel: updateChannel.mutateAsync,
    deleteChannel: deleteChannel.mutateAsync,
    createChannelPricing: createChannelPricing.mutateAsync,
    updateChannelPricing: updateChannelPricing.mutateAsync,
    deleteChannelPricing: deleteChannelPricing.mutateAsync,
    syncChannel: syncChannel.mutateAsync,
    isSyncing: syncChannel.isPending,
    isCreating: createChannel.isPending || createChannelPricing.isPending,
  };
};

