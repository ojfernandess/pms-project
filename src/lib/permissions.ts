import { EmployeeRole } from "@/hooks/useEmployees";

export interface PermissionCheck {
  canAccess: (feature: string, action?: string) => boolean;
  canCreate: (feature: string) => boolean;
  canRead: (feature: string) => boolean;
  canUpdate: (feature: string) => boolean;
  canDelete: (feature: string) => boolean;
}

export const checkPermission = (role: EmployeeRole | null, feature: string, action?: string, customPermissions?: any): boolean => {
  // Se tiver custom_permissions, usar elas primeiro
  if (customPermissions && customPermissions[feature] !== undefined) {
    const customPerm = customPermissions[feature];
    
    // Se for boolean, retornar o valor
    if (typeof customPerm === "boolean") {
      return customPerm === true;
    }
    
    // Se for objeto e tiver action específica
    if (action && typeof customPerm === "object" && customPerm !== null) {
      return customPerm[action] === true;
    }
    
    // Se for objeto sem action, verificar se tem pelo menos uma permissão
    if (typeof customPerm === "object" && customPerm !== null) {
      return Object.values(customPerm).some((val) => val === true);
    }
  }

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

export const usePermissions = (role: EmployeeRole | null, customPermissions?: any): PermissionCheck => {
  return {
    canAccess: (feature: string, action?: string) => checkPermission(role, feature, action, customPermissions),
    canCreate: (feature: string) => checkPermission(role, feature, "create", customPermissions),
    canRead: (feature: string) => {
      // Verificar custom_permissions primeiro
      if (customPermissions && customPermissions[feature] !== undefined) {
        const customPerm = customPermissions[feature];
        if (typeof customPerm === "boolean") return customPerm;
        if (typeof customPerm === "object" && customPerm !== null) {
          return customPerm.read === true || customPerm.create === true || customPerm.update === true;
        }
      }
      // Fallback para permissões do role
      const perm = role?.permissions?.[feature];
      if (typeof perm === "boolean") return perm;
      if (typeof perm === "object" && perm !== null) {
        return perm.read === true || perm.create === true || perm.update === true;
      }
      return false;
    },
    canUpdate: (feature: string) => checkPermission(role, feature, "update", customPermissions),
    canDelete: (feature: string) => checkPermission(role, feature, "delete", customPermissions),
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

