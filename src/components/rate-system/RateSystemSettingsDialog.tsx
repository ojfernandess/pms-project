import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";

interface RateSystemSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const RateSystemSettingsDialog = ({ open, onOpenChange }: RateSystemSettingsDialogProps) => {
  const queryClient = useQueryClient();
  const establishmentId = getSelectedEstablishmentId();

  const [settings, setSettings] = useState({
    auto_apply_dynamic_rules: false,
    auto_sync_channels: false,
    sync_interval_hours: 24,
    default_rate_plan: "",
    enable_rate_parity: true,
    min_price_threshold: 0,
    max_price_threshold: 10000,
    enable_recommendations: true,
    recommendation_threshold_occupancy: 90,
    recommendation_threshold_low_occupancy: 30,
    price_increase_percentage: 15,
    price_decrease_percentage: 10,
    enable_overbooking: false,
    max_overbooking_percentage: 5,
    enable_audit_log: true,
    currency: "BRL",
    date_format: "DD/MM/YYYY",
  });

  // Buscar configurações existentes
  const { data: existingSettings, isLoading } = useQuery({
    queryKey: ["rate_system_settings", establishmentId],
    queryFn: async () => {
      if (!establishmentId) return null;

      // Buscar configurações do estabelecimento (pode ser uma tabela específica ou usar hotel_settings)
      const { data, error } = await supabase
        .from("hotel_settings")
        .select("*")
        .eq("establishment_id", establishmentId)
        .single();

      if (error && error.code !== "PGRST116") {
        console.error("Erro ao buscar configurações:", error);
      }

      return data;
    },
    enabled: open && !!establishmentId,
  });

  useEffect(() => {
    if (existingSettings && existingSettings.rate_system_settings) {
      console.log("RateSystemSettings: Carregando configurações existentes:", {
        rate_system_settings: existingSettings.rate_system_settings,
        auto_apply_dynamic_rules: existingSettings.rate_system_settings.auto_apply_dynamic_rules,
        type: typeof existingSettings.rate_system_settings.auto_apply_dynamic_rules
      });
      setSettings((prev) => ({
        ...prev,
        ...existingSettings.rate_system_settings,
      }));
    }
  }, [existingSettings]);

  const updateSettings = useMutation({
    mutationFn: async (newSettings: typeof settings) => {
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      // Verificar se já existe um registro para este estabelecimento
      const { data: existing, error: checkError } = await supabase
        .from("hotel_settings")
        .select("id")
        .eq("establishment_id", establishmentId)
        .maybeSingle();

      if (checkError && checkError.code !== "PGRST116") {
        throw checkError;
      }

      // Preparar dados para inserção/atualização
      const updateData: any = {
        establishment_id: establishmentId,
        rate_system_settings: newSettings,
        updated_at: new Date().toISOString(),
      };

      // Se já existe, fazer update; caso contrário, fazer insert
      if (existing) {
        const { data, error } = await supabase
          .from("hotel_settings")
          .update(updateData)
          .eq("establishment_id", establishmentId)
          .select()
          .single();

        if (error) {
          console.error("Erro ao atualizar hotel_settings:", error);
          throw error;
        }
        return data;
      } else {
        // Buscar nome do estabelecimento para usar como name
        const { data: establishment, error: estError } = await supabase
          .from("establishments")
          .select("name")
          .eq("id", establishmentId)
          .single();

        // Adicionar campos obrigatórios para criação
        updateData.name = establishment?.name || "Configurações do Estabelecimento";
        updateData.created_at = new Date().toISOString();

        const { data, error } = await supabase
          .from("hotel_settings")
          .insert(updateData)
          .select()
          .single();

        if (error) {
          console.error("Erro ao inserir hotel_settings:", error);
          throw error;
        }
        return data;
      }
    },
    onSuccess: (data) => {
      console.log("RateSystemSettings: Configurações salvas:", {
        rate_system_settings: data?.rate_system_settings,
        auto_apply_dynamic_rules: data?.rate_system_settings?.auto_apply_dynamic_rules,
        type: typeof data?.rate_system_settings?.auto_apply_dynamic_rules
      });
      queryClient.invalidateQueries({ queryKey: ["rate_system_settings"] });
      toast.success("Configurações salvas com sucesso!");
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao salvar configurações");
    },
  });

  const handleSave = () => {
    updateSettings.mutate(settings);
  };

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="text-center p-8">Carregando configurações...</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações do Sistema Tarifário</DialogTitle>
          <DialogDescription>
            Configure as opções e comportamentos do sistema de tarifas
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">Geral</TabsTrigger>
            <TabsTrigger value="automation">Automação</TabsTrigger>
            <TabsTrigger value="recommendations">Recomendações</TabsTrigger>
            <TabsTrigger value="advanced">Avançado</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="currency">Moeda</Label>
                <Select
                  value={settings.currency}
                  onValueChange={(value) => setSettings({ ...settings, currency: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL (R$)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="date_format">Formato de Data</Label>
                <Select
                  value={settings.date_format}
                  onValueChange={(value) => setSettings({ ...settings, date_format: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                    <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="min_price">Preço Mínimo (R$)</Label>
                  <Input
                    id="min_price"
                    type="number"
                    step="0.01"
                    value={settings.min_price_threshold}
                    onChange={(e) => setSettings({ ...settings, min_price_threshold: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label htmlFor="max_price">Preço Máximo (R$)</Label>
                  <Input
                    id="max_price"
                    type="number"
                    step="0.01"
                    value={settings.max_price_threshold}
                    onChange={(e) => setSettings({ ...settings, max_price_threshold: parseFloat(e.target.value) || 10000 })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="rate_parity">Habilitar Rate Parity</Label>
                  <p className="text-sm text-gray-500">Garantir que as tarifas sejam consistentes entre canais</p>
                </div>
                <Switch
                  id="rate_parity"
                  checked={settings.enable_rate_parity}
                  onCheckedChange={(checked) => setSettings({ ...settings, enable_rate_parity: checked })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="automation" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto_apply_rules">Aplicar Regras Dinâmicas Automaticamente</Label>
                  <p className="text-sm text-gray-500">Aplicar regras dinâmicas quando as condições forem atendidas</p>
                </div>
                <Switch
                  id="auto_apply_rules"
                  checked={settings.auto_apply_dynamic_rules}
                  onCheckedChange={(checked) => setSettings({ ...settings, auto_apply_dynamic_rules: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto_sync">Sincronização Automática com Canais</Label>
                  <p className="text-sm text-gray-500">Sincronizar tarifas automaticamente com canais de distribuição</p>
                </div>
                <Switch
                  id="auto_sync"
                  checked={settings.auto_sync_channels}
                  onCheckedChange={(checked) => setSettings({ ...settings, auto_sync_channels: checked })}
                />
              </div>

              {settings.auto_sync_channels && (
                <div>
                  <Label htmlFor="sync_interval">Intervalo de Sincronização (horas)</Label>
                  <Input
                    id="sync_interval"
                    type="number"
                    min="1"
                    value={settings.sync_interval_hours}
                    onChange={(e) => setSettings({ ...settings, sync_interval_hours: parseInt(e.target.value) || 24 })}
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="audit_log">Habilitar Log de Auditoria</Label>
                  <p className="text-sm text-gray-500">Registrar todas as alterações de tarifas para auditoria</p>
                </div>
                <Switch
                  id="audit_log"
                  checked={settings.enable_audit_log}
                  onCheckedChange={(checked) => setSettings({ ...settings, enable_audit_log: checked })}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="recommendations" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enable_recommendations">Habilitar Recomendações Automáticas</Label>
                  <p className="text-sm text-gray-500">Receber sugestões de ajuste de preços baseado em ocupação</p>
                </div>
                <Switch
                  id="enable_recommendations"
                  checked={settings.enable_recommendations}
                  onCheckedChange={(checked) => setSettings({ ...settings, enable_recommendations: checked })}
                />
              </div>

              {settings.enable_recommendations && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="high_occupancy">Ocupação Alta (%)</Label>
                      <Input
                        id="high_occupancy"
                        type="number"
                        min="0"
                        max="100"
                        value={settings.recommendation_threshold_occupancy}
                        onChange={(e) => setSettings({ ...settings, recommendation_threshold_occupancy: parseInt(e.target.value) || 90 })}
                      />
                      <p className="text-xs text-gray-500 mt-1">Acima deste valor, sugerir aumento de preço</p>
                    </div>
                    <div>
                      <Label htmlFor="low_occupancy">Ocupação Baixa (%)</Label>
                      <Input
                        id="low_occupancy"
                        type="number"
                        min="0"
                        max="100"
                        value={settings.recommendation_threshold_low_occupancy}
                        onChange={(e) => setSettings({ ...settings, recommendation_threshold_low_occupancy: parseInt(e.target.value) || 30 })}
                      />
                      <p className="text-xs text-gray-500 mt-1">Abaixo deste valor, sugerir redução de preço</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="increase_percentage">Aumento Sugerido (%)</Label>
                      <Input
                        id="increase_percentage"
                        type="number"
                        min="0"
                        max="100"
                        value={settings.price_increase_percentage}
                        onChange={(e) => setSettings({ ...settings, price_increase_percentage: parseInt(e.target.value) || 15 })}
                      />
                    </div>
                    <div>
                      <Label htmlFor="decrease_percentage">Redução Sugerida (%)</Label>
                      <Input
                        id="decrease_percentage"
                        type="number"
                        min="0"
                        max="100"
                        value={settings.price_decrease_percentage}
                        onChange={(e) => setSettings({ ...settings, price_decrease_percentage: parseInt(e.target.value) || 10 })}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="advanced" className="space-y-6 mt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="overbooking">Habilitar Overbooking</Label>
                  <p className="text-sm text-gray-500">Permitir reservas acima da capacidade física</p>
                </div>
                <Switch
                  id="overbooking"
                  checked={settings.enable_overbooking}
                  onCheckedChange={(checked) => setSettings({ ...settings, enable_overbooking: checked })}
                />
              </div>

              {settings.enable_overbooking && (
                <div>
                  <Label htmlFor="max_overbooking">Percentual Máximo de Overbooking (%)</Label>
                  <Input
                    id="max_overbooking"
                    type="number"
                    min="0"
                    max="50"
                    value={settings.max_overbooking_percentage}
                    onChange={(e) => setSettings({ ...settings, max_overbooking_percentage: parseInt(e.target.value) || 5 })}
                  />
                  <p className="text-xs text-gray-500 mt-1">Percentual máximo de reservas acima da capacidade</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};


