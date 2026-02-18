import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient, useQuery } from "@tanstack/react-query";
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
  Globe,
  Eye,
  ChevronDown,
  ChevronRight,
  Terminal,
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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invalidateLogConfigCache } from "@/lib/logger";
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
import { slugFromName } from "@/lib/slugUtils";
import { useSlugValidation } from "@/hooks/useSlugValidation";
import { StripeGlobalConfigDialog } from "@/components/stripe/StripeGlobalConfigDialog";
import { useStripe } from "@/hooks/useStripe";
import { CreditCard, Settings, Zap, Key, Star, Map as MapIcon, LayoutTemplate } from "lucide-react";

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
    pms_base_url: "",
  });
  const [consoleLogsEnabled, setConsoleLogsEnabled] = useState<boolean>(true);
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
        pms_base_url: settings.pms_base_url || "",
      });
      setConsoleLogsEnabled(settings.console_logs_enabled ?? true);
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
        console_logs_enabled: consoleLogsEnabled,
        pms_base_url: formData.pms_base_url || null,
      });

      setFaviconFile(null);
      setLogoFile(null);
      setOgImageFile(null);
      
      // Invalidar cache do logger para aplicar a nova configuração imediatamente
      await invalidateLogConfigCache();
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
          
          {/* Aviso sobre cache */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Importante:</strong> Após alterar as configurações, as redes sociais podem levar alguns minutos para atualizar o cache. 
              Use ferramentas como{" "}
              <a 
                href="https://developers.facebook.com/tools/debug/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                Facebook Debugger
              </a>
              {" "}ou{" "}
              <a 
                href="https://cards-dev.twitter.com/validator" 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline font-medium"
              >
                Twitter Card Validator
              </a>
              {" "}para forçar a atualização.
            </p>
          </div>
          
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
              <p className="text-xs text-muted-foreground mt-1">
                Recomendado: 60-90 caracteres
              </p>
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
              <p className="text-xs text-muted-foreground mt-1">
                Recomendado: 150-200 caracteres
              </p>
            </div>

            <div>
              <Label>Imagem OG *</Label>
              <p className="text-sm text-muted-foreground mb-2">
                Imagem exibida ao compartilhar (recomendado: 1200x630px, formato PNG ou JPG)
              </p>
              <p className="text-xs text-amber-600 mb-2">
                ⚠️ A imagem deve ser uma URL absoluta (não data URL). Use o upload para garantir que funcione corretamente.
              </p>
              <div className="space-y-2">
                {ogImagePreview && (
                  <div className="relative w-64 h-32 border rounded-lg overflow-hidden bg-gray-100">
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
                    accept="image/png,image/jpeg,image/jpg,image/webp"
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
                {ogImagePreview && ogImagePreview.startsWith("data:") && (
                  <p className="text-xs text-red-600">
                    ⚠️ Data URL detectada. Faça upload da imagem para obter uma URL absoluta que funcione com Open Graph.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* URL Base do PMS */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <Label className="text-base font-semibold">URL Base do PMS</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            URL base do sistema PMS usada para gerar links de check-in online e políticas nos emails.
            Esta URL é diferente da URL do site do estabelecimento, que pode variar por estabelecimento.
          </p>
          <div className="space-y-2">
            <div>
              <Label htmlFor="pms_base_url">URL Base do PMS</Label>
              <Input
                id="pms_base_url"
                type="url"
                value={formData.pms_base_url}
                onChange={(e) => setFormData({ ...formData, pms_base_url: e.target.value })}
                placeholder="https://pms.exemplo.com"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Exemplo: https://pms.exemplo.com ou https://app.seudominio.com
              </p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Importante:</strong> Esta URL será usada para gerar links de check-in online e políticas do hotel nos emails.
                Certifique-se de que a URL está correta e acessível publicamente. Se não configurada, o sistema tentará detectar automaticamente.
              </p>
            </div>
          </div>
        </div>

        {/* Controle de Logs do Console */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            <Label className="text-base font-semibold">Logs do Console</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Controla se os logs do console (console.log, console.warn, console.info, console.debug) são exibidos no navegador.
            Quando desativado, todos os logs são suprimidos para melhorar o desempenho e reduzir o ruído no console.
          </p>
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="space-y-0.5">
              <Label htmlFor="console-logs-enabled" className="text-base font-medium">
                Habilitar Logs do Console
              </Label>
              <p className="text-sm text-muted-foreground">
                {consoleLogsEnabled 
                  ? "Os logs do console estão ativos e serão exibidos no navegador" 
                  : "Os logs do console estão desativados e serão suprimidos"}
              </p>
            </div>
            <Switch
              id="console-logs-enabled"
              checked={consoleLogsEnabled}
              onCheckedChange={setConsoleLogsEnabled}
            />
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Nota:</strong> Esta configuração afeta apenas os logs do console do navegador. 
              Os logs de erro críticos (console.error) continuarão sendo exibidos mesmo quando desativado, 
              para garantir que problemas importantes sejam visíveis.
            </p>
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
  const { establishments, isLoading: isLoadingEstablishments, createEstablishment, updateEstablishment, deleteEstablishment } = useEstablishments();
  const { allUserLimits } = useAllUserLimits();
  const { settings: siteSettings } = useSiteSettings();
  
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [associationDialogOpen, setAssociationDialogOpen] = useState(false);
  const [establishmentDialogOpen, setEstablishmentDialogOpen] = useState(false);
  
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>();
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>();
  
  // Hook que depende de selectedUserId deve vir depois da declaração
  const { userLimit, createOrUpdateUserLimit } = useUserLimits(selectedUserId);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<"company" | "user" | "establishment">("company");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedEstablishmentForEdit, setSelectedEstablishmentForEdit] = useState<any>(null);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  
  const [userDetailsDialogOpen, setUserDetailsDialogOpen] = useState(false);
  const [selectedUserDetails, setSelectedUserDetails] = useState<any>(null);
  
  const toggleCompany = (companyId: string) => {
    setExpandedCompanies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(companyId)) {
        newSet.delete(companyId);
      } else {
        newSet.add(companyId);
      }
      return newSet;
    });
  };
  
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
    slug: "",
    type: "hotel",
  });
  const establishmentSlugValidation = useSlugValidation({
    entityType: "establishment",
    slug: establishmentFormData.slug,
    excludeId: selectedEstablishmentForEdit?.id ?? null,
  });

  // Buscar todas as associações de usuários e empresas
  const { allUserCompanies, isLoading: isLoadingAssociations } = useAllUserCompanies();
  
  // Buscar todos os funcionários (employees) com seus roles e estabelecimentos
  const { data: allEmployees, isLoading: isLoadingEmployees } = useQuery({
    queryKey: ["all_employees_with_roles"],
    queryFn: async () => {
      const { data: employees, error } = await supabase
        .from("employees")
        .select(`
          id,
          user_id,
          establishment_id,
          role_id,
          is_active,
          employee_roles (
            id,
            name,
            code,
            description
          ),
          establishments (
            id,
            name,
            company_id,
            companies (
              id,
              name
            )
          )
        `)
        .eq("is_active", true);

      if (error) {
        console.error("Erro ao buscar funcionários:", error);
        return [];
      }

      if (!employees || employees.length === 0) return [];

      // Buscar dados dos usuários separadamente
      const userIds = [...new Set(employees.map((emp: any) => emp.user_id).filter(Boolean))];
      
      let usersMap: Record<string, any> = {};
      
      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from("users")
          .select("id, email, full_name, cpf, phone")
          .in("id", userIds);

        if (usersError) {
          console.error("Erro ao buscar usuários:", usersError);
        } else if (usersData) {
          usersData.forEach((user: any) => {
            usersMap[user.id] = user;
          });
        }
      }

      // Combinar dados dos funcionários com dados dos usuários
      return employees.map((emp: any) => ({
        ...emp,
        users: usersMap[emp.user_id] || null,
      }));
    },
  });

  // Buscar gerentes de cada estabelecimento
  const managersByEstablishment = useMemo(() => {
    if (!allEmployees) return {};

    const managers = allEmployees.filter((emp: any) => 
      emp.employee_roles?.code === "manager"
    );

    const managersMap: Record<string, any> = {};
    managers.forEach((manager: any) => {
      if (manager.establishment_id) {
        managersMap[manager.establishment_id] = manager;
      }
    });

    return managersMap;
  }, [allEmployees]);

  // Buscar super admins da tabela admin_users
  const { data: superAdmins } = useQuery({
    queryKey: ["super_admins"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("is_super_admin", true);

      if (error) {
        console.error("Erro ao buscar super admins:", error);
        return [];
      }

      return (data || []).map((admin: any) => admin.user_id);
    },
  });

  // Filtrar usuários que são gerentes ou super admins
  const managersAndSuperAdmins = useMemo(() => {
    if (!users || !allEmployees) return [];

    // Buscar user_ids que são gerentes
    const managerUserIds = new Set(
      allEmployees
        .filter((emp: any) => emp.employee_roles?.code === "manager")
        .map((emp: any) => emp.user_id)
    );

    // Buscar user_ids que são super admins
    const superAdminUserIds = new Set(superAdmins || []);

    return users.filter((user: any) => {
      // Verificar se é gerente
      if (managerUserIds.has(user.id)) return true;
      
      // Verificar se é super admin
      if (superAdminUserIds.has(user.id)) return true;

      return false;
    });
  }, [users, allEmployees, superAdmins]);

  // Listar super admins com dados completos
  const superAdminsList = useMemo(() => {
    if (!users || !superAdmins || superAdmins.length === 0) return [];

    const superAdminUserIds = new Set(superAdmins || []);
    const usersMap = new Map(users.map((u: any) => [u.id, u]));

    return Array.from(superAdminUserIds)
      .map((userId) => {
        const user = usersMap.get(userId);
        if (!user) return null;

        // Buscar funcionários deste usuário
        const userEmployees = (allEmployees || []).filter(
          (emp: any) => emp.user_id === userId
        );

        return {
          user,
          employees: userEmployees,
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) =>
        (a.user.full_name || a.user.email || "").localeCompare(
          b.user.full_name || b.user.email || ""
        )
      );
  }, [users, superAdmins, allEmployees]);

  // Agrupar usuários por empresa (excluindo super admins)
  const usersByCompany = useMemo(() => {
    if (!companies || !allUserCompanies || !users || !allEmployees) return [];

    // Buscar user_ids que são super admins (para excluir)
    const superAdminUserIds = new Set(superAdmins || []);

    // Buscar user_ids que são gerentes
    const managerUserIds = new Set(
      allEmployees
        .filter((emp: any) => emp.employee_roles?.code === "manager")
        .map((emp: any) => emp.user_id)
    );

    // Criar mapa de usuários por ID para acesso rápido
    const usersMap = new Map(users.map((u: any) => [u.id, u]));

    // Agrupar associações por empresa
    const companyMap = new Map<string, {
      company: any;
      users: Array<{
        user: any;
        userCompany: any;
        isManager: boolean;
        employees: any[];
      }>;
    }>();

    companies.forEach((company: any) => {
      // Buscar associações desta empresa
      const companyAssociations = allUserCompanies.filter(
        (uc: any) => uc.company_id === company.id && uc.is_active !== false
      );

      if (companyAssociations.length === 0) return;

      const companyUsers: Array<{
        user: any;
        userCompany: any;
        isManager: boolean;
        employees: any[];
      }> = [];

      companyAssociations.forEach((uc: any) => {
        const userId = uc.user_id;
        
        // Excluir super admins
        if (superAdminUserIds.has(userId)) return;

        const user = usersMap.get(userId);
        if (!user) return;

        // Verificar se é gerente
        const userEmployees = (allEmployees || []).filter(
          (emp: any) => emp.user_id === userId
        );
        const isManager = userEmployees.some(
          (emp: any) => emp.employee_roles?.code === "manager"
        );

        companyUsers.push({
          user,
          userCompany: uc,
          isManager,
          employees: userEmployees,
        });
      });

      if (companyUsers.length > 0) {
        companyMap.set(company.id, {
          company,
          users: companyUsers.sort((a, b) => {
            // Gerentes primeiro
            if (a.isManager && !b.isManager) return -1;
            if (!a.isManager && b.isManager) return 1;
            // Depois por nome
            return (a.user.full_name || a.user.email || "").localeCompare(
              b.user.full_name || b.user.email || ""
            );
          }),
        });
      }
    });

    return Array.from(companyMap.values()).sort((a, b) =>
      (a.company.name || "").localeCompare(b.company.name || "")
    );
  }, [companies, allUserCompanies, users, allEmployees, superAdmins]);
  
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
    if (establishmentFormData.slug?.trim() && establishmentSlugValidation.isDuplicate) {
      toast.error("Esta URL amigável já está em uso. Escolha outra.");
      return;
    }
    try {
      if (selectedEstablishmentForEdit) {
        await updateEstablishment({
          id: selectedEstablishmentForEdit.id,
          ...establishmentFormData,
        });
        toast.success("Estabelecimento atualizado com sucesso!");
      } else {
      await createEstablishment(establishmentFormData);
        toast.success("Estabelecimento criado com sucesso!");
      }
      setEstablishmentDialogOpen(false);
      setEstablishmentFormData({ company_id: "", name: "", slug: "", type: "hotel" });
      setSelectedEstablishmentForEdit(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar estabelecimento");
    }
  };

  // Função helper para normalizar busca (remove acentos e converte para minúsculas)
  const normalizeSearch = (text: string) => {
    return text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  };

  // Função helper para verificar se um texto corresponde ao termo de busca
  const matchesSearch = (text: string | null | undefined, searchTerm: string): boolean => {
    if (!text || !searchTerm) return !searchTerm;
    return normalizeSearch(text).includes(normalizeSearch(searchTerm));
  };

  // Filtrar dados baseado na busca (busca mais abrangente)
  const filteredCompanies = companies.filter((company: any) => {
    if (!searchTerm) return true;
    return (
      matchesSearch(company.name, searchTerm) ||
      matchesSearch(company.email, searchTerm) ||
      matchesSearch(company.cnpj, searchTerm) ||
      matchesSearch(company.phone, searchTerm) ||
      matchesSearch(company.address, searchTerm)
    );
  });

  // Filtrar usuários gerentes e super admins (busca mais abrangente)
  const filteredManagersAndAdmins = managersAndSuperAdmins.filter((user: any) => {
    if (!searchTerm) return true;
    return (
      matchesSearch(user.email, searchTerm) ||
      matchesSearch(user.full_name, searchTerm) ||
      matchesSearch(user.cpf, searchTerm) ||
      matchesSearch(user.phone, searchTerm)
    );
  });

  // Agrupar funcionários por user_id e filtrar (não gerentes)
  const groupedEmployees = useMemo(() => {
    if (!allEmployees) return [];
    
    // Filtrar funcionários (excluir gerentes)
    const employees = allEmployees.filter((emp: any) => {
      const roleCode = emp.employee_roles?.code;
      // Excluir gerentes
      if (roleCode === "manager") return false;
      
      // Filtrar por termo de busca (busca mais abrangente)
      if (!searchTerm) return true;
      return (
        matchesSearch(emp.users?.email, searchTerm) ||
        matchesSearch(emp.users?.full_name, searchTerm) ||
        matchesSearch(emp.users?.cpf, searchTerm) ||
        matchesSearch(emp.users?.phone, searchTerm) ||
        matchesSearch(emp.establishments?.name, searchTerm) ||
        matchesSearch(emp.employee_roles?.name, searchTerm)
      );
    });

    // Agrupar por user_id
    const grouped: Record<string, any> = {};
    
    employees.forEach((emp: any) => {
      const userId = emp.user_id;
      if (!userId) return;
      
      if (!grouped[userId]) {
        grouped[userId] = {
          user: emp.users,
          user_id: userId,
          establishments: [],
          roles: new Set(),
        };
      }
      
      // Adicionar estabelecimento
      grouped[userId].establishments.push({
        id: emp.id,
        establishment: emp.establishments,
        role: emp.employee_roles,
        is_active: emp.is_active,
        establishment_id: emp.establishment_id,
      });
      
      // Adicionar cargo ao conjunto de cargos
      if (emp.employee_roles?.name) {
        grouped[userId].roles.add(emp.employee_roles.name);
      }
    });
    
    // Converter Set para Array
    return Object.values(grouped).map((item: any) => ({
      ...item,
      roles: Array.from(item.roles),
    }));
  }, [allEmployees, searchTerm]);

  const filteredEstablishments = establishments.filter((est: any) => {
    if (!searchTerm) return true;
    const company = companies.find((c: any) => c.id === est.company_id);
    return (
      matchesSearch(est.name, searchTerm) ||
      matchesSearch(company?.name, searchTerm) ||
      matchesSearch(est.type, searchTerm)
    );
  });

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
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="companies">Empresas</TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="associations">Associações</TabsTrigger>
          <TabsTrigger value="establishments">Estabelecimentos</TabsTrigger>
          <TabsTrigger value="emails">E-mails</TabsTrigger>
          <TabsTrigger value="site">Site</TabsTrigger>
          <TabsTrigger value="features">Funcionalidades</TabsTrigger>
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
          <Tabs defaultValue="managers" className="space-y-4">
            <TabsList>
              <TabsTrigger value="managers">Gerentes e Usuários</TabsTrigger>
              <TabsTrigger value="superAdmins">Super Admins</TabsTrigger>
            </TabsList>

            {/* Tab: Gerentes e Super Admins */}
            <TabsContent value="managers" className="space-y-4">
              <Card>
                <div className="p-6 border-b flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold">Gerentes e Usuários</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Gerencie os gerentes e usuários organizados por empresa
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

                {/* Campo de busca */}
                <div className="p-6 border-b">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por empresa, nome ou email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {isLoadingUsers || isLoadingEmployees || isLoadingAssociations ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : usersByCompany.length === 0 ? (
                    <div className="p-12 text-center">
                    <Building2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground font-medium">Nenhuma empresa com usuários encontrada</p>
                      <p className="text-sm text-muted-foreground mt-1">
                      {searchTerm ? "Tente ajustar os filtros de busca" : "Os usuários serão exibidos quando associados a empresas"}
                      </p>
                    </div>
                  ) : (
                  <div className="p-6 space-y-3">
                    {usersByCompany
                      .map((companyData) => {
                        // Filtrar usuários individualmente quando há busca
                        const filteredUsers = searchTerm
                          ? companyData.users.filter((u) => {
                              const searchLower = normalizeSearch(searchTerm);
                              return (
                                matchesSearch(companyData.company.name, searchTerm) ||
                                matchesSearch(u.user.email, searchTerm) ||
                                matchesSearch(u.user.full_name, searchTerm) ||
                                matchesSearch(u.user.cpf, searchTerm) ||
                                matchesSearch(u.user.phone, searchTerm)
                              );
                            })
                          : companyData.users;

                        // Se não há usuários filtrados e há busca, não mostrar a empresa
                        if (searchTerm && filteredUsers.length === 0) {
                          return null;
                        }

                        // Se há busca mas a empresa não corresponde, expandir automaticamente
                        const shouldAutoExpand = searchTerm && filteredUsers.length > 0;
                        const isExpanded = shouldAutoExpand || expandedCompanies.has(companyData.company.id);
                        
                        const managersCount = filteredUsers.filter((u) => u.isManager).length;
                        const usersCount = filteredUsers.filter((u) => !u.isManager).length;
                        
                        // Verificar se a empresa corresponde à busca
                        const companyMatches = searchTerm
                          ? matchesSearch(companyData.company.name, searchTerm)
                          : false;

                        return (
                          <Card 
                            key={companyData.company.id} 
                            className={`overflow-hidden ${searchTerm && (companyMatches || filteredUsers.length > 0) ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
                          >
                            <div 
                              className="p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                              onClick={() => toggleCompany(companyData.company.id)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3 flex-1">
                                  {isExpanded ? (
                                    <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                                  )}
                                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${companyMatches ? "bg-primary/20" : "bg-primary/10"}`}>
                                    <Building2 className={`h-5 w-5 ${companyMatches ? "text-primary" : "text-primary"}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className={`font-semibold text-base truncate ${companyMatches ? "text-primary" : ""}`}>
                                      {companyMatches && searchTerm ? (
                                        <span>
                                          {companyData.company.name.split(new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, i) => 
                                            matchesSearch(part, searchTerm) ? (
                                              <mark key={i} className="bg-primary/20 text-primary font-semibold px-1 rounded">
                                                {part}
                                              </mark>
                                            ) : (
                                              <span key={i}>{part}</span>
                                            )
                                          )}
                                        </span>
                                      ) : (
                                        companyData.company.name
                                      )}
                                    </h3>
                                    <div className="flex items-center gap-3 mt-1">
                                      <p className="text-xs text-muted-foreground truncate">
                                        {companyData.company.cnpj || companyData.company.email || "Sem informações"}
                                      </p>
                                      <span className="text-xs text-muted-foreground">•</span>
                                      <div className="flex items-center gap-2 text-xs">
                                        {managersCount > 0 && (
                                          <Badge variant="outline" className="text-xs py-0 px-1.5 h-5">
                                            {managersCount} {managersCount === 1 ? "gerente" : "gerentes"}
                                          </Badge>
                                        )}
                                        {usersCount > 0 && (
                                          <Badge variant="secondary" className="text-xs py-0 px-1.5 h-5">
                                            {usersCount} {usersCount === 1 ? "usuário" : "usuários"}
                                          </Badge>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                                <Badge variant="outline" className="text-sm flex-shrink-0 ml-2">
                                  {filteredUsers.length} {filteredUsers.length === 1 ? "total" : "totais"}
                                  {searchTerm && filteredUsers.length < companyData.users.length && (
                                    <span className="ml-1 text-xs opacity-70">
                                      (de {companyData.users.length})
                                    </span>
                                  )}
                                </Badge>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="border-t p-4 bg-muted/20">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Usuário</TableHead>
                            <TableHead>CPF</TableHead>
                            <TableHead>Telefone</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Limite Empresas</TableHead>
                            <TableHead>Limite Estabelecimentos</TableHead>
                            <TableHead>Data de Cadastro</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                                    {filteredUsers.map(({ user, userCompany, isManager, employees }) => {
                            // Verificar se o usuário corresponde à busca
                            const userMatches = searchTerm && (
                              matchesSearch(user.email, searchTerm) ||
                              matchesSearch(user.full_name, searchTerm) ||
                              matchesSearch(user.cpf, searchTerm) ||
                              matchesSearch(user.phone, searchTerm)
                            );

                            // Função helper para destacar texto
                            const highlightText = (text: string | null | undefined) => {
                              if (!text || !searchTerm || !userMatches) return text;
                              const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                              const parts = text.split(regex);
                              return parts.map((part, i) => 
                                matchesSearch(part, searchTerm) ? (
                                  <mark key={i} className="bg-primary/20 text-primary font-semibold px-1 rounded">
                                    {part}
                                  </mark>
                                ) : (
                                  <span key={i}>{part}</span>
                                )
                              );
                            };

                            return (
                              <TableRow 
                                key={user.id} 
                                className={`hover:bg-muted/50 ${userMatches ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${userMatches ? "bg-primary/20" : "bg-primary/10"}`}>
                                      <Users className={`h-5 w-5 ${userMatches ? "text-primary" : "text-primary"}`} />
                                    </div>
                                    <div>
                                      <p className={`font-medium ${userMatches ? "text-primary" : ""}`}>
                                        {highlightText(user.full_name || user.email)}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {highlightText(user.email)}
                                      </p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm">
                                    {user.cpf ? highlightText(user.cpf) : "-"}
                                  </span>
                                </TableCell>
                                <TableCell>
                                  <span className="text-sm">
                                    {user.phone ? highlightText(user.phone) : "-"}
                                  </span>
                                </TableCell>
                                <TableCell>
                                            {isManager ? (
                                              <Badge variant="outline" className="border-blue-500 text-blue-700">
                                      <Shield className="h-3 w-3 mr-1" />
                                      Gerente
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">Usuário</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">
                                              {allUserLimits.find((ul: any) => ul.user_id === user.id)?.max_companies || userCompany.max_companies || 1}
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
                                  <div className="flex items-center justify-end gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedUserDetails({
                                          user,
                                                    employees,
                                        });
                                        setUserDetailsDialogOpen(true);
                                      }}
                                      title="Ver detalhes"
                                    >
                                      <Eye className="h-4 w-4" />
                                    </Button>
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
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                              </div>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </TabsContent>

              {/* Tab: Super Admins */}
              <TabsContent value="superAdmins" className="space-y-4">
                <Card>
                  <div className="p-6 border-b flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold">Super Administradores</h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Gerencie os super administradores do sistema
                      </p>
                    </div>
                  </div>

                  {/* Campo de busca */}
                  <div className="p-6 border-b">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nome ou email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {isLoadingUsers ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : superAdminsList.length === 0 ? (
                    <div className="p-12 text-center">
                      <Shield className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
                      <p className="text-muted-foreground font-medium">Nenhum super admin encontrado</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {searchTerm ? "Tente ajustar os filtros de busca" : "Não há super administradores cadastrados"}
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
                            <TableHead>Tipo</TableHead>
                            <TableHead>Limite Empresas</TableHead>
                            <TableHead>Limite Estabelecimentos</TableHead>
                            <TableHead>Data de Cadastro</TableHead>
                            <TableHead className="text-right">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {superAdminsList
                            .filter((item: any) => {
                              if (!searchTerm) return true;
                              const searchLower = searchTerm.toLowerCase();
                              return (
                                item.user.email?.toLowerCase().includes(searchLower) ||
                                item.user.full_name?.toLowerCase().includes(searchLower)
                              );
                            })
                            .map((item: any) => {
                              const { user, employees } = item;
                            return (
                                <TableRow key={user.id} className="hover:bg-muted/50">
                                <TableCell>
                                  <div className="flex items-center gap-3">
                                      <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                                        <Shield className="h-5 w-5 text-purple-600" />
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
                                    <Badge variant="default" className="bg-purple-600">
                                        <Shield className="h-3 w-3 mr-1" />
                                      Super Admin
                                      </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline">
                                      {allUserLimits.find((ul: any) => ul.user_id === user.id)?.max_companies || "Ilimitado"}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline">
                                      {allUserLimits.find((ul: any) => ul.user_id === user.id)?.max_establishments || "Ilimitado"}
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
                                    <div className="flex items-center justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedUserDetails({
                                            user,
                                            employees,
                                      });
                                      setUserDetailsDialogOpen(true);
                                    }}
                                    title="Ver detalhes"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
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
                                    </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </Card>
              </TabsContent>
            </Tabs>
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
                setSelectedEstablishmentForEdit(null);
                setEstablishmentFormData({ company_id: "", name: "", slug: "", type: "hotel" });
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
                      <TableHead className="text-right">Ações</TableHead>
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
                                  setSelectedEstablishmentForEdit(establishment);
                                  setEstablishmentFormData({
                                    company_id: establishment.company_id,
                                    name: establishment.name,
                                    slug: establishment.slug ?? "",
                                    type: establishment.type,
                                  });
                                  setEstablishmentDialogOpen(true);
                                }}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    await updateEstablishment({
                                      id: establishment.id,
                                      is_active: !establishment.is_active,
                                    });
                                    toast.success(
                                      establishment.is_active
                                        ? "Estabelecimento ocultado com sucesso!"
                                        : "Estabelecimento exibido com sucesso!"
                                    );
                                  } catch (error: any) {
                                    toast.error(error.message || "Erro ao atualizar estabelecimento");
                                  }
                                }}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                {establishment.is_active ? "Ocultar" : "Exibir"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDeleteType("establishment");
                                  setDeleteId(establishment.id);
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

        {/* Tab: Funcionalidades */}
        <TabsContent value="features">
          <FeatureFlagsManager />
        </TabsContent>

        {/* Tab: Stripe */}
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
      <Dialog 
        open={establishmentDialogOpen} 
        onOpenChange={(open) => {
          setEstablishmentDialogOpen(open);
          if (!open) {
            setSelectedEstablishmentForEdit(null);
            setEstablishmentFormData({ company_id: "", name: "", slug: "", type: "hotel" });
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedEstablishmentForEdit ? "Editar Estabelecimento" : "Novo Estabelecimento"}</DialogTitle>
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
              <Label htmlFor="establishment_slug">URL amigável (slug)</Label>
              <div className="flex gap-2">
                <Input
                  id="establishment_slug"
                  value={establishmentFormData.slug}
                  onChange={(e) => setEstablishmentFormData({ ...establishmentFormData, slug: e.target.value })}
                  placeholder="ex: meu-hotel"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEstablishmentFormData((prev) => ({ ...prev, slug: slugFromName(prev.name || "") }))}
                >
                  Gerar do nome
                </Button>
              </div>
              {establishmentFormData.slug && (
                <p className="text-xs text-muted-foreground mt-1">
                  {establishmentSlugValidation.isLoading ? "Verificando..." : establishmentSlugValidation.isDuplicate ? "Esta URL já está em uso." : "URL disponível."}
                </p>
              )}
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

      {/* Dialog: Detalhes do Usuário */}
      <Dialog open={userDetailsDialogOpen} onOpenChange={setUserDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Detalhes do Usuário
            </DialogTitle>
          </DialogHeader>
          {selectedUserDetails && (
            <div className="space-y-6">
              {/* Informações do Usuário */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Informações Pessoais
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-sm text-muted-foreground">Nome Completo</Label>
                    <p className="font-medium">{selectedUserDetails.user.full_name || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">E-mail</Label>
                    <p className="font-medium">{selectedUserDetails.user.email}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">CPF</Label>
                    <p className="font-medium">{selectedUserDetails.user.cpf || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Telefone</Label>
                    <p className="font-medium">{selectedUserDetails.user.phone || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Data de Cadastro</Label>
                    <p className="font-medium">
                      {selectedUserDetails.user.created_at
                        ? new Date(selectedUserDetails.user.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "-"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cargos e Estabelecimentos */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Cargos e Estabelecimentos
                </h3>
                {isLoadingEmployees ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : selectedUserDetails.employees.length > 0 ? (
                  <div className="space-y-4">
                    {selectedUserDetails.employees.map((emp: any) => (
                      <Card key={emp.id} className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <Shield className="h-4 w-4 text-primary" />
                            <Label className="text-sm font-semibold">Cargo</Label>
                            <Badge variant="outline" className="ml-2">
                              {emp.employee_roles?.name || "Sem cargo"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Hotel className="h-4 w-4 text-primary" />
                            <Label className="text-sm font-semibold">Estabelecimento</Label>
                            <span className="text-sm ml-2">
                              {emp.establishments?.name || "Estabelecimento não encontrado"}
                            </span>
                          </div>
                          {emp.establishments?.companies?.name && (
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4 text-primary" />
                              <Label className="text-sm font-semibold">Empresa</Label>
                              <span className="text-sm ml-2">{emp.establishments.companies.name}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-semibold">Status</Label>
                            <Badge variant={emp.is_active ? "default" : "secondary"} className="ml-2">
                              {emp.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Este usuário não possui cargos atribuídos</p>
                  </div>
                )}
              </div>

              {/* Limites */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Limites do Sistema
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="text-sm text-muted-foreground">Limite de Empresas</Label>
                    <p className="font-medium text-lg">
                      {allUserLimits.find((ul: any) => ul.user_id === selectedUserDetails.user.id)?.max_companies || 1}
                    </p>
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">Limite de Estabelecimentos</Label>
                    <p className="font-medium text-lg">
                      {allUserLimits.find((ul: any) => ul.user_id === selectedUserDetails.user.id)?.max_establishments || 1}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setUserDetailsDialogOpen(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Alert Dialog: Exclusão */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este {deleteType === "company" ? "empresa" : deleteType === "user" ? "usuário" : "estabelecimento"}? Esta ação não pode ser desfeita.
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
                  } else if (deleteType === "user") {
                    await deleteUser(deleteId);
                  } else if (deleteType === "establishment") {
                    await deleteEstablishment(deleteId);
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

// Componente de Gerenciamento de Feature Flags (Funcionalidades)
const FeatureFlagsManager = () => {
  const { settings, isLoading, updateSettings, isUpdating } = useSiteSettings();
  const { companies } = useCompanies();
  const { establishments } = useEstablishments();
  const navigate = useNavigate();
  const [features, setFeatures] = useState<any>({
    api_integrations: true,
    stripe: true,
    email: { enabled: false, establishment_ids: [] },
    web_checkin: true,
    channel_manager: true,
    stay_reviews: { enabled: false, establishment_ids: [] },
    dynamic_pricing_automation: { enabled: false, company_ids: [] },
    checkin_charge_enabled: { enabled: false, company_ids: [] },
    client_deduplication: { enabled: false, establishment_ids: [] },
    rate_recommendations: { enabled: false, establishment_ids: [] },
    availability_map: { enabled: false, establishment_ids: [] },
  });
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (settings?.features_enabled) {
      const fe = settings.features_enabled as any;
      setFeatures({
        api_integrations: typeof fe.api_integrations === 'boolean' ? fe.api_integrations : (fe.api_integrations?.enabled ?? true),
        stripe: typeof fe.stripe === 'boolean' ? fe.stripe : (fe.stripe?.enabled ?? true),
        email: typeof fe.email === 'boolean' 
          ? { enabled: fe.email, establishment_ids: [] }
          : (fe.email || { enabled: false, establishment_ids: [] }),
        web_checkin: typeof fe.web_checkin === 'boolean' ? fe.web_checkin : (fe.web_checkin?.enabled ?? true),
        channel_manager: typeof fe.channel_manager === 'boolean' ? fe.channel_manager : (fe.channel_manager?.enabled ?? true),
        stay_reviews: typeof fe.stay_reviews === 'boolean' 
          ? { enabled: fe.stay_reviews, establishment_ids: [] }
          : (fe.stay_reviews || { enabled: false, establishment_ids: [] }),
        dynamic_pricing_automation: typeof fe.dynamic_pricing_automation === 'boolean' 
          ? { enabled: fe.dynamic_pricing_automation, company_ids: [] }
          : (fe.dynamic_pricing_automation || { enabled: false, company_ids: [] }),
        client_deduplication: typeof fe.client_deduplication === 'boolean' 
          ? { enabled: fe.client_deduplication, establishment_ids: [] }
          : (fe.client_deduplication || { enabled: false, establishment_ids: [] }),
        rate_recommendations: typeof fe.rate_recommendations === 'boolean' 
          ? { enabled: fe.rate_recommendations, establishment_ids: [] }
          : (fe.rate_recommendations || { enabled: false, establishment_ids: [] }),
        availability_map: typeof fe.availability_map === 'boolean' 
          ? { enabled: fe.availability_map, establishment_ids: [] }
          : (fe.availability_map || { enabled: false, establishment_ids: [] }),
        booking_engine_enabled: typeof fe.booking_engine_enabled === 'boolean'
          ? { enabled: fe.booking_engine_enabled, company_ids: [] }
          : (fe.booking_engine_enabled || { enabled: false, company_ids: [] }),
        booking_engine_themes_enabled: typeof fe.booking_engine_themes_enabled === 'boolean'
          ? { enabled: fe.booking_engine_themes_enabled, company_ids: [] }
          : (fe.booking_engine_themes_enabled || { enabled: false, company_ids: [] }),
        booking_engine_custom_domain_enabled: typeof fe.booking_engine_custom_domain_enabled === 'boolean'
          ? { enabled: fe.booking_engine_custom_domain_enabled, company_ids: [] }
          : (fe.booking_engine_custom_domain_enabled || { enabled: false, company_ids: [] }),
        booking_engine_advanced_customization_enabled: typeof fe.booking_engine_advanced_customization_enabled === 'boolean'
          ? { enabled: fe.booking_engine_advanced_customization_enabled, company_ids: [] }
          : (fe.booking_engine_advanced_customization_enabled || { enabled: false, company_ids: [] }),
        checkin_charge_enabled: typeof fe.checkin_charge_enabled === 'boolean'
          ? { enabled: fe.checkin_charge_enabled, company_ids: [] }
          : (fe.checkin_charge_enabled || { enabled: false, company_ids: [] }),
      });
    }
  }, [settings]);

  const handleToggle = async (feature: string, value: boolean) => {
    const currentFeatures = settings?.features_enabled || {};
    const newFeatures = { ...currentFeatures };
    
    // Features que usam estrutura de objeto (enabled + ids)
    const isStructured =
      feature === 'dynamic_pricing_automation' ||
      feature === 'stay_reviews' ||
      feature === 'client_deduplication' ||
      feature === 'email' ||
      feature === 'rate_recommendations' ||
      feature === 'availability_map' ||
      feature === 'booking_engine_enabled' ||
      feature === 'booking_engine_themes_enabled' ||
      feature === 'booking_engine_custom_domain_enabled' ||
      feature === 'booking_engine_advanced_customization_enabled' ||
      feature === 'checkin_charge_enabled';

    if (isStructured) {
      // Determinar qual tipo de ID usar baseado na feature
      const usesCompanyIds = feature === 'dynamic_pricing_automation' || 
                            feature === 'booking_engine_enabled' ||
                            feature === 'booking_engine_themes_enabled' ||
                            feature === 'booking_engine_custom_domain_enabled' ||
                            feature === 'booking_engine_advanced_customization_enabled' ||
                            feature === 'checkin_charge_enabled';
      const idKey = usesCompanyIds ? 'company_ids' : 'establishment_ids';
      
      const currentConfig = typeof newFeatures[feature] === 'object' && newFeatures[feature] !== null
        ? newFeatures[feature]
        : { enabled: false, [idKey]: [] };
      newFeatures[feature] = { ...currentConfig, enabled: value };
    } else {
      // Para outras funcionalidades, manter como boolean
      newFeatures[feature] = value;
    }
    
    setFeatures((prev: any) => {
      if (isStructured) {
        // Determinar qual tipo de ID usar baseado na feature
        const usesCompanyIds = feature === 'dynamic_pricing_automation' || 
                              feature === 'booking_engine_enabled' ||
                              feature === 'booking_engine_themes_enabled' ||
                              feature === 'booking_engine_custom_domain_enabled' ||
                              feature === 'booking_engine_advanced_customization_enabled' ||
                              feature === 'checkin_charge_enabled';
        const idKey = usesCompanyIds ? 'company_ids' : 'establishment_ids';
        
        return {
      ...prev,
          [feature]: { 
            enabled: value, 
            [idKey]: prev[feature]?.[idKey] || [] 
          }
        };
      }
      return {
        ...prev,
        [feature]: value
      };
    });
    
    try {
      await updateSettings({
        features_enabled: newFeatures,
      });
    } catch (error) {
      // Reverter em caso de erro
      setFeatures(features);
      console.error("Erro ao atualizar funcionalidade:", error);
    }
  };

  const handleCompanyToggle = async (feature: string, companyId: string, isSelected: boolean) => {
    const currentFeatures = settings?.features_enabled || {};
    const newFeatures = { ...currentFeatures };
    const currentConfig = typeof newFeatures[feature] === 'object' && newFeatures[feature] !== null
      ? newFeatures[feature]
      : { enabled: false, company_ids: [] };
    
    let companyIds = Array.isArray(currentConfig.company_ids) ? [...currentConfig.company_ids] : [];
    
    if (isSelected) {
      if (!companyIds.includes(companyId)) {
        companyIds.push(companyId);
      }
    } else {
      companyIds = companyIds.filter((id: string) => id !== companyId);
    }
    
    newFeatures[feature] = {
      ...currentConfig,
      company_ids: companyIds,
    };
    
    setFeatures((prev: any) => ({
      ...prev,
      [feature]: { ...prev[feature], company_ids: companyIds }
    }));
    
    try {
      await updateSettings({
        features_enabled: newFeatures,
      });
    } catch (error) {
      console.error("Erro ao atualizar empresas da funcionalidade:", error);
      toast.error("Erro ao atualizar empresas");
    }
  };

  const handleEstablishmentToggle = async (feature: string, establishmentId: string, isSelected: boolean) => {
    const currentFeatures = settings?.features_enabled || {};
    const newFeatures = { ...currentFeatures };
    const currentConfig = typeof newFeatures[feature] === 'object' && newFeatures[feature] !== null
      ? newFeatures[feature]
      : { enabled: false, establishment_ids: [] };
    
    let establishmentIds = Array.isArray(currentConfig.establishment_ids) ? [...currentConfig.establishment_ids] : [];
    
    if (isSelected) {
      if (!establishmentIds.includes(establishmentId)) {
        establishmentIds.push(establishmentId);
      }
    } else {
      establishmentIds = establishmentIds.filter((id: string) => id !== establishmentId);
    }
    
    newFeatures[feature] = {
      ...currentConfig,
      enabled: currentConfig.enabled ?? false,
      establishment_ids: establishmentIds,
    };
    
    setFeatures((prev: any) => ({
      ...prev,
      [feature]: { 
        enabled: prev[feature]?.enabled ?? false,
        establishment_ids: establishmentIds 
      }
    }));
    
    try {
      await updateSettings({
        features_enabled: newFeatures,
      });
    } catch (error) {
      console.error("Erro ao atualizar estabelecimentos da funcionalidade:", error);
      toast.error("Erro ao atualizar estabelecimentos");
    }
  };

  // Agrupar estabelecimentos por empresa
  const establishmentsByCompanyMap = useMemo(() => {
    if (!establishments || !companies) return new Map();
    
    const grouped = new Map<string, {
      company: any;
      establishments: any[];
    }>();
    
    companies.forEach((company: any) => {
      const companyEstablishments = establishments.filter(
        (est: any) => est.company_id === company.id
      );
      
      if (companyEstablishments.length > 0) {
        grouped.set(company.id, {
          company,
          establishments: companyEstablishments,
        });
      }
    });
    
    // Adicionar estabelecimentos sem empresa
    const establishmentsWithoutCompany = establishments.filter(
      (est: any) => !est.company_id || !companies.find((c: any) => c.id === est.company_id)
    );
    
    if (establishmentsWithoutCompany.length > 0) {
      grouped.set('no-company', {
        company: { id: 'no-company', name: 'Sem Empresa' },
        establishments: establishmentsWithoutCompany,
      });
    }
    
    return grouped;
  }, [establishments, companies]);
  
  const toggleCompanyExpansion = (companyId: string) => {
    setExpandedCompanies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(companyId)) {
        newSet.delete(companyId);
      } else {
        newSet.add(companyId);
      }
      return newSet;
    });
  };
  
  const handleCompanyEstablishmentsToggle = (featureKey: string, companyId: string, companyEstablishments: any[], selectedEstablishmentIds: string[]) => {
    const companyEstIds = companyEstablishments.map((e: any) => e.id);
    const allSelected = companyEstIds.every((id: string) => 
      selectedEstablishmentIds.includes(id)
    );
    
    // Se todos estão selecionados, desmarcar todos
    // Se não, marcar todos
    companyEstIds.forEach((estId: string) => {
      handleEstablishmentToggle(featureKey, estId, !allSelected);
    });
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </Card>
    );
  }

  const featureList = [
    {
      key: "api_integrations" as const,
      label: "Integrações de API",
      description: "Permite que estabelecimentos configurem integrações com APIs externas (Booking Engine, Channel Manager, etc.)",
      icon: Key,
      supportsCompanies: false,
    },
    {
      key: "stripe" as const,
      label: "Stripe",
      description: "Habilita a integração com Stripe para processamento de pagamentos",
      icon: CreditCard,
      supportsCompanies: false,
    },
    {
      key: "email" as const,
      label: "Sistema de E-mail",
      description: "Habilita o sistema de envio de e-mails (templates, fila, logs)",
      icon: Mail,
      supportsCompanies: false,
      supportsEstablishments: true,
    },
    {
      key: "web_checkin" as const,
      label: "Web Check-in",
      description: "Permite que hóspedes façam check-in online antes da chegada",
      icon: Zap,
      supportsCompanies: false,
    },
    {
      key: "channel_manager" as const,
      label: "Channel Manager",
      description: "Habilita a sincronização com canais de distribuição (OTAs)",
      icon: Link2,
      supportsCompanies: false,
    },
    {
      key: "stay_reviews" as const,
      label: "Avaliações da Estadia",
      description: "Permite que hóspedes avaliem sua estadia após o check-out (quarto, conforto, atendimento, limpeza)",
      icon: Star,
      supportsCompanies: false,
      supportsEstablishments: true,
    },
    {
      key: "dynamic_pricing_automation" as const,
      label: "Automação de Regras de Precificação Dinâmica",
      description: "Permite que empresas utilizem a automação de regras de precificação dinâmica para ajustar tarifas automaticamente",
      icon: TrendingUp,
      supportsCompanies: true,
    },
    {
      key: "client_deduplication" as const,
      label: "Centralização de Clientes",
      description: "Permite identificar e mesclar clientes duplicados baseado em CPF, email ou telefone",
      icon: Users,
      supportsCompanies: false,
      supportsEstablishments: true,
    },
    {
      key: "rate_recommendations" as const,
      label: "Recomendações de Preços",
      description: "Habilita o sistema de recomendações automáticas de ajuste de preços baseado em ocupação e demanda",
      icon: TrendingUp,
      supportsCompanies: false,
      supportsEstablishments: true,
    },
    {
      key: "availability_map" as const,
      label: "Mapa de Disponibilidades",
      description: "Habilita o mapa de disponibilidades para visualizar a disponibilidade de quartos por categoria e data",
      icon: MapIcon,
      supportsCompanies: false,
      supportsEstablishments: true,
    },
    {
      key: "booking_engine_enabled" as const,
      label: "Motor de Reservas",
      description: "Habilita o novo motor de reservas como página inicial de busca para cada empresa",
      icon: Globe,
      supportsCompanies: true,
      supportsEstablishments: false,
    },
    {
      key: "booking_engine_themes_enabled" as const,
      label: "Temas do Motor de Reservas",
      description: "Permite que empresas escolham entre temas pré-definidos do motor de reservas",
      icon: LayoutTemplate,
      supportsCompanies: true,
      supportsEstablishments: false,
    },
    {
      key: "booking_engine_custom_domain_enabled" as const,
      label: "Domínio Personalizado do Motor",
      description: "Permite configurar domínios personalizados para o motor de reservas (ex.: reservas.empresa.com.br)",
      icon: Link2,
      supportsCompanies: true,
      supportsEstablishments: false,
    },
    {
      key: "booking_engine_advanced_customization_enabled" as const,
      label: "Customização Avançada do Motor",
      description: "Libera configurações avançadas de cores, fontes e elementos visuais do motor de reservas",
      icon: Settings,
      supportsCompanies: true,
      supportsEstablishments: false,
    },
    {
      key: "checkin_charge_enabled" as const,
      label: "Mensagens & Cobranças",
      description: "Permite envio de mensagens e cobranças por WhatsApp, Chatwoot ou Evolution API, com link de pagamento e web check-in",
      icon: CreditCard,
      supportsCompanies: true,
      supportsEstablishments: false,
    },
  ];

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div className="flex items-center gap-2 mb-6">
          <Settings className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-bold">Controle de Funcionalidades</h2>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>Como funciona:</strong> Ative ou desative funcionalidades globalmente. 
            Quando uma funcionalidade está desativada, ela não aparece nas configurações dos estabelecimentos.
          </p>
        </div>

        <div className="space-y-4">
          {featureList.map((feature) => {
            const Icon = feature.icon;
            const isEnabled = (feature.supportsCompanies || feature.supportsEstablishments)
              ? features[feature.key]?.enabled ?? false
              : features[feature.key] ?? false;
            const isExpanded = expandedFeature === feature.key;
            const selectedCompanyIds = feature.supportsCompanies 
              ? (features[feature.key]?.company_ids || [])
              : [];
            const selectedEstablishmentIds = feature.supportsEstablishments
              ? (features[feature.key]?.establishment_ids || [])
              : [];
            
            // Calcular estado de seleção por empresa (apenas para features que suportam estabelecimentos)
            const establishmentsByCompany = feature.supportsEstablishments ? Array.from(establishmentsByCompanyMap.values()).map((group) => {
              const companyEstIds = group.establishments.map((e: any) => e.id);
              const allSelected = companyEstIds.every((id: string) => 
                selectedEstablishmentIds.includes(id)
              );
              const someSelected = companyEstIds.some((id: string) => 
                selectedEstablishmentIds.includes(id)
              );
              
              return {
                ...group,
                allSelected,
                someSelected,
              };
            }) : [];

            return (
              <div
                key={feature.key}
                className="border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between p-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{feature.label}</h3>
                      <Badge variant={isEnabled ? "default" : "secondary"}>
                        {isEnabled ? "Ativado" : "Desativado"}
                      </Badge>
                        {feature.supportsCompanies && isEnabled && selectedCompanyIds.length > 0 && (
                          <Badge variant="outline">
                            {selectedCompanyIds.length} empresa{selectedCompanyIds.length !== 1 ? 's' : ''}
                          </Badge>
                        )}
                        {feature.supportsEstablishments && isEnabled && selectedEstablishmentIds.length > 0 && (
                          <Badge variant="outline">
                            {selectedEstablishmentIds.length} estabelecimento{selectedEstablishmentIds.length !== 1 ? 's' : ''}
                          </Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 ml-4">
                    {feature.supportsCompanies && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedFeature(isExpanded ? null : feature.key)}
                        disabled={!isEnabled}
                      >
                        {isExpanded ? "Ocultar" : "Selecionar Empresas"}
                      </Button>
                    )}
                    {feature.supportsEstablishments && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedFeature(isExpanded ? null : feature.key)}
                        disabled={!isEnabled}
                      >
                        {isExpanded ? "Ocultar" : "Selecionar Estabelecimentos"}
                      </Button>
                    )}
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggle(feature.key, checked)}
                    disabled={isUpdating}
                  />
                </div>
                </div>
                {feature.supportsCompanies && isExpanded && isEnabled && (
                  <div className="px-4 pb-4 border-t bg-muted/30">
                    <div className="mt-4 space-y-2">
                      <Label className="text-sm font-medium">Selecionar Empresas:</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                        {companies.map((company) => {
                          const isSelected = selectedCompanyIds.includes(company.id);
                          return (
                            <div
                              key={company.id}
                              className="flex items-center space-x-2 p-2 rounded border hover:bg-muted/50 cursor-pointer"
                              onClick={() => handleCompanyToggle(feature.key, company.id, !isSelected)}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleCompanyToggle(feature.key, company.id, !isSelected)}
                                className="rounded"
                              />
                              <Label className="text-sm cursor-pointer flex-1">
                                {company.name}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                      {companies.length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada</p>
                      )}
                    </div>
                  </div>
                )}
                {feature.supportsEstablishments && isExpanded && isEnabled && (
                  <div className="px-4 pb-4 border-t bg-muted/30">
                    <div className="mt-4 space-y-2">
                      <Label className="text-sm font-medium">Selecionar Estabelecimentos:</Label>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {establishmentsByCompany.map((group) => {
                          const isCompanyExpanded = expandedCompanies.has(group.company.id);
                          return (
                            <div key={group.company.id} className="border rounded-lg">
                              {/* Cabeçalho da Empresa */}
                              <div className="flex items-center justify-between p-2 bg-muted/50 rounded-t-lg">
                                <div className="flex items-center space-x-2 flex-1">
                                  <button
                                    type="button"
                                    onClick={() => toggleCompanyExpansion(group.company.id)}
                                    className="p-1 hover:bg-muted rounded"
                                  >
                                    {isCompanyExpanded ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </button>
                                  <input
                                    type="checkbox"
                                    checked={group.allSelected}
                                    ref={(el) => {
                                      if (el) el.indeterminate = group.someSelected && !group.allSelected;
                                    }}
                                    onChange={() => handleCompanyEstablishmentsToggle(feature.key, group.company.id, group.establishments, selectedEstablishmentIds)}
                                    className="rounded"
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <Label 
                                    className="text-sm font-medium cursor-pointer flex-1"
                                      onClick={() => handleCompanyEstablishmentsToggle(feature.key, group.company.id, group.establishments, selectedEstablishmentIds)}
                                  >
                                    {group.company.name}
                                    <span className="text-muted-foreground ml-2">
                                      ({group.establishments.length} estabelecimento{group.establishments.length !== 1 ? 's' : ''})
                                    </span>
                                  </Label>
                                </div>
                              </div>
                              
                              {/* Estabelecimentos da Empresa */}
                              {isCompanyExpanded && (
                                <div className="p-2 space-y-1 bg-background rounded-b-lg">
                                  {group.establishments.map((establishment: any) => {
                                    const isSelected = selectedEstablishmentIds.includes(establishment.id);
                                    return (
                                      <div
                                        key={establishment.id}
                                        className="flex items-center space-x-2 p-2 rounded border hover:bg-muted/50 cursor-pointer ml-6"
                                        onClick={() => handleEstablishmentToggle(feature.key, establishment.id, !isSelected)}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => handleEstablishmentToggle(feature.key, establishment.id, !isSelected)}
                                          className="rounded"
                                          onClick={(e) => e.stopPropagation()}
                                        />
                                        <Label className="text-sm cursor-pointer flex-1">
                                          {establishment.name}
                                        </Label>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {establishmentsByCompany.length === 0 && (
                        <p className="text-sm text-muted-foreground">Nenhum estabelecimento cadastrado</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <strong>⚠️ Atenção:</strong> Desativar uma funcionalidade não remove dados existentes, 
            apenas oculta a interface. Reative para restaurar o acesso.
          </p>
        </div>
      </div>
    </Card>
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
