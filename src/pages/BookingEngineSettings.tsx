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
import { Loader2, Settings2, HelpCircle, ArrowUp, ArrowDown, Building2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

const BookingEngineSettings = () => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();
  const { settings: siteSettings } = useSiteSettings();
  const [showDnsHelp, setShowDnsHelp] = useState(false);
  const [localTitle, setLocalTitle] = useState<string>("");
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Buscar empresa atual
  // Se não houver selectedEstablishment, buscar através de qualquer estabelecimento do usuário
  const { data: company, isLoading: isLoadingCompany } = useQuery({
    queryKey: ["company", selectedEstablishment?.company_id, "fallback"],
    queryFn: async () => {
      // Se tiver selectedEstablishment, usar o company_id dele
      if (selectedEstablishment?.company_id) {
        const { data, error } = await supabase
          .from("companies")
          .select("*")
          .eq("id", selectedEstablishment.company_id)
          .maybeSingle();
        if (error) throw error;
        return data;
      }
      
      // Se não tiver selectedEstablishment, buscar através de user_companies ou employees
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      // Primeiro, tentar buscar através de employees (se o usuário é funcionário)
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
      
      // Se não encontrou através de employees, buscar através de user_companies
      const { data: userCompanies, error: userCompaniesError } = await supabase
        .from("user_companies")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1);
      
      if (userCompaniesError) throw userCompaniesError;
      if (!userCompanies || userCompanies.length === 0) return null;
      
      // Buscar a primeira empresa
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", userCompanies[0].company_id)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: true, // Sempre habilitado, busca de forma inteligente
  });

  // Buscar estabelecimentos da empresa para o motor
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

  // Buscar todos os estabelecimentos que o usuário administra (todas as empresas onde ele é proprietário/ligado)
  // Isso permite incluir estabelecimentos de outras empresas no motor de reservas
  const { data: allEstablishments, isLoading: isLoadingAll } = useQuery({
    queryKey: ["company_establishments_manager_scope", company?.id],
    queryFn: async () => {
      // Buscar usuário logado
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Buscar empresas vinculadas ao usuário (como proprietário)
      const { data: userCompanies, error: userCompaniesError } = await supabase
        .from("user_companies")
        .select("company_id, role, is_active")
        .eq("user_id", user.id)
        .eq("is_active", true);

      // Buscar estabelecimentos onde o usuário é funcionário (como gerente)
      const { data: employees, error: employeesError } = await supabase
        .from("employees")
        .select("establishment_id")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const companyIds = new Set<string>();

      // Adicionar empresas do usuário
      if (!userCompaniesError && userCompanies && userCompanies.length > 0) {
        userCompanies.forEach((uc: any) => {
          if (uc.company_id) companyIds.add(uc.company_id);
        });
      }

      // Adicionar empresas dos estabelecimentos onde o usuário é funcionário
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

      // Buscar todos os estabelecimentos destas empresas
      const { data: establishments, error: estError } = await supabase
        .from("establishments")
        .select("*")
        .in("company_id", Array.from(companyIds))
        .eq("is_active", true)
        .order("name");

      if (estError) throw estError;
      return establishments || [];
    },
    enabled: true, // Sempre habilitado para buscar estabelecimentos que o usuário administra
  });

  // Verificar feature flags
  const canUseBookingEngine = siteSettings?.features_enabled?.booking_engine_enabled !== false;
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

  // Detectar domínio base - usar pms_base_url das configurações do site, com fallback para window.location.host
  const systemBaseDomain = (() => {
    // Priorizar pms_base_url das configurações do site
    if (siteSettings?.pms_base_url) {
      try {
        const url = new URL(siteSettings.pms_base_url);
        return url.host;
      } catch {
        // Se não for uma URL válida, usar como está (pode ser apenas o hostname)
        return siteSettings.pms_base_url.replace(/^https?:\/\//, '').split('/')[0];
      }
    }
    // Fallback para window.location.host
    if (typeof window !== "undefined") {
      return window.location.host;
    }
    return "";
  })();

  // Função helper para gerar slug a partir do título
  const generateSlug = (title: string): string => {
    if (!title) return "";
    let slug = title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // Remove acentos
      .replace(/[^a-z0-9]+/g, "-") // Substitui não-alfanuméricos por hífen
      .replace(/^-+|-+$/g, ""); // Remove hífens no início/fim
    
    // Garantir que o slug não esteja vazio
    if (!slug) {
      slug = "motor-reservas";
    }
    
    return slug;
  };

  // Mutation para atualizar empresa
  const updateCompanyMutation = useMutation({
    mutationFn: async (updates: any) => {
      if (!company?.id) throw new Error("Empresa não encontrada");
      
      // Se o título do motor mudou, gerar slug automaticamente
      if (updates.booking_engine_title !== undefined) {
        const newTitle = updates.booking_engine_title?.trim() || null;
        if (newTitle) {
          let generatedSlug = generateSlug(newTitle);
          
          // Verificar se o slug já existe para outra empresa
          // Se existir, adicionar sufixo numérico
          let finalSlug = generatedSlug;
          let suffix = 1;
          while (true) {
            const { data: existing } = await supabase
              .from("companies")
              .select("id")
              .eq("booking_engine_slug", finalSlug)
              .neq("id", company.id)
              .maybeSingle();
            
            if (!existing) {
              break; // Slug disponível
            }
            
            finalSlug = `${generatedSlug}-${suffix}`;
            suffix++;
            
            // Limitar tentativas para evitar loop infinito
            if (suffix > 100) {
              finalSlug = `${generatedSlug}-${Date.now()}`;
              break;
            }
          }
          
          updates.booking_engine_slug = finalSlug;
          console.log("[BookingEngineSettings] Gerando slug:", { title: newTitle, slug: finalSlug });
        } else {
          updates.booking_engine_slug = null;
        }
      }
      
      console.log("[BookingEngineSettings] Atualizando empresa com:", updates);
      
      const { data, error } = await supabase
        .from("companies")
        .update(updates)
        .eq("id", company.id)
        .select()
        .single();
      
      if (error) {
        console.error("[BookingEngineSettings] Erro ao atualizar:", error);
        throw error;
      }
      
      console.log("[BookingEngineSettings] Empresa atualizada:", data);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company", company?.id] });
      toast.success("Configurações do motor atualizadas");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar configurações");
    },
  });

  // Mutation para adicionar/remover estabelecimento do motor
  const toggleEstablishmentMutation = useMutation({
    mutationFn: async ({ establishmentId, isActive }: { establishmentId: string; isActive: boolean }) => {
      if (!company?.id) throw new Error("Empresa não encontrada");
      
      if (isActive) {
        // Adicionar ao motor
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
        // Remover do motor
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
      toast.success("Estabelecimento atualizado no motor");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar estabelecimento");
    },
  });

  // Mutation para reordenar estabelecimentos
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
      
      // Trocar display_order
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

  // Sincronizar título local com o da empresa
  useEffect(() => {
    setLocalTitle(company?.booking_engine_title || "");
  }, [company?.booking_engine_title]);

  // Cleanup do timeout ao desmontar
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

  // Gerar slug a partir do título local (para preview)
  const previewSlug = localTitle ? generateSlug(localTitle) : (company?.booking_engine_slug || "");

  const isEstablishmentInEngine = (establishmentId: string) => {
    return engineEstablishments?.some(
      (e: any) => e.establishment_id === establishmentId && e.is_active
    ) || false;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold mb-2">Motor de Reservas</h2>
        <p className="text-muted-foreground">
          Configure o motor de reservas da empresa. O motor exibe todos os estabelecimentos configurados e permite que os hóspedes busquem disponibilidade antes de serem direcionados para a página pública de reservas.
        </p>
      </div>

      {!canUseBookingEngine && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            O Motor de Reservas não está habilitado para esta empresa. Entre em contato com o administrador do sistema.
          </p>
        </Card>
      )}

      {canUseBookingEngine && (
        <>
          {/* Configurações Gerais */}
          <Card className="p-6">
            <div className="space-y-6">
              <div className="flex items-center gap-2 mb-4">
                <Settings2 className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-semibold">Configurações Gerais</h3>
              </div>

              <Separator />

              {/* Título do Motor */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold text-slate-700">
                  Título do Motor de Reservas
                </Label>
                <Input
                  placeholder="Ex: Motor de Reservas"
                  value={localTitle}
                  onChange={(e) => {
                    const newTitle = e.target.value;
                    setLocalTitle(newTitle);
                    
                    // Limpar timeout anterior
                    if (saveTimeoutRef.current) {
                      clearTimeout(saveTimeoutRef.current);
                    }
                    
                    // Salvar após um pequeno delay (debounce)
                    saveTimeoutRef.current = setTimeout(() => {
                      updateCompanyMutation.mutate({
                        booking_engine_title: newTitle.trim() || null,
                      });
                    }, 1000);
                  }}
                  onBlur={() => {
                    // Limpar timeout pendente
                    if (saveTimeoutRef.current) {
                      clearTimeout(saveTimeoutRef.current);
                      saveTimeoutRef.current = null;
                    }
                    // Garantir que salve ao sair do campo
                    updateCompanyMutation.mutate({
                      booking_engine_title: localTitle.trim() || null,
                    });
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Título exibido no header do motor de reservas. Deixe em branco para usar o nome da empresa.
                  {previewSlug && (
                    <span className="block mt-1 text-blue-600 font-medium">
                      URL: /motor/{previewSlug}
                    </span>
                  )}
                </p>
              </div>

              {/* Tema do Motor */}
              {canUseThemes && (
                <div className="space-y-3">
                  <Label className="text-sm font-semibold text-slate-700">
                    Tema do Motor de Reservas
                  </Label>
                  <Select
                    value={company?.booking_engine_theme || "default"}
                    onValueChange={(value) => {
                      updateCompanyMutation.mutate({
                        booking_engine_theme: value,
                      });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione um tema" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Default</SelectItem>
                      <SelectItem value="modern">Modern</SelectItem>
                      <SelectItem value="luxury">Luxury</SelectItem>
                      <SelectItem value="minimal">Minimal</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    O tema define a estrutura visual (hero, cards, tipografia) do motor de reservas.
                  </p>
                </div>
              )}

              {/* Configuração do Hero Section */}
              {canUseThemes && (
                <div className="space-y-4 pt-4 border-t">
                  <Label className="text-sm font-semibold text-slate-700">
                    Hero Section do Motor de Reservas
                  </Label>
                  
                  {/* Imagem do Hero */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-slate-600">
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
                    />
                    <p className="text-xs text-muted-foreground">
                      Deixe em branco para usar a imagem padrão.
                    </p>
                    {company?.booking_engine_hero_image && (
                      <div className="mt-2">
                        <img
                          src={company.booking_engine_hero_image}
                          alt="Preview"
                          className="w-full h-32 object-cover rounded-lg border"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Título do Hero */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-slate-600">
                      Título do Hero
                    </Label>
                    <Input
                      placeholder="Reserve sua estadia"
                      value={company?.booking_engine_hero_title || ""}
                      onChange={(e) => {
                        updateCompanyMutation.mutate({
                          booking_engine_hero_title: e.target.value.trim() || null,
                        });
                      }}
                    />
                  </div>

                  {/* Subtítulo do Hero */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-slate-600">
                      Subtítulo do Hero
                    </Label>
                    <Textarea
                      placeholder="Encontre o quarto ideal para sua próxima estadia..."
                      value={company?.booking_engine_hero_subtitle || ""}
                      onChange={(e) => {
                        updateCompanyMutation.mutate({
                          booking_engine_hero_subtitle: e.target.value.trim() || null,
                        });
                      }}
                      rows={3}
                    />
                  </div>
                </div>
              )}

              {/* Domínio personalizado */}
              {canUseCustomDomain && (
                <div className="space-y-3 pt-4 border-t">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <Label className="text-sm font-semibold text-slate-700">
                        Domínio Personalizado do Motor
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Defina um domínio próprio para o motor de reservas.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="rounded-full"
                      onClick={() => setShowDnsHelp(true)}
                    >
                      <HelpCircle className="w-4 h-4" />
                    </Button>
                  </div>

                  {systemBaseDomain && (
                    <p className="text-xs text-muted-foreground">
                      Para apontar corretamente, crie um registro{" "}
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">
                        CNAME
                      </code>{" "}
                      no seu DNS para o domínio acima direcionando para{" "}
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-[10px]">
                        {systemBaseDomain}
                      </code>
                      .
                    </p>
                  )}

                  <Input
                    placeholder="Ex: reservas.empresa.com.br"
                    value={company?.booking_engine_custom_domain || ""}
                    onChange={(e) => {
                      updateCompanyMutation.mutate({
                        booking_engine_custom_domain: e.target.value.trim() || null,
                      });
                    }}
                  />
                </div>
              )}

              {/* Customização Avançada */}
              {canUseAdvancedCustomization && (
                <div className="space-y-3 pt-4 border-t">
                  <Label className="text-sm font-semibold text-slate-700">
                    Customização Avançada do Motor
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Ajuste cores e fontes do motor de reservas.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Cor primária */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-slate-600">
                        Cor Primária
                      </Label>
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
                        className="h-10 w-20 p-1 cursor-pointer"
                      />
                    </div>

                    {/* Fonte */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-slate-600">
                        Fonte
                      </Label>
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
                        <SelectTrigger className="w-full">
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
              )}
            </div>
          </Card>

          {/* Estabelecimentos no Motor */}
          <Card className="p-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-5 h-5 text-primary" />
                <h3 className="text-xl font-semibold">Estabelecimentos no Motor de Reservas</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Selecione quais estabelecimentos aparecerão no motor de reservas. Você pode incluir estabelecimentos de todas as empresas que administra.
              </p>

              <div className="space-y-2">
                {allEstablishments?.map((est: any) => {
                  const isInEngine = isEstablishmentInEngine(est.id);
                  const engineEntry = engineEstablishments?.find(
                    (e: any) => e.establishment_id === est.id
                  );
                  
                  return (
                    <div
                      key={est.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Checkbox
                          checked={isInEngine}
                          onCheckedChange={(checked) => {
                            toggleEstablishmentMutation.mutate({
                              establishmentId: est.id,
                              isActive: checked as boolean,
                            });
                          }}
                        />
                        <div className="flex-1">
                          <div className="font-medium">{est.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {est.type === 'hotel' ? 'Hotel' : est.type === 'apartment' ? 'Apartamento' : 'Outro'}
                          </div>
                        </div>
                      </div>
                      
                      {isInEngine && engineEntry && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              reorderEstablishmentMutation.mutate({
                                establishmentId: est.id,
                                direction: "up",
                              });
                            }}
                            disabled={
                              engineEstablishments?.findIndex(
                                (e: any) => e.establishment_id === est.id
                              ) === 0
                            }
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
                            disabled={
                              engineEstablishments?.findIndex(
                                (e: any) => e.establishment_id === est.id
                              ) === (engineEstablishments?.length || 0) - 1
                            }
                          >
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>
        </>
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


