import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { logActivity, createReservationUpdateDescription } from "@/lib/activityLogger";
import { useEffect } from "react";

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
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      let query = supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*),
          reservation_service_fees(amount, quantity)
        `);
      
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
              
              // Buscar taxas da reserva
              const { data: serviceFees } = await supabase
                .from("reservation_service_fees")
                .select("amount, quantity")
                .eq("reservation_id", reservation.id);
              
              const serviceFeesTotal = (serviceFees || []).reduce((sum: number, fee: any) => {
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
          await logError({
            error: new Error(errorMessage),
            context: "reservations.createReservation.validation",
            severity: "medium",
            metadata: { lock_result: lockResult },
          });
          throw new Error(errorMessage);
        }

        // Buscar a reserva criada com todos os relacionamentos
        const { data: newReservation, error: fetchError } = await supabase
          .from("reservations")
          .select(`
            *,
            financial_responsible:clients!client_id(*),
            guest:clients!guest_id(*),
            rooms (*),
            room_categories (*)
          `)
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
              const guestName = newReservation.guest?.full_name || 
                               newReservation.financial_responsible?.full_name || 
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
            }
          } catch (error) {
            console.error("Erro ao criar web check-in:", error);
            // Não bloquear a criação da reserva se o web check-in falhar
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
      
      // Detectar se é uma extensão de reserva (checkout_date sendo atualizado para uma data posterior)
      // IMPORTANTE: Verificar ANTES de fazer o update para ter a data original
      let isExtension = false;
      let oldCheckoutDate: string | null = null;
      let newCheckoutDate: string | null = null;
      
      if (updates.checkout_date) {
        // Buscar checkout_date atual da reserva ANTES de atualizar
        const { data: currentReservation } = await supabase
          .from("reservations")
          .select("checkout_date")
          .eq("id", id)
          .single();
        
        if (currentReservation?.checkout_date) {
          oldCheckoutDate = currentReservation.checkout_date;
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
          } else {
            console.log("📅 Não é extensão (data não aumentou):", {
              oldCheckout: oldCheckoutDate,
              newCheckout: newCheckoutDate
            });
          }
        } else {
          console.warn("⚠️ Não foi possível obter checkout_date atual da reserva para verificar extensão");
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
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*)
        `)
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
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*)
        `)
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
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*)
        `)
        .single();

      if (error) throw error;

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
          // Invalidar e refetch todas as queries relacionadas para atualizar o mapa em tempo real
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.invalidateQueries({ queryKey: ["rooms"] });
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          // Invalidar também para atualizar informações dos hóspedes (próximas entradas)
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          // Forçar refetch imediato para atualizar o mapa
          await queryClient.refetchQueries({ queryKey: ["reservations"] });
          await queryClient.refetchQueries({ queryKey: ["occupancy_map_rooms"] });
          
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
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*)
        `)
        .single();

      if (error) throw error;
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
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*)
        `)
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
                .select("amount")
                .eq("reservation_id", payment.reservation_id)
                .eq("status", "completed");

              const totalPaid = (payments || []).reduce((sum: number, p: any) => {
                return sum + Number(p.amount || 0);
              }, 0);

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

  return {
    reservations: reservationsQuery.data || [],
    isLoading: reservationsQuery.isLoading,
    refetch: reservationsQuery.refetch,
    createReservation: createReservation.mutateAsync,
    updateReservation: updateReservation.mutateAsync,
    cancelReservation: cancelReservation.mutateAsync,
    checkIn: checkIn.mutateAsync,
    checkOut: checkOut.mutateAsync,
    replaceReservationRoom: replaceReservationRoom.mutateAsync,
    confirmPreregistration: confirmPreregistration.mutateAsync,
    isCreating: createReservation.isPending,
    isUpdating: updateReservation.isPending,
  };
};

