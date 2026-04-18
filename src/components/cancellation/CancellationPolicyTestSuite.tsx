/**
 * Componente de Testes para Políticas de Cancelamento
 * Permite testar diferentes cenários de cancelamento
 */

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { calculateCancellationPenalty, ReservationData } from "@/utils/cancellationPolicyCalculator";
import { useCancellationPolicies } from "@/hooks/useCancellationPolicies";
import { formatCurrency } from "@/lib/reservationUtils";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const CancellationPolicyTestSuite = () => {
  const { policies } = useCancellationPolicies();
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>("");
  const [checkinDate, setCheckinDate] = useState<Date>(new Date());
  const [cancellationDate, setCancellationDate] = useState<Date>(new Date());
  const [totalAmount, setTotalAmount] = useState<string>("1000");
  const [testResults, setTestResults] = useState<any[]>([]);

  const selectedPolicy = policies.find((p) => p.id === selectedPolicyId);

  const runTest = (scenario: string, daysBeforeCheckin: number) => {
    if (!selectedPolicy) return;

    // Normalizar datas para meia-noite (00:00:00) para evitar problemas de timezone
    const testCheckin = new Date(checkinDate);
    testCheckin.setHours(0, 0, 0, 0);
    
    const testCancellation = new Date(testCheckin);
    testCancellation.setDate(testCancellation.getDate() - daysBeforeCheckin);
    testCancellation.setHours(0, 0, 0, 0);

    // Calcular data de criação da reserva (30 dias antes do check-in por padrão)
    const testCreatedAt = new Date(testCheckin);
    testCreatedAt.setDate(testCreatedAt.getDate() - 30);
    testCreatedAt.setHours(0, 0, 0, 0);

    // Calcular checkout (1 dia após check-in)
    const testCheckout = new Date(testCheckin);
    testCheckout.setDate(testCheckout.getDate() + 1);
    testCheckout.setHours(0, 0, 0, 0);

    // Criar dados completos da reserva
    const reservationData: ReservationData = {
      id: "test",
      checkin_date: testCheckin.toISOString(),
      checkout_date: testCheckout.toISOString(),
      total_amount: parseFloat(totalAmount) || 0,
      paid_amount: 0,
      pricing_plan_id: null,
      status: "confirmed",
      establishment_id: "test",
      created_at: testCreatedAt.toISOString(),
      channel: "direct",
    };

    // Usar a função real de cálculo
    const result = calculateCancellationPenalty(
      selectedPolicy as any,
      reservationData,
      testCancellation
    );

    setTestResults((prev) => [
      ...prev,
      {
        scenario,
        daysBeforeCheckin,
        checkinDate: format(testCheckin, "PPP", { locale: ptBR }),
        cancellationDate: format(testCancellation, "PPP", { locale: ptBR }),
        result,
      },
    ]);
  };

  const runAllTests = () => {
    if (!selectedPolicy) return;

    setTestResults([]);
    const scenarios = [
      { name: "Cancelamento no dia do check-in", days: 0 },
      { name: "Cancelamento 1 dia antes", days: 1 },
      { name: "Cancelamento 3 dias antes", days: 3 },
      { name: "Cancelamento 7 dias antes", days: 7 },
      { name: "Cancelamento 14 dias antes", days: 14 },
      { name: "Cancelamento 30 dias antes", days: 30 },
    ];

    scenarios.forEach((scenario) => {
      runTest(scenario.name, scenario.days);
    });
  };

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Suite de Testes - Políticas de Cancelamento</h3>
        <p className="text-sm text-muted-foreground">
          Teste diferentes cenários de cancelamento para validar a política
        </p>
      </div>

      <Tabs defaultValue="manual" className="space-y-4">
        <TabsList>
          <TabsTrigger value="manual">Teste Manual</TabsTrigger>
          <TabsTrigger value="scenarios">Cenários Automáticos</TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Política de Cancelamento</Label>
              <Select value={selectedPolicyId} onValueChange={setSelectedPolicyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma política" />
                </SelectTrigger>
                <SelectContent>
                  {policies.map((policy) => (
                    <SelectItem key={policy.id} value={policy.id}>
                      {policy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </div>

          <Button onClick={() => runTest("Teste Manual", 0)} disabled={!selectedPolicy} className="w-full">
            Executar Teste
          </Button>
        </TabsContent>

        <TabsContent value="scenarios" className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Política de Cancelamento</Label>
              <Select value={selectedPolicyId} onValueChange={setSelectedPolicyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma política" />
                </SelectTrigger>
                <SelectContent>
                  {policies.map((policy) => (
                    <SelectItem key={policy.id} value={policy.id}>
                      {policy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

            <div className="space-y-2">
              <Label>Data de Check-in Base</Label>
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

            <Button onClick={runAllTests} disabled={!selectedPolicy} className="w-full">
              Executar Todos os Cenários
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {testResults.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold">Resultados dos Testes</h4>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {testResults.map((test, index) => (
              <Card key={index} className={`p-4 ${
                test.result.penalty > 0 
                  ? "bg-amber-50 border-amber-200" 
                  : "bg-green-50 border-green-200"
              }`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{test.scenario}</p>
                    <p className="text-xs text-muted-foreground">
                      Check-in: {test.checkinDate} | Cancelamento: {test.cancellationDate}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {test.daysBeforeCheckin} dia(s) antes do check-in
                    </p>
                    {test.result.freeDeadline && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Prazo gratuito até: {format(test.result.freeDeadline, "PPP", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                  <Badge variant={test.result.penalty > 0 ? "destructive" : "default"}>
                    {test.result.penalty > 0
                      ? `Multa: ${formatCurrency(test.result.penalty)}`
                      : "Sem multa"}
                  </Badge>
                </div>
                <p className={`text-xs ${
                  test.result.penalty > 0 ? "text-amber-700" : "text-green-700"
                }`}>
                  {test.result.reason}
                </p>
                {test.result.calculationDetails && (
                  <div className="mt-2 pt-2 border-t border-gray-200">
                    <p className="text-xs font-semibold mb-1">Detalhes:</p>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>Valor base: {formatCurrency(test.result.calculationDetails.baseAmount)}</p>
                      {test.result.calculationDetails.appliedPercentage && (
                        <p>Percentual: {test.result.calculationDetails.appliedPercentage}%</p>
                      )}
                      {test.result.calculationDetails.appliedFixedAmount && (
                        <p>Valor fixo: {formatCurrency(test.result.calculationDetails.appliedFixedAmount)}</p>
                      )}
                      <p>Tipo: {test.result.calculationDetails.feeType}</p>
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

