import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, CreditCard, DollarSign, Loader2, TrendingUp, Receipt } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { usePaymentCarriers } from "@/hooks/usePaymentCarriers";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLogger";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePricing } from "@/hooks/usePricing";
import { useActivityLogs } from "@/hooks/useActivityLogs";
import { formatCurrency, isPaymentRefundRecord } from "@/lib/reservationUtils";

interface ReservationPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: any;
  onSuccess?: () => void;
}

const paymentMethodLabels: Record<string, string> = {
  deposit: "Depósito",
  pix: "PIX",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  cash: "Dinheiro",
  bank_transfer: "Transferência Bancária",
};

export function ReservationPaymentModal({
  open,
  onOpenChange,
  reservation,
  onSuccess,
}: ReservationPaymentModalProps) {
  const queryClient = useQueryClient();
  const { carriers, paymentTypes, isLoading: loadingCarriers } = usePaymentCarriers();
  const { calculatePrice } = usePricing();
  
  const [selectedCarrierId, setSelectedCarrierId] = useState<string>("");
  const [selectedPaymentTypeId, setSelectedPaymentTypeId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [installments, setInstallments] = useState<string>("1");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [observations, setObservations] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [originalCheckoutDate, setOriginalCheckoutDate] = useState<string | null>(null);
  const [extensionAmount, setExtensionAmount] = useState<number>(0);
  
  // Estado para seleção de componente do pagamento (apenas um por vez)
  // Valores possíveis: "base" | "extension" | `fee-${feeId}` | ""
  const [selectedComponent, setSelectedComponent] = useState<string>("");

  // Buscar taxas extras da reserva com detalhes
  const { data: serviceFees = [] } = useQuery({
    queryKey: ["reservation_service_fees", reservation?.id],
    queryFn: async () => {
      if (!reservation?.id) return [];
      const { data, error } = await supabase
        .from("reservation_service_fees")
        .select(`
          *,
          service_fees!service_fee_id(name, description)
        `)
        .eq("reservation_id", reservation.id);
      
      if (error) {
        console.error("Erro ao buscar taxas extras:", error);
        return [];
      }
      return data || [];
    },
    enabled: open && !!reservation?.id,
  });

  // Buscar pagamentos existentes para calcular saldos pendentes
  const { data: existingPayments = [] } = useQuery({
    queryKey: ["reservation_payments", reservation?.id],
    queryFn: async () => {
      if (!reservation?.id) return [];
      const { data, error } = await supabase
        .from("payments")
        .select(`
          id, 
          amount, 
          notes, 
          payment_date, 
          created_at,
          carrier_id,
          payment_type_id,
          payment_carriers:carrier_id (
            id,
            code,
            description
          ),
          payment_types:payment_type_id (
            id,
            name,
            payment_method
          )
        `)
        .eq("reservation_id", reservation.id)
        .order("created_at", { ascending: true });
      
      if (error) {
        console.error("Erro ao buscar pagamentos:", error);
        return [];
      }
      return data || [];
    },
    enabled: open && !!reservation?.id,
  });

  // Buscar logs de atividade para detectar extensões
  const { logs: activityLogs } = useActivityLogs(
    reservation?.id ? {
      entityType: "reservation",
      entityId: reservation.id,
    } : undefined
  );

  // Detectar extensão da reserva e calcular valor
  useEffect(() => {
    const detectExtension = async () => {
      if (!reservation || !open) return;

      // IMPORTANTE: Buscar dados mais recentes da reserva para detectar alterações recentes
      let currentReservation = reservation;
      try {
        const { data: freshReservation } = await supabase
          .from("reservations")
          .select(`
            id,
            checkin_date,
            checkout_date,
            total_amount,
            paid_amount,
            category_id,
            pricing_plan_id
          `)
          .eq("id", reservation.id)
          .single();
        
        if (freshReservation) {
          currentReservation = { ...reservation, ...freshReservation };
        }
      } catch (error) {
        console.warn("Erro ao buscar dados atualizados da reserva:", error);
        // Continuar com os dados da reserva original
      }

      let originalCheckin: string | null = null;
      let originalCheckout: string | null = null;
      let originalTotalAmount: number | null = null;

      // Estratégia 1: Buscar as datas originais nos logs de criação ou alteração de datas
      const createdLog = activityLogs?.find((log: any) => log.action_type === "created");
      const checkoutChangeLogs = activityLogs?.filter((log: any) => 
        (log.action_type === "dates_changed" || log.action_type === "moved" || log.action_type === "updated") && 
        log.old_values?.checkout_date && 
        log.new_values?.checkout_date
      ) || [];

      // Ordenar logs de alteração por data de criação (mais antigo primeiro)
      checkoutChangeLogs.sort((a: any, b: any) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Verificar se a reserva foi criada sem pagamento inicial
      let originalPaidAmount = 0;
      if (createdLog && createdLog.new_values) {
        // Se houver log de criação, usar as datas originais da criação
        originalCheckin = createdLog.new_values.checkin_date || null;
        originalCheckout = createdLog.new_values.checkout_date;
        originalTotalAmount = createdLog.new_values.total_amount || null;
        // IMPORTANTE: Verificar o paid_amount no momento da criação
        originalPaidAmount = Number(createdLog.new_values.paid_amount || 0);
      } else if (checkoutChangeLogs.length > 0) {
        // Se não houver log de criação, pegar a primeira alteração (mais antiga) para obter as datas originais
        const firstChange = checkoutChangeLogs[0];
        originalCheckin = firstChange.old_values.checkin_date || null;
        originalCheckout = firstChange.old_values.checkout_date;
        originalTotalAmount = firstChange.old_values.total_amount || null;
      } else {
        // Estratégia 2: Se não houver logs, buscar a primeira data de checkout registrada
        const allCheckoutLogs = activityLogs?.filter((log: any) => 
          (log.old_values?.checkout_date || log.new_values?.checkout_date)
        ) || [];
        
        if (allCheckoutLogs.length > 0) {
          allCheckoutLogs.sort((a: any, b: any) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          const firstLog = allCheckoutLogs[0];
          originalCheckin = firstLog.old_values?.checkin_date || firstLog.new_values?.checkin_date || null;
          originalCheckout = firstLog.old_values?.checkout_date || firstLog.new_values?.checkout_date || null;
          originalTotalAmount = firstLog.old_values?.total_amount || firstLog.new_values?.total_amount || null;
        }
      }

      // Se ainda não encontrou as datas originais, não há extensão
      if (!originalCheckout || !currentReservation.checkout_date) {
        setOriginalCheckoutDate(null);
        setExtensionAmount(0);
        return;
      }

      setOriginalCheckoutDate(originalCheckout);

      // Normalizar datas para comparação
      const normalizeDate = (dateStr: string | null | undefined): string | null => {
        if (!dateStr) return null;
        return dateStr.split('T')[0]; // Pegar apenas a parte da data (YYYY-MM-DD)
      };

      const normalizedOriginalCheckin = normalizeDate(originalCheckin);
      const normalizedOriginalCheckout = normalizeDate(originalCheckout);
      const normalizedCurrentCheckin = normalizeDate(currentReservation.checkin_date);
      const normalizedCurrentCheckout = normalizeDate(currentReservation.checkout_date);

      // Verificar se há alteração nas datas
      const datesChanged = 
        (normalizedOriginalCheckin !== normalizedCurrentCheckin) ||
        (normalizedOriginalCheckout !== normalizedCurrentCheckout);

      if (!datesChanged) {
        // Não há alteração nas datas, não há extensão
        setExtensionAmount(0);
        return;
      }

      // Calcular quantidade de diárias original e atual
      let originalNights = 0;
      let currentNights = 0;
      
      if (normalizedOriginalCheckin && normalizedOriginalCheckout) {
        const originalCheckinDate = parseISO(normalizedOriginalCheckin);
        const originalCheckoutDate = parseISO(normalizedOriginalCheckout);
        originalNights = differenceInDays(originalCheckoutDate, originalCheckinDate);
      }
      
      if (normalizedCurrentCheckin && normalizedCurrentCheckout) {
        const currentCheckinDate = parseISO(normalizedCurrentCheckin);
        const currentCheckoutDate = parseISO(normalizedCurrentCheckout);
        currentNights = differenceInDays(currentCheckoutDate, currentCheckinDate);
      }

      // Verificar se há extensão (checkout atual > checkout original)
      const originalDate = parseISO(normalizedOriginalCheckout);
      const currentDate = parseISO(normalizedCurrentCheckout);
      const isExtension = currentDate > originalDate;

      if (!isExtension) {
        // Checkout foi reduzido ou não mudou, não há extensão
        setExtensionAmount(0);
        return;
      }

      // IMPORTANTE: Se a reserva foi criada SEM pagamento inicial (paid_amount === 0 no momento da criação),
      // não tratar como extensão separada, mesmo que seja estendida depois.
      // Nesse caso, o valor base deve ser atualizado para incluir a extensão, tornando tudo um único valor
      const wasCreatedWithoutPayment = originalPaidAmount === 0 || originalPaidAmount < 0.01;
      
      if (wasCreatedWithoutPayment) {
        // Reserva criada sem pagamento inicial: não calcular extensão separada, tudo será tratado como valor base único
        // Mesmo que seja estendida depois, não deve mostrar extensão separada
        setExtensionAmount(0);
        setOriginalCheckoutDate(null);
        return;
      }
      
      // Há extensão! Verificar se quantidade de diárias mudou ou se apenas o valor mudou
      const nightsChanged = originalNights !== currentNights;
      const valueChanged = originalTotalAmount !== null && 
        currentReservation.total_amount !== null &&
        Math.abs((originalTotalAmount || 0) - (currentReservation.total_amount || 0)) > 0.01; // Tolerância para diferenças de centavos

      // Se quantidade de diárias é a mesma MAS o valor mudou, ainda há extensão (reajuste de preço)
      // Se quantidade de diárias mudou, há extensão
      if (nightsChanged || valueChanged) {
        // Calcular valor da extensão baseado no período estendido
        const categoryId = currentReservation.category_id;
        if (categoryId) {
          try {
            const extensionPrice = await calculatePrice(
              categoryId,
              format(originalDate, "yyyy-MM-dd"),
              format(currentDate, "yyyy-MM-dd"),
              undefined,
              currentReservation.pricing_plan_id,
              undefined
            );
            
            // Se o valor calculado for maior que zero, há extensão
            if (extensionPrice > 0) {
              setExtensionAmount(extensionPrice);
            } else {
              // Se não conseguiu calcular ou valor é zero, verificar se houve mudança de valor
              if (valueChanged && originalTotalAmount !== null && currentReservation.total_amount !== null) {
                // Calcular diferença de valor como extensão
                const valueDifference = (currentReservation.total_amount || 0) - (originalTotalAmount || 0);
                if (valueDifference > 0) {
                  setExtensionAmount(valueDifference);
                } else {
                  setExtensionAmount(0);
                }
              } else {
                setExtensionAmount(0);
              }
            }
          } catch (error) {
            console.error("Erro ao calcular valor da extensão:", error);
            // Em caso de erro, tentar calcular pela diferença de valores
            if (valueChanged && originalTotalAmount !== null && currentReservation.total_amount !== null) {
              const valueDifference = (currentReservation.total_amount || 0) - (originalTotalAmount || 0);
              if (valueDifference > 0) {
                setExtensionAmount(valueDifference);
              } else {
                setExtensionAmount(0);
              }
            } else {
              setExtensionAmount(0);
            }
          }
        } else {
          // Sem categoryId, tentar calcular pela diferença de valores
          if (valueChanged && originalTotalAmount !== null && currentReservation.total_amount !== null) {
            const valueDifference = (currentReservation.total_amount || 0) - (originalTotalAmount || 0);
            if (valueDifference > 0) {
              setExtensionAmount(valueDifference);
            } else {
              setExtensionAmount(0);
            }
          } else {
            setExtensionAmount(0);
          }
        }
      } else {
        // Mesma quantidade de diárias E mesmo valor = não há extensão
        setExtensionAmount(0);
      }
    };

    detectExtension();
  }, [reservation, open, activityLogs, calculatePrice]);

  // Filtrar tipos de pagamento do portador selecionado
  const availablePaymentTypes = paymentTypes.filter(
    (pt: any) => pt.carrier_id === selectedCarrierId && pt.is_active
  );

  const selectedPaymentType = paymentTypes.find(
    (pt: any) => pt.id === selectedPaymentTypeId
  );

  // Calcular breakdown do valor
  const paymentBreakdown = useMemo(() => {
    const baseAmount = reservation?.total_amount || 0;
    const paidAmount = Number(reservation?.paid_amount || 0);
    
    // IMPORTANTE: Verificar se a reserva foi criada sem pagamento inicial
    // Buscar o log de criação para verificar o paid_amount inicial
    const createdLog = activityLogs?.find((log: any) => log.action_type === "created");
    const originalPaidAmount = createdLog?.new_values?.paid_amount 
      ? Number(createdLog.new_values.paid_amount) 
      : 0;
    const wasCreatedWithoutPayment = originalPaidAmount === 0 || originalPaidAmount < 0.01;
    
    const serviceFeesTotal = (serviceFees || []).reduce((sum: number, fee: any) => {
      return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
    }, 0);
    
    // IMPORTANTE: Se foi criada sem pagamento inicial, não separar extensão - tudo é valor base único
    // Se foi criada COM pagamento inicial E houver extensão, calcular valor base original separando a extensão
    let originalBaseAmount = baseAmount;
    let effectiveExtensionAmount = extensionAmount;
    
    if (wasCreatedWithoutPayment) {
      // Reserva criada sem pagamento inicial: não há extensão separada, tudo é valor base único
      // Mesmo que seja estendida depois, não deve mostrar extensão separada
      effectiveExtensionAmount = 0;
      originalBaseAmount = baseAmount; // Valor total é o valor base
    } else if (extensionAmount > 0 && originalCheckoutDate) {
      // Reserva criada COM pagamento inicial E tem extensão: calcular valor base original separando a extensão
      originalBaseAmount = Math.max(0, baseAmount - extensionAmount);
    } else {
      // Reserva criada COM pagamento inicial mas sem extensão: usar valor total como base
      effectiveExtensionAmount = 0;
      originalBaseAmount = baseAmount;
    }
    
    const totalWithFees = originalBaseAmount + effectiveExtensionAmount + serviceFeesTotal;
    const totalPaid = (reservation?.paid_amount || 0);
    
    // Determinar quando a extensão foi adicionada (usando logs de atividade)
    // IMPORTANTE: Só calcular se foi criada COM pagamento inicial E tem extensão
    let extensionAddedAt: Date | null = null;
    if (!wasCreatedWithoutPayment && effectiveExtensionAmount > 0 && activityLogs && originalCheckoutDate) {
      // Buscar logs que indicam extensão (checkout aumentou)
      const extensionLogs = activityLogs.filter((log: any) => {
        if (!log.old_values?.checkout_date || !log.new_values?.checkout_date) return false;
        try {
          const oldCheckout = parseISO(log.old_values.checkout_date);
          const newCheckout = parseISO(log.new_values.checkout_date);
          return newCheckout > oldCheckout;
        } catch {
          return false;
        }
      });
      
      // Ordenar por data (mais recente primeiro) e pegar o mais recente
      if (extensionLogs.length > 0) {
        extensionLogs.sort((a: any, b: any) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        extensionAddedAt = new Date(extensionLogs[0].created_at);
      }
    }
    
    // Processar pagamentos sequencialmente para calcular saldos pendentes corretos
    // IMPORTANTE: Cada pagamento com componente específico só afeta aquele componente
    // Pagamentos sem componente são aplicados sequencialmente (comportamento antigo)
    
    // Ordenar taxas por data de criação (mais antigas primeiro)
    const sortedFees = [...(serviceFees || [])].sort((a: any, b: any) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB;
    });
    
    // Ordenar pagamentos por data (mais antigos primeiro)
    const sortedPayments = [...(existingPayments || [])].sort((a: any, b: any) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : (a.payment_date ? new Date(a.payment_date).getTime() : 0);
      const dateB = b.created_at ? new Date(b.created_at).getTime() : (b.payment_date ? new Date(b.payment_date).getTime() : 0);
      return dateA - dateB;
    });
    
    // Processar pagamentos sequencialmente, aplicando apenas aos componentes corretos
    // IMPORTANTE: Se foi criada sem pagamento inicial, tudo é valor base único
    let remainingForBase = originalBaseAmount;
    let remainingForExtension = wasCreatedWithoutPayment ? 0 : effectiveExtensionAmount;
    const feesPaid: Record<string, number> = {}; // Rastrear quanto foi pago de cada taxa
    
    sortedPayments.forEach((payment: any) => {
      if (isPaymentRefundRecord(payment)) return;

      const paymentAmount = Number(payment.amount || 0);
      const paymentDate = payment.created_at ? new Date(payment.created_at) : (payment.payment_date ? new Date(payment.payment_date) : null);
      
      if (!paymentDate) return;
      
      // Extrair o componente do pagamento das notas (se existir)
      // Formato: [COMPONENT:base], [COMPONENT:extension], [COMPONENT:fee-xxx]
      const componentMatch = payment.notes?.match(/\[COMPONENT:([^\]]+)\]/);
      const paymentComponent = componentMatch ? componentMatch[1] : null;
      
      let remaining = paymentAmount;
      
      // Se o pagamento foi feito para um componente específico, aplicar APENAS àquele componente
      // IMPORTANTE: Não afetar outros componentes de forma alguma
      if (paymentComponent) {
        if (paymentComponent === "base") {
          // Aplicar APENAS ao base - não tocar em extensão ou taxas
          if (remainingForBase > 0 && remaining > 0) {
            const appliedToBase = Math.min(remaining, remainingForBase);
            remainingForBase -= appliedToBase;
          }
          // Não aplicar a extensão ou taxas - pular para o próximo pagamento
          return;
        } else if (paymentComponent === "extension") {
          // Aplicar APENAS à extensão - não tocar em base ou taxas
          // IMPORTANTE: Só aplicar se foi criada COM pagamento inicial E tem extensão separada
          if (!wasCreatedWithoutPayment && effectiveExtensionAmount > 0 && remainingForExtension > 0 && remaining > 0) {
            const appliedToExtension = Math.min(remaining, remainingForExtension);
            remainingForExtension -= appliedToExtension;
          }
          // Não aplicar a base ou taxas - pular para o próximo pagamento
          return;
        } else if (paymentComponent.startsWith("fee-")) {
          // Aplicar APENAS à taxa específica - não tocar em base, extensão ou outras taxas
          const feeId = paymentComponent.replace("fee-", "");
          const fee = sortedFees.find((f: any) => f.id === feeId);
          
          if (fee) {
            const feeTotal = Number(fee.amount || 0) * Number(fee.quantity || 1);
            const currentPaid = feesPaid[feeId] || 0;
            const feeRemaining = feeTotal - currentPaid;
            
            if (feeRemaining > 0 && remaining > 0) {
              const appliedToFee = Math.min(remaining, feeRemaining);
              feesPaid[feeId] = (feesPaid[feeId] || 0) + appliedToFee;
            }
          }
          // Não aplicar a base, extensão ou outras taxas - pular para o próximo pagamento
          return;
        }
        // Se chegou aqui e tem componente mas não é nenhum dos tipos conhecidos, não aplicar a nada
        return;
      } else {
        // Pagamento antigo sem componente especificado: aplicar sequencialmente (comportamento antigo)
        // 1. Aplicar ao base primeiro
        if (remainingForBase > 0 && remaining > 0) {
          const appliedToBase = Math.min(remaining, remainingForBase);
          remainingForBase -= appliedToBase;
          remaining -= appliedToBase;
        }
        
        // 2. Aplicar à extensão (se houver e se o pagamento foi depois da extensão)
        // IMPORTANTE: Só aplicar se foi criada COM pagamento inicial E tem extensão separada
        // IMPORTANTE: Só aplicar se extensionAddedAt existir E o pagamento foi feito DEPOIS da extensão
        // Se extensionAddedAt não existir, não aplicar pagamentos antigos à extensão
        if (!wasCreatedWithoutPayment && effectiveExtensionAmount > 0 && extensionAddedAt && paymentDate >= extensionAddedAt && remainingForExtension > 0 && remaining > 0) {
          const appliedToExtension = Math.min(remaining, remainingForExtension);
          remainingForExtension -= appliedToExtension;
          remaining -= appliedToExtension;
        } else if (!wasCreatedWithoutPayment && effectiveExtensionAmount > 0 && !extensionAddedAt) {
          // Se há extensão mas não há data de quando foi adicionada, não aplicar pagamentos antigos à extensão
          // Isso evita que pagamentos feitos antes da extensão sejam aplicados incorretamente
        }
        
        // 3. Aplicar às taxas que existiam quando o pagamento foi feito
        if (remaining > 0) {
          sortedFees.forEach((fee: any) => {
            if (remaining <= 0) return;
            
            const feeId = fee.id;
            if (!feeId) return;
            
            const feeCreatedAt = fee.created_at ? new Date(fee.created_at) : null;
            
            // Só aplicar se a taxa existia quando o pagamento foi feito
            if (!feeCreatedAt || paymentDate < feeCreatedAt) return;
            
            const feeTotal = Number(fee.amount || 0) * Number(fee.quantity || 1);
            const currentPaid = feesPaid[feeId] || 0;
            const feeRemaining = feeTotal - currentPaid;
            
            if (feeRemaining > 0 && remaining > 0) {
              const appliedToFee = Math.min(remaining, feeRemaining);
              feesPaid[feeId] = (feesPaid[feeId] || 0) + appliedToFee;
              remaining -= appliedToFee;
            }
          });
        }
      }
    });
    
    // Calcular saldo pendente de cada taxa
    const feesPending: Record<string, number> = {};
    sortedFees.forEach((fee: any) => {
      const feeId = fee.id;
      if (!feeId) return;
      
      const feeTotal = Number(fee.amount || 0) * Number(fee.quantity || 1);
      const feePaid = feesPaid[feeId] || 0;
      feesPending[feeId] = Math.max(0, feeTotal - feePaid);
    });

    // Calcular saldos pendentes finais usando os valores processados sequencialmente
    const baseAmountPending = Math.max(0, remainingForBase);
    // IMPORTANTE: Se foi criada sem pagamento inicial, não há extensão separada - tudo é valor base único
    // Garantir que extensionAmountPending seja 0 se não houver extensão ou se já foi totalmente pago
    // Usar Math.round para evitar problemas de precisão de ponto flutuante
    const extensionAmountPending = (!wasCreatedWithoutPayment && effectiveExtensionAmount > 0)
      ? Math.round(Math.max(0, remainingForExtension) * 100) / 100 
      : 0;

    // Debug: Log para verificar valores (apenas em desenvolvimento)
    if (process.env.NODE_ENV === 'development') {
      console.log("🔍 Debug extensão:", {
        wasCreatedWithoutPayment,
        originalPaidAmount,
        currentPaidAmount: paidAmount,
        extensionAmount,
        effectiveExtensionAmount,
        remainingForExtension,
        extensionAmountPending,
        totalPayments: sortedPayments.length,
        extensionAddedAt: extensionAddedAt?.toISOString(),
        paymentsWithExtension: sortedPayments.filter((p: any) => {
          const componentMatch = p.notes?.match(/\[COMPONENT:([^\]]+)\]/);
          return componentMatch && componentMatch[1] === "extension";
        }).length,
      });
    }

    return {
      originalBaseAmount: Math.max(0, originalBaseAmount),
      originalBaseAmountPending: baseAmountPending,
      extensionAmount: effectiveExtensionAmount, // Usar valor efetivo (0 se criada sem pagamento inicial)
      extensionAmountPending: extensionAmountPending,
      serviceFeesTotal,
      serviceFeesPending: feesPending,
      baseAmount,
      totalWithFees,
      remainingBalance: Math.max(0, totalWithFees - totalPaid),
      hasNoPayments: wasCreatedWithoutPayment, // Expor flag para uso na UI
    };
  }, [reservation?.total_amount, reservation?.paid_amount, serviceFees, extensionAmount, originalCheckoutDate, existingPayments, activityLogs]);

  // Calcular valor selecionado baseado no componente selecionado (apenas um por vez)
  const selectedAmount = useMemo(() => {
    if (!selectedComponent) return 0;
    
    if (selectedComponent === "base") {
      return paymentBreakdown.originalBaseAmountPending;
    }
    
    if (selectedComponent === "extension") {
      return paymentBreakdown.extensionAmountPending;
    }
    
    // Verificar se é uma taxa extra
    if (selectedComponent.startsWith("fee-")) {
      const feeId = selectedComponent.replace("fee-", "");
      return paymentBreakdown.serviceFeesPending[feeId] || 0;
    }
    
    return 0;
  }, [selectedComponent, paymentBreakdown]);

  // Inicializar seleção quando o modal abrir
  useEffect(() => {
    if (open && reservation && paymentBreakdown) {
      // Por padrão, selecionar o valor base se houver saldo pendente
      if (paymentBreakdown.originalBaseAmountPending > 0) {
        setSelectedComponent("base");
      } else if (paymentBreakdown.extensionAmountPending > 0 && extensionAmount > 0) {
        // Se não houver valor base pendente mas houver extensão pendente, selecionar extensão
        setSelectedComponent("extension");
      } else {
        // Se não houver valor base pendente nem extensão pendente, verificar taxas
        const hasPendingFees = Object.values(paymentBreakdown.serviceFeesPending || {}).some((amount: number) => amount > 0);
        if (hasPendingFees) {
          // Selecionar a primeira taxa pendente
          const firstPendingFee = serviceFees?.find((fee: any) => {
            const feePending = paymentBreakdown.serviceFeesPending[fee.id] || 0;
            return feePending > 0;
          });
          if (firstPendingFee) {
            setSelectedComponent(`fee-${firstPendingFee.id}`);
          } else {
            setSelectedComponent("");
          }
        } else {
          // Não há nada pendente, não selecionar nada
          setSelectedComponent("");
        }
      }
    } else if (!open) {
      // Resetar quando o modal fechar
      setSelectedComponent("");
    }
  }, [open, reservation?.id, paymentBreakdown, extensionAmount, serviceFees]);

  // Atualizar valor do campo quando seleções mudarem
  useEffect(() => {
    if (open && selectedAmount > 0) {
      setAmount(selectedAmount.toFixed(2));
    } else if (open && selectedAmount === 0) {
      setAmount("");
    }
  }, [selectedAmount, open]);

  // Preencher dados iniciais ao abrir e atualizar reserva se necessário
  useEffect(() => {
    if (open && reservation) {
      // Buscar dados atualizados da reserva para garantir que temos as informações mais recentes
      const refreshReservation = async () => {
        try {
          const { data: freshReservation } = await supabase
            .from("reservations")
            .select(`
              *,
              financial_responsible:clients!client_id(*),
              guest:clients!guest_id(*),
              rooms (*),
              room_categories (*)
            `)
            .eq("id", reservation.id)
            .single();
          
          if (freshReservation) {
            // Invalidar queries para atualizar dados em outros componentes
            queryClient.invalidateQueries({ queryKey: ["reservations"] });
            queryClient.invalidateQueries({ queryKey: ["reservation_payments", reservation.id] });
          }
        } catch (error) {
          console.warn("Erro ao atualizar dados da reserva:", error);
          // Continuar mesmo se houver erro
        }
      };
      
      refreshReservation();
      
      setPaymentDate(new Date());
      setObservations("");
      setSelectedCarrierId("");
      setSelectedPaymentTypeId("");
      setInstallments("1");
    }
  }, [open, reservation, queryClient]);

  const handleSubmit = async () => {
    if (!selectedComponent) {
      toast.error("Selecione um componente para pagar");
      return;
    }
    
    if (!selectedCarrierId || !selectedPaymentTypeId || !amount) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    const paymentAmount = parseFloat(amount.replace(",", "."));
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      toast.error("Valor inválido");
      return;
    }

    setIsSubmitting(true);

    try {
      // Obter establishment_id da reserva
      const establishmentId = reservation.establishment_id || localStorage.getItem("selectedEstablishmentId");
      
      const installmentsCount = parseInt(installments) || 1;
      
      // Calcular taxa se for cartão de crédito
      let feeAmount = 0;
      let feePercent = 0;
      if (selectedPaymentType?.payment_method === "credit_card") {
        feePercent = selectedPaymentType.card_fee || 0;
        if (installmentsCount >= 2 && installmentsCount <= 6) {
          feePercent = selectedPaymentType.installments_2_6_fee || 0;
        } else if (installmentsCount >= 7 && installmentsCount <= 12) {
          feePercent = selectedPaymentType.installments_7_12_fee || 0;
        }
        feeAmount = (paymentAmount * feePercent) / 100;
      }
      
      // Calcular datas de todas as parcelas (mesmo que só uma seja criada)
      const installmentDates: string[] = [];
      for (let i = 0; i < installmentsCount; i++) {
        const installmentDate = new Date(paymentDate);
        installmentDate.setMonth(installmentDate.getMonth() + i);
        installmentDates.push(format(installmentDate, "dd/MM/yyyy", { locale: ptBR }));
      }
      
      // Criar apenas UMA parcela, mas registrar todas as informações
      const componentPrefix = `[COMPONENT:${selectedComponent}]`;
      
      // Montar notas com informações completas de parcelas
      let paymentNotes = componentPrefix;
      if (installmentsCount > 1) {
        paymentNotes += ` | Parcelas: ${installmentsCount}x de R$ ${(paymentAmount / installmentsCount).toFixed(2).replace(".", ",")}`;
        paymentNotes += ` | Datas das parcelas: ${installmentDates.join(", ")}`;
      }
      if (feeAmount > 0) {
        paymentNotes += ` | Taxa (${feePercent}%): R$ ${feeAmount.toFixed(2).replace(".", ",")}`;
        paymentNotes += ` | Valor líquido: R$ ${(paymentAmount - feeAmount).toFixed(2).replace(".", ",")}`;
      }
      if (observations) {
        paymentNotes += ` | ${observations}`;
      }
      
      // Criar apenas um pagamento com todas as informações
      const paymentToInsert = {
        reservation_id: reservation.id,
        establishment_id: establishmentId || undefined,
        carrier_id: selectedCarrierId,
        payment_type_id: selectedPaymentTypeId,
        amount: paymentAmount, // Valor total, não dividido
        payment_method: selectedPaymentType?.payment_method || "deposit",
        payment_date: format(paymentDate, "yyyy-MM-dd'T'HH:mm:ss"),
        installments: installmentsCount, // Registrar quantidade de parcelas
        notes: paymentNotes,
      };
      
      // Inserir o pagamento
      const { error: paymentError } = await supabase
        .from("payments")
        .insert([paymentToInsert]);

      if (paymentError) throw paymentError;

      // Usar breakdown já calculado
      const totalWithFees = paymentBreakdown.totalWithFees;

      // Atualizar o valor pago na reserva (soma de todos os pagamentos criados)
      const newPaidAmount = (reservation.paid_amount || 0) + paymentAmount;
      const newPaymentStatus = newPaidAmount >= totalWithFees ? "paid" : "partial";
      
      // Determinar novo status da reserva baseado no pagamento
      // NOVA LÓGICA:
      // - "unpaid": quando paid_amount === 0 (sem pagamento)
      // - "confirmed": quando valor base original está pago (paid_amount >= total_amount base)
      // - "pending": quando há taxas pendentes OU base não paga completamente
      const baseTotalAmount = reservation.total_amount || 0;
      const serviceFeesTotal = paymentBreakdown.serviceFeesTotal || 0;
      
      let newReservationStatus: "unpaid" | "pending" | "confirmed" = "unpaid";
      if (newPaidAmount === 0) {
        // Sem pagamento = Não Pago
        newReservationStatus = "unpaid";
      } else if (newPaidAmount >= baseTotalAmount && baseTotalAmount > 0) {
        // Valor base pago: verificar se há taxas pendentes
        if (serviceFeesTotal > 0 && newPaidAmount < totalWithFees) {
          // Base paga MAS com taxas pendentes = Pendente
          newReservationStatus = "pending";
        } else {
          // Base paga E sem taxas pendentes = Confirmada
          newReservationStatus = "confirmed";
        }
      } else {
        // Base não paga completamente = Pendente
        newReservationStatus = "pending";
      }
      
      // Não atualizar status se for blocked, cancelled, checkedin, checkedout ou noshow
      // MAS permitir atualizar se for preregistration (para efetivar pré-reserva automaticamente)
      const currentStatus = reservation.status;
      const isPreregistration = currentStatus === "preregistration";
      const shouldUpdateStatus = !["blocked", "cancelled", "checkedin", "checkedout", "noshow"].includes(currentStatus);
      
      // Se for pré-reserva e houver pagamento, efetivar automaticamente
      const finalStatus = isPreregistration && newPaidAmount > 0 ? newReservationStatus : (shouldUpdateStatus ? newReservationStatus : currentStatus);
      
      const { error: reservationError, data: updatedReservation } = await supabase
        .from("reservations")
        .update({ 
          paid_amount: newPaidAmount,
          payment_status: newPaymentStatus,
          ...(shouldUpdateStatus || isPreregistration ? { status: finalStatus } : {})
        })
        .eq("id", reservation.id)
        .select(`
          *,
          financial_responsible:clients!client_id(*),
          guest:clients!guest_id(*),
          rooms (*),
          room_categories (*)
        `)
        .single();

      if (reservationError) throw reservationError;

      // Criar notificação se reserva ficou pendente de pagamento ou taxa
      try {
        if (updatedReservation && (newReservationStatus === "pending" || newReservationStatus === "unpaid")) {
          const establishmentId = updatedReservation.establishment_id;
          
          if (establishmentId) {
            const guestName = updatedReservation.guest?.full_name || 
                             updatedReservation.financial_responsible?.full_name || 
                             "Hóspede";
            
            let notificationType: "pending_payment" | "pending_service_fee" = "pending_payment";
            let notificationMessage = "";
            
            if (newReservationStatus === "unpaid") {
              notificationMessage = `Reserva ${updatedReservation.reservation_code || ''} de ${guestName} está sem pagamento`;
            } else if (serviceFeesTotal > 0 && newPaidAmount < totalWithFees) {
              notificationType = "pending_service_fee";
              notificationMessage = `Reserva ${updatedReservation.reservation_code || ''} de ${guestName} tem taxas pendentes`;
            } else {
              notificationMessage = `Reserva ${updatedReservation.reservation_code || ''} de ${guestName} está pendente de pagamento`;
            }
            
            await supabase.rpc("create_notification_for_establishment", {
              p_establishment_id: establishmentId,
              p_type: notificationType,
              p_title: "Reserva Pendente",
              p_message: notificationMessage,
              p_priority: "high",
              p_metadata: {
                reservation_id: updatedReservation.id,
                reservation_code: updatedReservation.reservation_code,
                status: newReservationStatus,
              },
            });
          }
        }
      } catch (error) {
        console.error("Erro ao criar notificação de pagamento pendente:", error);
        // Não bloquear o pagamento se a notificação falhar
      }

      // Registrar log de pagamento
      try {
        const oldPaidAmount = reservation.paid_amount || 0;
        // Sempre usar "payment_added" quando um novo pagamento é criado
        const actionType = "payment_added";
        // Calcular taxa para o log
        let feeAmount = 0;
        let feePercent = 0;
        if (selectedPaymentType?.payment_method === "credit_card") {
          feePercent = selectedPaymentType.card_fee || 0;
          if (installmentsCount >= 2 && installmentsCount <= 6) {
            feePercent = selectedPaymentType.installments_2_6_fee || 0;
          } else if (installmentsCount >= 7 && installmentsCount <= 12) {
            feePercent = selectedPaymentType.installments_7_12_fee || 0;
          }
          feeAmount = (paymentAmount * feePercent) / 100;
        }
        
        // Calcular datas de todas as parcelas para o log
        const installmentDates: string[] = [];
        for (let i = 0; i < installmentsCount; i++) {
          const installmentDate = new Date(paymentDate);
          installmentDate.setMonth(installmentDate.getMonth() + i);
          installmentDates.push(format(installmentDate, "dd/MM/yyyy", { locale: ptBR }));
        }
        
        const paymentDescription = installmentsCount > 1
          ? `Pagamento de ${formatCurrency(paymentAmount)} em ${installmentsCount}x adicionado à reserva ${reservation.reservation_code}. Parcelas: ${installmentDates.join(", ")}`
          : `Pagamento de ${formatCurrency(paymentAmount)} adicionado à reserva ${reservation.reservation_code} em ${format(paymentDate, "dd/MM/yyyy", { locale: ptBR })}`;
        
        await logActivity({
          actionType,
          entityType: "payment",
          entityId: reservation.id,
          entityCode: reservation.reservation_code,
          description: paymentDescription,
          oldValues: {
            paid_amount: oldPaidAmount,
            payment_status: reservation.payment_status || "pending",
          },
          newValues: {
            paid_amount: newPaidAmount,
            payment_status: newPaymentStatus,
          },
          metadata: {
            payment_method: selectedPaymentType?.payment_method || "deposit",
            carrier_id: selectedCarrierId,
            payment_type_id: selectedPaymentTypeId,
            installments: installmentsCount,
            installment_dates: installmentsCount > 1 ? installmentDates : [format(paymentDate, "dd/MM/yyyy", { locale: ptBR })],
            fee_percent: feePercent,
            fee_amount: feeAmount,
            total_amount: paymentAmount,
            net_amount: paymentAmount - feeAmount,
            payment_date: format(paymentDate, "yyyy-MM-dd"),
            component: selectedComponent, // Componente pago (base, extension, fee-xxx)
            notes: observations || null,
          },
        });
      } catch (logError) {
        console.error("Erro ao registrar log de pagamento:", logError);
        // Não bloquear o pagamento se o log falhar, mas avisar
        toast.error("Pagamento registrado, mas houve erro ao salvar o log");
      }

      // Disparar e-mail se pagamento foi confirmado (status = "paid")
      // IMPORTANTE: Não enviar email de pagamento confirmado se for uma extensão
      // (extensões têm seu próprio email via updateReservation)
      if (newPaymentStatus === "paid" && updatedReservation) {
        // Verificar se é uma extensão de várias formas:
        // 1. Se o selectedComponent é "extension" (pagamento específico para extensão)
        // 2. Se o checkout_date foi atualizado recentemente (últimos 60 segundos)
        let isExtension = false;
        
        // Método 1: Verificar se o pagamento é especificamente para extensão
        if (selectedComponent === "extension") {
          isExtension = true;
          console.log("📧 Extensão detectada: selectedComponent é 'extension'");
        } else {
          // Método 2: Verificar se checkout_date foi atualizado recentemente
          try {
            const { data: recentLogs } = await supabase
              .from("activity_logs")
              .select("new_values, old_values, created_at, action_type")
              .eq("entity_id", reservation.id)
              .eq("entity_type", "reservation")
              .order("created_at", { ascending: false })
              .limit(10);
            
            if (recentLogs) {
              const now = new Date();
              for (const log of recentLogs) {
                // Verificar se checkout_date foi atualizado
                if (log.new_values?.checkout_date && log.old_values?.checkout_date && log.created_at) {
                  const oldCheckout = new Date(log.old_values.checkout_date);
                  const newCheckout = new Date(log.new_values.checkout_date);
                  
                  // Se a nova data é maior que a antiga, é uma extensão
                  if (newCheckout > oldCheckout) {
                    const logDate = new Date(log.created_at);
                    const secondsDiff = (now.getTime() - logDate.getTime()) / 1000;
                    
                    // Se checkout_date foi atualizado nos últimos 60 segundos, é uma extensão
                    if (secondsDiff < 60) {
                      isExtension = true;
                      console.log("📧 Extensão detectada: checkout_date atualizado recentemente", {
                        secondsAgo: secondsDiff,
                        oldCheckout: log.old_values.checkout_date,
                        newCheckout: log.new_values.checkout_date,
                        actionType: log.action_type
                      });
                      break;
                    }
                  }
                }
              }
            }
          } catch (logError) {
            console.warn("⚠️ Erro ao verificar logs para detectar extensão:", logError);
            // Se houver erro, assumir que não é extensão para não bloquear o email
          }
        }
        
        if (isExtension) {
          // Se for extensão, enviar email de extensão ao invés de pagamento confirmado
          // Verificar se o email já foi enviado recentemente para evitar duplicação
          try {
            // Verificar se já existe um email de extensão enviado recentemente (últimos 5 minutos)
            const { data: recentEmails } = await supabase
              .from("email_logs")
              .select("id, created_at")
              .eq("reservation_id", reservation.id)
              .eq("event_type", "reservation.extended")
              .eq("status", "sent")
              .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
              .limit(1);
            
            if (recentEmails && recentEmails.length > 0) {
              console.log("📧 Email de extensão já foi enviado recentemente, evitando duplicação:", {
                reservationId: reservation.id.substring(0, 8),
                lastSent: recentEmails[0].created_at
              });
            } else {
              console.log("📧 Enviando email de extensão após pagamento confirmado:", {
                reservationId: reservation.id.substring(0, 8),
                selectedComponent,
                newCheckout: updatedReservation.checkout_date
              });
              
              const { triggerEmail } = await import("@/lib/emailService");
              // Buscar checkout_date original para passar como variável
              let oldCheckoutDate = reservation.checkout_date;
              try {
                const { data: recentLogs } = await supabase
                  .from("activity_logs")
                  .select("old_values, new_values")
                  .eq("entity_id", reservation.id)
                  .eq("entity_type", "reservation")
                  .not("old_values->checkout_date", "is", null)
                  .order("created_at", { ascending: false })
                  .limit(1)
                  .single();
                
                if (recentLogs?.old_values?.checkout_date) {
                  oldCheckoutDate = recentLogs.old_values.checkout_date;
                }
              } catch (logError) {
                // Usar checkout_date da reserva original se não conseguir buscar do log
              }
              
              const emailResult = await triggerEmail('reservation.extended', updatedReservation, {
                new_checkout_date: updatedReservation.checkout_date,
              });
              
              if (emailResult) {
                console.log("✅ Email de extensão enviado após pagamento confirmado");
              } else {
                console.warn("⚠️ Email de extensão não foi enviado (template não encontrado ou inativo)");
              }
            }
          } catch (emailError) {
            console.error("Erro ao disparar e-mail de extensão:", emailError);
            // Não bloquear o pagamento se o e-mail falhar
          }
        } else {
          // Se não for extensão, enviar email de pagamento confirmado normalmente
          try {
            const { triggerEmail } = await import("@/lib/emailService");
            await triggerEmail('payment.confirmed', updatedReservation);
            console.log("📧 Email de pagamento confirmado enviado");
          } catch (emailError) {
            console.error("Erro ao disparar e-mail de pagamento confirmado:", emailError);
            // Não bloquear o pagamento se o e-mail falhar
          }
        }
      }

      toast.success("Pagamento lançado com sucesso!");
      
      // Invalidar todas as queries relacionadas para forçar atualização
      queryClient.invalidateQueries({ queryKey: ["reservation_payments", reservation.id] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      
      // Aguardar um pouco para garantir que o banco processou a inserção e propagou os relacionamentos
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Refetch explícito para garantir que os dados sejam atualizados imediatamente
      // Isso garante que os relacionamentos (payment_carriers, payment_types) sejam carregados
      await queryClient.refetchQueries({ 
        queryKey: ["reservation_payments", reservation.id],
        exact: true 
      });
      await queryClient.refetchQueries({ queryKey: ["reservations"] });
      
      // Resetar estados antes de fechar o modal
      setSelectedComponent("");
      setAmount("");
      setObservations("");
      setSelectedCarrierId("");
      setSelectedPaymentTypeId("");
      setInstallments("1");
      
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao lançar pagamento:", error);
      toast.error("Erro ao lançar pagamento");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calcular taxa se for cartão
  const calculateFee = () => {
    if (!selectedPaymentType) return 0;
    
    const inst = parseInt(installments) || 1;
    const paymentAmount = parseFloat(amount.replace(",", ".")) || 0;
    
    if (selectedPaymentType.payment_method === "credit_card") {
      let feePercent = selectedPaymentType.card_fee || 0;
      
      if (inst >= 2 && inst <= 6) {
        feePercent = selectedPaymentType.installments_2_6_fee || 0;
      } else if (inst >= 7 && inst <= 12) {
        feePercent = selectedPaymentType.installments_7_12_fee || 0;
      }
      
      return (paymentAmount * feePercent) / 100;
    }
    
    return 0;
  };

  const fee = calculateFee();
  const netAmount = parseFloat(amount.replace(",", ".") || "0") - fee;

  if (!reservation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-2">
          <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-600" />
            Lançar Pagamento
          </DialogTitle>
          
          {/* Informações da Reserva com Breakdown Detalhado */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Reserva:</span>
              <span className="text-sm font-semibold text-slate-900">
                {reservation.reservation_code || reservation.id?.substring(0, 8)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Hóspede:</span>
              <span className="text-sm font-semibold text-slate-900">{reservation.guest_name}</span>
            </div>
            
            {/* Seleção de Componentes do Pagamento */}
            <div className="pt-2 border-t border-slate-200 space-y-3">
              <Label className="text-sm font-semibold text-slate-700">Selecione o componente a pagar:</Label>
              
              <RadioGroup value={selectedComponent} onValueChange={setSelectedComponent} className="space-y-2">
                {/* Valor Base Original */}
                {paymentBreakdown.originalBaseAmountPending > 0 && (
                  <div className="flex items-center justify-between p-2 rounded-md hover:bg-slate-50 transition-colors border border-slate-200">
                    <div className="flex items-center gap-3 flex-1">
                      <RadioGroupItem value="base" id="base-amount" />
                      <label htmlFor="base-amount" className="flex items-center gap-2 cursor-pointer flex-1">
                        <Receipt className="h-4 w-4 text-slate-500" />
                        <div className="flex flex-col">
                          <span className="text-sm text-slate-700 font-medium">Valor Base Original</span>
                          {paymentBreakdown.originalBaseAmountPending < paymentBreakdown.originalBaseAmount && (
                            <span className="text-xs text-slate-500">
                              Total: R$ {paymentBreakdown.originalBaseAmount.toFixed(2).replace(".", ",")} | 
                              Pago: R$ {(paymentBreakdown.originalBaseAmount - paymentBreakdown.originalBaseAmountPending).toFixed(2).replace(".", ",")}
                            </span>
                          )}
                        </div>
                      </label>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">
                      R$ {paymentBreakdown.originalBaseAmountPending.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                )}
                
                {/* Extensão da Reserva (Diárias Adicionadas) */}
                {/* IMPORTANTE: Só mostrar se NÃO estamos em modo "sem pagamentos" (onde não há extensão separada) */}
                {/* Só mostrar se houver extensão E saldo pendente maior que 0.01 (tolerância para diferenças de centavos) */}
                {/* Verificação adicional: garantir que realmente há saldo pendente e que não foi totalmente pago */}
                {!paymentBreakdown.hasNoPayments &&
                 paymentBreakdown.extensionAmount > 0 && 
                 paymentBreakdown.extensionAmountPending > 0.01 && 
                 originalCheckoutDate &&
                 paymentBreakdown.extensionAmountPending <= paymentBreakdown.extensionAmount &&
                 Math.round(paymentBreakdown.extensionAmountPending * 100) > 0 && (
                  <div className="flex items-center justify-between p-2 rounded-md bg-blue-50 hover:bg-blue-100 transition-colors border-2 border-blue-200">
                    <div className="flex items-center gap-3 flex-1">
                      <RadioGroupItem value="extension" id="extension" />
                      <label htmlFor="extension" className="flex items-center gap-2 cursor-pointer flex-1">
                        <TrendingUp className="h-4 w-4 text-blue-600" />
                        <div className="flex flex-col">
                          <span className="text-sm text-blue-700 font-semibold">Diárias Adicionadas (Extensão da Reserva)</span>
                          {reservation?.checkout_date && (
                            <span className="text-xs text-blue-600 mt-0.5 font-medium">
                              Período estendido: {format(parseISO(originalCheckoutDate), "dd/MM/yyyy", { locale: ptBR })} → {format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale: ptBR })}
                            </span>
                          )}
                          {paymentBreakdown.extensionAmountPending < paymentBreakdown.extensionAmount && (
                            <span className="text-xs text-blue-600 mt-0.5">
                              Total: R$ {paymentBreakdown.extensionAmount.toFixed(2).replace(".", ",")} | 
                              Pago: R$ {(paymentBreakdown.extensionAmount - paymentBreakdown.extensionAmountPending).toFixed(2).replace(".", ",")}
                            </span>
                          )}
                        </div>
                      </label>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-semibold text-blue-900">
                        R$ {paymentBreakdown.extensionAmountPending.toFixed(2).replace(".", ",")}
                      </span>
                      <span className="text-xs text-blue-600 font-medium">Pendente</span>
                    </div>
                  </div>
                )}
                
                {/* Taxas Extras */}
                {serviceFees && serviceFees.length > 0 && (
                  <>
                    {serviceFees.map((fee: any) => {
                      const feeTotal = Number(fee.amount || 0) * Number(fee.quantity || 1);
                      const feePending = paymentBreakdown.serviceFeesPending[fee.id] || 0;
                      
                      // Só mostrar se houver saldo pendente
                      if (feePending <= 0) return null;
                      
                      return (
                        <div
                          key={fee.id}
                          className="flex items-center justify-between p-2 rounded-md bg-amber-50 hover:bg-amber-100 transition-colors border border-amber-200"
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <RadioGroupItem value={`fee-${fee.id}`} id={`fee-${fee.id}`} />
                            <label htmlFor={`fee-${fee.id}`} className="flex items-center gap-2 cursor-pointer flex-1">
                              <Receipt className="h-4 w-4 text-amber-600" />
                              <div className="flex flex-col">
                                <span className="text-sm text-amber-700 font-medium">
                                  {fee.service_fees?.name || "Taxa Extra"}
                                </span>
                                <div className="flex flex-col gap-0.5">
                                  {fee.quantity > 1 && (
                                    <span className="text-xs text-amber-600">
                                      Qtd: {fee.quantity} × R$ {Number(fee.amount || 0).toFixed(2).replace(".", ",")}
                                    </span>
                                  )}
                                  {feePending < feeTotal && (
                                    <span className="text-xs text-amber-600">
                                      Total: R$ {feeTotal.toFixed(2).replace(".", ",")} | 
                                      Pago: R$ {(feeTotal - feePending).toFixed(2).replace(".", ",")}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </label>
                          </div>
                          <span className="text-sm font-semibold text-amber-900">
                            R$ {feePending.toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                      );
                    })}
                  </>
                )}
              </RadioGroup>
              
              {/* Valor Total Selecionado */}
              {selectedComponent && (
                <div className="flex justify-between items-center pt-2 border-t border-slate-300">
                  <span className="text-sm font-semibold text-slate-700">Valor Selecionado:</span>
                  <span className="text-base font-bold text-emerald-600">
                    R$ {selectedAmount.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex justify-between items-center pt-2 border-t border-slate-300">
              <span className="text-sm font-semibold text-slate-700">Valor Total da Reserva:</span>
              <span className="text-base font-bold text-slate-900">
                R$ {paymentBreakdown.totalWithFees.toFixed(2).replace(".", ",")}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Valor Pago:</span>
              <span className="text-sm font-semibold text-emerald-600">
                R$ {(reservation.paid_amount || 0).toFixed(2).replace(".", ",")}
              </span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-slate-300">
              <span className="text-sm font-semibold text-slate-700">Saldo Pendente:</span>
              <span className="text-base font-bold text-red-600">
                R$ {paymentBreakdown.remainingBalance > 0 ? paymentBreakdown.remainingBalance.toFixed(2).replace(".", ",") : "0,00"}
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mostrar campos de pagamento apenas quando um componente estiver selecionado */}
          {selectedComponent && (
            <>
              {/* Portador de Pagamento */}
              <div className="space-y-2">
                <Label htmlFor="carrier" className="text-sm font-medium">
                  Portador de Pagamento <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={selectedCarrierId}
                  onValueChange={(value) => {
                    setSelectedCarrierId(value);
                    setSelectedPaymentTypeId(""); // Reset tipo quando mudar portador
                  }}
                  disabled={loadingCarriers}
                >
              <SelectTrigger id="carrier">
                <SelectValue placeholder="Selecione o portador" />
              </SelectTrigger>
              <SelectContent>
                {carriers.map((carrier: any) => (
                  <SelectItem key={carrier.id} value={carrier.id}>
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      {carrier.description} ({carrier.code})
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de Pagamento */}
          <div className="space-y-2">
            <Label htmlFor="paymentType" className="text-sm font-medium">
              Tipo de Pagamento <span className="text-red-500">*</span>
            </Label>
            <Select
              value={selectedPaymentTypeId}
              onValueChange={setSelectedPaymentTypeId}
              disabled={!selectedCarrierId || availablePaymentTypes.length === 0}
            >
              <SelectTrigger id="paymentType">
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {availablePaymentTypes.map((type: any) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name} - {paymentMethodLabels[type.payment_method] || type.payment_method}
                    {type.card_brand && ` (${type.card_brand})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedCarrierId && availablePaymentTypes.length === 0 && (
              <p className="text-xs text-amber-600">
                Nenhum tipo de pagamento cadastrado para este portador
              </p>
            )}
          </div>

          {/* Valor e Parcelas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount" className="text-sm font-medium">
                Valor do Pagamento <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-600 font-semibold">
                  R$
                </span>
                <Input
                  id="amount"
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d.,]/g, "");
                    setAmount(value);
                  }}
                  className="pl-10"
                  placeholder="0,00"
                />
              </div>
            </div>

            {selectedPaymentType?.payment_method === "credit_card" && (
              <div className="space-y-2">
                <Label htmlFor="installments" className="text-sm font-medium">
                  Parcelas
                </Label>
                <Select value={installments} onValueChange={setInstallments}>
                  <SelectTrigger id="installments">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((i) => (
                      <SelectItem key={i} value={i.toString()}>
                        {i}x
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {parseInt(installments) > 1 && (
                  <p className="text-xs text-blue-600 bg-blue-50 p-2 rounded-md">
                    💡 Será criado um único pagamento registrando {installments}x parcelas. As informações de parcelas, taxas e datas serão registradas nas observações do pagamento.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Mostrar taxa se houver */}
          {fee > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-amber-800">Taxa ({selectedPaymentType?.card_fee || 0}%):</span>
                <span className="font-semibold text-amber-900">- R$ {fee.toFixed(2).replace(".", ",")}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-amber-300">
                <span className="font-semibold text-amber-800">Valor Líquido:</span>
                <span className="font-bold text-amber-900">R$ {netAmount.toFixed(2).replace(".", ",")}</span>
              </div>
            </div>
          )}

          {/* Data do Pagamento */}
          <div className="space-y-2">
            <Label htmlFor="paymentDate" className="text-sm font-medium">
              Data do Pagamento <span className="text-red-500">*</span>
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="paymentDate"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !paymentDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {paymentDate ? format(paymentDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={paymentDate}
                  onSelect={(date) => date && setPaymentDate(date)}
                  locale={ptBR}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Observações */}
          <div className="space-y-2">
            <Label htmlFor="observations" className="text-sm font-medium">
              Observações
            </Label>
            <Textarea
              id="observations"
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Informações adicionais sobre o pagamento..."
              className="min-h-[80px] resize-none"
            />
          </div>

              {/* Botões */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !selectedCarrierId || !selectedPaymentTypeId || !amount}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Lançando...
                    </>
                  ) : (
                    "Lançar Pagamento"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

