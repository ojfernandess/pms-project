import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { logActivity, createReservationUpdateDescription } from "@/lib/activityLogger";
import { useEffect } from "react";
import { format } from "date-fns";
import { recalculatePolicyAfterDateChange } from "@/utils/cancellationPolicyDateChange";
import { recordProcessedRefund } from "@/services/financial/refundService";
import { scheduleChannelSyncAfterInventoryChange } from "@/lib/channelSyncAfterRates";
import { maybeFinalizeOtaCancellationAfterPmsCancel } from "@/lib/otaFinalizeCancellationAfterPms";
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
      
      const { data, error } = await query.order("checkin_date", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar reservas");
        throw error;
      }

      // Atualizar status das reservas baseado em pagamento (para reservas antigas)
      // Isso garante que reservas sem pagamento tenham status "unpaid" mesmo que estejam como "confirmed"
      // IMPORTANTE: Esta atualização é feita de forma assíncrona e não bloqueia o carregamento
      if (data && data.length > 0) {
        // Executar atualizações em background sem bloquear a resposta
        setTimeout(async () => {
          try {
            const updates: Array<{ id: string; status: string }> = [];
            
            for (const reservation of data) {
              // Pular status especiais que não dependem de pagamento
              if (['blocked', 'cancelled', 'checkedin', 'checkedout', 'noshow', 'preregistration'].includes(reservation.status)) {
                continue;
              }

              const paidAmount = Number(reservation.paid_amount || 0);
              const baseTotalAmount = Number(reservation.total_amount || 0);

              // Taxas já vêm no embed `reservation_service_fees` do select principal — evita N+1 GETs
              // que sobrecarregavam o PostgREST e geravam 502 Bad Gateway em produção.
              const embeddedFees = Array.isArray(
                (reservation as { reservation_service_fees?: unknown }).reservation_service_fees,
              )
                ? (reservation as { reservation_service_fees: Array<{ amount?: unknown; quantity?: unknown }> })
                    .reservation_service_fees
                : [];
              const serviceFeesTotal = embeddedFees.reduce((sum: number, fee) => {
                return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
              }, 0);
              
              const totalWithFees = baseTotalAmount + serviceFeesTotal;
              
              let newStatus: string | null = null;
              
              // Determinar novo status baseado na nova lógica:
              // - "unpaid": sem pagamento
              // - "confirmed": valor base original pago (paid_amount >= total_amount base)
              // - "pending": há taxas pendentes OU base não paga completamente
              if (paidAmount === 0) {
                // Sem pagamento = Não Pago
                if (reservation.status !== "unpaid" && reservation.status !== "pending") {
                  newStatus = "unpaid";
                }
              } else if (paidAmount >= baseTotalAmount && baseTotalAmount > 0) {
                // Valor base pago: verificar se há taxas pendentes
                if (serviceFeesTotal > 0 && paidAmount < totalWithFees) {
                  // Base paga MAS com taxas pendentes = Pendente
                  if (reservation.status !== "pending") {
                    newStatus = "pending";
                  }
                } else {
                  // Base paga E sem taxas pendentes = Confirmada
                  if (reservation.status !== "confirmed" && reservation.status !== "checkedin" && reservation.status !== "checkedout") {
                    newStatus = "confirmed";
                  }
                }
              } else {
                // Base não paga completamente = Pendente
                if (reservation.status !== "pending") {
                  newStatus = "pending";
                }
              }
              
              if (newStatus) {
                updates.push({ id: reservation.id, status: newStatus });
              }
            }
            
            // Atualizar status em lote (apenas se houver atualizações)
            if (updates.length > 0) {
              // Fazer atualizações uma por uma para evitar sobrecarga e melhor tratamento de erros
              for (const update of updates) {
                try {
                  const { error } = await supabase
                    .from("reservations")
                    .update({ status: update.status })
                    .eq("id", update.id);
                  
                  if (error) {
                    // Se o erro for porque o status não existe no enum, usar "pending" como fallback
                    if (error.code === '23502' || error.message?.includes('invalid input value') || error.message?.includes('enum')) {
                      console.warn(`Status "${update.status}" não disponível no enum, usando "pending" para reserva ${update.id}`);
                      // Tentar com "pending" se "unpaid" falhar
                      if (update.status === "unpaid") {
                        const { error: fallbackError } = await supabase
                          .from("reservations")
                          .update({ status: "pending" })
                          .eq("id", update.id);
                        if (fallbackError) {
                          console.warn(`Erro ao atualizar status da reserva ${update.id} com fallback:`, fallbackError);
                        }
                      }
                    } else {
                      console.warn(`Erro ao atualizar status da reserva ${update.id}:`, error);
                    }
                  }
                } catch (error: any) {
                  console.warn(`Erro ao atualizar status da reserva ${update.id}:`, error);
                }
              }
            }
          } catch (error) {
            console.error("Erro ao atualizar status das reservas:", error);
            // Não bloquear o carregamento se houver erro
          }
        }, 100); // Executar após 100ms para não bloquear o carregamento
      }

      return data;
    },
  });

  // Criar nova reserva com proteção contra race conditions
  const createReservation = useMutation({
    mutationFn: async (reservation: Omit<ReservationInsert, "reservation_code">) => {
      const { data: { user } } = await supabase.auth.getUser();
      const establishmentId = getEstablishmentId();
      
      if (!establishmentId) {
        throw new Error("Estabelecimento não selecionado");
      }

      // Importar validação de disponibilidade
      const { validateRoomAvailability, validateCategoryAvailability } = await import("@/lib/reservationUtils");
      const { logError } = await import("@/lib/errorLogger");
      const { monitorOperation } = await import("@/lib/monitoring");

      // Validar disponibilidade ANTES de tentar criar
      if (reservation.room_id && reservation.checkin_date && reservation.checkout_date) {
        // Validar quarto específico
        const availability = await validateRoomAvailability(
          reservation.room_id,
          reservation.checkin_date,
          reservation.checkout_date
        );

        if (!availability.available) {
          await logError({
            error: new Error(availability.reason || "Quarto não disponível"),
            context: "reservations.createReservation",
            severity: "medium",
            metadata: {
              room_id: reservation.room_id,
              checkin_date: reservation.checkin_date,
              checkout_date: reservation.checkout_date,
            },
          });
          throw new Error(availability.reason || "Quarto não disponível no período solicitado");
        }
      } else if (reservation.category_id && reservation.checkin_date && reservation.checkout_date) {
        // Validar categoria (sem quarto específico)
        const categoryAvailability = await validateCategoryAvailability(
          reservation.category_id,
          reservation.checkin_date,
          reservation.checkout_date
        );

        if (!categoryAvailability.available) {
          await logError({
            error: new Error(categoryAvailability.reason || "Categoria sem quartos disponíveis"),
            context: "reservations.createReservation",
            severity: "medium",
            metadata: {
              category_id: reservation.category_id,
              checkin_date: reservation.checkin_date,
              checkout_date: reservation.checkout_date,
              available_rooms: categoryAvailability.availableRooms || 0,
            },
          });
          throw new Error(categoryAvailability.reason || "Nenhum quarto disponível nesta categoria");
        }
      }

      // Usar função com lock para criar reserva (proteção contra race conditions)
      return await monitorOperation("createReservation", async () => {
        // Preparar dados para a função
        const reservationData = {
          establishment_id: establishmentId,
          room_id: reservation.room_id || null,
          category_id: reservation.category_id || null,
          guest_id: reservation.guest_id || null,
          client_id: reservation.client_id || null,
          financial_responsible_id: reservation.financial_responsible_id || null,
          guest_name: reservation.guest_name || null,
          adults: reservation.adults || 1,
          children: reservation.children || 0,
          total_amount: reservation.total_amount || 0,
          paid_amount: reservation.paid_amount || 0,
          payment_status: reservation.payment_status || "pending",
          status: reservation.status || "pending",
          notes: reservation.notes || null,
          checkin_time: reservation.checkin_time || null,
          checkout_time: reservation.checkout_time || null,
          pricing_plan_id: reservation.pricing_plan_id || null,
          created_by: user?.id || null,
          expiration_date: reservation.expiration_date || null,
          channel: reservation.channel || "direct",
          coupon_id: (reservation as any).coupon_id || null,
        };

        // Chamar função com lock (ordem: obrigatórios primeiro, opcionais depois)
        const { data: lockResult, error: lockError } = await supabase.rpc(
          "create_reservation_with_lock",
          {
            p_reservation_data: reservationData,
            p_checkin_date: reservation.checkin_date,
            p_checkout_date: reservation.checkout_date,
            p_establishment_id: establishmentId,
            p_room_id: reservation.room_id || null,
            p_category_id: reservation.category_id || null,
          }
        );

        if (lockError) {
          await logError({
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
          
          await logError({
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
          await logError({
            error: fetchError || new Error("Reserva não encontrada após criação"),
            context: "reservations.createReservation.fetch",
            severity: "high",
            metadata: { reservation_id: lockResult.reservation_id },
          });
          throw fetchError || new Error("Erro ao buscar reserva criada");
        }

        return newReservation;
      });
    },
        onSuccess: async (newReservation) => {
          // Criar notificação para nova reserva
          try {
            const establishmentId = getEstablishmentId();
            if (establishmentId && newReservation) {
              // Buscar dados do hóspede para a mensagem
              const guestName =
                newReservation.guest?.full_name ||
                newReservation.financial_responsible?.full_name ||
                (newReservation.guest_name && String(newReservation.guest_name).trim()) ||
                "Hóspede";
              
              await supabase.rpc("create_notification_for_establishment", {
                p_establishment_id: establishmentId,
                p_type: "new_reservation",
                p_title: "Nova Reserva Criada",
                p_message: `Nova reserva ${newReservation.reservation_code || ''} criada para ${guestName}`,
                p_priority: "medium",
                p_metadata: {
                  reservation_id: newReservation.id,
                  reservation_code: newReservation.reservation_code,
                },
              });
            }
          } catch (error) {
            console.error("Erro ao criar notificação de nova reserva:", error);
            // Não bloquear a criação da reserva se a notificação falhar
          }

          // Criar web check-in para a nova reserva
          try {
            // Obter establishmentId dentro do onSuccess
            const establishmentId = getEstablishmentId();
            
            if (newReservation?.id && establishmentId) {
              // Aguardar um pouco mais para garantir que o reservation_code foi gerado pelo trigger
              // Tentar buscar até 3 vezes com delay crescente
              let reservationWithCode = null;
              let attempts = 0;
              const maxAttempts = 3;
              
              while (attempts < maxAttempts && !reservationWithCode?.reservation_code) {
                await new Promise(resolve => setTimeout(resolve, 500 * (attempts + 1)));
                
                const { data, error: fetchError } = await supabase
                  .from("reservations")
                  .select("id, reservation_code, checkin_date")
                  .eq("id", newReservation.id)
                  .single();

                if (!fetchError && data?.reservation_code) {
                  reservationWithCode = data;
                  break;
                }
                
                attempts++;
              }

              if (!reservationWithCode || !reservationWithCode.reservation_code) {
                console.error("Reservation code não foi gerado para a reserva após", maxAttempts, "tentativas:", newReservation.id);
                // Tentar criar web_checkin mesmo sem código, será atualizado depois
                return;
              }

              const reservationCode = reservationWithCode.reservation_code;
              
              const { locatorService } = await import("@/lib/locatorService");
              
              // Gerar token único
              const token = locatorService.generateWebCheckinToken(
                newReservation.id,
                reservationCode
              );

              // Calcular data de expiração (7 dias antes do check-in ou no check-in, o que for menor)
              const checkinDate = new Date(reservationWithCode.checkin_date);
              const expiresAt = new Date();
              expiresAt.setDate(expiresAt.getDate() + 7);
              
              if (checkinDate < expiresAt) {
                expiresAt.setTime(checkinDate.getTime());
              }

              // Verificar se já existe web_checkin para esta reserva
              const { data: existingWebCheckin } = await supabase
                .from("web_checkin")
                .select("id, locator")
                .eq("reservation_id", newReservation.id)
                .maybeSingle();

              if (!existingWebCheckin) {
                // Criar web check-in
                const { error: webCheckinError } = await supabase
                  .from("web_checkin")
                  .insert({
                    reservation_id: newReservation.id,
                    establishment_id: establishmentId,
                    token: token,
                    locator: reservationCode,
                    expires_at: expiresAt.toISOString(),
                    status: "pending",
                  });

                if (webCheckinError) {
                  console.error("Erro ao criar web check-in:", webCheckinError);
                } else {
                  console.log("✅ Web check-in criado com sucesso para reserva:", reservationCode);
                }
              } else {
                // Atualizar web_checkin existente com o locator correto se necessário
                if (existingWebCheckin.locator !== reservationCode) {
                  const { error: updateError } = await supabase
                    .from("web_checkin")
                    .update({
                      locator: reservationCode,
                      token: token,
                      expires_at: expiresAt.toISOString(),
                    })
                    .eq("id", existingWebCheckin.id);

                  if (updateError) {
                    console.error("Erro ao atualizar web check-in:", updateError);
                  } else {
                    console.log("✅ Web check-in atualizado com localizador:", reservationCode);
                  }
                }
              }
              
              // Disparar e-mail de confirmação de reserva (pagamento pendente)
              // Apenas se não houver pagamento confirmado
              if (newReservation.payment_status !== 'paid') {
                try {
                  const { triggerEmail } = await import("@/lib/emailService");
                  await triggerEmail('reservation.created', newReservation);
                } catch (emailError) {
                  console.error("Erro ao disparar e-mail de reserva:", emailError);
                  // Não bloquear a criação da reserva se o e-mail falhar
                }
              }

              // Disparar webhook da empresa (Configurações Avançadas do motor), se configurado
              if (newReservation.establishment_id) {
                try {
                  const payload = {
                    reservation_id: newReservation.id,
                    reservation_code: newReservation.reservation_code,
                    checkin_date: newReservation.checkin_date,
                    checkout_date: newReservation.checkout_date,
                    total_amount: newReservation.total_amount,
                    status: newReservation.status,
                    payment_status: newReservation.payment_status,
                    guest_name: newReservation.guest?.full_name ?? newReservation.financial_responsible?.full_name ?? null,
                    guest_email: newReservation.guest?.email ?? newReservation.financial_responsible?.email ?? null,
                  };
                  await supabase.functions.invoke("call-company-webhook", {
                    body: {
                      establishment_id: newReservation.establishment_id,
                      event: "reservation.created",
                      payload,
                    },
                  });
                } catch (webhookError) {
                  console.error("Erro ao disparar webhook da empresa:", webhookError);
                }
              }
            }
          } catch (error) {
            console.error("Erro ao criar web check-in:", error);
            // Não bloquear a criação da reserva se o web check-in falhar
          }

          // Mensagens & Cobranças: envio automático "Após confirmação da reserva" quando reserva é criada já confirmada
          if (newReservation?.status === "confirmed" && newReservation?.establishment_id) {
            try {
              const { data: ccConfig } = await supabase
                .from("checkin_charge_config")
                .select("send_timing")
                .eq("establishment_id", newReservation.establishment_id)
                .eq("enabled", true)
                .maybeSingle();
              if (ccConfig?.send_timing === "after_confirmation") {
                await supabase.functions.invoke("send-checkin-charge", {
                  body: { reservation_id: newReservation.id, intent: "checkin_reminder" },
                });
              }
            } catch (e) {
              console.warn("Mensagens & Cobranças (after_confirmation, create):", e);
            }
          }

          // Mensagens & Cobranças: ao criar reserva, enviar mensagem de Pagamento Pendente quando houver valor a pagar
          const totalAmount = Number(newReservation?.total_amount ?? 0);
          const paidAmount = Number(newReservation?.paid_amount ?? 0);
          if (newReservation?.establishment_id && totalAmount > 0 && paidAmount < totalAmount) {
            try {
              const { data: ccConfig } = await supabase
                .from("checkin_charge_config")
                .select("id")
                .eq("establishment_id", newReservation.establishment_id)
                .eq("enabled", true)
                .maybeSingle();
              if (ccConfig) {
                await supabase.functions.invoke("send-checkin-charge", {
                  body: { reservation_id: newReservation.id, intent: "payment_pending" },
                });
              }
            } catch (e) {
              console.warn("Mensagens & Cobranças (payment_pending, create):", e);
            }
          }

          // Registrar log de criação
          try {
            await logActivity({
              actionType: "created",
              entityType: "reservation",
              entityId: newReservation.id,
              entityCode: newReservation.reservation_code,
              description: `Reserva ${newReservation.reservation_code} criada`,
              newValues: {
                checkin_date: newReservation.checkin_date,
                checkout_date: newReservation.checkout_date,
                room_id: newReservation.room_id,
                category_id: newReservation.category_id,
                total_amount: newReservation.total_amount,
                payment_status: newReservation.payment_status,
                status: newReservation.status,
              },
            });
          } catch (logError) {
            console.error("Erro ao registrar log de criação:", logError);
          }

          // Invalidar todas as queries de reservas (com e sem establishmentId)
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.invalidateQueries({ queryKey: ["rooms"] });
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          scheduleChannelSyncAfterInventoryChange(getEstablishmentId());
          toast.success("Reserva criada com sucesso!");
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
            await supabase.functions.invoke("send-checkin-charge", {
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
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
      // Invalidar também o mapa de ocupação para refletir mudanças imediatamente
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      // Invalidar reservas para atualizar listas
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      // Forçar refetch imediato para atualizar o mapa em tempo real
      await queryClient.refetchQueries({ queryKey: ["reservations"] });
      await queryClient.refetchQueries({ queryKey: ["occupancy_map_rooms"] });

      scheduleChannelSyncAfterInventoryChange(data.establishment_id);

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
      // Obter usuário atual
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
            for (const payment of payments) {
              const amount = Number(payment.amount || 0);
              if (!payment.id || !amount) continue;

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
                  refundResult.error
                );
                // Não bloquear o cancelamento; apenas logar o erro
              }
            }
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
    },
    onSuccess: async (reservationData) => {
      // Registrar log de cancelamento
      if (reservationData) {
        try {
          const description = reservationData.refundPayments
            ? `Reserva ${reservationData.reservation_code} cancelada com estorno de pagamentos`
            : `Reserva ${reservationData.reservation_code} cancelada sem estorno`;

          await logActivity({
            actionType: "cancelled",
            entityType: "reservation",
            entityId: reservationData.id,
            entityCode: reservationData.reservation_code,
            description,
            oldValues: { 
              status: "active", 
              payment_status: reservationData.payment_status,
              paid_amount: reservationData.paid_amount || 0,
            },
            newValues: { 
              status: "cancelled",
              payment_status: reservationData.refundPayments ? "pending" : reservationData.payment_status,
              paid_amount: reservationData.refundPayments ? 0 : reservationData.paid_amount || 0,
            },
            metadata: {
              refund_payments: reservationData.refundPayments || false,
              cancellation_reason: reservationData.cancellation_reason,
            },
          });
        } catch (logError) {
          console.error("Erro ao registrar log de cancelamento:", logError);
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["reservation_payments"] });
      queryClient.invalidateQueries({ queryKey: ["refunds"] });
      queryClient.invalidateQueries({ queryKey: ["pending"] });

      await queryClient.refetchQueries({ queryKey: ["reservations"], exact: false });
      await queryClient.refetchQueries({ queryKey: ["occupancy_map_rooms"] });

      try {
        if (reservationData?.id) {
          await maybeFinalizeOtaCancellationAfterPmsCancel(reservationData.id);
        }
      } catch (finalizeErr) {
        console.warn(
          "Cancelamento no PMS: finalização OTA/Channex (pendência) opcional falhou — use Pendências se necessário.",
          finalizeErr,
        );
      }

      scheduleChannelSyncAfterInventoryChange(
        reservationData.establishment_id || getEstablishmentId()
      );

      // Criar notificação se for pré-reserva cancelada
      // Usar originalStatus que foi guardado antes do cancelamento
      if (reservationData && reservationData.originalStatus === 'preregistration') {
        try {
          const establishmentId = reservationData.establishment_id || getEstablishmentId();
          if (establishmentId) {
            const guestName = reservationData.guest?.full_name || 
                             reservationData.financial_responsible?.full_name || 
                             reservationData.guest_name ||
                             "Hóspede";
            
            await supabase.rpc("create_notification_for_establishment", {
              p_establishment_id: establishmentId,
              p_type: "reservation_cancelled",
              p_title: "Pré-reserva Cancelada",
              p_message: `Pré-reserva ${reservationData.reservation_code || ''} de ${guestName} foi cancelada${reservationData.cancellation_reason ? ': ' + reservationData.cancellation_reason : ''}`,
              p_priority: "medium",
              p_metadata: {
                reservation_id: reservationData.id,
                reservation_code: reservationData.reservation_code,
                cancellation_reason: reservationData.cancellation_reason,
                was_preregistration: true,
              },
            });
          }
        } catch (notificationError) {
          console.error("Erro ao criar notificação de cancelamento de pré-reserva:", notificationError);
          // Não bloquear o cancelamento se a notificação falhar
        }
      }
      
      // Disparar e-mail de cancelamento
      if (reservationData) {
        try {
          const { triggerEmail } = await import("@/lib/emailService");
          await triggerEmail('reservation.cancelled', reservationData);
        } catch (emailError) {
          console.error("Erro ao disparar e-mail de cancelamento:", emailError);
          // Não bloquear o cancelamento se o e-mail falhar
        }
      }

      toast.success("Reserva cancelada com sucesso!");
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

      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["reservation"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["reservation_payments"] });
      queryClient.invalidateQueries({ queryKey: ["pending"] });
      await queryClient.refetchQueries({ queryKey: ["reservations"], exact: false });
      await queryClient.refetchQueries({ queryKey: ["occupancy_map_rooms"] });

      try {
        if (reservationData?.id) {
          await maybeFinalizeOtaCancellationAfterPmsCancel(reservationData.id);
        }
      } catch (finalizeErr) {
        console.warn(
          "No-show no PMS: finalização OTA/Channex (pendência) opcional falhou — use Pendências se necessário.",
          finalizeErr,
        );
      }

      scheduleChannelSyncAfterInventoryChange(
        reservationData?.establishment_id || getEstablishmentId()
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
      const updates: ReservationUpdate = {
        status: "checkedin",
      };

      if (roomId) {
        updates.room_id = roomId;
        // Atualizar status do quarto para occupied
        await supabase
          .from("rooms")
          .update({ status: "occupied" })
          .eq("id", roomId);
      }

      const { data, error } = await supabase
        .from("reservations")
        .update(updates)
        .eq("id", id)
        .select(RESERVATION_RELATIONS_ROOMS_CATEGORIES_SELECT)
        .single();

      if (error) throw error;
      return { ...data, _skipEmail: skipEmail };
    },
        onSuccess: async (updatedReservation) => {
          // Registrar log de check-in
          try {
            await logActivity({
              actionType: "checked_in",
              entityType: "reservation",
              entityId: updatedReservation.id,
              entityCode: updatedReservation.reservation_code,
              description: `Check-in realizado para reserva ${updatedReservation.reservation_code}`,
              oldValues: { status: "confirmed" },
              newValues: { status: "checkedin", room_id: updatedReservation.room_id },
            });
          } catch (logError) {
            console.error("Erro ao registrar log de check-in:", logError);
          }
          
          // Invalidar e refetch todas as queries relacionadas para atualizar o mapa em tempo real
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.invalidateQueries({ queryKey: ["rooms"] });
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          // Invalidar web check-in para atualizar dados da acomodação
          queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
          // Forçar refetch imediato para atualizar o mapa
          await queryClient.refetchQueries({ queryKey: ["reservations"] });
          await queryClient.refetchQueries({ queryKey: ["occupancy_map_rooms"] });

          scheduleChannelSyncAfterInventoryChange(updatedReservation.establishment_id);

          // Disparar e-mail de check-in confirmado apenas se não foi solicitado para pular
          // (o email já foi enviado pelo web check-in)
          if (!updatedReservation._skipEmail) {
          try {
            const { triggerEmail } = await import("@/lib/emailService");
            await triggerEmail('checkin.confirmed', updatedReservation);
          } catch (emailError) {
            console.error("Erro ao disparar e-mail de check-in confirmado:", emailError);
            // Não bloquear o check-in se o e-mail falhar
            }
          } else {
            console.log('ℹ️ Email de check-in confirmado não será enviado (já foi enviado pelo web check-in)');
          }
          
          toast.success("Check-in realizado com sucesso!");
        },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao realizar check-in");
    },
  });

  // Check-out
  const checkOut = useMutation({
    mutationFn: async (id: string) => {
      // Buscar reserva para pegar room_id
      const { data: reservation } = await supabase
        .from("reservations")
        .select("room_id")
        .eq("id", id)
        .single();

      const { data, error } = await supabase
        .from("reservations")
        .update({ status: "checkedout" })
        .eq("id", id)
        .select(RESERVATION_RELATIONS_ROOMS_CATEGORIES_SELECT)
        .single();

      if (error) throw error;

      try {
        const { invokeFnrhLifecycle } = await import("@/lib/fnrh/invokeFnrhLifecycle");
        void invokeFnrhLifecycle(id, "checkout");
      } catch {
        /* FNRH opcional */
      }

      // Atualizar status do quarto para cleaning
      if (reservation?.room_id) {
        await supabase
          .from("rooms")
          .update({ status: "cleaning" })
          .eq("id", reservation.room_id);
      }

      return data;
    },
        onSuccess: async (updatedReservation) => {
          // Criar notificação de limpeza imediatamente após check-out
          const reservationAny = updatedReservation as any;
          if (reservationAny.room_id && reservationAny.establishment_id) {
            try {
              // Buscar informações do quarto e do hóspede
              const room = reservationAny.rooms;
              const guestName = reservationAny.guest?.full_name || 
                              reservationAny.financial_responsible?.full_name || 
                              reservationAny.guest_name || 
                              "Hóspede";

              // Verificar se notificações de limpeza estão habilitadas
              const { data: hotelSettings } = await (supabase as any)
                .from("hotel_settings")
                .select("enable_cleaning_notifications")
                .eq("establishment_id", reservationAny.establishment_id)
                .single();

              const isCleaningNotificationsEnabled = hotelSettings?.enable_cleaning_notifications !== false;

              if (isCleaningNotificationsEnabled) {
                // Verificar se já existe notificação recente (últimas 2 horas) para evitar duplicatas
                const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
                const { data: recentNotifications } = await (supabase as any)
                  .from("notifications")
                  .select("id, metadata")
                  .eq("establishment_id", reservationAny.establishment_id)
                  .eq("type", "cleaning_required")
                  .eq("metadata->>room_id", reservationAny.room_id)
                  .gte("created_at", twoHoursAgo.toISOString())
                  .limit(1);

                // Só criar notificação se não existir uma recente
                if (!recentNotifications || recentNotifications.length === 0) {
                  await (supabase as any).rpc("create_notification_for_establishment", {
                    p_establishment_id: reservationAny.establishment_id,
                    p_type: "cleaning_required",
                    p_title: "Quarto Precisa de Limpeza",
                    p_message: `O quarto ${room?.room_number || "N/A"} precisa de limpeza após check-out da reserva ${reservationAny.reservation_code || ""} (${guestName})`,
                    p_priority: "high",
                    p_metadata: {
                      room_id: reservationAny.room_id,
                      room_number: room?.room_number || "N/A",
                      reservation_id: reservationAny.id,
                      reservation_code: reservationAny.reservation_code || "",
                      guest_name: guestName,
                      checkout_date: reservationAny.checkout_date || format(new Date(), "yyyy-MM-dd"),
                      checkout_time: reservationAny.checkout_time || format(new Date(), "HH:mm"),
                      checkin_date: reservationAny.checkin_date,
                    },
                  });

                  console.log("[checkOut] Notificação de limpeza criada imediatamente após check-out");
                  
                  // Invalidar queries de notificações para atualizar a UI
                  queryClient.invalidateQueries({ queryKey: ["notifications"] });
                }
              }
            } catch (notificationError) {
              // Não bloquear o check-out se houver erro ao criar notificação
              console.error("Erro ao criar notificação de limpeza após check-out:", notificationError);
            }
          }
          // Invalidar e refetch todas as queries relacionadas para atualizar o mapa em tempo real
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.invalidateQueries({ queryKey: ["reservation"] });
          queryClient.invalidateQueries({ queryKey: ["rooms"] });
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          // Invalidar também para atualizar informações dos hóspedes (próximas entradas)
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          // Forçar refetch imediato para atualizar o mapa
          await queryClient.refetchQueries({ queryKey: ["reservations"] });
          await queryClient.refetchQueries({ queryKey: ["occupancy_map_rooms"] });

          scheduleChannelSyncAfterInventoryChange(updatedReservation.establishment_id);

          // Disparar evento genérico de check-out concluído
          try {
            const { triggerEmail } = await import("@/lib/emailService");
            
            // Verificar se a data de check-out já passou (incluindo hoje)
            const checkoutDate = updatedReservation.checkout_date ? new Date(updatedReservation.checkout_date) : null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            if (checkoutDate) {
              checkoutDate.setHours(0, 0, 0, 0);
              
              // Enviar se a data de check-out já passou ou é hoje
              if (checkoutDate <= today) {
                // Disparar evento genérico de check-out concluído
                await triggerEmail('checkout.completed', updatedReservation);
              }
            }
          } catch (error) {
            console.warn("⚠️ Erro ao disparar evento de check-out concluído:", error);
            // Não bloquear o checkout se houver erro no envio de email
          }
          
          // Verificar se deve enviar email de solicitação de avaliação
          try {
            // Verificar feature flag para o estabelecimento
            const { data: siteSettings } = await supabase
              .from("site_settings")
              .select("features_enabled")
              .eq("id", "00000000-0000-0000-0000-000000000001")
              .maybeSingle();
            
            const { isFeatureEnabledForEstablishment } = await import("@/lib/featureAccess");
            const isStayReviewsEnabled = isFeatureEnabledForEstablishment(
              siteSettings?.features_enabled?.stay_reviews,
              updatedReservation.establishment_id
            );
            
            if (isStayReviewsEnabled) {
              const { sendStayReviewRequestEmail } = await import("@/lib/emailService");
              
              // Buscar configurações de avaliação do estabelecimento
              const { data: reviewSettings } = await supabase
                .from("establishment_review_settings")
                .select("is_enabled, send_email_after_checkout, email_delay_hours")
                .eq("establishment_id", updatedReservation.establishment_id)
                .maybeSingle();
              
              if (reviewSettings?.is_enabled && reviewSettings?.send_email_after_checkout) {
                // Verificar se a data de check-out já passou (incluindo hoje)
                const checkoutDate = updatedReservation.checkout_date ? new Date(updatedReservation.checkout_date) : null;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                
                if (checkoutDate) {
                  checkoutDate.setHours(0, 0, 0, 0);
                  
                  // Enviar se a data de check-out já passou ou é hoje
                  if (checkoutDate <= today) {
                    // Gerar link de avaliação
                    const baseUrl = typeof window !== 'undefined' 
                      ? window.location.origin 
                      : (import.meta.env.VITE_APP_URL || 'http://localhost:8080');
                    
                    // Usar reservation_code ou identification_number para o link
                    const locator = updatedReservation.identification_number || updatedReservation.reservation_code;
                    const reviewLink = `${baseUrl}/review/${locator}`;
                    
                    // Se houver delay configurado, agendar o envio (por enquanto, enviar imediatamente)
                    // Em produção, poderia usar uma função edge ou cron job para enviar após o delay
                    await sendStayReviewRequestEmail(updatedReservation, reviewLink);
                  }
                }
              }
            }
          } catch (error) {
            console.warn("⚠️ Erro ao enviar email de solicitação de avaliação:", error);
            // Não bloquear o checkout se houver erro no envio de email
          }
          
          toast.success("Check-out realizado com sucesso!");
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
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.invalidateQueries({ queryKey: ["rooms"] });
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          // Invalidar web check-in para atualizar dados da acomodação
          queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
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
    onSuccess: async (updatedReservation) => {
      // Registrar log de efetivação
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

      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
      
      toast.success("Pré-reserva efetivada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao efetivar pré-reserva");
    },
  });

  // Subscription em tempo real para mudanças nas reservas
  useEffect(() => {
    const establishmentId = getEstablishmentId();
    if (!establishmentId) return;

    // Canal para mudanças nas reservas
    const reservationsChannel = supabase
      .channel(`reservations:${establishmentId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "reservations",
          filter: `establishment_id=eq.${establishmentId}`,
        },
        (payload) => {
          console.log("🔄 Mudança detectada na tabela reservations:", payload.eventType);
          // Invalidar queries para atualizar os dados
          queryClient.invalidateQueries({ queryKey: ["reservations", establishmentId] });
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
        }
      )
      .subscribe();

    // Canal para mudanças nos pagamentos (afeta paid_amount e payment_status das reservas)
    const paymentsChannel = supabase
      .channel(`payments:${establishmentId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "payments",
        },
        async (payload) => {
          console.log("💳 Mudança detectada na tabela payments:", payload.eventType);
          
          // Se for INSERT ou UPDATE, buscar a reserva relacionada e atualizar
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const payment = payload.new as any;
            if (payment?.reservation_id) {
              // Recalcular paid_amount da reserva
              const { data: payments } = await supabase
                .from("payments")
                .select("amount, notes")
                .eq("reservation_id", payment.reservation_id);

              const totalPaid = Math.max(
                0,
                (payments || []).reduce((sum: number, p: any) => {
                  const amt = Number(p.amount || 0);
                  const isRefund = /\[REFUND/i.test(p.notes || "") || amt < 0;
                  return sum + (isRefund ? -Math.abs(amt) : amt);
                }, 0),
              );

              // Atualizar paid_amount da reserva
              await supabase
                .from("reservations")
                .update({ paid_amount: totalPaid })
                .eq("id", payment.reservation_id);
            }
          }

          // Invalidar queries para atualizar os dados
          queryClient.invalidateQueries({ queryKey: ["reservations", establishmentId] });
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.invalidateQueries({ queryKey: ["reservation_payments"] });
        }
      )
      .subscribe();

    // Cleanup: remover subscriptions quando o componente desmontar ou establishmentId mudar
    return () => {
      supabase.removeChannel(reservationsChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [selectedEstablishment?.id, queryClient]);

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

