import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Key, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

interface RolePermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: {
    id: string;
    name: string;
    code: string;
    description: string | null;
    permissions: any;
  } | null;
  onSuccess: () => void;
}

// Módulos disponíveis para edição de permissões
// Nota: Super Admin foi removido por segurança - não deve ser configurável via Controle de Funções
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

export const RolePermissionsDialog = ({
  open,
  onOpenChange,
  role,
  onSuccess,
}: RolePermissionsDialogProps) => {
  const queryClient = useQueryClient();
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});
  const [roleName, setRoleName] = useState("");
  const [roleDescription, setRoleDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Carregar permissões ao abrir o dialog
  useEffect(() => {
    if (open && role) {
      setRoleName(role.name);
      setRoleDescription(role.description || "");
      
      // Converter permissões para o formato da matriz
      const matrixPermissions: Record<string, Record<string, boolean>> = {};
      
      MODULES.forEach((module) => {
        const modulePerm = role.permissions[module.key];
        // Inicializar com ações padrão
        const defaultActions: Record<string, boolean> = {
          read: false,
          create: false,
          update: false,
          delete: false,
        };
        
        // Adicionar ações específicas do módulo
        const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
        moduleSpecificActions.forEach((action) => {
          defaultActions[action.key] = false;
        });
        
        matrixPermissions[module.key] = defaultActions;

        if (typeof modulePerm === "boolean") {
          // Se for boolean true, marcar todas as ações
          if (modulePerm) {
            Object.keys(defaultActions).forEach((action) => {
              matrixPermissions[module.key][action] = true;
            });
          }
        } else if (typeof modulePerm === "object" && modulePerm !== null) {
          // Se for objeto, mapear cada ação
          Object.keys(defaultActions).forEach((action) => {
            matrixPermissions[module.key][action] = modulePerm[action] === true;
          });
        }
      });
      
      setPermissions(matrixPermissions);
    }
  }, [open, role]);

  const handlePermissionChange = (moduleKey: string, actionKey: string, checked: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        [actionKey]: checked,
      },
    }));
  };

  const handleModuleToggle = (moduleKey: string, checked: boolean) => {
    const moduleActions = {
      read: checked,
      create: checked,
      update: checked,
      delete: checked,
    };
    
    // Adicionar ações específicas do módulo
    const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[moduleKey] || [];
    moduleSpecificActions.forEach((action) => {
      moduleActions[action.key] = checked;
    });
    
    setPermissions((prev) => ({
      ...prev,
      [moduleKey]: moduleActions,
    }));
  };

  const handleSave = async () => {
    if (!role) return;
    
    setIsSaving(true);
    try {
      // Converter a matriz de permissões para o formato JSONB
      const permissionsObject: Record<string, any> = {};
      
      MODULES.forEach((module) => {
        const modulePerms = permissions[module.key] || {};
        const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
        
        // Verificar se todas as ações padrão estão marcadas
        const allStandardActions = 
          modulePerms.read && 
          modulePerms.create && 
          modulePerms.update && 
          modulePerms.delete;
        
        // Verificar se todas as ações específicas estão marcadas
        const allSpecificActions = moduleSpecificActions.every(
          (action) => modulePerms[action.key] === true
        );
        
        // Verificar se pelo menos uma ação está marcada
        const hasAnyStandardAction = modulePerms.read || modulePerms.create || modulePerms.update || modulePerms.delete;
        const hasAnySpecificAction = moduleSpecificActions.some((action) => modulePerms[action.key] === true);
        
        // Se todas as ações (padrão + específicas) estão marcadas, pode usar boolean true
        if (allStandardActions && allSpecificActions) {
          permissionsObject[module.key] = true;
        } else if (hasAnyStandardAction || hasAnySpecificAction) {
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
          permissionsObject[module.key] = permObject;
        } else {
          // Se nenhuma ação está marcada, incluir como false explicitamente para negar acesso
          permissionsObject[module.key] = false;
        }
      });

      // Atualizar o role
      const { error } = await supabase
        .from("employee_roles")
        .update({
          name: roleName,
          description: roleDescription || null,
          permissions: permissionsObject,
        })
        .eq("id", role.id);

      if (error) {
        console.error("Erro ao atualizar função:", error);
        throw error;
      }

      toast.success("Função atualizada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["employee_roles"] });
      queryClient.invalidateQueries({ queryKey: ["current_employee_role"] });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Erro ao salvar permissões:", error);
      toast.error(error.message || "Erro ao salvar permissões da função");
    } finally {
      setIsSaving(false);
    }
  };

  if (!role) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Editar Função: {role.name}
          </DialogTitle>
          <DialogDescription>
            Configure as permissões padrão para esta função. Essas permissões serão aplicadas a todos os funcionários com esta função.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações da Função */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div>
              <Label htmlFor="role_name" className="text-sm font-medium">
                Nome da Função *
              </Label>
              <Input
                id="role_name"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="Ex: Gerente, Vendedor, etc."
                className="mt-2"
                required
              />
            </div>
            <div>
              <Label htmlFor="role_description" className="text-sm font-medium">
                Descrição
              </Label>
              <Textarea
                id="role_description"
                value={roleDescription}
                onChange={(e) => setRoleDescription(e.target.value)}
                placeholder="Descreva as responsabilidades desta função..."
                className="mt-2"
                rows={3}
              />
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground">
                <strong>Código:</strong> {role.code} (não pode ser alterado)
              </p>
            </div>
          </div>

          {/* Tabela de Permissões */}
          <div className="border rounded-lg overflow-hidden">
            <div className="p-4 bg-muted border-b">
              <h3 className="font-semibold">Permissões por Módulo</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Marque as ações permitidas para cada módulo
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Módulo</TableHead>
                    <TableHead className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span>Todas</span>
                        <Checkbox
                          checked={MODULES.every((module) => {
                            const modulePerms = permissions[module.key] || {};
                            return (
                              modulePerms.read &&
                              modulePerms.create &&
                              modulePerms.update &&
                              modulePerms.delete
                            );
                          })}
                          onCheckedChange={(checked) => {
                            MODULES.forEach((module) => {
                              handleModuleToggle(module.key, checked === true);
                            });
                          }}
                        />
                      </div>
                    </TableHead>
                    {ACTIONS.map((action) => (
                      <TableHead key={action.key} className="text-center">
                        {action.label}
                      </TableHead>
                    ))}
                    {MODULE_SPECIFIC_ACTIONS.reservations?.map((action) => (
                      <TableHead key={action.key} className="text-center">
                        {action.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {MODULES.map((module) => {
                    const modulePerms = permissions[module.key] || {};
                    const moduleSpecificActions = MODULE_SPECIFIC_ACTIONS[module.key] || [];
                    const allChecked = 
                      modulePerms.read &&
                      modulePerms.create &&
                      modulePerms.update &&
                      modulePerms.delete &&
                      moduleSpecificActions.every((action) => modulePerms[action.key] === true);
                    const someChecked = 
                      modulePerms.read ||
                      modulePerms.create ||
                      modulePerms.update ||
                      modulePerms.delete ||
                      moduleSpecificActions.some((action) => modulePerms[action.key] === true);

                    return (
                      <TableRow key={module.key}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={allChecked}
                              onCheckedChange={(checked) =>
                                handleModuleToggle(module.key, checked === true)
                              }
                              className={someChecked && !allChecked ? "data-[state=checked]:bg-primary/50" : ""}
                            />
                            {module.label}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={allChecked}
                            onCheckedChange={(checked) =>
                              handleModuleToggle(module.key, checked === true)
                            }
                          />
                        </TableCell>
                        {ACTIONS.map((action) => (
                          <TableCell key={action.key} className="text-center">
                            <Checkbox
                              checked={modulePerms[action.key] || false}
                              onCheckedChange={(checked) =>
                                handlePermissionChange(module.key, action.key, checked === true)
                              }
                            />
                          </TableCell>
                        ))}
                        {module.key === "reservations" &&
                          MODULE_SPECIFIC_ACTIONS.reservations?.map((action) => (
                            <TableCell key={action.key} className="text-center">
                              <Checkbox
                                checked={modulePerms[action.key] || false}
                                onCheckedChange={(checked) =>
                                  handlePermissionChange(module.key, action.key, checked === true)
                                }
                              />
                            </TableCell>
                          ))}
                        {module.key !== "reservations" && (
                          <TableCell className="text-center">-</TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !roleName.trim()}
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar Função
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

