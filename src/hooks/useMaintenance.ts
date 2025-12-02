import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

type MaintenanceTicketInsert = TablesInsert<"maintenance_tickets">;
type MaintenanceTicketUpdate = TablesUpdate<"maintenance_tickets">;

export const useMaintenance = () => {
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

  // Buscar todos os tickets com joins
  const ticketsQuery = useQuery({
    queryKey: ["maintenance_tickets", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      
      let query = supabase
        .from("maintenance_tickets")
        .select(`
          *,
          rooms (*)
        `);

      // Filtrar por establishment_id se disponível
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }

      const { data, error } = await query.order("opened_at", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar tickets de manutenção");
        throw error;
      }

      return data;
    },
  });

  // Criar novo ticket
  const createTicket = useMutation({
    mutationFn: async (ticket: MaintenanceTicketInsert) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Criar ticket
      const { data, error } = await supabase
        .from("maintenance_tickets")
        .insert([{
          ...ticket,
          opened_by: user?.id || null,
        }])
        .select(`
          *,
          rooms (*)
        `)
        .single();

      if (error) throw error;

      // Atualizar status do quarto para maintenance
      if (ticket.room_id) {
        const { error: roomError } = await supabase
          .from("rooms")
          .update({ status: "maintenance" })
          .eq("id", ticket.room_id);

        if (roomError) {
          console.error("Erro ao atualizar status do quarto:", roomError);
          // Não falhar a criação do ticket por causa disso
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance_tickets", selectedEstablishment?.id] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Ticket de manutenção criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar ticket de manutenção");
    },
  });

  // Atualizar ticket
  const updateTicket = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & MaintenanceTicketUpdate) => {
      const { data, error } = await supabase
        .from("maintenance_tickets")
        .update(updates)
        .eq("id", id)
        .select(`
          *,
          rooms (*)
        `)
        .single();

      if (error) throw error;

      // Se o ticket foi completado, atualizar status do quarto
      if (updates.status === "completed") {
        const { data: ticket } = await supabase
          .from("maintenance_tickets")
          .select("room_id")
          .eq("id", id)
          .single();

        if (ticket?.room_id) {
          // Verificar se há reservas futuras para o quarto
          const { data: futureReservations } = await supabase
            .from("reservations")
            .select("id")
            .eq("room_id", ticket.room_id)
            .in("status", ["pending", "confirmed"])
            .gte("checkin_date", new Date().toISOString().split("T")[0])
            .limit(1);

          // Se não houver reservas futuras, colocar como available, senão cleaning
          const newRoomStatus = futureReservations && futureReservations.length > 0 
            ? "cleaning" 
            : "available";

          await supabase
            .from("rooms")
            .update({ status: newRoomStatus })
            .eq("id", ticket.room_id);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance_tickets", selectedEstablishment?.id] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Ticket atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar ticket");
    },
  });

  // Deletar/Cancelar ticket
  const cancelTicket = useMutation({
    mutationFn: async (id: string) => {
      // Buscar ticket para pegar room_id
      const { data: ticket } = await supabase
        .from("maintenance_tickets")
        .select("room_id, status")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("maintenance_tickets")
        .update({ status: "cancelled" })
        .eq("id", id);

      if (error) throw error;

      // Se o ticket estava aberto ou em progresso, atualizar status do quarto
      if (ticket && (ticket.status === "open" || ticket.status === "in_progress")) {
        // Verificar se há outros tickets abertos para o mesmo quarto
        const { data: otherTickets } = await supabase
          .from("maintenance_tickets")
          .select("id")
          .eq("room_id", ticket.room_id)
          .in("status", ["open", "in_progress"])
          .neq("id", id)
          .limit(1);

        // Se não houver outros tickets, atualizar status do quarto
        if (!otherTickets || otherTickets.length === 0) {
          // Verificar se há reservas futuras
          const { data: futureReservations } = await supabase
            .from("reservations")
            .select("id")
            .eq("room_id", ticket.room_id)
            .in("status", ["pending", "confirmed"])
            .gte("checkin_date", new Date().toISOString().split("T")[0])
            .limit(1);

          const newRoomStatus = futureReservations && futureReservations.length > 0 
            ? "cleaning" 
            : "available";

          await supabase
            .from("rooms")
            .update({ status: newRoomStatus })
            .eq("id", ticket.room_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance_tickets", selectedEstablishment?.id] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Ticket cancelado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao cancelar ticket");
    },
  });

  // Marcar como em progresso
  const startTicket = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("maintenance_tickets")
        .update({ status: "in_progress" })
        .eq("id", id)
        .select(`
          *,
          rooms (*)
        `)
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance_tickets", selectedEstablishment?.id] });
      toast.success("Manutenção iniciada!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao iniciar manutenção");
    },
  });

  // Completar ticket
  const completeTicket = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from("maintenance_tickets")
        .update({ 
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(`
          *,
          rooms (*)
        `)
        .single();

      if (error) throw error;

      // Atualizar status do quarto
      if (data.room_id) {
        const { data: futureReservations } = await supabase
          .from("reservations")
          .select("id")
          .eq("room_id", data.room_id)
          .in("status", ["pending", "confirmed"])
          .gte("checkin_date", new Date().toISOString().split("T")[0])
          .limit(1);

        const newRoomStatus = futureReservations && futureReservations.length > 0 
          ? "cleaning" 
          : "available";

        await supabase
          .from("rooms")
          .update({ status: newRoomStatus })
          .eq("id", data.room_id);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance_tickets", selectedEstablishment?.id] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      toast.success("Manutenção concluída com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao completar manutenção");
    },
  });

  return {
    tickets: ticketsQuery.data || [],
    isLoading: ticketsQuery.isLoading,
    refetch: ticketsQuery.refetch,
    createTicket: createTicket.mutateAsync,
    updateTicket: updateTicket.mutateAsync,
    cancelTicket: cancelTicket.mutateAsync,
    startTicket: startTicket.mutateAsync,
    completeTicket: completeTicket.mutateAsync,
    isCreating: createTicket.isPending,
    isUpdating: updateTicket.isPending,
  };
};

