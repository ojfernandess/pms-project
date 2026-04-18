/**
 * Componente para processar no-shows automaticamente
 * Pode ser usado em páginas administrativas ou como componente de background
 */

import { useState, useEffect } from "react";
import { useAutoNoShowProcessor, useNoShowProcessor } from "@/hooks/useNoShowProcessor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Clock, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface NoShowProcessorProps {
  defaultAutoProcess?: boolean;
  defaultManualEnabled?: boolean;
  intervalMinutes?: number;
}

export const NoShowProcessor = ({
  defaultAutoProcess = false,
  defaultManualEnabled = true,
  intervalMinutes = 60,
}: NoShowProcessorProps) => {
  const [autoProcessEnabled, setAutoProcessEnabled] = useState(defaultAutoProcess);
  const [manualEnabled, setManualEnabled] = useState(defaultManualEnabled);
  const { processNoShowsViaRPC, isProcessing, processedCount } = useNoShowProcessor();

  // Processar automaticamente se habilitado
  useEffect(() => {
    if (!autoProcessEnabled) return;

    // Processar imediatamente ao ativar
    processNoShowsViaRPC();

    // Configurar intervalo para processar periodicamente
    const interval = setInterval(() => {
      processNoShowsViaRPC();
    }, intervalMinutes * 60 * 1000);

    return () => clearInterval(interval);
  }, [autoProcessEnabled, intervalMinutes]); // Remover processNoShowsViaRPC das dependências

  const handleManualProcess = () => {
    if (manualEnabled) {
      processNoShowsViaRPC();
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <Clock className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <h3 className="text-sm font-semibold">Processamento de No-Shows</h3>
          <p className="text-xs text-muted-foreground">
            Configure processamento manual e automático
          </p>
        </div>
      </div>

      <Separator />

      {/* Processamento Manual */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="manual-enabled" className="text-sm font-medium">
              Processamento Manual
            </Label>
            <p className="text-xs text-muted-foreground">
              Permite processar no-shows manualmente através do botão
            </p>
          </div>
          <Switch
            id="manual-enabled"
            checked={manualEnabled}
            onCheckedChange={setManualEnabled}
          />
        </div>

        {manualEnabled && (
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              {processedCount > 0 && (
                <Badge variant="secondary">
                  {processedCount} processado(s)
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                Clique no botão para processar agora
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualProcess}
              disabled={isProcessing || !manualEnabled}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Processar Agora
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Processamento Automático */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="auto-enabled" className="text-sm font-medium">
              Processamento Automático
            </Label>
            <p className="text-xs text-muted-foreground">
              Processa automaticamente a cada {intervalMinutes} minutos em background
            </p>
          </div>
          <Switch
            id="auto-enabled"
            checked={autoProcessEnabled}
            onCheckedChange={setAutoProcessEnabled}
          />
        </div>

        {autoProcessEnabled && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Settings className="h-4 w-4 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-blue-900 mb-1">
                  Processamento Automático Ativo
                </p>
                <p className="text-xs text-blue-800">
                  O sistema processará no-shows automaticamente a cada {intervalMinutes} minutos.
                  O processamento ocorre em background e não requer ação manual.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

/**
 * Hook wrapper para processamento automático em background
 * Use este componente em App.tsx ou layout principal
 * Agora com controle de ativação
 */
export const AutoNoShowProcessor = ({ 
  intervalMinutes = 60,
  enabled = true 
}: { 
  intervalMinutes?: number;
  enabled?: boolean;
}) => {
  useAutoNoShowProcessor(enabled ? intervalMinutes : 0);
  return null; // Componente invisível
};

