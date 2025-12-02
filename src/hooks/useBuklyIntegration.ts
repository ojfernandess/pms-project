import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";

interface BuklyRate {
  categoryId: string;
  categoryName: string;
  planId: string;
  planCode: string;
  date: string;
  basePrice: number;
  adultPrice?: number;
  childPrice?: number;
}

interface BuklyAvailability {
  categoryId: string;
  date: string;
  available: number;
  total: number;
}

interface BuklyRestriction {
  categoryId: string;
  date: string;
  minLOS?: number; // Minimum Length of Stay
  cta?: boolean; // Close to Arrival
  ctd?: boolean; // Close to Departure
  maxLOS?: number; // Maximum Length of Stay
}

interface BuklySyncData {
  rates?: BuklyRate[];
  availability?: BuklyAvailability[];
  restrictions?: BuklyRestriction[];
}

/**
 * Hook para integração com Bukly Channel Manager
 */
export const useBuklyIntegration = () => {
  const queryClient = useQueryClient();

  /**
   * Sincronizar tarifas com Bukly
   */
  const syncRates = useMutation({
    mutationFn: async ({ channelId, rates }: { channelId: string; rates: BuklyRate[] }) => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      // Buscar configuração do canal Bukly
      const { data: channel, error: channelError } = await supabase
        .from("ota_channels")
        .select("*")
        .eq("id", channelId)
        .eq("channel_manager_type", "bukly")
        .single();

      if (channelError || !channel) {
        throw new Error("Canal Bukly não encontrado ou não configurado");
      }

      // Criar log de sincronização
      const { data: syncLog, error: logError } = await supabase
        .from("bukly_sync_logs")
        .insert({
          ota_channel_id: channelId,
          establishment_id: establishmentId,
          sync_type: "rates",
          status: "pending",
          sync_data: { rates },
        })
        .select()
        .single();

      if (logError) throw logError;

      try {
        // Preparar dados para API do Bukly
        const apiUrl = channel.bukly_api_url || "https://api.bukly.com.br";
        const hotelId = channel.bukly_hotel_id;
        const apiKey = channel.api_key;
        const apiSecret = channel.api_secret;

        if (!hotelId || !apiKey || !apiSecret) {
          throw new Error("Credenciais do Bukly não configuradas");
        }

        // Agrupar tarifas por categoria e plano
        const ratesByCategory = rates.reduce((acc, rate) => {
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
        }, {} as Record<string, any>);

        // Enviar para API do Bukly
        const response = await fetch(`${apiUrl}/api/rates`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
            "X-API-Secret": apiSecret,
            "X-Hotel-Id": hotelId,
          },
          body: JSON.stringify({
            hotelId,
            rates: Object.values(ratesByCategory),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Erro ao sincronizar tarifas: ${response.statusText}`);
        }

        const result = await response.json();

        // Atualizar log de sincronização
        await supabase
          .from("bukly_sync_logs")
          .update({
            status: "success",
            records_synced: rates.length,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);

        // Atualizar status do canal
        await supabase
          .from("ota_channels")
          .update({
            bukly_last_sync_at: new Date().toISOString(),
            bukly_sync_status: "success",
            last_sync_at: new Date().toISOString(),
            sync_status: "success",
          })
          .eq("id", channelId);

        return result;
      } catch (error: any) {
        // Atualizar log com erro
        await supabase
          .from("bukly_sync_logs")
          .update({
            status: "error",
            error_message: error.message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);

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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bukly_sync_logs"] });
      queryClient.invalidateQueries({ queryKey: ["ota_channels"] });
      toast.success("Tarifas sincronizadas com Bukly com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao sincronizar tarifas com Bukly");
    },
  });

  /**
   * Sincronizar disponibilidade com Bukly
   */
  const syncAvailability = useMutation({
    mutationFn: async ({ channelId, availability }: { channelId: string; availability: BuklyAvailability[] }) => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      // Buscar configuração do canal Bukly
      const { data: channel, error: channelError } = await supabase
        .from("ota_channels")
        .select("*")
        .eq("id", channelId)
        .eq("channel_manager_type", "bukly")
        .single();

      if (channelError || !channel) {
        throw new Error("Canal Bukly não encontrado ou não configurado");
      }

      // Criar log de sincronização
      const { data: syncLog, error: logError } = await supabase
        .from("bukly_sync_logs")
        .insert({
          ota_channel_id: channelId,
          establishment_id: establishmentId,
          sync_type: "availability",
          status: "pending",
          sync_data: { availability },
        })
        .select()
        .single();

      if (logError) throw logError;

      try {
        const apiUrl = channel.bukly_api_url || "https://api.bukly.com.br";
        const hotelId = channel.bukly_hotel_id;
        const apiKey = channel.api_key;
        const apiSecret = channel.api_secret;

        if (!hotelId || !apiKey || !apiSecret) {
          throw new Error("Credenciais do Bukly não configuradas");
        }

        // Enviar para API do Bukly
        const response = await fetch(`${apiUrl}/api/availability`, {
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

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Erro ao sincronizar disponibilidade: ${response.statusText}`);
        }

        const result = await response.json();

        // Atualizar log de sincronização
        await supabase
          .from("bukly_sync_logs")
          .update({
            status: "success",
            records_synced: availability.length,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);

        return result;
      } catch (error: any) {
        // Atualizar log com erro
        await supabase
          .from("bukly_sync_logs")
          .update({
            status: "error",
            error_message: error.message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);

        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bukly_sync_logs"] });
      toast.success("Disponibilidade sincronizada com Bukly com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao sincronizar disponibilidade com Bukly");
    },
  });

  /**
   * Sincronizar restrições com Bukly
   */
  const syncRestrictions = useMutation({
    mutationFn: async ({ channelId, restrictions }: { channelId: string; restrictions: BuklyRestriction[] }) => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      // Buscar configuração do canal Bukly
      const { data: channel, error: channelError } = await supabase
        .from("ota_channels")
        .select("*")
        .eq("id", channelId)
        .eq("channel_manager_type", "bukly")
        .single();

      if (channelError || !channel) {
        throw new Error("Canal Bukly não encontrado ou não configurado");
      }

      // Criar log de sincronização
      const { data: syncLog, error: logError } = await supabase
        .from("bukly_sync_logs")
        .insert({
          ota_channel_id: channelId,
          establishment_id: establishmentId,
          sync_type: "restrictions",
          status: "pending",
          sync_data: { restrictions },
        })
        .select()
        .single();

      if (logError) throw logError;

      try {
        const apiUrl = channel.bukly_api_url || "https://api.bukly.com.br";
        const hotelId = channel.bukly_hotel_id;
        const apiKey = channel.api_key;
        const apiSecret = channel.api_secret;

        if (!hotelId || !apiKey || !apiSecret) {
          throw new Error("Credenciais do Bukly não configuradas");
        }

        // Enviar para API do Bukly
        const response = await fetch(`${apiUrl}/api/restrictions`, {
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

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Erro ao sincronizar restrições: ${response.statusText}`);
        }

        const result = await response.json();

        // Atualizar log de sincronização
        await supabase
          .from("bukly_sync_logs")
          .update({
            status: "success",
            records_synced: restrictions.length,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);

        return result;
      } catch (error: any) {
        // Atualizar log com erro
        await supabase
          .from("bukly_sync_logs")
          .update({
            status: "error",
            error_message: error.message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);

        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bukly_sync_logs"] });
      toast.success("Restrições sincronizadas com Bukly com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao sincronizar restrições com Bukly");
    },
  });

  /**
   * Sincronização completa (rates + availability + restrictions)
   */
  const syncFull = useMutation({
    mutationFn: async ({ channelId, data }: { channelId: string; data: BuklySyncData }) => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      // Buscar configuração do canal Bukly
      const { data: channel, error: channelError } = await supabase
        .from("ota_channels")
        .select("*")
        .eq("id", channelId)
        .eq("channel_manager_type", "bukly")
        .single();

      if (channelError || !channel) {
        throw new Error("Canal Bukly não encontrado ou não configurado");
      }

      // Criar log de sincronização completa
      const { data: syncLog, error: logError } = await supabase
        .from("bukly_sync_logs")
        .insert({
          ota_channel_id: channelId,
          establishment_id: establishmentId,
          sync_type: "full",
          status: "pending",
          sync_data: data,
        })
        .select()
        .single();

      if (logError) throw logError;

      try {
        // Atualizar status para syncing
        await supabase
          .from("ota_channels")
          .update({
            bukly_sync_status: "syncing",
            sync_status: "syncing",
          })
          .eq("id", channelId);

        const results: any = {};

        // Sincronizar tarifas
        if (data.rates && data.rates.length > 0) {
          await syncRates.mutateAsync({ channelId, rates: data.rates });
          results.rates = { success: true, count: data.rates.length };
        }

        // Sincronizar disponibilidade
        if (data.availability && data.availability.length > 0) {
          await syncAvailability.mutateAsync({ channelId, availability: data.availability });
          results.availability = { success: true, count: data.availability.length };
        }

        // Sincronizar restrições
        if (data.restrictions && data.restrictions.length > 0) {
          await syncRestrictions.mutateAsync({ channelId, restrictions: data.restrictions });
          results.restrictions = { success: true, count: data.restrictions.length };
        }

        // Atualizar log de sincronização
        const totalRecords = (data.rates?.length || 0) + (data.availability?.length || 0) + (data.restrictions?.length || 0);
        await supabase
          .from("bukly_sync_logs")
          .update({
            status: "success",
            records_synced: totalRecords,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);

        // Atualizar status do canal
        await supabase
          .from("ota_channels")
          .update({
            bukly_last_sync_at: new Date().toISOString(),
            bukly_sync_status: "success",
            last_sync_at: new Date().toISOString(),
            sync_status: "success",
          })
          .eq("id", channelId);

        return results;
      } catch (error: any) {
        // Atualizar log com erro
        await supabase
          .from("bukly_sync_logs")
          .update({
            status: "error",
            error_message: error.message,
            completed_at: new Date().toISOString(),
          })
          .eq("id", syncLog.id);

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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bukly_sync_logs"] });
      queryClient.invalidateQueries({ queryKey: ["ota_channels"] });
      toast.success("Sincronização completa com Bukly realizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao sincronizar com Bukly");
    },
  });

  /**
   * Buscar logs de sincronização
   */
  const syncLogsQuery = useQuery({
    queryKey: ["bukly_sync_logs"],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("bukly_sync_logs")
        .select(`
          *,
          ota_channels (*)
        `)
        .eq("establishment_id", establishmentId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
  });

  /**
   * Processar webhook do Bukly
   */
  const processWebhook = useMutation({
    mutationFn: async ({ channelId, webhookType, payload }: { channelId: string; webhookType: string; payload: any }) => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      // Salvar webhook
      const { data: webhook, error: webhookError } = await supabase
        .from("bukly_webhooks")
        .insert({
          ota_channel_id: channelId,
          establishment_id: establishmentId,
          webhook_type: webhookType as any,
          payload,
        })
        .select()
        .single();

      if (webhookError) throw webhookError;

      try {
        // Processar webhook baseado no tipo
        switch (webhookType) {
          case "booking": {
            // Criar nova reserva
            const bookingData = payload.data;
            const guestData = bookingData.guest || {};
            const reservationData = bookingData.reservation || {};

            // Buscar ou criar cliente/hóspede
            let clientId: string | null = null;
            if (guestData.email) {
              const { data: existingClient } = await supabase
                .from("clients")
                .select("id")
                .eq("email", guestData.email)
                .eq("establishment_id", establishmentId)
                .single();

              if (existingClient) {
                clientId = existingClient.id;
              } else {
                // Criar novo cliente
                const { data: newClient, error: clientError } = await supabase
                  .from("clients")
                  .insert({
                    full_name: guestData.name || "Hóspede OTA",
                    email: guestData.email,
                    phone: guestData.phone,
                    document_number: guestData.document,
                    establishment_id: establishmentId,
                  })
                  .select()
                  .single();

                if (clientError) throw clientError;
                clientId = newClient.id;
              }
            }

            if (!clientId) {
              throw new Error("Não foi possível criar ou encontrar o cliente");
            }

            // Criar reserva
            const { data: { user } } = await supabase.auth.getUser();
            const { data: newReservation, error: reservationError } = await supabase
              .from("reservations")
              .insert({
                client_id: clientId,
                category_id: reservationData.category_id,
                room_id: reservationData.room_id || null,
                checkin_date: reservationData.checkin_date,
                checkout_date: reservationData.checkout_date,
                adults: reservationData.adults || 1,
                children: reservationData.children || 0,
                channel: bookingData.ota_channel || "bukly",
                total_amount: reservationData.total_amount || 0,
                status: "confirmed",
                payment_status: "pending",
                paid_amount: 0,
                establishment_id: establishmentId,
                created_by: user?.id || null,
              })
              .select()
              .single();

            if (reservationError) throw reservationError;

            // Criar registro de reserva OTA
            await supabase
              .from("ota_reservations")
              .insert({
                reservation_id: newReservation.id,
                ota_channel_id: channelId,
                ota_reservation_code: bookingData.booking_id,
                ota_guest_name: guestData.name,
                ota_guest_email: guestData.email,
                synced_at: new Date().toISOString(),
                sync_status: "synced",
              });

            break;
          }
          case "modification": {
            // Atualizar reserva existente
            const modificationData = payload.data;
            const bookingId = modificationData.booking_id;

            // Buscar reserva OTA
            const { data: otaReservation, error: otaError } = await supabase
              .from("ota_reservations")
              .select("reservation_id")
              .eq("ota_reservation_code", bookingId)
              .eq("ota_channel_id", channelId)
              .single();

            if (otaError || !otaReservation) {
              throw new Error("Reserva não encontrada");
            }

            // Atualizar reserva
            const updates: any = {};
            if (modificationData.changes.checkin_date) {
              updates.checkin_date = modificationData.changes.checkin_date;
            }
            if (modificationData.changes.checkout_date) {
              updates.checkout_date = modificationData.changes.checkout_date;
            }
            if (modificationData.changes.adults !== undefined) {
              updates.adults = modificationData.changes.adults;
            }
            if (modificationData.changes.children !== undefined) {
              updates.children = modificationData.changes.children;
            }
            if (modificationData.changes.total_amount !== undefined) {
              updates.total_amount = modificationData.changes.total_amount;
            }

            if (Object.keys(updates).length > 0) {
              const { error: updateError } = await supabase
                .from("reservations")
                .update(updates)
                .eq("id", otaReservation.reservation_id);

              if (updateError) throw updateError;
            }

            break;
          }
          case "cancellation": {
            // Cancelar reserva
            const cancellationData = payload.data;
            const bookingId = cancellationData.booking_id;

            // Buscar reserva OTA
            const { data: otaReservation, error: otaError } = await supabase
              .from("ota_reservations")
              .select("reservation_id")
              .eq("ota_reservation_code", bookingId)
              .eq("ota_channel_id", channelId)
              .single();

            if (otaError || !otaReservation) {
              throw new Error("Reserva não encontrada");
            }

            // Cancelar reserva
            const { error: cancelError } = await supabase
              .from("reservations")
              .update({
                status: "cancelled",
                cancellation_reason: cancellationData.reason || "Cancelado via Bukly",
                cancelled_at: new Date().toISOString(),
              })
              .eq("id", otaReservation.reservation_id);

            if (cancelError) throw cancelError;

            break;
          }
        }

        // Marcar webhook como processado
        await supabase
          .from("bukly_webhooks")
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
          })
          .eq("id", webhook.id);

        return webhook;
      } catch (error: any) {
        // Atualizar webhook com erro
        await supabase
          .from("bukly_webhooks")
          .update({
            error_message: error.message,
          })
          .eq("id", webhook.id);

        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bukly_webhooks"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    },
  });

  return {
    syncRates: syncRates.mutateAsync,
    syncAvailability: syncAvailability.mutateAsync,
    syncRestrictions: syncRestrictions.mutateAsync,
    syncFull: syncFull.mutateAsync,
    processWebhook: processWebhook.mutateAsync,
    syncLogs: syncLogsQuery.data || [],
    isLoadingLogs: syncLogsQuery.isLoading,
    isSyncing: syncRates.isPending || syncAvailability.isPending || syncRestrictions.isPending || syncFull.isPending,
  };
};

