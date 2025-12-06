import { ReactNode, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentEmployeeRole } from "@/hooks/useEmployees";
import { useIsSuperAdmin } from "@/hooks/useUsers";
import { routeToFeature, checkPermission } from "@/lib/permissions";
import { Loader2 } from "lucide-react";

interface RoleProtectedRouteProps {
  children: ReactNode;
}

export const RoleProtectedRoute = ({ children }: RoleProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { role, customPermissions, isLoading: roleLoading } = useCurrentEmployeeRole();
  const { isSuperAdmin } = useIsSuperAdmin();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (authLoading || roleLoading) return;

    // Se não estiver autenticado, redirecionar para login
    if (!user) {
      navigate("/login");
      return;
    }

    // Super Admin tem acesso a tudo (exceto rotas específicas que serão verificadas)
    if (isSuperAdmin) {
      return;
    }

    // Verificar se a rota requer permissão específica
    const feature = routeToFeature[location.pathname];
    if (!feature) {
      // Rota não mapeada, permitir acesso
      return;
    }

    // Verificar permissão
    if (!role) {
      // Se não tiver role, verificar se é super admin
      if (!isSuperAdmin) {
        navigate("/");
        return;
      }
    } else {
      // Verificar permissão baseada no role (usando customPermissions se disponível)
      const hasAccess = checkPermission(role, feature, undefined, customPermissions);
      if (!hasAccess) {
        navigate("/");
        return;
      }
    }
  }, [user, authLoading, roleLoading, role, customPermissions, isSuperAdmin, location.pathname, navigate]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Super Admin sempre tem acesso
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  // Verificar permissão para a rota atual (usando customPermissions se disponível)
  const feature = routeToFeature[location.pathname];
  if (feature && role) {
    const hasAccess = checkPermission(role, feature, undefined, customPermissions);
    if (!hasAccess) {
      return null;
    }
  }

  return <>{children}</>;
};


