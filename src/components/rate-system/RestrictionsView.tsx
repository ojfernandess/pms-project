import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, Trash2, X, Lock, AlertCircle, DollarSign, Calendar } from "lucide-react";
import { RateRestriction } from "@/hooks/useRateSystem";
import { RestrictionDialog } from "./RestrictionDialog";
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RestrictionsViewProps {
  restrictions: RateRestriction[];
  isLoading: boolean;
  categories: any[];
  ratePlans: any[];
  onCreate: (restriction: Partial<RateRestriction>) => void;
  onUpdate: (id: string, restriction: Partial<RateRestriction>) => void;
  onDelete: (id: string) => void;
}

export const RestrictionsView = ({
  restrictions,
  isLoading,
  categories,
  ratePlans,
  onCreate,
  onUpdate,
  onDelete,
}: RestrictionsViewProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRestriction, setSelectedRestriction] = useState<RateRestriction | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restrictionToDelete, setRestrictionToDelete] = useState<string | null>(null);

  const handleCreate = () => {
    setSelectedRestriction(null);
    setDialogOpen(true);
  };

  const handleEdit = (restriction: RateRestriction) => {
    setSelectedRestriction(restriction);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setRestrictionToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (restrictionToDelete) {
      onDelete(restrictionToDelete);
      setDeleteDialogOpen(false);
      setRestrictionToDelete(null);
    }
  };

  const handleSave = (restriction: Partial<RateRestriction>) => {
    if (selectedRestriction) {
      onUpdate(selectedRestriction.id, restriction);
    } else {
      onCreate(restriction);
    }
    setDialogOpen(false);
    setSelectedRestriction(null);
  };

  const getRestrictionIcon = (type: string) => {
    switch (type) {
      case "stop_sell":
        return <X className="w-5 h-5 text-red-600" />;
      case "min_los":
      case "max_los":
        return <Lock className="w-5 h-5 text-yellow-600" />;
      case "cta":
      case "ctd":
        return <AlertCircle className="w-5 h-5 text-purple-600" />;
      case "min_price":
      case "max_price":
        return <DollarSign className="w-5 h-5 text-green-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-gray-600" />;
    }
  };

  const getRestrictionLabel = (type: string) => {
    const labels: Record<string, string> = {
      stop_sell: "Stop Sell",
      min_los: "Min LOS",
      max_los: "Max LOS",
      cta: "CTA",
      ctd: "CTD",
      min_price: "Preço Mínimo",
      max_price: "Preço Máximo",
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return <div className="text-center p-8">Carregando restrições...</div>;
  }

  const activeRestrictions = restrictions.filter(r => r.is_active);
  const stopSell = activeRestrictions.filter(r => r.restriction_type === "stop_sell");
  const minLos = activeRestrictions.filter(r => r.restriction_type === "min_los");
  const maxLos = activeRestrictions.filter(r => r.restriction_type === "max_los");
  const ctaCtd = activeRestrictions.filter(r => r.restriction_type === "cta" || r.restriction_type === "ctd");
  const priceRestrictions = activeRestrictions.filter(r => r.restriction_type === "min_price" || r.restriction_type === "max_price");

  const renderRestrictionCard = (restriction: RateRestriction) => {
    const category = categories.find(c => c.id === restriction.category_id);
    const plan = ratePlans.find(p => p.id === restriction.pricing_plan_id);

    return (
      <Card key={restriction.id} className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {getRestrictionIcon(restriction.restriction_type)}
              <Badge variant="outline">{getRestrictionLabel(restriction.restriction_type)}</Badge>
              {restriction.value > 0 && (
                <span className="text-sm font-semibold text-gray-700">
                  {restriction.restriction_type.includes("los")
                    ? `${restriction.value} noites`
                    : restriction.restriction_type.includes("price")
                    ? `R$ ${restriction.value.toFixed(2)}`
                    : ""}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>
                  {format(new Date(restriction.start_date), "dd/MM/yyyy", { locale: ptBR })} -{" "}
                  {format(new Date(restriction.end_date), "dd/MM/yyyy", { locale: ptBR })}
                </span>
              </div>
              {category && (
                <div className="text-xs text-gray-500">Categoria: {category.name}</div>
              )}
              {plan && (
                <div className="text-xs text-gray-500">Plano: {plan.name}</div>
              )}
              {restriction.notes && (
                <div className="text-xs text-gray-500 mt-2">{restriction.notes}</div>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => handleEdit(restriction)}>
              <Edit2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => handleDelete(restriction.id)}>
              <Trash2 className="w-4 h-4 text-red-600" />
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Restrições e Políticas</h2>
          <p className="text-sm text-gray-500 mt-1">
            Configure restrições de vendas, políticas de permanência mínima e limites de preço
          </p>
        </div>
        <Button className="gap-2" onClick={handleCreate}>
          <Plus className="w-4 h-4" />
          Adicionar Restrição
        </Button>
      </div>

      <Tabs defaultValue="all" className="w-full">
        <TabsList>
          <TabsTrigger value="all">Todas ({restrictions.length})</TabsTrigger>
          <TabsTrigger value="stop_sell">Stop Sell ({stopSell.length})</TabsTrigger>
          <TabsTrigger value="los">LOS ({minLos.length + maxLos.length})</TabsTrigger>
          <TabsTrigger value="cta_ctd">CTA/CTD ({ctaCtd.length})</TabsTrigger>
          <TabsTrigger value="price">Preços ({priceRestrictions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4">
          {restrictions.length === 0 ? (
            <Card className="p-12 text-center">
              <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhuma restrição configurada</h3>
              <p className="text-gray-500 mb-4">
                Configure restrições para controlar vendas, permanência mínima e limites de preço.
              </p>
              <Button onClick={handleCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Restrição
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {restrictions.map(renderRestrictionCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="stop_sell" className="space-y-4">
          {stopSell.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">Nenhuma restrição Stop Sell ativa</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stopSell.map(renderRestrictionCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="los" className="space-y-4">
          {minLos.length === 0 && maxLos.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">Nenhuma restrição de LOS configurada</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...minLos, ...maxLos].map(renderRestrictionCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="cta_ctd" className="space-y-4">
          {ctaCtd.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">Nenhuma restrição CTA/CTD configurada</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {ctaCtd.map(renderRestrictionCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="price" className="space-y-4">
          {priceRestrictions.length === 0 ? (
            <Card className="p-8 text-center text-gray-500">Nenhuma restrição de preço configurada</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {priceRestrictions.map(renderRestrictionCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <RestrictionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        restriction={selectedRestriction}
        categories={categories}
        ratePlans={ratePlans}
        onSave={handleSave}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta restrição? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
