import { ReactNode, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Só redirecionar se não estiver carregando, não houver usuário, e ainda não tiver redirecionado
    if (!loading && !user && !hasRedirected.current) {
      hasRedirected.current = true;
      // Salvar a rota atual para redirecionar após login
      navigate("/login", { state: { from: location.pathname }, replace: true });
    }
    
    // Resetar o flag se o usuário fizer login
    if (user) {
      hasRedirected.current = false;
    }
  }, [user, loading, navigate, location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // Retornar null enquanto redireciona
    return null;
  }

  return <>{children}</>;
};

