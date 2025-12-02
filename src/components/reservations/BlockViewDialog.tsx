import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2 } from "lucide-react";

interface BlockViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  onDelete?: () => void;
}

export const BlockViewDialog = ({
  open,
  onOpenChange,
  reservationId,
  onDelete,
}: BlockViewDialogProps) => {
  // Buscar dados da reserva (bloqueio)
  const { data: reservation, isLoading } = useQuery({
    queryKey: ["reservation", reservationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*)
        `)
        .eq("id", reservationId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: open && !!reservationId,
  });

  // Buscar informações do usuário que criou o bloqueio
  const { data: createdByUser } = useQuery({
    queryKey: ["user", reservation?.created_by],
    queryFn: async () => {
      if (!reservation?.created_by) return null;
      
      // Primeiro tentar buscar na tabela public.users
      const { data: publicUser, error: publicError } = await supabase
        .from("users")
        .select("full_name, email")
        .eq("id", reservation.created_by)
        .single();

      if (!publicError && publicUser) {
        return publicUser;
      }

      // Se não encontrar, tentar buscar do auth.users via RPC ou retornar apenas o ID
      // Por enquanto, retornar null e mostrar o ID se necessário
      return null;
    },
    enabled: open && !!reservation?.created_by,
  });

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Carregando...</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!reservation) {
    return null;
  }

  // Extrair motivo do bloqueio das notas
  const blockReason = reservation.notes?.replace(/^Bloqueio:\s*/i, "") || "Não informado";

  // Formatar nome do usuário que bloqueou
  const blockedBy = createdByUser 
    ? (createdByUser.full_name || createdByUser.email || "Usuário desconhecido")
    : (reservation.created_by ? reservation.created_by.substring(0, 8) + "..." : "Não informado");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-bold text-purple-900">
            Unidade Bloqueada
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Bloqueado por */}
          <div>
            <Label htmlFor="blocked_by" className="text-sm font-medium text-slate-700">
              Bloqueado por
            </Label>
            <Input
              id="blocked_by"
              value={blockedBy}
              readOnly
              disabled
              className="mt-1 bg-slate-50 cursor-not-allowed border-slate-200 text-slate-900"
            />
          </div>

          {/* Datas - Bloqueado de e Bloqueado até */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="blocked_from" className="text-sm font-medium text-slate-700">
                Bloqueado de
              </Label>
              <Input
                id="blocked_from"
                value={format(new Date(reservation.checkin_date), "dd/MM/yyyy", { locale: ptBR })}
                readOnly
                disabled
                className="mt-1 bg-slate-50 cursor-not-allowed border-slate-200 text-slate-900"
              />
            </div>
            <div>
              <Label htmlFor="blocked_until" className="text-sm font-medium text-slate-700">
                Bloqueado até
              </Label>
              <Input
                id="blocked_until"
                value={format(new Date(reservation.checkout_date), "dd/MM/yyyy", { locale: ptBR })}
                readOnly
                disabled
                className="mt-1 bg-slate-50 cursor-not-allowed border-slate-200 text-slate-900"
              />
            </div>
          </div>

          {/* Bloqueado em */}
          <div>
            <Label htmlFor="blocked_on" className="text-sm font-medium text-slate-700">
              Bloqueado em
            </Label>
            <Input
              id="blocked_on"
              value={format(new Date(reservation.created_at), "dd/MM/yyyy", { locale: ptBR })}
              readOnly
              disabled
              className="mt-1 bg-slate-50 cursor-not-allowed border-slate-200 text-slate-900"
            />
          </div>

          {/* Motivo do Bloqueio */}
          <div>
            <Label htmlFor="block_reason" className="text-sm font-medium text-slate-700">
              Motivo do Bloqueio
            </Label>
            <Textarea
              id="block_reason"
              value={blockReason}
              readOnly
              disabled
              rows={4}
              className="mt-1 resize-y bg-slate-50 cursor-not-allowed border-slate-200 text-slate-900"
            />
          </div>

          {/* Botão Desbloquear */}
          <div className="flex justify-end gap-2 pt-4">
            {onDelete && (
              <Button
                type="button"
                variant="outline"
                onClick={onDelete}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
              >
                Desbloquear
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
