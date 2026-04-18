import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Building2, ExternalLink, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";

const PublicReservationSettings = () => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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

  // Buscar estabelecimentos com página pública em todas as empresas que o usuário administra
  const { data: publicEstablishments, isLoading: isLoadingPublic } = useQuery({
    queryKey: ["company_public_reservation_establishments_manager_scope"],
    queryFn: async () => {
      // Buscar usuário logado
      const {
        data: { user },
      } = await supabase.auth.getUser();

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

      // Adicionar empresas do usuário (proprietário)
      if (!userCompaniesError && userCompanies && userCompanies.length > 0) {
        userCompanies.forEach((uc: any) => {
          if (uc.company_id) companyIds.add(uc.company_id);
        });
      }

      // Adicionar empresas dos estabelecimentos onde o usuário é funcionário
      if (!employeesError && employees && employees.length > 0) {
        const establishmentIds = employees
          .map((emp: any) => emp.establishment_id)
          .filter(Boolean);

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

      const { data, error } = await supabase
        .from("company_public_reservation_establishments")
        .select("*, establishments(*)")
        .in("company_id", Array.from(companyIds))
        .order("display_order")
        .order("created_at");

      if (error) throw error;
      return data || [];
    },
    enabled: true,
  });

  // Buscar todos os estabelecimentos que o usuário administra (todas as empresas onde ele é proprietário/ligado)
  // Isso garante que gerentes que atuam em múltiplas empresas vejam todos os estabelecimentos que administram
  const { data: allEstablishments, isLoading: isLoadingAll } = useQuery({
    queryKey: ["company_establishments_manager_scope", company?.id],
    queryFn: async () => {
      // Buscar usuário logado
      const {
        data: { user },
      } = await supabase.auth.getUser();

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

      // Adicionar empresas do usuário (proprietário)
      if (!userCompaniesError && userCompanies && userCompanies.length > 0) {
        userCompanies.forEach((uc: any) => {
          if (uc.company_id) companyIds.add(uc.company_id);
        });
      }

      // Adicionar empresas dos estabelecimentos onde o usuário é funcionário (gerente, recepcionista, etc.)
      if (!employeesError && employees && employees.length > 0) {
        const establishmentIds = employees
          .map((emp: any) => emp.establishment_id)
          .filter(Boolean);

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

      // Buscar todos os estabelecimentos de todas as empresas identificadas
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

  // Mutation para adicionar/remover estabelecimento da página pública
  const toggleEstablishmentMutation = useMutation({
    mutationFn: async ({ establishmentId, isActive }: { establishmentId: string; isActive: boolean }) => {
      // Encontrar o estabelecimento para obter a empresa correta
      const establishment = allEstablishments?.find((est: any) => est.id === establishmentId);
      if (!establishment || !establishment.company_id) {
        throw new Error("Estabelecimento ou empresa não encontrados");
      }

      if (isActive) {
        // Ativar página pública para o estabelecimento
        // Primeiro limpar quaisquer registros antigos (empresa incorreta, etc.)
        await supabase
          .from("company_public_reservation_establishments")
          .delete()
          .eq("establishment_id", establishmentId);

        const currentMaxOrder = publicEstablishments?.length || 0;
        const { error } = await supabase
          .from("company_public_reservation_establishments")
          .insert({
            company_id: establishment.company_id,
            establishment_id: establishmentId,
            display_order: currentMaxOrder,
            is_active: true,
          });
        if (error) throw error;
      } else {
        // Remover da página pública
        const { error } = await supabase
          .from("company_public_reservation_establishments")
          .delete()
          .eq("establishment_id", establishmentId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company_public_reservation_establishments_manager_scope"] });
      toast.success("Estabelecimento atualizado");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar estabelecimento");
    },
  });

  // Mutation para reordenar estabelecimentos
  const reorderEstablishmentMutation = useMutation({
    mutationFn: async ({ establishmentId, direction }: { establishmentId: string; direction: "up" | "down" }) => {
      if (!publicEstablishments) throw new Error("Dados não encontrados");
      
      const currentIndex = publicEstablishments.findIndex(
        (e: any) => e.establishment_id === establishmentId
      );
      if (currentIndex === -1) throw new Error("Estabelecimento não encontrado");
      
      const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (newIndex < 0 || newIndex >= publicEstablishments.length) return;
      
      const current = publicEstablishments[currentIndex];
      const target = publicEstablishments[newIndex];
      
      // Trocar display_order
      await supabase
        .from("company_public_reservation_establishments")
        .update({ display_order: target.display_order })
        .eq("id", current.id);
      
      await supabase
        .from("company_public_reservation_establishments")
        .update({ display_order: current.display_order })
        .eq("id", target.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company_public_reservation_establishments_manager_scope"] });
      toast.success("Ordem atualizada");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao reordenar");
    },
  });

  if (isLoadingCompany || isLoadingPublic || isLoadingAll) {
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

  const isEstablishmentPublic = (establishmentId: string) => {
    return publicEstablishments?.some(
      (e: any) => e.establishment_id === establishmentId && e.is_active
    ) || false;
  };

  const getPublicUrl = (establishment: any) => {
    const slug = establishment.slug || establishment.numeric_id?.toString() || establishment.id;
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/reservar/${slug}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold mb-2">Página Pública de Reservas</h2>
        <p className="text-muted-foreground">
          Selecione quais estabelecimentos da empresa terão página pública de reservas ativa. Cada estabelecimento mantém suas próprias configurações (planos tarifários, fotos, etc.) que podem ser ajustadas nas configurações do estabelecimento.
        </p>
      </div>

      {/* Estabelecimentos com Página Pública */}
      <Card className="p-6">
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-5 h-5 text-primary" />
            <h3 className="text-xl font-semibold">Estabelecimentos com Página Pública</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Selecione quais estabelecimentos da empresa terão página pública de reservas disponível para os hóspedes.
          </p>

          <div className="space-y-2">
            {allEstablishments?.map((est: any) => {
              const isPublic = isEstablishmentPublic(est.id);
              const publicEntry = publicEstablishments?.find(
                (e: any) => e.establishment_id === est.id
              );
              
              return (
                <div
                  key={est.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <Checkbox
                      checked={isPublic}
                      onCheckedChange={(checked) => {
                        toggleEstablishmentMutation.mutate({
                          establishmentId: est.id,
                          isActive: checked as boolean,
                        });
                      }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium">{est.name}</div>
                        {isPublic && (
                          <Badge variant="outline" className="text-xs">
                            Página Pública Ativa
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {est.type === 'hotel' ? 'Hotel' : est.type === 'apartment' ? 'Apartamento' : 'Outro'}
                        {isPublic && (est.slug || est.numeric_id != null) && (
                          <>
                            {" · "}
                            <a
                              href={getPublicUrl(est)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              Ver página pública
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {isPublic && publicEntry && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          // Navegar para a página de configurações do estabelecimento
                          // com a aba "room-display" (Configuração da Página Pública de Reservas) aberta
                          // Usar numeric_id pois o EstablishmentRoute espera esse valor na URL
                          const establishmentId = est.numeric_id || est.id;
                          navigate(`/${establishmentId}/configuracoes?tab=room-display`);
                        }}
                      >
                        <Settings2 className="w-4 h-4 mr-2" />
                        Configurar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Informações */}
      <Card className="p-6 bg-blue-50 border-blue-200">
        <div className="space-y-2">
          <h4 className="font-semibold text-blue-900">Sobre as Configurações</h4>
          <p className="text-sm text-blue-800">
            Cada estabelecimento mantém suas próprias configurações individuais que podem ser ajustadas nas{" "}
            <strong>Configurações do Estabelecimento</strong>. Isso inclui:
          </p>
          <ul className="text-sm text-blue-800 list-disc list-inside space-y-1 ml-2">
            <li>Planos tarifários para exibição</li>
            <li>Fotos do estabelecimento</li>
            <li>Badges de destaque para categorias</li>
            <li>Timer de pagamento de orçamentos</li>
            <li>Outras configurações específicas do estabelecimento</li>
          </ul>
          <p className="text-sm text-blue-800 mt-2">
            Para configurar um estabelecimento específico, clique em <strong>"Configurar"</strong> ao lado do estabelecimento ou acesse{" "}
            <strong>Configurações → Página Pública de Reservas</strong> quando estiver visualizando aquele estabelecimento.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default PublicReservationSettings;


