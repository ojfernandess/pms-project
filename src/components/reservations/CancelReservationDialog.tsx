import { useState, useEffect } from "react";
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
import { AlertTriangle, DollarSign, Info, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/reservationUtils";
import { supabase } from "@/integrations/supabase/client";
import { getReservationCancellationPolicy } from "@/utils/cancellationPolicyService";
import { CancellationCalculationResult, calculateCancellationPenalty } from "@/utils/cancellationPolicyCalculator";
import type { ReservationData } from "@/utils/cancellationPolicyCalculator";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface CancelReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservationId: string;
  reservationCode?: string;
  paidAmount?: number;
  hasPayments?: boolean;
  reservationData?: {
    checkin_date: string;
    checkout_date: string;
    total_amount: number;
    pricing_plan_id?: string | null;
  };
  onConfirm: (reason: string, refundPayments: boolean, penalty?: number) => Promise<void>;
}

export const CancelReservationDialog = ({
  open,
  onOpenChange,
  reservationId,
  reservationCode,
  paidAmount = 0,
  hasPayments = false,
  reservationData,
  onConfirm,
}: CancelReservationDialogProps) => {
  const [reason, setReason] = useState("");
  const [refundPayments, setRefundPayments] = useState(false);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [penaltyCalculation, setPenaltyCalculation] = useState<CancellationCalculationResult | null>(null);
  const [policyName, setPolicyName] = useState<string | null>(null);

  // Calcular multa ao abrir o dialog (dados vêm da BD; reservationData do pai é apenas fallback)
  useEffect(() => {
    if (!open || !reservationId) {
      setPenaltyCalculation(null);
      setPolicyName(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setCalculating(true);
      try {
        const policy = await getReservationCancellationPolicy(reservationId);
        if (cancelled) return;

        if (!policy) {
          setPolicyName(null);
          setPenaltyCalculation(null);
          return;
        }

        setPolicyName(policy.name);

        const { data: reservation } = await supabase
          .from("reservations")
          .select("id, checkin_date, checkout_date, total_amount, paid_amount, pricing_plan_id, status, establishment_id, created_at, channel")
          .eq("id", reservationId)
          .maybeSingle();

        if (cancelled) return;

        const { data: feeRows } = await supabase
          .from("reservation_service_fees")
          .select("amount, quantity")
          .eq("reservation_id", reservationId);

        if (cancelled) return;

        const { sumReservationServiceFees } = await import("@/lib/reservationServiceFeesTotal");
        const serviceFeesTotal = sumReservationServiceFees(feeRows);

        const checkin =
          reservation?.checkin_date || reservationData?.checkin_date || "";
        const checkout =
          reservation?.checkout_date || reservationData?.checkout_date || "";
        if (!checkin || !checkout) {
          setPenaltyCalculation(null);
          return;
        }

        const reservationDataForCalc: ReservationData = {
          id: reservation?.id || reservationId,
          checkin_date: checkin,
          checkout_date: checkout,
          total_amount:
            reservation?.total_amount ?? reservationData?.total_amount ?? 0,
          service_fees_total: serviceFeesTotal,
          paid_amount: reservation?.paid_amount ?? paidAmount ?? 0,
          pricing_plan_id:
            reservation?.pricing_plan_id ?? reservationData?.pricing_plan_id ?? null,
          status: reservation?.status || "confirmed",
          establishment_id: reservation?.establishment_id || "",
          created_at: reservation?.created_at || "",
          channel: (reservation as ReservationData)?.channel || "direct",
        };

        const result = calculateCancellationPenalty(
          policy,
          reservationDataForCalc,
          new Date()
        );
        if (!cancelled) setPenaltyCalculation(result);
      } catch (error) {
        console.error("Erro ao calcular multa:", error);
        if (!cancelled) setPenaltyCalculation(null);
      } finally {
        if (!cancelled) setCalculating(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    reservationId,
    paidAmount,
    reservationData?.checkin_date,
    reservationData?.checkout_date,
    reservationData?.total_amount,
    reservationData?.pricing_plan_id,
  ]);

  const handleConfirm = async () => {
    if (!reason.trim()) {
      return;
    }

    try {
      setLoading(true);
      
      // Aplicar cancelamento com cálculo automático
      const { applyCancellation } = await import("@/utils/cancellationPolicyService");
      const cancellationResult = await applyCancellation(
        reservationId,
        reason.trim(),
        new Date()
      );
      
      if (!cancellationResult.success) {
        throw new Error(cancellationResult.error || "Erro ao cancelar reserva");
      }
      
      await onConfirm(
        reason.trim(), 
        refundPayments,
        cancellationResult.penalty
      );
      
      setReason("");
      setRefundPayments(false);
      setPenaltyCalculation(null);
      setPolicyName(null);
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao cancelar:", error);
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
          {/* Exibição da multa calculada */}
          {calculating && (
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 text-blue-700">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Calculando multa de cancelamento...</span>
              </div>
            </Card>
          )}
          
          {!calculating && penaltyCalculation && (
            <Card className={`p-4 border-2 ${
              penaltyCalculation.penalty > 0 
                ? "bg-amber-50 border-amber-300" 
                : "bg-green-50 border-green-300"
            }`}>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className={`h-5 w-5 ${
                      penaltyCalculation.penalty > 0 ? "text-amber-600" : "text-green-600"
                    }`} />
                    <Label className="font-semibold">
                      {penaltyCalculation.penalty > 0 ? "Multa de Cancelamento" : "Cancelamento Gratuito"}
                    </Label>
                  </div>
                  {policyName && (
                    <Badge variant="outline" className="text-xs">
                      {policyName}
                    </Badge>
                  )}
                </div>
                
                {penaltyCalculation.penalty > 0 ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-amber-700">
                        {formatCurrency(penaltyCalculation.penalty)}
                      </span>
                    </div>
                    <p className="text-sm text-amber-700">
                      {penaltyCalculation.reason}
                    </p>
                    {penaltyCalculation.calculationDetails?.baseAmount != null && (
                      <p className="text-xs text-muted-foreground">
                        Base do cálculo (diárias + taxas):{" "}
                        {formatCurrency(penaltyCalculation.calculationDetails.baseAmount)}
                      </p>
                    )}
                    {penaltyCalculation.freeDeadline && (
                      <p className="text-xs text-muted-foreground">
                        Prazo de cancelamento gratuito: {new Date(penaltyCalculation.freeDeadline).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-green-700">
                    {penaltyCalculation.reason}
                  </p>
                )}
              </div>
            </Card>
          )}

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
              disabled={loading || calculating}
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


