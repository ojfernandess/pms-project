import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, ArrowLeft, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { simulateCancellation, calculateCancellationPenalty } from "@/utils/cancellationPolicyCalculator";
import { CancellationPolicy, ReservationData } from "@/utils/cancellationPolicyCalculator";
import { formatCurrency } from "@/lib/reservationUtils";
import { Badge } from "@/components/ui/badge";

interface CancellationPolicySimulatorProps {
  policy: CancellationPolicy | null;
  onBack?: () => void;
}

export const CancellationPolicySimulator = ({ policy, onBack }: CancellationPolicySimulatorProps) => {
  const [reservationDate, setReservationDate] = useState<Date>(() => {
    // Por padrão, definir como 30 dias antes do check-in
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date;
  });
  const [checkinDate, setCheckinDate] = useState<Date>(new Date());
  const [cancellationDate, setCancellationDate] = useState<Date>(new Date());
  const [totalAmount, setTotalAmount] = useState<string>("1000");
  const [result, setResult] = useState<any>(null);

  // Se não houver política selecionada, mostrar mensagem
  if (!policy) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground mb-4">
          Selecione uma política de cancelamento para simular
        </p>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para Lista
          </Button>
        )}
      </Card>
    );
  }

  const handleSimulate = () => {
    const amount = parseFloat(totalAmount) || 0;
    if (amount <= 0) {
      setResult(null);
      return;
    }

    // Normalizar datas para meia-noite (00:00:00) para evitar problemas de timezone
    const normalizedReservation = new Date(reservationDate);
    normalizedReservation.setHours(0, 0, 0, 0);
    
    const normalizedCheckin = new Date(checkinDate);
    normalizedCheckin.setHours(0, 0, 0, 0);
    
    const normalizedCancellation = new Date(cancellationDate);
    normalizedCancellation.setHours(0, 0, 0, 0);

    // Validar que a data de reserva não é posterior ao check-in
    if (normalizedReservation > normalizedCheckin) {
      setResult({
        error: "A data de criação da reserva não pode ser posterior à data de check-in",
      });
      return;
    }

    // Validar que a data de cancelamento não é anterior à data de reserva
    if (normalizedCancellation < normalizedReservation) {
      setResult({
        error: "A data de cancelamento não pode ser anterior à data de criação da reserva",
      });
      return;
    }

    // Usar a função real de cálculo para garantir lógica correta
    const reservationData: ReservationData = {
      id: "simulation",
      checkin_date: normalizedCheckin.toISOString(),
      checkout_date: new Date(normalizedCheckin.getTime() + 24 * 60 * 60 * 1000).toISOString(), // +1 dia
      total_amount: amount,
      paid_amount: 0,
      pricing_plan_id: null,
      status: "confirmed",
      establishment_id: "simulation",
      created_at: normalizedReservation.toISOString(),
      channel: "direct",
    };

    // Usar calculateCancellationPenalty diretamente (lógica real)
    const calculationResult = calculateCancellationPenalty(
      policy,
      reservationData,
      normalizedCancellation
    );

    setResult({
      penalty: calculationResult.penalty,
      penaltyType: calculationResult.penaltyType,
      reason: calculationResult.reason,
      freeDeadline: calculationResult.freeDeadline,
      calculationDetails: calculationResult.calculationDetails,
    });
  };

  const handleReset = () => {
    const defaultReservationDate = new Date();
    defaultReservationDate.setDate(defaultReservationDate.getDate() - 30);
    setReservationDate(defaultReservationDate);
    setCheckinDate(new Date());
    setCancellationDate(new Date());
    setTotalAmount("1000");
    setResult(null);
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold mb-2">Simulador de Política</h3>
          <p className="text-sm text-muted-foreground">
            Simule diferentes cenários de cancelamento para: <strong>{policy.name}</strong>
          </p>
        </div>
        {onBack && (
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Escolher Outra Política
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>Data de Criação da Reserva</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !reservationDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {reservationDate ? format(reservationDate, "PPP", { locale: ptBR }) : "Selecione"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={reservationDate}
                onSelect={(date) => date && setReservationDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            Data em que a reserva foi realizada/comprada
          </p>
        </div>

        <div className="space-y-2">
          <Label>Data de Check-in</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !checkinDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {checkinDate ? format(checkinDate, "PPP", { locale: ptBR }) : "Selecione"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={checkinDate}
                onSelect={(date) => date && setCheckinDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Data de Cancelamento</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !cancellationDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {cancellationDate ? format(cancellationDate, "PPP", { locale: ptBR }) : "Selecione"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={cancellationDate}
                onSelect={(date) => date && setCancellationDate(date)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Valor Total da Reserva (R$)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            placeholder="1000.00"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSimulate} className="flex-1">
          Simular Cancelamento
        </Button>
        <Button variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Limpar
        </Button>
      </div>

      {result?.error && (
        <Card className="p-4 border-2 bg-red-50 border-red-300">
          <p className="text-sm text-red-700">{result.error}</p>
        </Card>
      )}

      {result && !result.error && (
        <Card className={`p-4 border-2 ${
          result.penalty > 0 
            ? "bg-amber-50 border-amber-300" 
            : "bg-green-50 border-green-300"
        }`}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">
                {result.penalty > 0 ? "Multa Aplicada" : "Cancelamento Gratuito"}
              </Label>
              <Badge variant={result.penalty > 0 ? "destructive" : "default"}>
                {result.penaltyType}
              </Badge>
            </div>
            
            {result.penalty > 0 ? (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-amber-700">
                    {formatCurrency(result.penalty)}
                  </span>
                </div>
                <p className="text-sm text-amber-700">{result.reason}</p>
              </>
            ) : (
              <p className="text-sm text-green-700">{result.reason}</p>
            )}

            {result.freeDeadline && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  Prazo de cancelamento gratuito: {
                    // Se o deadline é 23:59:59, mostrar apenas a data (deadline calculado em dias)
                    result.freeDeadline.getHours() === 23 && result.freeDeadline.getMinutes() === 59
                      ? format(result.freeDeadline, "PPP", { locale: ptBR })
                      : format(result.freeDeadline, "PPP 'às' HH:mm", { locale: ptBR })
                  }
                </p>
                {result.penalty > 0 && (
                  <p className="text-xs text-amber-600">
                    ⚠️ Cancelamento realizado após o prazo de cancelamento gratuito
                    {format(checkinDate, "PPP", { locale: ptBR }) === format(cancellationDate, "PPP", { locale: ptBR }) && 
                      " (no mesmo dia do check-in)"}
                  </p>
                )}
              </div>
            )}

            <div className="mt-3 pt-3 border-t">
              <p className="text-xs font-semibold mb-1">Detalhes do Cálculo:</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Valor base: {formatCurrency(result.calculationDetails.baseAmount)}</p>
                {result.calculationDetails.appliedPercentage && (
                  <p>Percentual aplicado: {result.calculationDetails.appliedPercentage}%</p>
                )}
                {result.calculationDetails.appliedFixedAmount && (
                  <p>Valor fixo aplicado: {formatCurrency(result.calculationDetails.appliedFixedAmount)}</p>
                )}
                <p>Tipo de taxa: {result.calculationDetails.feeType}</p>
                <p className="pt-2 border-t mt-2">
                  Tempo desde a criação: {Math.ceil((checkinDate.getTime() - reservationDate.getTime()) / (1000 * 60 * 60 * 24))} dias
                </p>
                <p>
                  Tempo até o check-in: {Math.ceil((checkinDate.getTime() - cancellationDate.getTime()) / (1000 * 60 * 60 * 24))} dias
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </Card>
  );
};

