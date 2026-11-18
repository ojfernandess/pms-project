import { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { useBuildings } from "@/hooks/useBuildings";
import { useBuildingServices } from "@/hooks/useBuildingServices";
import { Loader2, Copy, Check, Save, Plus, X, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { CleaningFeeSettingCard } from "@/components/settings/CleaningFeeSettingCard";
import { ParkingFeeSettingCard } from "@/components/settings/ParkingFeeSettingCard";
import { CheckinGuestInfoServicesCard } from "@/components/settings/CheckinGuestInfoServicesCard";
import { useCleaningFeeConfig } from "@/hooks/useCleaningFeeConfig";
import { useParkingFeeConfig } from "@/hooks/useParkingFeeConfig";

interface BuildingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  buildingId?: string;
}

export const BuildingDialog = ({
  open,
  onOpenChange,
  onSuccess,
  buildingId,
}: BuildingDialogProps) => {
  const { buildings, createBuilding, updateBuilding, isCreating } = useBuildings();
  const { services, isLoading: isLoadingServices, saveServices, isSaving: isSavingServices } = useBuildingServices(buildingId || null);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
    country: "Brasil",
    zip_code: "",
    reception_email: "",
    booking_engine_link: "",
    amplifique_token: "",
    allow_owner_blocking: false,
    is_active: true,
    policies: {} as any,
    logo_url: "",
    photo_url: "",
  });
  
  const [policies, setPolicies] = useState({
    policies_text: "",
    cancellation: {
      free_cancellation_days: 7,
      cancellation_policy: "",
      refund_policy: "",
    },
    checkin_checkout: {
      early_checkin_available: false,
      early_checkin_fee: "",
      late_checkout_available: false,
      late_checkout_fee: "",
      checkin_instructions: "",
      checkout_instructions: "",
    },
    pets: {
      pets_allowed: false,
      pet_policy: "",
      pet_fee: "",
    },
    children: {
      children_policy: "",
      extra_bed_available: false,
      extra_bed_fee: "",
      crib_available: false,
      crib_fee: "",
    },
    general: {
      smoking_policy: "Não permitido",
      age_restriction: "",
      id_required: true,
      special_requests: "",
    },
  });

  useEffect(() => {
    if (buildingId && open) {
      const building = buildings.find((b: any) => b.id === buildingId);
      if (building) {
        setFormData({
          name: building.name || "",
          description: building.description || "",
          street: building.street || "",
          number: building.number || "",
          neighborhood: building.neighborhood || "",
          city: building.city || "",
          state: building.state || "",
          country: building.country || "Brasil",
          zip_code: building.zip_code || "",
          reception_email: building.reception_email || "",
          booking_engine_link: building.booking_engine_link || "",
          amplifique_token: building.amplifique_token || "",
          allow_owner_blocking: building.allow_owner_blocking ?? false,
          is_active: building.is_active ?? true,
          policies: building.policies || {},
          logo_url: building.logo_url || "",
          photo_url: building.photo_url || "",
        });
        
        // Carregar previews das imagens
        if (building.logo_url) setLogoPreview(building.logo_url);
        if (building.photo_url) setPhotoPreview(building.photo_url);
        
        // Carregar políticas
        if (building.policies) {
          try {
            const savedPolicies = typeof building.policies === 'string' 
              ? JSON.parse(building.policies) 
              : building.policies;
            setPolicies((prev) => ({
              ...prev,
              ...savedPolicies,
            }));
          } catch (error) {
            console.error("Erro ao carregar políticas:", error);
          }
        }
      }
    } else if (!buildingId && open) {
      setFormData({
        name: "",
        description: "",
        street: "",
        number: "",
        neighborhood: "",
        city: "",
        state: "",
        country: "Brasil",
        zip_code: "",
        reception_email: "",
        booking_engine_link: "",
        amplifique_token: "",
        allow_owner_blocking: false,
        is_active: true,
        policies: {},
        logo_url: "",
        photo_url: "",
      });
      setLogoFile(null);
      setPhotoFile(null);
      setLogoPreview("");
      setPhotoPreview("");
      setPolicies({
        policies_text: "",
        cancellation: {
          free_cancellation_days: 7,
          cancellation_policy: "",
          refund_policy: "",
        },
        checkin_checkout: {
          early_checkin_available: false,
          early_checkin_fee: "",
          late_checkout_available: false,
          late_checkout_fee: "",
          checkin_instructions: "",
          checkout_instructions: "",
        },
        pets: {
          pets_allowed: false,
          pet_policy: "",
          pet_fee: "",
        },
        children: {
          children_policy: "",
          extra_bed_available: false,
          extra_bed_fee: "",
          crib_available: false,
          crib_fee: "",
        },
        general: {
          smoking_policy: "Não permitido",
          age_restriction: "",
          id_required: true,
          special_requests: "",
        },
      });
    }
  }, [buildingId, open, buildings]);

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success("Copiado para a área de transferência!");
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      toast.error("Erro ao copiar");
    }
  };

  // Upload de imagem (logo ou foto)
  const uploadImage = async (file: File, type: "logo" | "photo"): Promise<string | null> => {
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `building_${type}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `buildings/${fileName}`;

      // Tentar fazer upload no Supabase Storage
      const bucketName = "hotel-assets";
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        // Se o bucket não existir, usar data URL como fallback
        console.warn("Bucket não encontrado, usando data URL:", uploadError);
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.readAsDataURL(file);
        });
      }

      const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error: any) {
      console.error("Erro ao fazer upload:", error);
      // Em caso de erro, retornar data URL como fallback
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem");
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem");
      return;
    }

    setPhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.name.trim()) {
        throw new Error("Nome do prédio é obrigatório");
      }
      if (!formData.description.trim()) {
        throw new Error("Descrição é obrigatória");
      }

      let logoUrl = formData.logo_url;
      let photoUrl = formData.photo_url;

      // Fazer upload das imagens se houver arquivos selecionados
      if (logoFile) {
        const uploaded = await uploadImage(logoFile, "logo");
        if (uploaded) logoUrl = uploaded;
      }

      if (photoFile) {
        const uploaded = await uploadImage(photoFile, "photo");
        if (uploaded) photoUrl = uploaded;
      }

      // Incluir políticas no formData
      const dataToSave = {
        ...formData,
        logo_url: logoUrl,
        photo_url: photoUrl,
        policies: policies as any,
      };

      if (buildingId) {
        await updateBuilding({ id: buildingId, ...dataToSave });
      } else {
        await createBuilding(dataToSave);
      }

      setLogoFile(null);
      setPhotoFile(null);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {buildingId ? "Editar Prédio" : "Adicionar Prédio"}
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">Geral</TabsTrigger>
            <TabsTrigger value="policies">Políticas</TabsTrigger>
            <TabsTrigger value="services">Serviços</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general">
            <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Nome do Prédio *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Ex: Prédio Principal, Prédio 2, etc."
              required
            />
          </div>

          <div>
            <Label htmlFor="description">Descrição *</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Descrição do prédio"
              rows={3}
              required
            />
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4">Imagens</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Label>Logo do Estabelecimento</Label>
                <div className="mt-2 space-y-2">
                  {logoPreview && (
                    <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="building-logo-upload"
                    />
                    <Label
                      htmlFor="building-logo-upload"
                      className="cursor-pointer flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted"
                    >
                      <Upload className="h-4 w-4" />
                      {logoPreview ? "Alterar Logo" : "Enviar Logo"}
                    </Label>
                  </div>
                </div>
              </div>

              <div>
                <Label>Foto do Estabelecimento</Label>
                <div className="mt-2 space-y-2">
                  {photoPreview && (
                    <div className="relative w-full h-48 border rounded-lg overflow-hidden">
                      <img
                        src={photoPreview}
                        alt="Photo preview"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      id="building-photo-upload"
                    />
                    <Label
                      htmlFor="building-photo-upload"
                      className="cursor-pointer flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted"
                    >
                      <ImageIcon className="h-4 w-4" />
                      {photoPreview ? "Alterar Foto" : "Enviar Foto"}
                    </Label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">Endereço</h3>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label htmlFor="street">Logradouro</Label>
                <Input
                  id="street"
                  value={formData.street}
                  onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                  placeholder="Rua, Avenida, etc."
                />
              </div>
              <div>
                <Label htmlFor="number">Número</Label>
                <Input
                  id="number"
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  placeholder="123"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="neighborhood">Bairro</Label>
              <Input
                id="neighborhood"
                value={formData.neighborhood}
                onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                placeholder="Nome do bairro"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="Cidade"
                />
              </div>
              <div>
                <Label htmlFor="state">Estado</Label>
                <Input
                  id="state"
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  placeholder="Estado"
                />
              </div>
              <div>
                <Label htmlFor="country">País</Label>
                <Input
                  id="country"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="País"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="zip_code">CEP</Label>
              <Input
                id="zip_code"
                value={formData.zip_code}
                onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                placeholder="00000-000"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="reception_email">E-mail da Recepção</Label>
            <Input
              id="reception_email"
              type="email"
              value={formData.reception_email}
              onChange={(e) => setFormData({ ...formData, reception_email: e.target.value })}
              placeholder="recepcao@exemplo.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="booking_engine_link">Link do Motor de Reservas</Label>
              <div className="flex gap-2">
                <Input
                  id="booking_engine_link"
                  value={formData.booking_engine_link}
                  onChange={(e) => setFormData({ ...formData, booking_engine_link: e.target.value })}
                  placeholder="https://..."
                />
                {formData.booking_engine_link && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopy(formData.booking_engine_link, "booking_engine")}
                  >
                    {copiedField === "booking_engine" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="amplifique_token">Token Amplifique.me</Label>
              <div className="flex gap-2">
                <Input
                  id="amplifique_token"
                  value={formData.amplifique_token}
                  onChange={(e) => setFormData({ ...formData, amplifique_token: e.target.value })}
                  placeholder="Token"
                />
                {formData.amplifique_token && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => handleCopy(formData.amplifique_token, "amplifique")}
                  >
                    {copiedField === "amplifique" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="allow_owner_blocking">
              Aceita bloqueio de quartos pelo proprietário
            </Label>
            <Switch
              id="allow_owner_blocking"
              checked={formData.allow_owner_blocking}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, allow_owner_blocking: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Ativo</Label>
            <Switch
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading || isCreating}>
                  {loading || isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      <span>Salvar</span>
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>
          
          <TabsContent value="policies">
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-2">Políticas do Prédio</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure as políticas específicas deste prédio. Estas políticas terão prioridade sobre as políticas do estabelecimento.
                </p>
              </div>

              {/* Campo de Texto Livre para Políticas */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-semibold">Texto Geral das Políticas</h4>
                <div>
                  <Label htmlFor="policies_text">Políticas em Formato de Texto</Label>
                  <Textarea
                    id="policies_text"
                    value={policies.policies_text || ""}
                    onChange={(e) => {
                      setPolicies((prev) => ({ ...prev, policies_text: e.target.value }));
                    }}
                    rows={8}
                    placeholder="Digite aqui as políticas do prédio em formato de texto livre. Este texto será exibido para o hóspede no check-in online antes das políticas estruturadas..."
                    className="mt-2"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Este texto será exibido para o hóspede no check-in online. Use este campo para incluir políticas gerais, termos e condições, ou qualquer informação importante que o hóspede deve ler e aceitar.
                  </p>
                </div>
              </div>

              {/* Política de Cancelamento */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-semibold">Política de Cancelamento</h4>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="free_cancellation_days">Dias para Cancelamento Gratuito</Label>
                    <Input
                      id="free_cancellation_days"
                      type="number"
                      min="0"
                      value={policies.cancellation.free_cancellation_days}
                      onChange={(e) => {
                        setPolicies((prev) => ({
                          ...prev,
                          cancellation: { ...prev.cancellation, free_cancellation_days: parseInt(e.target.value) || 0 },
                        }));
                      }}
                      placeholder="7"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cancellation_policy">Política de Cancelamento</Label>
                    <Textarea
                      id="cancellation_policy"
                      value={policies.cancellation.cancellation_policy}
                      onChange={(e) => {
                        setPolicies((prev) => ({
                          ...prev,
                          cancellation: { ...prev.cancellation, cancellation_policy: e.target.value },
                        }));
                      }}
                      rows={3}
                      placeholder="Descreva a política de cancelamento..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="refund_policy">Política de Reembolso</Label>
                    <Textarea
                      id="refund_policy"
                      value={policies.cancellation.refund_policy}
                      onChange={(e) => {
                        setPolicies((prev) => ({
                          ...prev,
                          cancellation: { ...prev.cancellation, refund_policy: e.target.value },
                        }));
                      }}
                      rows={3}
                      placeholder="Descreva a política de reembolso..."
                    />
                  </div>
                </div>
              </div>

              {/* Política de Check-in/Check-out */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-semibold">Check-in e Check-out</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="early_checkin_available">Check-in Antecipado Disponível</Label>
                    </div>
                    <Switch
                      id="early_checkin_available"
                      checked={policies.checkin_checkout.early_checkin_available}
                      onCheckedChange={(checked) => {
                        setPolicies((prev) => ({
                          ...prev,
                          checkin_checkout: { ...prev.checkin_checkout, early_checkin_available: checked },
                        }));
                      }}
                    />
                  </div>
                  {policies.checkin_checkout.early_checkin_available && (
                    <div>
                      <Label htmlFor="early_checkin_fee">Taxa de Check-in Antecipado</Label>
                      <Input
                        id="early_checkin_fee"
                        value={policies.checkin_checkout.early_checkin_fee}
                        onChange={(e) => {
                          setPolicies((prev) => ({
                            ...prev,
                            checkin_checkout: { ...prev.checkin_checkout, early_checkin_fee: e.target.value },
                          }));
                        }}
                        placeholder="R$ 50,00"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="late_checkout_available">Check-out Tardio Disponível</Label>
                    </div>
                    <Switch
                      id="late_checkout_available"
                      checked={policies.checkin_checkout.late_checkout_available}
                      onCheckedChange={(checked) => {
                        setPolicies((prev) => ({
                          ...prev,
                          checkin_checkout: { ...prev.checkin_checkout, late_checkout_available: checked },
                        }));
                      }}
                    />
                  </div>
                  {policies.checkin_checkout.late_checkout_available && (
                    <div>
                      <Label htmlFor="late_checkout_fee">Taxa de Check-out Tardio</Label>
                      <Input
                        id="late_checkout_fee"
                        value={policies.checkin_checkout.late_checkout_fee}
                        onChange={(e) => {
                          setPolicies((prev) => ({
                            ...prev,
                            checkin_checkout: { ...prev.checkin_checkout, late_checkout_fee: e.target.value },
                          }));
                        }}
                        placeholder="R$ 50,00"
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="checkin_instructions">Instruções de Check-in</Label>
                    <Textarea
                      id="checkin_instructions"
                      value={policies.checkin_checkout.checkin_instructions}
                      onChange={(e) => {
                        setPolicies((prev) => ({
                          ...prev,
                          checkin_checkout: { ...prev.checkin_checkout, checkin_instructions: e.target.value },
                        }));
                      }}
                      rows={3}
                      placeholder="Instruções para o hóspede realizar o check-in..."
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout_instructions">Instruções de Check-out</Label>
                    <Textarea
                      id="checkout_instructions"
                      value={policies.checkin_checkout.checkout_instructions}
                      onChange={(e) => {
                        setPolicies((prev) => ({
                          ...prev,
                          checkin_checkout: { ...prev.checkin_checkout, checkout_instructions: e.target.value },
                        }));
                      }}
                      rows={3}
                      placeholder="Instruções para o hóspede realizar o check-out..."
                    />
                  </div>
                </div>
              </div>

              {/* Política de Animais */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-semibold">Política de Animais</h4>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="pets_allowed">Animais Permitidos</Label>
                    </div>
                    <Switch
                      id="pets_allowed"
                      checked={policies.pets.pets_allowed}
                      onCheckedChange={(checked) => {
                        setPolicies((prev) => ({
                          ...prev,
                          pets: { ...prev.pets, pets_allowed: checked },
                        }));
                      }}
                    />
                  </div>
                  {policies.pets.pets_allowed && (
                    <>
                      <div>
                        <Label htmlFor="pet_policy">Política de Animais</Label>
                        <Textarea
                          id="pet_policy"
                          value={policies.pets.pet_policy}
                          onChange={(e) => {
                            setPolicies((prev) => ({
                              ...prev,
                              pets: { ...prev.pets, pet_policy: e.target.value },
                            }));
                          }}
                          rows={3}
                          placeholder="Descreva a política de animais..."
                        />
                      </div>
                      <div>
                        <Label htmlFor="pet_fee">Taxa por Animal</Label>
                        <Input
                          id="pet_fee"
                          value={policies.pets.pet_fee}
                          onChange={(e) => {
                            setPolicies((prev) => ({
                              ...prev,
                              pets: { ...prev.pets, pet_fee: e.target.value },
                            }));
                          }}
                          placeholder="R$ 30,00 por noite"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Política de Crianças */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-semibold">Política de Crianças</h4>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="children_policy">Política de Crianças</Label>
                    <Textarea
                      id="children_policy"
                      value={policies.children.children_policy}
                      onChange={(e) => {
                        setPolicies((prev) => ({
                          ...prev,
                          children: { ...prev.children, children_policy: e.target.value },
                        }));
                      }}
                      rows={3}
                      placeholder="Descreva a política para crianças..."
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="extra_bed_available">Cama Extra Disponível</Label>
                    </div>
                    <Switch
                      id="extra_bed_available"
                      checked={policies.children.extra_bed_available}
                      onCheckedChange={(checked) => {
                        setPolicies((prev) => ({
                          ...prev,
                          children: { ...prev.children, extra_bed_available: checked },
                        }));
                      }}
                    />
                  </div>
                  {policies.children.extra_bed_available && (
                    <div>
                      <Label htmlFor="extra_bed_fee">Taxa de Cama Extra</Label>
                      <Input
                        id="extra_bed_fee"
                        value={policies.children.extra_bed_fee}
                        onChange={(e) => {
                          setPolicies((prev) => ({
                            ...prev,
                            children: { ...prev.children, extra_bed_fee: e.target.value },
                          }));
                        }}
                        placeholder="R$ 50,00 por noite"
                      />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="crib_available">Berço Disponível</Label>
                    </div>
                    <Switch
                      id="crib_available"
                      checked={policies.children.crib_available}
                      onCheckedChange={(checked) => {
                        setPolicies((prev) => ({
                          ...prev,
                          children: { ...prev.children, crib_available: checked },
                        }));
                      }}
                    />
                  </div>
                  {policies.children.crib_available && (
                    <div>
                      <Label htmlFor="crib_fee">Taxa de Berço</Label>
                      <Input
                        id="crib_fee"
                        value={policies.children.crib_fee}
                        onChange={(e) => {
                          setPolicies((prev) => ({
                            ...prev,
                            children: { ...prev.children, crib_fee: e.target.value },
                          }));
                        }}
                        placeholder="R$ 20,00 por noite"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Políticas Gerais */}
              <div className="border rounded-lg p-4 space-y-4">
                <h4 className="font-semibold">Políticas Gerais</h4>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="smoking_policy">Política de Fumantes</Label>
                    <Select
                      value={policies.general.smoking_policy}
                      onValueChange={(value) => {
                        setPolicies((prev) => ({
                          ...prev,
                          general: { ...prev.general, smoking_policy: value },
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Não permitido">Não permitido</SelectItem>
                        <SelectItem value="Permitido">Permitido</SelectItem>
                        <SelectItem value="Área específica">Área específica</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="age_restriction">Restrição de Idade</Label>
                    <Input
                      id="age_restriction"
                      value={policies.general.age_restriction}
                      onChange={(e) => {
                        setPolicies((prev) => ({
                          ...prev,
                          general: { ...prev.general, age_restriction: e.target.value },
                        }));
                      }}
                      placeholder="Ex: Menores de 18 anos devem estar acompanhados"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="id_required">Documento de Identidade Obrigatório</Label>
                    </div>
                    <Switch
                      id="id_required"
                      checked={policies.general.id_required}
                      onCheckedChange={(checked) => {
                        setPolicies((prev) => ({
                          ...prev,
                          general: { ...prev.general, id_required: checked },
                        }));
                      }}
                    />
                  </div>
                  <div>
                    <Label htmlFor="special_requests">Solicitações Especiais</Label>
                    <Textarea
                      id="special_requests"
                      value={policies.general.special_requests}
                      onChange={(e) => {
                        setPolicies((prev) => ({
                          ...prev,
                          general: { ...prev.general, special_requests: e.target.value },
                        }));
                      }}
                      rows={3}
                      placeholder="Informações sobre solicitações especiais..."
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }}
                  disabled={loading || isCreating}
                >
                  {loading || isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Políticas
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="services">
            <BuildingServicesManager 
              buildingId={buildingId || null}
              buildingName={formData.name}
              services={services}
              isLoading={isLoadingServices}
              saveServices={saveServices}
              isSaving={isSavingServices}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

// Componente de Gerenciamento de Serviços do Prédio
const BuildingServicesManager = ({
  buildingId,
  buildingName,
  services,
  isLoading,
  saveServices,
  isSaving,
}: {
  buildingId: string | null;
  buildingName?: string;
  services: any[];
  isLoading: boolean;
  saveServices: (services: Array<{ id?: string; name: string; description?: string; is_active: boolean }>) => Promise<any>;
  isSaving: boolean;
}) => {
  const { data: cleaningConfig, isLoading: isLoadingCleaning } = useCleaningFeeConfig(buildingId);
  const { data: parkingConfig, isLoading: isLoadingParking } = useParkingFeeConfig(buildingId);
  const [localServices, setLocalServices] = useState<Array<{ id?: string; name: string; description: string; is_active: boolean }>>([]);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");

  // Usar useMemo para criar uma versão estável dos serviços
  const normalizedServices = useMemo(() => {
    if (!services || services.length === 0) return [];
    return services
      .filter(
        (s) =>
          !s.checkin_guest_info_type &&
          (s.service_kind === "amenity" || !s.service_kind),
      )
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description || "",
        is_active: s.is_active,
      }));
  }, [services]);

  // Usar useRef para armazenar o valor anterior e evitar loops
  const prevServicesRef = useRef<string>("");

  useEffect(() => {
    const currentServicesKey = JSON.stringify(normalizedServices);
    
    // Só atualiza se os serviços realmente mudaram
    if (currentServicesKey !== prevServicesRef.current) {
      setLocalServices(normalizedServices);
      prevServicesRef.current = currentServicesKey;
    }
  }, [normalizedServices]);

  const handleAddService = () => {
    if (!newServiceName.trim()) {
      toast.error("Informe o nome do serviço");
      return;
    }

    // Verificar se já existe
    if (localServices.some(s => s.name.toLowerCase() === newServiceName.trim().toLowerCase() && !s.id)) {
      toast.error("Este serviço já está na lista");
      return;
    }

    setLocalServices([
      ...localServices,
      {
        name: newServiceName.trim(),
        description: newServiceDescription.trim(),
        is_active: true,
      },
    ]);
    setNewServiceName("");
    setNewServiceDescription("");
  };

  const handleRemoveService = (index: number) => {
    setLocalServices(localServices.filter((_, i) => i !== index));
  };

  const handleToggleService = (index: number) => {
    const updated = [...localServices];
    updated[index].is_active = !updated[index].is_active;
    setLocalServices(updated);
  };

  const handleUpdateService = (index: number, field: "name" | "description", value: string) => {
    const updated = [...localServices];
    updated[index][field] = value;
    setLocalServices(updated);
  };

  const handleSave = async () => {
    try {
      await saveServices(localServices);
    } catch (error) {
      console.error(error);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Serviços do Prédio</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Gerencie os serviços disponibilizados pelo prédio (Wi-fi, Piscina, Estacionamento, etc.)
          </p>
        </div>

        {buildingId ? (
          <>
            <CleaningFeeSettingCard
              buildingId={buildingId}
              buildingName={buildingName}
              initialConfig={cleaningConfig}
              isLoading={isLoadingCleaning}
            />
            <ParkingFeeSettingCard
              buildingId={buildingId}
              buildingName={buildingName}
              initialConfig={parkingConfig}
              isLoading={isLoadingParking}
            />
            <CheckinGuestInfoServicesCard scope="building" buildingId={buildingId} buildingName={buildingName} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Salve o prédio primeiro para configurar a taxa de limpeza e o estacionamento.
          </p>
        )}

        {/* Formulário para adicionar novo serviço */}
        <div className="border rounded-lg p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="service_name">Nome do Serviço *</Label>
              <Input
                id="service_name"
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder="Ex: Wi-fi Gratuito"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddService();
                  }
                }}
              />
            </div>
            <div>
              <Label htmlFor="service_description">Descrição</Label>
              <Input
                id="service_description"
                value={newServiceDescription}
                onChange={(e) => setNewServiceDescription(e.target.value)}
                placeholder="Ex: Wi-fi Gratuito"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddService();
                  }
                }}
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={handleAddService}
            className="gap-2"
            variant="outline"
          >
            <Plus className="h-4 w-4" />
            Adicionar Serviço
          </Button>
        </div>

        {/* Lista de serviços */}
        {localServices.length > 0 ? (
          <div className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">
                      <div className="flex items-center gap-2">
                        <X className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {localServices.map((service, index) => (
                    <TableRow key={service.id || `new-${index}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={service.is_active}
                            onCheckedChange={() => handleToggleService(index)}
                            className="data-[state=checked]:bg-pink-600 data-[state=checked]:border-pink-600"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveService(index)}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={service.name}
                          onChange={(e) => handleUpdateService(index, "name", e.target.value)}
                          className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto font-medium"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={service.description}
                          onChange={(e) => handleUpdateService(index, "description", e.target.value)}
                          placeholder="Descrição do serviço"
                          className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-0 h-auto"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="gap-2 bg-pink-600 hover:bg-pink-700 text-white"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Salvar Serviços
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhum serviço cadastrado. Adicione serviços acima.</p>
          </div>
        )}
      </div>
    </Card>
  );
};

