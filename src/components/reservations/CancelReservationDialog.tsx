import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, DollarSign } from "lucide-react";
import { formatCurrency } from "@/lib/reservationUtils";

interface CancelReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  reservationCode?: string;
  paidAmount?: number;
  hasPayments?: boolean;
  onConfirm: (reason: string, refundPayments: boolean) => Promise<void>;
}

export const CancelReservationDialog = ({
  open,
  onOpenChange,
  reservationId,
  reservationCode,
  paidAmount = 0,
  hasPayments = false,
  onConfirm,
}: CancelReservationDialogProps) => {
  const [reason, setReason] = useState("");
  const [refundPayments, setRefundPayments] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      return;
    }

    try {
      setLoading(true);
      await onConfirm(reason.trim(), refundPayments);
      setReason("");
      setRefundPayments(false);
      onOpenChange(false);
    } catch (error) {
      // Error já tratado no onConfirm
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setReason("");
    setRefundPayments(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancelar Reserva
          </DialogTitle>
          <DialogDescription>
            {reservationCode 
              ? `Tem certeza que deseja cancelar a reserva ${reservationCode}?`
              : "Tem certeza que deseja cancelar esta reserva?"}
            <br />
            <span className="font-semibold text-destructive mt-2 block">
              Esta ação não pode ser desfeita.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="cancellation_reason">
              Motivo do Cancelamento <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="cancellation_reason"
              placeholder="Informe o motivo do cancelamento (ex: Cliente solicitou cancelamento, Problema no pagamento, etc.)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="resize-none"
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Este motivo será registrado para controle e análise.
            </p>
          </div>

          {hasPayments && paidAmount > 0 && (
            <div className="space-y-3 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="refund_payments"
                  checked={refundPayments}
                  onCheckedChange={(checked) => setRefundPayments(checked === true)}
                  disabled={loading}
                />
                <div className="flex-1 space-y-1">
                  <Label
                    htmlFor="refund_payments"
                    className="text-sm font-medium cursor-pointer flex items-center gap-2"
                  >
                    <DollarSign className="h-4 w-4 text-emerald-600" />
                    Estornar Pagamentos
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ao marcar esta opção, todos os pagamentos desta reserva serão removidos e o valor pago será zerado.
                    <br />
                    <span className="font-semibold text-emerald-600">
                      Valor total a ser estornado: {formatCurrency(paidAmount)}
                    </span>
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    Se não marcar, os pagamentos serão mantidos e a reserva será cancelada sem estorno.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={loading}
          >
            Não Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || !reason.trim()}
          >
            {loading ? "Cancelando..." : "Confirmar Cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};


