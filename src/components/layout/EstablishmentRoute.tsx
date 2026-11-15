import { ReactNode, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface EstablishmentRouteProps {
  children: ReactNode;
}

export const EstablishmentRoute = ({ children }: EstablishmentRouteProps) => {
  const { establishmentId } = useParams<{ establishmentId: string }>();
  const { selectedEstablishment, setSelectedEstablishment, establishments, isLoading, refetch } =
    useEstablishment();
  const navigate = useNavigate();
  const location = useLocation();
  const [resolving, setResolving] = useState(false);
  const resolveAttemptedRef = useRef<string | null>(null);

  const numericId = establishmentId ? parseInt(establishmentId, 10) : NaN;
  const numericIdValid = Number.isFinite(numericId) && numericId > 0;

  useEffect(() => {
    if (!establishmentId) {
      if (location.pathname !== "/user-dashboard") {
        navigate("/user-dashboard", { replace: true });
      }
      return;
    }

    if (!numericIdValid) {
      navigate("/user-dashboard", { replace: true });
      return;
    }

    if (selectedEstablishment?.numeric_id === numericId) {
      return;
    }

    const fromList = establishments.find((e) => e.numeric_id === numericId);
    if (fromList) {
      setSelectedEstablishment(fromList);
      return;
    }

    if (isLoading) {
      return;
    }

    const attemptKey = String(numericId);
    if (resolveAttemptedRef.current === attemptKey || resolving) {
      return;
    }
    resolveAttemptedRef.current = attemptKey;

    let cancelled = false;
    setResolving(true);

    (async () => {
      try {
        const { data, error } = await supabase
          .from("establishments")
          .select("*")
          .eq("numeric_id", numericId)
          .eq("is_active", true)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error("EstablishmentRoute: falha ao resolver numeric_id", error.message);
          navigate("/user-dashboard", { replace: true });
          return;
        }

        if (data) {
          setSelectedEstablishment(data);
          void refetch();
          return;
        }

        if (establishments.length > 0) {
          navigate("/user-dashboard", { replace: true });
        }
      } finally {
        if (!cancelled) {
          setResolving(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    establishmentId,
    numericId,
    numericIdValid,
    selectedEstablishment,
    establishments,
    isLoading,
    setSelectedEstablishment,
    navigate,
    location.pathname,
    refetch,
    resolving,
  ]);

  useEffect(() => {
    resolveAttemptedRef.current = null;
  }, [establishmentId]);

  if (!establishmentId || !numericIdValid) {
    return null;
  }

  if (selectedEstablishment?.numeric_id === numericId) {
    return <>{children}</>;
  }

  if (isLoading || resolving) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando estabelecimento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Preparando estabelecimento...</p>
      </div>
    </div>
  );
};