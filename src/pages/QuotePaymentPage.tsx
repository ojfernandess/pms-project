import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Phone, Mail, MapPin, Info, CreditCard, CheckCircle2, Clock, User, AlertCircle } from "lucide-react";
import { StripeProvider } from "@/components/stripe/StripeProvider";
import { PaymentDialog } from "@/components/stripe/PaymentDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Alert, AlertDescription } from "@/components/ui/alert";

const QuotePaymentPage = () => {
  const { paymentIntentId } = useParams<{ paymentIntentId: string }>();
  const navigate = useNavigate();
  const [quoteData, setQuoteData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [stripeConfig, setStripeConfig] = useState<any>(null);
  const [hotelSettings, setHotelSettings] = useState<any>(null);
  const [establishmentData, setEstablishmentData] = useState<any>(null);
  const [pmsLogoUrl, setPmsLogoUrl] = useState<string | null>(null);
  const { settings: siteSettings } = useSiteSettings();
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isExpired, setIsExpired] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [shouldReload, setShouldReload] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleExpiredQuote = useCallback(async (quoteId: string) => {
    if (isCancelling) return;
    
    setIsCancelling(true);
    try {
      const { data, error } = await supabase.rpc('cancel_expired_quote', {
        p_quote_id: quoteId
      });

      if (error) {
        console.error('Erro ao cancelar quote expirado:', error);
        toast.error('Erro ao processar cancelamento do orçamento');
      } else if (data?.success) {
        toast.error('Tempo de pagamento expirado. O orçamento foi cancelado.');
        // Sinalizar que precisa recarregar
        setShouldReload(true);
      }
    } catch (error: any) {
      console.error('Erro ao cancelar quote expirado:', error);
      toast.error('Erro ao processar cancelamento do orçamento');
    } finally {
      setIsCancelling(false);
    }
  }, [isCancelling]);

  const loadQuoteData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Tentar buscar quote diretamente pelo payment_intent_id primeiro
      let quoteId: string | null = null;
      
      // Buscar quote pelo payment_intent_id
      const { data: quoteByIntent, error: quoteByIntentError } = await supabase
        .from("quotes")
        .select("id")
        .eq("payment_intent_id", paymentIntentId)
        .maybeSingle();

      if (!quoteByIntentError && quoteByIntent) {
        quoteId = quoteByIntent.id;
      } else {
        // Se não encontrar, tentar buscar pelo stripe_payments
        const { data: payment, error: paymentError } = await supabase
          .from("stripe_payments")
          .select("metadata, quote_id")
          .eq("stripe_payment_intent_id", paymentIntentId)
          .maybeSingle();

        if (paymentError) {
          console.error("Erro ao buscar pagamento:", paymentError);
        }

        // Buscar quote_id do metadata ou do payment
        quoteId = payment?.metadata?.quote_id || payment?.quote_id || null;
      }

      if (!quoteId) {
        toast.error("Orçamento não encontrado");
        setIsLoading(false);
        return;
      }

      // Buscar dados do orçamento (sem relacionamento para evitar problemas de RLS)
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select(`
          *,
          category:room_categories(*)
        `)
        .eq("id", quoteId)
        .maybeSingle();

      if (quoteError || !quote) {
        toast.error("Orçamento não encontrado");
        setIsLoading(false);
        return;
      }

      // Verificar se já foi convertido
      if (quote.status === "converted") {
        toast.success("Orçamento já foi convertido em reserva");
        if (quote.reservation_id) {
          const establishmentId = quote.establishment_id;
          navigate(`/${establishmentId}/reservas/${quote.reservation_id}`);
        }
        setIsLoading(false);
        return;
      }

      // Verificar se já está expirado
      if (quote.status === "expired") {
        setIsExpired(true);
        setTimeRemaining(0);
        setIsLoading(false);
        return;
      }

      setQuoteData(quote);

      // Buscar estabelecimento separadamente
      if (quote.establishment_id) {
        const { data: establishment, error: establishmentError } = await supabase
          .from("establishments")
          .select("*")
          .eq("id", quote.establishment_id)
          .maybeSingle();

        if (establishmentError) {
          console.error("Erro ao buscar estabelecimento:", establishmentError);
          toast.error("Erro ao buscar dados do estabelecimento");
        } else {
          setEstablishmentData(establishment);
        }
      }

      // Buscar configurações do hotel
      const { data: hotel, error: hotelError } = await supabase
        .from("hotel_settings")
        .select("*")
        .eq("establishment_id", quote.establishment_id)
        .maybeSingle();

      if (hotelError) {
        console.error("Erro ao buscar configurações do hotel:", hotelError);
      } else {
        setHotelSettings(hotel);
        
        // Inicializar timer após carregar configurações do hotel
        if (quote.created_at && hotel?.quote_payment_timer_minutes) {
          const timerMinutes = hotel.quote_payment_timer_minutes;
          const createdAt = new Date(quote.created_at);
          const expirationTime = new Date(createdAt.getTime() + timerMinutes * 60 * 1000);
          const now = new Date();
          const remaining = Math.max(0, Math.floor((expirationTime.getTime() - now.getTime()) / 1000));
          
          if (remaining > 0) {
            setTimeRemaining(remaining);
            setIsExpired(false);
          } else {
            setTimeRemaining(0);
            setIsExpired(true);
            // Cancelar automaticamente se já expirou
            handleExpiredQuote(quote.id);
          }
        }
      }

      // Buscar configuração do Stripe
      const { data: stripe, error: stripeError } = await supabase
        .from("stripe_establishment_config")
        .select("is_enabled, test_publishable_key, live_publishable_key")
        .eq("establishment_id", quote.establishment_id)
        .maybeSingle();

      if (stripeError) {
        console.error("Erro ao buscar configuração do Stripe:", stripeError);
        // Não bloquear o carregamento se não houver configuração
      } else if (stripe && stripe.is_enabled) {
        // Buscar configuração global para determinar modo (test ou live)
        const { data: globalConfig } = await supabase
          .from("stripe_global_config")
          .select("test_mode")
          .maybeSingle();

        const isTestMode = globalConfig?.test_mode ?? true;
        const publishableKey = isTestMode 
          ? stripe.test_publishable_key 
          : stripe.live_publishable_key;

        if (publishableKey) {
          setStripeConfig({ publishable_key: publishableKey });
        }
      }

      // Processar logo
      if (siteSettings?.logo_url) {
        setPmsLogoUrl(siteSettings.logo_url);
      } else if (hotel?.logo_url) {
        setPmsLogoUrl(hotel.logo_url);
      }
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar informações do orçamento");
    } finally {
      setIsLoading(false);
    }
  }, [paymentIntentId, navigate, siteSettings, handleExpiredQuote]);

  // Recarregar quando necessário
  useEffect(() => {
    if (shouldReload && paymentIntentId) {
      setShouldReload(false);
      setTimeout(() => {
        loadQuoteData();
      }, 1000);
    }
  }, [shouldReload, paymentIntentId, loadQuoteData]);

  useEffect(() => {
    if (paymentIntentId) {
      loadQuoteData();
    }
    
    // Cleanup do timer ao desmontar
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [paymentIntentId, loadQuoteData]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining === null || isExpired) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      return;
    }

    // Configurar intervalo para atualizar o timer a cada segundo
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) {
          setIsExpired(true);
          if (quoteData?.id) {
            handleExpiredQuote(quoteData.id);
          }
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [timeRemaining, isExpired, quoteData?.id, handleExpiredQuote]);

  const findQuoteByPaymentIntent = async (paymentIntentId: string): Promise<string | null> => {
    try {
      // Buscar quote pelo payment_intent_id
      const { data: quote } = await supabase
        .from("quotes")
        .select("id")
        .eq("payment_intent_id", paymentIntentId)
        .maybeSingle();

      return quote?.id || null;
    } catch {
      return null;
    }
  };

  const handlePaymentSuccess = () => {
    // Limpar timer ao realizar pagamento
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setTimeRemaining(null);
    
    // Redirecionar para página de sucesso
    if (paymentIntentId) {
      navigate(`/payment/success/${paymentIntentId}`);
    } else {
      toast.success("Pagamento processado! O orçamento será convertido em reserva em instantes.");
      setTimeout(() => {
        if (quoteData?.id) {
          loadQuoteData(); // Recarregar para verificar se foi convertido
        }
      }, 3000);
    }
  };

  const formatTimeRemaining = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <Card className="p-6 sm:p-8 w-full max-w-md">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 animate-spin text-blue-600" />
            <p className="text-sm sm:text-base text-muted-foreground text-center">
              Carregando informações do orçamento...
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (!quoteData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <Card className="p-6 sm:p-8 w-full max-w-md">
          <div className="text-center space-y-4">
            <p className="text-sm sm:text-base text-muted-foreground">Orçamento não encontrado</p>
            <Button onClick={() => navigate("/")} className="w-full sm:w-auto">
              Voltar
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const establishment = establishmentData;
  const category = quoteData.category;
  const locationName = establishment?.name || hotelSettings?.name || "";
  const categoryName = category?.name || "";
  
  // Função para obter a URL da página pública de reservas
  const getPublicReservationUrl = () => {
    if (!establishment) return "/";
    
    // Tentar usar slug primeiro, depois numeric_id
    const establishmentSlug = establishment.slug || establishment.numeric_id?.toString() || "";
    
    if (!establishmentSlug) {
      return "/";
    }
    
    return `/reservar/${establishmentSlug}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            {pmsLogoUrl && (
              <img
                src={pmsLogoUrl}
                alt="Logo"
                className="h-12 object-contain"
              />
            )}
            <Badge variant="outline" className="text-sm">
              Orçamento #{quoteData.quote_code}
            </Badge>
          </div>

          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                Pagamento do Orçamento
              </h1>
              <p className="text-sm text-slate-600">
                Complete o pagamento para confirmar sua reserva
              </p>
            </div>

            <Separator />

            {/* Informações do Hóspede */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500">Hóspede</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {quoteData.guest_name || "--"}
                  </p>
                </div>
              </div>

              {quoteData.guest_email && (
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">E-mail</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {quoteData.guest_email}
                    </p>
                  </div>
                </div>
              )}

              {quoteData.guest_phone && (
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-slate-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-slate-500">Telefone</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {quoteData.guest_phone}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Detalhes da Reserva */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Detalhes da Reserva</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500 mb-1">Acomodação</p>
                <p className="text-sm font-semibold text-slate-900">{categoryName}</p>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">Local</p>
                <p className="text-sm font-semibold text-slate-900">{locationName}</p>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">Check-in</p>
                <p className="text-sm font-semibold text-slate-900">
                  {quoteData.checkin_date
                    ? (() => {
                        // Tratar data como local, não UTC
                        const dateStr = quoteData.checkin_date;
                        if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                          const [year, month, day] = dateStr.split('-').map(Number);
                          const localDate = new Date(year, month - 1, day);
                          return format(localDate, "dd/MM/yyyy", { locale: ptBR });
                        }
                        return format(new Date(dateStr + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR });
                      })()
                    : "--"}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">Check-out</p>
                <p className="text-sm font-semibold text-slate-900">
                  {quoteData.checkout_date
                    ? (() => {
                        // Tratar data como local, não UTC
                        const dateStr = quoteData.checkout_date;
                        if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                          const [year, month, day] = dateStr.split('-').map(Number);
                          const localDate = new Date(year, month - 1, day);
                          return format(localDate, "dd/MM/yyyy", { locale: ptBR });
                        }
                        return format(new Date(dateStr + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR });
                      })()
                    : "--"}
                </p>
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1">Hóspedes</p>
                <p className="text-sm font-semibold text-slate-900">
                  {quoteData.adults} adulto(s)
                  {quoteData.children > 0 && `, ${quoteData.children} criança(s)`}
                </p>
              </div>
            </div>

            <Separator />

            {/* Valor Total */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <span className="text-lg font-semibold text-slate-900">Total</span>
              <span className="text-2xl font-bold text-emerald-600">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                }).format(quoteData.total_amount || 0)}
              </span>
            </div>
          </div>
        </Card>

        {/* Timer de Pagamento */}
        {timeRemaining !== null && hotelSettings?.quote_payment_timer_minutes && (
          <Card className={`p-6 ${isExpired || timeRemaining < 60 ? 'border-red-500 bg-red-50' : timeRemaining < 300 ? 'border-orange-500 bg-orange-50' : 'border-blue-500 bg-blue-50'}`}>
            <Alert variant={isExpired ? "destructive" : timeRemaining < 300 ? "default" : "default"}>
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-3">
                  {isExpired ? (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <Clock className={`h-5 w-5 ${timeRemaining < 300 ? 'text-orange-600' : 'text-blue-600'}`} />
                  )}
                  <div>
                    <AlertDescription className="font-semibold">
                      {isExpired 
                        ? "Tempo de pagamento expirado" 
                        : `Tempo restante para pagamento: ${formatTimeRemaining(timeRemaining)}`}
                    </AlertDescription>
                    {!isExpired && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Após esse tempo, o orçamento será cancelado automaticamente
                      </p>
                    )}
                  </div>
                </div>
                {!isExpired && (
                  <div className={`text-2xl font-bold ${timeRemaining < 300 ? 'text-orange-600' : 'text-blue-600'}`}>
                    {formatTimeRemaining(timeRemaining)}
                  </div>
                )}
              </div>
            </Alert>
          </Card>
        )}

        {/* Botão de Pagamento */}
        {isExpired ? (
          <Card className="p-6">
            <div className="text-center space-y-4">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <div>
                <p className="text-lg font-semibold text-red-600 mb-2">
                  Orçamento Expirado
                </p>
                <p className="text-sm text-slate-600 mb-4">
                  O tempo para realizar o pagamento expirou. O orçamento foi cancelado automaticamente.
                </p>
                <Button
                  onClick={() => navigate(getPublicReservationUrl())}
                  variant="outline"
                >
                  Voltar para a Página de Reservas
                </Button>
              </div>
            </div>
          </Card>
        ) : stripeConfig?.publishable_key ? (
          <Card className="p-6">
            <StripeProvider publishableKey={stripeConfig.publishable_key}>
              <PaymentDialog
                open={paymentDialogOpen}
                onOpenChange={setPaymentDialogOpen}
                amount={quoteData.total_amount || 0}
                currency="BRL"
                paymentType="quote_payment"
                quoteId={quoteData.id}
                guestEmail={quoteData.guest_email}
                description={`Pagamento do orçamento #${quoteData.quote_code}`}
                establishmentId={quoteData.establishment_id}
                locationName={locationName}
                categoryName={categoryName}
                existingPaymentIntentId={quoteData.payment_intent_id || undefined}
                onSuccess={handlePaymentSuccess}
              />
              <Button
                onClick={() => setPaymentDialogOpen(true)}
                className="w-full h-12 text-base"
                size="lg"
                disabled={isExpired || isCancelling}
              >
                <CreditCard className="mr-2 h-5 w-5" />
                {isCancelling ? "Cancelando..." : "Pagar Agora"}
              </Button>
            </StripeProvider>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="text-center space-y-4">
              <Info className="h-12 w-12 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-600">
                Pagamento não disponível no momento. Entre em contato com o estabelecimento.
              </p>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};

export default QuotePaymentPage;

