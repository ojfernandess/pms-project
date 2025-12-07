import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Key } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface EmployeePermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: {
    id: string;
    full_name: string;
    employee_roles?: {
      permissions: any;
    };
    custom_permissions?: any;
  };
  onSuccess: () => void;
}

// Módulos disponíveis para edição de permissões
const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "reservations", label: "Reservas" },
  { key: "pricing", label: "Tarifas" },
  { key: "financial", label: "Financeiro" },
  { key: "clients", label: "Clientes" },
  { key: "units", label: "Unidades" },
  { key: "maintenance", label: "Manutenção" },
  { key: "occupancy_map", label: "Mapa de Ocupação" },
  { key: "channel_manager", label: "Channel Manager" },
  { key: "logs", label: "Logs" },
  { key: "settings", label: "Configurações" },
  { key: "employees", label: "Usuários" },
];

const ACTIONS = [
  { key: "read", label: "Visualizar" },
  { key: "create", label: "Criar" },
  { key: "update", label: "Editar" },
  { key: "delete", label: "Excluir" },
];

// Ações adicionais específicas por módulo
const MODULE_SPECIFIC_ACTIONS: Record<string, Array<{ key: string; label: string }>> = {
  reservations: [
    { key: "block", label: "Bloquear" },
  ],
};

export const EmployeePermissionsDialog = ({
  open,
  onOpenChange,
  employee,
  onSuccess,
}: EmployeePermissionsDialogProps) => {
  const queryClient = useQueryClient();
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Carregar permissões ao abrir o dialog
  useEffect(() => {
    if (open && employee) {
      // Se tiver custom_permissions, usar elas, senão usar as do role
      const basePermissions = employee.custom_permissions || employee.employee_roles?.permissions || {};
      
      // Converter permissões para o formato da matriz
      const matrixPermissions: Record<string, Record<string, boolean>> = {};
      
      MODULES.forEach((module) => {
        const modulePerm = basePermissions[module.key];
        // Inicializar com ações padrão
        const defaultActions: Record<string, boolean> = {
          read: false,
          create: false,
          update: false,
          delete: false,
        };
        
        // Adicionar ações específicas do módulo (ex: block para reservations)
        const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
        moduleSpecificActions.forEach((action) => {
          defaultActions[action.key] = false;
        });
        
        matrixPermissions[module.key] = defaultActions;

        if (typeof modulePerm === "boolean") {
          // Se for boolean true, todas as ações estão permitidas
          if (modulePerm === true) {
            const allActions: Record<string, boolean> = {
              read: true,
              create: true,
              update: true,
              delete: true,
            };
            // Adicionar ações específicas do módulo como true também
            moduleSpecificActions.forEach((action) => {
              allActions[action.key] = true;
            });
            matrixPermissions[module.key] = allActions;
          }
        } else if (typeof modulePerm === "object" && modulePerm !== null) {
          // Se for objeto, mapear as ações
          const mappedActions: Record<string, boolean> = {
            read: modulePerm.read === true || modulePerm.create === true || modulePerm.update === true,
            create: modulePerm.create === true,
            update: modulePerm.update === true,
            delete: modulePerm.delete === true,
          };
          // Mapear ações específicas do módulo
          moduleSpecificActions.forEach((action) => {
            mappedActions[action.key] = modulePerm[action.key] === true;
          });
          matrixPermissions[module.key] = mappedActions;
        }
      });

      setPermissions(matrixPermissions);
    }
  }, [open, employee]);

  const handlePermissionChange = (module: string, action: string, checked: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [module]: {
        ...prev[module],
        [action]: checked,
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Converter a matriz de permissões para o formato JSONB
      const customPermissions: Record<string, any> = {};

      MODULES.forEach((module) => {
        const modulePerms = permissions[module.key];
        if (!modulePerms) return;

        // Obter ações específicas do módulo
        const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
        
        // Verificar se todas as ações padrão estão marcadas
        const allStandardActions = modulePerms.read && modulePerms.create && modulePerms.update && modulePerms.delete;
        
        // Verificar se todas as ações específicas também estão marcadas
        const allSpecificActions = moduleSpecificActions.every((action) => modulePerms[action.key] === true);
        
        // Se todas as ações (padrão + específicas) estão marcadas, pode usar boolean true
        if (allStandardActions && allSpecificActions) {
          customPermissions[module.key] = true;
        } else {
          // Verificar se pelo menos uma ação está marcada
          const hasAnyStandardAction = modulePerms.read || modulePerms.create || modulePerms.update || modulePerms.delete;
          const hasAnySpecificAction = moduleSpecificActions.some((action) => modulePerms[action.key] === true);
          
          if (hasAnyStandardAction || hasAnySpecificAction) {
            // Se pelo menos uma ação está marcada, usar objeto
            const permObject: Record<string, boolean> = {
              read: modulePerms.read || false,
              create: modulePerms.create || false,
              update: modulePerms.update || false,
              delete: modulePerms.delete || false,
            };
            // Adicionar ações específicas do módulo
            moduleSpecificActions.forEach((action) => {
              permObject[action.key] = modulePerms[action.key] || false;
            });
            customPermissions[module.key] = permObject;
          }
        }
        // Se nenhuma ação está marcada, não incluir o módulo
      });

      // Salvar no banco de dados
      const updateData: any = {};
      
      // Verificar se a coluna custom_permissions existe
      // Se não existir, tentar adicionar via RPC ou mostrar erro mais claro
      if (Object.keys(customPermissions).length > 0) {
        updateData.custom_permissions = customPermissions;
      } else {
        updateData.custom_permissions = null;
      }

      const { error } = await supabase
        .from("employees")
        .update(updateData)
        .eq("id", employee.id);

      if (error) {
        // Se o erro for sobre coluna não encontrada, dar mensagem mais clara
        if (error.message?.includes("custom_permissions") || error.code === "PGRST204") {
          throw new Error("A coluna custom_permissions não existe no banco de dados. Por favor, execute a migration 20251203000001_add_custom_permissions_to_employees.sql no Supabase Dashboard.");
        }
        throw error;
      }

      // Invalidar cache para recarregar as permissões
      // Invalidar todas as queries relacionadas a current_employee_role
      queryClient.invalidateQueries({ queryKey: ["current_employee_role"] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      
      // Forçar refetch imediato se necessário
      await queryClient.refetchQueries({ queryKey: ["current_employee_role"] });

      toast.success("Permissões atualizadas com sucesso!");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar permissões:", error);
      toast.error(error.message || "Erro ao salvar permissões");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    // Resetar para as permissões do role
    const basePermissions = employee.employee_roles?.permissions || {};
    const matrixPermissions: Record<string, Record<string, boolean>> = {};
    
    MODULES.forEach((module) => {
      const modulePerm = basePermissions[module.key];
      const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
      
      // Inicializar com ações padrão
      const defaultActions: Record<string, boolean> = {
        read: false,
        create: false,
        update: false,
        delete: false,
      };
      
      // Adicionar ações específicas do módulo
      moduleSpecificActions.forEach((action) => {
        defaultActions[action.key] = false;
      });
      
      matrixPermissions[module.key] = defaultActions;

      if (typeof modulePerm === "boolean" && modulePerm === true) {
        const allActions: Record<string, boolean> = {
          read: true,
          create: true,
          update: true,
          delete: true,
        };
        moduleSpecificActions.forEach((action) => {
          allActions[action.key] = true;
        });
        matrixPermissions[module.key] = allActions;
      } else if (typeof modulePerm === "object" && modulePerm !== null) {
        const mappedActions: Record<string, boolean> = {
          read: modulePerm.read === true || modulePerm.create === true || modulePerm.update === true,
          create: modulePerm.create === true,
          update: modulePerm.update === true,
          delete: modulePerm.delete === true,
        };
        moduleSpecificActions.forEach((action) => {
          mappedActions[action.key] = modulePerm[action.key] === true;
        });
        matrixPermissions[module.key] = mappedActions;
      }
    });

    setPermissions(matrixPermissions);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Gerenciar Permissões - {employee.full_name}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-purple-50 dark:bg-purple-950/20">
                    <TableHead className="font-semibold">Módulo</TableHead>
                    {ACTIONS.map((action) => (
                      <TableHead key={action.key} className="text-center font-semibold">
                        {action.label}
                      </TableHead>
                    ))}
                    {/* Coluna específica para "Bloquear" (apenas para Reservas) */}
                    <TableHead className="text-center font-semibold">Bloquear</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MODULES.map((module) => {
                    const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
                    const hasBlockAction = moduleSpecificActions.some((action) => action.key === "block");
                    return (
                      <TableRow key={module.key}>
                        <TableCell className="font-medium">{module.label}</TableCell>
                        {ACTIONS.map((action) => (
                          <TableCell key={action.key} className="text-center">
                            <Checkbox
                              checked={permissions[module.key]?.[action.key] || false}
                              onCheckedChange={(checked) =>
                                handlePermissionChange(module.key, action.key, checked as boolean)
                              }
                            />
                          </TableCell>
                        ))}
                        {/* Célula para "Bloquear" - apenas para Reservas, vazia para outros módulos */}
                        <TableCell className="text-center">
                          {hasBlockAction ? (
                            <Checkbox
                              checked={permissions[module.key]?.block || false}
                              onCheckedChange={(checked) =>
                                handlePermissionChange(module.key, "block", checked as boolean)
                              }
                            />
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={handleReset} disabled={isSaving}>
                Restaurar Padrão
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700">
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar Permissões"
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

