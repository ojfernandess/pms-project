import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { usePricing } from "@/hooks/usePricing";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import { SeasonDialog } from "@/components/pricing/SeasonDialog";
import { PricingRuleDialog } from "@/components/pricing/PricingRuleDialog";
import { PromotionDialog } from "@/components/pricing/PromotionDialog";
import { SimplePricingCalendar } from "@/components/pricing/SimplePricingCalendar";
import { SimplifiedPricingDialog } from "@/components/pricing/SimplifiedPricingDialog";
import { PricingPlanDialog } from "@/components/pricing/PricingPlanDialog";
import { formatDate } from "@/lib/reservationUtils";
import { formatCurrency, formatCurrencyWithoutZeroCents } from "@/lib/reservationUtils";
import { useSimplifiedPricing } from "@/hooks/useSimplifiedPricing";

const weekDays = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

const Pricing = () => {
  const {
    seasons,
    rules,
    promotions,
    isLoading,
    refetch,
    deleteSeason,
    deleteRule,
    deletePromotion,
  } = usePricing();

  const { plans, deletePlan, refetch: refetchPlans } = usePricingPlans();
  const { pricing: simplifiedPricing, isLoading: loadingSimplified, deletePricing, refetch: refetchSimplified } = useSimplifiedPricing();
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");

  const [planDialogOpen, setPlanDialogOpen] = useState(false);
  const [simplifiedDialogOpen, setSimplifiedDialogOpen] = useState(false);
  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [promotionDialogOpen, setPromotionDialogOpen] = useState(false);
  const [selectedPlanIdForEdit, setSelectedPlanIdForEdit] = useState<string | undefined>();
  const [selectedSimplifiedPricingId, setSelectedSimplifiedPricingId] = useState<string | undefined>();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | undefined>();
  const [selectedRuleId, setSelectedRuleId] = useState<string | undefined>();
  const [selectedPromotionId, setSelectedPromotionId] = useState<string | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<"plan" | "simplified" | "season" | "rule" | "promotion" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!deleteId || !deleteType) return;

    try {
      if (deleteType === "plan") {
        await deletePlan(deleteId);
      } else if (deleteType === "simplified") {
        await deletePricing(deleteId);
      } else if (deleteType === "season") {
        await deleteSeason(deleteId);
      } else if (deleteType === "rule") {
        await deleteRule(deleteId);
      } else if (deleteType === "promotion") {
        await deletePromotion(deleteId);
      }
      setDeleteDialogOpen(false);
      setDeleteId(null);
      setDeleteType(null);
    } catch (error) {
      console.error(error);
    }
  };

  const openDeleteDialog = (type: "plan" | "simplified" | "season" | "rule" | "promotion", id: string) => {
    setDeleteType(type);
    setDeleteId(id);
    setDeleteDialogOpen(true);
  };

  // Filtrar dados pelo plano selecionado
  const filteredSeasons = selectedPlanId
    ? seasons.filter((s: any) => s.pricing_plan_id === selectedPlanId)
    : seasons;
  const filteredRules = selectedPlanId
    ? rules.filter((r: any) => r.pricing_plan_id === selectedPlanId)
    : rules;
  const filteredPromotions = selectedPlanId
    ? promotions.filter((p: any) => p.pricing_plan_id === selectedPlanId)
    : promotions;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Tarifário</h1>
          <p className="text-muted-foreground">Gerencie planos de tarifa, temporadas, regras e promoções</p>
        </div>
      </div>

      {/* Seletor de Plano */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <Label htmlFor="plan_select" className="whitespace-nowrap">Plano de Tarifa:</Label>
            <Select value={selectedPlanId || "__all__"} onValueChange={(value) => setSelectedPlanId(value === "__all__" ? "" : value)}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Selecione um plano de tarifa" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos os planos</SelectItem>
                {plans.map((plan: any) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} {!plan.is_active && "(Inativo)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPlanId && (
              <Badge variant="outline">
                {plans.find((p: any) => p.id === selectedPlanId)?.name}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            {selectedPlanId && (
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedPlanIdForEdit(selectedPlanId);
                  setPlanDialogOpen(true);
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Editar Plano
              </Button>
            )}
            <Button
              onClick={() => {
                setSelectedPlanIdForEdit(undefined);
                setPlanDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Plano
            </Button>
          </div>
        </div>
      </Card>

      {/* Lista de Planos */}
      {plans.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Planos de Tarifa</h3>
          </div>
          <div className="grid gap-2">
            {plans.map((plan: any) => (
              <div
                key={plan.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50"
              >
                <div>
                  <div className="font-medium">{plan.name}</div>
                  {plan.description && (
                    <div className="text-sm text-muted-foreground">{plan.description}</div>
                  )}
                  {plan.cancellation_policies && (
                    <div className="text-sm text-muted-foreground mt-1">
                      Política: {plan.cancellation_policies.name}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={plan.is_active ? "default" : "secondary"}>
                    {plan.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedPlanIdForEdit(plan.id);
                      setPlanDialogOpen(true);
                    }}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDeleteDialog("plan", plan.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Tabs defaultValue="simplified" className="space-y-4">
        <TabsList>
          <TabsTrigger value="simplified">Tarifário Simplificado</TabsTrigger>
          <TabsTrigger value="legacy">Modo Antigo (Calendário)</TabsTrigger>
          <TabsTrigger value="seasons">Temporadas</TabsTrigger>
          <TabsTrigger value="rules">Regras</TabsTrigger>
          <TabsTrigger value="promotions">Promoções</TabsTrigger>
        </TabsList>

        <TabsContent value="simplified" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setSelectedSimplifiedPricingId(undefined);
                setSimplifiedDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Novo Tarifário
            </Button>
          </div>

          {loadingSimplified ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : simplifiedPricing.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhum tarifário cadastrado. Clique em "Novo Tarifário" para criar.
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plano</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Preço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {simplifiedPricing.map((pricing: any) => (
                    <TableRow key={pricing.id}>
                      <TableCell className="font-medium">
                        {pricing.pricing_plans?.name || "-"}
                      </TableCell>
                      <TableCell>
                        {pricing.room_categories?.name || "-"}
                      </TableCell>
                      <TableCell>
                        {pricing.channel_type === "direct" ? "Balcão" : 
                         pricing.channel_type === "ota" ? (pricing.ota_channels?.name || "OTA") :
                         pricing.channel_type}
                      </TableCell>
                      <TableCell>
                        {pricing.start_date && pricing.end_date
                          ? `${formatDate(pricing.start_date)} até ${formatDate(pricing.end_date)}`
                          : pricing.days_of_week && pricing.days_of_week.length > 0
                          ? pricing.days_of_week.map((d: number) => weekDays.find(w => w.value === d)?.label.substring(0, 3)).join(", ")
                          : "Sempre"}
                      </TableCell>
                      <TableCell>
                        {pricing.price
                          ? formatCurrencyWithoutZeroCents(pricing.price)
                          : pricing.price_multiplier
                          ? `${(Number(pricing.price_multiplier) * 100).toFixed(0)}%`
                          : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={pricing.is_active ? "default" : "secondary"}>
                          {pricing.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedSimplifiedPricingId(pricing.id);
                              setSimplifiedDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog("simplified", pricing.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="legacy">
          {!selectedPlanId ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground mb-4">
                Selecione um plano de tarifa acima para criar o tarifário
              </p>
              <Button
                onClick={() => {
                  setSelectedPlanIdForEdit(undefined);
                  setPlanDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Novo Plano
              </Button>
            </Card>
          ) : (
            <SimplePricingCalendar 
              planId={selectedPlanId}
              onSuccess={() => refetch()} 
            />
          )}
        </TabsContent>

        <TabsContent value="seasons" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setSelectedSeasonId(undefined);
                setSeasonDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Temporada
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSeasons.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhuma temporada cadastrada
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Multiplicador</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
            <TableBody>
              {filteredSeasons.map((season: any) => (
                    <TableRow key={season.id}>
                      <TableCell className="font-medium">{season.name}</TableCell>
                      <TableCell>
                        {formatDate(season.start_date)} até {formatDate(season.end_date)}
                      </TableCell>
                      <TableCell>
                        {(Number(season.multiplier) * 100).toFixed(0)}%
                      </TableCell>
                      <TableCell>
                        <Badge variant={season.is_active ? "default" : "secondary"}>
                          {season.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedSeasonId(season.id);
                              setSeasonDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog("season", season.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setSelectedRuleId(undefined);
                setRuleDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Regra
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rules.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhuma regra cadastrada
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Temporada</TableHead>
                    <TableHead>Dia da Semana</TableHead>
                    <TableHead>Preço/Multiplicador</TableHead>
                    <TableHead>Mín. Noites</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
            <TableBody>
              {filteredRules.map((rule: any) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">
                        {rule.room_categories?.name || "-"}
                      </TableCell>
                      <TableCell>
                        {rule.pricing_seasons?.name || "Todas"}
                      </TableCell>
                      <TableCell>
                        {rule.day_of_week !== null
                          ? [
                              "Dom",
                              "Seg",
                              "Ter",
                              "Qua",
                              "Qui",
                              "Sex",
                              "Sáb",
                            ][rule.day_of_week]
                          : "Todos"}
                      </TableCell>
                      <TableCell>
                        {rule.price_override
                          ? formatCurrency(rule.price_override)
                          : rule.multiplier
                          ? `${(Number(rule.multiplier) * 100).toFixed(0)}%`
                          : "-"}
                      </TableCell>
                      <TableCell>{rule.min_stay_nights || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={rule.is_active ? "default" : "secondary"}>
                          {rule.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRuleId(rule.id);
                              setRuleDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog("rule", rule.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="promotions" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setSelectedPromotionId(undefined);
                setPromotionDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Nova Promoção
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : promotions.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhuma promoção cadastrada
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead>Uso</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
            <TableBody>
              {filteredPromotions.map((promotion: any) => (
                    <TableRow key={promotion.id}>
                      <TableCell className="font-medium">
                        {promotion.code || "-"}
                      </TableCell>
                      <TableCell>{promotion.name}</TableCell>
                      <TableCell>
                        {promotion.discount_type === "percentage"
                          ? `${promotion.discount_value}%`
                          : formatCurrency(promotion.discount_value)}
                      </TableCell>
                      <TableCell>
                        {formatDate(promotion.start_date)} até {formatDate(promotion.end_date)}
                      </TableCell>
                      <TableCell>
                        {promotion.usage_limit
                          ? `${promotion.usage_count || 0}/${promotion.usage_limit}`
                          : `${promotion.usage_count || 0} (ilimitado)`}
                      </TableCell>
                      <TableCell>
                        <Badge variant={promotion.is_active ? "default" : "secondary"}>
                          {promotion.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedPromotionId(promotion.id);
                              setPromotionDialogOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog("promotion", promotion.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <SimplifiedPricingDialog
        open={simplifiedDialogOpen}
        onOpenChange={setSimplifiedDialogOpen}
        onSuccess={() => {
          refetchSimplified();
          setSimplifiedDialogOpen(false);
          setSelectedSimplifiedPricingId(undefined);
        }}
        pricingId={selectedSimplifiedPricingId}
      />

      <PricingPlanDialog
        open={planDialogOpen}
        onOpenChange={setPlanDialogOpen}
        onSuccess={() => {
          refetchPlans();
          setPlanDialogOpen(false);
          setSelectedPlanIdForEdit(undefined);
        }}
        planId={selectedPlanIdForEdit}
      />

      <SeasonDialog
        open={seasonDialogOpen}
        onOpenChange={setSeasonDialogOpen}
        onSuccess={() => {
          refetch();
          setSeasonDialogOpen(false);
          setSelectedSeasonId(undefined);
        }}
        seasonId={selectedSeasonId}
        planId={selectedPlanId || undefined}
      />

      <PricingRuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        onSuccess={() => {
          refetch();
          setRuleDialogOpen(false);
          setSelectedRuleId(undefined);
        }}
        ruleId={selectedRuleId}
        planId={selectedPlanId || undefined}
      />

      <PromotionDialog
        open={promotionDialogOpen}
        onOpenChange={setPromotionDialogOpen}
        onSuccess={() => {
          refetch();
          setPromotionDialogOpen(false);
          setSelectedPromotionId(undefined);
        }}
        promotionId={selectedPromotionId}
        planId={selectedPlanId || undefined}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Pricing;

