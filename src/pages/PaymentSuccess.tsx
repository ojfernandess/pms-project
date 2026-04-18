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
  const [allReservations, setAllReservations] = useState<any[]>([]);
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
      // Primeiro, verificar se é um pagamento de orçamento (quote)
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("id, status, reservation_id, establishment_id, notes")
        .eq("payment_intent_id", paymentIntent)
        .maybeSingle();

      if (!quoteError && quote) {
        // É um pagamento de orçamento
        // Verificar se há múltiplas reservas pré-criadas
        let reservationIds: string[] = [];
        if (quote.notes) {
          // Tentar método novo primeiro (com marcadores HTML)
          const newFormatMatch = quote.notes.match(/<!--RESERVATION_IDS_START-->(.+?)<!--RESERVATION_IDS_END-->/s);
          if (newFormatMatch) {
            try {
              const jsonStr = newFormatMatch[1].trim();
              const parsed = JSON.parse(jsonStr);
              if (parsed.reservation_ids && Array.isArray(parsed.reservation_ids)) {
                reservationIds = parsed.reservation_ids;
              }
            } catch (e) {
              console.warn("Erro ao parsear reservation_ids (formato novo):", e);
            }
          } else {
            // Tentar método antigo (compatibilidade)
            const oldFormatMatch = quote.notes.match(/\[RESERVATION_IDS:(\{.*?\})\]/s);
            if (oldFormatMatch) {
              try {
                const jsonStr = oldFormatMatch[1];
                const parsed = JSON.parse(jsonStr);
                if (parsed.reservation_ids && Array.isArray(parsed.reservation_ids)) {
                  reservationIds = parsed.reservation_ids;
                }
              } catch (e) {
                console.warn("Erro ao parsear reservation_ids (formato antigo):", e);
              }
            }
          }
        }

        // Se encontrou reservation_ids, tentar carregar todas as reservas imediatamente
        if (reservationIds.length > 0) {
          console.log(`[PaymentSuccess] Encontrados ${reservationIds.length} reservation_ids, tentando carregar todas as reservas...`);
          const loadedReservations = await Promise.all(
            reservationIds.map(id => fetchReservationData(id))
          );
          
          const validReservations = loadedReservations.filter(r => r !== null);
          
          if (validReservations.length > 0) {
            console.log(`[PaymentSuccess] Carregadas ${validReservations.length} reservas com sucesso`);
            setReservationData(validReservations[0]);
            setAllReservations(validReservations);
            setIsLoading(false);
            return;
          } else {
            console.log(`[PaymentSuccess] Reservas ainda não foram criadas, aguardando conversão...`);
          }
        }

        if (quote.status === "converted" && quote.reservation_id) {
          // Orçamento já foi convertido
          if (reservationIds.length > 0) {
            // Se há múltiplas reservas, carregar todas
            await loadAllReservations(reservationIds);
          } else {
            // Usar reserva do quote
            await loadReservationById(quote.reservation_id);
          }
        } else {
          // Aguardar conversão do orçamento em reserva
          await waitForQuoteConversion(paymentIntent, quote.id, reservationIds);
        }
        return;
      }

      // Não é um quote, tentar buscar como pagamento de reserva normal
      const { data: payment, error: paymentError } = await supabase
        .from("stripe_payments")
        .select("reservation_id, quote_id, status")
        .eq("stripe_payment_intent_id", paymentIntent)
        .maybeSingle();

      if (paymentError && paymentError.code !== "PGRST116") {
        throw paymentError;
      }

      // Se tem quote_id no payment, aguardar conversão
      if (payment?.quote_id) {
        const { data: quoteData } = await supabase
          .from("quotes")
          .select("id, status, reservation_id, notes")
          .eq("id", payment.quote_id)
          .maybeSingle();

        if (quoteData) {
          // Extrair reservation_ids se houver
          let reservationIds: string[] = [];
          if (quoteData.notes) {
            // Tentar método novo primeiro (com marcadores HTML)
            const newFormatMatch = quoteData.notes.match(/<!--RESERVATION_IDS_START-->(.+?)<!--RESERVATION_IDS_END-->/s);
            if (newFormatMatch) {
              try {
                const jsonStr = newFormatMatch[1].trim();
                const parsed = JSON.parse(jsonStr);
                if (parsed.reservation_ids && Array.isArray(parsed.reservation_ids)) {
                  reservationIds = parsed.reservation_ids;
                }
              } catch (e) {
                console.warn("Erro ao parsear reservation_ids (formato novo):", e);
              }
            } else {
              // Tentar método antigo (compatibilidade)
              const oldFormatMatch = quoteData.notes.match(/\[RESERVATION_IDS:(\{.*?\})\]/s);
              if (oldFormatMatch) {
                try {
                  const jsonStr = oldFormatMatch[1];
                  const parsed = JSON.parse(jsonStr);
                  if (parsed.reservation_ids && Array.isArray(parsed.reservation_ids)) {
                    reservationIds = parsed.reservation_ids;
                  }
                } catch (e) {
                  console.warn("Erro ao parsear reservation_ids (formato antigo):", e);
                }
              }
            }
          }

          // Se encontrou reservation_ids, tentar carregar todas as reservas imediatamente
          if (reservationIds.length > 0) {
            console.log(`[PaymentSuccess] Encontrados ${reservationIds.length} reservation_ids no payment.quote_id, tentando carregar todas as reservas...`);
            const loadedReservations = await Promise.all(
              reservationIds.map(id => fetchReservationData(id))
            );
            
            const validReservations = loadedReservations.filter(r => r !== null);
            
            if (validReservations.length > 0) {
              console.log(`[PaymentSuccess] Carregadas ${validReservations.length} reservas com sucesso`);
              setReservationData(validReservations[0]);
              setAllReservations(validReservations);
              setIsLoading(false);
              return;
            } else {
              console.log(`[PaymentSuccess] Reservas ainda não foram criadas, aguardando conversão...`);
            }
          }

          if (quoteData.status === "converted") {
            if (reservationIds.length > 0) {
              // Se há múltiplas reservas, carregar todas
              await loadAllReservations(reservationIds);
            } else if (quoteData.reservation_id) {
              await loadReservationById(quoteData.reservation_id);
            }
          } else {
            await waitForQuoteConversion(paymentIntent, quoteData.id, reservationIds);
          }
          return;
        }
      }

      // Se tem reservation_id, buscar a reserva
      if (payment?.reservation_id) {
        await loadReservationById(payment.reservation_id);
        return;
      }

      // Se não encontrou nem quote nem reservation, pode ser que ainda esteja processando
      // Tentar aguardar um pouco e verificar novamente
      await waitForQuoteConversion(paymentIntent, null);
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      setError("Erro ao carregar informações da reserva");
      setIsLoading(false);
    }
  };

  const waitForQuoteConversion = async (paymentIntent: string, quoteId: string | null, initialReservationIds: string[] = []) => {
    let attempts = 0;
    const maxAttempts = 10; // Aguardar até 15 segundos (10 tentativas x 1.5s)
    let reservationIds = initialReservationIds;

    while (attempts < maxAttempts) {
      // Tentar buscar quote primeiro
      if (quoteId) {
        const { data: quote } = await supabase
          .from("quotes")
          .select("id, status, reservation_id, notes")
          .eq("id", quoteId)
          .maybeSingle();

        // Extrair reservation_ids do notes (sempre tentar, não apenas se estiver vazio)
        if (quote?.notes) {
          // Tentar método novo primeiro (com marcadores HTML)
          const newFormatMatch = quote.notes.match(/<!--RESERVATION_IDS_START-->(.+?)<!--RESERVATION_IDS_END-->/s);
          if (newFormatMatch) {
            try {
              const jsonStr = newFormatMatch[1].trim();
              const parsed = JSON.parse(jsonStr);
              if (parsed.reservation_ids && Array.isArray(parsed.reservation_ids)) {
                reservationIds = parsed.reservation_ids;
                console.log(`[PaymentSuccess] Encontrados ${reservationIds.length} reservation_ids no quote:`, reservationIds);
              }
            } catch (e) {
              console.warn("Erro ao parsear reservation_ids (formato novo):", e);
            }
          } else {
            // Tentar método antigo (compatibilidade)
            const oldFormatMatch = quote.notes.match(/\[RESERVATION_IDS:(\{.*?\})\]/s);
            if (oldFormatMatch) {
              try {
                const jsonStr = oldFormatMatch[1];
                const parsed = JSON.parse(jsonStr);
                if (parsed.reservation_ids && Array.isArray(parsed.reservation_ids)) {
                  reservationIds = parsed.reservation_ids;
                  console.log(`[PaymentSuccess] Encontrados ${reservationIds.length} reservation_ids no quote (formato antigo):`, reservationIds);
                }
              } catch (e) {
                console.warn("Erro ao parsear reservation_ids (formato antigo):", e);
              }
            }
          }
        }

        // Se encontrou reservation_ids, tentar carregar todas as reservas imediatamente
        if (reservationIds.length > 0) {
          console.log(`[PaymentSuccess] Tentando carregar ${reservationIds.length} reservas pré-criadas...`);
          const loadedReservations = await Promise.all(
            reservationIds.map(id => fetchReservationData(id))
          );
          
          const validReservations = loadedReservations.filter(r => r !== null);
          
          if (validReservations.length > 0) {
            console.log(`[PaymentSuccess] Carregadas ${validReservations.length} reservas com sucesso`);
            setReservationData(validReservations[0]);
            setAllReservations(validReservations);
            setIsLoading(false);
            return;
          } else {
            console.log(`[PaymentSuccess] Reservas ainda não foram criadas, aguardando...`);
          }
        }

        if (quote?.status === "converted") {
          // Se há múltiplas reservas, carregar todas
          if (reservationIds.length > 0) {
            await loadAllReservations(reservationIds);
          } else if (quote.reservation_id) {
            await loadReservationById(quote.reservation_id);
          }
          return;
        }
      }

      // Tentar buscar pelo payment_intent_id
      const { data: quoteByIntent } = await supabase
        .from("quotes")
        .select("id, status, reservation_id, notes")
        .eq("payment_intent_id", paymentIntent)
        .maybeSingle();

      // Extrair reservation_ids do quoteByIntent também
      if (quoteByIntent?.notes && reservationIds.length === 0) {
        const newFormatMatch = quoteByIntent.notes.match(/<!--RESERVATION_IDS_START-->(.+?)<!--RESERVATION_IDS_END-->/s);
        if (newFormatMatch) {
          try {
            const jsonStr = newFormatMatch[1].trim();
            const parsed = JSON.parse(jsonStr);
            if (parsed.reservation_ids && Array.isArray(parsed.reservation_ids)) {
              reservationIds = parsed.reservation_ids;
              console.log(`[PaymentSuccess] Encontrados ${reservationIds.length} reservation_ids no quoteByIntent:`, reservationIds);
              
              // Tentar carregar imediatamente
              const loadedReservations = await Promise.all(
                reservationIds.map(id => fetchReservationData(id))
              );
              
              const validReservations = loadedReservations.filter(r => r !== null);
              
              if (validReservations.length > 0) {
                setReservationData(validReservations[0]);
                setAllReservations(validReservations);
                setIsLoading(false);
                return;
              }
            }
          } catch (e) {
            console.warn("Erro ao parsear reservation_ids:", e);
          }
        }
      }

      if (quoteByIntent?.status === "converted") {
        if (reservationIds.length > 0) {
          await loadAllReservations(reservationIds);
        } else if (quoteByIntent.reservation_id) {
          await loadReservationById(quoteByIntent.reservation_id);
        }
        return;
      }

      // Tentar buscar pelo stripe_payments
      const { data: payment } = await supabase
        .from("stripe_payments")
        .select("reservation_id, quote_id")
        .eq("stripe_payment_intent_id", paymentIntent)
        .maybeSingle();

      if (payment?.reservation_id) {
        await loadReservationById(payment.reservation_id);
        return;
      }

      // Aguardar antes de tentar novamente
      if (attempts < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      attempts++;
    }

    // Se chegou aqui, não conseguiu encontrar a reserva após várias tentativas
    // Mas se temos reservationIds, tentar carregar uma última vez
    if (reservationIds.length > 0) {
      console.log(`[PaymentSuccess] Última tentativa de carregar ${reservationIds.length} reservas...`);
      const loadedReservations = await Promise.all(
        reservationIds.map(id => fetchReservationData(id))
      );
      
      const validReservations = loadedReservations.filter(r => r !== null);
      
      if (validReservations.length > 0) {
        setReservationData(validReservations[0]);
        setAllReservations(validReservations);
        setIsLoading(false);
        return;
      }
    }

    setError("Pagamento processado! A reserva está sendo criada. Você receberá um email de confirmação em instantes.");
    setIsLoading(false);
  };

  const loadAllReservations = async (reservationIds: string[]) => {
    try {
      console.log(`[PaymentSuccess] Carregando ${reservationIds.length} reservas...`);
      const reservations: any[] = [];
      
      // Carregar todas as reservas em paralelo para melhor performance
      const loadedReservations = await Promise.all(
        reservationIds.map(id => fetchReservationData(id))
      );
      
      const validReservations = loadedReservations.filter(r => r !== null);
      
      if (validReservations.length === 0) {
        setError("Nenhuma reserva encontrada");
        setIsLoading(false);
        return;
      }
      
      console.log(`[PaymentSuccess] Carregadas ${validReservations.length} reservas com sucesso`);
      
      // Usar a primeira reserva como principal (para check-in)
      setReservationData(validReservations[0]);
      setAllReservations(validReservations);
      setIsLoading(false);
    } catch (error: any) {
      console.error("Erro ao carregar reservas:", error);
      setError("Erro ao carregar informações das reservas");
      setIsLoading(false);
    }
  };

  const fetchReservationData = async (reservationId: string, retryCount: number = 0): Promise<any> => {
    try {
      const { data: reservation, error: reservationError } = await supabase
        .from("reservations")
        .select("id, reservation_code, checkin_date, checkout_date, total_amount, paid_amount, status, room_id, category_id, guest_name")
        .eq("id", reservationId)
        .maybeSingle();

      if (reservationError) {
        // Se for erro de RLS ou não encontrado, tentar novamente se ainda não tentou muitas vezes
        if (retryCount < 3 && (reservationError.code === "PGRST116" || reservationError.code === "42501")) {
          console.log(`[PaymentSuccess] Reserva ${reservationId} ainda não disponível (tentativa ${retryCount + 1}/3), aguardando...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return fetchReservationData(reservationId, retryCount + 1);
        }
        console.error(`Erro ao buscar reserva ${reservationId}:`, reservationError);
        return null;
      }

      if (!reservation) {
        // Se não encontrou, tentar novamente se ainda não tentou muitas vezes
        if (retryCount < 3) {
          console.log(`[PaymentSuccess] Reserva ${reservationId} não encontrada (tentativa ${retryCount + 1}/3), aguardando...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return fetchReservationData(reservationId, retryCount + 1);
        }
        console.warn(`Reserva ${reservationId} não encontrada ou sem acesso após ${retryCount + 1} tentativas`);
        return null;
      }

      // Buscar web_checkin para obter o localizador
      const { data: webCheckin } = await supabase
        .from("web_checkin")
        .select("locator")
        .eq("reservation_id", reservationId)
        .maybeSingle();

      return {
        ...reservation,
        locator: webCheckin?.locator || reservation.reservation_code,
      };
    } catch (error) {
      console.error(`Erro ao buscar reserva ${reservationId}:`, error);
      return null;
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
      
      // Se há apenas uma reserva, também definir em allReservations
      setAllReservations([{
        ...reservation,
        locator: webCheckin?.locator || reservation.reservation_code,
      }]);

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
    const isQuotePayment = error?.includes("Pagamento processado") || error?.includes("sendo criada");
    
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <Card className="p-6 sm:p-8 w-full max-w-md">
          <div className="text-center space-y-4">
            {isQuotePayment ? (
              <>
                <div className="flex justify-center mb-4">
                  <div className="rounded-full bg-green-100 p-4">
                    <CheckCircle2 className="w-12 h-12 text-green-600" />
                  </div>
                </div>
                <h2 className="text-xl font-bold text-slate-900">Pagamento Confirmado!</h2>
                <p className="text-sm sm:text-base text-slate-600">{error}</p>
                <p className="text-xs text-slate-500 mt-2">
                  Você receberá um email de confirmação com os detalhes da sua reserva assim que ela for criada.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm sm:text-base text-red-600">{error || "Reserva não encontrada"}</p>
              </>
            )}
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
            {/* Título baseado no número de reservas */}
            {allReservations.length > 1 ? (
              <div className="text-center py-2 sm:py-3 border-b border-slate-200">
                <p className="text-xs sm:text-sm text-slate-500 mb-1 font-medium">
                  {allReservations.length} Reservas Confirmadas
                </p>
              </div>
            ) : (
              reservationData.reservation_code && (
                <div className="text-center py-4 sm:py-5 md:py-6 border-b border-slate-200">
                  <p className="text-xs sm:text-sm text-slate-500 mb-2 font-medium">Localizador da Reserva</p>
                  <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 tracking-wider break-words px-2">
                    {reservationData.reservation_code}
                  </p>
                </div>
              )
            )}

            {/* Lista de Reservas */}
            {allReservations.length > 1 ? (
              <div className="space-y-4">
                {allReservations.map((reservation, index) => (
                  <div key={reservation.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <p className="text-xs sm:text-sm text-slate-500 font-medium">Reserva {index + 1}</p>
                      <p className="text-lg sm:text-xl font-bold text-slate-900 tracking-wider">
                        {reservation.reservation_code}
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      {reservation.checkin_date && (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            <span className="text-xs sm:text-sm text-slate-600 font-medium">Check-in</span>
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-slate-900 text-right sm:text-left">
                            {format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        </div>
                      )}

                      {reservation.checkout_date && (
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-1">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <span className="text-xs sm:text-sm text-slate-600 font-medium">Check-out</span>
                          </div>
                          <span className="text-xs sm:text-sm font-semibold text-slate-900 text-right sm:text-left">
                            {format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        </div>
                      )}

                      {reservation.locator && (
                        <div className="pt-2 border-t border-slate-100">
                          <p className="text-xs text-slate-500 mb-1">Localizador:</p>
                          <p className="text-sm font-mono text-slate-700 break-all">{reservation.locator}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Informações da Reserva Única */
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
            )}

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
                {allReservations.length > 1 
                  ? `Um email de confirmação foi enviado para você com todos os detalhes das ${allReservations.length} reservas.`
                  : "Um email de confirmação foi enviado para você com todos os detalhes da reserva."
                }
              </p>
            </div>
        </div>
      </Card>
      </div>
    </div>
  );
};

export default PaymentSuccess;

