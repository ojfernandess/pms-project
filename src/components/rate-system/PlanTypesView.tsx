import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, HelpCircle } from "lucide-react";
import { usePlanTypes, PlanType } from "@/hooks/usePlanTypes";
import { PlanTypeDialog } from "./PlanTypeDialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

export const PlanTypesView = () => {
  const { planTypes, isLoading, createPlanType, updatePlanType, deletePlanType } = usePlanTypes();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<PlanType | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [typeToDelete, setTypeToDelete] = useState<PlanType | null>(null);

  const handleEdit = (type: PlanType) => {
    setEditingType(type);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingType(null);
    setDialogOpen(true);
  };

  const handleSave = async (type: Partial<PlanType>) => {
    if (editingType) {
      await updatePlanType({ id: editingType.id, ...type });
    } else {
      await createPlanType(type);
    }
    setDialogOpen(false);
    setEditingType(null);
  };

  const handleDeleteClick = (type: PlanType) => {
    setTypeToDelete(type);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (typeToDelete) {
      try {
        await deletePlanType(typeToDelete.id);
        setDeleteDialogOpen(false);
        setTypeToDelete(null);
      } catch (error) {
        // Erro já é tratado no hook
      }
    }
  };

  if (isLoading) {
    return <div className="text-center p-8">Carregando tipos de planos...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">Tipos de Planos Tarifários</h2>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                  <HelpCircle className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96 p-4" align="start">
                <h4 className="font-semibold text-sm mb-2">O que são Tipos de Planos Tarifários?</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  São categorias que agrupam seus planos tarifários (ex: Reembolsável, Não Reembolsável, Group, Standard).
                  Servem para organizar, filtrar e aplicar ajustes em lote no sistema tarifário.
                </p>
                <h4 className="font-semibold text-sm mb-2">Como usar?</h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Crie os tipos que fizerem sentido (ex: &quot;Flexível&quot;, &quot;Promocional&quot;, &quot;Corporativo&quot;).
                  Ao criar ou editar um <strong>Plano de Tarifas</strong>, associe-o a um tipo. No <strong>Dashboard de Preços</strong>
                  você pode aplicar ajustes percentuais por tipo de plano (todos os planos daquele tipo recebem o mesmo ajuste).
                </p>
                <h4 className="font-semibold text-sm mb-2">Para que serve?</h4>
                <p className="text-sm text-muted-foreground">
                  Organização dos planos, relatórios por tipo, e aplicação rápida de descontos ou acréscimos por categoria
                  (ex: +10% em todos os planos &quot;Não Reembolsável&quot;) no mapa de tarifas e no dashboard.
                </p>
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Gerencie os tipos de planos tarifários (Group, Standard, etc)
          </p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo Tipo
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {planTypes.map((type) => (
          <Card key={type.id} className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">{type.name}</h3>
                  <Badge variant={type.is_active ? "default" : "secondary"}>
                    {type.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                  {type.color && (
                    <div
                      className="w-4 h-4 rounded-full border border-gray-300"
                      style={{ backgroundColor: type.color }}
                    />
                  )}
                </div>
                {type.description && (
                  <div className="text-sm text-gray-600 mt-2">{type.description}</div>
                )}
                {type.sort_order !== undefined && (
                  <div className="text-xs text-gray-500 mt-2">Ordem: {type.sort_order}</div>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => handleEdit(type)}>
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDeleteClick(type)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {planTypes.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-gray-500">Nenhum tipo de plano cadastrado ainda.</p>
          <Button onClick={handleCreate} className="mt-4 gap-2">
            <Plus className="w-4 h-4" />
            Criar Primeiro Tipo
          </Button>
        </Card>
      )}

      <PlanTypeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        type={editingType}
        onSave={handleSave}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o tipo "{typeToDelete?.name}"? Esta ação não pode ser
              desfeita. Se houver planos tarifários usando este tipo, a exclusão será bloqueada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

