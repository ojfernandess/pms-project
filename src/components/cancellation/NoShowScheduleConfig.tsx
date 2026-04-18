/**
 * Componente para configurar horário de processamento automático de no-shows
 */

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Clock, Save, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNoShowMigrations } from "@/hooks/useNoShowMigrations";

interface ScheduleConfig {
  id?: string;
  establishment_id: string;
  schedule_time: string; // HH:mm format
  is_active: boolean;
}

export const NoShowScheduleConfig = () => {
  const queryClient = useQueryClient();
  const establishmentId = getSelectedEstablishmentId();
  const [scheduleTime, setScheduleTime] = useState("19:00");
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const { scheduleTableExists } = useNoShowMigrations();

  // Buscar configuração existente
  const { data: config, isLoading } = useQuery({
    queryKey: ["no_show_schedule_config", establishmentId],
    queryFn: async () => {
      if (!establishmentId) return null;

      const { data, error } = await (supabase as any)
        .from("no_show_schedule_config")
        .select("*")
        .eq("establishment_id", establishmentId)
        .maybeSingle();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      return data as ScheduleConfig | null;
    },
    enabled: !!establishmentId,
  });

  // Ao trocar de estabelecimento, resetar para valores neutros até carregar a config do novo estabelecimento
  useEffect(() => {
    setScheduleTime("19:00");
    setIsActive(false);
  }, [establishmentId]);

  // Sincronizar estado local apenas após o carregamento (fonte única de verdade: evita flash "ligado" antes de ler o backend)
  useEffect(() => {
    if (!isLoading) {
      setScheduleTime(config?.schedule_time ?? "19:00");
      setIsActive(config?.is_active ?? false);
    }
  }, [isLoading, config]);

  const saveMutation = useMutation({
    mutationFn: async (configData: ScheduleConfig) => {
      if (!establishmentId) throw new Error("Estabelecimento não selecionado");

      if (config?.id) {
        // Atualizar
        const { error } = await (supabase as any)
          .from("no_show_schedule_config")
          .update({
            schedule_time: configData.schedule_time,
            is_active: configData.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", config.id);

        if (error) throw error;
      } else {
        // Criar
        const { error } = await (supabase as any)
          .from("no_show_schedule_config")
          .insert({
            establishment_id: establishmentId,
            schedule_time: configData.schedule_time,
            is_active: configData.is_active,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Configuração salva com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["no_show_schedule_config"] });
    },
    onError: (error: any) => {
      console.error("Erro ao salvar configuração:", error);
      toast.error("Erro ao salvar configuração");
    },
  });

  const handleSave = () => {
    if (!establishmentId) {
      toast.error("Selecione um estabelecimento");
      return;
    }

    // Validar formato de hora (HH:mm)
    const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(scheduleTime)) {
      toast.error("Formato de hora inválido. Use HH:mm (ex: 19:00)");
      return;
    }

    setSaving(true);
    saveMutation.mutate(
      {
        id: config?.id,
        establishment_id: establishmentId,
        schedule_time: scheduleTime,
        is_active: isActive,
      },
      {
        onSettled: () => setSaving(false),
      }
    );
  };

  if (isLoading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Carregando configuração...</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <Clock className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-lg font-semibold">Configuração de Processamento Automático</h3>
          <p className="text-sm text-muted-foreground">
            Configure o horário para processamento automático de no-shows
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="schedule_time">Horário de Processamento</Label>
          <div className="flex items-center gap-2">
            <Input
              id="schedule_time"
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="max-w-[200px]"
            />
            <span className="text-sm text-muted-foreground">
              (Formato: HH:mm)
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            O sistema processará no-shows automaticamente neste horário todos os dias
          </p>
        </div>

        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div>
            <Label htmlFor="is_active" className="text-base font-medium">
              Processamento Automático Ativo
            </Label>
            <p className="text-sm text-muted-foreground">
              Ative ou desative o processamento automático
            </p>
          </div>
          <Switch
            id="is_active"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
        </div>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-semibold text-blue-900 mb-2">
            ℹ️ Como Funciona
          </p>
          <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
            <li>Configure um horário (recomendado: 19:00)</li>
            <li>O sistema executará automaticamente todos os dias neste horário</li>
            <li>Processará todas as reservas que passaram do check-in sem check-in realizado</li>
            <li>Requer Supabase Edge Function configurada e cron job ativo</li>
          </ul>
        </div>

        {!scheduleTableExists && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-semibold text-amber-900 mb-2">
              ⚠️ Configuração Necessária
            </p>
            <p className="text-xs text-amber-800">
              Para que o processamento automático funcione, é necessário:
            </p>
            <ol className="text-xs text-amber-800 mt-2 space-y-1 list-decimal list-inside">
              <li>Deploy da Edge Function <code className="bg-amber-100 px-1 rounded">process-no-shows</code></li>
              <li>Configurar cron job no Supabase Dashboard</li>
              <li>Aplicar migration <code className="bg-amber-100 px-1 rounded">20251225000018_add_no_show_schedule_config.sql</code></li>
            </ol>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Salvar Configuração
            </>
          )}
        </Button>
      </div>
    </Card>
  );
};

