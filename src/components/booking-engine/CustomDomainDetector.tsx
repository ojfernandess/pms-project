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
        const currentProtocol = typeof window !== "undefined" ? window.location.protocol : undefined;
        
        console.log("[CustomDomainDetector] Verificando domínio:", currentHost);
        
        if (!currentHost) {
          console.log("[CustomDomainDetector] Sem host, redirecionando para dashboard");
          setIsCustomDomain(false);
          setIsLoading(false);
          return;
        }

        // Se estiver em HTTP, redirecionar para HTTPS (Vercel deve fazer isso, mas garantimos aqui também)
        if (currentProtocol === "http:") {
          const httpsUrl = `https://${currentHost}${location.pathname}${location.search}`;
          console.log("[CustomDomainDetector] Redirecionando HTTP para HTTPS:", httpsUrl);
          window.location.replace(httpsUrl);
          return;
        }

        // Normalizar o domínio (remover www. se presente, converter para minúsculas)
        const normalizeDomain = (domain: string) => {
          return domain.toLowerCase().replace(/^www\./, "");
        };
        
        const normalizedHost = normalizeDomain(currentHost);
        console.log("[CustomDomainDetector] Host normalizado:", normalizedHost);

        // Verificar se é um domínio personalizado configurado (com e sem www)
        const { data: companies, error: companyError } = await supabase
          .from("companies")
          .select("id, booking_engine_custom_domain")
          .not("booking_engine_custom_domain", "is", null);

        if (companyError) {
          console.error("[CustomDomainDetector] Erro ao buscar empresas por domínio:", companyError);
        }

        // Verificar se algum domínio configurado corresponde ao host atual (com ou sem www)
        const companyByDomain = companies?.find((company) => {
          if (!company.booking_engine_custom_domain) return false;
          const normalizedConfig = normalizeDomain(company.booking_engine_custom_domain);
          return normalizedConfig === normalizedHost || 
                 normalizedConfig === currentHost.toLowerCase() ||
                 company.booking_engine_custom_domain.toLowerCase() === currentHost.toLowerCase();
        });

        if (companyByDomain) {
          // É um domínio personalizado do booking engine
          console.log("[CustomDomainDetector] Domínio personalizado detectado:", currentHost, "-> Empresa:", companyByDomain.id);
          setIsCustomDomain(true);
          setIsLoading(false);
          return;
        }

        // Verificar também em hotel_settings (legado)
        const { data: hotelSettings, error: hotelError } = await supabase
          .from("hotel_settings")
          .select("establishment_id, booking_engine_custom_domain")
          .not("booking_engine_custom_domain", "is", null);

        if (hotelError) {
          console.error("[CustomDomainDetector] Erro ao buscar hotel_settings por domínio:", hotelError);
        }

        const byDomain = hotelSettings?.find((setting) => {
          if (!setting.booking_engine_custom_domain) return false;
          const normalizedConfig = normalizeDomain(setting.booking_engine_custom_domain);
          return normalizedConfig === normalizedHost || 
                 normalizedConfig === currentHost.toLowerCase() ||
                 setting.booking_engine_custom_domain.toLowerCase() === currentHost.toLowerCase();
        });

        if (byDomain) {
          // É um domínio personalizado do booking engine (legado)
          console.log("[CustomDomainDetector] Domínio personalizado detectado (legado):", currentHost);
          setIsCustomDomain(true);
          setIsLoading(false);
          return;
        }

        // Não é um domínio personalizado
        console.log("[CustomDomainDetector] Não é domínio personalizado:", currentHost);
        console.log("[CustomDomainDetector] Domínios configurados encontrados:", {
          companies: companies?.map(c => c.booking_engine_custom_domain),
          hotelSettings: hotelSettings?.map(h => h.booking_engine_custom_domain)
        });
        setIsCustomDomain(false);
        setIsLoading(false);
      } catch (error) {
        console.error("[CustomDomainDetector] Erro ao verificar domínio personalizado:", error);
        setIsCustomDomain(false);
        setIsLoading(false);
      }
    };

    checkCustomDomain();
  }, [location.pathname, location.search]);

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

  // Se não for domínio personalizado, verificar se é o domínio principal do Vercel
  // Se não for, pode ser um domínio personalizado que ainda não foi detectado
  // Nesse caso, mostrar o booking engine mesmo assim (o BookingEnginePage fará a verificação)
  const isVercelDomain = typeof window !== "undefined" && 
    (window.location.host.includes("vercel.app") || 
     window.location.host.includes("localhost") ||
     window.location.host.includes("127.0.0.1"));
  
  if (!isVercelDomain) {
    // Se não for domínio do Vercel, pode ser um domínio personalizado
    // Mostrar o booking engine e deixar ele fazer a verificação
    console.log("[CustomDomainDetector] Domínio não-Vercel detectado, mostrando booking engine:", window.location.host);
    return <BookingEnginePage />;
  }

  // Se for domínio do Vercel e não for personalizado, redirecionar para user-dashboard (com proteção de rota)
  return (
    <ProtectedRoute>
      <Navigate to="/user-dashboard" replace />
    </ProtectedRoute>
  );
};

export default CustomDomainDetector;

