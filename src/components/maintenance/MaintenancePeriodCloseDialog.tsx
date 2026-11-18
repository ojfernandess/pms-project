import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, CheckCircle2, Loader2, Lock, Tag, Wrench, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { resolveMaintenancePeriod } from "@/lib/maintenanceTicketPeriod";
import { useMaintenance } from "@/hooks/useMaintenance";
import { toast } from "sonner";
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticketId: string | null;
  roomLabel?: string | null;
  onClosed?: () => void;
};

export function MaintenancePeriodCloseDialog({
  open,
  onOpenChange,
  ticketId,
  roomLabel,
  onClosed,
}: Props) {
  const { closeTicket, isClosingTicket } = useMaintenance();
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["maintenance_ticket_close", ticketId],
    queryFn: async () => {
      if (!ticketId) return null;
      const { data, error } = await supabase
        .from("maintenance_tickets")
        .select(
          "id, title, description, status, room_id, maintenance_start_date, maintenance_end_date, opened_at, blocks_entire_room",
        )
        .eq("id", ticketId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!ticketId,
  });

  useEffect(() => {
    if (!open) {
      setResolutionNotes("");
      setConfirmCancelOpen(false);
    }
  }, [open, ticketId]);

  const period = ticket ? resolveMaintenancePeriod(ticket) : null;
  const isActive = ticket && ["open", "in_progress"].includes(String(ticket.status));
  const reason = ticket?.title?.trim() || ticket?.description?.trim() || "Manutenção";

  const validateAndSubmit = async (outcome: "completed" | "cancelled") => {
    if (!ticketId) return;
    const notes = resolutionNotes.trim();
    if (!notes) {
      toast.error("Informe o motivo da resolução antes de encerrar.");
      return;
    }
    try {
      await closeTicket({ id: ticketId, outcome, resolutionNotes: notes });
      onOpenChange(false);
      onClosed?.();
    } catch {
      // toast no hook
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="grid max-h-[min(90dvh,720px)] w-[calc(100%-1.5rem)] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-h-[min(92vh,720px)]">
          <DialogHeader className="shrink-0 border-b border-[#FCA5A5]/50 bg-[#FEE2E2] px-5 py-4 pr-12 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-red-900">
              <Wrench className="h-4 w-4 shrink-0" />
              Bloqueio de período · Manutenção
            </DialogTitle>
            <DialogDescription className="text-xs text-red-800/80">
              Encerre o chamado informando como a manutenção foi resolvida.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
            {isLoading && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            )}

            {!isLoading && ticket && (
              <>
                {roomLabel && (
                  <p className="text-xs text-slate-500">
                    Quarto: <span className="font-medium text-slate-700">{roomLabel}</span>
                  </p>
                )}

                <div className="flex items-start gap-2 rounded-lg border border-[#FCA5A5]/40 bg-[#FEE2E2]/50 px-3 py-2 text-sm text-red-900">
                  <Tag className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div>
                    <span className="text-xs font-medium text-red-800/70">Motivo do bloqueio</span>
                    <p className="font-medium leading-snug">{reason}</p>
                  </div>
                </div>

                {period && (
                  <div className="flex items-start gap-2 text-sm text-slate-700">
                    <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <span>
                      Período:{" "}
                      <span className="font-medium text-slate-900">
                        {format(parseISO(period.start), "dd/MM/yyyy", { locale: ptBR })} a{" "}
                        {format(parseISO(period.endInclusive), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    </span>
                  </div>
                )}

                {ticket.description && ticket.title && ticket.description !== ticket.title && (
                  <p className="text-xs leading-relaxed text-slate-600">{ticket.description}</p>
                )}

                {!isActive && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Este chamado já está encerrado ({ticket.status === "completed" ? "concluído" : "cancelado"}).
                  </div>
                )}

                {isActive && (
                  <div className="space-y-2">
                    <Label htmlFor="resolution_notes" className="text-sm font-medium text-slate-700">
                      Motivo da resolução <span className="text-red-600">*</span>
                    </Label>
                    <Textarea
                      id="resolution_notes"
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      placeholder="Descreva o que foi feito ou o motivo do cancelamento..."
                      rows={4}
                      className="resize-y border-slate-200 text-sm"
                      disabled={isClosingTicket}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {isActive && (
            <DialogFooter className="shrink-0 flex-col gap-2 border-t border-slate-100 bg-slate-50/95 px-5 py-4 pb-5 sm:flex-row sm:flex-wrap sm:justify-end sm:gap-2 sm:space-x-0">
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => onOpenChange(false)}
                disabled={isClosingTicket}
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full border-red-200 text-red-800 hover:bg-red-50 sm:w-auto"
                disabled={isClosingTicket}
                onClick={() => {
                  if (!resolutionNotes.trim()) {
                    toast.error("Informe o motivo da resolução antes de cancelar.");
                    return;
                  }
                  setConfirmCancelOpen(true);
                }}
              >
                <XCircle className="mr-1.5 h-4 w-4 shrink-0" />
                <span className="truncate">Cancelar manutenção</span>
              </Button>
              <Button
                type="button"
                className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
                disabled={isClosingTicket}
                onClick={() => validateAndSubmit("completed")}
              >
                {isClosingTicket ? (
                  <Loader2 className="mr-1.5 h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-1.5 h-4 w-4 shrink-0" />
                )}
                <span className="truncate">Concluir manutenção</span>
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-900">
              <Lock className="h-4 w-4" />
              Cancelar manutenção?
            </DialogTitle>
            <DialogDescription>
              O período bloqueado será liberado no mapa. O chamado ficará como cancelado e o motivo informado será
              registrado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmCancelOpen(false)} disabled={isClosingTicket}>
              Não
            </Button>
            <Button
              variant="destructive"
              disabled={isClosingTicket}
              onClick={() => {
                setConfirmCancelOpen(false);
                void validateAndSubmit("cancelled");
              }}
            >
              Sim, cancelar manutenção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}