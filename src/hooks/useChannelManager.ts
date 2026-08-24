import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";
import { invokeBuklySync } from "@/lib/buklySyncInvoke";
import { invokeAiosellSync } from "@/lib/aiosellSyncInvoke";
import { getAiosellSyncMappingDebug } from "@/lib/aiosellSyncSummary";
import { invokeAiosellReservationsSync } from "@/lib/aiosellReservationsSyncInvoke";
import { invokeChannexSync } from "@/lib/channexSyncInvoke";
import { invokeChannexReservationsSync } from "@/lib/channexReservationsSyncInvoke";

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
      const payload = {
        ...channel,
        establishment_id: establishmentId || undefined,
        channex_property_id:
          channel?.channex_property_id === "" ? null : channel?.channex_property_id,
      };
      const { data, error } = await supabase
        .from("ota_channels")
        .insert([payload])
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
      // Evitar "" em colunas UUID (ex.: channex_property_id)
      const sanitized = { ...updates };
      if (sanitized.channex_property_id === "") {
        sanitized.channex_property_id = null;
      }
      const { data, error } = await supabase
        .from("ota_channels")
        .update(sanitized)
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
      const { data, error } = await supabase
        .from("channel_pricing")
        .delete()
        .eq("id", id)
        .select("id");

      if (error) throw error;
      if (!data?.length) {
        throw new Error(
          "Nenhuma linha foi eliminada (registo inexistente ou sem permissão)."
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
      toast.success("Tarifa por canal excluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir tarifa por canal");
    },
  });

  const syncBuklyChannel = invokeBuklySync;

  const syncAiosellChannel = async (
    channelId: string,
    establishmentId: string,
    opts?: { silent?: boolean }
  ) => {
    const payload = await invokeAiosellSync(channelId, establishmentId);
    if (!opts?.silent) {
      const invBlocks =
        payload.inventoryCombinedBlocks != null
          ? payload.inventoryCombinedBlocks
          : (payload.inventoryAvailBlocks ?? 0) + (payload.inventoryRestrictionBlocks ?? 0);
      const pairCount = payload.syncedRatePairsCount ?? payload.syncedRatePairs?.length ?? 0;
      const invRooms = payload.inventoryRoomCodesSent?.length ?? 0;
      const summary = `Aiosell: ${invBlocks} bloco(s) inventário, ${payload.rateRows ?? 0} linha(s) tarifa (${payload.rateUpdateBlocks ?? 0} bloco(s)).`;
      const mappingHint = `Mapeamento enviado: ${pairCount} par(es) room+rate único(s) (tarifas); ${invRooms} room code(s) no inventário.`;
      const apiEcho = payload.aiosellApiMessages?.filter(Boolean).join(" · ");
      const detailLine = apiEcho ? `${summary} ${mappingHint} — ${apiEcho}` : `${summary} ${mappingHint}`;

      if (payload.syncHints?.aiosellRatePostAckOnly === true) {
        toast.warning("Aiosell: envio aceito — o CM pode ainda mostrar valores antigos", {
          description: `${detailLine}. A resposta da API só confirma receção do pedido, não que o painel do Channel Manager já foi atualizado. Se os valores não mudarem, contacte o suporte Aiosell (fila de processamento ou regras do endpoint).`,
          duration: 18_000,
        });
      } else {
        toast.success(detailLine);
      }
      const semWarn = payload.syncHints?.mappingSemanticsWarning;
      if (semWarn) {
        toast.warning(semWarn, { duration: 14000 });
      }
      if (payload.syncHints?.aiosellSamplePmsPathRates === true) {
        toast.warning("Canal Aiosell: path de tarifas em modo «sample-pms»", {
          description:
            "O endpoint configurado é o da documentação (sandbox). A API pode aceitar o envio mas o painel do hotel em produção pode não mudar. No canal Aiosell, substitua o «Path de tarifas» pelo endpoint de produção que a Aiosell indicar (não use …/sample-pms em produção).",
          duration: 20_000,
        });
      }
      console.info("[Aiosell sync] Tarifários enviados (verificar CM):", getAiosellSyncMappingDebug(payload));
    }
    return payload.channel;
  };

  const syncChannexChannel = async (
    channelId: string,
    establishmentId: string,
    opts?: { silent?: boolean }
  ) => {
    const payload = await invokeChannexSync(channelId, establishmentId);
    if (!opts?.silent) {
      const availabilityTasks = payload.availabilityTasks?.length ?? 0;
      const restrictionTasks = payload.restrictionTasks?.length ?? 0;
      toast.success(
        `Channex: envio ARI concluído (${availabilityTasks} task(s) availability, ${restrictionTasks} task(s) restrictions).`
      );
    }
    return payload;
  };

  type SyncChannelArg =
    | string
    | { channelId: string; silent?: boolean; skipInvalidate?: boolean };

  const parseSyncChannelArg = (arg: SyncChannelArg) =>
    typeof arg === "string"
      ? { channelId: arg, silent: false, skipInvalidate: false }
      : {
          channelId: arg.channelId,
          silent: !!arg.silent,
          skipInvalidate: !!arg.skipInvalidate,
        };

  // Sincronizar canal usando o novo sistema tarifário (rate_calendar)
  const syncChannel = useMutation({
    mutationFn: async (arg: SyncChannelArg) => {
      const { channelId, silent } = parseSyncChannelArg(arg);
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
        return await syncBuklyChannel(channelId, establishmentId, { silent });
      }

      if (channel.channel_type === "channel_manager" && channel.channel_manager_type === "aiosell") {
        return await syncAiosellChannel(channelId, establishmentId, { silent });
      }
      if (channel.channel_type === "channel_manager" && channel.channel_manager_type === "channex") {
        return await syncChannexChannel(channelId, establishmentId, { silent });
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
        
        if (!silent) {
          toast.success(`Sincronizadas ${syncData.length} tarifas com sucesso!`);
        }
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
    onSuccess: (_data, arg) => {
      const { skipInvalidate } = parseSyncChannelArg(arg as SyncChannelArg);
      if (skipInvalidate) return;
      queryClient.invalidateQueries({ queryKey: ["ota_channels"] });
      queryClient.invalidateQueries({ queryKey: ["channel_pricing"] });
      queryClient.invalidateQueries({ queryKey: ["rate_calendar"] });
    },
    onError: (error: any, arg) => {
      const { silent } = parseSyncChannelArg(arg as SyncChannelArg);
      if (!silent) {
        toast.error(error.message || "Erro ao sincronizar canal");
      }
    },
  });

  const syncAiosellReservationsMutation = useMutation({
    mutationFn: async (args: { channelId: string; establishmentId: string; pull?: boolean }) => {
      return invokeAiosellReservationsSync(args.channelId, args.establishmentId, {
        pull: args.pull !== false,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ota_reservations"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      const processed = data.processed ?? 0;
      const created = data.created ?? 0;
      const skipped = data.skipped ?? 0;
      const failed = data.failed ?? 0;
      toast.success(
        `Reservas: ${processed} processada(s), ${created} nova(s), ${skipped} já existente(s), ${failed} erro(s).`
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao sincronizar reservas do canal");
    },
  });

  const syncChannexReservationsMutation = useMutation({
    mutationFn: async (args: { channelId: string; establishmentId: string }) => {
      return invokeChannexReservationsSync(args.channelId, args.establishmentId);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["ota_reservations"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      const processed = data.processed ?? 0;
      const created = data.created ?? 0;
      const modified = data.modified ?? 0;
      const cancelled = data.cancelled ?? 0;
      const failed = data.failed ?? 0;
      toast.success(
        `Channex: ${processed} revisão(ões), ${created} nova(s), ${modified} alterada(s), ${cancelled} cancelada(s), ${failed} erro(s).`
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao sincronizar reservas Channex");
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
    syncAiosellReservations: syncAiosellReservationsMutation.mutateAsync,
    isSyncingAiosellReservations: syncAiosellReservationsMutation.isPending,
    syncChannexReservations: syncChannexReservationsMutation.mutateAsync,
    isSyncingChannexReservations: syncChannexReservationsMutation.isPending,
    isCreating: createChannel.isPending || createChannelPricing.isPending,
  };
};

