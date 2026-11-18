import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";
import { formatCurrency } from "@/lib/reservationUtils";
import { PARKING_FEE_KIND, cancelParkingSpotForLodging } from "@/lib/parkingFeeConfig";
import { maybeSyncParkingSpotAfterFeeAdded } from "@/lib/parkingReservationSync";
import { syncLinkedParkingSpotPaymentFromLodging } from "@/lib/parkingPaymentSync";

export const useReservationServiceFees = (reservationId?: string) => {
  const queryClient = useQueryClient();

  // Buscar taxas de uma reserva
  const reservationServiceFeesQuery = useQuery({
    queryKey: ["reservation_service_fees", reservationId],
    queryFn: async () => {
      if (!reservationId) return [];

      const { data, error } = await supabase
        .from("reservation_service_fees")
        .select(`
          *,
          service_fees(*)
        `)
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Erro ao buscar taxas da reserva:", error);
        throw error;
      }

      return data || [];
    },
    enabled: !!reservationId,
  });

  // Adicionar taxa à reserva
  const addServiceFee = useMutation({
    mutationFn: async (data: {
      reservation_id: string;
      service_fee_id: string;
      amount: number;
      quantity?: number;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: newFee, error } = await supabase
        .from("reservation_service_fees")
        .insert([{
          ...data,
          quantity: data.quantity || 1,
          created_by: user?.id || null,
        }])
        .select(`
          *,
          service_fees(*)
        `)
        .single();

      if (error) throw error;

      // Buscar dados da reserva para o log (já buscado acima)
      const { data: reservationDataForLog } = await supabase
        .from("reservations")
        .select("reservation_code")
        .eq("id", data.reservation_id)
        .single();

      // Buscar dados da reserva para verificar status atual
      const { data: reservationData } = await supabase
        .from("reservations")
        .select("status, paid_amount, total_amount, payment_status")
        .eq("id", data.reservation_id)
        .single();

      // Atualizar status da reserva quando uma taxa é adicionada
      // Se a reserva estava "confirmed" (base paga), deve ficar "pending" (taxa pendente)
      // Se a reserva estava "unpaid", mantém "unpaid"
      const paidAmount = Number(reservationData?.paid_amount || 0);
      const baseTotalAmount = Number(reservationData?.total_amount || 0);
      
      let newStatus = reservationData?.status;
      if (reservationData?.status === "confirmed" && paidAmount >= baseTotalAmount) {
        // Base estava paga, mas agora há taxa pendente = Pendente
        newStatus = "pending";
      }
      // Se estava "unpaid", mantém "unpaid"
      
      const { error: updateError } = await supabase
        .from("reservations")
        .update({ 
          payment_status: "pending",
          ...(newStatus ? { status: newStatus } : {})
        })
        .eq("id", data.reservation_id);

      if (updateError) {
        console.error("Erro ao atualizar status de pagamento:", updateError);
        // Não lançar erro para não interromper o fluxo principal
      }

      const serviceKind = (newFee as { service_fees?: { service_kind?: string } })?.service_fees?.service_kind;
      if (serviceKind === PARKING_FEE_KIND) {
        try {
          const sync = await maybeSyncParkingSpotAfterFeeAdded(data.reservation_id, serviceKind);
          if (sync.warning) {
            toast.warning(sync.warning);
          }
        } catch (parkingErr) {
          console.error("Erro ao reservar vaga de estacionamento:", parkingErr);
          toast.warning(
            "Taxa adicionada, mas não foi possível reservar a vaga no mapa. Verifique disponibilidade ou datas da reserva.",
          );
        }
        try {
          await syncLinkedParkingSpotPaymentFromLodging(data.reservation_id);
        } catch {
          /* ignore */
        }
      }

      // Registrar log de atividade
      const feeName = (newFee as any)?.service_fees?.name || "Taxa";
      const feeTotal = Number(data.amount || 0) * Number(data.quantity || 1);
      const description = `Taxa "${feeName}" adicionada à reserva ${reservationDataForLog?.reservation_code || data.reservation_id}. Valor: ${formatCurrency(feeTotal)}${data.quantity && data.quantity > 1 ? ` (Qtd: ${data.quantity})` : ""}`;

      try {
        await logActivity({
          actionType: "service_fee_added",
          entityType: "service_fee",
          entityId: newFee.id,
          entityCode: reservationDataForLog?.reservation_code || undefined,
          description,
          newValues: {
            service_fee_id: data.service_fee_id,
            amount: data.amount,
            quantity: data.quantity || 1,
            total: feeTotal,
            notes: data.notes || null,
          },
          metadata: {
            reservation_id: data.reservation_id,
            reservation_code: reservationData?.reservation_code,
            fee_name: feeName,
          },
        });
      } catch (logError) {
        console.error("Erro ao registrar log de atividade:", logError);
        // Não lançar erro para não interromper o fluxo principal
      }

      return newFee;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["reservation_service_fees", variables.reservation_id] });
      queryClient.invalidateQueries({ queryKey: ["reservations"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      toast.success("Taxa adicionada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao adicionar taxa");
    },
  });

  // Atualizar taxa da reserva
  const updateServiceFee = useMutation({
    mutationFn: async ({ id, ...updates }: {
      id: string;
      amount?: number;
      quantity?: number;
      notes?: string;
    }) => {
      // Buscar dados da taxa antes de atualizar (incluindo dados antigos)
      const { data: feeData, error: fetchError } = await supabase
        .from("reservation_service_fees")
        .select(`
          *,
          service_fees(*),
          reservations!inner(reservation_code)
        `)
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      const oldValues = {
        amount: feeData.amount,
        quantity: feeData.quantity,
        notes: feeData.notes || null,
        total: Number(feeData.amount || 0) * Number(feeData.quantity || 1),
      };

      const { error } = await supabase
        .from("reservation_service_fees")
        .update(updates)
        .eq("id", id);

      if (error) throw error;

      // Buscar dados atualizados para o log
      const { data: updatedFeeData } = await supabase
        .from("reservation_service_fees")
        .select(`
          *,
          service_fees(*)
        `)
        .eq("id", id)
        .single();

      const newValues = {
        amount: updates.amount !== undefined ? updates.amount : oldValues.amount,
        quantity: updates.quantity !== undefined ? updates.quantity : oldValues.quantity,
        notes: updates.notes !== undefined ? updates.notes : oldValues.notes,
        total: Number(updates.amount !== undefined ? updates.amount : oldValues.amount) * Number(updates.quantity !== undefined ? updates.quantity : oldValues.quantity),
      };

      // Atualizar status da reserva quando uma taxa é atualizada
      // Se a reserva estava "confirmed" (base paga), deve ficar "pending" (taxa pendente)
      if (feeData?.reservation_id) {
        const { data: reservationData } = await supabase
          .from("reservations")
          .select("status, paid_amount, total_amount")
          .eq("id", feeData.reservation_id)
          .single();

        const paidAmount = Number(reservationData?.paid_amount || 0);
        const baseTotalAmount = Number(reservationData?.total_amount || 0);
        
        let newStatus = reservationData?.status;
        if (reservationData?.status === "confirmed" && paidAmount >= baseTotalAmount) {
          // Base estava paga, mas agora há taxa pendente = Pendente
          newStatus = "pending";
        }

        const { error: updateError } = await supabase
          .from("reservations")
          .update({ 
            payment_status: "pending",
            ...(newStatus ? { status: newStatus } : {})
          })
          .eq("id", feeData.reservation_id);

        if (updateError) {
          console.error("Erro ao atualizar status de pagamento:", updateError);
          // Não lançar erro para não interromper o fluxo principal
        }
      }

      // Registrar log de atividade
      const reservationCode = (feeData as any)?.reservations?.reservation_code;
      const feeName = (updatedFeeData as any)?.service_fees?.name || (feeData as any)?.service_fees?.name || "Taxa";
      const description = `Taxa "${feeName}" atualizada na reserva ${reservationCode || feeData.reservation_id}. ${Object.keys(updates).map(key => {
        if (key === "amount") return `Valor: ${formatCurrency(oldValues.amount)} → ${formatCurrency(newValues.amount)}`;
        if (key === "quantity") return `Quantidade: ${oldValues.quantity} → ${newValues.quantity}`;
        if (key === "notes") return `Observações: ${oldValues.notes || "-"} → ${newValues.notes || "-"}`;
        return "";
      }).filter(Boolean).join(", ")}`;

      try {
        await logActivity({
          actionType: "service_fee_updated",
          entityType: "service_fee",
          entityId: id,
          entityCode: reservationCode || undefined,
          description,
          oldValues,
          newValues,
          metadata: {
            reservation_id: feeData.reservation_id,
            reservation_code: reservationCode,
            fee_name: feeName,
          },
        });
      } catch (logError) {
        console.error("Erro ao registrar log de atividade:", logError);
        // Não lançar erro para não interromper o fluxo principal
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["reservation_service_fees"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      // Invalidar também a query específica do mapa de reservas para atualizar a cor
      queryClient.invalidateQueries({ queryKey: ["reservations"], exact: false });
      toast.success("Taxa atualizada com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar taxa");
    },
  });

  // Remover taxa da reserva
  const removeServiceFee = useMutation({
    mutationFn: async (id: string) => {
      // Buscar dados da taxa antes de remover
      const { data: feeData, error: fetchError } = await supabase
        .from("reservation_service_fees")
        .select(`
          *,
          service_fees(*),
          reservations!inner(reservation_code, status, paid_amount, total_amount)
        `)
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      const reservationId = feeData.reservation_id;

      const { error } = await supabase
        .from("reservation_service_fees")
        .delete()
        .eq("id", id);

      if (error) throw error;

      const serviceKind = (feeData as { service_fees?: { service_kind?: string } })?.service_fees?.service_kind;
      if (serviceKind === PARKING_FEE_KIND && reservationId) {
        try {
          await cancelParkingSpotForLodging(reservationId);
        } catch (parkingErr) {
          console.error("Erro ao liberar vaga de estacionamento:", parkingErr);
        }
      }

      // Verificar se ainda há taxas pendentes após a remoção
      const { data: remainingFees } = await supabase
        .from("reservation_service_fees")
        .select("id")
        .eq("reservation_id", reservationId);

      // Buscar dados atualizados da reserva
      const { data: reservationData } = await supabase
        .from("reservations")
        .select("paid_amount, total_amount, status")
        .eq("id", reservationId)
        .single();

      // Calcular total com taxas restantes
      const { data: allRemainingFees } = await supabase
        .from("reservation_service_fees")
        .select("amount, quantity")
        .eq("reservation_id", reservationId);

      const remainingFeesTotal = (allRemainingFees || []).reduce((sum: number, fee: any) => {
        return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
      }, 0);

      const totalWithFees = (reservationData?.total_amount || 0) + remainingFeesTotal;
      const paidAmount = reservationData?.paid_amount || 0;

      // Se não há mais taxas pendentes e o pagamento está completo, voltar para "confirmed"
      // Se não há pagamento, manter "unpaid"
      let newStatus = reservationData?.status;
      if (remainingFeesTotal === 0 && paidAmount >= (reservationData?.total_amount || 0) && paidAmount > 0) {
        newStatus = "confirmed"; // Sem taxas pendentes e pagamento completo
      } else if (paidAmount === 0) {
        newStatus = "unpaid"; // Sem pagamento
      } else if (paidAmount < totalWithFees && paidAmount > 0) {
        newStatus = "pending"; // Ainda há taxas pendentes ou pagamento parcial
      }

      // Atualizar status da reserva se necessário
      if (newStatus && newStatus !== reservationData?.status) {
        const { error: updateError } = await supabase
          .from("reservations")
          .update({ 
            status: newStatus,
            payment_status: paidAmount >= totalWithFees && totalWithFees > 0 ? "paid" : "partial"
          })
          .eq("id", reservationId);

        if (updateError) {
          console.error("Erro ao atualizar status da reserva:", updateError);
          // Não lançar erro para não interromper o fluxo principal
        }
      }

      // Registrar log de atividade
      const reservationCode = (feeData as any)?.reservations?.reservation_code;
      const feeName = (feeData as any)?.service_fees?.name || "Taxa";
      const feeTotal = Number(feeData.amount || 0) * Number(feeData.quantity || 1);
      const description = `Taxa "${feeName}" removida da reserva ${reservationCode || feeData.reservation_id}. Valor removido: ${formatCurrency(feeTotal)}`;

      try {
        await logActivity({
          actionType: "service_fee_removed",
          entityType: "service_fee",
          entityId: id,
          entityCode: reservationCode || undefined,
          description,
          oldValues: {
            service_fee_id: feeData.service_fee_id,
            amount: feeData.amount,
            quantity: feeData.quantity,
            total: feeTotal,
            notes: feeData.notes || null,
          },
          metadata: {
            reservation_id: feeData.reservation_id,
            reservation_code: reservationCode,
            fee_name: feeName,
          },
        });
      } catch (logError) {
        console.error("Erro ao registrar log de atividade:", logError);
        // Não lançar erro para não interromper o fluxo principal
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservation_service_fees"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Taxa removida com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao remover taxa");
    },
  });

  return {
    serviceFees: reservationServiceFeesQuery.data || [],
    isLoading: reservationServiceFeesQuery.isLoading,
    error: reservationServiceFeesQuery.error,
    refetch: reservationServiceFeesQuery.refetch,
    addServiceFee: addServiceFee.mutateAsync,
    updateServiceFee: updateServiceFee.mutateAsync,
    removeServiceFee: removeServiceFee.mutateAsync,
    isAdding: addServiceFee.isPending,
    isUpdating: updateServiceFee.isPending,
    isRemoving: removeServiceFee.isPending,
  };
};


