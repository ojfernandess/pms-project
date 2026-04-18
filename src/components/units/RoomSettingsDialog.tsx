import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";
import { Save } from "lucide-react";

interface RoomSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string | null;
  onSuccess: () => void;
}

export const RoomSettingsDialog = ({ open, onOpenChange, roomId, onSuccess }: RoomSettingsDialogProps) => {
  const [loading, setLoading] = useState(false);
  
  // Buscar usuários da empresa
  const { data: companyUsers = [] } = useQuery({
    queryKey: ["company_users_for_rooms", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      const { data: establishmentData } = await supabase
        .from("establishments")
        .select("company_id")
        .eq("id", establishmentId)
        .single();

      if (!establishmentData?.company_id) return [];

      const { data: userCompanies } = await supabase
        .from("user_companies")
        .select("user_id")
        .eq("company_id", establishmentData.company_id)
        .eq("is_active", true);

      if (!userCompanies || userCompanies.length === 0) return [];

      const userIds = userCompanies.map((uc: any) => uc.user_id);
      const { data: users } = await supabase
        .from("users")
        .select("id, email, full_name")
        .in("id", userIds)
        .order("full_name");

      return (users || []).map((user: any) => ({
        id: user.id,
        email: user.email,
        full_name: user.full_name || user.email || "Usuário sem nome",
      }));
    },
    enabled: open && !!getSelectedEstablishmentId(),
  });

  const [formData, setFormData] = useState({
    name: "",
    room_number: "",
    floor: "",
    notes: "",
    owner_user_id: "none",
    owner_for_receipt_id: "none",
    commission: "0,00",
    maintenance_fee: "0,00",
    authentication_type: "fixed_password",
    fixed_password: "",
    exclude_from_billing: false,
    hide_from_map: false,
    is_blocked: false,
  });

  useEffect(() => {
    if (open && roomId) {
      loadRoomData();
    } else if (open && !roomId) {
      setFormData({
        name: "",
        room_number: "",
        floor: "",
        notes: "",
        owner_user_id: "none",
        owner_for_receipt_id: "none",
        commission: "0,00",
        maintenance_fee: "0,00",
        authentication_type: "fixed_password",
        fixed_password: "",
        exclude_from_billing: false,
        hide_from_map: false,
        is_blocked: false,
      });
    }
  }, [open, roomId]);

  const loadRoomData = async () => {
    if (!roomId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          name: data.name || "",
          room_number: data.room_number || "",
          floor: data.floor?.toString() || "",
          notes: data.notes || "",
          owner_user_id: data.owner_user_id || "none",
          owner_for_receipt_id: data.owner_for_receipt_id || "none",
          commission: data.commission ? (typeof data.commission === 'number' ? data.commission.toFixed(2).replace('.', ',') : data.commission) : "0,00",
          maintenance_fee: data.maintenance_fee ? (typeof data.maintenance_fee === 'number' ? data.maintenance_fee.toFixed(2).replace('.', ',') : data.maintenance_fee) : "0,00",
          authentication_type: data.authentication_type || "fixed_password",
          fixed_password: data.fixed_password || "",
          exclude_from_billing: data.exclude_from_billing || false,
          hide_from_map: data.hide_from_map || false,
          is_blocked: data.is_blocked || false,
        });
      }
    } catch (error: any) {
      console.error("Erro ao carregar quarto:", error);
      toast.error("Erro ao carregar dados do quarto");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId) return;

    setLoading(true);
    try {
      const establishmentId = getSelectedEstablishmentId();
      const commissionValue = parseFloat(formData.commission.replace(',', '.')) || 0;
      const maintenanceFeeValue = parseFloat(formData.maintenance_fee.replace(',', '.')) || 0;

      const roomData: any = {
        name: formData.name || null,
        room_number: formData.room_number,
        floor: formData.floor ? parseInt(formData.floor) : null,
        notes: formData.notes || null,
        owner_user_id: formData.owner_user_id && formData.owner_user_id !== "none" ? formData.owner_user_id : null,
        owner_for_receipt_id: formData.owner_for_receipt_id && formData.owner_for_receipt_id !== "none" ? formData.owner_for_receipt_id : null,
        commission: commissionValue,
        maintenance_fee: maintenanceFeeValue,
        authentication_type: formData.authentication_type,
        fixed_password: formData.fixed_password || null,
        exclude_from_billing: formData.exclude_from_billing,
        hide_from_map: formData.hide_from_map,
        is_blocked: formData.is_blocked,
        establishment_id: establishmentId || undefined,
      };

      const { error } = await supabase
        .from("rooms")
        .update(roomData)
        .eq("id", roomId);

      if (error) throw error;

      toast.success("Definições atualizadas com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao atualizar quarto:", error);
      toast.error(error.message || "Erro ao atualizar definições");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Definições do Quarto</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">Geral</TabsTrigger>
              <TabsTrigger value="ownership">Proprietário</TabsTrigger>
              <TabsTrigger value="advanced">Avançado</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome do Quarto</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Nome do quarto"
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="room_number">Número do Quarto</Label>
                  <Input
                    id="room_number"
                    value={formData.room_number}
                    onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
                    placeholder="Número do quarto"
                    disabled={loading}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="floor">Andar</Label>
                  <Input
                    id="floor"
                    type="number"
                    value={formData.floor}
                    onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                    placeholder="Andar"
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Descrição</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Descrição do quarto"
                  disabled={loading}
                  rows={4}
                />
              </div>
            </TabsContent>

            <TabsContent value="ownership" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="owner_user_id">Proprietário</Label>
                  <Select
                    value={formData.owner_user_id}
                    onValueChange={(value) => setFormData({ ...formData, owner_user_id: value })}
                    disabled={loading}
                  >
                    <SelectTrigger id="owner_user_id">
                      <SelectValue placeholder="Selecione o proprietário" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {companyUsers.map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="owner_for_receipt_id">Proprietário para Recibo</Label>
                  <Select
                    value={formData.owner_for_receipt_id}
                    onValueChange={(value) => setFormData({ ...formData, owner_for_receipt_id: value })}
                    disabled={loading}
                  >
                    <SelectTrigger id="owner_for_receipt_id">
                      <SelectValue placeholder="Selecione o proprietário para recibo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {companyUsers.map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="commission">Comissão (R$)</Label>
                  <Input
                    id="commission"
                    type="text"
                    value={formData.commission}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d.,]/g, "");
                      setFormData({ ...formData, commission: value });
                    }}
                    placeholder="0,00"
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="maintenance_fee">Taxa de Manutenção (R$)</Label>
                  <Input
                    id="maintenance_fee"
                    type="text"
                    value={formData.maintenance_fee}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^\d.,]/g, "");
                      setFormData({ ...formData, maintenance_fee: value });
                    }}
                    placeholder="0,00"
                    disabled={loading}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Excluir da Faturação</Label>
                    <p className="text-sm text-muted-foreground">Excluir este quarto da faturação</p>
                  </div>
                  <Switch
                    checked={formData.exclude_from_billing}
                    onCheckedChange={(checked) => setFormData({ ...formData, exclude_from_billing: checked })}
                    disabled={loading}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Ocultar do Mapa</Label>
                    <p className="text-sm text-muted-foreground">Ocultar este quarto do mapa de reservas</p>
                  </div>
                  <Switch
                    checked={formData.hide_from_map}
                    onCheckedChange={(checked) => setFormData({ ...formData, hide_from_map: checked })}
                    disabled={loading}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Bloqueado</Label>
                    <p className="text-sm text-muted-foreground">Bloquear este quarto para reservas</p>
                  </div>
                  <Switch
                    checked={formData.is_blocked}
                    onCheckedChange={(checked) => setFormData({ ...formData, is_blocked: checked })}
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="authentication_type">Tipo de Autenticação</Label>
                <Select
                  value={formData.authentication_type}
                  onValueChange={(value) => setFormData({ ...formData, authentication_type: value })}
                  disabled={loading}
                >
                  <SelectTrigger id="authentication_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed_password">Senha Fixa</SelectItem>
                    <SelectItem value="dynamic_password">Senha Dinâmica</SelectItem>
                    <SelectItem value="no_password">Sem Senha</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.authentication_type === "fixed_password" && (
                <div>
                  <Label htmlFor="fixed_password">Senha Fixa</Label>
                  <Input
                    id="fixed_password"
                    type="password"
                    value={formData.fixed_password}
                    onChange={(e) => setFormData({ ...formData, fixed_password: e.target.value })}
                    placeholder="Senha fixa"
                    disabled={loading}
                  />
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
              {loading ? (
                "Salvando..."
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

