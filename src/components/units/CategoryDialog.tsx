import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Trash2 } from "lucide-react";

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  buildings?: any[];
  categoryId?: string | null;
}

export const CategoryDialog = ({ open, onOpenChange, onSuccess, buildings = [], categoryId }: CategoryDialogProps) => {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "housing_unit",
    building_id: "",
    capacity_adults: "2",
    owner_cleaning_fee: "0,00",
    base_price: "0,00",
  });

  // Carregar dados da categoria se estiver editando
  useEffect(() => {
    if (open && categoryId) {
      loadCategoryData();
    } else if (open && !categoryId) {
      // Resetar formulário para nova categoria
      setFormData({
        name: "",
        type: "housing_unit",
        building_id: "",
        capacity_adults: "2",
        owner_cleaning_fee: "0,00",
        base_price: "0,00",
      });
    }
  }, [open, categoryId]);

  const loadCategoryData = async () => {
    if (!categoryId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("room_categories")
        .select("*")
        .eq("id", categoryId)
        .single();

      if (error) throw error;

      if (data) {
        setFormData({
          name: data.name || "",
          type: data.type || "housing_unit", // Mantido no form mas não enviado ao banco
          building_id: data.building_id || "",
          capacity_adults: data.capacity_adults?.toString() || "2",
          owner_cleaning_fee: "0,00", // Campo removido temporariamente até que a migration seja aplicada
          base_price: data.base_price ? (typeof data.base_price === 'number' ? data.base_price.toFixed(2).replace('.', ',') : data.base_price) : "0,00",
        });
      }
    } catch (error: any) {
      console.error("Erro ao carregar categoria:", error);
      toast.error("Erro ao carregar dados da categoria");
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
      const ownerCleaningFeeValue = parseFloat(formData.owner_cleaning_fee.replace(',', '.')) || 0;
      const basePriceValue = parseFloat(formData.base_price.replace(',', '.')) || 0;

      const categoryData: any = {
        name: formData.name,
        // type: formData.type, // Removido temporariamente até que a migration seja aplicada
        building_id: formData.building_id || null,
        capacity_adults: parseInt(formData.capacity_adults) || 2,
        base_price: basePriceValue,
        establishment_id: establishmentId || undefined,
      };
      
      // Adicionar owner_cleaning_fee apenas se a coluna existir (verificar antes de enviar)
      // Removido temporariamente até que a migration seja aplicada
      // if (ownerCleaningFeeValue > 0) {
      //   categoryData.owner_cleaning_fee = ownerCleaningFeeValue;
      // }

      if (categoryId) {
        // Atualizar
        const { error } = await supabase
          .from("room_categories")
          .update(categoryData)
          .eq("id", categoryId);

        if (error) throw error;
        toast.success("Categoria atualizada com sucesso!");
      } else {
        // Criar
        const { error } = await supabase
          .from("room_categories")
          .insert([categoryData]);

        if (error) throw error;
        toast.success("Categoria criada com sucesso!");
      }

      // Invalidar todas as queries de categorias
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return key === "room_categories" || key === "room_categories_with_rooms" || key === "occupancy_map_rooms";
        }
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar categoria:", error);
      toast.error(error.message || "Erro ao salvar categoria");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!categoryId) return;
    
    if (!confirm("Tem certeza que deseja deletar esta categoria? Esta ação não pode ser desfeita.")) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("room_categories")
        .delete()
        .eq("id", categoryId);

      if (error) throw error;

      toast.success("Categoria deletada com sucesso!");
      
      // Invalidar queries
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return key === "room_categories" || key === "room_categories_with_rooms" || key === "occupancy_map_rooms";
        }
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao deletar categoria:", error);
      toast.error(error.message || "Erro ao deletar categoria");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-bold text-blue-600">
            {categoryId ? "Alterar Categoria" : "Criação de Categoria"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Nome */}
          <div>
            <Label htmlFor="name" className="text-sm font-medium">
              Nome <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Duplo SUITE - CAMA CASAL"
              required
              disabled={loading}
            />
          </div>

          {/* Prédio */}
          <div className="grid grid-cols-1 gap-4">
            {/* Campo type desabilitado temporariamente até que a migration seja aplicada */}
            {/* <div>
              <Label htmlFor="type" className="text-sm font-medium">
                Tipo <span className="text-red-500">*</span>
              </Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
                required
                disabled={loading}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="housing_unit">Unidade habitacional</SelectItem>
                  <SelectItem value="apartment">Apartamento</SelectItem>
                  <SelectItem value="house">Casa</SelectItem>
                  <SelectItem value="suite">Suíte</SelectItem>
                </SelectContent>
              </Select>
            </div> */}

            <div>
              <Label htmlFor="building_id" className="text-sm font-medium">
                Prédio
              </Label>
              <Select
                value={formData.building_id || undefined}
                onValueChange={(value) => setFormData({ ...formData, building_id: value === "none" ? "" : value })}
                disabled={loading}
              >
                <SelectTrigger id="building_id">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {buildings
                    .filter((b: any) => b.is_active)
                    .map((building: any) => (
                      <SelectItem key={building.id} value={building.id}>
                        {building.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Capacidade, Taxa de Limpeza e Preço Mínimo */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="capacity_adults" className="text-sm font-medium">
                Capacidade <span className="text-red-500">*</span>
              </Label>
              <Input
                id="capacity_adults"
                type="number"
                min="1"
                value={formData.capacity_adults}
                onChange={(e) => setFormData({ ...formData, capacity_adults: e.target.value })}
                placeholder="2"
                required
                disabled={loading}
              />
            </div>

            {/* Campo owner_cleaning_fee desabilitado temporariamente até que a migration seja aplicada */}
            {/* <div>
              <Label htmlFor="owner_cleaning_fee" className="text-sm font-medium">
                Taxa de limpeza do proprietário
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-600 font-semibold">
                  R$
                </span>
                <Input
                  id="owner_cleaning_fee"
                  type="text"
                  value={formData.owner_cleaning_fee}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d.,]/g, "");
                    setFormData({ ...formData, owner_cleaning_fee: value });
                  }}
                  placeholder="0,00"
                  disabled={loading}
                  className="pl-10"
                />
              </div>
            </div> */}

            <div>
              <Label htmlFor="base_price" className="text-sm font-medium">
                Preço mínimo do Tarifário
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-600 font-semibold">
                  R$
                </span>
                <Input
                  id="base_price"
                  type="text"
                  value={formData.base_price}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d.,]/g, "");
                    setFormData({ ...formData, base_price: value });
                  }}
                  placeholder="0,00"
                  disabled={loading}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          {/* Informação sobre unidades relacionadas */}
          <div className="pt-2">
            <p className="text-sm text-blue-600">
              Unidades relacionadas à essa categoria.
            </p>
          </div>

          {/* Botões */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div>
              {categoryId && (
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
              <Button 
                type="submit" 
                disabled={loading || !formData.name || !formData.capacity_adults}
                className="bg-blue-600 hover:bg-blue-700"
              >
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
