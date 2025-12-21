import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentEmployeeRole } from "@/hooks/useEmployees";
import { useIsSuperAdmin } from "@/hooks/useUsers";
import { getFeatureFromPath, checkPermission } from "@/lib/permissions";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

interface RoleProtectedRouteProps {
  children: ReactNode;
}

export const RoleProtectedRoute = ({ children }: RoleProtectedRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { role, customPermissions, isLoading: roleLoading } = useCurrentEmployeeRole();
  const { isSuperAdmin } = useIsSuperAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const [hasChecked, setHasChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    if (authLoading || roleLoading) return;

    // Se não estiver autenticado, redirecionar para login
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }

    // Super Admin tem acesso a tudo (exceto rotas específicas que serão verificadas)
    if (isSuperAdmin) {
      setHasAccess(true);
      setHasChecked(true);
      return;
    }

    // Verificar se a rota requer permissão específica
    const feature = getFeatureFromPath(location.pathname);
    
    // Se não tiver feature mapeada, permitir acesso (rotas públicas ou especiais)
    if (!feature) {
      setHasAccess(true);
      setHasChecked(true);
      return;
    }

    // REGRA ESPECIAL: Proprietários sempre têm acesso ao dashboard do proprietário
    if (feature === "owner_dashboard" && role && role.code === "owner") {
      setHasAccess(true);
      setHasChecked(true);
      return;
    }

    // Verificar permissão
    if (!role) {
      // Se não tiver role e não for super admin, redirecionar
      setHasAccess(false);
      setHasChecked(true);
      // Redirecionar após um pequeno delay para mostrar mensagem
      setTimeout(() => {
        navigate("/user-dashboard", { replace: true });
      }, 2000);
      return;
    }

    // Verificar permissão baseada no role (usando customPermissions se disponível)
    const access = checkPermission(role, feature, undefined, customPermissions);
    setHasAccess(access);
    setHasChecked(true);
    
    if (!access) {
      // Redirecionar após um pequeno delay para mostrar mensagem
      setTimeout(() => {
        navigate("/user-dashboard", { replace: true });
      }, 2000);
    }
  }, [user, authLoading, roleLoading, role, customPermissions, isSuperAdmin, location.pathname, navigate]);

  if (authLoading || roleLoading || !hasChecked) {
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

  // Se não tem acesso, mostrar mensagem de erro
  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <AlertCircle className="h-16 w-16 mx-auto mb-4 text-destructive" />
          <h2 className="text-2xl font-bold mb-2">Acesso Negado</h2>
          <p className="text-muted-foreground mb-4">
            Você não tem permissão para acessar esta página.
          </p>
          <p className="text-sm text-muted-foreground">
            Redirecionando...
          </p>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};


