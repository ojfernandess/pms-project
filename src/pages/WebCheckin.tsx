import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWebCheckin } from "@/hooks/useWebCheckin";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, AlertCircle, Search, MessageCircle, ArrowLeft, Home, Phone, Mail, Building2 } from "lucide-react";
import { GuestAuthStep } from "@/components/webcheckin/GuestAuthStep";
import { VerifyReservationStep } from "@/components/webcheckin/VerifyReservationStep";
import { PoliciesStep } from "@/components/webcheckin/PoliciesStep";
import { GuestInformationStep } from "@/components/webcheckin/GuestInformationStep";
import { DocumentUploadStep } from "@/components/webcheckin/DocumentUploadStep";
import { GuestPreferencesStep } from "@/components/webcheckin/GuestPreferencesStep";
import { ReviewAndConfirmStep } from "@/components/webcheckin/ReviewAndConfirmStep";
import { CheckinCompleteStep } from "@/components/webcheckin/CheckinCompleteStep";
import { ReuseDataDialog } from "@/components/webcheckin/ReuseDataDialog";
import { useGuestAccount } from "@/hooks/useGuestAccount";
import { supabase } from "@/integrations/supabase/client";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useTranslation } from "react-i18next";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function WebCheckin() {
  const { locator: locatorFromUrl } = useParams<{ locator?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { settings } = useSiteSettings();
  
  // Definir STEPS dentro do componente para ter acesso às traduções
  const STEPS = [
    { id: "auth", title: t("webCheckin.steps.auth"), component: GuestAuthStep },
    { id: "locator", title: t("webCheckin.steps.locator"), component: null }, // Etapa especial para inserir localizador
    { id: "verify", title: t("webCheckin.steps.verify"), component: VerifyReservationStep },
    { id: "policies", title: t("webCheckin.steps.policies"), component: PoliciesStep },
    { id: "guests", title: t("webCheckin.steps.guests"), component: GuestInformationStep },
    { id: "documents", title: t("webCheckin.steps.documents"), component: DocumentUploadStep },
    { id: "preferences", title: t("webCheckin.steps.preferences"), component: GuestPreferencesStep },
    { id: "review", title: t("webCheckin.steps.review"), component: ReviewAndConfirmStep },
    { id: "complete", title: t("webCheckin.steps.complete"), component: CheckinCompleteStep },
  ];
  const { getWebCheckinByLocator, getWebCheckinByToken, startWebCheckin, getPreviousCheckinData } = useWebCheckin();
  const { getCurrentSession, linkReservationToAccount, logout } = useGuestAccount();
  
  const [locator, setLocator] = useState<string>(locatorFromUrl || "");
  // Inicializar step baseado no estado de autenticação
  const session = getCurrentSession();
  const isAuthenticated = !!session.accountId;
  const [currentStep, setCurrentStep] = useState(() => {
    // Se já está autenticado, começar na etapa de localizador (1)
    if (isAuthenticated && session.accountId) {
      return locatorFromUrl ? 1 : 1; // Sempre etapa 1 se autenticado
    }
    return 0; // Etapa de autenticação se não autenticado
  });
  const [webCheckinData, setWebCheckinData] = useState<any>({});
  const [token, setToken] = useState<string | null>(null);
  const [guestAccountId, setGuestAccountId] = useState<string | null>(session.accountId || null);
  const [showLocatorInput, setShowLocatorInput] = useState(false);
  const [reservationLinkedToOtherUser, setReservationLinkedToOtherUser] = useState(false);
  const [showReuseDataDialog, setShowReuseDataDialog] = useState(false);
  const [hasCheckedPreviousData, setHasCheckedPreviousData] = useState(false);
  const [establishmentContactData, setEstablishmentContactData] = useState<{
    whatsapp_ddi?: string;
    whatsapp_number?: string;
    phone?: string;
    email?: string;
  } | null>(null);
  const [isSearchingLocator, setIsSearchingLocator] = useState(false);

  // SEGURANÇA: Buscar informações iniciais pelo localizador APENAS se estiver autenticado
  // Isso previne que dados da reserva sejam expostos sem autenticação
  // IMPORTANTE: Buscar automaticamente quando estiver na etapa 1 (inserir localizador) e tiver um localizador válido
  const shouldFetchLocator = isAuthenticated && !!guestAccountId && locator && locator.trim() !== "" && (currentStep === 1 || !showLocatorInput);
  const { data: webCheckinInfo, isLoading: isLoadingInfo, refetch: refetchWebCheckin } = getWebCheckinByLocator(
    locator || "",
    shouldFetchLocator // Só buscar se autenticado e tiver localizador válido
  );

  // Buscar dados completos pelo token (após iniciar) - também só se autenticado
  const { data: webCheckin, isLoading: isLoadingCheckin, refetch: refetchWebCheckinByToken } = getWebCheckinByToken(
    token || "",
    isAuthenticated && !!guestAccountId // Só buscar se autenticado
  );
  
  // Usar webCheckin se disponível, senão usar webCheckinInfo
  const currentWebCheckin = webCheckin || webCheckinInfo;

  // Buscar dados de check-ins anteriores quando estiver na etapa de guests
  const { data: previousCheckinData } = getPreviousCheckinData(
    guestAccountId,
    currentWebCheckin?.reservation?.id
  );

  // Buscar dados de contato do establishment se não estiverem presentes
  useEffect(() => {
    const fetchEstablishmentContact = async () => {
      // Se já tiver dados do establishment no currentWebCheckin, usar eles
      if (currentWebCheckin?.establishment?.whatsapp_ddi || currentWebCheckin?.establishment?.whatsapp_number || currentWebCheckin?.establishment?.phone || currentWebCheckin?.establishment?.email) {
        setEstablishmentContactData({
          whatsapp_ddi: currentWebCheckin.establishment.whatsapp_ddi,
          whatsapp_number: currentWebCheckin.establishment.whatsapp_number,
          phone: currentWebCheckin.establishment.phone,
          email: currentWebCheckin.establishment.email,
        });
        return;
      }
      
      // Se não tiver, tentar buscar diretamente
      const establishmentId = currentWebCheckin?.establishment_id || currentWebCheckin?.establishment?.id;
      if (establishmentId) {
        try {
          const { data: hotelSettings } = await supabase
            .from("hotel_settings")
            .select("whatsapp_ddi, whatsapp_number, phone, email")
            .eq("establishment_id", establishmentId)
            .maybeSingle();
          
          if (hotelSettings) {
            setEstablishmentContactData({
              whatsapp_ddi: hotelSettings.whatsapp_ddi || undefined,
              whatsapp_number: hotelSettings.whatsapp_number || undefined,
              phone: hotelSettings.phone || undefined,
              email: hotelSettings.email || undefined,
            });
          }
        } catch (error) {
          console.error("Erro ao buscar dados de contato do establishment:", error);
        }
      }
    };
    
    fetchEstablishmentContact();
  }, [currentWebCheckin?.establishment_id, currentWebCheckin?.establishment]);

  // Removido: Verificação periódica que causava múltiplas verificações desnecessárias
  // As queries do React Query já têm refetch automático configurado no hook

  // Atualizar URL quando localizador mudar (apenas uma vez)
  // Usar useRef para evitar navegação desnecessária que causa atualização de página
  const hasNavigatedRef = useRef(false);
  useEffect(() => {
    if (locator && locator !== locatorFromUrl && !showLocatorInput && !hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      navigate(`/web-checkin/${locator}`, { replace: true });
      // Resetar flag após um tempo para permitir navegação futura se necessário
      setTimeout(() => {
        hasNavigatedRef.current = false;
      }, 1000);
    }
  }, [locator, locatorFromUrl, navigate, showLocatorInput]);

  // SEGURANÇA: Verificar se a reserva está vinculada a outro usuário
  // Esta validação só acontece após autenticação
  useEffect(() => {
    const checkReservationOwnership = async () => {
      // Só verificar se estiver autenticado e tiver dados da reserva
      if (!isAuthenticated || !guestAccountId || !webCheckinInfo?.reservation?.id) {
        setReservationLinkedToOtherUser(false);
        return;
      }

      try {
        // Verificar se a reserva está vinculada a outra conta
        const { data: existingHistory } = await (supabase as any)
          .from("guest_stay_history")
          .select("guest_account_id")
          .eq("reservation_id", webCheckinInfo.reservation.id)
          .maybeSingle();

        if (existingHistory && existingHistory.guest_account_id !== guestAccountId) {
          setReservationLinkedToOtherUser(true);
        } else {
          setReservationLinkedToOtherUser(false);
        }
      } catch (error) {
        console.error("Erro ao verificar propriedade da reserva:", error);
        setReservationLinkedToOtherUser(false);
      }
    };

    checkReservationOwnership();
  }, [webCheckinInfo?.reservation?.id, guestAccountId, isAuthenticated]);

  // VERIFICAÇÃO PRIORITÁRIA: Verificar se o check-in já está concluído ANTES de processar qualquer coisa
  // Isso garante que ao recarregar a página, reservas concluídas vão direto para a etapa de conclusão
  useEffect(() => {
    // Só verificar se estiver autenticado e tiver dados do web check-in
    if (!isAuthenticated || !guestAccountId) {
      return;
    }
    
    // Verificar tanto webCheckinInfo quanto webCheckin (dados completos)
    const checkinToVerify = webCheckin || webCheckinInfo;
    
    if (!checkinToVerify) return;
    
    // Se o status é "completed", ir IMEDIATAMENTE para a última etapa
    if (checkinToVerify.status === "completed") {
      console.log("✅ Check-in já concluído, redirecionando para etapa de conclusão");
      setCurrentStep(STEPS.length - 1);
      if (checkinToVerify.token) {
        setToken(checkinToVerify.token);
      }
      setShowLocatorInput(false);
      return;
    }
  }, [webCheckinInfo?.status, webCheckin?.status, webCheckinInfo?.token, webCheckin?.token, isAuthenticated, guestAccountId]);

  // SEGURANÇA: Processar web check-in quando os dados estiverem disponíveis
  // APENAS se o usuário estiver autenticado
  // OTIMIZAÇÃO: Usar useRef para evitar processamento duplicado
  const processedWebCheckinId = useRef<string | null>(null);
  const isProcessingRef = useRef(false);
  
  useEffect(() => {
    // BLOQUEAR: Não processar nada sem autenticação
    if (!isAuthenticated || !guestAccountId) {
      return;
    }
    
    // BLOQUEAR: Não processar se o usuário está inserindo um novo localizador
    if (showLocatorInput || !locator || locator.trim() === "") {
      return;
    }
    
    if (!webCheckinInfo || !locator) return;
    
    // OTIMIZAÇÃO: Se já está processando, não processar novamente
    if (isProcessingRef.current) {
      return;
    }
    
    // OTIMIZAÇÃO: Se já processou este web check-in, não processar novamente
    if (processedWebCheckinId.current === webCheckinInfo.id) {
      return;
    }
    
    // Se já processou este web check-in com o mesmo token, não processar novamente
    if (token && token === webCheckinInfo.token && processedWebCheckinId.current === webCheckinInfo.id) {
      return;
    }

    // Marcar como processando
    isProcessingRef.current = true;
    processedWebCheckinId.current = webCheckinInfo.id;
    
    setShowLocatorInput(false);
    
    // VALIDAÇÃO DE SEGURANÇA: Bloquear se a reserva está vinculada a outro usuário
    if (reservationLinkedToOtherUser) {
      isProcessingRef.current = false;
      return;
    }
    
    // Verificar se a reserva está cancelada antes de processar
    if (webCheckinInfo.reservation?.status === "cancelled") {
      // Status cancelado será tratado no render
      isProcessingRef.current = false;
      return;
    }
    
    // Se já está completo, ir direto para a última etapa (verificação adicional)
    if (webCheckinInfo.status === "completed") {
      setCurrentStep(STEPS.length - 1);
      if (webCheckinInfo.token) {
        setToken(webCheckinInfo.token);
      }
      isProcessingRef.current = false;
      return;
    }
    
    if (webCheckinInfo.status === "expired") {
      // Status expirado será tratado no render
      isProcessingRef.current = false;
      return;
    }
    
    if (webCheckinInfo.status === "in_progress" || webCheckinInfo.status === "pending") {
      // Se já está in_progress, usar o token existente
      if (webCheckinInfo.status === "in_progress" && webCheckinInfo.token) {
        setToken(webCheckinInfo.token);
        // Avançar para etapa de verificação se ainda estiver na etapa de localizador
        if (currentStep === 1 && webCheckinInfo.reservation) {
          setTimeout(() => {
            setCurrentStep(2);
            isProcessingRef.current = false;
          }, 100);
        } else {
          isProcessingRef.current = false;
        }
        return;
      }
      
      // Iniciar o check-in apenas se estiver pending e ainda não tiver token
      if (webCheckinInfo.status === "pending" && !token && !startWebCheckin.isPending) {
        const ipAddress = "";
        const userAgent = navigator.userAgent;
        
        startWebCheckin.mutate(
          { locator: locator, ipAddress, userAgent },
          {
            onSuccess: (data) => {
              if (data?.token) {
                setToken(data.token);
              } else if (webCheckinInfo.token) {
                setToken(webCheckinInfo.token);
              }
              // Avançar para etapa de verificação após iniciar o check-in
              if (currentStep === 1 && webCheckinInfo.reservation) {
                setTimeout(() => {
                  setCurrentStep(2);
                  isProcessingRef.current = false;
                }, 100);
              } else {
                isProcessingRef.current = false;
              }
            },
            onError: (error) => {
              console.error("Erro ao iniciar web check-in:", error);
              // Mesmo com erro, tentar usar o token existente
              if (webCheckinInfo.token) {
                setToken(webCheckinInfo.token);
              }
              // Avançar mesmo com erro se tiver dados da reserva
              if (currentStep === 1 && webCheckinInfo.reservation) {
                setTimeout(() => {
                  setCurrentStep(2);
                  isProcessingRef.current = false;
                }, 100);
              } else {
                isProcessingRef.current = false;
              }
            },
          }
        );
        return;
      } else if (webCheckinInfo.status === "pending" && webCheckinInfo.token) {
        // Se já tem token mas ainda está pending, usar o token e avançar
        setToken(webCheckinInfo.token);
        if (currentStep === 1 && webCheckinInfo.reservation) {
          setTimeout(() => {
            setCurrentStep(2);
            isProcessingRef.current = false;
          }, 100);
        } else {
          isProcessingRef.current = false;
        }
        return;
      }
    }
    
    // Se chegou aqui, não processou nada, resetar flag
    isProcessingRef.current = false;
  }, [webCheckinInfo?.id, webCheckinInfo?.status, webCheckinInfo?.token, webCheckinInfo?.reservation, locator, token, startWebCheckin.isPending, isAuthenticated, guestAccountId, showLocatorInput]);

  const handleNext = (stepData: any) => {
    setWebCheckinData((prev: any) => ({ ...prev, ...stepData }));
    
    // Se é a etapa de autenticação e tem accountId
    if (currentStep === 0 && stepData.accountId) {
      setGuestAccountId(stepData.accountId);
      
      // Se tem localizador vindo do auth, usar e ir direto para verificação
      if (stepData.locator && stepData.locator.trim()) {
        setLocator(stepData.locator.trim());
        // Vincular reserva à conta
        if (linkReservationToAccount) {
          linkReservationToAccount.mutate(
            {
              accountId: stepData.accountId,
              locator: stepData.locator.trim(),
            },
            {
              onSuccess: async () => {
                await refetchWebCheckin();
                // Aguardar um pouco e ir para etapa de verificação
                setTimeout(() => {
                  setCurrentStep(2); // Ir para etapa de verificação
                }, 500);
              },
              onError: (error) => {
                console.error("Erro ao vincular reserva:", error);
                // Continuar mesmo se houver erro (pode já estar vinculada)
                refetchWebCheckin().then(() => {
                  setCurrentStep(2);
                });
              },
            }
          );
        } else {
          setCurrentStep(2); // Ir direto para verificação se não precisar vincular
        }
        return;
      }
      
      // Se não tem localizador, ir para etapa de inserir localizador
      setCurrentStep(1);
      return;
    }
    
    // Para outras etapas, avançar normalmente (pulando a etapa de localizador que é especial)
    if (currentStep === 1) {
      // Se está na etapa de localizador, não deve avançar por aqui (é feito pelo useEffect)
      return;
    }
    
    // Se está saindo da etapa de políticas e vai para guests, verificar se há dados anteriores
    if (currentStep === 3 && STEPS[currentStep].id === "policies") {
      // Verificar se há dados anteriores e ainda não mostrou o diálogo
      if (previousCheckinData && !hasCheckedPreviousData) {
        setShowReuseDataDialog(true);
        setHasCheckedPreviousData(true);
        return; // Não avançar ainda, aguardar escolha do usuário
      }
    }
    
    // Avançar para próxima etapa válida (pulando localizador se necessário)
    let nextStep = currentStep + 1;
    if (nextStep < STEPS.length) {
      // Se a próxima etapa é localizador, pular para a próxima
      if (STEPS[nextStep].id === "locator") {
        nextStep = nextStep + 1;
      }
      // Se a próxima etapa é policies e já aceitou, pular (mas isso não deve acontecer, pois o componente bloqueia)
      if (nextStep < STEPS.length) {
        setCurrentStep(nextStep);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Handler para reutilizar dados anteriores
  const handleReuseData = (reusedData: any) => {
    setWebCheckinData((prev: any) => ({ ...prev, ...reusedData }));
    // Avançar para etapa de guests com os dados já preenchidos
    setCurrentStep(4); // guests
  };

  // Handler para pular reutilização
  const handleSkipReuse = () => {
    // Avançar normalmente para etapa de guests
    setCurrentStep(4); // guests
  };

  const handleLocatorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locator.trim() || isSearchingLocator || isLoadingInfo) {
      return;
    }
    
    setIsSearchingLocator(true);
    
    // Limpar estado anterior antes de buscar nova reserva
    const oldLocator = locator.trim(); // Guardar localizador antigo
    setToken(null);
    setWebCheckinData({});
    setReservationLinkedToOtherUser(false);
    setShowLocatorInput(false); // Fechar input de localizador
    processedWebCheckinId.current = null; // Resetar flag de processamento
    isProcessingRef.current = false; // Resetar flag de processamento
    hasNavigatedRef.current = false; // Resetar flag de navegação
    
    // Invalidar e remover TODAS as queries antigas para forçar nova busca
    queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
    if (oldLocator && oldLocator !== locator.trim()) {
      queryClient.removeQueries({ queryKey: ["web_checkin", oldLocator] });
    }
    
    // Atualizar URL com novo localizador (sem causar atualização de página)
    hasNavigatedRef.current = true;
    navigate(`/web-checkin/${locator.trim()}`, { replace: true });
    
    // Vincular reserva à conta do hóspede
    if (guestAccountId) {
      try {
        await linkReservationToAccount.mutateAsync({
          accountId: guestAccountId,
          locator: locator.trim(),
        });
        // Resetar flag de reserva vinculada a outro usuário após vinculação bem-sucedida
        setReservationLinkedToOtherUser(false);
      } catch (error: any) {
        console.error("Erro ao vincular reserva:", error);
        // Se o erro for sobre reserva já vinculada, não continuar
        if (error?.message?.includes("já está vinculada a outra conta")) {
          setReservationLinkedToOtherUser(true);
          setIsSearchingLocator(false);
          return;
        }
        // Continuar mesmo se houver outro tipo de erro na vinculação
      }
    }
    
    // Refazer a busca uma única vez após limpar o cache
    try {
      await refetchWebCheckin();
    } catch (error) {
      console.error("Erro ao buscar reserva:", error);
    } finally {
      setIsSearchingLocator(false);
    }
  };
  
  // Sincronizar estado de busca com isLoadingInfo apenas quando necessário
  useEffect(() => {
    if (currentStep === 1) {
      if (isLoadingInfo) {
        setIsSearchingLocator(true);
      } else {
        // Desativar apenas se não houver busca manual em andamento
        // O estado será controlado pelo handleLocatorSubmit
        if (!isSearchingLocator) {
          // Não fazer nada, deixar o handleLocatorSubmit controlar
        }
      }
    }
  }, [isLoadingInfo, currentStep]);

  // Removido: Busca automática ao digitar que causava múltiplas verificações
  // A busca agora só acontece quando o usuário submete o formulário (handleLocatorSubmit)

  // REMOVIDO: Este useEffect estava causando atualizações em loop
  // A lógica de avanço automático já está no useEffect anterior que processa o web check-in
  
  // SEGURANÇA: Se tem localizador na URL mas não está autenticado, forçar autenticação
  // IMPORTANTE: Verificar se o check-in já está concluído ANTES de definir o step
  // Usar useRef para evitar atualizações desnecessárias
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    // Só inicializar uma vez para evitar loops
    if (hasInitializedRef.current) {
      return;
    }
    
    if (locatorFromUrl && !isAuthenticated) {
      // Se tem localizador na URL mas não está autenticado, garantir que está na etapa de autenticação
      setCurrentStep(0); // Forçar etapa de autenticação
      setLocator(locatorFromUrl); // Guardar o localizador para usar após autenticação
      hasInitializedRef.current = true;
    } else if (isAuthenticated && session.accountId && locatorFromUrl) {
      // Se está autenticado e tem localizador na URL, configurar
      setGuestAccountId(session.accountId);
      setLocator(locatorFromUrl);
      
      // VERIFICAÇÃO CRÍTICA: Se o check-in já está concluído, ir direto para a última etapa
      // Não definir step aqui se já está concluído, deixar o useEffect anterior fazer isso
      const checkinToCheck = webCheckin || webCheckinInfo;
      if (checkinToCheck?.status === "completed") {
        // Não definir step aqui, o useEffect anterior já vai fazer isso
        hasInitializedRef.current = true;
        return;
      }
      
      setCurrentStep(1); // Ir direto para inserir localizador (só se não estiver concluído)
      hasInitializedRef.current = true;
    } else if (isAuthenticated && session.accountId && !locatorFromUrl) {
      // Se está autenticado mas não tem localizador, ir para etapa de inserir localizador
      setGuestAccountId(session.accountId);
      setCurrentStep(1); // Etapa de inserir localizador
      hasInitializedRef.current = true;
    }
  }, [isAuthenticated, session.accountId, locatorFromUrl]);

  const CurrentStepComponent = STEPS[currentStep].component;

  // VALIDAÇÃO DE SEGURANÇA: Mostrar erro se a reserva está vinculada a outro usuário
  if (reservationLinkedToOtherUser && webCheckinInfo?.reservation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-8 px-4">
        <Card className="p-8 max-w-md w-full">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("webCheckin.common.accessDenied")}</h2>
            <p className="text-slate-600 mb-6">
              {t("webCheckin.common.reservationLinkedToOtherUser")}
            </p>
            <div className="space-y-3">
              {isAuthenticated && session.accountId && (
                <Button 
                  onClick={() => navigate("/guest-dashboard")}
                  className="w-full"
                >
                  <Home className="h-4 w-4 mr-2" />
                  {t("webCheckin.common.backToPanel")}
                </Button>
              )}
              <Button 
                variant="outline"
                onClick={() => {
                  // Limpar completamente o estado para permitir verificar outra reserva
                  setLocator("");
                  setToken(null);
                  setReservationLinkedToOtherUser(false);
                  setShowLocatorInput(true);
                  setWebCheckinData({});
                  setCurrentStep(1); // Voltar para etapa de inserir localizador
                  
                  // Invalidar queries do React Query para forçar nova busca
                  queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
                  queryClient.removeQueries({ queryKey: ["web_checkin"] });
                  
                  // Limpar URL
                  navigate("/web-checkin", { replace: true });
                }}
                className="w-full"
              >
                {t("webCheckin.common.tryAnotherLocator")}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // SEGURANÇA: Etapa 0: Autenticação (obrigatória se não estiver autenticado)
  // Se tem localizador na URL mas não está autenticado, mostrar tela de autenticação
  if (!isAuthenticated || !guestAccountId) {
    return (
      <GuestAuthStep
        onNext={handleNext}
        onBack={handleBack}
        isFirstStep={true}
        isLastStep={false}
        initialLocator={locatorFromUrl || locator} // Passar localizador da URL para o componente de autenticação
      />
    );
  }

  // Etapa 1: Inserir localizador (após autenticação)
  if (currentStep === 1) {
    return (
      <div className="min-h-screen flex">
        {/* Lado Esquerdo - Imagem Grande */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
          {/* Imagem de fundo com tema hotel/resort */}
          <div 
            className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600"
            style={{
              backgroundImage: `url("https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          {/* Overlay escuro para melhor contraste */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70" />
          
          {/* Conteúdo sobre a imagem */}
          <div className="relative z-10 flex flex-col justify-center items-center h-full p-12 text-white">
            <div className="w-full max-w-2xl mx-auto text-center space-y-8">
              <div className="space-y-4">
                <h2 className="text-5xl md:text-6xl font-light tracking-tight text-white drop-shadow-2xl mx-auto">
                  Check-in Rápido
                </h2>
                <div className="w-24 h-px bg-white/50 mx-auto"></div>
                <p className="text-lg md:text-xl text-white/95 font-light leading-relaxed max-w-lg mx-auto drop-shadow-lg">
                  Complete seu check-in em minutos, sem filas e de onde estiver
                </p>
              </div>
              
              <div className="pt-8 border-t border-white/30">
                <div className="flex flex-wrap justify-center items-center gap-6 mb-4">
                  <div className="text-center flex-shrink-0">
                    <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Digital</p>
                    <p className="text-xs text-white/90 drop-shadow-sm">100% Online</p>
                  </div>
                  <div className="w-px h-8 bg-white/30 flex-shrink-0"></div>
                  <div className="text-center flex-shrink-0">
                    <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Rápido</p>
                    <p className="text-xs text-white/90 drop-shadow-sm">Em Minutos</p>
                  </div>
                  <div className="w-px h-8 bg-white/30 flex-shrink-0"></div>
                  <div className="text-center flex-shrink-0">
                    <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Seguro</p>
                    <p className="text-xs text-white/90 drop-shadow-sm">Dados Protegidos</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center items-center gap-6">
                  <div className="text-center flex-shrink-0">
                    <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Recibo & NF</p>
                    <p className="text-xs text-white/90 drop-shadow-sm">Geração Rápida</p>
                  </div>
                  <div className="w-px h-8 bg-white/30 flex-shrink-0"></div>
                  <div className="text-center flex-shrink-0">
                    <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Extensão</p>
                    <p className="text-xs text-white/90 drop-shadow-sm">Solicite Online</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lado Direito - Painel Branco */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white relative">
          {/* Seletor de Idioma */}
          <div className="absolute top-6 right-6">
            <LanguageSelector />
          </div>

          <div className="w-full max-w-md space-y-8">
            {/* Logo */}
            {(settings?.logo_url || settings?.site_title) && (
              <div className="flex justify-center mb-6">
                {settings?.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt="Logo"
                    className="w-[200px] h-auto object-contain"
                  />
                ) : settings?.site_title ? (
                  <div className="flex items-center gap-3">
                    <div className="h-24 w-24 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                      <Building2 className="h-12 w-12 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold text-gray-900">
                      {settings.site_title}
                    </h1>
                  </div>
                ) : null}
              </div>
            )}
            
            {/* Título */}
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-gray-900">
                Check-in Online
              </h1>
              <p className="text-gray-600 text-lg">
                {t("webCheckin.common.enterLocator")}
              </p>
            </div>

            {/* Botão de voltar ao painel */}
            {isAuthenticated && session.accountId && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/guest-dashboard")}
                  className="text-slate-600 hover:text-slate-900 -ml-2"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("webCheckin.common.backToPanel")}
                </Button>
              </div>
            )}

            <form onSubmit={handleLocatorSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="locator" className="text-sm font-semibold text-gray-700">
                  Localizador da Reserva
                </Label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="locator"
                    type="text"
                    value={locator}
                    onChange={(e) => setLocator(e.target.value.toUpperCase())}
                    placeholder="Ex: RSV742516"
                    className={`pl-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-center text-lg font-mono tracking-wider uppercase ${
                      isSearchingLocator || isLoadingInfo
                        ? "border-blue-500 ring-2 ring-blue-200 animate-pulse"
                        : ""
                    }`}
                    autoFocus
                    required
                    disabled={isSearchingLocator || isLoadingInfo || linkReservationToAccount.isPending}
                  />
                  {(isSearchingLocator || isLoadingInfo) && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="absolute inset-0 bg-blue-50/50 rounded-xl animate-pulse" />
                      <Loader2 className="h-5 w-5 text-blue-600 animate-spin relative z-10" />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  O localizador foi enviado por email quando você fez a reserva
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed" 
                disabled={isSearchingLocator || isLoadingInfo || linkReservationToAccount.isPending || !locator.trim()}
              >
                {(isSearchingLocator || isLoadingInfo || linkReservationToAccount.isPending) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("webCheckin.common.searching")}
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    {t("webCheckin.common.searchReservation")}
                  </>
                )}
              </Button>
            </form>

            {(isSearchingLocator || isLoadingInfo) && (
              <div className="flex flex-col items-center justify-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-center gap-2 text-blue-700">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm font-medium">{t("webCheckin.common.loading")}</span>
                </div>
                <p className="text-xs text-blue-600 text-center">
                  {t("webCheckin.common.searchingReservationMessage", "Buscando sua reserva... Por favor, aguarde.")}
                </p>
              </div>
            )}

            {!isLoadingInfo && webCheckinInfo === null && locator && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900 mb-1">Localizador não encontrado</h3>
                    <p className="text-sm text-red-700">
                      O localizador "{locator}" não foi encontrado. Verifique se o código está correto ou entre em contato com o hotel.
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              {isAuthenticated && session.accountId && (
                <Button 
                  variant="outline" 
                  className="w-full h-12 rounded-xl"
                  onClick={() => navigate("/guest-dashboard")}
                >
                  <Home className="h-4 w-4 mr-2" />
                  {t("webCheckin.common.backToPanel")}
                </Button>
              )}
              <div className="text-center">
                <Button 
                  variant="outline" 
                  className="h-12 rounded-xl"
                  onClick={() => {
                    // Logout e voltar para autenticação
                    logout();
                    setCurrentStep(0);
                    setGuestAccountId(null);
                    setLocator("");
                  }}
                >
                  {t("webCheckin.common.useAnotherAccount")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Tela inicial para inserir localizador (fallback - não deve aparecer normalmente)
  if (showLocatorInput || !locator) {
    return (
      <div className="min-h-screen flex">
        {/* Lado Esquerdo - Imagem Grande */}
        <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
          {/* Imagem de fundo com tema hotel/resort */}
          <div 
            className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600"
            style={{
              backgroundImage: `url("https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          {/* Overlay escuro para melhor contraste */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70" />
          
          {/* Conteúdo sobre a imagem */}
          <div className="relative z-10 flex flex-col justify-center items-center h-full p-12 text-white">
            <div className="w-full max-w-2xl mx-auto text-center space-y-8">
              <div className="space-y-4">
                <h2 className="text-5xl md:text-6xl font-light tracking-tight text-white drop-shadow-2xl mx-auto">
                  Check-in Rápido
                </h2>
                <div className="w-24 h-px bg-white/50 mx-auto"></div>
                <p className="text-lg md:text-xl text-white/95 font-light leading-relaxed max-w-lg mx-auto drop-shadow-lg">
                  Complete seu check-in em minutos, sem filas e de onde estiver
                </p>
              </div>
              
              <div className="pt-8 border-t border-white/30">
                <div className="flex flex-wrap justify-center items-center gap-6 mb-4">
                  <div className="text-center flex-shrink-0">
                    <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Digital</p>
                    <p className="text-xs text-white/90 drop-shadow-sm">100% Online</p>
                  </div>
                  <div className="w-px h-8 bg-white/30 flex-shrink-0"></div>
                  <div className="text-center flex-shrink-0">
                    <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Rápido</p>
                    <p className="text-xs text-white/90 drop-shadow-sm">Em Minutos</p>
                  </div>
                  <div className="w-px h-8 bg-white/30 flex-shrink-0"></div>
                  <div className="text-center flex-shrink-0">
                    <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Seguro</p>
                    <p className="text-xs text-white/90 drop-shadow-sm">Dados Protegidos</p>
                  </div>
                </div>
                <div className="flex flex-wrap justify-center items-center gap-6">
                  <div className="text-center flex-shrink-0">
                    <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Recibo & NF</p>
                    <p className="text-xs text-white/90 drop-shadow-sm">Geração Rápida</p>
                  </div>
                  <div className="w-px h-8 bg-white/30 flex-shrink-0"></div>
                  <div className="text-center flex-shrink-0">
                    <p className="text-sm text-white font-light uppercase tracking-wider mb-1 drop-shadow-md">Extensão</p>
                    <p className="text-xs text-white/90 drop-shadow-sm">Solicite Online</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Lado Direito - Painel Branco */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white relative">
          {/* Seletor de Idioma */}
          <div className="absolute top-6 right-6">
            <LanguageSelector />
          </div>

          <div className="w-full max-w-md space-y-8">
            {/* Logo */}
            {(settings?.logo_url || settings?.site_title) && (
              <div className="flex justify-center mb-6">
                {settings?.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt="Logo"
                    className="w-[200px] h-auto object-contain"
                  />
                ) : settings?.site_title ? (
                  <div className="flex items-center gap-3">
                    <div className="h-24 w-24 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
                      <Building2 className="h-12 w-12 text-white" />
                    </div>
                    <h1 className="text-4xl font-bold text-gray-900">
                      {settings.site_title}
                    </h1>
                  </div>
                ) : null}
              </div>
            )}
            
            {/* Título */}
            <div className="space-y-2">
              <h1 className="text-4xl font-bold text-gray-900">
                {t("webCheckin.title")}
              </h1>
              <p className="text-gray-600 text-lg">
                {t("webCheckin.auth.enterLocator")}
              </p>
            </div>

            {/* Botão de voltar ao painel */}
            {isAuthenticated && session.accountId && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate("/guest-dashboard")}
                  className="text-slate-600 hover:text-slate-900 -ml-2"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("webCheckin.common.backToPanel")}
                </Button>
              </div>
            )}

            <form onSubmit={handleLocatorSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="locator" className="text-sm font-semibold text-gray-700">
                  Localizador da Reserva
                </Label>
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    id="locator"
                    type="text"
                    value={locator}
                    onChange={(e) => setLocator(e.target.value.toUpperCase())}
                    placeholder="Ex: RSV742516"
                    className="pl-12 h-14 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-center text-lg font-mono tracking-wider uppercase"
                    autoFocus
                    required
                  />
                </div>
                <p className="text-xs text-gray-500">
                  O localizador foi enviado por email quando você fez a reserva
                </p>
              </div>

              <Button 
                type="submit" 
                className="w-full h-14 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200"
              >
                <Search className="h-4 w-4 mr-2" />
                Buscar Reserva
              </Button>
            </form>

            {isLoadingInfo && (
              <div className="flex items-center justify-center gap-2 text-gray-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Buscando reserva...</span>
              </div>
            )}

            {!isLoadingInfo && webCheckinInfo === null && locator && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-red-900 mb-1">Localizador não encontrado</h3>
                    <p className="text-sm text-red-700">
                      O localizador "{locator}" não foi encontrado. Verifique se o código está correto ou entre em contato com o hotel.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {reservationLinkedToOtherUser && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-orange-900 mb-1">Reserva já vinculada</h3>
                    <p className="text-sm text-orange-700">
                      Esta reserva já está vinculada a outra conta. Por questões de segurança, 
                      não é possível realizar o check-in.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Botão de voltar ao painel na tela fallback */}
            {isAuthenticated && session.accountId && (
              <div>
                <Button 
                  variant="outline" 
                  className="w-full h-12 rounded-xl"
                  onClick={() => navigate("/guest-dashboard")}
                >
                  <Home className="h-4 w-4 mr-2" />
                  {t("webCheckin.common.backToPanel")}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // SEGURANÇA: Bloquear exibição de dados da reserva sem autenticação
  // Se não estiver autenticado, não mostrar informações da reserva
  if (!isAuthenticated || !guestAccountId) {
    // Se tem localizador na URL mas não está autenticado, mostrar apenas tela de autenticação
    if (locatorFromUrl) {
      return (
        <GuestAuthStep
          onNext={handleNext}
          onBack={handleBack}
          isFirstStep={true}
          isLastStep={false}
        />
      );
    }
    // Se não tem localizador, mostrar tela de autenticação normalmente
    return (
      <GuestAuthStep
        onNext={handleNext}
        onBack={handleBack}
        isFirstStep={true}
        isLastStep={false}
      />
    );
  }

  // A partir daqui, só executa se estiver autenticado
  if (isLoadingInfo || startWebCheckin.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-slate-600">Carregando informações da reserva...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (!webCheckinInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="p-8 max-w-md">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <h2 className="text-xl font-semibold text-slate-900">Localizador não encontrado</h2>
            <p className="text-slate-600">
              O localizador informado não foi encontrado. Verifique se o código está correto.
            </p>
            <Button 
              onClick={() => {
                // Limpar completamente o estado para permitir verificar outra reserva
                setLocator("");
                setToken(null);
                setReservationLinkedToOtherUser(false);
                setShowLocatorInput(true);
                setWebCheckinData({});
                setCurrentStep(1); // Voltar para etapa de inserir localizador
                
                // Invalidar queries do React Query para forçar nova busca
                queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
                queryClient.removeQueries({ queryKey: ["web_checkin"] });
                
                // Limpar URL
                navigate("/web-checkin", { replace: true });
              }} 
              variant="outline" 
              className="mt-4"
            >
              {t("webCheckin.common.tryAnotherLocator")}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (webCheckinInfo.status === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="p-8 max-w-md">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-orange-500" />
            <h2 className="text-xl font-semibold text-slate-900">Link Expirado</h2>
            <p className="text-slate-600">
              O link de check-in expirou. Entre em contato com o hotel para mais informações.
            </p>
            <Button onClick={() => setShowLocatorInput(true)} variant="outline" className="mt-4">
              Tentar outro localizador
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Verificar se a reserva está cancelada
  const reservationStatus = currentWebCheckin?.reservation?.status;
  if (reservationStatus === "cancelled") {
    // Usar dados do establishment do currentWebCheckin ou do estado separado
    const establishmentData = currentWebCheckin?.establishment || establishmentContactData;
    
    const whatsappDdi = establishmentData?.whatsapp_ddi || "";
    const whatsappNumber = establishmentData?.whatsapp_number || "";
    // Obter localizador da reserva
    const reservationCode = currentWebCheckin?.reservation?.reservation_code || locator || "";
    const identificationNumber = currentWebCheckin?.reservation?.identification_number;
    
    // Construir mensagem padrão com localizador
    let whatsappMessage = `Olá! Gostaria de mais informações sobre minha reserva`;
    if (reservationCode) {
      whatsappMessage += ` ${reservationCode}`;
    }
    if (identificationNumber) {
      whatsappMessage += ` (#${identificationNumber})`;
    }
    whatsappMessage += `.`;
    
    // Construir URL do WhatsApp: se tiver DDI e número, usar ambos; se tiver apenas número, usar só o número
    let whatsappUrl = null;
    let whatsappDisplay = "";
    if (whatsappDdi && whatsappNumber) {
      const whatsappFull = `${whatsappDdi}${whatsappNumber}`;
      const whatsappNumberClean = whatsappFull.replace(/\D/g, "");
      whatsappUrl = `https://wa.me/${whatsappNumberClean}?text=${encodeURIComponent(whatsappMessage)}`;
      whatsappDisplay = `${whatsappDdi} ${whatsappNumber}`;
    } else if (whatsappNumber) {
      // Se tiver apenas o número, usar só o número
      const whatsappNumberClean = whatsappNumber.replace(/\D/g, "");
      whatsappUrl = `https://wa.me/${whatsappNumberClean}?text=${encodeURIComponent(whatsappMessage)}`;
      whatsappDisplay = whatsappNumber;
    } else if (whatsappDdi) {
      // Se tiver apenas o DDI, não criar URL (precisa do número)
      whatsappDisplay = whatsappDdi;
    }
    const phone = establishmentData?.phone || currentWebCheckin?.establishment?.phone || null;
    const email = establishmentData?.email || currentWebCheckin?.establishment?.email || null;
    const hasAnyContact = whatsappUrl || phone || email;

    // Debug: verificar dados do establishment
    console.log("🔍 Dados do establishment para reserva cancelada:", {
      establishment: establishmentData,
      currentWebCheckin: currentWebCheckin,
      whatsappDdi,
      whatsappNumber,
      whatsappUrl,
      phone,
      email,
      hasAnyContact,
    });

    return (
      <div className="min-h-screen flex items-center justify-center bg-white py-8 px-4">
        <div className="max-w-md w-full">
          <div className="flex flex-col items-center gap-4 text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-50 mb-2">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Reserva Cancelada</h2>
            <p className="text-sm text-slate-600 px-4">
              Esta reserva foi cancelada. Para mais informações ou para reativar sua reserva, entre em contato com nosso atendimento através dos canais abaixo.
            </p>
          </div>
          
          {hasAnyContact && (
            <Card className="p-4 mb-4 shadow-sm">
              <div className="space-y-3">
                {/* WhatsApp */}
                {whatsappUrl && (
                  <div className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <MessageCircle className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-xs font-medium text-slate-700 mb-0.5">WhatsApp</p>
                      <p className="text-sm text-slate-900 font-medium">
                        {whatsappDisplay || "Entrar em contato"}
                      </p>
                    </div>
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-500 hover:text-green-600 font-medium flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Abrir
                    </a>
                  </div>
                )}

                {/* Telefone */}
                {phone && (
                  <div className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Phone className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-xs font-medium text-slate-700 mb-0.5">Telefone</p>
                      <p className="text-sm text-slate-900 font-medium">{phone}</p>
                    </div>
                    <a
                      href={`tel:${phone.replace(/\D/g, "")}`}
                      className="text-xs text-slate-500 hover:text-blue-600 font-medium flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Ligar
                    </a>
                  </div>
                )}

                {/* Email */}
                {email && (
                  <div className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-lg transition-colors">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Mail className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-xs font-medium text-slate-700 mb-0.5">E-mail</p>
                      <p className="text-sm text-slate-900 font-medium break-all">{email}</p>
                    </div>
                    <a
                      href={`mailto:${email}`}
                      className="text-xs text-slate-500 hover:text-purple-600 font-medium flex-shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Enviar
                    </a>
                  </div>
                )}
              </div>
            </Card>
          )}

          {!hasAnyContact && (
            <Card className="p-4 mb-4 shadow-sm">
              <p className="text-sm text-slate-600 text-center">
                Entre em contato com o estabelecimento através dos canais de atendimento disponíveis.
              </p>
            </Card>
          )}

          <Button 
            onClick={() => {
              // Limpar completamente o estado para permitir verificar outra reserva
              const oldLocator = locator; // Guardar localizador antigo para remover da query
              setLocator("");
              setToken(null);
              setReservationLinkedToOtherUser(false);
              setShowLocatorInput(true);
              setWebCheckinData({});
              setCurrentStep(1); // Voltar para etapa de inserir localizador
              
              // Invalidar e remover queries do React Query para forçar nova busca
              queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
              if (oldLocator) {
                queryClient.removeQueries({ queryKey: ["web_checkin", oldLocator] });
              }
              queryClient.removeQueries({ queryKey: ["web_checkin"] });
              
              // Limpar URL
              navigate("/web-checkin", { replace: true });
            }} 
            variant="outline" 
            className="w-full border-slate-200 hover:bg-slate-50"
          >
            <Search className="h-4 w-4 mr-2" />
            Verificar outra reserva
          </Button>

          {whatsappUrl && (
            <p className="text-xs text-slate-400 text-center mt-4 px-4">
              Se preferir, responda a esta mensagem no WhatsApp para reativar sua reserva.
            </p>
          )}
        </div>
      </div>
    );
  }

  // VERIFICAÇÃO CRÍTICA: Se o check-in está concluído, garantir que está na última etapa
  // Isso previne que ao recarregar a página, o step volte para uma etapa anterior
  const checkinToCheck = webCheckin || webCheckinInfo;
  if (checkinToCheck?.status === "completed" && currentStep !== STEPS.length - 1) {
    // Se detectou que está concluído mas não está na última etapa, corrigir imediatamente
    setCurrentStep(STEPS.length - 1);
    if (checkinToCheck.token && !token) {
      setToken(checkinToCheck.token);
    }
  }

  // SEGURANÇA: Só mostrar conteúdo do check-in se estiver autenticado e tiver token
  // EXCEÇÃO: Se está concluído, pode mostrar mesmo sem token (o token será definido acima)
  if (!token && checkinToCheck?.status !== "completed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="p-8">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-slate-600">Iniciando check-in...</p>
          </div>
        </Card>
      </div>
    );
  }

  // SEGURANÇA: Verificação final - garantir que está autenticado antes de renderizar
  if (!isAuthenticated || !guestAccountId) {
    return (
      <GuestAuthStep
        onNext={handleNext}
        onBack={handleBack}
        isFirstStep={true}
        isLastStep={false}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-8 px-4">
      <div className="max-w-4xl mx-auto relative">
        {/* Seletor de Idioma */}
        <div className="absolute top-0 right-0">
          <LanguageSelector />
        </div>
        
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{t("webCheckin.title")}</h1>
          <p className="text-slate-600">{t("webCheckin.subtitle")}</p>
        </div>

        {/* Progress Stepper - Moderno e Minimalista */}
        <div className="mb-8 overflow-hidden">
          <div className="relative py-4">
            {/* Container responsivo: scroll horizontal no mobile, flex normal no desktop */}
            <div className="relative overflow-x-auto md:overflow-visible pb-2 md:pb-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="flex items-center justify-center md:justify-between relative min-w-max md:min-w-0 gap-3 md:gap-2 px-2 md:px-0">
                {/* Linha de progresso de fundo - alinhada ao centro exato dos círculos */}
                {/* Mobile: círculo 40px (w-10), centro em 20px | Desktop: círculo 48px (w-12), centro em 24px */}
                <div className="absolute left-0 right-0 h-[2px] bg-slate-100 hidden md:block" style={{ top: '24px' }} />
                <div className="absolute left-0 right-0 h-[2px] bg-slate-100 md:hidden" style={{ top: '20px' }} />
                
                {/* Linha de progresso preenchida */}
                {(() => {
                  const stepIndexMap: Record<string, number> = {
                    auth: 0,
                    verify: 2,
                    policies: 3,
                    guests: 4,
                    documents: 5,
                    preferences: 6,
                    review: 7,
                    complete: 8,
                  };
                  const totalSteps = STEPS.filter(s => s.component !== null && s.id !== "locator").length;
                  const completedSteps = STEPS.filter(step => {
                    const actualIndex = stepIndexMap[step.id] ?? -1;
                    return actualIndex >= 0 && currentStep > actualIndex;
                  }).length;
                  const progressPercent = totalSteps > 1 ? (completedSteps / (totalSteps - 1)) * 100 : 0;
                  
                  return (
                    <>
                      <div 
                        className="absolute left-0 h-[2px] bg-emerald-500 transition-all duration-500 ease-out hidden md:block"
                        style={{ width: `${progressPercent}%`, top: '24px' }}
                      />
                      <div 
                        className="absolute left-0 h-[2px] bg-emerald-500 transition-all duration-500 ease-out md:hidden"
                        style={{ width: `${progressPercent}%`, top: '20px' }}
                      />
                    </>
                  );
                })()}
                
                {STEPS.filter(step => step.component !== null && step.id !== "locator").map((step, index, array) => {
                  // Mapear índices reais: auth=0, verify=2 (após locator=1), policies=3, guests=4, etc.
                  const stepIndexMap: Record<string, number> = {
                    auth: 0,
                    verify: 2,
                    policies: 3,
                    guests: 4,
                    documents: 5,
                    preferences: 6,
                    review: 7,
                    complete: 8,
                  };
                  const actualIndex = stepIndexMap[step.id] ?? index;
                  const isActive = currentStep === actualIndex || (currentStep === 1 && step.id === "verify");
                  const isCompleted = currentStep > actualIndex;
                  const isLast = index === array.length - 1;
                  // Se é a etapa "complete" e está ativa, considerar como concluída
                  const isCompleteStep = step.id === "complete";
                  const showAsCompleted = isCompleted || (isCompleteStep && isActive);
                  const showAsActive = isActive && !isCompleteStep;

                  return (
                    <div key={step.id} className="flex flex-col items-center relative z-10 flex-shrink-0">
                      {/* Linha conectora entre etapas - apenas no mobile, alinhada ao centro exato (20px) */}
                      {!isLast && (
                        <div className="absolute h-[2px] md:hidden z-0" style={{ top: '20px', left: 'calc(50% + 20px)', right: 'calc(-50% + 20px)' }}>
                          <div
                            className={`h-full transition-all duration-500 ${
                              showAsCompleted ? "bg-emerald-500" : "bg-slate-200"
                            }`}
                            style={{ width: showAsCompleted ? "100%" : "0%" }}
                          />
                        </div>
                      )}
                      
                      {/* Indicador circular - tamanho fixo para alinhamento perfeito */}
                      <div className="relative w-10 h-10 md:w-12 md:h-12 flex items-center justify-center flex-shrink-0">
                        {/* Círculo de fundo com animação sutil */}
                        {showAsActive && (
                          <div className="absolute inset-0 rounded-full bg-blue-100/50 animate-pulse" style={{ transform: 'scale(1.4)' }} />
                        )}
                        
                        <div
                          className={`relative w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                            showAsActive
                              ? "bg-blue-600 shadow-lg shadow-blue-200/50 scale-110"
                              : showAsCompleted
                              ? "bg-emerald-500 shadow-md"
                              : "bg-white border-2 border-slate-200"
                          }`}
                        >
                          {showAsCompleted ? (
                            <CheckCircle2 className="h-5 w-5 md:h-6 md:w-6 text-white" />
                          ) : showAsActive ? (
                            <Loader2 className="h-4 w-4 md:h-5 md:w-5 text-white animate-spin" />
                          ) : (
                            <span className={`text-xs md:text-sm font-medium ${showAsActive ? "text-white" : "text-slate-400"}`}>
                              {index + 1}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {/* Label da etapa */}
                      <div className="mt-2 md:mt-3 text-center w-full px-1 max-w-[90px] md:max-w-none">
                        <span
                          className={`text-[10px] md:text-xs font-medium transition-colors duration-200 leading-tight ${
                            showAsActive 
                              ? "text-blue-600 font-semibold" 
                              : showAsCompleted 
                              ? "text-emerald-600" 
                              : "text-slate-400"
                          }`}
                        >
                          {step.title}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Step Content */}
        <Card className="p-8 rounded-2xl shadow-sm border-0 bg-white/80 backdrop-blur-sm">
          {token && (
            <CurrentStepComponent
              webCheckin={currentWebCheckin || webCheckinInfo}
              token={token}
              data={webCheckinData}
              onNext={handleNext}
              onBack={handleBack}
              isFirstStep={currentStep === 0}
              isLastStep={currentStep === STEPS.length - 1}
            />
          )}
        </Card>

        {/* Dialog para reutilizar dados anteriores */}
        <ReuseDataDialog
          open={showReuseDataDialog}
          onOpenChange={setShowReuseDataDialog}
          previousData={previousCheckinData || null}
          onReuse={handleReuseData}
          onSkip={handleSkipReuse}
        />
      </div>
    </div>
  );
}
