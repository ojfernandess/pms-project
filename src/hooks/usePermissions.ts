import { useCurrentEmployeeRole } from "./useEmployees";
import { useIsSuperAdmin } from "./useUsers";
import { usePermissions as usePermissionsLib, checkPermission } from "@/lib/permissions";

export const usePermissions = () => {
  const { role, customPermissions } = useCurrentEmployeeRole();
  const { isSuperAdmin } = useIsSuperAdmin();
  const permissions = usePermissionsLib(role, customPermissions);

  // Super Admin tem todas as permissões (exceto super_admin que é verificado separadamente)
  if (isSuperAdmin) {
    return {
      canAccess: (feature: string, action?: string) => {
        if (feature === "super_admin") return false; // Super Admin não pode acessar super-admin via role
        return true;
      },
      canCreate: (feature: string) => {
        if (feature === "super_admin") return false; // Super Admin não pode criar super-admin via role
        return true;
      },
      canRead: (feature: string) => {
        if (feature === "super_admin") return false;
        return true;
      },
      canUpdate: (feature: string) => {
        if (feature === "super_admin") return false;
        return true;
      },
      canDelete: (feature: string) => {
        if (feature === "super_admin") return false;
        return true;
      },
      isSuperAdmin: true,
      role: null,
    };
  }

  return {
    ...permissions,
    isSuperAdmin: false,
    role,
  };
};


