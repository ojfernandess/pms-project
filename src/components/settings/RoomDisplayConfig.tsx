import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Loader2, Upload, X, Plus, Save, Eye, EyeOff, Building2, Image as ImageIcon, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useHotelSettings } from "@/hooks/useHotelSettings";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

const RoomDisplayConfig = () => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();
  const { uploadImage, settings, saveSettings } = useHotelSettings();
  const { plans } = usePricingPlans();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isUploadingEstablishmentPhoto, setIsUploadingEstablishmentPhoto] = useState(false);

  // Buscar categorias
  const { data: categories = [], isLoading: isLoadingCategories, refetch: refetchCategories } = useQuery({
    queryKey: ["room_categories_display", selectedEstablishment?.id],
    queryFn: async () => {
      if (!selectedEstablishment?.id) return [];
      const { data, error } = await supabase
        .from("room_categories")
        .select("*")
        .eq("establishment_id", selectedEstablishment.id)
        .order("display_order")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedEstablishment?.id,
  });

  const handleCategoryUpdate = async (categoryId: string, updates: any) => {
    try {
      const { error } = await supabase
        .from("room_categories")
        .update(updates)
        .eq("id", categoryId);

      if (error) throw error;
      toast.success("Categoria atualizada com sucesso");
      refetchCategories();
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar categoria");
    }
  };

  const handlePhotoUpload = async (file: File, categoryId: string) => {
    try {
      const uploadedUrl = await uploadImage(file, "photo");
      if (!uploadedUrl) {
        toast.error("Erro ao fazer upload da foto");
        return;
      }

      const category = categories.find(c => c.id === categoryId);
      if (!category) return;
      
      const existingPhotos = category.display_photos || [];
      const newPhotos = [...existingPhotos, uploadedUrl];

      await handleCategoryUpdate(categoryId, { display_photos: newPhotos });
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer upload da foto");
    }
  };

  const handleRemovePhoto = async (categoryId: string, photoIndex: number) => {
    try {
      const category = categories.find(c => c.id === categoryId);
      if (!category) return;

      const existingPhotos = category.display_photos || [];
      const newPhotos = existingPhotos.filter((_: any, index: number) => index !== photoIndex);

      await handleCategoryUpdate(categoryId, { display_photos: newPhotos });
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover foto");
    }
  };

  const handleAddFeature = async (categoryId: string, feature: string) => {
    if (!feature.trim()) return;

    try {
      const category = categories.find(c => c.id === categoryId);
      if (!category) return;

      const existingFeatures = category.display_features || [];
      if (existingFeatures.includes(feature.trim())) {
        toast.error("Esta característica já está adicionada");
        return;
      }

      const newFeatures = [...existingFeatures, feature.trim()];
      await handleCategoryUpdate(categoryId, { display_features: newFeatures });
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar característica");
    }
  };

  const handleRemoveFeature = async (categoryId: string, featureIndex: number) => {
    try {
      const category = categories.find(c => c.id === categoryId);
      if (!category) return;

      const existingFeatures = category.display_features || [];
      const newFeatures = existingFeatures.filter((_: any, index: number) => index !== featureIndex);

      await handleCategoryUpdate(categoryId, { display_features: newFeatures });
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover característica");
    }
  };

  const handleEstablishmentPhotoUpload = async (file: File) => {
    setIsUploadingEstablishmentPhoto(true);
    try {
      const uploadedUrl = await uploadImage(file, "photo");
      if (!uploadedUrl) {
        toast.error("Erro ao fazer upload da foto");
        return;
      }

      const existingPhotos = settings?.establishment_photos || [];
      const newPhotos = [...existingPhotos, uploadedUrl];

      await saveSettings({ establishment_photos: newPhotos } as any);
      toast.success("Foto do estabelecimento adicionada com sucesso");
      queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer upload da foto");
    } finally {
      setIsUploadingEstablishmentPhoto(false);
    }
  };

  const handleRemoveEstablishmentPhoto = async (photoIndex: number) => {
    try {
      const existingPhotos = settings?.establishment_photos || [];
      const newPhotos = existingPhotos.filter((_: any, index: number) => index !== photoIndex);

      await saveSettings({ establishment_photos: newPhotos } as any);
      toast.success("Foto removida com sucesso");
      queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover foto");
    }
  };

  const handlePricingPlanChange = async (planId: string) => {
    try {
      await saveSettings({ public_pricing_plan_id: planId === "__none__" ? null : planId } as any);
      toast.success("Plano tarifário atualizado com sucesso");
      queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar plano tarifário");
    }
  };

  if (isLoadingCategories) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const establishmentPhotos = settings?.establishment_photos || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold mb-2">Configuração da Página Pública de Reservas</h2>
        <p className="text-muted-foreground">
          Configure as informações que serão exibidas na página pública onde os hóspedes podem fazer reservas
        </p>
      </div>

      {/* Configurações Gerais */}
      <Card className="p-6">
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings2 className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-semibold">Configurações Gerais</h3>
          </div>

          <Separator />

          {/* Plano Tarifário */}
          <div className="space-y-2">
            <Label htmlFor="public-pricing-plan" className="text-base font-medium">
              Plano Tarifário para Exibição
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Selecione qual plano tarifário será usado para calcular e exibir preços na página pública. Se nenhum for selecionado, será usado o preço base da categoria.
            </p>
            <Select
              value={settings?.public_pricing_plan_id || "__none__"}
              onValueChange={handlePricingPlanChange}
            >
              <SelectTrigger id="public-pricing-plan" className="w-full max-w-md">
                <SelectValue placeholder="Selecione um plano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum (usar preço base)</SelectItem>
                {plans?.filter((plan: any) => plan.is_active).map((plan: any) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Fotos do Estabelecimento */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-semibold">Fotos do Estabelecimento</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Adicione fotos do seu estabelecimento que serão exibidas na página pública de reservas. A primeira foto será usada como imagem principal.
          </p>
          
          <Separator />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            {establishmentPhotos.map((photo: string, index: number) => (
              <div key={index} className="relative group">
                <img
                  src={photo}
                  alt={`Foto do estabelecimento ${index + 1}`}
                  className="w-full h-48 object-cover rounded-lg border-2 border-slate-200"
                />
                {index === 0 && (
                  <Badge className="absolute top-2 left-2 bg-blue-500">Principal</Badge>
                )}
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleRemoveEstablishmentPhoto(index)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-primary transition-colors bg-slate-50">
              {isUploadingEstablishmentPhoto ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin mb-2" />
              ) : (
                <>
                  <Upload className="w-6 h-6 text-slate-400 mb-2" />
                  <span className="text-sm text-slate-600 text-center px-2">Adicionar Foto do Estabelecimento</span>
                </>
              )}
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                  className="hidden"
                  disabled={isUploadingEstablishmentPhoto}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleEstablishmentPhotoUpload(file);
                  }}
                />
            </label>
          </div>
        </div>
      </Card>

      {/* Categorias de Quartos */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <ImageIcon className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-semibold">Categorias de Quartos</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Configure as informações de cada categoria de quarto que será exibida na página pública. As categorias aparecerão na ordem definida abaixo.
          </p>
          
          <Separator />

          {categories.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-lg">
              <p className="text-muted-foreground">Nenhuma categoria encontrada</p>
              <p className="text-sm text-muted-foreground mt-2">
                Crie categorias de quartos primeiro em "Quartos" para configurá-las aqui
              </p>
            </div>
          ) : (
            <div className="space-y-4 mt-4">
              {categories.map((category: any) => (
                <CategoryDisplayCard
                  key={category.id}
                  category={category}
                  onUpdate={(updates) => handleCategoryUpdate(category.id, updates)}
                  onPhotoUpload={(file) => handlePhotoUpload(file, category.id)}
                  onRemovePhoto={(index) => handleRemovePhoto(category.id, index)}
                  onAddFeature={(feature) => handleAddFeature(category.id, feature)}
                  onRemoveFeature={(index) => handleRemoveFeature(category.id, index)}
                  expanded={expandedCategories.has(category.id)}
                  onToggleExpanded={() => {
                    const newSet = new Set(expandedCategories);
                    if (newSet.has(category.id)) {
                      newSet.delete(category.id);
                    } else {
                      newSet.add(category.id);
                    }
                    setExpandedCategories(newSet);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

interface CategoryDisplayCardProps {
  category: any;
  onUpdate: (updates: any) => void;
  onPhotoUpload: (file: File) => void;
  onRemovePhoto: (index: number) => void;
  onAddFeature: (feature: string) => void;
  onRemoveFeature: (index: number) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}

const CategoryDisplayCard = ({
  category,
  onUpdate,
  onPhotoUpload,
  onRemovePhoto,
  onAddFeature,
  onRemoveFeature,
  expanded,
  onToggleExpanded,
}: CategoryDisplayCardProps) => {
  const [localDescription, setLocalDescription] = useState(category.display_description || "");
  const [localDisplayOrder, setLocalDisplayOrder] = useState(category.display_order || 0);
  const [localShowInPublic, setLocalShowInPublic] = useState(category.show_in_public ?? true);
  const [newFeature, setNewFeature] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalDescription(category.display_description || "");
    setLocalDisplayOrder(category.display_order || 0);
    setLocalShowInPublic(category.show_in_public ?? true);
  }, [category]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate({
        display_description: localDescription,
        display_order: localDisplayOrder,
        show_in_public: localShowInPublic,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const photos = category.display_photos || [];
  const features = category.display_features || [];

  return (
    <Card className="border-2">
      <Collapsible open={expanded} onOpenChange={onToggleExpanded}>
        <CollapsibleTrigger className="w-full p-4 hover:bg-slate-50 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono">
                  #{localDisplayOrder || 0}
                </Badge>
                <h4 className="text-lg font-semibold">{category.name}</h4>
              </div>
              {!localShowInPublic && (
                <Badge variant="secondary">Oculto</Badge>
              )}
              {photos.length > 0 && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
                  {photos.length} {photos.length === 1 ? "foto" : "fotos"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {expanded ? <EyeOff className="w-4 h-4 text-slate-500" /> : <Eye className="w-4 h-4 text-slate-500" />}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="p-4 pt-0 space-y-6">
          <Separator />

          {/* Fotos */}
          <div>
            <Label className="text-base font-medium mb-2 block">Fotos da Categoria</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Adicione fotos que representem esta categoria de quarto. A primeira foto será usada como imagem principal na página pública.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {photos.map((photo: string, index: number) => (
                <div key={index} className="relative group">
                  <img
                    src={photo}
                    alt={`Foto ${index + 1}`}
                    className="w-full h-40 object-cover rounded-lg border-2 border-slate-200"
                  />
                  {index === 0 && (
                    <Badge className="absolute top-2 left-2 bg-blue-500 text-xs">Principal</Badge>
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7"
                    onClick={() => onRemovePhoto(index)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-primary transition-colors bg-slate-50">
                <Upload className="w-5 h-5 text-slate-400 mb-1" />
                <span className="text-xs text-slate-600 text-center px-2">Adicionar Foto</span>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onPhotoUpload(file);
                  }}
                />
              </label>
            </div>
          </div>

          {/* Descrição */}
          <div>
            <Label htmlFor={`desc-${category.id}`} className="text-base font-medium mb-2 block">
              Descrição Detalhada
            </Label>
            <Textarea
              id={`desc-${category.id}`}
              value={localDescription}
              onChange={(e) => setLocalDescription(e.target.value)}
              rows={4}
              placeholder="Descreva esta categoria de quarto em detalhes. Esta descrição será exibida na página pública..."
              className="mt-2"
            />
          </div>

          {/* Características */}
          <div>
            <Label className="text-base font-medium mb-2 block">Características e Comodidades</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Adicione características que descrevam esta categoria (ex: Wi-Fi, Ar-condicionado, TV, etc.)
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {features.map((feature: string, index: number) => (
                <Badge key={index} variant="outline" className="flex items-center gap-1 py-1 px-2">
                  {feature}
                  <button
                    onClick={() => onRemoveFeature(index)}
                    className="ml-1 hover:text-destructive transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newFeature}
                onChange={(e) => setNewFeature(e.target.value)}
                placeholder="Ex: Wi-Fi, Ar-condicionado, TV..."
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onAddFeature(newFeature);
                    setNewFeature("");
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                onClick={() => {
                  onAddFeature(newFeature);
                  setNewFeature("");
                }}
                variant="outline"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Ordem de Exibição */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor={`order-${category.id}`} className="text-base font-medium mb-2 block">
                Ordem de Exibição
              </Label>
              <Input
                id={`order-${category.id}`}
                type="number"
                value={localDisplayOrder}
                onChange={(e) => setLocalDisplayOrder(parseInt(e.target.value) || 0)}
                className="mt-2"
                min="0"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Categorias com menor número aparecem primeiro na página pública
              </p>
            </div>

            {/* Exibir na Página Pública */}
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <Label className="text-base font-medium">Exibir na Página Pública</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Se desativado, esta categoria não aparecerá na página pública
                </p>
              </div>
              <Switch
                checked={localShowInPublic}
                onCheckedChange={setLocalShowInPublic}
              />
            </div>
          </div>

          {/* Botão Salvar */}
          <Button onClick={handleSave} disabled={isSaving} className="w-full" size="lg">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Alterações desta Categoria
              </>
            )}
          </Button>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default RoomDisplayConfig;
