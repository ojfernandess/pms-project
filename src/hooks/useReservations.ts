import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { logActivity, createReservationUpdateDescription } from "@/lib/activityLogger";
import { useEffect } from "react";
import { useEstablishmentReservationRealtime } from "@/hooks/useEstablishmentReservationRealtime";
import { recalculatePolicyAfterDateChange } from "@/utils/cancellationPolicyDateChange";
import { recordProcessedRefund } from "@/services/financial/refundService";
import { scheduleChannelSyncAfterInventoryChange } from "@/lib/channelSyncAfterRates";
import { runAfterReservationCreated, runAfterReservationCancelled } from "@/lib/reservationPostCommit";
import {
  applyReservationMapDelta,
  invalidateReservationViews,
  patchReservationsInQueryCache,
  upsertReservationInQueryCache,
} from "@/lib/reservationQuerySync";
import { runAfterCheckIn, runAfterCheckOut } from "@/lib/reservationPostCheckInOut";
import { startReservationTrace } from "@/lib/reservationOperationTrace";
import { maybeFinalizeOtaCancellationAfterPmsCancel } from "@/lib/otaFinalizeCancellationAfterPms";
import { reconcileLoadedReservationsPaymentStatus } from "@/lib/reservationPaymentStatusReconcile";
import {
  type ReservationCreatePayload,
  stripClientOnlyReservationFields,
} from "@/lib/reservationCreateTypes";
import {
  RESERVATION_RELATIONS_LIST_SELECT,
  RESERVATION_RELATIONS_ROOMS_CATEGORIES_SELECT,
  RESERVATION_RELATIONS_WITH_PRICING_PLAN_SELECT,
} from "@/lib/reservationRelationSelect";

type ReservationInsert = TablesInsert<"reservations">;
type ReservationUpdate = TablesUpdate<"reservations">;

export const useReservations = () => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();

  // Obter establishmentId do contexto ou localStorage
  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      localStorage.setItem("selectedEstablishmentId", selectedEstablishment.id);
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  // Buscar todas as reservas com joins
  const reservationsQuery = useQuery({
    queryKey: ["reservations", selectedEstablishment?.id],
    refetchInterval: 60000, // Refetch a cada minuto para verificar pré-reservas expiradas
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      
      // Verificar e cancelar pré-reservas expiradas antes de buscar as reservas
      // Isso garante que as pré-reservas expiradas sejam canceladas automaticamente
      try {
        // Primeiro, verificar quantas pré-reservas existem com expiration_date
        const { data: preregistrations, error: checkError } = await supabase
          .from("reservations")
          .select("id, reservation_code, expiration_date, status")
          .eq("status", "preregistration")
          .not("expiration_date", "is", null)
          .limit(10);
        
        if (!checkError && preregistrations && preregistrations.length > 0) {
          console.log("📋 Pré-reservas encontradas:", preregistrations.map((r: any) => ({
            code: r.reservation_code,
            expiration: r.expiration_date,
            status: r.status,
            expired: new Date(r.expiration_date) <= new Date()
          })));
        }
        
        const { data: cancelledCount, error: cancelError } = await supabase.rpc("cancel_expired_preregistrations");
        if (cancelError) {
          console.error("❌ Erro ao cancelar pré-reservas expiradas:", cancelError);
          // Não bloquear o carregamento se houver erro ao cancelar
        } else if (cancelledCount && cancelledCount > 0) {
          console.log(`✅ ${cancelledCount} pré-reserva(s) expirada(s) cancelada(s) automaticamente`);
        } else {
          console.log("ℹ️ Nenhuma pré-reserva expirada encontrada para cancelar");
        }
      } catch (err) {
        console.error("❌ Erro ao executar cancelamento de pré-reservas expiradas:", err);
        // Não bloquear o carregamento se houver erro
      }
      
      let query = supabase
        .from("reservations")
        .select(RESERVATION_RELATIONS_LIST_SELECT);
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }

      query = query.is("lodging_reservation_id", null);
      
      const { data, error } = await query.order("checkin_date", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar reservas");
        throw error;
      }

      if (data && data.length > 0) {
        setTimeout(() => {
          void reconcileLoadedReservationsPaymentStatus(data, establishmentId).catch((error) => {
            console.error("Erro ao reconciliar status por pagamento:", error);
          });
        }, 100);
      }

      return data;
    },
  });

  // Criar nova reserva com proteção contra race conditions
  const createReservation = useMutation({
    mutationFn: async (reservation: ReservationCreatePayload) => {
      const { data: { user } } = await supabase.auth.getUser();
      const establishmentId = getEstablishmentId();
      
      if (!establishmentId) {
        throw new Error("Estabelecimento não selecionado");
      }

      const skipPreCheck = Boolean(reservation.skipPreCreateAvailabilityCheck);
      const reservationForDb = stripClientOnlyReservationFields(reservation);

      // Importar validação de disponibilidade
      const { validateRoomAvailability, validateCategoryAvailability } = await import("@/lib/reservationUtils");
      const { logError } = await import("@/lib/errorLogger");
      const { monitorOperation } = await import("@/lib/monitoring");

      // Validar disponibilidade ANTES do lock (opcional se o mapa já validou)
      if (!skipPreCheck && reservationForDb.room_id && reservationForDb.checkin_date && reservationForDb.checkout_date) {
        // Validar quarto específico
        const availability = await validateRoomAvailability(
          reservationForDb.room_id,
          reservationForDb.checkin_date,
          reservationForDb.checkout_date,
        );

        if (!availability.available) {
          void logError({
            error: new Error(availability.reason || "Quarto não disponível"),
            context: "reservations.createReservation",
            severity: "medium",
            metadata: {
              room_id: reservationForDb.room_id,
              checkin_date: reservationForDb.checkin_date,
              checkout_date: reservationForDb.checkout_date,
            },
          });
          throw new Error(availability.reason || "Quarto não disponível no período solicitado");
        }
      } else if (
        !skipPreCheck &&
        reservationForDb.category_id &&
        reservationForDb.checkin_date &&
        reservationForDb.checkout_date
      ) {
        const categoryAvailability = await validateCategoryAvailability(
          reservationForDb.category_id,
          reservationForDb.checkin_date,
          reservationForDb.checkout_date,
        );

        if (!categoryAvailability.available) {
          void logError({
            error: new Error(categoryAvailability.reason || "Categoria sem quartos disponíveis"),
            context: "reservations.createReservation",
            severity: "medium",
            metadata: {
              category_id: reservationForDb.category_id,
              checkin_date: reservationForDb.checkin_date,
              checkout_date: reservationForDb.checkout_date,
              available_rooms: categoryAvailability.availableRooms || 0,
            },
          });
          throw new Error(categoryAvailability.reason || "Nenhum quarto disponível nesta categoria");
        }
      }

      return await monitorOperation("createReservation", async () => {
        const endCritical = startReservationTrace("createReservation.critical");
        const reservationData = {
          establishment_id: establishmentId,
          room_id: reservationForDb.room_id || null,
          category_id: reservationForDb.category_id || null,
          guest_id: reservationForDb.guest_id || null,
          client_id: reservationForDb.client_id || null,
          financial_responsible_id: reservationForDb.financial_responsible_id || null,
          guest_name: reservationForDb.guest_name || null,
          adults: reservationForDb.adults || 1,
          children: reservationForDb.children || 0,
          total_amount: reservationForDb.total_amount || 0,
          paid_amount: reservationForDb.paid_amount || 0,
          payment_status: reservationForDb.payment_status || "pending",
          status: reservationForDb.status || "pending",
          notes: reservationForDb.notes || null,
          checkin_time: reservationForDb.checkin_time || null,
          checkout_time: reservationForDb.checkout_time || null,
          pricing_plan_id: reservationForDb.pricing_plan_id || null,
          created_by: user?.id || null,
          expiration_date: reservationForDb.expiration_date || null,
          channel: reservationForDb.channel || "direct",
          coupon_id: (reservationForDb as { coupon_id?: string | null }).coupon_id || null,
        };

        // Chamar função com lock (ordem: obrigatórios primeiro, opcionais depois)
        const { createReservationWithLock } = await import("@/lib/pmsApi");
        let lockResult: { success?: boolean; error?: string; reservation_id?: string } | null = null;
        let lockError: { message?: string } | null = null;
        try {
          lockResult = await createReservationWithLock({
            p_reservation_data: reservationData,
            p_checkin_date: reservationForDb.checkin_date,
            p_checkout_date: reservationForDb.checkout_date,
            p_establishment_id: establishmentId,
            p_room_id: reservationForDb.room_id || null,
            p_category_id: reservationForDb.category_id || null,
          });
        } catch (error) {
          lockError = { message: error instanceof Error ? error.message : "Erro ao criar reserva com lock" };
        }

        if (lockError) {
          void logError({
            error: lockError,
            context: "reservations.createReservation.lock",
            severity: "high",
            metadata: { reservation_data: reservationData },
          });
          throw new Error(lockError.message || "Erro ao criar reserva com lock");
        }

        if (!lockResult?.success) {
          const errorMessage = lockResult?.error || "Erro ao criar reserva";
          
          // Debug: Log detalhado do erro
          console.error("❌ Erro ao criar reserva:", {
            error: errorMessage,
            lockResult: lockResult,
            reservationData: {
              room_id: reservation.room_id,
              category_id: reservation.category_id,
              checkin_date: reservation.checkin_date,
              checkout_date: reservation.checkout_date,
              status: reservation.status
            }
          });
          
          // Se o erro menciona quarto bloqueado ou manutenção, verificar o status real do quarto
          if (reservation.room_id && (errorMessage.includes("bloqueado") || errorMessage.includes("manutenção") || errorMessage.includes("interditado"))) {
            const { data: roomStatus } = await supabase
              .from("rooms")
              .select("id, room_number, name, status, is_blocked")
              .eq("id", reservation.room_id)
              .single();
            
            console.error("🔍 Status do quarto:", roomStatus);
          }
          
          void logError({
            error: new Error(errorMessage),
            context: "reservations.createReservation.validation",
            severity: "medium",
            metadata: { 
              lock_result: lockResult,
              reservation_data: reservationData,
              room_id: reservation.room_id,
              category_id: reservation.category_id
            },
          });
          throw new Error(errorMessage);
        }

        // Buscar a reserva criada com todos os relacionamentos
        const { data: newReservation, error: fetchError } = await supabase
          .from("reservations")
          .select(RESERVATION_RELATIONS_ROOMS_CATEGORIES_SELECT)
          .eq("id", lockResult.reservation_id)
          .single();

        if (fetchError || !newReservation) {
          void logError({
            error: fetchError || new Error("Reserva não encontrada após criação"),
            context: "reservations.createReservation.fetch",
            severity: "high",
            metadata: { reservation_id: lockResult.reservation_id },
          });
          throw fetchError || new Error("Erro ao buscar reserva criada");
        }

        endCritical();
        return newReservation;
      });
    },
    onSuccess: (newReservation) => {
      upsertReservationInQueryCache(queryClient, newReservation);
      invalidateReservationViews(queryClient, [["web_checkin"]]);
      scheduleChannelSyncAfterInventoryChange(getEstablishmentId());
      toast.success("Reserva criada com sucesso!");
      void runAfterReservationCreated(newReservation);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar reserva");
    },
  });

  // Atualizar reserva
  const updateReservation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & ReservationUpdate) => {
      console.log("🔄 useReservations.updateReservation chamado:", { id: id.substring(0, 8), updates });
      
      // IMPORTANTE: Buscar dados ANTIGOS da reserva ANTES de atualizar para detectar alterações
      const { data: oldReservation } = await supabase
        .from("reservations")
        .select(`
          checkin_date,
          checkout_date,
          notes,
          room_id,
          category_id,
          rooms (room_number, name),
          room_categories (name)
        `)
        .eq("id", id)
        .single();
      
      // Detectar se é uma extensão de reserva (checkout_date sendo atualizado para uma data posterior)
      // IMPORTANTE: Verificar ANTES de fazer o update para ter a data original
      let isExtension = false;
      let oldCheckoutDate: string | null = null;
      let newCheckoutDate: string | null = null;
      
      if (updates.checkout_date && oldReservation?.checkout_date) {
        oldCheckoutDate = oldReservation.checkout_date;
        newCheckoutDate = updates.checkout_date;
        
        // Comparar datas para verificar se é uma extensão
        // Normalizar datas para comparação (ignorar hora)
        const oldDate = new Date(oldCheckoutDate);
        oldDate.setHours(0, 0, 0, 0);
        const newDate = new Date(newCheckoutDate);
        newDate.setHours(0, 0, 0, 0);
        
        if (newDate > oldDate) {
          isExtension = true;
          console.log("📅 Extensão de reserva detectada:", {
            oldCheckout: oldCheckoutDate,
            newCheckout: newCheckoutDate,
            oldDate: oldDate.toISOString(),
            newDate: newDate.toISOString()
          });
        }
      }
      
      // Se o room_id foi atualizado, buscar o category_id do novo quarto
      if (updates.room_id !== undefined && updates.room_id !== null) {
        const { data: roomData } = await supabase
          .from("rooms")
          .select("category_id")
          .eq("id", updates.room_id)
          .single();
        
        if (roomData?.category_id) {
          updates.category_id = roomData.category_id;
          console.log("🔄 category_id atualizado para:", roomData.category_id.substring(0, 8));
        }
      }
      
      const { data, error } = await supabase
        .from("reservations")
        .update(updates)
        .eq("id", id)
        .select(RESERVATION_RELATIONS_WITH_PRICING_PLAN_SELECT)
        .single();

      if (error) {
        console.error("❌ Erro no update:", error);
        throw error;
      }
      
      console.log("✅ Reserva atualizada no banco:", {
        id: data.id.substring(0, 8),
        checkin: data.checkin_date,
        checkout: data.checkout_date,
        room: data.room_id?.substring(0, 8) || "sem quarto",
        category: data.category_id?.substring(0, 8) || "sem categoria",
        isExtension
      });

      // Mensagens & Cobranças: envio automático "Após confirmação da reserva" quando status passa a confirmed
      if (updates.status === "confirmed" && data?.establishment_id) {
        try {
          const { data: ccConfig } = await supabase
            .from("checkin_charge_config")
            .select("send_timing")
            .eq("establishment_id", data.establishment_id)
            .eq("enabled", true)
            .maybeSingle();
          if (ccConfig?.send_timing === "after_confirmation") {
            await (await import("@/lib/pmsApi")).invokePmsFunction("send-checkin-charge", {
              body: { reservation_id: id, intent: "checkin_reminder" },
            });
          }
        } catch (e) {
          console.warn("Mensagens & Cobranças (after_confirmation):", e);
        }
      }

      // Recalcular política de cancelamento se datas foram alteradas
      if (oldReservation && (updates.checkin_date || updates.checkout_date)) {
        const oldCheckin = oldReservation.checkin_date;
        const oldCheckout = oldReservation.checkout_date;
        const newCheckin = updates.checkin_date || oldCheckin;
        const newCheckout = updates.checkout_date || oldCheckout;

        if (oldCheckin && oldCheckout && (oldCheckin !== newCheckin || oldCheckout !== newCheckout)) {
          try {
            await recalculatePolicyAfterDateChange(data.id, newCheckin, newCheckout);
            console.log("✅ Política de cancelamento recalculada após alteração de datas");
          } catch (error) {
            console.error("⚠️ Erro ao recalcular política de cancelamento:", error);
            // Não falhar o update se houver erro no recálculo
          }
        }
      }
      
      // IMPORTANTE: NÃO enviar email de extensão aqui no updateReservation
      // O email de extensão será enviado pelo ReservationPaymentModal quando o pagamento for confirmado
      // Isso evita duplicação de emails
      if (isExtension && newCheckoutDate) {
        console.log("📅 Extensão detectada no updateReservation (email será enviado quando pagamento for confirmado):", {
          reservationId: id.substring(0, 8),
          oldCheckout: oldCheckoutDate,
          newCheckout: newCheckoutDate
        });
      }
      
      // Detectar alterações relevantes para enviar email de modificação
      if (oldReservation) {
        // Normalizar datas para comparação (remover hora se houver)
        const normalizeDate = (dateStr: string | null | undefined): string | null => {
          if (!dateStr) return null;
          return dateStr.split('T')[0]; // Pegar apenas a parte da data (YYYY-MM-DD)
        };
        
        const oldCheckinNormalized = normalizeDate(oldReservation.checkin_date);
        const newCheckinNormalized = normalizeDate(updates.checkin_date);
        const oldCheckoutNormalized = normalizeDate(oldReservation.checkout_date);
        const newCheckoutNormalized = normalizeDate(updates.checkout_date);
        
        const checkinChanged = updates.checkin_date !== undefined && oldCheckinNormalized !== newCheckinNormalized;
        const checkoutChanged = updates.checkout_date !== undefined && oldCheckoutNormalized !== newCheckoutNormalized && !isExtension; // Não enviar se for extensão (já tem email próprio)
        // Verificar mudança de quarto: quando room_id está no updates e é diferente do antigo, OU quando era null e agora tem valor, OU quando tinha valor e agora é null
        const roomChanged = updates.room_id !== undefined && (
          (updates.room_id !== null && oldReservation.room_id !== updates.room_id) ||
          (updates.room_id === null && oldReservation.room_id !== null) ||
          (updates.room_id !== null && oldReservation.room_id === null)
        );
        // Verificar mudança de categoria: quando category_id está no updates e é diferente do antigo, OU quando era null e agora tem valor, OU quando tinha valor e agora é null
        const categoryChanged = updates.category_id !== undefined && (
          (updates.category_id !== null && oldReservation.category_id !== updates.category_id) ||
          (updates.category_id === null && oldReservation.category_id !== null) ||
          (updates.category_id !== null && oldReservation.category_id === null)
        );
        
        // Verificar se houve alteração de categoria mesmo sem mudança explícita de category_id (quando muda o quarto)
        const categoryChangedByRoom = roomChanged && data.room_categories?.name && oldReservation.room_categories?.name && 
          data.room_categories.name !== oldReservation.room_categories.name;
        
        console.log("🔍 Verificando alterações na reserva:", {
          updatesKeys: Object.keys(updates),
          checkinChanged,
          checkoutChanged,
          roomChanged,
          categoryChanged,
          categoryChangedByRoom,
          isExtension,
          oldCheckin: oldCheckinNormalized,
          newCheckin: newCheckinNormalized,
          oldCheckout: oldCheckoutNormalized,
          newCheckout: newCheckoutNormalized,
          oldRoomId: oldReservation.room_id?.substring(0, 8) || "null",
          newRoomId: updates.room_id?.substring(0, 8) || "null",
          oldCategoryId: oldReservation.category_id?.substring(0, 8) || "null",
          newCategoryId: updates.category_id?.substring(0, 8) || "null",
        });
        
        if (checkinChanged || checkoutChanged || roomChanged || categoryChanged || categoryChangedByRoom) {
          console.log("📧 Alteração detectada na reserva, enviando email de modificação:", {
            checkinChanged,
            checkoutChanged,
            roomChanged,
            categoryChanged,
            categoryChangedByRoom,
            oldCheckin: oldCheckinNormalized,
            newCheckin: newCheckinNormalized,
            oldCheckout: oldCheckoutNormalized,
            newCheckout: newCheckoutNormalized
          });
          
          try {
            const { triggerEmail } = await import("@/lib/emailService");
            const { formatDate } = await import("@/lib/emailTemplateEngine");
            
            // Preparar variáveis adicionais para o template
            const additionalVariables: Record<string, any> = {
              checkin_date_changed: checkinChanged || checkoutChanged,
              room_changed: roomChanged,
              category_changed: categoryChanged || categoryChangedByRoom,
            };
            
            // Adicionar valores antigos se houver alteração
            if (checkinChanged || checkoutChanged) {
              if (oldReservation.checkin_date) {
                additionalVariables.old_checkin_date = formatDate(oldReservation.checkin_date);
              }
              if (oldReservation.checkout_date) {
                additionalVariables.old_checkout_date = formatDate(oldReservation.checkout_date);
              }
            }
            
            if (roomChanged) {
              if (oldReservation.rooms?.room_number) {
                additionalVariables.old_room_number = oldReservation.rooms.room_number;
              }
              if (oldReservation.rooms?.name) {
                additionalVariables.old_room_name = oldReservation.rooms.name;
              }
            }
            
            if (categoryChanged || categoryChangedByRoom) {
              if (oldReservation.room_categories?.name) {
                additionalVariables.old_category_name = oldReservation.room_categories.name;
              }
            }
            
            await triggerEmail('reservation.modified', data, additionalVariables);
          } catch (emailError) {
            console.error("❌ Erro ao enviar email de modificação:", emailError);
            // Não bloquear a atualização se o email falhar
          }
        }

        // Channex CRS: ao trocar quarto/categoria no PMS, atualizar também o room_type da reserva no canal.
        if ((roomChanged || categoryChanged || categoryChangedByRoom) && data?.category_id) {
          const overbookingContext = String(oldReservation?.notes ?? "").toLowerCase().includes("overbooking");
          try {
            const { data: channexSyncResult, error: channexSyncError } = await supabase.functions.invoke("channex-booking-crs-update", {
              body: {
                reservation_id: data.id,
                category_id: data.category_id,
                overbooking_context: overbookingContext,
              },
            });
            if (channexSyncError) throw channexSyncError;

            const channexPayload = (channexSyncResult ?? {}) as { success?: boolean; skipped?: boolean; reason?: string };
            if (channexPayload.success) {
              await logActivity({
                actionType: "updated",
                entityType: "reservation",
                entityId: data.id,
                entityCode: data.reservation_code,
                description: `Categoria/quarto da reserva ${data.reservation_code} sincronizado com Channex`,
                metadata: {
                  source: "channex_crs",
                  synced: true,
                  category_id: data.category_id,
                },
              });
            } else if (channexPayload.skipped) {
              await logActivity({
                actionType: "updated",
                entityType: "reservation",
                entityId: data.id,
                entityCode: data.reservation_code,
                description: `Sincronização com Channex não aplicada para a reserva ${data.reservation_code}`,
                metadata: {
                  source: "channex_crs",
                  synced: false,
                  skipped: true,
                  reason: channexPayload.reason ?? "sem detalhes",
                },
              });
            }
          } catch (channexErr) {
            console.warn("⚠️ Falha ao sincronizar troca de categoria/quarto com Channex CRS:", channexErr);
          }
        }
      }
      
      // Invalidar cache de web_checkin sempre que a reserva for atualizada
      // Isso garante que datas, quarto, categoria e outros dados sejam atualizados no check-in web
      queryClient.invalidateQueries({ queryKey: ["web_checkin"], refetchType: "active" });
      patchReservationsInQueryCache(queryClient, [{ id: data.id, patch: data as Record<string, unknown> }]);
      invalidateReservationViews(queryClient);

      return data;
    },
    // ⚠️ NÃO usar onSuccess automático aqui - deixar o componente controlar a invalidação
    // onSuccess: () => { ... },
    onError: (error: any) => {
      console.error("❌ Erro ao atualizar reserva:", error);
      toast.error(error.message || "Erro ao atualizar reserva");
    },
  });

  // Deletar/Cancelar reserva
  const cancelReservation = useMutation({
    mutationFn: async ({ id, reason, refundPayments = false }: { id: string; reason: string; refundPayments?: boolean }) => {
      const endCritical = startReservationTrace("cancelReservation.critical");
      try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Buscar dados da reserva antes de cancelar
      const { data: reservationData } = await supabase
        .from("reservations")
        .select(`
          id, 
          reservation_code, 
          payment_status, 
          paid_amount, 
          total_amount,
          status,
          guest_name,
          guest_id,
          client_id,
          establishment_id,
          guest:clients!guest_id(full_name),
          financial_responsible:clients!client_id(full_name)
        `)
        .eq("id", id)
        .single();
      
      // Se deve estornar pagamentos, remover todos os pagamentos da reserva
      if (refundPayments && reservationData) {
        // Buscar todos os pagamentos da reserva
        const { data: payments, error: paymentsError } = await supabase
          .from("payments")
          .select("id, amount")
          .eq("reservation_id", id);

        if (paymentsError) {
          console.error("Erro ao buscar pagamentos:", paymentsError);
        } else if (payments && payments.length > 0) {
          // Registrar estornos financeiros para cada pagamento antes de remover
          const establishmentIdForRefund =
            reservationData.establishment_id || getEstablishmentId();

          if (!establishmentIdForRefund) {
            console.error(
              "Não foi possível identificar establishment_id para registrar estornos financeiros da reserva cancelada",
              { reservationId: id, reservationCode: reservationData.reservation_code }
            );
          } else {
            await Promise.all(
              payments.map(async (payment) => {
                const amount = Number(payment.amount || 0);
                if (!payment.id || !amount) return;
                const refundResult = await recordProcessedRefund({
                  establishment_id: establishmentIdForRefund,
                  payment_id: payment.id,
                  reservation_id: reservationData.id,
                  amount,
                  reason: reason
                    ? `Estorno por cancelamento da reserva ${reservationData.reservation_code}: ${reason}`
                    : `Estorno por cancelamento da reserva ${reservationData.reservation_code}`,
                  metadata: {
                    cancellation_reason: reason || null,
                    reservation_code: reservationData.reservation_code,
                  },
                });
                if (!refundResult.success) {
                  console.error(
                    "Erro ao registrar estorno financeiro ao cancelar reserva:",
                    refundResult.error,
                  );
                }
              }),
            );
          }

          // Remover todos os pagamentos
          const { error: deleteError } = await supabase
            .from("payments")
            .delete()
            .eq("reservation_id", id);

          if (deleteError) {
            console.error("Erro ao remover pagamentos:", deleteError);
            throw new Error("Erro ao estornar pagamentos");
          }
        }
      }

      // Guardar status original antes de cancelar
      const originalStatus = reservationData?.status;
      
      // Atualizar a reserva
      const updateData: any = {
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        cancelled_by: user?.id || null,
        cancellation_reason: reason || null
      };

      // Se estornou pagamentos, zerar o valor pago e atualizar status
      if (refundPayments) {
        updateData.paid_amount = 0;
        updateData.payment_status = "pending";
      }

      const { error } = await supabase
        .from("reservations")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      try {
        const { invokeFnrhLifecycle } = await import("@/lib/fnrh/invokeFnrhLifecycle");
        void invokeFnrhLifecycle(id, "cancel");
      } catch {
        /* FNRH opcional */
      }

      return { ...reservationData, refundPayments, originalStatus, cancellation_reason: reason };
      } finally {
        endCritical();
      }
    },
    onSuccess: (reservationData) => {
      if (reservationData?.id) {
        applyReservationMapDelta(
          queryClient,
          {
            id: reservationData.id,
            patch: {
              status: "cancelled",
              payment_status: reservationData.refundPayments ? "pending" : reservationData.payment_status,
              paid_amount: reservationData.refundPayments ? 0 : reservationData.paid_amount,
            },
          },
          [["reservation_payments"], ["refunds"], ["pending"], ["web_checkin"]],
        );
      } else {
        invalidateReservationViews(queryClient, [
          ["reservation_payments"],
          ["refunds"],
          ["pending"],
        ]);
      }
      scheduleChannelSyncAfterInventoryChange(
        reservationData.establishment_id || getEstablishmentId(),
      );
      toast.success("Reserva cancelada com sucesso!");
      if (reservationData) {
        void runAfterReservationCancelled(reservationData);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao cancelar reserva");
    },
  });

  /** No-show manual: política + FNRH PATCH noshow (hóspedes ou reserva). */
  const markReservationNoShow = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { data: beforeRow } = await supabase
        .from("reservations")
        .select("id, reservation_code, establishment_id, status, guest_name, payment_status")
        .eq("id", id)
        .single();

      const { data: { user } } = await supabase.auth.getUser();
      const { applyStaffNoShow } = await import("@/utils/cancellationPolicyService");
      const result = await applyStaffNoShow(id, user?.id);
      if (!result.success) {
        throw new Error(result.error || "Não foi possível registrar no-show");
      }

      try {
        const { invokeFnrhLifecycle } = await import("@/lib/fnrh/invokeFnrhLifecycle");
        void invokeFnrhLifecycle(id, "noshow");
      } catch {
        /* FNRH opcional */
      }

      const { data: reservationData } = await supabase
        .from("reservations")
        .select("id, reservation_code, establishment_id, status, guest_name, payment_status")
        .eq("id", id)
        .single();

      return {
        ...result,
        reservationData,
        previousStatus: beforeRow?.status ?? null,
      };
    },
    onSuccess: async (payload) => {
      const reservationData = payload.reservationData;
      if (reservationData) {
        try {
          await logActivity({
            actionType: "updated",
            entityType: "reservation",
            entityId: reservationData.id,
            entityCode: reservationData.reservation_code,
            description: `Reserva ${reservationData.reservation_code} marcada como no-show`,
            oldValues: { status: payload.previousStatus },
            newValues: { status: "noshow", penalty: payload.penalty },
            metadata: { no_show: true },
          });
        } catch (logError) {
          console.error("Erro ao registrar log de no-show:", logError);
        }
      }

      if (reservationData?.id) {
        applyReservationMapDelta(
          queryClient,
          {
            id: reservationData.id,
            patch: {
              status: "noshow",
              penalty: payload.penalty,
            },
          },
          [["reservation"], ["reservation_payments"], ["pending"]],
        );
      } else {
        invalidateReservationViews(queryClient, [
          ["reservation"],
          ["reservation_payments"],
          ["pending"],
        ]);
      }

      if (reservationData?.id) {
        void maybeFinalizeOtaCancellationAfterPmsCancel(reservationData.id).catch((finalizeErr) => {
          console.warn("No-show: finalização OTA opcional falhou", finalizeErr);
        });
      }

      scheduleChannelSyncAfterInventoryChange(
        reservationData?.establishment_id || getEstablishmentId(),
      );

      toast.success("Reserva marcada como no-show.");
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : "Erro ao marcar no-show";
      toast.error(msg);
    },
  });

  // Check-in
  const checkIn = useMutation({
    mutationFn: async ({ id, roomId, skipEmail }: { id: string; roomId?: string; skipEmail?: boolean }) => {
      const endCritical = startReservationTrace("checkIn.critical");
      try {
        const { checkInReservation } = await import("@/lib/pmsApi");
        const data = await checkInReservation(id, roomId);
        return { ...data, _skipEmail: skipEmail };
      } finally {
        endCritical();
      }
    },
        onSuccess: (updatedReservation) => {
          applyReservationMapDelta(
            queryClient,
            {
              id: updatedReservation.id,
              patch: {
                status: "checkedin",
                room_id: updatedReservation.room_id,
              },
            },
            [["web_checkin"]],
          );
          scheduleChannelSyncAfterInventoryChange(updatedReservation.establishment_id);
          toast.success("Check-in realizado com sucesso!");
          void runAfterCheckIn(updatedReservation as Record<string, unknown> & { id: string; _skipEmail?: boolean });
        },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao realizar check-in");
    },
  });

  // Check-out
  const checkOut = useMutation({
    mutationFn: async (id: string) => {
      const endCritical = startReservationTrace("checkOut.critical");
      try {
        const { checkOutReservation } = await import("@/lib/pmsApi");
        const data = await checkOutReservation(id);
        try {
          const { invokeFnrhLifecycle } = await import("@/lib/fnrh/invokeFnrhLifecycle");
          void invokeFnrhLifecycle(id, "checkout");
        } catch {
          /* FNRH opcional */
        }
        return data;
      } finally {
        endCritical();
      }
    },
        onSuccess: (updatedReservation) => {
          applyReservationMapDelta(
            queryClient,
            {
              id: updatedReservation.id,
              patch: { status: "checkedout" },
            },
            [["reservation"], ["web_checkin"]],
          );
          scheduleChannelSyncAfterInventoryChange(updatedReservation.establishment_id);
          toast.success("Check-out realizado com sucesso!");
          void runAfterCheckOut(updatedReservation as Record<string, unknown> & { id: string }, queryClient);
        },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao realizar check-out");
    },
  });

  // Substituir quarto de uma reserva
  const replaceReservationRoom = useMutation({
    mutationFn: async ({ id, newRoomId }: { id: string; newRoomId: string }) => {
      const { data: currentReservation } = await supabase
        .from("reservations")
        .select("notes")
        .eq("id", id)
        .maybeSingle();
      const overbookingContext = String((currentReservation as { notes?: string | null } | null)?.notes ?? "")
        .toLowerCase()
        .includes("overbooking");

      // Buscar category_id do novo quarto
      let newCategoryId = null;
      const { data: roomData } = await supabase
        .from("rooms")
        .select("category_id")
        .eq("id", newRoomId)
        .single();
      
      if (roomData?.category_id) {
        newCategoryId = roomData.category_id;
      }

      const updateData: any = { room_id: newRoomId };
      if (newCategoryId) {
        updateData.category_id = newCategoryId;
      }

      const { data, error } = await supabase
        .from("reservations")
        .update(updateData)
        .eq("id", id)
        .select(RESERVATION_RELATIONS_ROOMS_CATEGORIES_SELECT)
        .single();

      if (error) throw error;

      if (data?.category_id) {
        try {
          const { data: channexSyncResult, error: channexSyncError } = await supabase.functions.invoke("channex-booking-crs-update", {
            body: {
              reservation_id: data.id,
              category_id: data.category_id,
              overbooking_context: overbookingContext,
            },
          });
          if (channexSyncError) throw channexSyncError;

          const channexPayload = (channexSyncResult ?? {}) as { success?: boolean; skipped?: boolean; reason?: string };
          if (channexPayload.success) {
            await logActivity({
              actionType: "updated",
              entityType: "reservation",
              entityId: data.id,
              entityCode: data.reservation_code,
              description: `Categoria/quarto da reserva ${data.reservation_code} sincronizado com Channex`,
              metadata: {
                source: "channex_crs",
                synced: true,
                category_id: data.category_id,
              },
            });
          } else if (channexPayload.skipped) {
            await logActivity({
              actionType: "updated",
              entityType: "reservation",
              entityId: data.id,
              entityCode: data.reservation_code,
              description: `Sincronização com Channex não aplicada para a reserva ${data.reservation_code}`,
              metadata: {
                source: "channex_crs",
                synced: false,
                skipped: true,
                reason: channexPayload.reason ?? "sem detalhes",
              },
            });
          }
        } catch (channexErr) {
          console.warn("⚠️ Falha ao sincronizar substituição de quarto com Channex CRS:", channexErr);
        }
      }
      return data;
    },
        onSuccess: (data) => {
          if (data?.id) {
            patchReservationsInQueryCache(queryClient, [
              {
                id: data.id,
                patch: {
                  room_id: data.room_id,
                  category_id: data.category_id,
                  rooms: data.rooms,
                  room_categories: data.room_categories,
                },
              },
            ]);
          }
          invalidateReservationViews(queryClient, [["web_checkin"]]);
          toast.success("Quarto substituído com sucesso!");
        },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao substituir quarto");
    },
  });

  // Efetivar pré-reserva (converter em reserva)
  const confirmPreregistration = useMutation({
    mutationFn: async (id: string) => {
      // Buscar dados da pré-reserva
      const { data: preregistration, error: fetchError } = await supabase
        .from("reservations")
        .select("id, reservation_code, paid_amount, total_amount, expiration_date")
        .eq("id", id)
        .eq("status", "preregistration")
        .single();

      if (fetchError) throw fetchError;
      if (!preregistration) {
        throw new Error("Pré-reserva não encontrada ou já foi efetivada");
      }

      // Determinar novo status baseado no pagamento
      const paidAmount = Number(preregistration.paid_amount || 0);
      const totalAmount = Number(preregistration.total_amount || 0);
      const newStatus = paidAmount >= totalAmount && totalAmount > 0 ? "confirmed" : "unpaid";

      // Atualizar status e limpar expiration_date (ou manter para histórico)
      const updateData: ReservationUpdate = {
        status: newStatus,
        // Manter expiration_date para histórico, mas pode ser limpo se preferir
        // expiration_date: null,
      };

      const { data, error } = await supabase
        .from("reservations")
        .update(updateData)
        .eq("id", id)
        .select(RESERVATION_RELATIONS_ROOMS_CATEGORIES_SELECT)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (updatedReservation) => {
      upsertReservationInQueryCache(queryClient, updatedReservation);
      invalidateReservationViews(queryClient, [["web_checkin"]]);
      toast.success("Pré-reserva efetivada com sucesso!");
      void (async () => {
        try {
          await logActivity({
            actionType: "updated",
            entityType: "reservation",
            entityId: updatedReservation.id,
            entityCode: updatedReservation.reservation_code,
            description: `Pré-reserva ${updatedReservation.reservation_code} efetivada`,
            oldValues: { status: "preregistration" },
            newValues: { status: updatedReservation.status },
          });
        } catch (logError) {
          console.error("Erro ao registrar log de efetivação:", logError);
        }
      })();
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao efetivar pré-reserva");
    },
  });

  useEstablishmentReservationRealtime(selectedEstablishment?.id ?? getEstablishmentId());

  // Verificar e cancelar pré-reservas expiradas periodicamente
  useEffect(() => {
    const checkAndCancelExpired = async () => {
      try {
        const now = new Date();
        const nowISO = now.toISOString();
        
        // Buscar TODAS as pré-reservas com expiration_date para debug
        const { data: allPreregistrations, error: allError } = await supabase
          .from("reservations")
          .select("id, reservation_code, expiration_date, status, establishment_id")
          .eq("status", "preregistration")
          .not("expiration_date", "is", null);
        
        if (allPreregistrations && allPreregistrations.length > 0) {
          console.log(`📋 Total de pré-reservas com expiration_date: ${allPreregistrations.length}`);
          allPreregistrations.forEach((r: any) => {
            const expirationDate = new Date(r.expiration_date);
            const expiredSeconds = Math.floor((now.getTime() - expirationDate.getTime()) / 1000);
            const expiredMinutes = Math.floor(expiredSeconds / 60);
            console.log(`  - ${r.reservation_code}: expira em ${r.expiration_date} (${expiredSeconds > 0 ? `EXPIRADA há ${expiredMinutes} minutos` : `expira em ${-expiredMinutes} minutos`})`);
          });
        }
        
        // Buscar pré-reservas expiradas diretamente
        const { data: expiredReservations, error: fetchError } = await supabase
          .from("reservations")
          .select("id, reservation_code, expiration_date, status, establishment_id")
          .eq("status", "preregistration")
          .not("expiration_date", "is", null)
          .lte("expiration_date", nowISO);
        
        if (fetchError) {
          console.error("❌ Erro ao buscar pré-reservas expiradas:", fetchError);
          return;
        }
        
        if (expiredReservations && expiredReservations.length > 0) {
          console.log(`⏰ Encontradas ${expiredReservations.length} pré-reserva(s) expirada(s):`, 
            expiredReservations.map((r: any) => {
              const expirationDate = new Date(r.expiration_date);
              const expiredSeconds = Math.floor((now.getTime() - expirationDate.getTime()) / 1000);
              return {
                code: r.reservation_code,
                expiration: r.expiration_date,
                expirationLocal: expirationDate.toLocaleString('pt-BR'),
                expiredSeconds: expiredSeconds,
                expiredMinutes: Math.floor(expiredSeconds / 60),
                now: nowISO,
                nowLocal: now.toLocaleString('pt-BR')
              };
            })
          );
          
          // Tentar cancelar usando a função RPC primeiro
          const { data: cancelledCount, error: rpcError } = await supabase.rpc("cancel_expired_preregistrations");
          
          if (rpcError) {
            console.error("❌ Erro na função RPC, tentando cancelar diretamente:", rpcError);
            
            // Fallback: cancelar diretamente se a função RPC falhar
            let cancelledDirectly = 0;
            for (const reservation of expiredReservations) {
              const { error: updateError } = await supabase
                .from("reservations")
                .update({ 
                  status: "cancelled",
                  notes: (reservation.notes || "") + `\nCancelada automaticamente: pré-reserva expirada em ${reservation.expiration_date}`
                })
                .eq("id", reservation.id)
                .eq("status", "preregistration");
              
              if (updateError) {
                console.error(`❌ Erro ao cancelar pré-reserva ${reservation.reservation_code}:`, updateError);
              } else {
                cancelledDirectly++;
                console.log(`✅ Pré-reserva ${reservation.reservation_code} cancelada diretamente`);
              }
            }
            
            if (cancelledDirectly > 0) {
              // Invalidar queries após cancelamento direto
              queryClient.invalidateQueries({ queryKey: ["reservations"] });
              queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
            }
          } else {
            console.log(`📊 Função RPC retornou: ${cancelledCount} pré-reserva(s) cancelada(s)`);
            
            if (cancelledCount && cancelledCount > 0) {
              console.log(`✅ ${cancelledCount} pré-reserva(s) expirada(s) cancelada(s) pela função RPC`);
              // Invalidar queries para atualizar a lista
              queryClient.invalidateQueries({ queryKey: ["reservations"] });
              queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
              
              // Processar emails pendentes na fila imediatamente após cancelamento
              // Aguardar um pouco para garantir que o email foi adicionado à fila pela função SQL
              setTimeout(async () => {
                try {
                  const { processEmailQueue } = await import("@/lib/emailService");
                  
                  // Buscar emails pendentes relacionados a pré-reservas expiradas criados recentemente
                  // Buscar emails criados nos últimos 10 segundos para garantir que pegamos os recém-criados
                  const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
                  
                  // Usar 'as any' para contornar limitação de tipos do Supabase
                  const { data: pendingEmails, error: emailFetchError } = await (supabase as any)
                    .from("email_queue")
                    .select("id, created_at, reservation_id, recipient_email")
                    .eq("status", "pending")
                    .eq("event_type", "preregistration.expired")
                    .gte("created_at", tenSecondsAgo) // Apenas emails criados recentemente
                    .order("created_at", { ascending: false })
                    .limit(cancelledCount * 2); // Buscar até 2x o número de cancelamentos para garantir
                  
                  if (emailFetchError) {
                    console.error("❌ Erro ao buscar emails pendentes:", emailFetchError);
                    return;
                  }
                  
                  if (pendingEmails && pendingEmails.length > 0) {
                    console.log(`📧 Encontrados ${pendingEmails.length} email(s) pendente(s) de pré-reservas expiradas. Processando imediatamente...`);
                    // Processar os emails mais recentes primeiro (os que acabaram de ser criados)
                    for (const email of pendingEmails) {
                      try {
                        console.log(`📧 Processando email ${email.id} para ${email.recipient_email}...`);
                        const success = await processEmailQueue(email.id);
                        if (success) {
                          console.log(`✅ Email ${email.id} processado e enviado com sucesso para ${email.recipient_email}`);
                        } else {
                          console.warn(`⚠️ Email ${email.id} não foi processado com sucesso`);
                        }
                      } catch (emailError: any) {
                        console.error(`❌ Erro ao processar email ${email.id}:`, emailError?.message || emailError);
                        // Continuar processando outros emails mesmo se um falhar
                      }
                    }
                  } else {
                    console.warn(`⚠️ Nenhum email pendente encontrado para pré-reservas expiradas criado nos últimos 10 segundos. Tentando novamente...`);
                    // Aguardar mais um pouco e tentar novamente
                    setTimeout(async () => {
                      const { data: retryPendingEmails } = await (supabase as any)
                        .from("email_queue")
                        .select("id, created_at, recipient_email")
                        .eq("status", "pending")
                        .eq("event_type", "preregistration.expired")
                        .order("created_at", { ascending: false })
                        .limit(cancelledCount * 2);
                      
                      if (retryPendingEmails && retryPendingEmails.length > 0) {
                        console.log(`📧 Encontrados ${retryPendingEmails.length} email(s) pendente(s) na segunda tentativa. Processando...`);
                        for (const email of retryPendingEmails) {
                          try {
                            console.log(`📧 Processando email ${email.id} para ${email.recipient_email}...`);
                            const success = await processEmailQueue(email.id);
                            if (success) {
                              console.log(`✅ Email ${email.id} processado e enviado com sucesso`);
                            }
                          } catch (emailError: any) {
                            console.error(`❌ Erro ao processar email ${email.id}:`, emailError?.message || emailError);
                          }
                        }
                      }
                    }, 2000); // Aguardar mais 2 segundos antes da segunda tentativa
                  }
                } catch (emailProcessError: any) {
                  console.error("❌ Erro ao processar emails pendentes:", emailProcessError?.message || emailProcessError);
                }
              }, 300); // Reduzir para 300ms para processar mais rapidamente
            } else if (expiredReservations.length > 0) {
              // RPC retornou 0 mas temos "expiradas" - NÃO cancelar diretamente!
              // A RPC usa grace period (2 min) e pode ter ignorado pré-reservas recém-criadas.
              // Cancelar diretamente aqui quebraria o grace period (ex: pré-reserva criada há 1 min).
              console.log(`ℹ️ RPC retornou 0 canceladas (grace period). ${expiredReservations.length} pré-reserva(s) podem estar no período de proteção.`);
            }
          }
        } else {
          console.log(`ℹ️ Nenhuma pré-reserva expirada encontrada para cancelar (agora: ${nowISO})`);
        }
      } catch (err) {
        console.error("❌ Erro ao verificar pré-reservas expiradas:", err);
      }
    };
    
    // Executar imediatamente ao montar
    checkAndCancelExpired();
    
    // Executar periodicamente a cada 30 segundos
    const checkExpiredInterval = setInterval(checkAndCancelExpired, 30000);

    return () => clearInterval(checkExpiredInterval);
  }, [queryClient]);

  return {
    reservations: reservationsQuery.data || [],
    isLoading: reservationsQuery.isLoading,
    refetch: reservationsQuery.refetch,
    createReservation: createReservation.mutateAsync,
    updateReservation: updateReservation.mutateAsync,
    cancelReservation: cancelReservation.mutateAsync,
    markReservationNoShow: markReservationNoShow.mutateAsync,
    isMarkingNoShow: markReservationNoShow.isPending,
    checkIn: checkIn.mutateAsync,
    checkOut: checkOut.mutateAsync,
    isCheckoutPending: checkOut.isPending,
    replaceReservationRoom: replaceReservationRoom.mutateAsync,
    confirmPreregistration: confirmPreregistration.mutateAsync,
    isCreating: createReservation.isPending,
    isUpdating: updateReservation.isPending,
  };
};

