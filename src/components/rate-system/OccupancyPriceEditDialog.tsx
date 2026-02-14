import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { formatCurrency } from "@/lib/reservationUtils";
import { toast } from "sonner";

interface OccupancyPriceEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryName: string;
  planName: string;
  occupancy: number; // 1, 2, 3, 4 hóspedes
  currentPrice: number;
  basePrice: number; // Preço base (x2)
  adultPrice: number; // Preço por adulto adicional
  savedFluctuationType?: 'fixed' | 'percentage' | null; // Tipo de flutuação salvo
  savedFluctuationValue?: number | null; // Valor de flutuação salvo
  isBulkEdit?: boolean; // Se true, aplica a alteração a todas as datas visíveis
  onSave: (data: {
    fluctuationType: 'fixed' | 'percentage';
    fluctuationValue: number;
  }) => Promise<void>;
}

export const OccupancyPriceEditDialog = ({
  open,
  onOpenChange,
  categoryName,
  planName,
  occupancy,
  currentPrice,
  basePrice,
  adultPrice,
  savedFluctuationType,
  savedFluctuationValue,
  isBulkEdit = false,
  onSave,
}: OccupancyPriceEditDialogProps) => {
  const [fluctuationType, setFluctuationType] = useState<'fixed' | 'percentage'>('percentage');
  const [fluctuationValue, setFluctuationValue] = useState('');

  useEffect(() => {
    if (open) {
      // Carregar valores salvos se existirem, senão usar valores padrão
      if (savedFluctuationType && savedFluctuationValue !== null && savedFluctuationValue !== undefined) {
        setFluctuationType(savedFluctuationType);
        // Formatar valor salvo para exibição (com vírgula se for decimal)
        setFluctuationValue(savedFluctuationValue.toString().replace('.', ','));
      } else {
        // Resetar valores quando abrir o modal sem valores salvos
        setFluctuationType('percentage');
        setFluctuationValue('');
      }
    }
  }, [open, savedFluctuationType, savedFluctuationValue]);

  const handleSave = async () => {
    const value = normalizeValue(fluctuationValue);
    if (value === 0) {
      toast.error('Por favor, insira um valor válido');
      return;
    }

    await onSave({
      fluctuationType,
      fluctuationValue: value,
    });
    onOpenChange(false);
  };

  // Normalizar valor inserido (remover espaços, tratar vírgula como separador decimal)
  const normalizeValue = (input: string): number => {
    if (!input || input.trim() === '') return 0;
    
    // Remover espaços e caracteres não numéricos exceto vírgula e ponto
    let cleaned = input.replace(/\s/g, '').replace(/[^0-9,.-]/g, '');
    
    // Se houver vírgula, tratar como separador decimal brasileiro
    if (cleaned.includes(',')) {
      // Se houver ponto também, remover o ponto (ex: 1.000,50 -> 1000,50)
      cleaned = cleaned.replace(/\./g, '');
      // Substituir vírgula por ponto para parseFloat
      cleaned = cleaned.replace(',', '.');
    }
    
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Calcular preço esperado baseado na flutuação
  const calculateExpectedPrice = () => {
    if (!fluctuationValue || fluctuationValue.trim() === '') return currentPrice;
    
    const value = normalizeValue(fluctuationValue);
    if (value === 0) return currentPrice;

    if (fluctuationType === 'percentage') {
      return currentPrice * (1 + value / 100);
    } else {
      // Valor absoluto: adicionar/subtrair do preço atual
      return currentPrice + value;
    }
  };

  const expectedPrice = calculateExpectedPrice();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{categoryName} - {planName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-gray-600">
            {isBulkEdit ? (
              <>
                <strong>Edição em massa:</strong> A alteração será aplicada a todas as datas futuras visíveis no grid.
                O valor será aplicado ao <strong>preço padrão (base_price)</strong> de cada data para calcular o preço da ocupação de {occupancy} {occupancy === 1 ? 'adulto' : 'adultos'}.
                Cada data manterá seu próprio preço padrão, e a flutuação será aplicada individualmente.
              </>
            ) : (
              <>
                O valor será adicionado ou subtraído do valor da ocupação padrão. 
                Atenção ao alterar para valor absoluto ou porcentagem, também será alterado 
                para outras variações desta tarifa.
              </>
            )}
          </p>

          <div className="space-y-2">
            <Label>Tipo de Flutuação</Label>
            <RadioGroup
              value={fluctuationType}
              onValueChange={(value) => setFluctuationType(value as 'fixed' | 'percentage')}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fixed" id="fixed" />
                <Label htmlFor="fixed" className="font-normal cursor-pointer">
                  Valor Absoluto
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="percentage" id="percentage" />
                <Label htmlFor="percentage" className="font-normal cursor-pointer">
                  Porcentagem
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fluctuation-value">
              {occupancy} {occupancy === 1 ? 'adulto' : 'adultos'}
            </Label>
            <div className="flex gap-0">
              <div className="flex items-center px-3 border border-r-0 rounded-l-md bg-muted">
                <span className="text-sm text-muted-foreground">
                  {fluctuationType === "fixed" ? "R$" : ""}
                </span>
              </div>
              <Input
                id="fluctuation-value"
                type="text"
                value={fluctuationValue}
                onChange={(e) => {
                  let value = e.target.value;
                  
                  // Permitir apenas números, vírgula, ponto e sinal negativo
                  value = value.replace(/[^0-9,.-]/g, '');
                  
                  // Se for valor absoluto, formatar melhor
                  if (fluctuationType === "fixed") {
                    // Permitir apenas uma vírgula ou ponto como separador decimal
                    const parts = value.split(/[,.]/);
                    if (parts.length > 2) {
                      // Se houver múltiplos separadores, manter apenas o primeiro
                      value = parts[0] + (parts[1] ? ',' + parts.slice(1).join('') : '');
                    }
                  }
                  
                  setFluctuationValue(value);
                }}
                placeholder={fluctuationType === "fixed" ? "0,00" : "0"}
                className="flex-1 rounded-none border-x-0"
              />
              {fluctuationType === "percentage" && (
                <div className="flex items-center px-3 border border-l-0 rounded-r-md bg-muted">
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              )}
            </div>
            {fluctuationValue && !isBulkEdit && (
              <div className="text-xs space-y-1">
                <p className="text-muted-foreground">
                  <span className="font-medium">Preço atual:</span> {formatCurrency(currentPrice)}
                </p>
                <p className="text-muted-foreground">
                  {fluctuationType === 'percentage' ? (
                    <>
                      <span className="font-medium">Ajuste:</span> {normalizeValue(fluctuationValue) > 0 ? '+' : ''}{normalizeValue(fluctuationValue)}%
                    </>
                  ) : (
                    <>
                      <span className="font-medium">Ajuste:</span> {normalizeValue(fluctuationValue) > 0 ? '+' : ''}{formatCurrency(normalizeValue(fluctuationValue))}
                    </>
                  )}
                </p>
                <p className="text-blue-600 font-semibold">
                  <span className="font-medium">Preço esperado:</span> {formatCurrency(expectedPrice)}
                </p>
              </div>
            )}
            {fluctuationValue && isBulkEdit && (
              <div className="text-xs space-y-1 p-3 bg-blue-50 rounded-md border border-blue-200">
                <p className="text-blue-800 font-medium">
                  A flutuação será aplicada ao preço padrão de cada data individualmente.
                </p>
                <p className="text-blue-700 text-xs mt-1">
                  {fluctuationType === 'percentage' ? (
                    <>Aplicando {normalizeValue(fluctuationValue) > 0 ? '+' : ''}{normalizeValue(fluctuationValue)}% ao preço padrão de cada data</>
                  ) : (
                    <>Aplicando {normalizeValue(fluctuationValue) > 0 ? '+' : ''}{formatCurrency(normalizeValue(fluctuationValue))} ao preço padrão de cada data</>
                  )}
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-red-50 hover:bg-red-100 text-red-600 border-red-200"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!fluctuationValue || normalizeValue(fluctuationValue) === 0}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Salvar Preço
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

