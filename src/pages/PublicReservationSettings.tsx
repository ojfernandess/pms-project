import { useState } from "react";
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
import { Separator } from "@/components/ui/separator";
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

  // Buscar estabelecimentos com página pública
  const { data: publicEstablishments, isLoading: isLoadingPublic } = useQuery({
    queryKey: ["company_public_reservation_establishments", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from("company_public_reservation_establishments")
        .select("*, establishments(*)")
        .eq("company_id", company.id)
        .order("display_order")
        .order("created_at");
      if (error) throw error;
      return data || [];
    },
    enabled: !!company?.id,
  });

  // Buscar todos os estabelecimentos da empresa
  const { data: allEstablishments, isLoading: isLoadingAll } = useQuery({
    queryKey: ["company_establishments", company?.id],
    queryFn: async () => {
      if (!company?.id) return [];
      const { data, error } = await supabase
        .from("establishments")
        .select("*")
        .eq("company_id", company.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!company?.id,
  });

  // Mutation para adicionar/remover estabelecimento da página pública
  const toggleEstablishmentMutation = useMutation({
    mutationFn: async ({ establishmentId, isActive }: { establishmentId: string; isActive: boolean }) => {
      if (!company?.id) throw new Error("Empresa não encontrada");
      
      if (isActive) {
        // Adicionar à página pública
        const currentMaxOrder = publicEstablishments?.length || 0;
        const { error } = await supabase
          .from("company_public_reservation_establishments")
          .upsert({
            company_id: company.id,
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
          .eq("company_id", company.id)
          .eq("establishment_id", establishmentId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company_public_reservation_establishments", company?.id] });
      toast.success("Estabelecimento atualizado");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar estabelecimento");
    },
  });

  // Mutation para reordenar estabelecimentos
  const reorderEstablishmentMutation = useMutation({
    mutationFn: async ({ establishmentId, direction }: { establishmentId: string; direction: "up" | "down" }) => {
      if (!company?.id || !publicEstablishments) throw new Error("Dados não encontrados");
      
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
      queryClient.invalidateQueries({ queryKey: ["company_public_reservation_establishments", company?.id] });
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
                        {isPublic && est.slug && (
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
                          navigate(`/${est.id}/configuracoes`);
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


