import { EmployeeRole } from "@/hooks/useEmployees";

export interface PermissionCheck {
  canAccess: (feature: string, action?: string) => boolean;
  canCreate: (feature: string) => boolean;
  canRead: (feature: string) => boolean;
  canUpdate: (feature: string) => boolean;
  canDelete: (feature: string) => boolean;
}

export const checkPermission = (role: EmployeeRole | null, feature: string, action?: string): boolean => {
  if (!role || !role.permissions) {
    // Se não tiver role, não tem permissão (exceto super admin que será verificado separadamente)
    return false;
  }

  const permissions = role.permissions;

  // Verificar acesso geral ao recurso
  const featurePerm = permissions[feature];
  
  // Se a permissão for true (boolean), permite todas as ações
  if (typeof featurePerm === "boolean") {
    return featurePerm === true;
  }

  // Verificar permissão específica quando for objeto
  if (action) {
    if (typeof featurePerm === "object" && featurePerm !== null) {
      return featurePerm[action] === true;
    }
    return false;
  }

  // Verificar acesso geral quando for objeto
  if (typeof featurePerm === "object" && featurePerm !== null) {
    // Se for objeto, verificar se tem pelo menos uma permissão
    return Object.values(featurePerm).some((val) => val === true);
  }

  return false;
};

export const usePermissions = (role: EmployeeRole | null): PermissionCheck => {
  return {
    canAccess: (feature: string, action?: string) => checkPermission(role, feature, action),
    canCreate: (feature: string) => checkPermission(role, feature, "create"),
    canRead: (feature: string) => {
      const perm = role?.permissions?.[feature];
      if (typeof perm === "boolean") return perm;
      if (typeof perm === "object" && perm !== null) {
        return perm.read === true || perm.create === true || perm.update === true;
      }
      return false;
    },
    canUpdate: (feature: string) => checkPermission(role, feature, "update"),
    canDelete: (feature: string) => checkPermission(role, feature, "delete"),
  };
};

// Mapeamento de rotas para features
export const routeToFeature: Record<string, string> = {
  "/": "dashboard",
  "/ocupacao": "occupancy_map",
  "/reservas": "reservations",
  "/clientes": "clients",
  "/unidades": "units",
  "/financeiro": "financial",
  "/tarifario": "pricing",
  "/manutencao": "maintenance",
  "/channel-manager": "channel_manager",
  "/logs": "logs",
  "/configuracoes": "settings",
  "/funcionarios": "employees",
  "/super-admin": "super_admin",
};

