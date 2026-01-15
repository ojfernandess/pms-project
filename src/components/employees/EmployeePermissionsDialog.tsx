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
import { Loader2, Key, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
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
// Nota: Super Admin foi removido por segurança - não deve ser configurável via Gerenciar Permissões
const MODULES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "reservations", label: "Reservas" },
  { key: "pricing", label: "Tarifas" },
  { key: "financial", label: "Financeiro" },
  { key: "clients", label: "Clientes" },
  { key: "units", label: "Unidades" },
  { key: "maintenance", label: "Manutenção" },
  { key: "occupancy_map", label: "Mapa de Ocupação" },
  { key: "availability_map", label: "Mapa de Disponibilidades" },
  { key: "stay_reviews", label: "Avaliações" },
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
  const [showExceedDialog, setShowExceedDialog] = useState(false);
  const [exceededPermissions, setExceededPermissions] = useState<Array<{ module: string; action: string; label: string }>>([]);
  const [showRemovedDialog, setShowRemovedDialog] = useState(false);
  const [removedPermissions, setRemovedPermissions] = useState<Array<{ module: string; action: string; label: string }>>([]);
  const [pendingSave, setPendingSave] = useState<(() => void) | null>(null);

  // Carregar permissões ao abrir o dialog
  useEffect(() => {
    if (open && employee) {
      // Se tiver custom_permissions, usar elas, senão usar as do role
      // IMPORTANTE: Se custom_permissions existir (mesmo que vazio), usar apenas ele
      // Não mesclar com permissões da função
      const hasCustomPermissions = employee.custom_permissions !== null && employee.custom_permissions !== undefined;
      const basePermissions = hasCustomPermissions 
        ? (employee.custom_permissions || {})
        : (employee.employee_roles?.permissions || {});
      
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
          // Se for boolean false, já está inicializado como false (todas desmarcadas)
          // Não precisa fazer nada, já está correto
        } else if (typeof modulePerm === "object" && modulePerm !== null) {
          // Se for objeto, mapear as ações
          const mappedActions: Record<string, boolean> = {
            read: modulePerm.read === true,
            create: modulePerm.create === true,
            update: modulePerm.update === true,
            delete: modulePerm.delete === true,
          };
          // Mapear ações específicas do módulo
          moduleSpecificActions.forEach((action) => {
            mappedActions[action.key] = modulePerm[action.key] === true;
          });
          matrixPermissions[module.key] = mappedActions;
        } else if (hasCustomPermissions && modulePerm === undefined) {
          // Se custom_permissions existe mas o módulo não está nele, significa que não foi customizado
          // Neste caso, usar as permissões da função como base
          const roleModulePerm = employee.employee_roles?.permissions?.[module.key];
          if (roleModulePerm !== undefined && roleModulePerm !== null) {
            if (typeof roleModulePerm === "boolean" && roleModulePerm === true) {
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
            } else if (typeof roleModulePerm === "object" && roleModulePerm !== null) {
              const mappedActions: Record<string, boolean> = {
                read: roleModulePerm.read === true,
                create: roleModulePerm.create === true,
                update: roleModulePerm.update === true,
                delete: roleModulePerm.delete === true,
              };
              moduleSpecificActions.forEach((action) => {
                mappedActions[action.key] = roleModulePerm[action.key] === true;
              });
              matrixPermissions[module.key] = mappedActions;
            }
          }
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

  // Função para verificar se uma permissão está habilitada na função
  const hasRolePermission = (module: string, action: string): boolean => {
    const rolePerms = employee.employee_roles?.permissions || {};
    const modulePerm = rolePerms[module];
    
    if (!modulePerm) return false;
    
    // Se for boolean true, todas as ações estão permitidas
    if (typeof modulePerm === "boolean" && modulePerm === true) {
      return true;
    }
    
    // Se for boolean false, nenhuma ação está permitida
    if (typeof modulePerm === "boolean" && modulePerm === false) {
      return false;
    }
    
    // Se for objeto, verificar a ação específica
    if (typeof modulePerm === "object" && modulePerm !== null) {
      return modulePerm[action] === true;
    }
    
    return false;
  };

  // Função para verificar se as permissões customizadas excedem as da função
  const checkExceededPermissions = (): Array<{ module: string; action: string; label: string }> => {
    const exceeded: Array<{ module: string; action: string; label: string }> = [];
    
    MODULES.forEach((module) => {
      const modulePerms = permissions[module.key];
      if (!modulePerms) return;
      
      // Verificar ações padrão
      ACTIONS.forEach((action) => {
        if (modulePerms[action.key] === true && !hasRolePermission(module.key, action.key)) {
          exceeded.push({
            module: module.key,
            action: action.key,
            label: `${module.label} - ${action.label}`,
          });
        }
      });
      
      // Verificar ações específicas do módulo
      const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
      moduleSpecificActions.forEach((action) => {
        if (modulePerms[action.key] === true && !hasRolePermission(module.key, action.key)) {
          exceeded.push({
            module: module.key,
            action: action.key,
            label: `${module.label} - ${action.label}`,
          });
        }
      });
    });
    
    return exceeded;
  };

  // Função para verificar se há permissões que foram removidas além do que a função tinha
  const checkRemovedPermissions = (): Array<{ module: string; action: string; label: string }> => {
    const removed: Array<{ module: string; action: string; label: string }> = [];
    const rolePerms = employee.employee_roles?.permissions || {};
    
    MODULES.forEach((module) => {
      const modulePerms = permissions[module.key];
      const roleModulePerm = rolePerms[module.key];
      
      // Se a função não tinha permissões para este módulo, não há nada a remover
      if (!roleModulePerm || roleModulePerm === null) return;
      
      // Se a função tinha boolean true (todas as ações), verificar quais estão desmarcadas
      if (typeof roleModulePerm === "boolean" && roleModulePerm === true) {
        // Verificar ações padrão que estão desmarcadas
        ACTIONS.forEach((action) => {
          const hasPermission = modulePerms?.[action.key] === true;
          // Se a função tinha todas as ações mas a customização não tem esta ação, está removendo
          if (!hasPermission) {
            removed.push({
              module: module.key,
              action: action.key,
              label: `${module.label} - ${action.label}`,
            });
          }
        });
        
        // Verificar ações específicas do módulo que estão desmarcadas
        const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
        moduleSpecificActions.forEach((action) => {
          const hasPermission = modulePerms?.[action.key] === true;
          if (!hasPermission) {
            removed.push({
              module: module.key,
              action: action.key,
              label: `${module.label} - ${action.label}`,
            });
          }
        });
      } else if (typeof roleModulePerm === "object" && roleModulePerm !== null) {
        // Se a função tinha um objeto de permissões, verificar quais estão sendo removidas
        ACTIONS.forEach((action) => {
          const roleHasAction = roleModulePerm[action.key] === true;
          const customHasAction = modulePerms?.[action.key] === true;
          
          // Se a função tinha mas a customização não tem, está removendo
          if (roleHasAction && !customHasAction) {
            removed.push({
              module: module.key,
              action: action.key,
              label: `${module.label} - ${action.label}`,
            });
          }
        });
        
        // Verificar ações específicas do módulo
        const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
        moduleSpecificActions.forEach((action) => {
          const roleHasAction = roleModulePerm[action.key] === true;
          const customHasAction = modulePerms?.[action.key] === true;
          
          if (roleHasAction && !customHasAction) {
            removed.push({
              module: module.key,
              action: action.key,
              label: `${module.label} - ${action.label}`,
            });
          }
        });
      }
    });
    
    return removed;
  };

  // Função para obter permissões da função formatadas
  const getRolePermissionsSummary = (): string[] => {
    const rolePerms = employee.employee_roles?.permissions || {};
    const summary: string[] = [];
    
    MODULES.forEach((module) => {
      const modulePerm = rolePerms[module.key];
      if (!modulePerm) return;
      
      const moduleActions: string[] = [];
      
      if (typeof modulePerm === "boolean" && modulePerm === true) {
        moduleActions.push("Todas as ações");
      } else if (typeof modulePerm === "object" && modulePerm !== null) {
        ACTIONS.forEach((action) => {
          if (modulePerm[action.key] === true) {
            moduleActions.push(action.label);
          }
        });
        
        const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
        moduleSpecificActions.forEach((action) => {
          if (modulePerm[action.key] === true) {
            moduleActions.push(action.label);
          }
        });
      }
      
      if (moduleActions.length > 0) {
        summary.push(`${module.label}: ${moduleActions.join(", ")}`);
      }
    });
    
    return summary;
  };

  const performSave = async () => {
    setIsSaving(true);
    try {
      // Converter a matriz de permissões para o formato JSONB
      const customPermissions: Record<string, any> = {};
      const rolePerms = employee.employee_roles?.permissions || {};

      MODULES.forEach((module) => {
        const modulePerms = permissions[module.key];
        if (!modulePerms) {
          // Se não houver permissões definidas na matriz, verificar se a função tinha
          // Se a função tinha permissões e agora não há nenhuma marcada, negar explicitamente
          const roleModulePerm = rolePerms[module.key];
          if (roleModulePerm !== undefined && roleModulePerm !== null) {
            // A função tinha permissões, mas agora todas foram desmarcadas - negar explicitamente
            customPermissions[module.key] = false;
          }
          return;
        }

        // Obter ações específicas do módulo
        const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
        
        // Verificar se todas as ações padrão estão marcadas
        const allStandardActions = modulePerms.read && modulePerms.create && modulePerms.update && modulePerms.delete;
        
        // Verificar se todas as ações específicas também estão marcadas
        const allSpecificActions = moduleSpecificActions.every((action) => modulePerms[action.key] === true);
        
        // Verificar se nenhuma ação está marcada (usar === true para garantir que undefined seja tratado como false)
        const hasAnyStandardAction = modulePerms.read === true || modulePerms.create === true || modulePerms.update === true || modulePerms.delete === true;
        const hasAnySpecificAction = moduleSpecificActions.some((action) => modulePerms[action.key] === true);
        const hasAnyAction = hasAnyStandardAction || hasAnySpecificAction;
        
        // Se todas as ações (padrão + específicas) estão marcadas, pode usar boolean true
        if (allStandardActions && allSpecificActions) {
          customPermissions[module.key] = true;
        } else if (!hasAnyAction) {
          // Se nenhuma ação está marcada, verificar se a função tinha permissões
          const roleModulePerm = rolePerms[module.key];
          if (roleModulePerm !== undefined && roleModulePerm !== null) {
            // A função tinha permissões, mas agora todas foram desmarcadas - negar explicitamente
            // Isso garante que mesmo que a função permita, o acesso será negado
            customPermissions[module.key] = false;
          }
          // Se a função não tinha permissões e nenhuma está marcada, não precisa salvar
          // (já é negado por padrão e não há necessidade de customização)
        } else {
          // Se pelo menos uma ação está marcada, usar objeto com todas as ações explicitamente
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

  const handleSave = async () => {
    // Se o funcionário não tiver função atribuída, permitir salvar diretamente
    if (!employee.employee_roles) {
      await performSave();
      return;
    }

    // Verificar se há permissões que excedem as da função
    const exceeded = checkExceededPermissions();
    
    // Verificar se há permissões que foram removidas além do que a função tinha
    const removed = checkRemovedPermissions();
    
    if (exceeded.length > 0) {
      // Se houver permissões excedentes, mostrar dialog de confirmação
      setExceededPermissions(exceeded);
      setPendingSave(() => performSave);
      setShowExceedDialog(true);
      return;
    }
    
    if (removed.length > 0) {
      // Se houver permissões removidas, mostrar dialog de confirmação
      setRemovedPermissions(removed);
      setPendingSave(() => performSave);
      setShowRemovedDialog(true);
      return;
    }
    
    // Se não houver excedentes nem remoções, salvar diretamente
    await performSave();
  };

  const handleConfirmExceed = async () => {
    setShowExceedDialog(false);
    if (pendingSave) {
      await pendingSave();
      setPendingSave(null);
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

      {/* Dialog de confirmação para permissões excedentes */}
      <AlertDialog open={showExceedDialog} onOpenChange={setShowExceedDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Permissões Excedem a Função
            </AlertDialogTitle>
            <div className="space-y-4">
              <AlertDialogDescription>
                Você está tentando conceder permissões que <strong>excedem</strong> as permissões da função{" "}
                <strong>{employee.employee_roles?.name || "N/A"}</strong> atribuída a este usuário.
              </AlertDialogDescription>
              
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-semibold text-sm">Permissões da Função:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {getRolePermissionsSummary().length > 0 ? (
                    getRolePermissionsSummary().map((perm, idx) => (
                      <li key={idx}>{perm}</li>
                    ))
                  ) : (
                    <li className="text-muted-foreground">Nenhuma permissão definida na função</li>
                  )}
                </ul>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/20 p-4 rounded-lg space-y-2 border border-amber-200 dark:border-amber-900">
                <p className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                  Permissões que excedem a função:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-amber-800 dark:text-amber-200">
                  {exceededPermissions.map((perm, idx) => (
                    <li key={idx}>{perm.label}</li>
                  ))}
                </ul>
              </div>

              <p className="text-sm text-muted-foreground">
                Deseja prosseguir e conceder essas permissões adicionais ao usuário? Isso permitirá que o usuário tenha
                mais acesso do que sua função normalmente permite.
              </p>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowExceedDialog(false);
              setPendingSave(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExceed} className="bg-amber-600 hover:bg-amber-700">
              Sim, Prosseguir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de confirmação para permissões removidas */}
      <AlertDialog open={showRemovedDialog} onOpenChange={setShowRemovedDialog}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-blue-500" />
              Removendo Mais Acessos do que o Normal
            </AlertDialogTitle>
            <div className="space-y-4">
              <AlertDialogDescription>
                Você está <strong>removendo</strong> permissões que a função{" "}
                <strong>{employee.employee_roles?.name || "N/A"}</strong> normalmente possui. Isso restringirá o acesso
                do usuário além do que é padrão para esta função.
              </AlertDialogDescription>
              
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-semibold text-sm">Permissões que a função normalmente tem:</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  {getRolePermissionsSummary().length > 0 ? (
                    getRolePermissionsSummary().map((perm, idx) => (
                      <li key={idx}>{perm}</li>
                    ))
                  ) : (
                    <li className="text-muted-foreground">Nenhuma permissão definida na função</li>
                  )}
                </ul>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg space-y-2 border border-blue-200 dark:border-blue-900">
                <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">
                  Permissões que estão sendo removidas:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-blue-800 dark:text-blue-200">
                  {removedPermissions.map((perm, idx) => (
                    <li key={idx}>{perm.label}</li>
                  ))}
                </ul>
              </div>

              <p className="text-sm text-muted-foreground">
                Deseja prosseguir e remover esses acessos do usuário? Isso restringirá o acesso do usuário além do que
                sua função normalmente permite.
              </p>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowRemovedDialog(false);
              setPendingSave(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmExceed} className="bg-blue-600 hover:bg-blue-700">
              Sim, Prosseguir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};

