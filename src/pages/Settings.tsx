import { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHotelSettings } from "@/hooks/useHotelSettings";
import { useApiSettings } from "@/hooks/useApiSettings";
import { usePaymentCarriers } from "@/hooks/usePaymentCarriers";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useEstablishmentServices, EstablishmentService } from "@/hooks/useEstablishmentServices";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload, Image as ImageIcon, Save, Plus, X, Check, CreditCard, FileText, Mail, AlertCircle, Key, Globe, Eye, EyeOff, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { StripeEstablishmentConfigDialog } from "@/components/stripe/StripeEstablishmentConfigDialog";
import { useStripe } from "@/hooks/useStripe";
import { useCurrentEmployeeRole } from "@/hooks/useEmployees";
import { useIsSuperAdmin } from "@/hooks/useUsers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const Settings = () => {
  const { settings, isLoading, saveSettings, uploadImage, isSaving, settingsQuery } = useHotelSettings();
  const { selectedEstablishment } = useEstablishment();
  const { apiSettings, saveApiSetting, deleteApiSetting, isLoading: isLoadingApi } = useApiSettings();
  const { carriers } = usePaymentCarriers();
  const { role } = useCurrentEmployeeRole();
  const { isSuperAdmin } = useIsSuperAdmin();
  const { settings: siteSettings } = useSiteSettings();
  
  // Verificar se a funcionalidade de integrações está habilitada
  const isApiIntegrationsEnabled = siteSettings?.features_enabled?.api_integrations !== false;

  // TODOS OS HOOKS DEVEM SER CHAMADOS ANTES DE QUALQUER RETURN CONDICIONAL
  const [formData, setFormData] = useState({
    name: "",
    website: "",
    email: "",
    hotel_type: "hotel",
    phone: "",
    whatsapp: "",
    description: "",
    street: "",
    number: "",
    neighborhood: "",
    city: "",
    state: "",
    country: "Brasil",
    zip_code: "",
    logo_url: "",
    photo_url: "",
    signature_url: "",
    checkin_time: "14:00",
    checkout_time: "12:00",
    auto_payment_ota: false,
    auto_payment_carrier_id: "",
    enable_cleaning_notifications: true,
    fiscal_document_type: "both",
    invoice_email: "",
    establishment_cnpj: "",
    show_establishment_cnpj: true,
    reception_email: "",
    timezone: "America/Sao_Paulo",
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [signaturePreview, setSignaturePreview] = useState<string>("");

  useEffect(() => {
    // Se não tem settings mas tem estabelecimento, usar nome do estabelecimento
    if (!settings && selectedEstablishment) {
      setFormData((prev) => ({
        ...prev,
        name: selectedEstablishment.name || "",
      }));
    } else if (settings) {
      // Construir phone e whatsapp dos campos antigos se os novos não existirem
      const phone = settings.phone || 
        (settings.phone_ddi && settings.phone_number 
          ? `${settings.phone_ddi} ${settings.phone_number}`.trim()
          : settings.phone_number || "");
      
      const whatsapp = settings.whatsapp || 
        (settings.whatsapp_ddi && settings.whatsapp_number 
          ? `${settings.whatsapp_ddi} ${settings.whatsapp_number}`.trim()
          : settings.whatsapp_number || "");

      setFormData({
        name: settings.name || "",
        website: settings.website || "",
        email: settings.email || "",
        hotel_type: settings.hotel_type || "hotel",
        phone: phone,
        whatsapp: whatsapp,
        description: settings.description || "",
        street: settings.street || "",
        number: settings.number || "",
        neighborhood: settings.neighborhood || "",
        city: settings.city || "",
        state: settings.state || "",
        country: settings.country || "Brasil",
        zip_code: settings.zip_code || "",
        logo_url: settings.logo_url || "",
        photo_url: settings.photo_url || "",
        signature_url: settings.signature_url || "",
        checkin_time: settings.checkin_time ? settings.checkin_time.substring(0, 5) : "14:00",
        checkout_time: settings.checkout_time ? settings.checkout_time.substring(0, 5) : "12:00",
        auto_payment_ota: settings.auto_payment_ota ?? false,
        auto_payment_carrier_id: settings.auto_payment_carrier_id || "",
        enable_cleaning_notifications: settings.enable_cleaning_notifications !== undefined ? settings.enable_cleaning_notifications : true,
        fiscal_document_type: settings.fiscal_document_type || "both",
        invoice_email: settings.invoice_email || "",
        establishment_cnpj: settings.establishment_cnpj || "",
        show_establishment_cnpj: settings.show_establishment_cnpj !== undefined ? settings.show_establishment_cnpj : true,
        reception_email: selectedEstablishment?.reception_email || "",
        timezone: settings.timezone || "America/Sao_Paulo",
      });
      if (settings.logo_url) setLogoPreview(settings.logo_url);
      if (settings.photo_url) setPhotoPreview(settings.photo_url);
      if (settings.signature_url) setSignaturePreview(settings.signature_url);
    }
  }, [settings, selectedEstablishment]);

  // Verificar se o usuário pode acessar configurações (apenas gerente ou super admin)
  // IMPORTANTE: Esta verificação deve vir DEPOIS de todos os hooks
  const canAccessSettings = role?.code === "manager" || isSuperAdmin;

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

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem");
      return;
    }

    setSignatureFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setSignaturePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      let logoUrl = formData.logo_url;
      let photoUrl = formData.photo_url;
      let signatureUrl = formData.signature_url;

      if (logoFile) {
        const uploaded = await uploadImage(logoFile, "logo");
        if (uploaded) logoUrl = uploaded;
      }

      if (photoFile) {
        const uploaded = await uploadImage(photoFile, "photo");
        if (uploaded) photoUrl = uploaded;
      }

      if (signatureFile) {
        const uploaded = await uploadImage(signatureFile, "signature");
        if (uploaded) signatureUrl = uploaded;
      }

      // Separar WhatsApp em DDI e número se fornecido
      let whatsappDdi = undefined;
      let whatsappNumber = undefined;
      if (formData.whatsapp) {
        // Tentar extrair DDI e número do campo whatsapp
        const whatsappClean = formData.whatsapp.replace(/\D/g, ""); // Remove tudo exceto números
        // Se começar com 55 (Brasil), extrair DDI
        if (whatsappClean.startsWith("55") && whatsappClean.length > 10) {
          whatsappDdi = "+55";
          whatsappNumber = whatsappClean.substring(2); // Remove o 55 do início
        } else if (whatsappClean.length > 0) {
          // Se não começar com 55, usar tudo como número
          whatsappNumber = whatsappClean;
        }
      }

      // Separar reception_email do formData antes de salvar em hotel_settings
      const { reception_email, ...settingsData } = formData;

      await saveSettings({
        ...settingsData,
        whatsapp_ddi: whatsappDdi,
        whatsapp_number: whatsappNumber,
        logo_url: logoUrl,
        photo_url: photoUrl,
        signature_url: signatureUrl,
        checkin_time: `${formData.checkin_time}:00`,
        checkout_time: `${formData.checkout_time}:00`,
        auto_payment_carrier_id: formData.auto_payment_carrier_id || undefined,
        timezone: formData.timezone,
      });

      // Salvar reception_email na tabela establishments (não em hotel_settings)
      if (selectedEstablishment?.id && reception_email !== undefined) {
        try {
          const { error: updateError } = await supabase
            .from("establishments")
            .update({ reception_email: reception_email || null })
            .eq("id", selectedEstablishment.id);

          if (updateError) {
            console.warn("Erro ao atualizar email da portaria:", updateError);
          } else {
            // Invalidar cache de establishments para atualizar o contexto
            queryClient.invalidateQueries({ queryKey: ["establishments"] });
          }
        } catch (error) {
          console.warn("Erro ao atualizar email da portaria:", error);
          // Não bloquear o sucesso da operação principal
        }
      }

      setLogoFile(null);
      setPhotoFile(null);
      setSignatureFile(null);
    } catch (error) {
      console.error(error);
    }
  };

  // Verificar acesso ANTES de renderizar conteúdo (depois de todos os hooks)
  if (!canAccessSettings) {
    return (
      <div className="space-y-6">
        <Card className="p-12 text-center">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-destructive" />
          <h2 className="text-2xl font-bold mb-2">Acesso Negado</h2>
          <p className="text-muted-foreground">
            Apenas gerentes e super admins podem acessar as configurações do estabelecimento.
          </p>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Se houver erro ao carregar (tabela não existe), mostrar mensagem
  if (settingsQuery.isError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
            <p className="text-muted-foreground">Gerencie as configurações do hotel</p>
          </div>
        </div>
        <Card className="p-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">
              A tabela de configurações ainda não foi criada.
            </p>
            <p className="text-sm text-muted-foreground">
              Execute a migration <code className="bg-muted px-2 py-1 rounded">20251112000006_create_hotel_settings.sql</code> no Supabase primeiro.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Configurações</h1>
          <p className="text-muted-foreground">Gerencie as configurações do hotel</p>
        </div>
      </div>

      <Tabs defaultValue="hotel" className="space-y-4">
        <TabsList>
          <TabsTrigger value="hotel">Informações do Hotel</TabsTrigger>
          <TabsTrigger value="schedule">Horário e Pagamento</TabsTrigger>
          <TabsTrigger value="services">Serviços</TabsTrigger>
          <TabsTrigger value="policies">Políticas</TabsTrigger>
          {isApiIntegrationsEnabled && (
            <TabsTrigger value="integration">Integrações</TabsTrigger>
          )}
          <TabsTrigger value="stripe">Stripe</TabsTrigger>
        </TabsList>

        <TabsContent value="hotel">
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Informações Básicas</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome do Estabelecimento *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="website">Site</Label>
                      <Input
                        id="website"
                        type="url"
                        value={formData.website}
                        onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                        placeholder="https://..."
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">E-mail</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="contato@hotel.com"
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="hotel_type">Tipo de Estabelecimento</Label>
                    <Select
                      value={formData.hotel_type}
                      onValueChange={(value) => setFormData({ ...formData, hotel_type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hotel">Hotel</SelectItem>
                        <SelectItem value="apartment">Apartamento</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={4}
                      placeholder="Descrição do estabelecimento"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Contato</h3>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="phone">Telefone</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+55 (00) 00000-0000"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Inclua o código do país (DDI) e o número completo
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input
                      id="whatsapp"
                      value={formData.whatsapp}
                      onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                      placeholder="+55 (00) 00000-0000"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Inclua o código do país (DDI) e o número completo
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Endereço</h3>
                <div className="space-y-4">
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
                    <Label htmlFor="country">País</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      placeholder="País"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Imagens</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <Label>Logo</Label>
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
                          id="logo-upload"
                        />
                        <Label
                          htmlFor="logo-upload"
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
                          id="photo-upload"
                        />
                        <Label
                          htmlFor="photo-upload"
                          className="cursor-pointer flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted"
                        >
                          <ImageIcon className="h-4 w-4" />
                          {photoPreview ? "Alterar Foto" : "Enviar Foto"}
                        </Label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label>Assinatura Digital (para PDFs de Recibo)</Label>
                    <div className="mt-2 space-y-2">
                      {signaturePreview && (
                        <div className="relative w-full h-32 border rounded-lg overflow-hidden bg-white">
                          <img
                            src={signaturePreview}
                            alt="Signature preview"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleSignatureUpload}
                          className="hidden"
                          id="signature-upload"
                        />
                        <Label
                          htmlFor="signature-upload"
                          className="cursor-pointer flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted"
                        >
                          <FileText className="h-4 w-4" />
                          {signaturePreview ? "Alterar Assinatura" : "Enviar Assinatura"}
                        </Label>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A assinatura será inserida automaticamente nos PDFs de recibo gerados
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Configurações
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="schedule">
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Horários</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="checkin_time">Horário de Check-in</Label>
                    <Input
                      id="checkin_time"
                      type="time"
                      value={formData.checkin_time}
                      onChange={(e) => setFormData({ ...formData, checkin_time: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="checkout_time">Horário de Check-out</Label>
                    <Input
                      id="checkout_time"
                      type="time"
                      value={formData.checkout_time}
                      onChange={(e) => setFormData({ ...formData, checkout_time: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Pagamento Automático OTA</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="auto_payment_ota">Ativar Pagamento Automático</Label>
                      <p className="text-sm text-muted-foreground">
                        Quando uma reserva cair de uma OTA (Booking, Airbnb, etc.), o sistema
                        automaticamente marcará como pago
                      </p>
                    </div>
                    <Switch
                      id="auto_payment_ota"
                      checked={formData.auto_payment_ota}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, auto_payment_ota: checked })
                      }
                    />
                  </div>

                  {formData.auto_payment_ota && (
                    <div>
                      <Label htmlFor="auto_payment_carrier_id">Portador de Pagamento *</Label>
                      <Select
                        value={formData.auto_payment_carrier_id || "__none__"}
                        onValueChange={(value) =>
                          setFormData({
                            ...formData,
                            auto_payment_carrier_id: value === "__none__" ? "" : value,
                          })
                        }
                        required={formData.auto_payment_ota}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um portador" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Selecione um portador</SelectItem>
                          {carriers
                            .filter((c: any) => c.is_active)
                            .map((carrier: any) => (
                              <SelectItem key={carrier.id} value={carrier.id}>
                                {carrier.code} - {carrier.description}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-1">
                        Os pagamentos automáticos serão vinculados a este portador para aparecer
                        nos relatórios financeiros
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4">Notificações</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="enable_cleaning_notifications">Notificações de Limpeza</Label>
                      <p className="text-sm text-muted-foreground">
                        Quando ativado, o sistema criará notificações automaticamente quando um check-out passar do horário, alertando que o quarto precisa de limpeza
                      </p>
                    </div>
                    <Switch
                      id="enable_cleaning_notifications"
                      checked={formData.enable_cleaning_notifications}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, enable_cleaning_notifications: checked })
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="timezone">Fuso Horário</Label>
                      <p className="text-sm text-muted-foreground">
                        Fuso horário do estabelecimento usado para cálculos de datas/horas (ex: America/Sao_Paulo, America/New_York)
                      </p>
                    </div>
                    <Select
                      value={formData.timezone}
                      onValueChange={(value) =>
                        setFormData({ ...formData, timezone: value })
                      }
                    >
                      <SelectTrigger className="w-[250px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/Sao_Paulo">America/Sao_Paulo (UTC-3)</SelectItem>
                        <SelectItem value="America/New_York">America/New_York (UTC-5)</SelectItem>
                        <SelectItem value="America/Los_Angeles">America/Los_Angeles (UTC-8)</SelectItem>
                        <SelectItem value="America/Chicago">America/Chicago (UTC-6)</SelectItem>
                        <SelectItem value="America/Denver">America/Denver (UTC-7)</SelectItem>
                        <SelectItem value="Europe/London">Europe/London (UTC+0)</SelectItem>
                        <SelectItem value="Europe/Paris">Europe/Paris (UTC+1)</SelectItem>
                        <SelectItem value="Asia/Tokyo">Asia/Tokyo (UTC+9)</SelectItem>
                        <SelectItem value="UTC">UTC (UTC+0)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Nota Fiscal / Recibo</h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="fiscal_document_type">Tipo de Documento Fiscal Emitido</Label>
                    <Select
                      value={formData.fiscal_document_type}
                      onValueChange={(value) =>
                        setFormData({ ...formData, fiscal_document_type: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invoice">Apenas Nota Fiscal</SelectItem>
                        <SelectItem value="receipt">Apenas Recibo</SelectItem>
                        <SelectItem value="both">Nota Fiscal e Recibo</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">
                      Esta configuração define quais tipos de documentos fiscais o estabelecimento emite.
                      Será utilizada no sistema de solicitação de recibos e notas fiscais.
                    </p>
                  </div>

                  {(formData.fiscal_document_type === "invoice" || formData.fiscal_document_type === "both") && (
                    <div>
                      <Label htmlFor="invoice_email" className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        E-mail do Departamento de Nota Fiscal
                      </Label>
                      <Input
                        id="invoice_email"
                        type="email"
                        value={formData.invoice_email}
                        onChange={(e) =>
                          setFormData({ ...formData, invoice_email: e.target.value })
                        }
                        placeholder="fiscal@estabelecimento.com"
                        className="mt-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Quando um hóspede solicitar Nota Fiscal, a solicitação será enviada automaticamente para este e-mail.
                      </p>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="establishment_cnpj">CNPJ do Estabelecimento</Label>
                    <Input
                      id="establishment_cnpj"
                      value={formData.establishment_cnpj}
                      onChange={(e) => {
                        // Permitir apenas números
                        const value = e.target.value.replace(/\D/g, "");
                        // Limitar a 14 dígitos
                        const limitedValue = value.slice(0, 14);
                        setFormData({ ...formData, establishment_cnpj: limitedValue });
                      }}
                      placeholder="00000000000000"
                      maxLength={14}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      CNPJ do estabelecimento que será exibido no recibo (apenas números, 14 dígitos).
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label htmlFor="show_establishment_cnpj">Exibir CNPJ no Recibo</Label>
                      <p className="text-xs text-muted-foreground">
                        Quando habilitado, o CNPJ do estabelecimento será exibido no recibo gerado.
                      </p>
                    </div>
                    <Switch
                      id="show_establishment_cnpj"
                      checked={formData.show_establishment_cnpj}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, show_establishment_cnpj: checked })
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor="reception_email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      E-mail da Portaria
                    </Label>
                    <Input
                      id="reception_email"
                      type="email"
                      value={formData.reception_email || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, reception_email: e.target.value })
                      }
                      placeholder="recepcao@estabelecimento.com"
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      E-mail que receberá notificações automáticas quando hóspedes completarem o check-in online, incluindo foto selfie e documentos. Se não configurado, o sistema tentará usar o email do prédio associado ao quarto.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar Configurações
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </TabsContent>

        <TabsContent value="services">
          <ServicesManager />
        </TabsContent>

        <TabsContent value="policies">
          <PoliciesManager />
        </TabsContent>

        {isApiIntegrationsEnabled && (
          <TabsContent value="integration">
            <ApiSettingsManager />
          </TabsContent>
        )}

        <TabsContent value="stripe">
          <StripeSettingsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Componente de Gerenciamento de Serviços
const ServicesManager = () => {
  const { services, isLoading, saveServices, isSaving } = useEstablishmentServices();
  const [localServices, setLocalServices] = useState<Array<{ id?: string; name: string; description: string; is_active: boolean }>>([]);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceDescription, setNewServiceDescription] = useState("");

  // Usar useMemo para criar uma versão estável dos serviços
  const normalizedServices = useMemo(() => {
    if (!services || services.length === 0) return [];
    return services.map(s => ({
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
          <h3 className="text-lg font-semibold mb-2">Serviços do Estabelecimento</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Gerencie os serviços disponibilizados pelo hotel (Wi-fi, Piscina, Estacionamento, etc.)
          </p>
        </div>

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
                    Salvar
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

// Componente de Gerenciamento de Políticas
const PoliciesManager = () => {
  const { settings, saveSettings, isSaving } = useHotelSettings();
  const [policies, setPolicies] = useState({
    policies_text: "", // Campo de texto livre para políticas
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
    if (settings?.policies) {
      try {
        const savedPolicies = typeof settings.policies === 'string' 
          ? JSON.parse(settings.policies) 
          : settings.policies;
        setPolicies((prev) => ({
          ...prev,
          ...savedPolicies,
        }));
      } catch (error) {
        console.error("Erro ao carregar políticas:", error);
      }
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      // Preservar todos os campos existentes e adicionar apenas as políticas
      await saveSettings({
        ...settings,
        name: settings?.name || "",
        policies: policies as any,
      } as any);
      toast.success("Políticas salvas com sucesso!");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar políticas");
    }
  };

  const updatePolicy = (category: string, field: string, value: any) => {
    if (category === "") {
      // Atualizar campo raiz (policies_text)
      setPolicies((prev) => ({
        ...prev,
        [field]: value,
      }));
    } else {
      setPolicies((prev) => ({
        ...prev,
        [category]: {
          ...prev[category as keyof typeof prev],
          [field]: value,
        },
      }));
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-2">Políticas do Estabelecimento</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Configure as políticas de cancelamento, check-in/check-out, animais, crianças e outras regras do estabelecimento
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
              onChange={(e) => updatePolicy("", "policies_text", e.target.value)}
              rows={8}
              placeholder="Digite aqui as políticas do estabelecimento em formato de texto livre. Este texto será exibido para o hóspede no check-in online antes das políticas estruturadas..."
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
                onChange={(e) => updatePolicy("cancellation", "free_cancellation_days", parseInt(e.target.value) || 0)}
                placeholder="7"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Número de dias antes do check-in para cancelamento gratuito
              </p>
            </div>
            <div>
              <Label htmlFor="cancellation_policy">Política de Cancelamento</Label>
              <Textarea
                id="cancellation_policy"
                value={policies.cancellation.cancellation_policy}
                onChange={(e) => updatePolicy("cancellation", "cancellation_policy", e.target.value)}
                rows={3}
                placeholder="Descreva a política de cancelamento..."
              />
            </div>
            <div>
              <Label htmlFor="refund_policy">Política de Reembolso</Label>
              <Textarea
                id="refund_policy"
                value={policies.cancellation.refund_policy}
                onChange={(e) => updatePolicy("cancellation", "refund_policy", e.target.value)}
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
                <p className="text-sm text-muted-foreground">
                  Permitir check-in antes do horário padrão
                </p>
              </div>
              <Switch
                id="early_checkin_available"
                checked={policies.checkin_checkout.early_checkin_available}
                onCheckedChange={(checked) => updatePolicy("checkin_checkout", "early_checkin_available", checked)}
              />
            </div>
            {policies.checkin_checkout.early_checkin_available && (
              <div>
                <Label htmlFor="early_checkin_fee">Taxa de Check-in Antecipado</Label>
                <Input
                  id="early_checkin_fee"
                  value={policies.checkin_checkout.early_checkin_fee}
                  onChange={(e) => updatePolicy("checkin_checkout", "early_checkin_fee", e.target.value)}
                  placeholder="R$ 50,00"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="late_checkout_available">Check-out Tardio Disponível</Label>
                <p className="text-sm text-muted-foreground">
                  Permitir check-out após o horário padrão
                </p>
              </div>
              <Switch
                id="late_checkout_available"
                checked={policies.checkin_checkout.late_checkout_available}
                onCheckedChange={(checked) => updatePolicy("checkin_checkout", "late_checkout_available", checked)}
              />
            </div>
            {policies.checkin_checkout.late_checkout_available && (
              <div>
                <Label htmlFor="late_checkout_fee">Taxa de Check-out Tardio</Label>
                <Input
                  id="late_checkout_fee"
                  value={policies.checkin_checkout.late_checkout_fee}
                  onChange={(e) => updatePolicy("checkin_checkout", "late_checkout_fee", e.target.value)}
                  placeholder="R$ 50,00"
                />
              </div>
            )}
            <div>
              <Label htmlFor="checkin_instructions">Instruções de Check-in</Label>
              <Textarea
                id="checkin_instructions"
                value={policies.checkin_checkout.checkin_instructions}
                onChange={(e) => updatePolicy("checkin_checkout", "checkin_instructions", e.target.value)}
                rows={3}
                placeholder="Instruções para o hóspede realizar o check-in..."
              />
            </div>
            <div>
              <Label htmlFor="checkout_instructions">Instruções de Check-out</Label>
              <Textarea
                id="checkout_instructions"
                value={policies.checkin_checkout.checkout_instructions}
                onChange={(e) => updatePolicy("checkin_checkout", "checkout_instructions", e.target.value)}
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
                <p className="text-sm text-muted-foreground">
                  Permitir animais de estimação no estabelecimento
                </p>
              </div>
              <Switch
                id="pets_allowed"
                checked={policies.pets.pets_allowed}
                onCheckedChange={(checked) => updatePolicy("pets", "pets_allowed", checked)}
              />
            </div>
            {policies.pets.pets_allowed && (
              <>
                <div>
                  <Label htmlFor="pet_policy">Política de Animais</Label>
                  <Textarea
                    id="pet_policy"
                    value={policies.pets.pet_policy}
                    onChange={(e) => updatePolicy("pets", "pet_policy", e.target.value)}
                    rows={3}
                    placeholder="Descreva a política de animais (tamanho, quantidade, etc.)..."
                  />
                </div>
                <div>
                  <Label htmlFor="pet_fee">Taxa por Animal</Label>
                  <Input
                    id="pet_fee"
                    value={policies.pets.pet_fee}
                    onChange={(e) => updatePolicy("pets", "pet_fee", e.target.value)}
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
                onChange={(e) => updatePolicy("children", "children_policy", e.target.value)}
                rows={3}
                placeholder="Descreva a política para crianças (idade, acomodação, etc.)..."
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="extra_bed_available">Cama Extra Disponível</Label>
                <p className="text-sm text-muted-foreground">
                  Oferecer cama extra para acomodação adicional
                </p>
              </div>
              <Switch
                id="extra_bed_available"
                checked={policies.children.extra_bed_available}
                onCheckedChange={(checked) => updatePolicy("children", "extra_bed_available", checked)}
              />
            </div>
            {policies.children.extra_bed_available && (
              <div>
                <Label htmlFor="extra_bed_fee">Taxa de Cama Extra</Label>
                <Input
                  id="extra_bed_fee"
                  value={policies.children.extra_bed_fee}
                  onChange={(e) => updatePolicy("children", "extra_bed_fee", e.target.value)}
                  placeholder="R$ 50,00 por noite"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="crib_available">Berço Disponível</Label>
                <p className="text-sm text-muted-foreground">
                  Oferecer berço para bebês
                </p>
              </div>
              <Switch
                id="crib_available"
                checked={policies.children.crib_available}
                onCheckedChange={(checked) => updatePolicy("children", "crib_available", checked)}
              />
            </div>
            {policies.children.crib_available && (
              <div>
                <Label htmlFor="crib_fee">Taxa de Berço</Label>
                <Input
                  id="crib_fee"
                  value={policies.children.crib_fee}
                  onChange={(e) => updatePolicy("children", "crib_fee", e.target.value)}
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
                onValueChange={(value) => updatePolicy("general", "smoking_policy", value)}
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
                onChange={(e) => updatePolicy("general", "age_restriction", e.target.value)}
                placeholder="Ex: Menores de 18 anos devem estar acompanhados"
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="id_required">Documento de Identidade Obrigatório</Label>
                <p className="text-sm text-muted-foreground">
                  Exigir documento de identidade no check-in
                </p>
              </div>
              <Switch
                id="id_required"
                checked={policies.general.id_required}
                onCheckedChange={(checked) => updatePolicy("general", "id_required", checked)}
              />
            </div>
            <div>
              <Label htmlFor="special_requests">Solicitações Especiais</Label>
              <Textarea
                id="special_requests"
                value={policies.general.special_requests}
                onChange={(e) => updatePolicy("general", "special_requests", e.target.value)}
                rows={3}
                placeholder="Informações sobre solicitações especiais (dietas, acessibilidade, etc.)..."
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
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
    </Card>
  );
};

// Componente de Gerenciamento de Configurações de API
const ApiSettingsManager = () => {
  const { apiSettings, isLoading, saveApiSetting, deleteApiSetting, isSaving } = useApiSettings();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [formData, setFormData] = useState({
    api_name: "",
    api_key: "",
    api_secret: "",
    api_url: "",
    is_active: true,
    config: "",
  });

  const apiNameOptions = [
    { value: "booking_engine", label: "Booking Engine" },
    { value: "amplifique", label: "Amplifique" },
    { value: "channel_manager", label: "Channel Manager" },
    { value: "payment_gateway", label: "Payment Gateway" },
    { value: "other", label: "Outra API" },
  ];

  const handleEdit = (setting: any) => {
    setEditingId(setting.id);
    setFormData({
      api_name: setting.api_name || "",
      api_key: setting.api_key || "",
      api_secret: setting.api_secret || "",
      api_url: setting.api_url || "",
      is_active: setting.is_active ?? true,
      config: setting.config ? JSON.stringify(setting.config, null, 2) : "",
    });
  };

  const handleCancel = () => {
    setEditingId(null);
    setFormData({
      api_name: "",
      api_key: "",
      api_secret: "",
      api_url: "",
      is_active: true,
      config: "",
    });
  };

  const handleSave = async () => {
    // Validações
    if (!formData.api_name) {
      toast.error("Nome da API é obrigatório");
      return;
    }

    // Validar URL se fornecida
    if (formData.api_url && formData.api_url.trim()) {
      try {
        new URL(formData.api_url);
      } catch (e) {
        toast.error("URL inválida. Use o formato: https://exemplo.com");
        return;
      }
    }

    try {
      let configData = null;
      if (formData.config.trim()) {
        try {
          configData = JSON.parse(formData.config);
        } catch (e) {
          toast.error("Config JSON inválido. Verifique a sintaxe.");
          return;
        }
      }

      // Se editingId é "new", não passar id (criar novo)
      // Se editingId é um UUID, passar id (atualizar existente)
      const isNew = editingId === "new";
      
      await saveApiSetting({
        ...(isNew ? {} : { id: editingId }),
        api_name: formData.api_name,
        api_key: formData.api_key?.trim() || undefined,
        api_secret: formData.api_secret?.trim() || undefined,
        api_url: formData.api_url?.trim() || undefined,
        is_active: formData.is_active,
        config: configData,
      });

      handleCancel();
    } catch (error: any) {
      console.error("Erro ao salvar configuração de API:", error);
      // O erro já é tratado no hook useApiSettings
    }
  };

  const handleDelete = async (id: string, apiName: string) => {
    if (!confirm(`Tem certeza que deseja excluir a configuração "${apiName}"?`)) {
      return;
    }

    try {
      await deleteApiSetting(id);
    } catch (error: any) {
      console.error("Erro ao excluir configuração:", error);
      toast.error(error.message || "Erro ao excluir configuração");
    }
  };

  const toggleSecretVisibility = (id: string) => {
    setShowSecrets((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const maskSecret = (secret: string) => {
    if (!secret) return "";
    if (secret.length <= 8) return "••••••••";
    return secret.substring(0, 4) + "••••••••" + secret.substring(secret.length - 4);
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
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <Key className="w-5 h-5" />
              Configurações de API
            </h3>
            <p className="text-sm text-muted-foreground mb-2">
              Gerencie as integrações com APIs externas (Booking Engine, Channel Manager, Payment Gateway, etc.)
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Armazene credenciais de forma segura para integrações externas</p>
              <p>• Configure múltiplas APIs por estabelecimento</p>
              <p>• Ative/desative integrações conforme necessário</p>
              <p>• Use configurações adicionais em JSON para personalização</p>
            </div>
          </div>
          {!editingId && (
            <Button
              onClick={() => setEditingId("new")}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Nova Configuração
            </Button>
          )}
        </div>

        {/* Formulário de criação/edição */}
        {editingId && (
          <div className="border rounded-lg p-6 space-y-4 bg-muted/50">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">
                {editingId === "new" ? "Nova Configuração de API" : "Editar Configuração"}
              </h4>
              <Button variant="ghost" size="sm" onClick={handleCancel}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="api_name">Nome da API *</Label>
                <Select
                  value={formData.api_name}
                  onValueChange={(value) => setFormData({ ...formData, api_name: value })}
                  disabled={editingId !== "new"}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma API" />
                  </SelectTrigger>
                  <SelectContent>
                    {apiNameOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editingId !== "new" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    O nome da API não pode ser alterado após a criação
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="api_url">URL da API</Label>
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <Input
                    id="api_url"
                    value={formData.api_url}
                    onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
                    placeholder="https://api.exemplo.com"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="api_key">API Key</Label>
                <Input
                  id="api_key"
                  type="text"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="Sua chave de API"
                />
              </div>

              <div>
                <Label htmlFor="api_secret">API Secret</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="api_secret"
                    type={showSecrets[editingId] ? "text" : "password"}
                    value={formData.api_secret}
                    onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
                    placeholder="Seu segredo de API"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => toggleSecretVisibility(editingId)}
                  >
                    {showSecrets[editingId] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="config">Configurações Adicionais (JSON)</Label>
              <Textarea
                id="config"
                value={formData.config}
                onChange={(e) => setFormData({ ...formData, config: e.target.value })}
                placeholder='{"timeout": 5000, "retry": 3}'
                rows={4}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Configurações adicionais em formato JSON (opcional)
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                />
                <Label htmlFor="is_active">Ativo</Label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={isSaving || !formData.api_name}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salvar
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Lista de configurações */}
        {apiSettings.length > 0 ? (
          <div className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome da API</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>API Key</TableHead>
                    <TableHead>API Secret</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {apiSettings.map((setting: any) => (
                    <TableRow key={setting.id}>
                      <TableCell className="font-medium">
                        {apiNameOptions.find((opt) => opt.value === setting.api_name)?.label || setting.api_name}
                      </TableCell>
                      <TableCell>
                        {setting.api_url ? (
                          <a
                            href={setting.api_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <Globe className="h-3 w-3" />
                            {setting.api_url.length > 30
                              ? setting.api_url.substring(0, 30) + "..."
                              : setting.api_url}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {setting.api_key ? (
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {setting.api_key.length > 20
                              ? setting.api_key.substring(0, 20) + "..."
                              : setting.api_key}
                          </code>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {setting.api_secret ? (
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {showSecrets[setting.id]
                                ? setting.api_secret
                                : maskSecret(setting.api_secret)}
                            </code>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleSecretVisibility(setting.id)}
                              className="h-6 w-6 p-0"
                            >
                              {showSecrets[setting.id] ? (
                                <EyeOff className="h-3 w-3" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={setting.is_active ? "default" : "secondary"}>
                          {setting.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(setting)}
                            disabled={!!editingId}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(setting.id, setting.api_name)}
                            disabled={!!editingId}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : (
          !editingId && (
            <div className="text-center py-12 border rounded-lg">
              <Key className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">Nenhuma configuração de API cadastrada</p>
              <Button onClick={() => setEditingId("new")} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar Primeira Configuração
              </Button>
            </div>
          )
        )}
      </div>
    </Card>
  );
};

// Componente de Configuração do Stripe
const StripeSettingsTab = () => {
  const { globalConfig, establishmentConfig, isLoadingEstablishmentConfig, isStripeEnabled } = useStripe();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  if (isLoadingEstablishmentConfig) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Integração Stripe
            </h3>
            <p className="text-sm text-muted-foreground">
              Configure o Stripe para processar pagamentos online
            </p>
          </div>
          <Button onClick={() => setConfigDialogOpen(true)}>
            <CreditCard className="w-4 h-4 mr-2" />
            {establishmentConfig?.is_enabled ? "Editar Configuração" : "Configurar Stripe"}
          </Button>
        </div>

        {!globalConfig?.is_enabled && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              <strong>A integração Stripe não está ativada globalmente.</strong>
              <br />
              É necessário que um Super Admin ative o Stripe globalmente antes de configurar esta conta.
              <br />
              <br />
              <strong>Próximos passos:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>Acesse <strong>Super Admin</strong> &gt; Aba <strong>Stripe</strong></li>
                <li>Configure as chaves do Stripe (test e/ou live)</li>
                <li>Ative <strong>"Stripe Habilitado"</strong></li>
                <li>Salve a configuração</li>
                <li>Volte aqui para configurar sua conta</li>
              </ol>
            </p>
          </div>
        )}

        {establishmentConfig && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="font-medium">Status</span>
              <Badge variant={establishmentConfig.is_enabled ? "default" : "secondary"}>
                {establishmentConfig.is_enabled ? "Ativo" : "Inativo"}
              </Badge>
            </div>

            {establishmentConfig.stripe_account_id && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="font-medium">Conta Stripe</span>
                <span className="text-sm text-muted-foreground">
                  {establishmentConfig.stripe_account_id}
                </span>
              </div>
            )}

            {establishmentConfig.stripe_customer_id && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="font-medium">Customer ID</span>
                <span className="text-sm text-muted-foreground">
                  {establishmentConfig.stripe_customer_id}
                </span>
              </div>
            )}
          </div>
        )}

        <StripeEstablishmentConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
        />
      </div>
    </Card>
  );
};

export default Settings;

