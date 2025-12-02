import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanies } from "@/hooks/useCompanies";
import { useUsers } from "@/hooks/useUsers";
import { useUserCompanies } from "@/hooks/useUserCompanies";
import { useAllUserCompanies } from "@/hooks/useAllUserCompanies";
import { useEstablishments } from "@/hooks/useEstablishments";
import { useUserLimits } from "@/hooks/useUserLimits";
import { useAllUserLimits } from "@/hooks/useAllUserLimits";
import { 
  Plus, 
  Edit, 
  Trash2, 
  Loader2, 
  Users, 
  Building2, 
  Hotel, 
  Link2,
  Shield,
  TrendingUp,
  Activity,
  Mail,
  Phone,
  MapPin,
  FileText,
  Search,
  MoreVertical,
  Upload,
  Image as ImageIcon,
  Globe
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Pie, PieChart, Cell, Legend } from "recharts";
import { EmailTemplatesManager } from "@/components/email/EmailTemplatesManager";
import { EmailSettingsManager } from "@/components/email/EmailSettingsManager";
import { EmailLogsManager } from "@/components/email/EmailLogsManager";
import { EmailQueueManager } from "@/components/email/EmailQueueManager";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Textarea } from "@/components/ui/textarea";
import { StripeGlobalConfigDialog } from "@/components/stripe/StripeGlobalConfigDialog";
import { useStripe } from "@/hooks/useStripe";
import { CreditCard } from "lucide-react";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

// Componente de Gerenciamento de Configurações do Site
const SiteSettingsManager = () => {
  const { settings, isLoading, updateSettings, isUpdating, uploadImage } = useSiteSettings();
  const [formData, setFormData] = useState({
    site_title: "",
    site_description: "",
    meta_description: "",
    og_title: "",
    og_description: "",
  });
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [ogImageFile, setOgImageFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string>("");
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [ogImagePreview, setOgImagePreview] = useState<string>("");

  useEffect(() => {
    if (settings) {
      setFormData({
        site_title: settings.site_title || "",
        site_description: settings.site_description || "",
        meta_description: settings.meta_description || "",
        og_title: settings.og_title || "",
        og_description: settings.og_description || "",
      });
      if (settings.favicon_url) setFaviconPreview(settings.favicon_url);
      if (settings.logo_url) setLogoPreview(settings.logo_url);
      if (settings.og_image) setOgImagePreview(settings.og_image);
    }
  }, [settings]);

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFaviconFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFaviconPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleOgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOgImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setOgImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      let faviconUrl = settings?.favicon_url || null;
      let logoUrl = settings?.logo_url || null;
      let ogImageUrl = settings?.og_image || null;

      if (faviconFile) {
        const uploaded = await uploadImage(faviconFile, "favicon");
        if (uploaded) faviconUrl = uploaded;
      }

      if (logoFile) {
        const uploaded = await uploadImage(logoFile, "logo");
        if (uploaded) logoUrl = uploaded;
      }

      if (ogImageFile) {
        const uploaded = await uploadImage(ogImageFile, "og_image");
        if (uploaded) ogImageUrl = uploaded;
      }

      await updateSettings({
        ...formData,
        favicon_url: faviconUrl,
        logo_url: logoUrl,
        og_image: ogImageUrl,
      });

      setFaviconFile(null);
      setLogoFile(null);
      setOgImageFile(null);
    } catch (error: any) {
      console.error("Erro ao salvar configurações:", error);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Globe className="h-5 w-5 text-primary" />
        <h2 className="text-2xl font-bold">Configurações do Site</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Logo do PMS */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            <Label className="text-base font-semibold">Logo do PMS</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Logo exibida no menu lateral e na página de login
          </p>
          <div className="space-y-2">
            {logoPreview && (
              <div className="relative w-32 h-32 border rounded-lg overflow-hidden bg-white">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="w-full h-full object-contain p-2"
                />
              </div>
            )}
            <div>
              <Input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
                id="logo-upload"
              />
              <Label
                htmlFor="logo-upload"
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted"
              >
                <Upload className="h-4 w-4" />
                {logoPreview ? "Alterar Logo" : "Enviar Logo"}
              </Label>
            </div>
          </div>
        </div>

        {/* Favicon */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            <Label className="text-base font-semibold">Favicon</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Ícone exibido na aba do navegador (recomendado: 32x32px ou 64x64px)
          </p>
          <div className="space-y-2">
            {faviconPreview && (
              <div className="relative w-16 h-16 border rounded overflow-hidden bg-white">
                <img
                  src={faviconPreview}
                  alt="Favicon preview"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div>
              <Input
                type="file"
                accept="image/*"
                onChange={handleFaviconUpload}
                className="hidden"
                id="favicon-upload"
              />
              <Label
                htmlFor="favicon-upload"
                className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted"
              >
                <Upload className="h-4 w-4" />
                {faviconPreview ? "Alterar Favicon" : "Enviar Favicon"}
              </Label>
            </div>
          </div>
        </div>

        {/* Título e Descrição */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <Label className="text-base font-semibold">Informações do Site</Label>
          </div>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="site_title">Título do Site *</Label>
              <Input
                id="site_title"
                value={formData.site_title}
                onChange={(e) => setFormData({ ...formData, site_title: e.target.value })}
                placeholder="Hotel PMS - Sistema de Gerenciamento Hoteleiro"
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Título exibido na aba do navegador
              </p>
            </div>

            <div>
              <Label htmlFor="site_description">Descrição do Site *</Label>
              <Textarea
                id="site_description"
                value={formData.site_description}
                onChange={(e) => setFormData({ ...formData, site_description: e.target.value })}
                placeholder="Sistema completo de gerenciamento hoteleiro..."
                rows={3}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Descrição geral do sistema
              </p>
            </div>

            <div>
              <Label htmlFor="meta_description">Meta Description *</Label>
              <Textarea
                id="meta_description"
                value={formData.meta_description}
                onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                placeholder="Descrição para SEO..."
                rows={3}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Descrição usada em meta tags para SEO (recomendado: 150-160 caracteres)
              </p>
            </div>
          </div>
        </div>

        {/* Open Graph */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <Label className="text-base font-semibold">Open Graph (Redes Sociais)</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Informações exibidas quando o site é compartilhado em redes sociais
          </p>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="og_title">Título OG *</Label>
              <Input
                id="og_title"
                value={formData.og_title}
                onChange={(e) => setFormData({ ...formData, og_title: e.target.value })}
                placeholder="Hotel PMS - Sistema de Gerenciamento Hoteleiro"
                required
              />
            </div>

            <div>
              <Label htmlFor="og_description">Descrição OG *</Label>
              <Textarea
                id="og_description"
                value={formData.og_description}
                onChange={(e) => setFormData({ ...formData, og_description: e.target.value })}
                placeholder="Descrição para compartilhamento..."
                rows={3}
                required
              />
            </div>

            <div>
              <Label>Imagem OG</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Imagem exibida ao compartilhar (recomendado: 1200x630px)
              </p>
              <div className="space-y-2">
                {ogImagePreview && (
                  <div className="relative w-64 h-32 border rounded-lg overflow-hidden">
                    <img
                      src={ogImagePreview}
                      alt="OG Image preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleOgImageUpload}
                    className="hidden"
                    id="og-image-upload"
                  />
                  <Label
                    htmlFor="og-image-upload"
                    className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted"
                  >
                    <Upload className="h-4 w-4" />
                    {ogImagePreview ? "Alterar Imagem" : "Enviar Imagem"}
                  </Label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button type="submit" disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Salvando...
              </>
            ) : (
              "Salvar Configurações"
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
};

const SuperAdmin = () => {
  const queryClient = useQueryClient();
  const { companies, isLoading: isLoadingCompanies, createCompany, updateCompany, deleteCompany } = useCompanies();
  const { users, isLoading: isLoadingUsers, createUser, updateUser, deleteUser } = useUsers();
  const { createUserCompany, updateUserCompany } = useUserCompanies();
  const { establishments, isLoading: isLoadingEstablishments, createEstablishment } = useEstablishments();
  const { allUserLimits } = useAllUserLimits();
  
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [associationDialogOpen, setAssociationDialogOpen] = useState(false);
  const [establishmentDialogOpen, setEstablishmentDialogOpen] = useState(false);
  
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  
  // Hook que depende de selectedUserId deve vir depois da declaração
  const { userLimit, createOrUpdateUserLimit } = useUserLimits(selectedUserId);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<"company" | "user">("company");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  
  const [companyFormData, setCompanyFormData] = useState({
    name: "",
    cnpj: "",
    email: "",
    phone: "",
    address: "",
    pms_logo_url: "",
    pms_custom_name: "",
  });
  const [pmsLogoFile, setPmsLogoFile] = useState<File | null>(null);
  const [pmsLogoPreview, setPmsLogoPreview] = useState<string>("");
  
  const [userFormData, setUserFormData] = useState({
    email: "",
    password: "",
    full_name: "",
    cpf: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    country: "Brasil",
    birth_date: "",
    max_companies: 1,
    max_establishments: 1,
  });
  
  const [associationFormData, setAssociationFormData] = useState({
    user_id: "",
    company_id: "",
    max_companies: 1,
  });
  
  const [establishmentFormData, setEstablishmentFormData] = useState({
    company_id: "",
    name: "",
    type: "hotel",
  });

  // Buscar todas as associações de usuários e empresas
  const { allUserCompanies, isLoading: isLoadingAssociations } = useAllUserCompanies();
  
  // Carregar limites do usuário quando selecionado para edição
  useEffect(() => {
    if (selectedUserId && userLimit) {
      setUserFormData(prev => ({
        ...prev,
        max_companies: userLimit.max_companies || 1,
        max_establishments: userLimit.max_establishments || 1,
      }));
    } else if (selectedUserId && !userLimit) {
      // Se não houver limite configurado, usar valores padrão
      setUserFormData(prev => ({
        ...prev,
        max_companies: 1,
        max_establishments: 1,
      }));
    }
  }, [selectedUserId, userLimit]);

  // Calcular estatísticas
  const stats = {
    totalCompanies: companies.length,
    activeCompanies: companies.filter((c: any) => c.is_active).length,
    totalUsers: users.length,
    totalEstablishments: establishments.length,
    activeEstablishments: establishments.filter((e: any) => e.is_active).length,
    totalAssociations: allUserCompanies?.length || 0,
  };

  // Dados para gráfico de estabelecimentos por tipo
  const establishmentTypeData = establishments.reduce((acc: any, est: any) => {
    const type = est.type || "other";
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const chartData = Object.entries(establishmentTypeData).map(([type, count]) => ({
    name: type === "hotel" ? "Hotel" : type === "apartment" ? "Apartamento" : "Outro",
    value: count,
  }));

  // Dados para gráfico de empresas ativas vs inativas
  const companyStatusData = [
    { name: "Ativas", value: stats.activeCompanies, color: "#00C49F" },
    { name: "Inativas", value: stats.totalCompanies - stats.activeCompanies, color: "#FF8042" },
  ];

  // Upload de logo do PMS
  const uploadPmsLogo = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `pms_logo_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `companies/${fileName}`;

      const bucketName = "hotel-assets";
      const { error: uploadError } = await supabase.storage
        .from(bucketName)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
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
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handlePmsLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione uma imagem");
      return;
    }

    setPmsLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPmsLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let pmsLogoUrl = companyFormData.pms_logo_url;

      // Fazer upload da logo se houver arquivo selecionado
      if (pmsLogoFile) {
        const uploaded = await uploadPmsLogo(pmsLogoFile);
        if (uploaded) pmsLogoUrl = uploaded;
      }

      const dataToSave = {
        ...companyFormData,
        pms_logo_url: pmsLogoUrl,
      };

      if (selectedCompanyId) {
        await updateCompany({ id: selectedCompanyId, ...dataToSave });
        // Invalidar cache de customização do PMS para garantir atualização imediata
        queryClient.invalidateQueries({ queryKey: ["companyPmsCustomization"] });
      } else {
        await createCompany(dataToSave);
      }
      setCompanyDialogOpen(false);
      setCompanyFormData({ name: "", cnpj: "", email: "", phone: "", address: "", pms_logo_url: "", pms_custom_name: "" });
      setPmsLogoFile(null);
      setPmsLogoPreview("");
      setSelectedCompanyId(undefined);
    } catch (error) {
      console.error(error);
    }
  };

  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  const handleSubmitUser = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevenir múltiplos envios
    if (isSubmittingUser) return;
    
    setIsSubmittingUser(true);
    
    try {
      let userId = selectedUserId;
      
      if (selectedUserId) {
        // Se estiver editando e a senha estiver vazia, não enviar
        const updateData: any = {
          id: selectedUserId,
          email: userFormData.email,
          full_name: userFormData.full_name || undefined,
          cpf: userFormData.cpf || undefined,
          phone: userFormData.phone || undefined,
          address: userFormData.address || undefined,
          city: userFormData.city || undefined,
          state: userFormData.state || undefined,
          postal_code: userFormData.postal_code || undefined,
          country: userFormData.country || undefined,
          birth_date: userFormData.birth_date || undefined,
        };
        
        // Só incluir senha se foi preenchida
        if (userFormData.password && userFormData.password.trim() !== "") {
          updateData.password = userFormData.password;
        }
        
        await updateUser(updateData);
      } else {
        if (!userFormData.password || userFormData.password.trim() === "") {
          toast.error("A senha é obrigatória para novos usuários");
          setIsSubmittingUser(false);
          return;
        }
        
        const newUser = await createUser({
          email: userFormData.email,
          password: userFormData.password,
          full_name: userFormData.full_name || undefined,
          cpf: userFormData.cpf || undefined,
          phone: userFormData.phone || undefined,
          address: userFormData.address || undefined,
          city: userFormData.city || undefined,
          state: userFormData.state || undefined,
          postal_code: userFormData.postal_code || undefined,
          country: userFormData.country || undefined,
          birth_date: userFormData.birth_date || undefined,
        });
        userId = newUser.id;
      }

      // Salvar limites do usuário
      if (userId) {
        try {
          await createOrUpdateUserLimit({
            user_id: userId,
            max_companies: userFormData.max_companies,
            max_establishments: userFormData.max_establishments,
          });
        } catch (limitError: any) {
          console.error("Erro ao salvar limites:", limitError);
          // Não bloquear o fluxo se houver erro nos limites
        }
      }

      // Limpar formulário e fechar dialog
      setUserFormData({ 
        email: "", 
        password: "",
        full_name: "",
        cpf: "",
        phone: "",
        address: "",
        city: "",
        state: "",
        postal_code: "",
        country: "Brasil",
        birth_date: "",
        max_companies: 1,
        max_establishments: 1,
      });
      setSelectedUserId(undefined);
      setUserDialogOpen(false);
    } catch (error: any) {
      console.error("Erro ao salvar usuário:", error);
      toast.error(error.message || "Erro ao salvar usuário");
      // Garantir que o dialog possa ser fechado mesmo em caso de erro
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleSubmitAssociation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: existing } = await supabase
        .from("user_companies")
        .select("id")
        .eq("user_id", associationFormData.user_id)
        .eq("company_id", associationFormData.company_id)
        .maybeSingle();

      if (existing) {
        await updateUserCompany({
          id: existing.id,
          max_companies: associationFormData.max_companies,
        });
      } else {
        await createUserCompany({
          user_id: associationFormData.user_id,
          company_id: associationFormData.company_id,
          max_companies: associationFormData.max_companies,
        });
      }
      setAssociationDialogOpen(false);
      setAssociationFormData({ user_id: "", company_id: "", max_companies: 1 });
      // Invalidar query de todas as associações para atualizar a lista
      queryClient.invalidateQueries({ queryKey: ["all_user_companies"] });
      toast.success("Associação criada/atualizada com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao associar usuário à empresa");
    }
  };

  const handleSubmitEstablishment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createEstablishment(establishmentFormData);
      setEstablishmentDialogOpen(false);
      setEstablishmentFormData({ company_id: "", name: "", type: "hotel" });
      toast.success("Estabelecimento criado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar estabelecimento");
    }
  };

  // Filtrar dados baseado na busca
  const filteredCompanies = companies.filter((company: any) =>
    company.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.cnpj?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredUsers = users.filter((user: any) =>
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredEstablishments = establishments.filter((est: any) =>
    est.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    companies.find((c: any) => c.id === est.company_id)?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
              <Shield className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Painel CRM</h1>
              <p className="text-sm text-muted-foreground">Super Admin - Gestão Centralizada</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-6 border-l-4 border-l-blue-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total de Empresas</p>
              <p className="text-3xl font-bold mt-2">{stats.totalCompanies}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.activeCompanies} ativas
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total de Usuários</p>
              <p className="text-3xl font-bold mt-2">{stats.totalUsers}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Usuários cadastrados
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
              <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-purple-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Estabelecimentos</p>
              <p className="text-3xl font-bold mt-2">{stats.totalEstablishments}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.activeEstablishments} ativos
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900/20 flex items-center justify-center">
              <Hotel className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6 border-l-4 border-l-orange-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Associações</p>
              <p className="text-3xl font-bold mt-2">{stats.totalAssociations}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Usuário-Empresa
              </p>
            </div>
            <div className="h-12 w-12 rounded-full bg-orange-100 dark:bg-orange-900/20 flex items-center justify-center">
              <Link2 className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="companies">Empresas</TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="associations">Associações</TabsTrigger>
          <TabsTrigger value="establishments">Estabelecimentos</TabsTrigger>
          <TabsTrigger value="emails">E-mails</TabsTrigger>
          <TabsTrigger value="site">Site</TabsTrigger>
          <TabsTrigger value="stripe">Stripe</TabsTrigger>
        </TabsList>

        {/* Tab: Visão Geral */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Status das Empresas</h3>
                <Activity className="h-5 w-5 text-muted-foreground" />
              </div>
              {stats.totalCompanies > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={companyStatusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={70}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {companyStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-200 flex items-center justify-center text-muted-foreground text-sm">
                  Nenhum dado disponível
                </div>
              )}
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Estabelecimentos por Tipo</h3>
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <XAxis 
                      dataKey="name" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12 }}
                    />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-200 flex items-center justify-center text-muted-foreground text-sm">
                  Nenhum dado disponível
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Empresas Recentes</h3>
              <div className="space-y-3">
                {companies.slice(0, 5).map((company: any) => (
                  <div key={company.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{company.name}</p>
                        <p className="text-xs text-muted-foreground">{company.email || "Sem e-mail"}</p>
                      </div>
                    </div>
                    <Badge variant={company.is_active ? "default" : "secondary"}>
                      {company.is_active ? "Ativa" : "Inativa"}
                    </Badge>
                  </div>
                ))}
                {companies.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma empresa cadastrada</p>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Usuários Recentes</h3>
              <div className="space-y-3">
                {users.slice(0, 5).map((user: any) => (
                  <div key={user.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : "-"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {users.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum usuário cadastrado</p>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Empresas */}
        <TabsContent value="companies" className="space-y-4">
          <Card>
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Empresas</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Gerencie todas as empresas cadastradas no sistema
                </p>
              </div>
              <Button onClick={() => {
                setSelectedCompanyId(undefined);
                setCompanyFormData({ name: "", cnpj: "", email: "", phone: "", address: "" });
                setCompanyDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Nova Empresa
              </Button>
            </div>

            {isLoadingCompanies ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="p-12 text-center">
                <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground font-medium">Nenhuma empresa encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchTerm ? "Tente ajustar os filtros de busca" : "Comece criando sua primeira empresa"}
                </p>
              </div>
            ) : (
              <div className="p-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Contato</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies.map((company: any) => (
                      <TableRow key={company.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{company.name}</p>
                              {company.address && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                  <MapPin className="h-3 w-3" />
                                  {company.address}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{company.cnpj || "-"}</span>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {company.email && (
                              <p className="text-sm flex items-center gap-1">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                {company.email}
                              </p>
                            )}
                            {company.phone && (
                              <p className="text-sm flex items-center gap-1">
                                <Phone className="h-3 w-3 text-muted-foreground" />
                                {company.phone}
                              </p>
                            )}
                            {!company.email && !company.phone && (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={company.is_active ? "default" : "secondary"} className="font-normal">
                            {company.is_active ? "Ativa" : "Inativa"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedCompanyId(company.id);
                                  setCompanyFormData({
                                    name: company.name || "",
                                    cnpj: company.cnpj || "",
                                    email: company.email || "",
                                    phone: company.phone || "",
                                    address: company.address || "",
                                    pms_logo_url: company.pms_logo_url || "",
                                    pms_custom_name: company.pms_custom_name || "",
                                  });
                                  if (company.pms_logo_url) {
                                    setPmsLogoPreview(company.pms_logo_url);
                                  } else {
                                    setPmsLogoPreview("");
                                  }
                                  setPmsLogoFile(null);
                                  setCompanyDialogOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDeleteType("company");
                                  setDeleteId(company.id);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Tab: Usuários */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Usuários</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Gerencie todos os usuários do sistema
                </p>
              </div>
              <Button onClick={() => {
                setSelectedUserId(undefined);
                setUserFormData({ 
                  email: "", 
                  password: "",
                  full_name: "",
                  cpf: "",
                  phone: "",
                  address: "",
                  city: "",
                  state: "",
                  postal_code: "",
                  country: "Brasil",
                  birth_date: "",
                });
                setUserDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Usuário
              </Button>
            </div>

            {isLoadingUsers ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center">
                <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground font-medium">Nenhum usuário encontrado</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchTerm ? "Tente ajustar os filtros de busca" : "Os usuários serão sincronizados automaticamente"}
                </p>
              </div>
            ) : (
              <div className="p-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>CPF</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead>Limite Empresas</TableHead>
                      <TableHead>Limite Estabelecimentos</TableHead>
                      <TableHead>Data de Cadastro</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user: any) => (
                      <TableRow key={user.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{user.full_name || user.email}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{user.cpf || "-"}</span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">{user.phone || "-"}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {allUserLimits.find((ul: any) => ul.user_id === user.id)?.max_companies || 1}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {allUserLimits.find((ul: any) => ul.user_id === user.id)?.max_establishments || 1}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {user.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            }) : "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedUserId(user.id);
                                  // Os limites serão carregados pelo hook useUserLimits
                                  setUserFormData({
                                    email: user.email || "",
                                    password: "",
                                    full_name: (user as any).full_name || "",
                                    cpf: (user as any).cpf || "",
                                    phone: (user as any).phone || "",
                                    address: (user as any).address || "",
                                    city: (user as any).city || "",
                                    state: (user as any).state || "",
                                    postal_code: (user as any).postal_code || "",
                                    country: (user as any).country || "Brasil",
                                    birth_date: (user as any).birth_date || "",
                                    max_companies: 1,
                                    max_establishments: 1,
                                  });
                                  setUserDialogOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDeleteType("user");
                                  setDeleteId(user.id);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Tab: Associações */}
        <TabsContent value="associations" className="space-y-4">
          <Card>
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Associações</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Gerencie as associações entre usuários e empresas
                </p>
              </div>
              <Button onClick={() => {
                setAssociationFormData({ user_id: "", company_id: "", max_companies: 1 });
                setAssociationDialogOpen(true);
              }}>
                <Link2 className="h-4 w-4 mr-2" />
                Nova Associação
              </Button>
            </div>

            <div className="p-6">
              {isLoadingAssociations ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : allUserCompanies && allUserCompanies.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Limite de Empresas</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allUserCompanies.map((uc: any) => (
                      <TableRow key={uc.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{uc.users?.full_name || uc.users?.email || "Usuário não encontrado"}</p>
                              {uc.users?.email && (
                                <p className="text-xs text-muted-foreground">{uc.users.email}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{uc.companies?.name || "-"}</p>
                              {uc.companies?.email && (
                                <p className="text-xs text-muted-foreground">{uc.companies.email}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{uc.max_companies || 1}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={uc.is_active ? "default" : "secondary"} className="font-normal">
                            {uc.is_active ? "Ativa" : "Inativa"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => {
                                  setAssociationFormData({
                                    user_id: uc.user_id,
                                    company_id: uc.company_id,
                                    max_companies: uc.max_companies || 1,
                                  });
                                  setAssociationDialogOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="p-12 text-center">
                  <Link2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                  <p className="text-muted-foreground font-medium">Nenhuma associação encontrada</p>
                  <p className="text-sm text-muted-foreground mt-1">Comece criando uma nova associação</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Tab: Estabelecimentos */}
        <TabsContent value="establishments" className="space-y-4">
          <Card>
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Estabelecimentos</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Gerencie todos os estabelecimentos cadastrados
                </p>
              </div>
              <Button onClick={() => {
                setEstablishmentFormData({ company_id: "", name: "", type: "hotel" });
                setEstablishmentDialogOpen(true);
              }}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Estabelecimento
              </Button>
            </div>

            {isLoadingEstablishments ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredEstablishments.length === 0 ? (
              <div className="p-12 text-center">
                <Hotel className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground font-medium">Nenhum estabelecimento encontrado</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchTerm ? "Tente ajustar os filtros de busca" : "Comece criando seu primeiro estabelecimento"}
                </p>
              </div>
            ) : (
              <div className="p-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Estabelecimento</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEstablishments.map((establishment: any) => (
                      <TableRow key={establishment.id} className="hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Hotel className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-medium">{establishment.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Criado em {establishment.created_at ? new Date(establishment.created_at).toLocaleDateString("pt-BR") : "-"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {establishment.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {companies.find((c: any) => c.id === establishment.company_id)?.name || "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={establishment.is_active ? "default" : "secondary"} className="font-normal">
                            {establishment.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Tab: E-mails */}
        <TabsContent value="emails" className="space-y-6">
          <Tabs defaultValue="templates" className="space-y-4">
            <TabsList>
              <TabsTrigger value="templates">Templates</TabsTrigger>
              <TabsTrigger value="settings">Configurações</TabsTrigger>
              <TabsTrigger value="queue">Fila</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>
            <TabsContent value="templates">
              <EmailTemplatesManager />
            </TabsContent>
            <TabsContent value="settings">
              <EmailSettingsManager />
            </TabsContent>
            <TabsContent value="queue">
              <EmailQueueManager />
            </TabsContent>
            <TabsContent value="logs">
              <EmailLogsManager />
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Tab: Site */}
        <TabsContent value="site">
          <SiteSettingsManager />
        </TabsContent>

        <TabsContent value="stripe">
          <StripeGlobalSettingsTab />
        </TabsContent>
      </Tabs>

      {/* Dialog: Empresa */}
      <Dialog 
        open={companyDialogOpen} 
        onOpenChange={(open) => {
          setCompanyDialogOpen(open);
          if (!open) {
            // Resetar estados quando o dialog for fechado
            setCompanyFormData({ name: "", cnpj: "", email: "", phone: "", address: "", pms_logo_url: "", pms_custom_name: "" });
            setPmsLogoFile(null);
            setPmsLogoPreview("");
            setSelectedCompanyId(undefined);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedCompanyId ? "Editar Empresa" : "Nova Empresa"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitCompany} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="name">Nome da Empresa *</Label>
                <Input
                  id="name"
                  value={companyFormData.name}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, name: e.target.value })}
                  required
                  placeholder="Digite o nome da empresa"
                />
              </div>
              <div>
                <Label htmlFor="cnpj">CNPJ</Label>
                <Input
                  id="cnpj"
                  value={companyFormData.cnpj}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={companyFormData.phone}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={companyFormData.email}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, email: e.target.value })}
                  placeholder="contato@empresa.com"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="address">Endereço</Label>
                <Input
                  id="address"
                  value={companyFormData.address}
                  onChange={(e) => setCompanyFormData({ ...companyFormData, address: e.target.value })}
                  placeholder="Rua, número, bairro, cidade - UF"
                />
              </div>
            </div>

            {/* Seção de Customização do PMS */}
            <div className="border-t pt-4 mt-4">
              <h3 className="text-lg font-semibold mb-4">Customização do PMS</h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="pms_custom_name">Nome Customizado do PMS</Label>
                  <Input
                    id="pms_custom_name"
                    value={companyFormData.pms_custom_name}
                    onChange={(e) => setCompanyFormData({ ...companyFormData, pms_custom_name: e.target.value })}
                    placeholder="Ex: Meu Hotel PMS"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Nome que será exibido no menu lateral do PMS para esta empresa
                  </p>
                </div>

                <div>
                  <Label>Logo do PMS</Label>
                  <div className="mt-2 space-y-2">
                    {pmsLogoPreview && (
                      <div className="relative w-32 h-32 border rounded-lg overflow-hidden bg-white">
                        <img
                          src={pmsLogoPreview}
                          alt="PMS Logo preview"
                          className="w-full h-full object-contain p-2"
                        />
                      </div>
                    )}
                    <div>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handlePmsLogoUpload}
                        className="hidden"
                        id="pms-logo-upload"
                      />
                      <Label
                        htmlFor="pms-logo-upload"
                        className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 border rounded-lg hover:bg-muted"
                      >
                        <Upload className="h-4 w-4" />
                        {pmsLogoPreview ? "Alterar Logo" : "Enviar Logo"}
                      </Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Logo que será exibida no menu lateral do PMS para esta empresa
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setCompanyDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Usuário */}
      <Dialog 
        open={userDialogOpen} 
        onOpenChange={(open) => {
          // Sempre permitir fechar o dialog (mesmo durante o loading)
          setUserDialogOpen(open);
          if (!open) {
            // Limpar formulário ao fechar
            setUserFormData({ 
              email: "", 
              password: "",
              full_name: "",
              cpf: "",
              phone: "",
              address: "",
              city: "",
              state: "",
              postal_code: "",
              country: "Brasil",
              birth_date: "",
              max_companies: 1,
              max_establishments: 1,
            });
            setSelectedUserId(undefined);
            setIsSubmittingUser(false);
          }
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedUserId ? "Editar Usuário" : "Novo Usuário"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitUser} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Label htmlFor="user_email">E-mail *</Label>
                <Input
                  id="user_email"
                  type="email"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                  required
                  placeholder="usuario@exemplo.com"
                />
              </div>
              <div>
                <Label htmlFor="user_password">
                  Senha {selectedUserId ? "(deixe em branco para manter)" : "*"}
                </Label>
                <Input
                  id="user_password"
                  type="password"
                  value={userFormData.password}
                  onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                  required={!selectedUserId}
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="user_full_name">Nome Completo</Label>
                <Input
                  id="user_full_name"
                  value={userFormData.full_name}
                  onChange={(e) => setUserFormData({ ...userFormData, full_name: e.target.value })}
                  placeholder="Digite o nome completo"
                />
              </div>
              <div>
                <Label htmlFor="user_cpf">CPF</Label>
                <Input
                  id="user_cpf"
                  value={userFormData.cpf}
                  onChange={(e) => setUserFormData({ ...userFormData, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <Label htmlFor="user_phone">Telefone</Label>
                <Input
                  id="user_phone"
                  value={userFormData.phone}
                  onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div>
                <Label htmlFor="user_birth_date">Data de Nascimento</Label>
                <Input
                  id="user_birth_date"
                  type="date"
                  value={userFormData.birth_date}
                  onChange={(e) => setUserFormData({ ...userFormData, birth_date: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="user_address">Endereço</Label>
                <Input
                  id="user_address"
                  value={userFormData.address}
                  onChange={(e) => setUserFormData({ ...userFormData, address: e.target.value })}
                  placeholder="Rua, número, complemento"
                />
              </div>
              <div>
                <Label htmlFor="user_city">Cidade</Label>
                <Input
                  id="user_city"
                  value={userFormData.city}
                  onChange={(e) => setUserFormData({ ...userFormData, city: e.target.value })}
                  placeholder="Cidade"
                />
              </div>
              <div>
                <Label htmlFor="user_state">Estado</Label>
                <Input
                  id="user_state"
                  value={userFormData.state}
                  onChange={(e) => setUserFormData({ ...userFormData, state: e.target.value })}
                  placeholder="UF"
                />
              </div>
              <div>
                <Label htmlFor="user_postal_code">CEP</Label>
                <Input
                  id="user_postal_code"
                  value={userFormData.postal_code}
                  onChange={(e) => setUserFormData({ ...userFormData, postal_code: e.target.value })}
                  placeholder="00000-000"
                />
              </div>
              <div>
                <Label htmlFor="user_country">País</Label>
                <Input
                  id="user_country"
                  value={userFormData.country}
                  onChange={(e) => setUserFormData({ ...userFormData, country: e.target.value })}
                  placeholder="País"
                />
              </div>
            </div>
            
            {/* Seção de Limites */}
            <div className="pt-4 border-t">
              <h3 className="text-lg font-semibold mb-4">Limites do PMS</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="max_companies">Máximo de Empresas</Label>
                  <Input
                    id="max_companies"
                    type="number"
                    min="1"
                    value={userFormData.max_companies}
                    onChange={(e) => setUserFormData({ ...userFormData, max_companies: parseInt(e.target.value) || 1 })}
                    placeholder="1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Quantidade máxima de empresas que este usuário pode criar
                  </p>
                </div>
                <div>
                  <Label htmlFor="max_establishments">Máximo de Estabelecimentos</Label>
                  <Input
                    id="max_establishments"
                    type="number"
                    min="1"
                    value={userFormData.max_establishments}
                    onChange={(e) => setUserFormData({ ...userFormData, max_establishments: parseInt(e.target.value) || 1 })}
                    placeholder="1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Quantidade máxima de estabelecimentos que este usuário pode criar por empresa
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setUserDialogOpen(false);
                  setUserFormData({ 
                    email: "", 
                    password: "",
                    full_name: "",
                    cpf: "",
                    phone: "",
                    address: "",
                    city: "",
                    state: "",
                    postal_code: "",
                    country: "Brasil",
                    birth_date: "",
                    max_companies: 1,
                    max_establishments: 1,
                  });
                  setSelectedUserId(undefined);
                  setIsSubmittingUser(false);
                }}
                disabled={isSubmittingUser}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmittingUser}>
                {isSubmittingUser ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Associação */}
      <Dialog open={associationDialogOpen} onOpenChange={setAssociationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Associar Usuário à Empresa</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitAssociation} className="space-y-4">
            <div>
              <Label htmlFor="association_user">Usuário *</Label>
              <Select
                value={associationFormData.user_id}
                onValueChange={(value) => setAssociationFormData({ ...associationFormData, user_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user: any) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="association_company">Empresa *</Label>
              <Select
                value={associationFormData.company_id}
                onValueChange={(value) => setAssociationFormData({ ...associationFormData, company_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company: any) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="max_companies">Máximo de Empresas</Label>
              <Input
                id="max_companies"
                type="number"
                min="1"
                value={associationFormData.max_companies}
                onChange={(e) => setAssociationFormData({ ...associationFormData, max_companies: parseInt(e.target.value) || 1 })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Quantidade máxima de empresas que este usuário pode gerenciar
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setAssociationDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Estabelecimento */}
      <Dialog open={establishmentDialogOpen} onOpenChange={setEstablishmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Estabelecimento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitEstablishment} className="space-y-4">
            <div>
              <Label htmlFor="establishment_company">Empresa *</Label>
              <Select
                value={establishmentFormData.company_id}
                onValueChange={(value) => setEstablishmentFormData({ ...establishmentFormData, company_id: value })}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company: any) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="establishment_name">Nome do Estabelecimento *</Label>
              <Input
                id="establishment_name"
                value={establishmentFormData.name}
                onChange={(e) => setEstablishmentFormData({ ...establishmentFormData, name: e.target.value })}
                required
                placeholder="Ex: Hotel Central, Apartamento Praia"
              />
            </div>
            <div>
              <Label htmlFor="establishment_type">Tipo *</Label>
              <Select
                value={establishmentFormData.type}
                onValueChange={(value) => setEstablishmentFormData({ ...establishmentFormData, type: value })}
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
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setEstablishmentDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Criar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog: Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este {deleteType === "company" ? "empresa" : "usuário"}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteId) return;
                try {
                  if (deleteType === "company") {
                    await deleteCompany(deleteId);
                  } else {
                    await deleteUser(deleteId);
                  }
                  setDeleteDialogOpen(false);
                  setDeleteId(null);
                } catch (error) {
                  console.error(error);
                }
              }}
              className="bg-destructive text-destructive-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Componente de Configuração Global do Stripe
const StripeGlobalSettingsTab = () => {
  const { globalConfig, isLoadingGlobalConfig, isStripeEnabled } = useStripe();
  const [configDialogOpen, setConfigDialogOpen] = useState(false);

  if (isLoadingGlobalConfig) {
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
              Configuração Global do Stripe
            </h3>
            <p className="text-sm text-muted-foreground">
              Ative a integração Stripe globalmente para que os estabelecimentos possam configurar suas contas
            </p>
          </div>
          <Button onClick={() => setConfigDialogOpen(true)}>
            <CreditCard className="w-4 h-4 mr-2" />
            {globalConfig?.is_enabled ? "Editar Configuração" : "Configurar Stripe"}
          </Button>
        </div>

        {globalConfig && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="font-medium">Status Global</span>
              <Badge variant={globalConfig.is_enabled ? "default" : "secondary"}>
                {globalConfig.is_enabled ? "Ativado" : "Desativado"}
              </Badge>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <span className="font-medium">Modo</span>
              <Badge variant={globalConfig.test_mode ? "outline" : "default"}>
                {globalConfig.test_mode ? "Teste" : "Produção"}
              </Badge>
            </div>

            {globalConfig.test_mode && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Modo de Teste Ativo:</strong> Use as chaves de teste do Stripe. 
                  Para produção, altere para modo de produção e configure as chaves de produção.
                </p>
              </div>
            )}

            {!globalConfig.test_mode && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  <strong>Modo de Produção Ativo:</strong> Certifique-se de que as chaves de produção estão configuradas corretamente.
                </p>
              </div>
            )}
          </div>
        )}

        <StripeGlobalConfigDialog
          open={configDialogOpen}
          onOpenChange={setConfigDialogOpen}
        />
      </div>
    </Card>
  );
};

export default SuperAdmin;
