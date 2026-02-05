import { EmployeeRole } from "@/hooks/useEmployees";

export interface PermissionCheck {
  canAccess: (feature: string, action?: string) => boolean;
  canCreate: (feature: string) => boolean;
  canRead: (feature: string) => boolean;
  canUpdate: (feature: string) => boolean;
  canDelete: (feature: string) => boolean;
}

export const checkPermission = (role: EmployeeRole | null, feature: string, action?: string, customPermissions?: any): boolean => {
  // REGRA ESPECIAL: Proprietários sempre têm acesso ao dashboard do proprietário
  if (feature === "owner_dashboard" && role && role.code === "owner") {
    return true;
  }

  // Se tiver custom_permissions, usar elas primeiro (têm prioridade sobre role permissions)
  // EXCETO para owner_dashboard quando o role é owner (já tratado acima)
  if (customPermissions && customPermissions[feature] !== undefined) {
    const customPerm = customPermissions[feature];
    
    // Se for boolean false, negar acesso explicitamente
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
    
    // Se customPerm for null ou undefined explicitamente, negar acesso
    return false;
  }

  if (!role || !role.permissions) {
    // Se não tiver role, não tem permissão (exceto super admin que será verificado separadamente)
    return false;
  }

  const permissions = role.permissions;

  // Verificar acesso geral ao recurso
  const featurePerm = permissions[feature];
  
  // Se a permissão não existir, negar acesso
  if (featurePerm === undefined || featurePerm === null) {
    return false;
  }
  
  // Se a permissão for false (boolean), negar acesso explicitamente
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
    // Se for objeto, verificar se tem pelo menos uma permissão verdadeira
    return Object.values(featurePerm).some((val) => val === true);
  }

  // Por padrão, negar acesso se não houver permissão clara
  return false;
};

export const usePermissions = (role: EmployeeRole | null, customPermissions?: any): PermissionCheck => {
  return {
    canAccess: (feature: string, action?: string) => {
      // REGRA ESPECIAL: Proprietários sempre têm acesso ao dashboard do proprietário
      if (feature === "owner_dashboard" && role && role.code === "owner") {
        return true;
      }
      return checkPermission(role, feature, action, customPermissions);
    },
    canCreate: (feature: string) => checkPermission(role, feature, "create", customPermissions),
    canRead: (feature: string) => {
      // REGRA ESPECIAL: Proprietários sempre têm acesso ao dashboard do proprietário
      if (feature === "owner_dashboard" && role && role.code === "owner") {
        return true;
      }
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
  "/occupancy-map": "occupancy_map",
  "/disponibilidade": "availability_map",
  "/availability-map": "availability_map",
  "/reservas": "reservations",
  "/orcamentos": "quotes",
  "/clientes": "clients",
  "/unidades": "units",
  "/financeiro": "financial",
  "/tarifario": "pricing",
  "/tarifario-legado": "pricing",
  "/manutencao": "maintenance",
  "/avaliacoes": "stay_reviews",
  "/channel-manager": "channel_manager",
  "/logs": "logs",
  "/configuracoes": "settings",
  "/funcionarios": "employees",
  "/perfil": "settings",
  "/proprietario": "owner_dashboard",
  "/super-admin": "super_admin",
  "/documentation": "documentation",
};

// Função para normalizar o path e extrair a feature
export const getFeatureFromPath = (pathname: string): string | null => {
  // Remover query params e hash
  const path = pathname.split('?')[0].split('#')[0];
  
  // Remover establishmentId do início (formato: /123/rota ou /uuid/rota)
  // Regex para remover UUID ou número no início do path
  const normalizedPath = path.replace(/^\/[^\/]+/, '') || '/';
  
  // Verificar mapeamento direto
  if (routeToFeature[normalizedPath]) {
    return routeToFeature[normalizedPath];
  }
  
  // Verificar rotas específicas
  if (normalizedPath.startsWith('/reservas/')) {
    return "reservations";
  }
  
  if (normalizedPath.startsWith('/clientes/')) {
    return "clients";
  }
  
  // Se for apenas o establishmentId (path === "/" após normalização)
  if (normalizedPath === '/') {
    return "dashboard";
  }
  
  return null;
};

