import { ReactNode, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useIsSuperAdmin } from "@/hooks/useUsers";
import { Loader2 } from "lucide-react";

interface SuperAdminRouteProps {
  children: ReactNode;
}

export const SuperAdminRoute = ({ children }: SuperAdminRouteProps) => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: adminLoading } = useIsSuperAdmin();
  const navigate = useNavigate();

  useEffect(() => {
    // Se não estiver carregando e não houver usuário, redirecionar para login
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }

    // Se não estiver carregando e o usuário não for super admin, redirecionar para dashboard
    if (!authLoading && !adminLoading && user && !isSuperAdmin) {
      navigate("/");
      return;
    }
  }, [user, authLoading, adminLoading, isSuperAdmin, navigate]);

  // Mostrar loading enquanto verifica autenticação ou status de admin
  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Se não houver usuário, não renderizar nada (será redirecionado)
  if (!user) {
    return null;
  }

  // Se não for super admin, não renderizar nada (será redirecionado)
  if (!isSuperAdmin) {
    return null;
  }

  return <>{children}</>;
};


