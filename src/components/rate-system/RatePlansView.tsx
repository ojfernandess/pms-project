import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Edit, Trash2, Eye, Search, HelpCircle, RefreshCw } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { RatePlan } from "@/hooks/useRateSystem";
import { RatePlanDialog } from "./RatePlanDialog";
import { supabase } from "@/integrations/supabase/client";
import { useCancellationPolicies } from "@/hooks/useCancellationPolicies";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useQuery } from "@tanstack/react-query";

interface RatePlansViewProps {
  ratePlans: RatePlan[];
  isLoading: boolean;
  onCreate: (plan: Partial<RatePlan>) => Promise<any>;
  onUpdate: (plan: { id: string } & Partial<RatePlan>) => Promise<any>;
  onDelete: (id: string) => Promise<void>;
}

export const RatePlansView = ({
  ratePlans,
  isLoading,
  onCreate,
  onUpdate,
  onDelete,
}: RatePlansViewProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<RatePlan | null>(null);
  const [policiesMap, setPoliciesMap] = useState<Record<string, any>>({});
  const [categoriesMap, setCategoriesMap] = useState<Record<string, any[]>>({});
  const [basePlansMap, setBasePlansMap] = useState<Record<string, any>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [detailsLoading, setDetailsLoading] = useState(true);
  const { policies } = useCancellationPolicies();

  // Buscar categorias
  const { data: categories = [] } = useQuery({
    queryKey: ["room_categories", getSelectedEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("room_categories")
        .select("id, name")
        .eq("establishment_id", establishmentId)
        .order("name");

      if (error) throw error;
      return data || [];
    },
  });

  useEffect(() => {
    const loadPlanData = async () => {
      const planIds = ratePlans.map(p => p.id);
      if (planIds.length === 0) {
        setDetailsLoading(false);
        return;
      }
      setDetailsLoading(true);
      try {
        // Buscar políticas de cancelamento
        const { data: plansData } = await supabase
          .from("pricing_plans")
          .select("id, cancellation_policies:cancellation_policy_id(name, policy_summary), base_plan_id_for_rate, available_in_booking_engine, booking_engine_label")
          .in("id", planIds);

        const policies: Record<string, any> = {};
        const basePlanIdsMap: Record<string, string> = {};
        plansData?.forEach((plan: any) => {
          if (plan.cancellation_policies) {
            policies[plan.id] = plan.cancellation_policies;
          }
          if (plan.base_plan_id_for_rate) {
            basePlanIdsMap[plan.id] = plan.base_plan_id_for_rate;
          }
        });
        setPoliciesMap(policies);

        // Buscar planos base
        const basePlanIds = Object.values(basePlanIdsMap).filter(Boolean) as string[];
        if (basePlanIds.length > 0) {
          const { data: basePlansData } = await supabase
            .from("pricing_plans")
            .select("id, name")
            .in("id", basePlanIds);

          const basePlansMap: Record<string, string> = {};
          basePlansData?.forEach((bp: any) => {
            Object.keys(basePlanIdsMap).forEach((planId) => {
              if (basePlanIdsMap[planId] === bp.id) {
                basePlansMap[planId] = bp.name;
              }
            });
          });
          setBasePlansMap(basePlansMap);
        }

        // Buscar categorias associadas
        const { data: planCategories } = await supabase
          .from("pricing_plan_categories")
          .select("pricing_plan_id, room_categories:category_id(id, name)")
          .in("pricing_plan_id", planIds);

        const categoriesMap: Record<string, any[]> = {};
        planCategories?.forEach((pc: any) => {
          if (!categoriesMap[pc.pricing_plan_id]) {
            categoriesMap[pc.pricing_plan_id] = [];
          }
          if (pc.room_categories) {
            categoriesMap[pc.pricing_plan_id].push(pc.room_categories);
          }
        });
        setCategoriesMap(categoriesMap);
      } catch (error) {
        console.error("Erro ao carregar dados dos planos:", error);
      } finally {
        setDetailsLoading(false);
      }
    };

    loadPlanData();
  }, [ratePlans]);

  const handleEdit = (plan: RatePlan) => {
    setEditingPlan(plan);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingPlan(null);
    setDialogOpen(true);
  };

  const handleSave = async (plan: Partial<RatePlan>) => {
    if (editingPlan) {
      await onUpdate({ id: editingPlan.id, ...plan });
    } else {
      await onCreate(plan);
    }
    setDialogOpen(false);
    setEditingPlan(null);
  };

  const handleViewPlan = (plan: RatePlan) => {
    // Abrir dialog de visualização ou edição
    handleEdit(plan);
  };

  const filteredPlans = ratePlans.filter(plan =>
    plan.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const showingLoading = isLoading || (ratePlans.length > 0 && detailsLoading);
  if (showingLoading) {
    return (
      <div className="space-y-4 animate-in fade-in duration-300">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 rounded-md bg-muted/50 animate-pulse" />
          <div className="h-10 w-40 rounded-md bg-muted/50 animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 flex-1 rounded-md bg-muted/50 animate-pulse" />
          <div className="h-10 w-24 rounded-md bg-muted/50 animate-pulse" />
        </div>
        <Card className="p-6">
          <div className="space-y-4">
            <div className="h-10 rounded-md bg-muted/50 animate-pulse w-full" />
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex gap-4">
                <div className="h-10 flex-1 rounded-md bg-muted/50 animate-pulse" />
                <div className="h-10 flex-1 rounded-md bg-muted/50 animate-pulse" />
                <div className="h-10 w-24 rounded-md bg-muted/50 animate-pulse" />
                <div className="h-10 w-24 rounded-md bg-muted/50 animate-pulse" />
              </div>
            ))}
          </div>
        </Card>
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando planos tarifários...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Plano de Tarifas</h2>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Adicionar nova tarifa
        </Button>
      </div>

      {/* Barra de busca */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            placeholder="Buscar planos..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
        </div>
        <Button variant="default">Buscar</Button>
      </div>

      {/* Tabela de planos */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Acomodações</TableHead>
              <TableHead>Tarifa Base</TableHead>
              <TableHead>Plano de Refeições</TableHead>
              <TableHead>Políticas de Cancelamento</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead>Disponível em</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPlans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhum plano tarifário encontrado
                </TableCell>
              </TableRow>
            ) : (
              filteredPlans.map((plan) => {
                const planCategories = categoriesMap[plan.id] || [];
                const policy = policiesMap[plan.id];
                const basePlan = basePlansMap[plan.id];

                return (
                  <TableRow key={plan.id}>
                    <TableCell className="font-medium">{plan.name}</TableCell>
                    <TableCell>
                      {planCategories.length > 0 ? (
                        <ul className="list-disc list-inside text-sm">
                          {planCategories.map((cat: any) => (
                            <li key={cat.id}>{cat.name}</li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground text-sm">Nenhuma</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {basePlan ? (
                        <Badge variant="outline">{basePlan}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">Nenhuma</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">-</span>
                    </TableCell>
                    <TableCell>
                      {policy ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{policy.name}</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <HelpCircle className="h-4 w-4 text-gray-400 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-md">
                                <p className="text-sm">{policy.policy_summary || policy.name}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Nenhuma</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.is_active ? "default" : "secondary"} className={plan.is_active ? "bg-green-500" : ""}>
                        {plan.is_active ? "Sim" : "Não"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default" className="bg-green-500">
                        Motor de Reservas
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewPlan(plan)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Ver Plano
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => onDelete(plan.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <RatePlanDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        plan={editingPlan}
        onSave={handleSave}
      />
    </div>
  );
};
