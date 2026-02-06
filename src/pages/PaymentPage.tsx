import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, Phone, Mail, MapPin, Info, MessageCircle, CreditCard, CheckCircle2, Clock } from "lucide-react";
import { StripeProvider } from "@/components/stripe/StripeProvider";
import { PaymentDialog } from "@/components/stripe/PaymentDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Badge } from "@/components/ui/badge";

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
  const { settings: siteSettings } = useSiteSettings();

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
        .select("*")
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

      // Se a verificação retornou um status diferente, usar esse status
      // Isso garante que mesmo se o banco ainda não foi atualizado, mostramos o status correto
      const finalStatus = statusCheck?.status || (payment as any).status;
      
      // Combinar dados
      const data = {
        ...payment,
        status: finalStatus, // Usar o status verificado se disponível
        reservation: reservationData,
      } as any;

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

  return (
    <StripeProvider>
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
            {/* Header com gradiente sutil */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 sm:p-5 md:p-6 lg:p-8">
              <div className="flex items-center gap-2 sm:gap-3 mb-2">
                <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 flex-shrink-0" />
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold leading-tight">Pagamento</h1>
                </div>
              {paymentData.description && (
                <p className="text-blue-50 text-xs sm:text-sm md:text-base mt-2 break-words">{paymentData.description}</p>
              )}
                </div>

            <div className="p-4 sm:p-5 md:p-6 lg:p-8 space-y-4 sm:space-y-5 md:space-y-6">
              {/* Valor Principal */}
              <div className="text-center py-4 sm:py-5 md:py-6 border-b border-slate-200">
                <p className="text-xs sm:text-sm text-slate-500 mb-2 font-medium">Valor Total</p>
                <p className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 break-words px-2">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: paymentData.currency || "BRL",
                  }).format((paymentData.amount || 0) / 100)}
                </p>
                <div className="mt-3 sm:mt-4">
                  <Badge 
                    variant={getStatusBadgeVariant(paymentData.status)}
                    className="text-xs sm:text-sm px-2.5 sm:px-3 py-1"
                  >
                    {paymentData.status === "succeeded" && <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />}
                    {paymentData.status === "pending" && <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />}
                    <span className="whitespace-nowrap">{getPaymentStatusLabel(paymentData.status)}</span>
                  </Badge>
                </div>
              </div>

              {/* Informações da Reserva */}
              <div className="space-y-2 sm:space-y-3">
                {clientName && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2 sm:py-3 border-b border-slate-100">
                    <span className="text-xs sm:text-sm text-slate-600 font-medium">
                      {guest ? "Hóspede" : "Responsável Financeiro"}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900 break-words text-right sm:text-left">{clientName}</span>
                  </div>
                )}

                {locationName && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2 sm:py-3 border-b border-slate-100">
                    <span className="text-xs sm:text-sm text-slate-600 font-medium">
                      {building ? "Prédio" : "Estabelecimento"}
                </span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900 break-words text-right sm:text-left">{locationName}</span>
                  </div>
                )}

                {categoryName && (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 py-2 sm:py-3 border-b border-slate-100">
                    <span className="text-xs sm:text-sm text-slate-600 font-medium">Categoria</span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-900 break-words text-right sm:text-left">{categoryName}</span>
                  </div>
                )}
            </div>

              {/* Botões de Ação */}
              <div className="pt-3 sm:pt-4 space-y-2 sm:space-y-3">
            {paymentData.status !== "succeeded" && (
              <Button
                onClick={() => setPaymentDialogOpen(true)}
                    className="w-full h-11 sm:h-12 text-sm sm:text-base font-semibold shadow-md hover:shadow-lg transition-all"
                size="lg"
              >
                    <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0" />
                    <span className="whitespace-nowrap">Realizar Pagamento</span>
              </Button>
            )}

            <Button
              variant="outline"
              onClick={() => navigate("/guest-dashboard")}
                  className="w-full h-10 sm:h-11 border-slate-200 hover:bg-slate-50 text-sm sm:text-base"
            >
              Voltar
            </Button>
              </div>

            {/* Informações adicionais configuráveis */}
            {(stripeConfig?.show_establishment_policies || 
              stripeConfig?.show_refund_policy || 
              stripeConfig?.show_legal_policies || 
              stripeConfig?.show_contact_info) && (
                <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-200 space-y-3 sm:space-y-4">
                  <h3 className="text-xs sm:text-sm font-semibold text-slate-700 uppercase tracking-wide">Informações Adicionais</h3>

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
            )}
          </div>
        </Card>
        </div>
      </div>

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
    </StripeProvider>
  );
};

export default PaymentPage;

