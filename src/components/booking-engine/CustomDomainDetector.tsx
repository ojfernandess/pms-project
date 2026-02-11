import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import BookingEnginePage from "@/booking-engine";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";

/**
 * Componente que detecta se o domínio atual é um domínio personalizado do booking engine
 * e mostra o booking engine diretamente na raiz
 */
const CustomDomainDetector = () => {
  const [isCustomDomain, setIsCustomDomain] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const checkCustomDomain = async () => {
      try {
        const currentHost = typeof window !== "undefined" ? window.location.host : undefined;
        
        if (!currentHost) {
          setIsCustomDomain(false);
          setIsLoading(false);
          return;
        }

        // Verificar se é um domínio personalizado configurado
        const { data: companyByDomain, error: companyError } = await supabase
          .from("companies")
          .select("id, booking_engine_custom_domain")
          .eq("booking_engine_custom_domain", currentHost)
          .maybeSingle();

        if (companyError) {
          console.error("[CustomDomainDetector] Erro ao buscar empresa por domínio:", companyError);
        }

        if (companyByDomain) {
          // É um domínio personalizado do booking engine
          console.log("[CustomDomainDetector] Domínio personalizado detectado:", currentHost);
          setIsCustomDomain(true);
          setIsLoading(false);
          return;
        }

        // Verificar também em hotel_settings (legado)
        const { data: byDomain, error: hotelError } = await supabase
          .from("hotel_settings")
          .select("establishment_id, booking_engine_custom_domain")
          .eq("booking_engine_custom_domain", currentHost)
          .maybeSingle();

        if (hotelError) {
          console.error("[CustomDomainDetector] Erro ao buscar hotel_settings por domínio:", hotelError);
        }

        if (byDomain) {
          // É um domínio personalizado do booking engine (legado)
          console.log("[CustomDomainDetector] Domínio personalizado detectado (legado):", currentHost);
          setIsCustomDomain(true);
          setIsLoading(false);
          return;
        }

        // Não é um domínio personalizado
        console.log("[CustomDomainDetector] Não é domínio personalizado:", currentHost);
        setIsCustomDomain(false);
        setIsLoading(false);
      } catch (error) {
        console.error("[CustomDomainDetector] Erro ao verificar domínio personalizado:", error);
        setIsCustomDomain(false);
        setIsLoading(false);
      }
    };

    checkCustomDomain();
  }, [location.pathname]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Se for um domínio personalizado, mostrar o booking engine diretamente
  if (isCustomDomain) {
    return <BookingEnginePage />;
  }

  // Se não for domínio personalizado, redirecionar para user-dashboard (com proteção de rota)
  return (
    <ProtectedRoute>
      <Navigate to="/user-dashboard" replace />
    </ProtectedRoute>
  );
};

export default CustomDomainDetector;

