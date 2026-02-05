import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Phone, Mail, MapPin, Info, CreditCard, CheckCircle2, Clock, User } from "lucide-react";
import { StripeProvider } from "@/components/stripe/StripeProvider";
import { PaymentDialog } from "@/components/stripe/PaymentDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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

  useEffect(() => {
    if (paymentIntentId) {
      loadQuoteData();
    }
  }, [paymentIntentId]);

  const loadQuoteData = async () => {
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
  };

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

        {/* Botão de Pagamento */}
        {stripeConfig?.publishable_key ? (
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
              >
                <CreditCard className="mr-2 h-5 w-5" />
                Pagar Agora
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

