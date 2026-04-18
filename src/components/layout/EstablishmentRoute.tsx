import { ReactNode, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { Loader2 } from "lucide-react";

interface EstablishmentRouteProps {
  children: ReactNode;
}

export const EstablishmentRoute = ({ children }: EstablishmentRouteProps) => {
  const { establishmentId } = useParams<{ establishmentId: string }>();
  const { selectedEstablishment, setSelectedEstablishment, establishments, isLoading } = useEstablishment();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!establishmentId) {
      // Se não há establishmentId na URL, redirecionar para user-dashboard
      // Mas só se não estivermos já na página user-dashboard
      if (location.pathname !== "/user-dashboard") {
        navigate("/user-dashboard", { replace: true });
      }
      return;
    }

    // Converter establishmentId para número
    const numericId = parseInt(establishmentId, 10);
    if (isNaN(numericId)) {
      // Se não é um número válido, redirecionar
      navigate("/user-dashboard", { replace: true });
      return;
    }

    // Se já temos o estabelecimento selecionado e é o mesmo da URL, não fazer nada
    if (selectedEstablishment?.numeric_id === numericId) {
      return;
    }

    // Se a lista de estabelecimentos ainda está carregando, aguardar
    if (isLoading) {
      return;
    }

    // Buscar o estabelecimento na lista pelo numeric_id
    const establishment = establishments.find((e) => e.numeric_id === numericId);
    
    if (establishment) {
      // Estabelecimento encontrado, atualizar o contexto
      setSelectedEstablishment(establishment);
    } else if (establishments.length > 0) {
      // Estabelecimento não encontrado, mas há estabelecimentos disponíveis
      // Redirecionar para user-dashboard
      navigate("/user-dashboard", { replace: true });
    }
  }, [establishmentId, selectedEstablishment, establishments, isLoading, setSelectedEstablishment, navigate, location.pathname]);

  // Se não há establishmentId, não renderizar (será redirecionado)
  if (!establishmentId) {
    return null;
  }

  // Se ainda está carregando, mostrar loading
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando estabelecimento...</p>
        </div>
      </div>
    );
  }

  // Se não encontrou o estabelecimento, não renderizar (será redirecionado)
  const numericId = parseInt(establishmentId || "0", 10);
  if (!selectedEstablishment || selectedEstablishment.numeric_id !== numericId) {
    return null;
  }

  return <>{children}</>;
};

