import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";
import { Save, Trash2, RefreshCw, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useReservationImportExportFeature } from "@/hooks/useReservationImportExportFeature";

interface RoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  categories: any[];
  roomId?: string | null;
}

export const RoomDialog = ({ open, onOpenChange, onSuccess, categories, roomId }: RoomDialogProps) => {
  const { enabled: importExportEnabled } = useReservationImportExportFeature();
  const [loading, setLoading] = useState(false);
  
  // Buscar usuários da empresa do estabelecimento atual
  const { data: companyUsers = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["company_users_for_rooms", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) {
        return [];
      }

      // Buscar a empresa do estabelecimento
      const { data: establishmentData, error: establishmentError } = await supabase
        .from("establishments")
        .select("company_id")
        .eq("id", establishmentId)
        .single();

      if (establishmentError || !establishmentData?.company_id) {
        console.error("Erro ao buscar empresa do estabelecimento:", establishmentError);
        return [];
      }

      const companyId = establishmentData.company_id;

      // Buscar user_ids associados à empresa via user_companies
      const { data: userCompanies, error: userCompaniesError } = await supabase
        .from("user_companies")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("is_active", true);

      if (userCompaniesError) {
        console.error("Erro ao buscar usuários da empresa:", userCompaniesError);
        return [];
      }

      if (!userCompanies || userCompanies.length === 0) {
        return [];
      }

      // Extrair os user_ids
      const userIds = userCompanies.map((uc: any) => uc.user_id);

      // Buscar os dados dos usuários
      const { data: users, error: usersError } = await supabase
        .from("users")
        .select("id, email, full_name")
        .in("id", userIds)
        .order("full_name");

      if (usersError) {
        console.error("Erro ao buscar dados dos usuários:", usersError);
        return [];
      }

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
    owner_user_id: "",
    owner_for_receipt_id: "",
    room_number: "",
    category_id: "",
    commission: "0,00",
    maintenance_fee: "0,00",
    authentication_type: "fixed_password",
    fixed_password: "",
    exclude_from_billing: false,
    hide_from_map: false,
    is_blocked: false,
    floor: "",
    notes: "",
    external_pms_code: "",
  });

  // Carregar dados do quarto se estiver editando
  useEffect(() => {
    if (open && roomId) {
      loadRoomData();
    } else if (open && !roomId) {
      // Resetar formulário para novo quarto
      setFormData({
        name: "",
        owner_user_id: "",
        owner_for_receipt_id: "",
        room_number: "",
        category_id: "",
        commission: "0,00",
        maintenance_fee: "0,00",
        authentication_type: "fixed_password",
        fixed_password: "",
        exclude_from_billing: false,
        hide_from_map: false,
        is_blocked: false,
        floor: "",
        notes: "",
        external_pms_code: "",
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
          owner_user_id: data.owner_user_id || "",
          owner_for_receipt_id: data.owner_for_receipt_id || "",
          room_number: data.room_number || "",
          category_id: data.category_id || "",
          commission: data.commission ? (typeof data.commission === 'number' ? data.commission.toFixed(2).replace('.', ',') : data.commission) : "0,00",
          maintenance_fee: data.maintenance_fee ? (typeof data.maintenance_fee === 'number' ? data.maintenance_fee.toFixed(2).replace('.', ',') : data.maintenance_fee) : "0,00",
          authentication_type: data.authentication_type || "fixed_password",
          fixed_password: data.fixed_password || "",
          exclude_from_billing: data.exclude_from_billing || false,
          hide_from_map: data.hide_from_map || false,
          is_blocked: data.is_blocked || false,
          floor: data.floor?.toString() || "",
          notes: data.notes || "",
          external_pms_code: data.external_pms_code || "",
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
    setLoading(true);

    try {
      const establishmentId = getSelectedEstablishmentId();
      
      // Converter valores
      const commissionValue = parseFloat(formData.commission.replace(',', '.')) || 0;
      const maintenanceFeeValue = parseFloat(formData.maintenance_fee.replace(',', '.')) || 0;

      const roomData: any = {
        name: formData.name || null,
        owner_user_id: formData.owner_user_id || null,
        owner_for_receipt_id: formData.owner_for_receipt_id || null,
        room_number: formData.room_number,
        category_id: formData.category_id,
        commission: commissionValue,
        maintenance_fee: maintenanceFeeValue,
        authentication_type: formData.authentication_type,
        fixed_password: formData.fixed_password || null,
        exclude_from_billing: formData.exclude_from_billing === true,
        hide_from_map: formData.hide_from_map === true,
        is_blocked: formData.is_blocked === true,
        floor: formData.floor ? parseInt(formData.floor) : null,
        notes: formData.notes || null,
        external_pms_code: formData.external_pms_code?.trim() || null,
        establishment_id: establishmentId || undefined,
      };

      if (roomId) {
        // Atualizar
        const { error, data } = await supabase
          .from("rooms")
          .update(roomData)
          .eq("id", roomId)
          .select()
          .single();

        if (error) {
          console.error("Erro ao atualizar quarto:", error);
          // Tratar erro de duplicata de forma mais amigável
          if (error.code === '23505' && error.message?.includes('room_number')) {
            toast.error(`Já existe um quarto com o número "${formData.room_number}" nesta categoria`);
          } else {
            throw error;
          }
          setLoading(false);
          return;
        }
        
        console.log("Quarto atualizado:", data);
        toast.success("Quarto atualizado com sucesso!");
      } else {
        // Criar
        const { error, data } = await supabase
          .from("rooms")
          .insert([roomData])
          .select()
          .single();

        if (error) {
          console.error("Erro ao criar quarto:", error);
          // Tratar erro de duplicata de forma mais amigável
          if (error.code === '23505' && error.message?.includes('room_number')) {
            toast.error(`Já existe um quarto com o número "${formData.room_number}" nesta categoria`);
          } else {
            throw error;
          }
          setLoading(false);
          return;
        }
        
        console.log("Quarto criado:", data);
        toast.success("Quarto criado com sucesso!");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar quarto:", error);
      toast.error(error.message || "Erro ao salvar quarto");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!roomId) return;
    
    if (!confirm("Tem certeza que deseja deletar este quarto? Esta ação não pode ser desfeita.")) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("rooms")
        .delete()
        .eq("id", roomId);

      if (error) throw error;

      toast.success("Quarto deletado com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao deletar quarto:", error);
      toast.error(error.message || "Erro ao deletar quarto");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateReservations = () => {
    toast.info("Funcionalidade de atualizar reservas em desenvolvimento");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-bold text-slate-900">
            {roomId ? "Alterar Unidade" : "Nova Unidade"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identificação da Unidade */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="name" className="text-sm font-medium">
                Nome <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Quarto 01"
                required
                disabled={loading}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="owner_user_id" className="text-sm font-medium">
                  Usuário Proprietário - Painel
                </Label>
                <Select
                  value={formData.owner_user_id || undefined}
                  onValueChange={(value) => setFormData({ ...formData, owner_user_id: value === "none" ? "" : value })}
                  disabled={loading}
                >
                  <SelectTrigger id="owner_user_id">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {isLoadingUsers ? (
                      <SelectItem value="loading" disabled>Carregando usuários...</SelectItem>
                    ) : companyUsers.length === 0 ? (
                      <SelectItem value="no-users" disabled>Nenhum usuário disponível</SelectItem>
                    ) : (
                      companyUsers.map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name} {user.email ? `(${user.email})` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="owner_for_receipt_id" className="text-sm font-medium">
                  Proprietário para Recibo
                </Label>
                <Select
                  value={formData.owner_for_receipt_id || undefined}
                  onValueChange={(value) => setFormData({ ...formData, owner_for_receipt_id: value === "none" ? "" : value })}
                  disabled={loading}
                >
                  <SelectTrigger id="owner_for_receipt_id">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {isLoadingUsers ? (
                      <SelectItem value="loading" disabled>Carregando usuários...</SelectItem>
                    ) : companyUsers.length === 0 ? (
                      <SelectItem value="no-users" disabled>Nenhum usuário disponível</SelectItem>
                    ) : (
                      companyUsers.map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name} {user.email ? `(${user.email})` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Categoria e Detalhes Financeiros */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category_id" className="text-sm font-medium">
                  Categoria <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) => setFormData({ ...formData, category_id: value })}
                  required
                  disabled={loading}
                >
                  <SelectTrigger id="category_id">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {importExportEnabled && (
                <div>
                  <Label htmlFor="external_pms_code" className="text-sm font-medium">
                    Código PMS externo (de-para)
                  </Label>
                  <Input
                    id="external_pms_code"
                    value={formData.external_pms_code}
                    onChange={(e) => setFormData({ ...formData, external_pms_code: e.target.value })}
                    placeholder="Ex: 101"
                    disabled={loading}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="room_number" className="text-sm font-medium">
                  Número <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="room_number"
                  value={formData.room_number}
                  onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
                  placeholder="01"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="commission" className="text-sm font-medium">
                  Comissão
                </Label>
                <div className="relative">
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
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-600">%</span>
                </div>
              </div>

              <div>
                <Label htmlFor="maintenance_fee" className="text-sm font-medium">
                  Taxa de Manutenção
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-600 font-semibold">
                    R$
                  </span>
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
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Autenticação */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="authentication_type" className="text-sm font-medium">
                Autenticação <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.authentication_type}
                onValueChange={(value) => setFormData({ ...formData, authentication_type: value })}
                required
                disabled={loading}
              >
                <SelectTrigger id="authentication_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_password">Por Senha Fixa</SelectItem>
                  <SelectItem value="dynamic_password">Por Senha Dinâmica</SelectItem>
                  <SelectItem value="key_card">Por Cartão</SelectItem>
                  <SelectItem value="none">Sem Autenticação</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.authentication_type === "fixed_password" && (
              <div>
                <Label htmlFor="fixed_password" className="text-sm font-medium">
                  Senha Fixa
                </Label>
                <Input
                  id="fixed_password"
                  type="text"
                  value={formData.fixed_password}
                  onChange={(e) => setFormData({ ...formData, fixed_password: e.target.value })}
                  placeholder="CHAVE"
                  disabled={loading}
                />
              </div>
            )}
          </div>

          {/* Checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="exclude_from_billing"
                checked={formData.exclude_from_billing}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, exclude_from_billing: checked === true })
                }
                disabled={loading}
              />
              <Label
                htmlFor="exclude_from_billing"
                className="text-sm font-normal cursor-pointer"
              >
                Retirar dos cálculos de faturamento e taxa de ocupação
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="hide_from_map"
                checked={formData.hide_from_map}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, hide_from_map: checked === true })
                }
                disabled={loading}
              />
              <Label
                htmlFor="hide_from_map"
                className="text-sm font-normal cursor-pointer text-red-600"
              >
                Ocultar do mapa de reservas
              </Label>
            </div>

            <div className="flex items-center space-x-2 p-3 border border-red-200 rounded-lg bg-red-50">
              <Switch
                id="is_blocked"
                checked={formData.is_blocked}
                onCheckedChange={(checked) => {
                  const isBlocked = checked === true;
                  setFormData({ ...formData, is_blocked: isBlocked });
                }}
                disabled={loading}
              />
              <div className="flex items-center gap-2 flex-1">
                <Lock className="h-4 w-4 text-red-600" />
                <Label
                  htmlFor="is_blocked"
                  className="text-sm font-medium cursor-pointer text-red-700"
                >
                  Interditar Quarto
                </Label>
              </div>
            </div>
            {formData.is_blocked && (
              <p className="text-xs text-red-600 ml-8 -mt-2">
                Quarto interditado não pode receber reservas e aparecerá com ícone de cadeado no mapa.
              </p>
            )}
          </div>

          {/* Campos adicionais */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="floor" className="text-sm font-medium">
                Andar
              </Label>
              <Input
                id="floor"
                type="number"
                value={formData.floor}
                onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                placeholder="0"
                disabled={loading}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes" className="text-sm font-medium">
              Observações
            </Label>
            <Input
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Observações adicionais..."
              disabled={loading}
            />
          </div>

          {/* Botões */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex gap-2">
              {roomId && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={loading}
                  className="bg-pink-500 hover:bg-pink-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Deletar
                </Button>
              )}
              {roomId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleUpdateReservations}
                  disabled={loading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar Reservas
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={loading || !formData.category_id || !formData.room_number}>
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
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
