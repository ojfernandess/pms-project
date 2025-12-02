import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ExternalLink, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSiteSettings } from "@/hooks/useSiteSettings";

const PaymentSuccess = () => {
  const { paymentIntentId } = useParams<{ paymentIntentId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [reservationData, setReservationData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pmsLogoUrl, setPmsLogoUrl] = useState<string | null>(null);
  const { settings: siteSettings } = useSiteSettings();

  useEffect(() => {
    // Prioridade: paymentIntentId da URL, depois query string
    const finalPaymentIntentId = paymentIntentId || searchParams.get("payment_intent");
    
    if (finalPaymentIntentId) {
      loadReservationDataByPaymentIntent(finalPaymentIntentId);
    } else {
      setError("ID do pagamento não encontrado");
      setIsLoading(false);
    }
  }, [paymentIntentId, searchParams]);

  const loadReservationDataByPaymentIntent = async (paymentIntent: string) => {
    try {
      const { data: payment, error: paymentError } = await supabase
        .from("stripe_payments")
        .select("reservation_id, status")
        .eq("stripe_payment_intent_id", paymentIntent)
        .single();

      if (paymentError) throw paymentError;

      if (!payment?.reservation_id) {
        setError("Reserva não encontrada para este pagamento");
        setIsLoading(false);
        return;
      }

      await loadReservationById(payment.reservation_id);
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      setError("Erro ao carregar informações da reserva");
      setIsLoading(false);
    }
  };

  const loadReservationById = async (reservationId: string) => {
    try {
      // Buscar reserva com retry para garantir dados atualizados após webhook
      let reservation = null;
      let attempts = 0;
      const maxAttempts = 5;
      
      while (attempts < maxAttempts) {
        const { data: resData, error: reservationError } = await supabase
          .from("reservations")
          .select("id, reservation_code, checkin_date, checkout_date, total_amount, paid_amount, status")
          .eq("id", reservationId)
          .single();

        if (reservationError) throw reservationError;

        if (resData) {
          reservation = resData;
          // Se encontrou a reserva, sair do loop
          break;
        }

        // Aguardar um pouco antes de tentar novamente (para dar tempo do webhook processar)
        if (attempts < maxAttempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
        attempts++;
      }

      if (!reservation) {
        setError("Reserva não encontrada");
        setIsLoading(false);
        return;
      }

      // Buscar web_checkin para obter o localizador
      const { data: webCheckin } = await supabase
        .from("web_checkin")
        .select("locator")
        .eq("reservation_id", reservationId)
        .maybeSingle();

      // Buscar establishment para obter company_id e logo do PMS
      const { data: establishment } = await supabase
        .from("reservations")
        .select("establishment_id")
        .eq("id", reservationId)
        .single();

      if (establishment?.establishment_id) {
        const { data: establishmentData } = await supabase
          .from("establishments")
          .select("company_id")
          .eq("id", establishment.establishment_id)
          .maybeSingle();

        if (establishmentData?.company_id) {
          const { data: company } = await supabase
            .from("companies")
            .select("pms_logo_url")
            .eq("id", establishmentData.company_id)
            .maybeSingle();
          
          if (company?.pms_logo_url && company.pms_logo_url.trim() !== "") {
            setPmsLogoUrl(company.pms_logo_url);
          }
        }
      }

      setReservationData({
        ...reservation,
        locator: webCheckin?.locator || reservation.reservation_code,
      });

      setIsLoading(false);
    } catch (error: any) {
      console.error("Erro ao carregar reserva:", error);
      setError("Erro ao carregar informações da reserva");
      setIsLoading(false);
    }
  };

  const getCheckinLink = () => {
    if (!reservationData?.locator) return "";
    const baseUrl = window.location.origin;
    return `${baseUrl}/web-checkin/${reservationData.locator}`;
  };

  // Logo do sistema (priorizar logo do PMS customizado, depois site_settings)
  const systemLogo = pmsLogoUrl || siteSettings?.logo_url || null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <Card className="p-6 sm:p-8 w-full max-w-md">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 animate-spin text-blue-600" />
            <p className="text-sm sm:text-base text-muted-foreground text-center">Carregando informações...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error || !reservationData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <Card className="p-6 sm:p-8 w-full max-w-md">
          <div className="text-center space-y-4">
            <p className="text-sm sm:text-base text-red-600">{error || "Reserva não encontrada"}</p>
            <Button onClick={() => navigate("/guest-dashboard")} className="w-full sm:w-auto">
              Voltar para o Dashboard
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const checkinLink = getCheckinLink();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center px-3 py-4 sm:px-4 sm:py-6 md:px-6 md:py-8 lg:py-12">
      <div className="w-full max-w-lg">
        {/* Logo do Sistema */}
        {systemLogo && (
          <div className="flex justify-center mb-4 sm:mb-6 md:mb-8">
            <img
              src={systemLogo}
              alt="Logo do Sistema"
              className="h-12 sm:h-16 md:h-20 w-auto object-contain max-w-[200px] sm:max-w-[250px] md:max-w-none"
            />
          </div>
        )}

        <Card className="border-0 shadow-xl overflow-hidden">
          {/* Header com gradiente verde (sucesso) */}
          <div className="bg-gradient-to-r from-green-600 to-green-700 text-white p-4 sm:p-5 md:p-6 lg:p-8">
            <div className="flex flex-col items-center gap-3 sm:gap-4 text-center">
              <div className="rounded-full bg-white/20 p-3 sm:p-4 backdrop-blur-sm">
                <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 text-white" />
              </div>
          <div>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold leading-tight">
              Pagamento Confirmado!
            </h1>
                <p className="text-green-50 text-xs sm:text-sm md:text-base mt-2">
              Seu pagamento foi processado com sucesso.
            </p>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5 md:p-6 lg:p-8 space-y-4 sm:space-y-5 md:space-y-6">
            {/* Localizador da Reserva */}
            {reservationData.reservation_code && (
              <div className="text-center py-4 sm:py-5 md:py-6 border-b border-slate-200">
                <p className="text-xs sm:text-sm text-slate-500 mb-2 font-medium">Localizador da Reserva</p>
                <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 tracking-wider break-words px-2">
                  {reservationData.reservation_code}
                </p>
              </div>
            )}

            {/* Informações da Reserva */}
            <div className="space-y-3 sm:space-y-4">
            {reservationData.checkin_date && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2 sm:py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-slate-600 font-medium">Check-in</span>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-slate-900 text-right sm:text-left">
                  {format(parseISO(reservationData.checkin_date), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
              </div>
            )}

            {reservationData.checkout_date && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2 sm:py-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-slate-600 font-medium">Check-out</span>
                  </div>
                  <span className="text-xs sm:text-sm font-semibold text-slate-900 text-right sm:text-left">
                  {format(parseISO(reservationData.checkout_date), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
              </div>
            )}
          </div>

            {/* Botões de Ação */}
            <div className="pt-3 sm:pt-4 space-y-2 sm:space-y-3">
          {checkinLink && (
                <>
              <Button
                onClick={() => window.open(checkinLink, "_blank")}
                    className="w-full h-11 sm:h-12 text-sm sm:text-base font-semibold shadow-md hover:shadow-lg transition-all"
                size="lg"
              >
                    <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0" />
                    <span className="whitespace-nowrap">Realizar Check-in Online</span>
              </Button>
                  <p className="text-xs text-slate-500 text-center break-all px-2">
                    Ou acesse:{" "}
                    <a 
                      href={checkinLink} 
                      className="text-blue-600 hover:text-blue-700 hover:underline break-all" 
                      target="_blank" 
                      rel="noopener noreferrer"
                    >
                      {checkinLink}
                    </a>
              </p>
                </>
          )}

          <Button
            variant="outline"
            onClick={() => navigate("/guest-dashboard")}
                className="w-full h-10 sm:h-11 border-slate-200 hover:bg-slate-50 text-sm sm:text-base"
          >
            Voltar para o Dashboard
          </Button>
            </div>

          {/* Mensagem adicional */}
            <div className="pt-3 sm:pt-4 border-t border-slate-200">
              <p className="text-xs sm:text-sm text-slate-500 text-center">
            Um email de confirmação foi enviado para você com todos os detalhes da reserva.
          </p>
            </div>
        </div>
      </Card>
      </div>
    </div>
  );
};

export default PaymentSuccess;

