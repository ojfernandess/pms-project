import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Phone, Mail, MapPin, Info, MessageCircle, CreditCard, CheckCircle2, Clock, User } from "lucide-react";
import { StripeProvider } from "@/components/stripe/StripeProvider";
import { PaymentDialog } from "@/components/stripe/PaymentDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Badge } from "@/components/ui/badge";
import { CancellationPolicyDisplay } from "@/components/booking-engine/CancellationPolicyDisplay";
import { getReservationCancellationPolicy } from "@/utils/cancellationPolicyService";
import type { CancellationPolicy } from "@/utils/cancellationPolicyCalculator";

// Função para traduzir status do Stripe para português
const getPaymentStatusLabel = (status: string): string => {
  const statusMap: Record<string, string> = {
    succeeded: "Pago",
    pending: "Pendente",
    failed: "Falhou",
    canceled: "Cancelado",
    refunded: "Reembolsado",
    requires_payment_method: "Aguardando Pagamento",
    requires_confirmation: "Aguardando Confirmação",
    requires_action: "Ação Necessária",
    processing: "Processando",
    requires_capture: "Aguardando Captura",
  };

  return statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
};

const PaymentPage = () => {
  const { paymentIntentId } = useParams<{ paymentIntentId: string }>();
  const navigate = useNavigate();
  const [paymentData, setPaymentData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [stripeConfig, setStripeConfig] = useState<any>(null);
  const [hotelSettings, setHotelSettings] = useState<any>(null);
  const [pmsLogoUrl, setPmsLogoUrl] = useState<string | null>(null);
  const [allReservations, setAllReservations] = useState<any[]>([]);
  const { settings: siteSettings } = useSiteSettings();
  const [cancellationPolicy, setCancellationPolicy] = useState<CancellationPolicy | null>(null);
  const [policyAccepted, setPolicyAccepted] = useState(false);

  useEffect(() => {
    if (paymentIntentId) {
      loadPaymentData();
    }
  }, [paymentIntentId]);

  const checkPaymentStatus = async (paymentIntentId: string) => {
    try {
      console.log("[PaymentPage] Verificando status do pagamento:", paymentIntentId);
      
      // Verificar o status do pagamento no Stripe e atualizar se necessário
      const { data, error } = await supabase.functions.invoke("stripe-payment-status", {
        body: {
          payment_intent_id: paymentIntentId,
        },
      });

      if (error) {
        console.error("[PaymentPage] Erro ao verificar status:", error);
        // Tentar usar fetch direto como fallback
        return await checkPaymentStatusFallback(paymentIntentId);
      }

      console.log("[PaymentPage] Status verificado:", data);
      return data;
    } catch (error) {
      console.error("[PaymentPage] Erro ao verificar status (catch):", error);
      // Tentar usar fetch direto como fallback
      return await checkPaymentStatusFallback(paymentIntentId);
    }
  };

  const checkPaymentStatusFallback = async (paymentIntentId: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/stripe-payment-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_intent_id: paymentIntentId,
        }),
      });

      if (!response.ok) {
        console.error("[PaymentPage] Fallback falhou:", response.status, await response.text());
        return null;
      }

      const data = await response.json();
      console.log("[PaymentPage] Status verificado (fallback):", data);
      return data;
    } catch (error) {
      console.error("[PaymentPage] Erro no fallback:", error);
      return null;
    }
  };

  const loadPaymentData = async () => {
    try {
      // Primeiro verificar o status do pagamento no Stripe
      // Isso garante que se o pagamento foi realizado, o status seja atualizado
      let statusCheck = null;
      try {
        statusCheck = await checkPaymentStatus(paymentIntentId!);
        
        // Se o status foi atualizado para succeeded, aguardar um pouco para garantir que o banco foi atualizado
        if (statusCheck?.status === "succeeded") {
          if (statusCheck.updated) {
            console.log("[PaymentPage] Status atualizado para succeeded, aguardando atualização do banco...");
            await new Promise(resolve => setTimeout(resolve, 1000)); // Aumentar tempo de espera
          }
        }
      } catch (error) {
        // Se a verificação falhar, continuar normalmente (não é crítico)
        console.warn("[PaymentPage] Não foi possível verificar o status do pagamento no Stripe:", error);
      }

      // Buscar o pagamento (pode ter sido atualizado pela função acima)
      // Se a verificação retornou um status, usar esse status temporariamente
      const { data: payment, error: paymentError } = await supabase
        .from("stripe_payments" as any)
        .select("*, quote_id")
        .eq("stripe_payment_intent_id", paymentIntentId)
        .single();

      if (paymentError) throw paymentError;

      if (!payment) {
        toast.error("Pagamento não encontrado");
        navigate("/");
        return;
      }

      // Buscar dados da reserva com relacionamentos
      let reservationData = null;
      const paymentAny = payment as any;
      if (paymentAny.reservation_id) {
        // Buscar reserva básica (sem especificar colunas que podem não existir)
        const { data: reservation, error: reservationError } = await supabase
          .from("reservations")
          .select("*")
          .eq("id", paymentAny.reservation_id)
          .single();

        if (!reservationError && reservation) {
          // Buscar categoria se existir (pode ser room_category_id ou category_id)
          let categoryData = null;
          const categoryId = (reservation as any).room_category_id || reservation.category_id;
          
          if (categoryId) {
            const { data: category } = await supabase
              .from("room_categories")
              .select("id, name, building_id")
              .eq("id", categoryId)
              .maybeSingle();

            if (category) {
              // Buscar prédio se existir
              let buildingData = null;
              if ((category as any).building_id) {
                const { data: building } = await supabase
                  .from("buildings" as any)
                  .select("id, name")
                  .eq("id", (category as any).building_id)
                  .maybeSingle();

                if (building) {
                  buildingData = building;
                }
              }

              categoryData = {
                ...category,
                buildings: buildingData,
              };
            }
          }

          // Buscar estabelecimento
          let establishmentData = null;
          if ((reservation as any).establishment_id) {
            const { data: establishment } = await supabase
              .from("establishments" as any)
              .select("id, name, company_id")
              .eq("id", (reservation as any).establishment_id)
              .maybeSingle();

            if (establishment) {
              establishmentData = establishment;
              
              // Buscar logo do PMS da company
              if ((establishment as any).company_id) {
                const { data: company } = await supabase
                  .from("companies" as any)
                  .select("pms_logo_url")
                  .eq("id", (establishment as any).company_id)
                  .maybeSingle();
                
                if (company && (company as any).pms_logo_url && (company as any).pms_logo_url.trim() !== "") {
                  setPmsLogoUrl((company as any).pms_logo_url);
                }
              }
            }
          }

          // Buscar hóspede (guest)
          let guestData = null;
          if ((reservation as any).guest_id) {
            const { data: guest } = await supabase
              .from("clients")
              .select("id, full_name, email")
              .eq("id", (reservation as any).guest_id)
              .maybeSingle();

            if (guest) {
              guestData = guest;
            }
          }

          // Buscar responsável financeiro (client)
          let financialResponsibleData = null;
          if (reservation.client_id) {
            const { data: client } = await supabase
              .from("clients")
              .select("id, full_name, email")
              .eq("id", reservation.client_id)
              .maybeSingle();

            if (client) {
              financialResponsibleData = client;
            }
          }

          reservationData = {
            ...reservation,
            room_categories: categoryData,
            establishments: establishmentData,
            guest: guestData,
            financial_responsible: financialResponsibleData,
          };

          // Buscar configuração do Stripe do estabelecimento
          if ((reservation as any).establishment_id) {
            const { data: config } = await supabase
              .from("stripe_establishment_config" as any)
              .select("*")
              .eq("establishment_id", (reservation as any).establishment_id)
              .maybeSingle();
            
            if (config) {
              setStripeConfig(config);
            }

            // Buscar configurações do hotel
            const { data: settings } = await supabase
              .from("hotel_settings" as any)
              .select("*")
              .eq("establishment_id", (reservation as any).establishment_id)
              .maybeSingle();
            
            if (settings) {
              const settingsAny = settings as any;
              console.log("[PaymentPage] Hotel settings carregados:", {
                phone: settingsAny.phone || 
                  (settingsAny.phone_ddi && settingsAny.phone_number 
                    ? `${settingsAny.phone_ddi} ${settingsAny.phone_number}`.trim()
                    : settingsAny.phone_number || ''),
                whatsapp: settingsAny.whatsapp || 
                  (settingsAny.whatsapp_ddi && settingsAny.whatsapp_number 
                    ? `${settingsAny.whatsapp_ddi} ${settingsAny.whatsapp_number}`.trim()
                    : settingsAny.whatsapp_number || ''),
                email: settingsAny.email,
                hasPhone: !!(settingsAny.phone || settingsAny.phone_number || (settingsAny.phone_ddi && settingsAny.phone_number)),
              });
              setHotelSettings(settingsAny);
            } else {
              console.warn("[PaymentPage] Hotel settings não encontrados para establishment_id:", (reservation as any).establishment_id);
            }
          }
        } else if (reservationError) {
          console.error("Erro ao buscar reserva:", reservationError);
          // Continuar mesmo sem dados da reserva
        }
      }

      // Verificar se o pagamento está vinculado a um quote e buscar todas as reservas relacionadas
      let allReservationsData: any[] = [];
      let quote: any = null;
      
      // Tentar buscar quote pelo quote_id do pagamento
      if (paymentAny.quote_id) {
        const { data: quoteData, error: quoteError } = await supabase
          .from("quotes")
          .select("id, notes")
          .eq("id", paymentAny.quote_id)
          .maybeSingle();
        
        if (!quoteError && quoteData) {
          quote = quoteData;
        }
      }
      
      // Se não encontrou pelo quote_id, tentar buscar diretamente pelo payment_intent_id
      if (!quote) {
        const { data: quoteData, error: quoteError } = await supabase
          .from("quotes")
          .select("id, notes")
          .eq("payment_intent_id", paymentIntentId)
          .maybeSingle();
        
        if (!quoteError && quoteData) {
          quote = quoteData;
        }
      }

      // Se encontrou um quote, extrair reservation_ids e buscar todas as reservas
      if (quote?.notes) {
        // Extrair reservation_ids do campo notes
        const newFormatMatch = quote.notes.match(/<!--RESERVATION_IDS_START-->(.+?)<!--RESERVATION_IDS_END-->/s);
        if (newFormatMatch) {
          try {
            const jsonStr = newFormatMatch[1].trim();
            const parsed = JSON.parse(jsonStr);
            if (parsed.reservation_ids && Array.isArray(parsed.reservation_ids) && parsed.reservation_ids.length > 0) {
              // Buscar todas as reservas relacionadas
              const { data: reservations, error: reservationsError } = await supabase
                .from("reservations")
                .select(`
                  id,
                  reservation_code,
                  guest_name,
                  checkin_date,
                  checkout_date
                `)
                .in("id", parsed.reservation_ids);

              if (!reservationsError && reservations && reservations.length > 0) {
                // Buscar localizadores para cada reserva
                allReservationsData = await Promise.all(
                  reservations.map(async (r: any) => {
                    const { data: webCheckin } = await supabase
                      .from("web_checkin")
                      .select("locator")
                      .eq("reservation_id", r.id)
                      .maybeSingle();
                    
                    return {
                      id: r.id,
                      code: r.reservation_code,
                      guest_name: r.guest_name,
                      checkin_date: r.checkin_date,
                      checkout_date: r.checkout_date,
                      locator: webCheckin?.locator || null,
                    };
                  })
                );
              }
            }
          } catch (e) {
            console.warn("Erro ao parsear reservation_ids:", e);
          }
        }
      }

      // Se a verificação retornou um status diferente, usar esse status
      // Isso garante que mesmo se o banco ainda não foi atualizado, mostramos o status correto
      const finalStatus = statusCheck?.status || (payment as any).status;
      
      // Combinar dados
      const data = {
        ...payment,
        status: finalStatus, // Usar o status verificado se disponível
        reservation: reservationData,
      } as any;

      // Armazenar todas as reservas relacionadas
      setAllReservations(allReservationsData);

      console.log("[PaymentPage] Dados do pagamento:", {
        paymentIntentId: paymentIntentId,
        statusNoBanco: (payment as any).status,
        statusVerificado: statusCheck?.status,
        statusFinal: finalStatus,
        foiAtualizado: statusCheck?.updated,
        paymentIntentIdVerificado: statusCheck?.payment_intent_id,
      });

      // Se o status verificado é diferente do banco, logar aviso
      if (statusCheck && statusCheck.status !== (payment as any).status) {
        console.warn("[PaymentPage] ⚠️ Status no Stripe é diferente do banco:", {
          banco: (payment as any).status,
          stripe: statusCheck.status,
        });
      }

      // Se o status é requires_payment_method, informar ao usuário
      if (finalStatus === "requires_payment_method") {
        console.log("[PaymentPage] ℹ️ O pagamento ainda não foi completado. O status 'requires_payment_method' significa que o Payment Intent foi criado mas o pagamento não foi finalizado.");
        console.log("[PaymentPage] ℹ️ O usuário precisa clicar em 'Realizar Pagamento' e completar o processo de pagamento.");
      }

      setPaymentData(data);

      // Buscar política de cancelamento da primeira reserva (ou da reserva principal)
      const reservationIdToCheck = paymentAny.reservation_id || (allReservationsData.length > 0 ? allReservationsData[0].id : null);
      if (reservationIdToCheck) {
        const policy = await getReservationCancellationPolicy(reservationIdToCheck);
        setCancellationPolicy(policy);
        // Se não houver política, permitir pagamento sem aceite
        if (!policy) {
          setPolicyAccepted(true);
        }
      } else {
        // Se não houver reserva, permitir pagamento
        setPolicyAccepted(true);
      }

      // Se o pagamento já foi processado (ou foi atualizado para succeeded), redirecionar para página de sucesso
      if (finalStatus === "succeeded") {
        // Se foi atualizado agora, mostrar mensagem de sucesso
        if (statusCheck?.updated && statusCheck.status === "succeeded") {
          toast.success("Pagamento confirmado! Redirecionando...");
        }
        navigate(`/payment/success/${paymentIntentId}`);
        return;
      }

      // Não abrir o diálogo automaticamente - o usuário deve clicar em "Realizar Pagamento"
    } catch (error: any) {
      console.error("Error loading payment:", error);
      toast.error("Erro ao carregar dados do pagamento");
      navigate("/");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSuccess = () => {
    // Redirecionar para página de sucesso com o paymentIntentId
    if (paymentIntentId) {
      navigate(`/payment/success/${paymentIntentId}`);
    } else {
      navigate("/guest-dashboard");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <Card className="p-6 sm:p-8 w-full max-w-md">
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 animate-spin text-blue-600" />
            <p className="text-sm sm:text-base text-muted-foreground text-center">Carregando informações do pagamento...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (!paymentData) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <Card className="p-6 sm:p-8 w-full max-w-md">
          <div className="text-center space-y-4">
            <p className="text-sm sm:text-base text-muted-foreground">Pagamento não encontrado</p>
            <Button onClick={() => navigate("/")} className="w-full sm:w-auto">
              Voltar
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Extrair informações da reserva
  const reservation = paymentData.reservation;
  const category = reservation?.room_categories;
  const building = category?.buildings;
  const establishment = reservation?.establishments;
  const guest = reservation?.guest;
  const financialResponsible = reservation?.financial_responsible;
  
  // Determinar nome do local (prédio se existir, senão estabelecimento)
  const locationName = building?.name || establishment?.name || "";
  const categoryName = category?.name || "";
  
  // Determinar nome do cliente (hóspede ou responsável financeiro)
  const clientName = guest?.full_name || financialResponsible?.full_name || "";
  
  // Logo do sistema (priorizar logo do PMS customizado, depois site_settings)
  const systemLogo = pmsLogoUrl || siteSettings?.logo_url || null;
  
  // Status badge styling
  const getStatusBadgeVariant = (status: string) => {
    if (status === "succeeded") return "default";
    if (status === "pending" || status === "processing") return "secondary";
    if (status === "failed" || status === "canceled") return "destructive";
    return "outline";
  };

  const reservationCode = (reservation as { reservation_code?: string } | undefined)?.reservation_code;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header — alinhado ao padrão QuotePaymentPage */}
        <Card className="p-6">
          <div
            className={`flex items-center mb-6 gap-4 flex-wrap ${
              systemLogo ? "justify-between" : "justify-end"
            }`}
          >
            {systemLogo && (
              <img src={systemLogo} alt="Logo" className="h-12 object-contain" />
            )}
            <Badge variant="outline" className="text-sm">
              {reservationCode
                ? `Reserva #${reservationCode}`
                : paymentIntentId
                  ? `Ref. ${paymentIntentId.slice(0, 10)}…`
                  : "Pagamento"}
            </Badge>
          </div>

          <div className="space-y-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Pagamento</h1>
              <p className="text-sm text-slate-600">
                {paymentData.description?.trim()
                  ? paymentData.description
                  : "Revise os dados e conclua o pagamento da sua reserva"}
              </p>
            </div>

            <Separator />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clientName && (
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">
                      {guest ? "Hóspede" : "Responsável Financeiro"}
                    </p>
                    <p className="text-sm font-semibold text-slate-900">{clientName}</p>
                  </div>
                </div>
              )}

              {(guest?.email || financialResponsible?.email) && (
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-slate-500">E-mail</p>
                    <p className="text-sm font-semibold text-slate-900 break-all">
                      {guest?.email || financialResponsible?.email}
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
            {(categoryName || locationName || reservation?.checkin_date || reservation?.checkout_date) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {categoryName && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Acomodação</p>
                    <p className="text-sm font-semibold text-slate-900">{categoryName}</p>
                  </div>
                )}

                {locationName && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">{building ? "Prédio" : "Local"}</p>
                    <p className="text-sm font-semibold text-slate-900">{locationName}</p>
                  </div>
                )}

                {reservation?.checkin_date && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Check-in</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {new Date(reservation.checkin_date + "T12:00:00").toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                )}

                {reservation?.checkout_date && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Check-out</p>
                    <p className="text-sm font-semibold text-slate-900">
                      {new Date(reservation.checkout_date + "T12:00:00").toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Localizadores das Reservas (múltiplas reservas — lógica inalterada) */}
            {allReservations.length > 0 && (
              <div className="pt-2">
                <p className="text-xs sm:text-sm text-slate-600 font-medium mb-2 sm:mb-3">
                  {allReservations.length > 1 ? "Localizadores das Reservas" : "Localizador da Reserva"}
                </p>
                <div className="space-y-2">
                  {allReservations.map((res, index) => (
                    <div
                      key={res.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2 border-b border-slate-100 last:border-b-0"
                    >
                      <div className="flex-1">
                        {allReservations.length > 1 && (
                          <p className="text-xs text-slate-500 mb-1">
                            Reserva {index + 1} - {res.guest_name || "Hóspede"}
                          </p>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {res.locator ? (
                            <>
                              <span className="text-xs sm:text-sm font-mono font-semibold text-slate-900 break-all">
                                {res.locator}
                              </span>
                              {res.code && <span className="text-xs text-slate-500">({res.code})</span>}
                            </>
                          ) : (
                            <span className="text-xs sm:text-sm font-mono font-semibold text-slate-900 break-all">
                              {res.code || "Aguardando localizador"}
                            </span>
                          )}
                        </div>
                        {(res.checkin_date || res.checkout_date) && (
                          <p className="text-xs text-slate-500 mt-1">
                            {res.checkin_date &&
                              new Date(res.checkin_date + "T12:00:00").toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })}
                            {res.checkin_date && res.checkout_date && " → "}
                            {res.checkout_date &&
                              new Date(res.checkout_date + "T12:00:00").toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-slate-50 rounded-lg">
              <div className="space-y-2">
                <span className="text-lg font-semibold text-slate-900">Total</span>
                <Badge
                  variant={getStatusBadgeVariant(paymentData.status)}
                  className="text-xs sm:text-sm px-2.5 sm:px-3 py-1 w-fit"
                >
                  {paymentData.status === "succeeded" && (
                    <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
                  )}
                  {paymentData.status === "pending" && (
                    <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
                  )}
                  <span className="whitespace-nowrap">{getPaymentStatusLabel(paymentData.status)}</span>
                </Badge>
              </div>
              <span className="text-2xl font-bold text-emerald-600">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: paymentData.currency || "BRL",
                }).format((paymentData.amount || 0) / 100)}
              </span>
            </div>
          </div>
        </Card>

        <StripeProvider>
          <Card className="p-6">
            {paymentData && (
              <PaymentDialog
                open={paymentDialogOpen}
                onOpenChange={setPaymentDialogOpen}
                amount={(paymentData.amount || 0) / 100}
                currency={paymentData.currency}
                paymentType={paymentData.payment_type}
                reservationId={paymentData.reservation_id}
                guestId={paymentData.guest_id}
                description={paymentData.description}
                establishmentId={paymentData.establishment_id}
                locationName={building?.name || establishment?.name}
                categoryName={category?.name}
                existingPaymentIntentId={paymentIntentId || undefined}
                onSuccess={handlePaymentSuccess}
              />
            )}

            {/* Exibir política de cancelamento se houver */}
            {cancellationPolicy && paymentData.status !== "succeeded" && (
              <div className="mb-4">
                <CancellationPolicyDisplay
                  policy={cancellationPolicy}
                  reservationId={paymentData?.reservation?.id || allReservations[0]?.id}
                  requireAcceptance={true}
                  onAcceptanceChange={setPolicyAccepted}
                  showFullPolicyLink={true}
                />
              </div>
            )}

            {paymentData.status !== "succeeded" && (
              <Button
                onClick={() => setPaymentDialogOpen(true)}
                className="w-full h-12 text-base"
                size="lg"
                disabled={!!cancellationPolicy && !policyAccepted}
              >
                <CreditCard className="mr-2 h-5 w-5" />
                Realizar Pagamento
              </Button>
            )}

            {cancellationPolicy && !policyAccepted && paymentData.status !== "succeeded" && (
              <p className="text-xs text-amber-600 mt-2 text-center">
                ⚠️ É necessário aceitar a política de cancelamento para prosseguir com o pagamento
              </p>
            )}

            <Button
              variant="outline"
              onClick={() => navigate("/guest-dashboard")}
              className="w-full h-10 sm:h-11 border-slate-200 hover:bg-slate-50 text-sm sm:text-base mt-3"
            >
              Voltar
            </Button>
          </Card>
        </StripeProvider>

        {/* Informações adicionais configuráveis */}
        {(stripeConfig?.show_establishment_policies ||
          stripeConfig?.show_refund_policy ||
          stripeConfig?.show_legal_policies ||
          stripeConfig?.show_contact_info) && (
          <Card className="p-6">
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-xs sm:text-sm font-semibold text-slate-700 uppercase tracking-wide">
                Informações Adicionais
              </h3>

                {stripeConfig?.show_establishment_policies && hotelSettings?.policies && (
                  <Collapsible>
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 sm:p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200 gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="w-4 h-4 text-slate-600 flex-shrink-0" />
                          <span className="text-xs sm:text-sm font-medium text-slate-700 text-left break-words">Políticas do Estabelecimento</span>
                      </div>
                        <Info className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 p-3 sm:p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-xs sm:text-sm text-slate-600 whitespace-pre-line leading-relaxed break-words">
                        {(() => {
                          const policies = hotelSettings.policies;
                          
                          // Se for string, exibir diretamente
                          if (typeof policies === 'string') {
                            return policies;
                          }
                          
                          // Se for objeto, formatar de forma legível
                          if (typeof policies === 'object' && policies !== null) {
                            // Criar uma lista formatada das políticas
                            const policyEntries = Object.entries(policies)
                              .filter(([key, value]) => {
                                // Filtrar apenas valores que são strings ou números (não objetos aninhados)
                                return value !== null && 
                                       value !== undefined && 
                                       (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean');
                              })
                              .map(([key, value]) => {
                                // Formatar chave para título legível
                                const formattedKey = key
                                  .replace(/_/g, ' ')
                                  .replace(/\b\w/g, l => l.toUpperCase());
                                
                                return `${formattedKey}: ${value}`;
                              });
                            
                            return policyEntries.join('\n\n');
                          }
                          
                          return "Políticas não configuradas.";
                        })()}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {stripeConfig?.show_refund_policy && (
                  <Collapsible>
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 sm:p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200 gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="w-4 h-4 text-slate-600 flex-shrink-0" />
                          <span className="text-xs sm:text-sm font-medium text-slate-700 text-left break-words">Política de Reembolsos e Devoluções</span>
                      </div>
                        <Info className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 p-3 sm:p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-xs sm:text-sm text-slate-600 whitespace-pre-line leading-relaxed break-words">
                        {stripeConfig?.refund_policy_text 
                          ? stripeConfig.refund_policy_text
                          : "Política de reembolsos não configurada. Configure em Configurações > Integrações > Stripe."}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {stripeConfig?.show_legal_policies && (
                  <Collapsible>
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-3 sm:p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200 gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileText className="w-4 h-4 text-slate-600 flex-shrink-0" />
                          <span className="text-xs sm:text-sm font-medium text-slate-700 text-left break-words">Políticas Jurídicas</span>
                      </div>
                        <Info className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 p-3 sm:p-4 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-xs sm:text-sm text-slate-600 whitespace-pre-line leading-relaxed break-words">
                        {hotelSettings?.legal_policies 
                          ? (typeof hotelSettings.legal_policies === 'string' 
                              ? hotelSettings.legal_policies 
                              : JSON.stringify(hotelSettings.legal_policies, null, 2))
                          : hotelSettings?.policies?.legal 
                            ? (typeof hotelSettings.policies.legal === 'string'
                                ? hotelSettings.policies.legal
                                : JSON.stringify(hotelSettings.policies.legal, null, 2))
                            : "Políticas jurídicas não configuradas."}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}

                {stripeConfig?.show_contact_info && hotelSettings && (
                    <div className="p-3 sm:p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-2 mb-3 sm:mb-4">
                        <Phone className="w-4 h-4 text-slate-600 flex-shrink-0" />
                        <span className="text-xs sm:text-sm font-medium text-slate-700">Dados de Contato</span>
                    </div>
                      <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm text-slate-600">
                      {(() => {
                        // Priorizar campo único 'phone', senão montar dos campos antigos
                        const phone = hotelSettings.phone || 
                          (hotelSettings.phone_ddi && hotelSettings.phone_number 
                            ? `${hotelSettings.phone_ddi} ${hotelSettings.phone_number}`.trim()
                            : hotelSettings.phone_number || '');
                        
                        // Priorizar campo único 'whatsapp', senão montar dos campos antigos
                        const whatsapp = hotelSettings.whatsapp || 
                          (hotelSettings.whatsapp_ddi && hotelSettings.whatsapp_number 
                            ? `${hotelSettings.whatsapp_ddi} ${hotelSettings.whatsapp_number}`.trim()
                            : hotelSettings.whatsapp_number || '');
                        
                        // Se não houver nenhum contato, não mostrar a seção
                        if (!phone && !whatsapp && !hotelSettings.email) {
                          return null;
                        }
                        
                        return (
                          <>
                            {phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 flex-shrink-0" />
                                <a href={`tel:${phone.replace(/\D/g, '')}`} className="hover:text-blue-600 transition-colors break-all">
                                  {phone}
                                </a>
                              </div>
                            )}
                            {whatsapp && (
                              <div className="flex items-center gap-2">
                                <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 flex-shrink-0" />
                                <a 
                                  href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="hover:text-green-700 transition-colors text-green-600 break-all"
                                >
                                  {whatsapp}
                                </a>
                              </div>
                            )}
                            {hotelSettings.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 flex-shrink-0" />
                                <a href={`mailto:${hotelSettings.email}`} className="hover:text-blue-600 transition-colors break-all">
                                  {hotelSettings.email}
                                </a>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {(hotelSettings.street || hotelSettings.city) && (
                        <div className="flex items-start gap-2 pt-2 border-t border-slate-200">
                          <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 mt-0.5 text-slate-500 flex-shrink-0" />
                          <div className="space-y-1 break-words">
                            {hotelSettings.street && <div className="break-words">{hotelSettings.street}{hotelSettings.number ? `, ${hotelSettings.number}` : ''}</div>}
                            {hotelSettings.neighborhood && <div className="break-words">{hotelSettings.neighborhood}</div>}
                            {hotelSettings.city && (
                              <div className="break-words">
                                {hotelSettings.city}
                                {hotelSettings.state && ` - ${hotelSettings.state}`}
                                {hotelSettings.zip_code && ` - CEP: ${hotelSettings.zip_code}`}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
            </div>
          </Card>
        )}

      </div>
    </div>
  );
};

export default PaymentPage;

