import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMaintenance } from "@/hooks/useMaintenance";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { Loader2 } from "lucide-react";

interface MaintenanceTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  ticketId?: string; // Para edição
  initialRoomId?: string; // Para pré-selecionar um quarto
}

export const MaintenanceTicketDialog = ({
  open,
  onOpenChange,
  onSuccess,
  ticketId,
  initialRoomId,
}: MaintenanceTicketDialogProps) => {
  const { createTicket, updateTicket, isCreating, isUpdating } = useMaintenance();
  const { selectedEstablishment } = useEstablishment();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    room_id: "",
    title: "",
    description: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    status: "open" as "open" | "in_progress" | "completed" | "cancelled",
    notes: "",
  });

  // Buscar quartos
  const { data: rooms } = useQuery({
    queryKey: ["rooms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .order("room_number");

      if (error) throw error;
      return data;
    },
  });

  // Buscar ticket para edição
  useEffect(() => {
    if (ticketId && open) {
      const fetchTicket = async () => {
        const { data, error } = await supabase
          .from("maintenance_tickets")
          .select("*")
          .eq("id", ticketId)
          .single();

        if (error) {
          toast.error("Erro ao carregar ticket");
          return;
        }

        if (data) {
          setFormData({
            room_id: data.room_id,
            title: data.title,
            description: data.description,
            priority: data.priority,
            status: data.status,
            notes: data.notes || "",
          });
        }
      };

      fetchTicket();
    } else if (!ticketId && open) {
      // Reset form for new ticket
      setFormData({
        room_id: initialRoomId || "",
        title: "",
        description: "",
        priority: "medium",
        status: "open",
        notes: "",
      });
    }
  }, [ticketId, open, initialRoomId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.room_id) {
        toast.error("Selecione um quarto");
        return;
      }

      if (!formData.title.trim()) {
        toast.error("Título é obrigatório");
        return;
      }

      if (!formData.description.trim()) {
        toast.error("Descrição é obrigatória");
        return;
      }

      if (ticketId) {
        await updateTicket({
          id: ticketId,
          ...formData,
        });
      } else {
        // Buscar establishment_id do contexto ou do quarto selecionado
        let establishmentId = selectedEstablishment?.id || null;
        
        // Se não tiver no contexto, buscar do quarto
        if (!establishmentId && formData.room_id) {
          const { data: room } = await supabase
            .from("rooms")
            .select("establishment_id")
            .eq("id", formData.room_id)
            .single();
          
          if (room?.establishment_id) {
            establishmentId = room.establishment_id;
          }
        }
        
        await createTicket({
          room_id: formData.room_id,
          establishment_id: establishmentId,
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          notes: formData.notes || null,
        });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar ticket");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {ticketId ? "Editar Ticket de Manutenção" : "Novo Ticket de Manutenção"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Quarto */}
            <div>
              <Label htmlFor="room_id">Quarto *</Label>
              <Select
                value={formData.room_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, room_id: value })
                }
                required
                disabled={!!ticketId} // Não permitir mudar quarto após criação
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um quarto" />
                </SelectTrigger>
                <SelectContent>
                  {rooms?.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.room_number} {room.floor && `- Andar ${room.floor}`}
                      {room.status === "maintenance" && " (Em manutenção)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Prioridade */}
            <div>
              <Label htmlFor="priority">Prioridade *</Label>
              <Select
                value={formData.priority}
                onValueChange={(value: "low" | "medium" | "high" | "urgent") =>
                  setFormData({ ...formData, priority: value })
                }
                required
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status (apenas para edição) */}
            {ticketId && (
              <div>
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: "open" | "in_progress" | "completed" | "cancelled") =>
                    setFormData({ ...formData, status: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="in_progress">Em Progresso</SelectItem>
                    <SelectItem value="completed">Concluído</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Título */}
            <div className={ticketId ? "" : "col-span-2"}>
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                placeholder="Ex: Ar condicionado não funciona"
                required
              />
            </div>

            {/* Descrição */}
            <div className="col-span-2">
              <Label htmlFor="description">Descrição *</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Descreva o problema detalhadamente..."
                rows={4}
                required
              />
            </div>

            {/* Observações */}
            <div className="col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Observações adicionais..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || isCreating || isUpdating}
            >
              {loading || isCreating || isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : ticketId ? (
                "Atualizar"
              ) : (
                "Criar Ticket"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

