import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { 
  Loader2, Settings2, HelpCircle, ArrowUp, ArrowDown, Building2, Upload, X, 
  Eye, Save, Globe, Palette, Image as ImageIcon, Phone, Share2, Zap, 
  Code, Search, GripVertical, ExternalLink, CheckCircle2, AlertCircle, FileText, Map
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
import { generateSlug as slugFromName, improveSlug } from "@/lib/slugUtils";
import { useSlugValidation } from "@/hooks/useSlugValidation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const BookingEngineSettings = () => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { settings: siteSettings, uploadImage, updateSettings: updateSiteSettings } = useSiteSettings();
  const [showDnsHelp, setShowDnsHelp] = useState(false);
  const [localTitle, setLocalTitle] = useState<string>("");
  const [localCustomDomain, setLocalCustomDomain] = useState<string>("");
  const [activeTab, setActiveTab] = useState("geral");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [faviconPreview, setFaviconPreview] = useState<string>("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);
  const [localChatEnabled, setLocalChatEnabled] = useState<boolean>(false);
  const [searchEstablishment, setSearchEstablishment] = useState<string>("");
  const [dnsStatus, setDnsStatus] = useState<"checking" | "active" | "pending" | "inactive">("inactive");
  const [sslStatus, setSslStatus] = useState<"checking" | "active" | "pending" | "inactive">("inactive");
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [localSlug, setLocalSlug] = useState<string>("");
  const [localRobotsTxt, setLocalRobotsTxt] = useState<string>("");

  // Buscar empresa atual
  const { data: company, isLoading: isLoadingCompany } = useQuery({
    queryKey: ["company", selectedEstablishment?.company_id, "fallback"],
    queryFn: async () => {
      if (selectedEstablishment?.company_id) {
        const { data, error } = await supabase
          .from("companies")
          .select("*")
          .eq("id", selectedEstablishment.company_id)
          .maybeSingle();
        if (error) throw error;
        return data;
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("establishment_id, establishments!inner(company_id)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);
      
      if (!employeesError && employees && employees.length > 0) {
        const companyId = (employees[0] as any).establishments?.company_id;
        if (companyId) {
          const { data, error } = await supabase
            .from("companies")
            .select("*")
            .eq("id", companyId)
            .maybeSingle();
          if (error) throw error;
          if (data) return data;
        }
      }
      
      const { data: userCompanies, error: userCompaniesError } = await supabase
        .from("user_companies")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);
      
      if (userCompaniesError) throw userCompaniesError;
      if (!userCompanies || userCompanies.length === 0) return null;
      
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", userCompanies[0].company_id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: true,
  });

  useEffect(() => {
    if (company?.booking_engine_custom_domain !== undefined) {
      setLocalCustomDomain(company.booking_engine_custom_domain || "");
    }
  }, [company?.booking_engine_custom_domain]);

  useEffect(() => {
    setLocalSlug(company?.booking_engine_slug || "");
  }, [company?.booking_engine_slug]);

  useEffect(() => {
    setLocalRobotsTxt(siteSettings?.robots_txt ?? "");
  }, [siteSettings?.robots_txt]);

  // Função para verificar status DNS e SSL
  const checkDomainStatus = async (domain: string) => {
    if (!domain) {
      setDnsStatus("inactive");
      setSslStatus("inactive");
      return;
    }

    // Normalizar domínio (remover http:// ou https://)
    const normalizedDomain = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");

    // Verificar DNS e SSL simultaneamente
    setDnsStatus("checking");
    setSslStatus("checking");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos de timeout
      
      try {
        // Tentar fazer uma requisição para verificar se o domínio está acessível
        // Usamos uma imagem pequena ou favicon como teste, pois é mais confiável
        const testUrl = `https://${normalizedDomain}/favicon.ico?t=${Date.now()}`;
        
        const response = await fetch(testUrl, {
          method: "HEAD",
          mode: "cors", // Tentar CORS primeiro para verificar resposta real
          signal: controller.signal,
          cache: "no-cache",
        }).catch(async (corsError) => {
          // Se falhar por CORS, tentar no-cors (isso significa que o domínio está acessível)
          try {
            await fetch(testUrl, {
              method: "HEAD",
              mode: "no-cors",
              signal: controller.signal,
              cache: "no-cache",
            });
            // Se chegou aqui, o domínio está acessível (DNS funcionando)
            return { ok: true, cors: false };
          } catch (noCorsError: any) {
            throw noCorsError;
          }
  });

        // Se chegou aqui sem erro, DNS e SSL estão funcionando
        if (response && (response.ok || response.type === "opaque")) {
          setDnsStatus("active");
          setSslStatus("active");
        } else {
          // Se a resposta não foi ok, mas não deu erro de rede, DNS está funcionando
          setDnsStatus("active");
          setSslStatus("active");
        }
      } catch (error: any) {
        // Analisar o tipo de erro
        const errorMessage = error.message || error.toString() || "";
        const errorName = error.name || "";
        
        // Verificar se é erro de SSL/certificado
        if (
          errorMessage.includes("SSL") ||
          errorMessage.includes("certificate") ||
          errorMessage.includes("ERR_CERT") ||
          errorMessage.includes("NET::ERR_CERT") ||
          errorMessage.includes("certificate has expired") ||
          errorMessage.includes("certificate is not yet valid")
        ) {
          // DNS está funcionando, mas SSL não
          setDnsStatus("active");
          setSslStatus("pending");
        } else if (
          errorMessage.includes("Failed to fetch") ||
          errorMessage.includes("NetworkError") ||
          errorMessage.includes("ERR_NAME_NOT_RESOLVED") ||
          errorMessage.includes("ERR_CONNECTION_REFUSED") ||
          errorName === "AbortError"
        ) {
          // Erro de rede ou timeout - DNS pode não estar configurado
          setDnsStatus("pending");
          setSslStatus("pending");
        } else {
          // Outros erros - assumir que está funcionando (pode ser CORS)
          setDnsStatus("active");
          setSslStatus("active");
        }
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // Erro geral - assumir pendente
      setDnsStatus("pending");
      setSslStatus("pending");
    }
  };

  // Verificar status quando o domínio mudar
  useEffect(() => {
    if (localCustomDomain) {
      checkDomainStatus(localCustomDomain);
      // Verificar novamente após 30 segundos (para dar tempo de propagação)
      const interval = setInterval(() => {
        checkDomainStatus(localCustomDomain);
      }, 30000); // Verificar a cada 30 segundos

      return () => clearInterval(interval);
    } else {
      setDnsStatus("inactive");
      setSslStatus("inactive");
    }
  }, [localCustomDomain]);

  useEffect(() => {
    if (company?.booking_engine_chat_enabled !== undefined) {
      setLocalChatEnabled(company.booking_engine_chat_enabled || false);
    }
  }, [company?.booking_engine_chat_enabled]);

  useEffect(() => {
    if (company?.booking_engine_logo) {
      setLogoPreview(company.booking_engine_logo);
    }
    if (company?.booking_engine_favicon) {
      setFaviconPreview(company.booking_engine_favicon);
    }
  }, [company?.booking_engine_logo, company?.booking_engine_favicon]);

  const { data: engineEstablishments, isLoading: isLoadingEngine } = useQuery({
    queryKey: ["company_booking_engine_establishments", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from("company_booking_engine_establishments")
        .select("*, establishments(*)")
        .eq("company_id", company.id)
        .order("display_order")
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!company?.id,
  });

  const { data: allEstablishments, isLoading: isLoadingAll } = useQuery({
    queryKey: ["company_establishments_manager_scope", company?.id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data: userCompanies, error: userCompaniesError } = await supabase
        .from("user_companies")
        .select("company_id, role, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("establishment_id")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const companyIds = new Set<string>();

      if (!userCompaniesError && userCompanies && userCompanies.length > 0) {
        userCompanies.forEach((uc: any) => {
          if (uc.company_id) companyIds.add(uc.company_id);
        });
      }

      if (!employeesError && employees && employees.length > 0) {
        const establishmentIds = employees.map((emp: any) => emp.establishment_id).filter(Boolean);
        if (establishmentIds.length > 0) {
          const { data: empEstablishments, error: empEstError } = await supabase
            .from("establishments")
            .select("company_id")
            .in("id", establishmentIds)
            .eq("is_active", true);
          
          if (!empEstError && empEstablishments) {
            empEstablishments.forEach((est: any) => {
              if (est.company_id) companyIds.add(est.company_id);
            });
          }
        }
      }

      if (companyIds.size === 0) return [];

      const { data: establishments, error: estError } = await supabase
        .from("establishments")
        .select("*")
        .in("company_id", Array.from(companyIds))
        .eq("is_active", true)
        .order("name");

      if (estError) throw estError;
      return establishments || [];
    },
    enabled: true,
  });

  const canUseBookingEngine = isFeatureEnabledForEstablishment(
    siteSettings?.features_enabled?.booking_engine_enabled,
    company?.id,
    true
  );
  const canUseThemes = isFeatureEnabledForEstablishment(
    siteSettings?.features_enabled?.booking_engine_themes_enabled,
    company?.id,
    true
  );
  const canUseCustomDomain = isFeatureEnabledForEstablishment(
    siteSettings?.features_enabled?.booking_engine_custom_domain_enabled,
    company?.id,
    true
  );
  const canUseAdvancedCustomization = isFeatureEnabledForEstablishment(
    siteSettings?.features_enabled?.booking_engine_advanced_customization_enabled,
    company?.id,
    true
  );

  const systemBaseDomain = (() => {
    if (siteSettings?.pms_base_url) {
      try {
        const url = new URL(siteSettings.pms_base_url);
        return url.host;
      } catch {
        return siteSettings.pms_base_url.replace(/^https?:\/\//, '').split('/')[0];
      }
    }
    if (typeof window !== "undefined") {
      return window.location.host;
    }
    return "";
  })();

  const generateSlug = (title: string): string => {
    const s = slugFromName(title);
    return s || "motor-reservas";
  };

  const { isUnique: slugIsUnique, isDuplicate: slugIsDuplicate } = useSlugValidation({
    entityType: "company",
    slug: localSlug,
    excludeId: company?.id,
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (updates: any) => {
      if (!company?.id) throw new Error("Empresa não encontrada");
      
      if (updates.booking_engine_title !== undefined) {
        const newTitle = updates.booking_engine_title?.trim() || null;
        if (newTitle) {
          let generatedSlug = generateSlug(newTitle);
          let finalSlug = generatedSlug;
          let suffix = 1;
          while (true) {
            const { data: existing } = await supabase
              .from("companies")
              .select("id")
              .eq("booking_engine_slug", finalSlug)
              .neq("id", company.id)
              .maybeSingle();
            if (!existing) break;
            finalSlug = `${generatedSlug}-${suffix}`;
            suffix++;
            if (suffix > 100) {
              finalSlug = `${generatedSlug}-${Date.now()}`;
              break;
            }
          }
          updates.booking_engine_slug = finalSlug;
        } else {
          updates.booking_engine_slug = null;
        }
      }
      if (updates.booking_engine_slug !== undefined) {
        const raw = updates.booking_engine_slug?.trim() || null;
        if (raw) {
          const normalized = improveSlug(raw);
          let finalSlug = normalized;
          let suffix = 1;
          while (true) {
            const { data: existing } = await supabase
              .from("companies")
              .select("id")
              .eq("booking_engine_slug", finalSlug)
              .neq("id", company.id)
              .maybeSingle();
            if (!existing) break;
            finalSlug = `${normalized}-${suffix}`;
            suffix++;
            if (suffix > 100) {
              finalSlug = `${normalized}-${Date.now()}`;
              break;
            }
          }
          updates.booking_engine_slug = finalSlug;
        } else {
          updates.booking_engine_slug = null;
        }
      }
      const { data, error } = await supabase
        .from("companies")
        .update(updates)
        .eq("id", company.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company"] });
      toast.success("Configurações atualizadas");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar configurações");
    },
  });

  const toggleEstablishmentMutation = useMutation({
    mutationFn: async ({ establishmentId, isActive }: { establishmentId: string; isActive: boolean }) => {
      if (!company?.id) throw new Error("Empresa não encontrada");
      
      if (isActive) {
        const currentMaxOrder = engineEstablishments?.length || 0;
        const { error } = await supabase
          .from("company_booking_engine_establishments")
          .upsert({
            company_id: company.id,
            establishment_id: establishmentId,
            display_order: currentMaxOrder,
            is_active: true,
          });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("company_booking_engine_establishments")
          .delete()
          .eq("company_id", company.id)
          .eq("establishment_id", establishmentId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company_booking_engine_establishments", company?.id] });
      toast.success("Estabelecimento atualizado");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar estabelecimento");
    },
  });

  const reorderEstablishmentMutation = useMutation({
    mutationFn: async ({ establishmentId, direction }: { establishmentId: string; direction: "up" | "down" }) => {
      if (!company?.id || !engineEstablishments) throw new Error("Dados não encontrados");
      
      const currentIndex = engineEstablishments.findIndex(
        (e: any) => e.establishment_id === establishmentId
      );
      if (currentIndex === -1) throw new Error("Estabelecimento não encontrado");
      
      const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= engineEstablishments.length) return;
      
      const current = engineEstablishments[currentIndex];
      const target = engineEstablishments[newIndex];
      
      await supabase
        .from("company_booking_engine_establishments")
        .update({ display_order: target.display_order })
        .eq("id", current.id);
      
      await supabase
        .from("company_booking_engine_establishments")
        .update({ display_order: current.display_order })
        .eq("id", target.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company_booking_engine_establishments", company?.id] });
      toast.success("Ordem atualizada");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao reordenar");
    },
  });

  // Função para reordenar via drag & drop
  const handleDragStart = (e: React.DragEvent, establishmentId: string) => {
    setDraggedItemId(establishmentId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/html", establishmentId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = async (e: React.DragEvent, targetEstablishmentId: string) => {
    e.preventDefault();
    
    if (!draggedItemId || draggedItemId === targetEstablishmentId || !engineEstablishments) {
      setDraggedItemId(null);
      return;
    }

    const draggedIndex = engineEstablishments.findIndex(
      (e: any) => e.establishment_id === draggedItemId
    );
    const targetIndex = engineEstablishments.findIndex(
      (e: any) => e.establishment_id === targetEstablishmentId
    );

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItemId(null);
      return;
    }

    // Reordenar todos os itens entre a posição arrastada e a posição alvo
    const sortedEstablishments = [...engineEstablishments].sort((a, b) => 
      (a.display_order || 0) - (b.display_order || 0)
    );

    // Remover o item arrastado da lista
    const draggedItem = sortedEstablishments[draggedIndex];
    sortedEstablishments.splice(draggedIndex, 1);

    // Inserir o item na nova posição
    sortedEstablishments.splice(targetIndex, 0, draggedItem);

    // Atualizar display_order de todos os itens afetados
    const updates = sortedEstablishments.map((item: any, index: number) => ({
      id: item.id,
      display_order: index,
    }));

    // Executar todas as atualizações
    try {
      await Promise.all(
        updates.map((update) =>
          supabase
            .from("company_booking_engine_establishments")
            .update({ display_order: update.display_order })
            .eq("id", update.id)
        )
      );

      queryClient.invalidateQueries({ queryKey: ["company_booking_engine_establishments", company?.id] });
      toast.success("Ordem atualizada");
    } catch (error: any) {
      toast.error(error.message || "Erro ao reordenar");
    }

    setDraggedItemId(null);
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
  };

  useEffect(() => {
    setLocalTitle(company?.booking_engine_title || "");
  }, [company?.booking_engine_title]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB");
      return;
    }

    setLogoFile(file);
    setIsUploadingLogo(true);

    try {
      const uploadedUrl = await uploadImage(file, "logo");
      if (uploadedUrl) {
        await updateCompanyMutation.mutateAsync({
          booking_engine_logo: uploadedUrl,
        });
        setLogoPreview(uploadedUrl);
        toast.success("Logo atualizado com sucesso!");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer upload do logo");
    } finally {
      setIsUploadingLogo(false);
      setLogoFile(null);
      e.target.value = "";
    }
  };

  const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem");
      return;
    }

    if (file.size > 1 * 1024 * 1024) {
      toast.error("O favicon deve ter no máximo 1MB");
      return;
    }

    setFaviconFile(file);
    setIsUploadingFavicon(true);

    try {
      const uploadedUrl = await uploadImage(file, "favicon");
      if (uploadedUrl) {
        await updateCompanyMutation.mutateAsync({
          booking_engine_favicon: uploadedUrl,
        });
        setFaviconPreview(uploadedUrl);
        toast.success("Favicon atualizado com sucesso!");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao fazer upload do favicon");
    } finally {
      setIsUploadingFavicon(false);
      setFaviconFile(null);
      e.target.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await updateCompanyMutation.mutateAsync({
        booking_engine_logo: null,
      });
      setLogoPreview("");
      toast.success("Logo removido com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover logo");
    }
  };

  const handleRemoveFavicon = async () => {
    try {
      await updateCompanyMutation.mutateAsync({
        booking_engine_favicon: null,
      });
      setFaviconPreview("");
      toast.success("Favicon removido com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover favicon");
    }
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (isLoadingCompany || isLoadingEngine || isLoadingAll) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!company) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">Empresa não encontrada.</p>
      </Card>
    );
  }

  const previewSlug = localTitle ? generateSlug(localTitle) : (company?.booking_engine_slug || "");
  const bookingEngineUrl = company?.booking_engine_slug 
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/motor/${company.booking_engine_slug}`
    : company?.booking_engine_custom_domain
    ? `https://${company.booking_engine_custom_domain}`
    : '';

  const isEstablishmentInEngine = (establishmentId: string) => {
    return engineEstablishments?.some(
      (e: any) => e.establishment_id === establishmentId && e.is_active
    ) || false;
  };

  // Ordenar estabelecimentos ativos no motor primeiro, depois os outros
  const sortedEngineEstablishments = engineEstablishments
    ? [...engineEstablishments].sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0))
    : [];

  const filteredEstablishments = allEstablishments?.filter((est: any) => 
    est.name.toLowerCase().includes(searchEstablishment.toLowerCase())
  ) || [];

  const getEngineStatus = () => {
    if (!canUseBookingEngine) return { label: "Desabilitado", variant: "destructive" as const, icon: AlertCircle };
    if (company?.booking_engine_custom_domain) return { label: "Publicado", variant: "default" as const, icon: CheckCircle2 };
    if (company?.booking_engine_slug) return { label: "Publicado", variant: "default" as const, icon: CheckCircle2 };
    return { label: "Rascunho", variant: "secondary" as const, icon: AlertCircle };
  };

  const status = getEngineStatus();
  const StatusIcon = status.icon;

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Header Fixo */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
      <div>
                <h1 className="text-2xl font-bold text-slate-900">Configuração do Motor de Reservas</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                  Personalize e configure seu motor de reservas
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={status.variant} className="gap-1.5 px-3 py-1">
                <StatusIcon className="w-3.5 h-3.5" />
                {status.label}
              </Badge>
              {bookingEngineUrl && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(bookingEngineUrl, '_blank')}
                        className="gap-2"
                      >
                        <Eye className="w-4 h-4" />
                        Visualizar Motor
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Abrir motor de reservas em nova aba</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
      </div>

      {!canUseBookingEngine && (
        <div className="max-w-7xl mx-auto px-6 py-4">
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            O Motor de Reservas não está habilitado para esta empresa. Entre em contato com o administrador do sistema.
          </p>
        </Card>
        </div>
      )}

      {canUseBookingEngine && (
        <div className="max-w-7xl mx-auto px-6 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            {/* Menu de Abas */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-1">
              <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-1 h-auto bg-transparent">
                <TabsTrigger value="geral" className="flex items-center gap-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                  <Settings2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Geral</span>
                </TabsTrigger>
                <TabsTrigger value="aparencia" className="flex items-center gap-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                  <Palette className="w-4 h-4" />
                  <span className="hidden sm:inline">Aparência</span>
                </TabsTrigger>
                <TabsTrigger value="conteudo" className="flex items-center gap-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                  <ImageIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Conteúdo</span>
                </TabsTrigger>
                <TabsTrigger value="contato" className="flex items-center gap-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                  <Phone className="w-4 h-4" />
                  <span className="hidden sm:inline">Contato</span>
                </TabsTrigger>
                <TabsTrigger value="integracoes" className="flex items-center gap-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                  <Zap className="w-4 h-4" />
                  <span className="hidden sm:inline">Integrações</span>
                </TabsTrigger>
                <TabsTrigger value="dominio" className="flex items-center gap-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                  <Globe className="w-4 h-4" />
                  <span className="hidden sm:inline">Domínio</span>
                </TabsTrigger>
                <TabsTrigger value="estabelecimentos" className="flex items-center gap-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                  <Building2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Hotéis</span>
                </TabsTrigger>
                <TabsTrigger value="avancado" className="flex items-center gap-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                  <Code className="w-4 h-4" />
                  <span className="hidden sm:inline">Avançado</span>
                </TabsTrigger>
                <TabsTrigger value="seo" className="flex items-center gap-2 data-[state=active]:bg-slate-900 data-[state=active]:text-white">
                  <Search className="w-4 h-4" />
                  <span className="hidden sm:inline">SEO</span>
                </TabsTrigger>
              </TabsList>
              </div>

            {/* Conteúdo das Abas */}
            <div className="space-y-6">
              {/* Aba Geral */}
              <TabsContent value="geral" className="space-y-6 mt-0">
                <Card className="p-6 border-slate-200 shadow-sm">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">Configurações Gerais</h3>
                      <p className="text-sm text-slate-500">Configure as informações básicas do motor de reservas</p>
                    </div>
              <Separator />

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                  Título do Motor de Reservas
                </Label>
                <Input
                  placeholder="Ex: Motor de Reservas"
                  value={localTitle}
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    setLocalTitle(newTitle);
                    if (saveTimeoutRef.current) {
                      clearTimeout(saveTimeoutRef.current);
                    }
                    saveTimeoutRef.current = setTimeout(() => {
                      updateCompanyMutation.mutate({
                        booking_engine_title: newTitle.trim() || null,
                      });
                    }, 1000);
                  }}
                  onBlur={() => {
                    if (saveTimeoutRef.current) {
                      clearTimeout(saveTimeoutRef.current);
                      saveTimeoutRef.current = null;
                    }
                    updateCompanyMutation.mutate({
                      booking_engine_title: localTitle.trim() || null,
                    });
                  }}
                          className="h-11"
                />
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span>Título exibido no header do motor de reservas</span>
                  {previewSlug && (
                            <Badge variant="outline" className="ml-auto">
                      URL: /motor/{previewSlug}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          URL amigável (slug)
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="ex: motor-reservas"
                            value={localSlug}
                            onChange={(e) => setLocalSlug(improveSlug(e.target.value))}
                            onBlur={() => {
                              const improved = improveSlug(localSlug);
                              if (improved && slugIsUnique && improved !== (company?.booking_engine_slug || "")) {
                                updateCompanyMutation.mutate({ booking_engine_slug: improved });
                              }
                            }}
                            className="h-11 flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const fromTitle = generateSlug(localTitle);
                              if (fromTitle) {
                                setLocalSlug(fromTitle);
                                updateCompanyMutation.mutate({ booking_engine_slug: fromTitle });
                              }
                            }}
                          >
                            Gerar do título
                          </Button>
                        </div>
                        {localSlug && slugIsDuplicate && (
                          <p className="text-xs text-amber-600">Esta URL já está em uso. Escolha outra.</p>
                        )}
                        {localSlug && slugIsUnique && (
                          <p className="text-xs text-slate-500">URL: /motor/{localSlug}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-slate-700">
                          Subtítulo do Motor de Reservas
                        </Label>
                        <Input
                          placeholder="Ex: Reserve com as melhores tarifas direto com o hotel"
                          defaultValue={company?.booking_engine_subtitle || ""}
                          onBlur={(e) => {
                            const value = e.target.value.trim() || null;
                            if (value !== (company?.booking_engine_subtitle || "")) {
                              updateCompanyMutation.mutate({
                                booking_engine_subtitle: value,
                              });
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                          className="h-11"
                        />
                        <p className="text-xs text-slate-500">
                          Texto exibido abaixo do título no cabeçalho do motor
                </p>
              </div>

                    </div>
                  </div>
                </Card>
              </TabsContent>

              {/* Aba Aparência & Branding */}
              <TabsContent value="aparencia" className="space-y-6 mt-0">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-6">
                    {/* Seletor de Tema com Preview */}
              {canUseThemes && (
                      <Card className="p-6 border-slate-200 shadow-sm">
                        <div className="space-y-6">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-1">Tema do Motor de Reservas</h3>
                            <p className="text-sm text-slate-500">Escolha o tema visual que melhor representa sua marca</p>
                          </div>
                          <Separator />

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-slate-700">Selecione o Tema</Label>
                  <Select
                    value={company?.booking_engine_theme || "default"}
                    onValueChange={(value) => {
                      updateCompanyMutation.mutate({
                        booking_engine_theme: value,
                      });
                    }}
                  >
                                <SelectTrigger className="h-11">
                      <SelectValue placeholder="Selecione um tema" />
                    </SelectTrigger>
                    <SelectContent>
                                  <SelectItem value="default">Default - Azul Clássico</SelectItem>
                                  <SelectItem value="modern">Modern - Gradiente Moderno</SelectItem>
                                  <SelectItem value="luxury">Luxury - Roxo Premium</SelectItem>
                                  <SelectItem value="minimal">Minimal - Branco Minimalista</SelectItem>
                                  <SelectItem value="dark">Dark - Modo Escuro</SelectItem>
                                  <SelectItem value="travel">Travel Landing Page - Estilo Booking.com</SelectItem>
                                  <SelectItem value="airbnb">Airbnb - Travel Landing Clean & Friendly</SelectItem>
                    </SelectContent>
                  </Select>
                            </div>

                            {/* Preview dos Temas */}
                            <div className="space-y-3">
                              <Label className="text-sm font-medium text-slate-700">Preview dos Temas</Label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {(["default", "modern", "luxury", "minimal", "dark", "travel", "airbnb"] as const).map((themeKey) => {
                                  const isSelected = (company?.booking_engine_theme || "default") === themeKey;
                                  const themePreviews = {
                                    default: {
                                      hero: "bg-gradient-to-br from-blue-600 via-blue-500 to-blue-700",
                                      card: "bg-white border-slate-200",
                                      button: "bg-blue-600 text-white",
                                      text: "text-slate-900",
                                      name: "Default",
                                      desc: "Azul clássico e limpo"
                                    },
                                    modern: {
                                      hero: "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950",
                                      card: "bg-slate-800/90 border-slate-700",
                                      button: "bg-amber-500 text-slate-900",
                                      text: "text-white",
                                      name: "Modern",
                                      desc: "Gradiente moderno"
                                    },
                                    luxury: {
                                      hero: "bg-gradient-to-br from-slate-950 via-purple-950/30 to-slate-950",
                                      card: "bg-slate-900/90 border-purple-800/30",
                                      button: "bg-gradient-to-r from-purple-600 to-purple-700 text-white",
                                      text: "text-white",
                                      name: "Luxury",
                                      desc: "Roxo premium"
                                    },
                                    minimal: {
                                      hero: "bg-gradient-to-br from-slate-50 to-white",
                                      card: "bg-white border-slate-100",
                                      button: "bg-slate-900 text-white",
                                      text: "text-slate-900",
                                      name: "Minimal",
                                      desc: "Branco minimalista"
                                    },
                                    dark: {
                                      hero: "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950",
                                      card: "bg-slate-900/90 border-slate-700",
                                      button: "bg-blue-600 text-white",
                                      text: "text-white",
                                      name: "Dark",
                                      desc: "Modo escuro"
                                    },
                                    travel: {
                                      hero: "bg-gradient-to-br from-[#003580] via-[#0047a3] to-[#0059b3]",
                                      card: "bg-white border-slate-200",
                                      button: "bg-[#0071c2] text-white",
                                      text: "text-white",
                                      name: "Travel Landing",
                                      desc: "Estilo Booking.com"
                                    },
                                    airbnb: {
                                      hero: "bg-gradient-to-br from-white via-neutral-50 to-neutral-100",
                                      card: "bg-white border-neutral-200",
                                      button: "bg-[#FF5A5F] text-white",
                                      text: "text-neutral-900",
                                      name: "Airbnb",
                                      desc: "Clean & friendly"
                                    }
                                  };

                                  const preview = themePreviews[themeKey];

                                  return (
                                    <button
                                      key={themeKey}
                                      type="button"
                                      onClick={() => {
                                        updateCompanyMutation.mutate({
                                          booking_engine_theme: themeKey,
                                        });
                                      }}
                                      className={`relative p-4 rounded-xl border-2 transition-all text-left group ${
                                        isSelected
                                          ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/50 shadow-md"
                                          : "border-slate-200 hover:border-slate-300 bg-white hover:shadow-sm"
                                      }`}
                                    >
                                      {isSelected && (
                                        <div className="absolute top-3 right-3 z-10">
                                          <div className="bg-blue-600 rounded-full p-1">
                                            <CheckCircle2 className="w-4 h-4 text-white" />
                                          </div>
                                        </div>
                                      )}
                                      <div className="space-y-3">
                                        <div>
                                          <h4 className="font-semibold text-sm text-slate-900 mb-0.5">
                                            {preview.name}
                                          </h4>
                                          <p className="text-xs text-slate-500">{preview.desc}</p>
                                        </div>
                                        <div className="space-y-2">
                                          {/* Hero Preview */}
                                          <div className={`h-16 rounded-lg ${preview.hero} relative overflow-hidden shadow-inner`}>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                              <span className={`text-xs font-semibold ${preview.text === "text-white" ? "text-white drop-shadow-lg" : "text-slate-700"}`}>
                                                Hero Section
                                              </span>
                                            </div>
                                            {themeKey === "luxury" && (
                                              <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 to-transparent" />
                                            )}
                                          </div>
                                          {/* Card Preview */}
                                          <div className={`p-3 rounded-lg border ${preview.card} shadow-sm`}>
                                            <div className={`text-xs font-medium mb-2 ${preview.text}`}>
                                              Card de Exemplo
                                            </div>
                                            <div className={`h-7 rounded-md ${preview.button} flex items-center justify-center shadow-sm transition-transform group-hover:scale-105`}>
                                              <span className="text-xs font-semibold text-white">
                                                Botão Principal
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* Modo de visualização da página de reservas */}
                    <Card className="p-6 border-slate-200 shadow-sm">
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 mb-1">Visualização da Página de Reservas</h3>
                          <p className="text-sm text-slate-500">Escolha como as categorias e planos tarifários são exibidos na lista de quartos</p>
                        </div>
                        <Separator />
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Modo de exibição</Label>
                          <Select
                            value={company?.booking_engine_rooms_view_mode || "by_category"}
                            onValueChange={(value) => {
                              updateCompanyMutation.mutate({
                                booking_engine_rooms_view_mode: value,
                              });
                            }}
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Selecione o modo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="by_category">Por categoria (grid 2x2 - 4 cards)</SelectItem>
                              <SelectItem value="by_category_single">Por categoria (1 card por categoria - largura total)</SelectItem>
                              <SelectItem value="by_plan">Por plano tarifário (2 cards por categoria)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-6 border-slate-200 shadow-sm">
                      <div className="space-y-6">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 mb-1">Logo e Favicon</h3>
                          <p className="text-sm text-slate-500">Personalize a identidade visual do motor</p>
                        </div>
                        <Separator />

                        <div className="space-y-6">
                          <div className="space-y-3">
                            <Label className="text-sm font-medium text-slate-700">Logo do Motor</Label>
                            <div className="flex items-start gap-4">
                              {logoPreview && (
                                <div className="relative flex-shrink-0">
                                  <img
                                    src={logoPreview}
                                    alt="Logo preview"
                                    className="h-20 w-auto object-contain border-2 border-slate-200 rounded-lg p-3 bg-white"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 hover:bg-red-600 text-white"
                                    onClick={handleRemoveLogo}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                              <div className="flex-1 space-y-2">
                                <Input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleLogoUpload}
                                  disabled={isUploadingLogo}
                                  className="cursor-pointer h-11"
                                />
                                <p className="text-xs text-slate-500">
                                  Recomendado: PNG ou SVG, máximo 5MB. O logo será exibido no header do motor.
                                </p>
                                {isUploadingLogo && (
                                  <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Enviando...
                </div>
              )}
                              </div>
                            </div>
                          </div>

                          <Separator />

                          <div className="space-y-3">
                            <Label className="text-sm font-medium text-slate-700">Favicon do Motor</Label>
                            <div className="flex items-start gap-4">
                              {faviconPreview && (
                                <div className="relative flex-shrink-0">
                                  <img
                                    src={faviconPreview}
                                    alt="Favicon preview"
                                    className="h-20 w-20 object-contain border-2 border-slate-200 rounded-lg p-3 bg-white"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-500 hover:bg-red-600 text-white"
                                    onClick={handleRemoveFavicon}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                              <div className="flex-1 space-y-2">
                                <Input
                                  type="file"
                                  accept="image/*"
                                  onChange={handleFaviconUpload}
                                  disabled={isUploadingFavicon}
                                  className="cursor-pointer h-11"
                                />
                                <p className="text-xs text-slate-500">
                                  Recomendado: ICO, PNG ou SVG, máximo 1MB. Tamanho ideal: 32x32 ou 64x64 pixels.
                                </p>
                                {isUploadingFavicon && (
                                  <div className="flex items-center gap-2 text-sm text-slate-600">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Enviando...
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>

                    {canUseAdvancedCustomization && (
                      <Card className="p-6 border-slate-200 shadow-sm">
                        <div className="space-y-6">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-1">Customização Avançada</h3>
                            <p className="text-sm text-slate-500">Ajuste cores e fontes do motor de reservas</p>
                          </div>
                          <Separator />

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-slate-700">Cor Primária</Label>
                              <div className="flex items-center gap-3">
                                <Input
                                  type="color"
                                  value={
                                    (company?.booking_engine_theme_config as any)?.primaryColor ||
                                    "#2563eb"
                                  }
                                  onChange={(e) => {
                                    const currentConfig = (company?.booking_engine_theme_config || {}) as any;
                                    updateCompanyMutation.mutate({
                                      booking_engine_theme_config: {
                                        ...currentConfig,
                                        primaryColor: e.target.value,
                                      },
                                    });
                                  }}
                                  className="h-12 w-20 p-1 cursor-pointer rounded-lg border-2 border-slate-200"
                                />
                                <div className="flex-1">
                                  <Input
                                    value={
                                      (company?.booking_engine_theme_config as any)?.primaryColor ||
                                      "#2563eb"
                                    }
                                    readOnly
                                    className="h-11 font-mono text-sm"
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-slate-700">Fonte</Label>
                              <Select
                                value={
                                  (company?.booking_engine_theme_config as any)?.fontFamily ||
                                  "system"
                                }
                                onValueChange={(value) => {
                                  const currentConfig = (company?.booking_engine_theme_config || {}) as any;
                                  updateCompanyMutation.mutate({
                                    booking_engine_theme_config: {
                                      ...currentConfig,
                                      fontFamily: value,
                                    },
                                  });
                                }}
                              >
                                <SelectTrigger className="h-11">
                                  <SelectValue placeholder="Selecione uma fonte" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="system">Padrão do sistema</SelectItem>
                                  <SelectItem value="inter">Inter</SelectItem>
                                  <SelectItem value="poppins">Poppins</SelectItem>
                                  <SelectItem value="lato">Lato</SelectItem>
                                  <SelectItem value="serif">Serif Clássica</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>

                  {/* Preview Lateral */}
                  <div className="lg:col-span-1">
                    <Card className="p-6 border-slate-200 shadow-sm sticky top-24">
                      <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-slate-900">Preview da Identidade</h4>
                        <div className="space-y-4">
                          {logoPreview ? (
                            <div className="p-4 border-2 border-slate-200 rounded-lg bg-white">
                              <img
                                src={logoPreview}
                                alt="Logo preview"
                                className="h-12 w-auto object-contain mx-auto"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          ) : (
                            <div className="p-4 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 text-center">
                              <p className="text-xs text-slate-400">Logo não configurado</p>
                            </div>
                          )}
                          
                          {faviconPreview ? (
                            <div className="p-4 border-2 border-slate-200 rounded-lg bg-white">
                              <img
                                src={faviconPreview}
                                alt="Favicon preview"
                                className="h-12 w-12 object-contain mx-auto"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          ) : (
                            <div className="p-4 border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 text-center">
                              <p className="text-xs text-slate-400">Favicon não configurado</p>
                            </div>
                          )}

                          {(company?.booking_engine_theme_config as any)?.primaryColor && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-slate-700">Cor Primária</p>
                              <div
                                className="h-12 rounded-lg border-2 border-slate-200"
                                style={{
                                  backgroundColor: (company?.booking_engine_theme_config as any)?.primaryColor || "#2563eb"
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              {/* Aba Conteúdo da Página (Hero) */}
              <TabsContent value="conteudo" className="space-y-6 mt-0">
              {canUseThemes && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <Card className="p-6 border-slate-200 shadow-sm">
                        <div className="space-y-6">
                          <div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-1">Hero Section</h3>
                            <p className="text-sm text-slate-500">Configure a seção principal da landing page</p>
                          </div>
                          <Separator />

                          <div className="space-y-4">
                  <div className="space-y-2">
                              <Label className="text-sm font-medium text-slate-700">
                      Imagem de Fundo do Hero (URL)
                    </Label>
                    <Input
                      placeholder="https://exemplo.com/imagem.jpg"
                      value={company?.booking_engine_hero_image || ""}
                      onChange={(e) => {
                        updateCompanyMutation.mutate({
                          booking_engine_hero_image: e.target.value.trim() || null,
                        });
                      }}
                                className="h-11"
                    />
                              <p className="text-xs text-slate-500">
                                Deixe em branco para usar a imagem padrão
                    </p>
                    {company?.booking_engine_hero_image && (
                                <div className="mt-3">
                        <img
                          src={company.booking_engine_hero_image}
                          alt="Preview"
                                    className="w-full h-48 object-cover rounded-lg border-2 border-slate-200"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                              <Label className="text-sm font-medium text-slate-700">Título do Hero</Label>
                    <Input
                      placeholder="Reserve sua estadia"
                                defaultValue={company?.booking_engine_hero_title || ""}
                                onBlur={(e) => {
                                  const value = e.target.value.trim() || null;
                                  if (value !== (company?.booking_engine_hero_title || "")) {
                        updateCompanyMutation.mutate({
                                      booking_engine_hero_title: value,
                        });
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.currentTarget.blur();
                                  }
                      }}
                                className="h-11"
                    />
                  </div>

                  <div className="space-y-2">
                              <Label className="text-sm font-medium text-slate-700">Subtítulo do Hero</Label>
                    <Textarea
                      placeholder="Encontre o quarto ideal para sua próxima estadia..."
                                defaultValue={company?.booking_engine_hero_subtitle || ""}
                                onBlur={(e) => {
                                  const value = e.target.value.trim() || null;
                                  if (value !== (company?.booking_engine_hero_subtitle || "")) {
                        updateCompanyMutation.mutate({
                                      booking_engine_hero_subtitle: value,
                        });
                                  }
                      }}
                      rows={3}
                                className="resize-none"
                    />
                            </div>
                          </div>
                        </div>
                      </Card>
                    </div>

                    {/* Preview Lateral do Hero */}
                    <div className="lg:col-span-1">
                      <Card className="p-6 border-slate-200 shadow-sm sticky top-24">
                        <div className="space-y-4">
                          <h4 className="text-sm font-semibold text-slate-900">Preview do Hero</h4>
                          <div className="relative h-64 rounded-lg border-2 border-slate-200 overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
                            {company?.booking_engine_hero_image ? (
                              <img
                                src={company.booking_engine_hero_image}
                                alt="Hero preview"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : null}
                            <div className="absolute inset-0 bg-black/20 flex flex-col items-center justify-center p-6 text-center">
                              <h5 className="text-lg font-bold text-white mb-2">
                                {company?.booking_engine_hero_title || "Título do Hero"}
                              </h5>
                              <p className="text-sm text-white/90">
                                {company?.booking_engine_hero_subtitle || "Subtítulo do Hero"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Card>
                  </div>
                </div>
              )}
              </TabsContent>

              {/* Aba Contato & Redes Sociais */}
              <TabsContent value="contato" className="space-y-6 mt-0">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card className="p-6 border-slate-200 shadow-sm">
                    <div className="space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">Contato Geral</h3>
                        <p className="text-sm text-slate-500">Informações de contato exibidas no rodapé</p>
                    </div>
                      <Separator />

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Telefone</Label>
                          <Input
                            placeholder="(11) 99999-9999"
                            defaultValue={company?.booking_engine_contact_phone || ""}
                            onBlur={(e) => {
                              const value = e.target.value.trim() || null;
                              if (value !== (company?.booking_engine_contact_phone || "")) {
                                updateCompanyMutation.mutate({
                                  booking_engine_contact_phone: value,
                                });
                              }
                            }}
                            className="h-11"
                          />
                  </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Email</Label>
                          <Input
                            type="email"
                            placeholder="contato@empresa.com.br"
                            defaultValue={company?.booking_engine_contact_email || ""}
                            onBlur={(e) => {
                              const value = e.target.value.trim() || null;
                              if (value !== (company?.booking_engine_contact_email || "")) {
                                updateCompanyMutation.mutate({
                                  booking_engine_contact_email: value,
                                });
                              }
                            }}
                            className="h-11"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">WhatsApp - DDI</Label>
                  <Input
                              placeholder="55"
                              defaultValue={company?.booking_engine_contact_whatsapp_ddi || ""}
                              onBlur={(e) => {
                                const value = e.target.value.trim() || null;
                                if (value !== (company?.booking_engine_contact_whatsapp_ddi || "")) {
                      updateCompanyMutation.mutate({
                                    booking_engine_contact_whatsapp_ddi: value,
                      });
                                }
                    }}
                              className="h-11"
                  />
                </div>

                    <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">WhatsApp - Número</Label>
                      <Input
                              placeholder="11999999999"
                              defaultValue={company?.booking_engine_contact_whatsapp_number || ""}
                              onBlur={(e) => {
                                const value = e.target.value.trim() || null;
                                if (value !== (company?.booking_engine_contact_whatsapp_number || "")) {
                                  updateCompanyMutation.mutate({
                                    booking_engine_contact_whatsapp_number: value,
                                  });
                                }
                              }}
                              className="h-11"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">CNPJ</Label>
                          <Input
                            placeholder="00.000.000/0000-00"
                            defaultValue={company?.booking_engine_contact_cnpj || ""}
                            onBlur={(e) => {
                              const value = e.target.value.trim() || null;
                              if (value !== (company?.booking_engine_contact_cnpj || "")) {
                          updateCompanyMutation.mutate({
                                  booking_engine_contact_cnpj: value,
                          });
                              }
                        }}
                            className="h-11"
                      />
                    </div>
                      </div>
                    </div>
                  </Card>

                  <Card className="p-6 border-slate-200 shadow-sm">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">Redes Sociais</h3>
                        <p className="text-sm text-slate-500">Links para redes sociais exibidos no rodapé</p>
                      </div>
                      <Separator />

                      <div className="space-y-4">
                    <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">WhatsApp</Label>
                          <Input
                            placeholder="https://wa.me/5511999999999"
                            defaultValue={company?.booking_engine_social_whatsapp || ""}
                            onBlur={(e) => {
                              const value = e.target.value.trim() || null;
                              if (value !== (company?.booking_engine_social_whatsapp || "")) {
                                updateCompanyMutation.mutate({
                                  booking_engine_social_whatsapp: value,
                                });
                              }
                            }}
                            className="h-11"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Instagram</Label>
                          <Input
                            placeholder="https://instagram.com/seu_perfil"
                            defaultValue={company?.booking_engine_social_instagram || ""}
                            onBlur={(e) => {
                              const value = e.target.value.trim() || null;
                              if (value !== (company?.booking_engine_social_instagram || "")) {
                          updateCompanyMutation.mutate({
                                  booking_engine_social_instagram: value,
                                });
                              }
                            }}
                            className="h-11"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Facebook</Label>
                          <Input
                            placeholder="https://facebook.com/seu_perfil"
                            defaultValue={company?.booking_engine_social_facebook || ""}
                            onBlur={(e) => {
                              const value = e.target.value.trim() || null;
                              if (value !== (company?.booking_engine_social_facebook || "")) {
                                updateCompanyMutation.mutate({
                                  booking_engine_social_facebook: value,
                                });
                              }
                            }}
                            className="h-11"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Twitter / X</Label>
                          <Input
                            placeholder="https://twitter.com/seu_perfil"
                            defaultValue={company?.booking_engine_social_twitter || ""}
                            onBlur={(e) => {
                              const value = e.target.value.trim() || null;
                              if (value !== (company?.booking_engine_social_twitter || "")) {
                                updateCompanyMutation.mutate({
                                  booking_engine_social_twitter: value,
                                });
                              }
                            }}
                            className="h-11"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">YouTube</Label>
                          <Input
                            placeholder="https://youtube.com/seu_canal"
                            defaultValue={company?.booking_engine_social_youtube || ""}
                            onBlur={(e) => {
                              const value = e.target.value.trim() || null;
                              if (value !== (company?.booking_engine_social_youtube || "")) {
                                updateCompanyMutation.mutate({
                                  booking_engine_social_youtube: value,
                                });
                              }
                            }}
                            className="h-11"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">LinkedIn</Label>
                          <Input
                            placeholder="https://linkedin.com/company/sua-empresa"
                            defaultValue={company?.booking_engine_social_linkedin || ""}
                            onBlur={(e) => {
                              const value = e.target.value.trim() || null;
                              if (value !== (company?.booking_engine_social_linkedin || "")) {
                                updateCompanyMutation.mutate({
                                  booking_engine_social_linkedin: value,
                                });
                              }
                            }}
                            className="h-11"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Site Oficial</Label>
                          <Input
                            placeholder="https://www.seusite.com.br"
                            defaultValue={company?.booking_engine_social_website || ""}
                            onBlur={(e) => {
                              const value = e.target.value.trim() || null;
                              if (value !== (company?.booking_engine_social_website || "")) {
                                updateCompanyMutation.mutate({
                                  booking_engine_social_website: value,
                          });
                              }
                        }}
                            className="h-11"
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              </TabsContent>

              {/* Aba Integrações */}
              <TabsContent value="integracoes" className="space-y-6 mt-0">
                <Card className="p-6 border-slate-200 shadow-sm">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">Sistema de Chat para Hóspedes</h3>
                        <p className="text-sm text-slate-500">Configure um sistema de chat para contato direto</p>
                      </div>
                      <Switch
                        checked={localChatEnabled}
                        onCheckedChange={(checked) => {
                          setLocalChatEnabled(checked);
                          updateCompanyMutation.mutate({
                            booking_engine_chat_enabled: checked,
                          });
                        }}
                      />
                    </div>
                    <Separator />

                    {localChatEnabled && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Tipo de Chat</Label>
                          <Select 
                            defaultValue={company?.booking_engine_chat_type || "chatwoot"}
                        onValueChange={(value) => {
                          updateCompanyMutation.mutate({
                                booking_engine_chat_type: value,
                          });
                        }}
                      >
                            <SelectTrigger className="h-11">
                              <SelectValue placeholder="Selecione o tipo de chat" />
                        </SelectTrigger>
                        <SelectContent>
                              <SelectItem value="chatwoot">Chatwoot</SelectItem>
                              <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        </SelectContent>
                      </Select>
                          <p className="text-xs text-slate-500">
                            Escolha entre Chatwoot ou WhatsApp para contato direto com hóspedes
                          </p>
                    </div>

                        {/* Configurações do Chatwoot */}
                        {(!company?.booking_engine_chat_type || company?.booking_engine_chat_type === "chatwoot") && (
                          <div className="space-y-4 pt-4 border-t">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-slate-700">Estilo do Botão</Label>
                              <Select 
                                defaultValue={company?.booking_engine_chat_button_style || "custom"}
                                onValueChange={(value) => {
                                  updateCompanyMutation.mutate({
                                    booking_engine_chat_button_style: value,
                                  });
                                }}
                              >
                                <SelectTrigger className="h-11">
                                  <SelectValue placeholder="Selecione o estilo do botão" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="native">Ícone Nativo do Chatwoot</SelectItem>
                                  <SelectItem value="custom">Botão Customizado com Efeito Pulsante</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-slate-500">
                                Escolha entre o botão nativo do Chatwoot ou um botão customizado com efeito pulsante
                              </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-slate-700">BASE_URL do Chatwoot</Label>
                                <Input
                                  placeholder="https://app.agentslabs.cloud"
                                  defaultValue={company?.booking_engine_chat_base_url || ""}
                                  onBlur={(e) => {
                                    const value = e.target.value.trim() || null;
                                    if (value !== (company?.booking_engine_chat_base_url || "")) {
                                      updateCompanyMutation.mutate({
                                        booking_engine_chat_base_url: value,
                                      });
                                    }
                                  }}
                                  className="h-11"
                                />
                                <p className="text-xs text-slate-500">
                                  URL base do seu Chatwoot
                                </p>
                              </div>

                              <div className="space-y-2">
                                <Label className="text-sm font-medium text-slate-700">Website Token</Label>
                                <Input
                                  placeholder="Xaa19ZAndw2xPJysscdpS5dN"
                                  defaultValue={company?.booking_engine_chat_website_token || ""}
                                  onBlur={(e) => {
                                    const value = e.target.value.trim() || null;
                                    if (value !== (company?.booking_engine_chat_website_token || "")) {
                                      updateCompanyMutation.mutate({
                                        booking_engine_chat_website_token: value,
                                      });
                                    }
                                  }}
                                  className="h-11"
                                />
                                <p className="text-xs text-slate-500">
                                  Token do website configurado no Chatwoot
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Configurações do WhatsApp */}
                        {company?.booking_engine_chat_type === "whatsapp" && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-slate-700">DDI do WhatsApp</Label>
                              <Input
                                placeholder="55"
                                defaultValue={company?.booking_engine_contact_whatsapp_ddi || ""}
                                onBlur={(e) => {
                                  const value = e.target.value.trim() || null;
                                  if (value !== (company?.booking_engine_contact_whatsapp_ddi || "")) {
                                    updateCompanyMutation.mutate({
                                      booking_engine_contact_whatsapp_ddi: value,
                                    });
                                  }
                                }}
                                className="h-11"
                              />
                              <p className="text-xs text-slate-500">
                                Código do país (ex: 55 para Brasil)
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-slate-700">Número do WhatsApp</Label>
                              <Input
                                placeholder="11999999999"
                                defaultValue={company?.booking_engine_contact_whatsapp_number || ""}
                                onBlur={(e) => {
                                  const value = e.target.value.trim() || null;
                                  if (value !== (company?.booking_engine_contact_whatsapp_number || "")) {
                                    updateCompanyMutation.mutate({
                                      booking_engine_contact_whatsapp_number: value,
                                    });
                                  }
                                }}
                                className="h-11"
                              />
                              <p className="text-xs text-slate-500">
                                Número sem espaços ou caracteres especiais (ex: 11999999999)
                              </p>
                            </div>
                          </div>
                        )}

                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                            <div className="space-y-1">
                              <p className="text-sm font-medium text-blue-900">Status da Conexão</p>
                              <p className="text-xs text-blue-700">
                                {company?.booking_engine_chat_base_url && company?.booking_engine_chat_website_token
                                  ? "Configuração completa. O chat estará disponível no motor de reservas."
                                  : "Preencha os campos acima para ativar o chat."}
                              </p>
                            </div>
                          </div>
                  </div>
                </div>
              )}
            </div>
          </Card>
              </TabsContent>

              {/* Aba Domínio & SEO */}
              <TabsContent value="dominio" className="space-y-6 mt-0">
                {canUseCustomDomain && (
                  <Card className="p-6 border-slate-200 shadow-sm">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 mb-1">Domínio Personalizado</h3>
                          <p className="text-sm text-slate-500">Configure um domínio próprio para o motor de reservas</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setShowDnsHelp(true)}
                        >
                          <HelpCircle className="w-5 h-5" />
                        </Button>
                      </div>
                      <Separator />

            <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-slate-700">Domínio Personalizado</Label>
                          <Input
                            placeholder="Ex: reservas.empresa.com.br"
                            value={localCustomDomain}
                            onChange={(e) => {
                              setLocalCustomDomain(e.target.value);
                            }}
                            onBlur={() => {
                              const trimmedValue = localCustomDomain.trim() || null;
                              if (trimmedValue !== (company?.booking_engine_custom_domain || "")) {
                                updateCompanyMutation.mutate({
                                  booking_engine_custom_domain: trimmedValue,
                                });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                            className="h-11"
                          />
                          {localCustomDomain && (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span>URL do motor:</span>
                              <code className="bg-slate-100 px-2 py-1 rounded text-blue-600 font-mono">
                                https://{localCustomDomain}
                              </code>
              </div>
                          )}
                        </div>

                        {systemBaseDomain && (
                          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-xs text-amber-800 font-medium mb-2">
                              ⚠️ Instruções de Configuração DNS
                            </p>
                            <p className="text-xs text-amber-700 mb-2">
                              Para apontar corretamente, crie um registro <code className="bg-amber-100 px-1 py-0.5 rounded">CNAME</code> no seu DNS direcionando para:
                            </p>
                            <code className="block bg-amber-100 px-3 py-2 rounded text-xs font-mono text-amber-900">
                              {systemBaseDomain}
                            </code>
                            <Button
                              type="button"
                              variant="link"
                              size="sm"
                              className="text-xs text-amber-800 p-0 h-auto mt-2"
                              onClick={() => setShowDnsHelp(true)}
                            >
                              Ver instruções detalhadas →
                            </Button>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
              <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Status DNS</Label>
                            <div className="flex items-center gap-2">
                              {!localCustomDomain ? (
                                <>
                                  <div className="h-2 w-2 rounded-full bg-slate-300" />
                                  <span className="text-sm text-slate-500">Não configurado</span>
                                </>
                              ) : dnsStatus === "checking" ? (
                                <>
                                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                                  <span className="text-sm text-slate-600">Verificando...</span>
                                </>
                              ) : dnsStatus === "active" ? (
                                <>
                                  <div className="h-2 w-2 rounded-full bg-green-500" />
                                  <span className="text-sm text-green-700 font-medium">Configurado e ativo</span>
                                </>
                              ) : (
                                <>
                                  <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                  <span className="text-sm text-amber-600">Aguardando configuração</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700">Status SSL</Label>
                            <div className="flex items-center gap-2">
                              {!localCustomDomain ? (
                                <>
                                  <div className="h-2 w-2 rounded-full bg-slate-300" />
                                  <span className="text-sm text-slate-500">N/A</span>
                                </>
                              ) : sslStatus === "checking" ? (
                                <>
                                  <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                                  <span className="text-sm text-slate-600">Verificando...</span>
                                </>
                              ) : sslStatus === "active" ? (
                                <>
                                  <div className="h-2 w-2 rounded-full bg-green-500" />
                                  <span className="text-sm text-green-700 font-medium">Certificado ativo</span>
                                </>
                              ) : (
                                <>
                                  <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                  <span className="text-sm text-amber-600">Provisionamento automático</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}
              </TabsContent>

              {/* Aba Estabelecimentos no Motor */}
              <TabsContent value="estabelecimentos" className="space-y-6 mt-0">
                <Card className="p-6 border-slate-200 shadow-sm">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900 mb-1">Estabelecimentos no Motor</h3>
                        <p className="text-sm text-slate-500">
                          Selecione e organize os estabelecimentos que aparecerão no motor
                        </p>
                      </div>
                      <Badge variant="outline" className="text-sm">
                        {engineEstablishments?.length || 0} estabelecimento(s) ativo(s)
                      </Badge>
                    </div>
                    <Separator />

                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <Input
                          placeholder="Buscar estabelecimento..."
                          value={searchEstablishment}
                          onChange={(e) => setSearchEstablishment(e.target.value)}
                          className="pl-10 h-11"
                        />
                      </div>

                      <div className="space-y-2 max-h-[600px] overflow-y-auto">
                        {filteredEstablishments.length === 0 ? (
                          <div className="text-center py-12 text-slate-500">
                            <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                            <p className="text-sm">Nenhum estabelecimento encontrado</p>
                          </div>
                        ) : (
                          // Ordenar: primeiro os que estão no motor (ordenados por display_order), depois os outros
                          [...filteredEstablishments].sort((a: any, b: any) => {
                            const aInEngine = isEstablishmentInEngine(a.id);
                            const bInEngine = isEstablishmentInEngine(b.id);
                            
                            if (aInEngine && !bInEngine) return -1;
                            if (!aInEngine && bInEngine) return 1;
                            
                            if (aInEngine && bInEngine) {
                              const aEntry = sortedEngineEstablishments.find((e: any) => e.establishment_id === a.id);
                              const bEntry = sortedEngineEstablishments.find((e: any) => e.establishment_id === b.id);
                              const aOrder = aEntry?.display_order ?? 999999;
                              const bOrder = bEntry?.display_order ?? 999999;
                              return aOrder - bOrder;
                            }
                            
                            return (a.name || "").localeCompare(b.name || "");
                          }).map((est: any) => {
                  const isInEngine = isEstablishmentInEngine(est.id);
                  const engineEntry = engineEstablishments?.find(
                    (e: any) => e.establishment_id === est.id
                  );
                            const currentIndex = engineEntry
                              ? engineEstablishments?.findIndex(
                                  (e: any) => e.establishment_id === est.id
                                )
                              : -1;
                  
                  return (
                    <div
                      key={est.id}
                      draggable={isInEngine}
                      onDragStart={(e) => isInEngine && handleDragStart(e, est.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => isInEngine && handleDrop(e, est.id)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-3 p-4 border-2 rounded-lg transition-all ${
                        isInEngine
                          ? "border-blue-200 bg-blue-50/50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      } ${
                        draggedItemId === est.id
                          ? "opacity-50 scale-95"
                          : draggedItemId && isInEngine
                          ? "border-blue-400 bg-blue-100"
                          : ""
                      } ${isInEngine ? "cursor-move" : ""}`}
                    >
                      {isInEngine && (
                        <GripVertical className="w-5 h-5 text-slate-400 cursor-move flex-shrink-0" />
                      )}
                        <Checkbox
                          checked={isInEngine}
                          onCheckedChange={(checked) => {
                            toggleEstablishmentMutation.mutate({
                              establishmentId: est.id,
                              isActive: checked as boolean,
                            });
                          }}
                                  className="flex-shrink-0"
                        />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-slate-900">{est.name}</div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-xs">
                            {est.type === 'hotel' ? 'Hotel' : est.type === 'apartment' ? 'Apartamento' : 'Outro'}
                                    </Badge>
                                    {isInEngine && currentIndex !== -1 && (
                                      <span className="text-xs text-slate-500">
                                        Posição: {currentIndex + 1}
                                      </span>
                                    )}
                        </div>
                      </div>
                      
                      {isInEngine && engineEntry && (
                                  <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              reorderEstablishmentMutation.mutate({
                                establishmentId: est.id,
                                direction: "up",
                              });
                            }}
                                      disabled={currentIndex === 0}
                                      className="h-8 w-8"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              reorderEstablishmentMutation.mutate({
                                establishmentId: est.id,
                                direction: "down",
                              });
                            }}
                                      disabled={currentIndex === (engineEstablishments?.length || 0) - 1}
                                      className="h-8 w-8"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                          })
                        )}
                      </div>
              </div>
            </div>
          </Card>
              </TabsContent>

              {/* Aba Avançado */}
              <TabsContent value="avancado" className="space-y-6 mt-0">
                <Card className="p-6 border-slate-200 shadow-sm">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">Configurações Avançadas</h3>
                      <p className="text-sm text-slate-500">Scripts personalizados e configurações técnicas</p>
                    </div>
                    <Separator />

                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                        <p className="text-sm text-slate-600">
                          As configurações avançadas estarão disponíveis em breve. Esta seção permitirá adicionar scripts personalizados, pixels de rastreamento (Meta, Google), CSS customizado e webhooks.
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="seo" className="space-y-6 mt-0">
                <Card className="p-6 border-slate-200 shadow-sm">
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">SEO e indexação</h3>
                      <p className="text-sm text-slate-500">Sitemap e robots.txt para mecanismos de busca</p>
                    </div>
                    <Separator />
                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                          <Map className="w-4 h-4" />
                          Sitemap (URLs indexáveis)
                        </Label>
                        <p className="text-xs text-slate-500 mt-1 mb-2">
                          O sitemap é gerado automaticamente com todas as URLs públicas do motor de reservas e da página de reserva. Use a URL abaixo no Google Search Console e em outros mecanismos de busca.
                        </p>
                        <div className="flex gap-2 items-center">
                          <Input
                            readOnly
                            value={typeof window !== "undefined" ? `${window.location.origin}/api/sitemap.xml` : ""}
                            className="font-mono text-sm"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const url = typeof window !== "undefined" ? `${window.location.origin}/api/sitemap.xml` : "";
                              if (url) {
                                window.open(url, "_blank");
                                navigator.clipboard.writeText(url).then(() => toast.success("URL copiada"));
                              }
                            }}
                          >
                            Abrir / Copiar
                          </Button>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                          Dica: configure no seu servidor (Vercel, Netlify, etc.) um redirect ou função que sirva o sitemap em /api/sitemap.xml ou /sitemap.xml apontando para a Edge Function do Supabase.
                        </p>
                      </div>
                      <Separator />
                      <div>
                        <Label className="text-sm font-medium text-slate-700 flex items-center gap-2">
                          <FileText className="w-4 h-4" />
                          robots.txt
                        </Label>
                        <p className="text-xs text-slate-500 mt-1 mb-2">
                          Conteúdo do arquivo robots.txt (instruções para rastreadores). Deixe em branco para não alterar o comportamento padrão do servidor.
                        </p>
                        <Textarea
                          placeholder={"User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: https://seu-dominio.com/sitemap.xml"}
                          value={localRobotsTxt}
                          onChange={(e) => setLocalRobotsTxt(e.target.value)}
                          onBlur={() => {
                            const value = localRobotsTxt.trim() || null;
                            if (value !== (siteSettings?.robots_txt ?? null)) {
                              updateSiteSettings({ robots_txt: value });
                            }
                          }}
                          rows={10}
                          className="font-mono text-sm"
                        />
                        <p className="text-xs text-slate-500 mt-2">
                          O robots.txt deve ser servido em /robots.txt. Configure no seu host um endpoint que retorne este conteúdo com Content-Type: text/plain.
                        </p>
                      </div>
                    </div>
                  </div>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      )}

      {/* Dialog de Ajuda DNS */}
      <Dialog open={showDnsHelp} onOpenChange={setShowDnsHelp}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Como configurar DNS para domínio personalizado</DialogTitle>
            <DialogDescription>
              Siga as instruções abaixo para configurar o DNS do seu domínio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">Para Cloudflare:</h4>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Acesse o painel do Cloudflare</li>
                <li>Vá em DNS → Records</li>
                <li>Clique em "Add record"</li>
                <li>Selecione tipo "CNAME"</li>
                <li>Nome: reservas (ou o subdomínio desejado)</li>
                <li>Target: {systemBaseDomain}</li>
                <li>Proxy status: Desabilitado (DNS only)</li>
                <li>Salve o registro</li>
              </ol>
            </div>
            <Separator />
            <div>
              <h4 className="font-semibold mb-2">Para outros provedores:</h4>
              <ol className="list-decimal list-inside space-y-1 ml-2">
                <li>Acesse o painel de DNS do seu provedor</li>
                <li>Crie um novo registro do tipo CNAME</li>
                <li>Nome/Host: reservas (ou o subdomínio desejado)</li>
                <li>Valor/Destino: {systemBaseDomain}</li>
                <li>TTL: 3600 (ou padrão)</li>
                <li>Salve o registro</li>
                <li>Aguarde a propagação (pode levar até 48 horas)</li>
              </ol>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BookingEngineSettings;
