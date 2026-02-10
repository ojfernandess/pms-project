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
  const { uploadImage, settings, saveSettings } = useHotelSettings(selectedEstablishment?.id);
  const { plans } = usePricingPlans();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [isUploadingEstablishmentPhoto, setIsUploadingEstablishmentPhoto] = useState(false);
  const [plan1Title, setPlan1Title] = useState<string>("");
  const [plan2Title, setPlan2Title] = useState<string>("");
  const [isSavingPlan1Title, setIsSavingPlan1Title] = useState(false);
  const [isSavingPlan2Title, setIsSavingPlan2Title] = useState(false);

  // Sincronizar estados locais com settings quando mudarem
  useEffect(() => {
    setPlan1Title(settings?.public_pricing_plan_1_title || "");
    setPlan2Title(settings?.public_pricing_plan_2_title || "");
  }, [settings?.public_pricing_plan_1_title, settings?.public_pricing_plan_2_title]);

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
    if (!selectedEstablishment?.id) {
      toast.error("Selecione um estabelecimento primeiro");
      return;
    }

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
      queryClient.invalidateQueries({ queryKey: ["hotel_settings", selectedEstablishment.id] });
      queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer upload da foto");
    } finally {
      setIsUploadingEstablishmentPhoto(false);
    }
  };

  const handleRemoveEstablishmentPhoto = async (photoIndex: number) => {
    if (!selectedEstablishment?.id) {
      toast.error("Selecione um estabelecimento primeiro");
      return;
    }

    try {
      const existingPhotos = settings?.establishment_photos || [];
      const newPhotos = existingPhotos.filter((_: any, index: number) => index !== photoIndex);

      await saveSettings({ establishment_photos: newPhotos } as any);
      toast.success("Foto removida com sucesso");
      queryClient.invalidateQueries({ queryKey: ["hotel_settings", selectedEstablishment.id] });
      queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover foto");
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

          {/* Planos Tarifários para Exibição */}
          <div className="space-y-6">
            <div>
              <Label className="text-base font-medium mb-2 block">
                Planos Tarifários para Exibição
              </Label>
              <p className="text-sm text-muted-foreground mb-4">
                Selecione até 2 planos tarifários que serão exibidos na página pública. Cada plano pode ter um título personalizado que aparecerá junto com o preço.
              </p>
            </div>

            {/* Plano 1 */}
            <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
              <Label className="text-sm font-semibold text-slate-700">
                Plano Tarifário 1
              </Label>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="public-pricing-plan-1" className="text-sm font-medium text-slate-600">
                    Plano
                  </Label>
                  <Select
                    value={settings?.public_pricing_plan_1_id || "__none__"}
                    onValueChange={async (value) => {
                      try {
                        await saveSettings({ 
                          public_pricing_plan_1_id: value === "__none__" ? null : value 
                        } as any);
                        toast.success("Plano 1 atualizado com sucesso");
                        queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
                      } catch (error: any) {
                        toast.error(error.message || "Erro ao atualizar plano 1");
                      }
                    }}
                  >
                    <SelectTrigger id="public-pricing-plan-1" className="w-full">
                      <SelectValue placeholder="Selecione um plano" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum (não exibir)</SelectItem>
                      {plans?.filter((plan: any) => plan.is_active).map((plan: any) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {settings?.public_pricing_plan_1_id && (
                  <div>
                    <Label htmlFor="public-pricing-plan-1-title" className="text-sm font-medium text-slate-600">
                      Título Personalizado
                    </Label>
                    <Input
                      id="public-pricing-plan-1-title"
                      value={plan1Title}
                      onChange={(e) => setPlan1Title(e.target.value)}
                      onBlur={async () => {
                        if (plan1Title !== (settings?.public_pricing_plan_1_title || "")) {
                          setIsSavingPlan1Title(true);
                          try {
                            await saveSettings({ 
                              public_pricing_plan_1_title: plan1Title 
                            } as any);
                            queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
                            toast.success("Título do plano 1 salvo");
                          } catch (error: any) {
                            toast.error(error.message || "Erro ao atualizar título");
                            setPlan1Title(settings?.public_pricing_plan_1_title || "");
                          } finally {
                            setIsSavingPlan1Title(false);
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      placeholder="Ex: Suíte Deluxe - Não Reembolsável"
                      className="mt-1"
                      disabled={isSavingPlan1Title}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Este título aparecerá na página pública junto com o preço deste plano
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Plano 2 */}
            <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
              <Label className="text-sm font-semibold text-slate-700">
                Plano Tarifário 2
              </Label>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="public-pricing-plan-2" className="text-sm font-medium text-slate-600">
                    Plano
                  </Label>
                  <Select
                    value={settings?.public_pricing_plan_2_id || "__none__"}
                    onValueChange={async (value) => {
                      try {
                        await saveSettings({ 
                          public_pricing_plan_2_id: value === "__none__" ? null : value 
                        } as any);
                        toast.success("Plano 2 atualizado com sucesso");
                        queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
                      } catch (error: any) {
                        toast.error(error.message || "Erro ao atualizar plano 2");
                      }
                    }}
                  >
                    <SelectTrigger id="public-pricing-plan-2" className="w-full">
                      <SelectValue placeholder="Selecione um plano" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhum (não exibir)</SelectItem>
                      {plans?.filter((plan: any) => plan.is_active).map((plan: any) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {settings?.public_pricing_plan_2_id && (
                  <div>
                    <Label htmlFor="public-pricing-plan-2-title" className="text-sm font-medium text-slate-600">
                      Título Personalizado
                    </Label>
                    <Input
                      id="public-pricing-plan-2-title"
                      value={plan2Title}
                      onChange={(e) => setPlan2Title(e.target.value)}
                      onBlur={async () => {
                        if (plan2Title !== (settings?.public_pricing_plan_2_title || "")) {
                          setIsSavingPlan2Title(true);
                          try {
                            await saveSettings({ 
                              public_pricing_plan_2_title: plan2Title 
                            } as any);
                            queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
                            toast.success("Título do plano 2 salvo");
                          } catch (error: any) {
                            toast.error(error.message || "Erro ao atualizar título");
                            setPlan2Title(settings?.public_pricing_plan_2_title || "");
                          } finally {
                            setIsSavingPlan2Title(false);
                          }
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      placeholder="Ex: Suíte Deluxe - Reembolsável"
                      className="mt-1"
                      disabled={isSavingPlan2Title}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Este título aparecerá na página pública junto com o preço deste plano
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Separator />

          {/* Timer de Pagamento do Orçamento */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="quote-payment-timer" className="text-base font-medium mb-2 block">
                Timer de Pagamento do Orçamento
              </Label>
              <p className="text-sm text-muted-foreground mb-4">
                Defina o tempo em minutos que o hóspede terá para realizar o pagamento do orçamento. Após esse tempo, o orçamento será cancelado automaticamente.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input
                  id="quote-payment-timer"
                  type="number"
                  min="1"
                  max="1440"
                  value={settings?.quote_payment_timer_minutes || 30}
                  onChange={async (e) => {
                    const value = parseInt(e.target.value) || 30;
                    if (value >= 1 && value <= 1440) {
                      try {
                        await saveSettings({ 
                          quote_payment_timer_minutes: value 
                        } as any);
                        toast.success("Timer de pagamento atualizado");
                        queryClient.invalidateQueries({ queryKey: ["hotel_settings"] });
                      } catch (error: any) {
                        toast.error(error.message || "Erro ao atualizar timer");
                      }
                    }
                  }}
                  className="w-full"
                />
              </div>
              <div className="text-sm text-muted-foreground">
                minutos
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Valor mínimo: 1 minuto | Valor máximo: 1440 minutos (24 horas)
            </p>
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
