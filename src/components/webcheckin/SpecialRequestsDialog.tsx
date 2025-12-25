import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Clock, Bed, MessageSquare, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SpecialRequestsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: any;
  onSuccess?: () => void;
}

export function SpecialRequestsDialog({
  open,
  onOpenChange,
  reservation,
  onSuccess,
}: SpecialRequestsDialogProps) {
  console.log("🔔 SpecialRequestsDialog renderizado", { open, hasReservation: !!reservation, reservationId: reservation?.id });
  
  const [selectedRequests, setSelectedRequests] = useState<string[]>([]);
  const [customRequest, setCustomRequest] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestOptions = [
    {
      id: "early_checkin",
      label: "Early Check-in",
      description: "Entrada antecipada",
      icon: <Clock className="w-4 h-4" />,
      requiresAvailability: true,
    },
    {
      id: "late_checkout",
      label: "Late Check-out",
      description: "Saída tardia",
      icon: <Clock className="w-4 h-4" />,
      requiresAvailability: true,
    },
    {
      id: "double_bed",
      label: "Cama de Casal",
      description: "Quarto com cama de casal",
      icon: <Bed className="w-4 h-4" />,
      requiresAvailability: false,
    },
    {
      id: "twin_beds",
      label: "Duas Camas de Solteiro",
      description: "Quarto com duas camas de solteiro",
      icon: <Bed className="w-4 h-4" />,
      requiresAvailability: false,
    },
  ];

  const handleToggleRequest = (requestId: string) => {
    setSelectedRequests((prev) =>
      prev.includes(requestId)
        ? prev.filter((id) => id !== requestId)
        : [...prev, requestId]
    );
  };

  const handleSubmit = async () => {
    if (selectedRequests.length === 0 && !customRequest.trim()) {
      toast.error("Selecione pelo menos uma solicitação ou escreva uma solicitação personalizada");
      return;
    }

    if (!reservation?.id) {
      toast.error("Reserva não encontrada. Por favor, selecione uma reserva válida.");
      console.error("❌ Reserva não encontrada no SpecialRequestsDialog:", reservation);
      return;
    }

    try {
      setIsSubmitting(true);

      // Construir o texto das solicitações
      const requestTexts: string[] = [];
      
      selectedRequests.forEach((requestId) => {
        const option = requestOptions.find((opt) => opt.id === requestId);
        if (option) {
          let text = option.label;
          if (option.requiresAvailability) {
            text += " (sujeito à disponibilidade)";
          }
          requestTexts.push(text);
        }
      });

      if (customRequest.trim()) {
        requestTexts.push(`Solicitação personalizada: ${customRequest.trim()}`);
      }

      const requestsText = requestTexts.join("; ");

      // Obter observações existentes
      const currentNotes = reservation.notes || "";
      
      // Adicionar timestamp
      const timestamp = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      
      // Construir nova observação
      let newNotes = currentNotes.trim();
      if (newNotes) {
        newNotes += "\n\n";
      }
      newNotes += `[Solicitações Especiais - ${timestamp}]\n${requestsText}`;

      // Atualizar a reserva
      const { error } = await supabase
        .from("reservations")
        .update({ notes: newNotes })
        .eq("id", reservation.id);

      if (error) {
        console.error("Erro ao salvar solicitações:", error);
        toast.error("Erro ao salvar solicitações. Tente novamente.");
        return;
      }

      toast.success("Solicitações especiais registradas com sucesso!");
      
      // Limpar formulário
      setSelectedRequests([]);
      setCustomRequest("");
      
      // Fechar diálogo
      onOpenChange(false);
      
      // Chamar callback de sucesso
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("Erro ao processar solicitações:", error);
      toast.error(error.message || "Erro ao processar solicitações");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Se não houver reserva, mostrar mensagem de erro
  if (!reservation) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5" />
              Solicitações Especiais
            </DialogTitle>
            <DialogDescription>
              Não foi possível carregar as informações da reserva.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Por favor, selecione uma reserva válida para fazer solicitações especiais.
              </AlertDescription>
            </Alert>
          </div>
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Solicitações Especiais
          </DialogTitle>
          <DialogDescription>
            Selecione suas solicitações ou escreva uma solicitação personalizada.
            As solicitações serão registradas e avaliadas pela equipe do hotel.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Opções de solicitação */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Solicitações Disponíveis</Label>
            <div className="space-y-2">
              {requestOptions.map((option) => (
                <div key={option.id} className="space-y-2">
                  <div className="flex items-start space-x-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                    <Checkbox
                      id={option.id}
                      checked={selectedRequests.includes(option.id)}
                      onCheckedChange={() => handleToggleRequest(option.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={option.id}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                        >
                          <span className="text-slate-600">{option.icon}</span>
                          {option.label}
                        </label>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{option.description}</p>
                      {option.requiresAvailability && selectedRequests.includes(option.id) && (
                        <Alert className="mt-2 py-2">
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            Esta solicitação será avaliada mediante disponibilidade do local.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Solicitação personalizada */}
          <div className="space-y-2">
            <Label htmlFor="custom-request" className="text-base font-semibold">
              Escrever Solicitação Personalizada
            </Label>
            <Textarea
              id="custom-request"
              value={customRequest}
              onChange={(e) => setCustomRequest(e.target.value)}
              placeholder="Descreva sua solicitação especial..."
              rows={4}
              className="resize-none"
            />
          </div>

          {/* Informações da reserva */}
          {reservation && (
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <p className="text-xs text-slate-600">
                <strong>Reserva:</strong> {reservation.reservation_code || reservation.id?.substring(0, 8)}
                {reservation.checkin_date && (
                  <>
                    {" • "}
                    <strong>Check-in:</strong> {format(new Date(reservation.checkin_date), "dd/MM/yyyy", { locale: ptBR })}
                  </>
                )}
                {reservation.checkout_date && (
                  <>
                    {" • "}
                    <strong>Check-out:</strong> {format(new Date(reservation.checkout_date), "dd/MM/yyyy", { locale: ptBR })}
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Botões */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || (selectedRequests.length === 0 && !customRequest.trim())}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Solicitações"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

