import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  ArrowLeft, 
  ArrowRight, 
  User, 
  Calendar as CalendarIconLucide, 
  MapPin, 
  DollarSign, 
  Hash,
  Edit2,
  Loader2,
  CheckCircle2,
  XCircle,
  Trash2,
  Plus,
  X,
  FileText,
  Maximize2,
  Image as ImageIcon,
  RotateCcw,
  Code,
  Eye as EyeIcon,
  Copy,
  Check,
  Users,
  Receipt,
  CreditCard,
  ChevronDown,
  Tag
} from "lucide-react";
import { format, parseISO, differenceInDays, addDays, isAfter, isBefore, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatCurrency, validateRoomAvailability, validateCategoryAvailability } from "@/lib/reservationUtils";
import { useServiceFees } from "@/hooks/useServiceFees";
import { useReservationServiceFees } from "@/hooks/useReservationServiceFees";
import { AddServiceFeeDialog } from "@/components/reservations/AddServiceFeeDialog";
import { ReservationPaymentModal } from "@/components/reservations/ReservationPaymentModal";
import { CancelReservationDialog } from "@/components/reservations/CancelReservationDialog";
import { ReservationDialog } from "@/components/reservations/ReservationDialog";
import { useReservations } from "@/hooks/useReservations";
import { usePricing } from "@/hooks/usePricing";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { logActivity } from "@/lib/activityLogger";
import { useActivityLogs, ActivityLog } from "@/hooks/useActivityLogs";
import { Activity, Clock as ClockIcon } from "lucide-react";
import { ManualCheckinDialog } from "@/components/reservations/ManualCheckinDialog";
import { usePermissions } from "@/hooks/usePermissions";

const ReservationDetails = () => {
  const { reservationCode } = useParams<{ reservationCode: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(1);
  const [isBasicInfoOpen, setIsBasicInfoOpen] = useState(false);
  const { cancelReservation, updateReservation, confirmPreregistration } = useReservations();
  const { calculatePrice } = usePricing();
  const { canDelete } = usePermissions();
  
  // Labels e cores para os tipos de ação
  const actionTypeLabels: Record<string, string> = {
    created: "Criado",
    updated: "Atualizado",
    deleted: "Deletado",
    moved: "Movido",
    swapped: "Trocado",
    blocked: "Bloqueado",
    unblocked: "Desbloqueado",
    checked_in: "Check-in",
    checked_out: "Check-out",
    cancelled: "Cancelado",
    payment_added: "Pagamento Adicionado",
    payment_updated: "Pagamento Atualizado",
    payment_refunded: "Pagamento Estornado",
    payment_notes_updated: "Observação de Pagamento Atualizada",
    service_fee_added: "Taxa Adicionada",
    service_fee_updated: "Taxa Atualizada",
    service_fee_removed: "Taxa Removida",
    split: "Dividido",
    merged: "Mesclado",
    status_changed: "Status Alterado",
    room_assigned: "Quarto Atribuído",
    room_changed: "Quarto Alterado",
    dates_changed: "Datas Alteradas",
    amount_changed: "Valor Alterado",
    guest_changed: "Hóspede Alterado",
    resolved: "Resolvido",
    rate_updated: "Tarifa Atualizada",
    dynamic_rule_applied: "Regra Dinâmica Aplicada",
    price_recommendation_applied: "Recomendação de Preço Aplicada",
  };
  
  const actionTypeColors: Record<string, string> = {
    created: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
    updated: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
    deleted: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
    moved: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
    swapped: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100",
    blocked: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
    unblocked: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
    checked_in: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
    checked_out: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
    payment_added: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
    payment_updated: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
    payment_refunded: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
    payment_notes_updated: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100",
    service_fee_added: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
    service_fee_updated: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
    service_fee_removed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
    resolved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
    rate_updated: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
    dynamic_rule_applied: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
    price_recommendation_applied: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100",
  };
  
  // Estados para edição de datas e valores
  const [isEditingDates, setIsEditingDates] = useState(false);
  const [editCheckinDate, setEditCheckinDate] = useState<Date | undefined>();
  const [editCheckoutDate, setEditCheckoutDate] = useState<Date | undefined>();
  const [editCheckinTime, setEditCheckinTime] = useState("");
  const [editCheckoutTime, setEditCheckoutTime] = useState("");
  const [editTotalAmount, setEditTotalAmount] = useState("");
  const [isRecalculating, setIsRecalculating] = useState(false);
  const calculatingRef = useRef(false);
  const lastCalculationRef = useRef<string>("");
  const editCheckinTimestamp = editCheckinDate ? editCheckinDate.getTime() : null;
  const editCheckoutTimestamp = editCheckoutDate ? editCheckoutDate.getTime() : null;
  const [savingDates, setSavingDates] = useState(false);
  
  // Estado para edição de observações
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  
  // Estados para edição de número de hóspedes
  const [isEditingGuestCount, setIsEditingGuestCount] = useState(false);
  const [editAdults, setEditAdults] = useState<number>(0);
  const [editChildren, setEditChildren] = useState<number>(0);
  const [savingGuestCount, setSavingGuestCount] = useState(false);
  
  // Estado para modal de imagem ampliada
  const [selectedImage, setSelectedImage] = useState<{ url: string; title: string } | null>(null);
  
  // Estado para visualização técnica dos logs
  const [showTechnicalView, setShowTechnicalView] = useState(false);
  
  // Estado para diálogo de logs no Step 1
  const [logsDialogOpen, setLogsDialogOpen] = useState(false);
  
  // Estado para copiar localizador
  const [copied, setCopied] = useState(false);

  // Buscar dados da reserva
  const { data: reservation, isLoading, refetch } = useQuery({
    queryKey: ["reservation", reservationCode],
    queryFn: async () => {
      if (!reservationCode) return null;

      // Buscar dados básicos da reserva primeiro usando o reservation_code
      const { data: reservationData, error: reservationError } = await supabase
        .from("reservations")
        .select(`
          *,
          pricing_plans (*),
          discount_coupons:coupon_id (
            id,
            code,
            name,
            discount_type,
            discount_value,
            apply_to
          )
        `)
        .eq("reservation_code", reservationCode)
        .single();

      if (reservationError) throw reservationError;
      if (!reservationData) return null;

      // Buscar dados do responsável financeiro
      let financialResponsible = null;
      if (reservationData.client_id) {
        const { data: clientData } = await supabase
          .from("clients")
          .select("full_name, email, phone, document_number, document_type")
          .eq("id", reservationData.client_id)
          .single();
        
        if (clientData) {
          financialResponsible = clientData;
        }
      }

      // Buscar dados do hóspede (todos os campos disponíveis)
      let guest = null;
      if (reservationData.guest_id) {
        const { data: guestData } = await supabase
          .from("clients")
          .select("*")
          .eq("id", reservationData.guest_id)
          .single();
        
        if (guestData) {
          guest = guestData;
        }
      }

      // Buscar dados do quarto
      let room = null;
      if (reservationData.room_id) {
        // Tentar buscar todos os campos primeiro para ver o que está disponível
        const { data: roomData, error: roomError } = await supabase
          .from("rooms")
          .select("*")
          .eq("id", reservationData.room_id)
          .single();
        
        if (!roomError && roomData) {
          // Extrair apenas os campos que precisamos
          room = {
            room_number: roomData.room_number || null,
            room_category_id: roomData.room_category_id || roomData.category_id || null,
            name: roomData.name || null,
          };
        } else if (roomError) {
          console.error("Erro ao buscar quarto:", roomError);
        }
      }

      // Buscar nome da categoria (incluindo capacidade)
      let categoryName = null;
      let roomCategory = null;
      const categoryId = reservationData.room_category_id || reservationData.category_id || room?.room_category_id;
      if (categoryId) {
        const { data: categoryData } = await supabase
          .from("room_categories")
          .select("name, capacity_adults, capacity_children")
          .eq("id", categoryId)
          .single();
        
        if (categoryData) {
          categoryName = categoryData.name;
          roomCategory = categoryData;
        }
      }

      // Buscar informações do usuário que cancelou separadamente
      let cancelledByUser = null;
      if (reservationData.cancelled_by) {
        const { data: userData } = await supabase
          .from("users")
          .select("id, email, full_name")
          .eq("id", reservationData.cancelled_by)
          .single();
        
        if (userData) {
          cancelledByUser = userData;
        }
      }

      // Buscar dados do web check-in
      let webCheckin = null;
      const { data: webCheckinData } = await supabase
        .from("web_checkin")
        .select("*")
        .eq("reservation_id", reservationData.id)
        .maybeSingle();
      
      if (webCheckinData) {
        // Buscar documentos do web check-in
        const { data: documentsData } = await supabase
          .from("web_checkin_documents")
          .select("*")
          .eq("web_checkin_id", webCheckinData.id);
        
        // Buscar hóspedes do web check-in
        const { data: guestsData, error: guestsError } = await supabase
          .from("web_checkin_guests")
          .select("*")
          .eq("web_checkin_id", webCheckinData.id)
          .order("order", { ascending: true });
        
        // Debug: verificar dados brutos dos hóspedes
        if (guestsData && guestsData.length > 0) {
          console.log("🔍 Raw guests data from database:", guestsData);
          guestsData.forEach((guest: any, index: number) => {
            if (guest.is_main_guest) {
              console.log(`🔍 Main guest #${index} raw data:`, {
                name: guest.name,
                country: guest.country,
                nationality: guest.nationality,
                hasCountry: !!guest.country,
                allFields: Object.keys(guest),
                fullData: guest
              });
            }
          });
        }
        if (guestsError) {
          console.error("❌ Error fetching guests:", guestsError);
        }
        
        // Gerar signed URLs para as imagens se necessário (bucket privado)
        const documentsWithUrls = await Promise.all(
          (documentsData || []).map(async (doc: any) => {
            const docWithUrls = { ...doc };
            
            // Função auxiliar para extrair o caminho do arquivo da URL
            const extractFilePath = (url: string): string | null => {
              if (!url) return null;
              // Se já for um caminho relativo (começa com web-checkin/), retornar direto
              if (url.startsWith("web-checkin/")) return url;
              // Se for uma URL completa, extrair o caminho após /documents/
              const match = url.match(/\/documents\/(.+)$/);
              if (match) return match[1];
              // Se não encontrar, tentar usar a URL como está (pode ser um caminho direto)
              return url;
            };
            
            // Gerar signed URLs para cada tipo de documento se existir
            if (doc.document_front_url) {
              try {
                const filePath = extractFilePath(doc.document_front_url);
                if (filePath) {
                  const { data: signedData, error } = await supabase.storage
                    .from("documents")
                    .createSignedUrl(filePath, 3600);
                  if (!error && signedData) {
                    docWithUrls.document_front_url = signedData.signedUrl;
                  }
                }
              } catch (error) {
                console.error("Erro ao gerar signed URL para document_front:", error);
                // Manter URL original se falhar
              }
            }
            
            if (doc.document_back_url) {
              try {
                const filePath = extractFilePath(doc.document_back_url);
                if (filePath) {
                  const { data: signedData, error } = await supabase.storage
                    .from("documents")
                    .createSignedUrl(filePath, 3600);
                  if (!error && signedData) {
                    docWithUrls.document_back_url = signedData.signedUrl;
                  }
                }
              } catch (error) {
                console.error("Erro ao gerar signed URL para document_back:", error);
              }
            }
            
            if (doc.selfie_url) {
              try {
                const filePath = extractFilePath(doc.selfie_url);
                if (filePath) {
                  const { data: signedData, error } = await supabase.storage
                    .from("documents")
                    .createSignedUrl(filePath, 3600);
                  if (!error && signedData) {
                    docWithUrls.selfie_url = signedData.signedUrl;
                  }
                }
              } catch (error) {
                console.error("Erro ao gerar signed URL para selfie:", error);
              }
            }
            
            return docWithUrls;
          })
        );
        
        // Processar guests para incluir dados de guest_data (JSONB) se disponível
        const processedGuests = (guestsData || []).map((guest: any) => {
          // Se houver guest_data (JSONB), mesclar com os dados da tabela
          if (guest.guest_data && typeof guest.guest_data === 'object') {
            const processedGuest = {
              ...guest,
              ...guest.guest_data,
              // Priorizar dados do JSONB, mas manter dados da tabela se não existirem no JSONB
              name: guest.guest_data.name || guest.name,
              email: guest.guest_data.email || guest.email,
              phone: guest.guest_data.phone || guest.phone,
              cpf: guest.guest_data.cpf || guest.cpf,
              birth_date: guest.guest_data.birth_date || guest.birth_date,
              document_type: guest.guest_data.document_type || guest.document_type,
              document_number: guest.guest_data.document_number || guest.document_number,
              // Priorizar country e nationality do JSONB, depois da tabela, depois usar um como fallback do outro
              nationality: guest.guest_data.nationality || guest.nationality || guest.guest_data.country || guest.country || null,
              country: guest.guest_data.country || guest.country || guest.guest_data.nationality || guest.nationality || null,
              zip_code: guest.guest_data.zip_code || guest.zip_code,
              postal_code: guest.guest_data.postal_code || guest.postal_code,
              street: guest.guest_data.street || guest.street,
              number: guest.guest_data.number || guest.number,
              complement: guest.guest_data.complement || guest.complement,
              neighborhood: guest.guest_data.neighborhood || guest.neighborhood,
              city: guest.guest_data.city || guest.city,
              state: guest.guest_data.state || guest.state,
              is_main_guest: guest.guest_data.is_main_guest !== undefined ? guest.guest_data.is_main_guest : guest.is_main_guest,
            };
            // Debug: verificar se country está presente
            if (processedGuest.is_main_guest) {
              console.log("🔍 Main guest country debug:", {
                name: processedGuest.name,
                country: processedGuest.country,
                fromGuestData: guest.guest_data?.country,
                fromGuest: guest.country,
                nationality: processedGuest.nationality,
                allFields: Object.keys(processedGuest)
              });
            }
            return processedGuest;
          }
          // Se não houver guest_data, usar dados da tabela e fazer fallback entre country e nationality
          const processedGuest = {
            ...guest,
            // Fazer fallback entre country e nationality se um estiver vazio
            nationality: guest.nationality || guest.country || null,
            country: guest.country || guest.nationality || null,
          };
          // Debug: verificar guest sem guest_data
          if (processedGuest.is_main_guest) {
            console.log("🔍 Main guest (no guest_data) country debug:", {
              name: processedGuest.name,
              country: processedGuest.country,
              nationality: processedGuest.nationality,
              originalCountry: guest.country,
              originalNationality: guest.nationality,
              hasCountry: !!processedGuest.country,
              allFields: Object.keys(guest)
            });
          }
          return processedGuest;
        });
        
        webCheckin = {
          ...webCheckinData,
          documents: documentsWithUrls,
          guests: processedGuests,
        };
      }

      // Processar dados do plano de tarifa se houver pricing_plan_id
      let pricingPlan = null;
      if (reservationData.pricing_plan_id) {
        // Primeiro tentar usar o relacionamento se vier
        if (reservationData.pricing_plans) {
          const planFromRelation = Array.isArray(reservationData.pricing_plans) 
            ? reservationData.pricing_plans[0] 
            : reservationData.pricing_plans;
          if (planFromRelation && planFromRelation.id) {
            pricingPlan = planFromRelation;
          }
        }
        
        // Sempre buscar separadamente para garantir que temos os dados (fallback se relacionamento não funcionar)
        if (!pricingPlan) {
          const { data: planData, error: planError } = await supabase
            .from("pricing_plans")
            .select("*")
            .eq("id", reservationData.pricing_plan_id)
            .single();
          if (!planError && planData) {
            pricingPlan = planData;
          } else if (planError && planError.code !== 'PGRST116') {
            // PGRST116 = não encontrado, não é um erro crítico
            console.warn("Erro ao buscar plano de tarifa:", planError);
          }
        }
      }

      return {
        ...reservationData,
        financial_responsible: financialResponsible,
        guest: guest,
        rooms: room,
        room_categories: roomCategory || (categoryName ? { name: categoryName } : null),
        guest_name: guest?.full_name || financialResponsible?.full_name,
        cancelled_by_user: cancelledByUser,
        web_checkin: webCheckin,
        pricing_plans: pricingPlan,
      };
    },
    enabled: !!reservationCode,
  });

  // Buscar logs da reserva
  const { logs: activityLogs, isLoading: isLoadingLogs } = useActivityLogs(
    reservation?.id ? {
      entityType: "reservation",
      entityId: reservation.id,
    } : undefined
  );

  // Estados para taxas/serviços
  const { serviceFees } = useServiceFees();
  const {
    serviceFees: reservationServiceFees,
    addServiceFee,
    updateServiceFee,
    removeServiceFee,
    isAdding: isAddingServiceFee,
    isUpdating: isUpdatingServiceFee,
  } = useReservationServiceFees(reservation?.id);

  // Buscar pagamentos da reserva
  const { data: payments, refetch: refetchPayments } = useQuery({
    queryKey: ["reservation_payments", reservation?.id],
    queryFn: async () => {
      if (!reservation?.id) return [];

      const { data, error } = await supabase
        .from("payments")
        .select(`
          *,
          payment_carriers:carrier_id(id, code, description),
          payment_types:payment_type_id(id, name, payment_method)
        `)
        .eq("reservation_id", reservation.id)
        .order("payment_date", { ascending: false });
      
      // Garantir que notes está incluído (já está no *)

      if (error) {
        console.error("Erro ao buscar pagamentos:", error);
        return [];
      }

      // Filtrar apenas pagamentos com ID válido
      return (data || []).filter((payment: any) => payment.id);
    },
    enabled: !!reservation?.id,
  });

  // Estados para modais
  const [addServiceFeeDialogOpen, setAddServiceFeeDialogOpen] = useState(false);
  const [selectedServiceFee, setSelectedServiceFee] = useState<{ id: string; name: string; description?: string } | null>(null);
  const [editingServiceFee, setEditingServiceFee] = useState<{ id: string; amount: number; quantity: number; notes?: string } | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [webCheckinDialogOpen, setWebCheckinDialogOpen] = useState(false);
  const [manualCheckinDialogOpen, setManualCheckinDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [paymentToRefund, setPaymentToRefund] = useState<any>(null);
  const [isRefunding, setIsRefunding] = useState(false);
  const [editPaymentNotesDialogOpen, setEditPaymentNotesDialogOpen] = useState(false);
  const [paymentToEditNotes, setPaymentToEditNotes] = useState<any>(null);
  const [paymentNotes, setPaymentNotes] = useState<string>("");
  const [isUpdatingPaymentNotes, setIsUpdatingPaymentNotes] = useState(false);

  // Inicializar estados de edição quando a reserva carregar
  useEffect(() => {
    if (reservation) {
      if (reservation.checkin_date) {
        setEditCheckinDate(parseISO(reservation.checkin_date));
      }
      if (reservation.checkout_date) {
        setEditCheckoutDate(parseISO(reservation.checkout_date));
      }
      setEditCheckinTime(reservation.checkin_time || "15:00");
      setEditCheckoutTime(reservation.checkout_time || "12:00");
      setEditTotalAmount(reservation.total_amount?.toString() || "0");
    }
  }, [reservation]);

  // Subscription em tempo real para atualizações da reserva e pagamentos
  useEffect(() => {
    if (!reservation?.id) return;

    // Canal para mudanças na reserva específica
    const reservationChannel = supabase
      .channel(`reservation:${reservation.id}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "reservations",
          filter: `id=eq.${reservation.id}`,
        },
        (payload) => {
          console.log("🔄 Mudança detectada na reserva:", payload.eventType);
          // Invalidar queries para atualizar os dados
          queryClient.invalidateQueries({ queryKey: ["reservation", reservationCode] });
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
        }
      )
      .subscribe();

    // Canal para mudanças nos pagamentos desta reserva
    const paymentsChannel = supabase
      .channel(`payments:${reservation.id}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "payments",
          filter: `reservation_id=eq.${reservation.id}`,
        },
        async (payload) => {
          console.log("💳 Mudança detectada nos pagamentos:", payload.eventType);
          
          // Se for INSERT ou UPDATE, recalcular paid_amount da reserva
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const { data: payments } = await supabase
              .from("payments")
              .select("amount")
              .eq("reservation_id", reservation.id)
              .eq("status", "completed");

            const totalPaid = (payments || []).reduce((sum: number, p: any) => {
              return sum + Number(p.amount || 0);
            }, 0);

            // Atualizar paid_amount da reserva
            await supabase
              .from("reservations")
              .update({ paid_amount: totalPaid })
              .eq("id", reservation.id);
          }

          // Invalidar queries para atualizar os dados
          queryClient.invalidateQueries({ queryKey: ["reservation", reservationCode] });
          queryClient.invalidateQueries({ queryKey: ["reservation_payments", reservation.id] });
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
        }
      )
      .subscribe();

    // Cleanup: remover subscriptions quando o componente desmontar ou reservation.id mudar
    return () => {
      supabase.removeChannel(reservationChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [reservation?.id, reservationCode, queryClient]);

  // Sincronizar estado de edição de observações quando a reserva mudar
  useEffect(() => {
    if (!isEditingNotes && reservation) {
      setEditNotes(reservation.notes || "");
    }
  }, [reservation?.notes, isEditingNotes]);

  // Calcular número de diárias
  const numberOfNights = useMemo(() => {
    if (isEditingDates && editCheckinDate && editCheckoutDate) {
      return differenceInDays(editCheckoutDate, editCheckinDate);
    }
    if (reservation?.checkin_date && reservation?.checkout_date) {
      return differenceInDays(
        parseISO(reservation.checkout_date),
        parseISO(reservation.checkin_date)
      );
    }
    return 0;
  }, [isEditingDates, editCheckinDate, editCheckoutDate, reservation]);

  // Calcular total incluindo taxas
  const totalWithFees = useMemo(() => {
    const baseTotal = isEditingDates && editTotalAmount 
      ? Number(editTotalAmount.replace(",", ".")) || 0
      : Number(reservation?.total_amount || 0);
    const feesTotal = reservationServiceFees.reduce((sum: number, fee: any) => {
      return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
    }, 0);
    return baseTotal + feesTotal;
  }, [reservation?.total_amount, reservationServiceFees, isEditingDates, editTotalAmount]);

  // Calcular breakdown de pagamentos para determinar quanto de cada taxa foi pago
  const paymentBreakdown = useMemo(() => {
    // Se não houver dados necessários, retornar valores padrão
    if (!reservation || !reservationServiceFees) {
      return { serviceFeesPending: {} };
    }
    
    // Se não houver pagamentos, todas as taxas estão pendentes
    if (!payments || payments.length === 0) {
      const feesPending: Record<string, number> = {};
      reservationServiceFees.forEach((fee: any) => {
        const feeId = fee.id;
        if (feeId) {
          feesPending[feeId] = Number(fee.amount || 0) * Number(fee.quantity || 1);
        }
      });
      return { serviceFeesPending: feesPending };
    }

    const baseAmount = Number(reservation.total_amount || 0);
    const serviceFeesTotal = reservationServiceFees.reduce((sum: number, fee: any) => {
      return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
    }, 0);
    
    // Detectar extensão da reserva
    let originalCheckoutDate: string | null = null;
    let extensionAmount = 0;
    
    if (activityLogs) {
      const createdLog = activityLogs.find((log: any) => log.action_type === "created");
      const checkoutChangeLogs = activityLogs.filter((log: any) => 
        (log.action_type === "dates_changed" || log.action_type === "moved") && 
        log.old_values?.checkout_date && 
        log.new_values?.checkout_date
      ) || [];
      
      checkoutChangeLogs.sort((a: any, b: any) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      if (createdLog && createdLog.new_values?.checkout_date) {
        originalCheckoutDate = createdLog.new_values.checkout_date;
      } else if (checkoutChangeLogs.length > 0) {
        originalCheckoutDate = checkoutChangeLogs[0].old_values.checkout_date;
      }
      
      if (originalCheckoutDate && reservation.checkout_date && parseISO(reservation.checkout_date) > parseISO(originalCheckoutDate)) {
        // Há extensão - calcular valor (simplificado, assumindo proporcional ao base)
        const originalDays = differenceInDays(parseISO(originalCheckoutDate), parseISO(reservation.checkin_date));
        const currentDays = differenceInDays(parseISO(reservation.checkout_date), parseISO(reservation.checkin_date));
        if (originalDays > 0) {
          extensionAmount = (baseAmount / originalDays) * (currentDays - originalDays);
        }
      }
    }
    
    const originalBaseAmount = baseAmount - extensionAmount;
    const totalPaid = Number(reservation.paid_amount || 0);
    
    // Determinar quando a extensão foi adicionada
    let extensionAddedAt: Date | null = null;
    if (extensionAmount > 0 && activityLogs) {
      const extensionLog = activityLogs.find((log: any) => 
        log.action_type === "dates_changed" && 
        log.old_values?.checkout_date && 
        log.new_values?.checkout_date &&
        parseISO(log.new_values.checkout_date) > parseISO(log.old_values.checkout_date)
      );
      if (extensionLog) {
        extensionAddedAt = new Date(extensionLog.created_at);
      }
    }
    
    // Separar pagamentos antes e depois da extensão
    const paymentsBeforeExtension = extensionAddedAt 
      ? (payments || []).filter((p: any) => {
          const paymentDate = p.created_at ? new Date(p.created_at) : null;
          return paymentDate && paymentDate < extensionAddedAt!;
        })
      : [];
    
    const paymentsAfterExtension = extensionAddedAt
      ? (payments || []).filter((p: any) => {
          const paymentDate = p.created_at ? new Date(p.created_at) : null;
          return paymentDate && paymentDate >= extensionAddedAt!;
        })
      : payments || [];
    
    // Processar pagamentos sequencialmente para calcular saldos pendentes corretos
    // IMPORTANTE: Cada pagamento com componente específico só afeta aquele componente
    
    // Ordenar taxas por data de criação (mais antigas primeiro)
    const sortedFees = [...reservationServiceFees].sort((a: any, b: any) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateA - dateB;
    });
    
    // Ordenar pagamentos por data (mais antigos primeiro)
    const sortedPayments = [...(payments || [])].sort((a: any, b: any) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : (a.payment_date ? new Date(a.payment_date).getTime() : 0);
      const dateB = b.created_at ? new Date(b.created_at).getTime() : (b.payment_date ? new Date(b.payment_date).getTime() : 0);
      return dateA - dateB;
    });
    
    // Processar pagamentos sequencialmente, aplicando apenas aos componentes corretos
    // IMPORTANTE: Cada pagamento com componente específico só afeta aquele componente
    let remainingForBase = originalBaseAmount;
    let remainingForExtension = extensionAmount;
    const feesPaid: Record<string, number> = {}; // Rastrear quanto foi pago de cada taxa
    
    sortedPayments.forEach((payment: any) => {
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
          if (extensionAmount > 0 && remainingForExtension > 0 && remaining > 0) {
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
        if (extensionAmount > 0 && extensionAddedAt && paymentDate >= extensionAddedAt && remainingForExtension > 0 && remaining > 0) {
          const appliedToExtension = Math.min(remaining, remainingForExtension);
          remainingForExtension -= appliedToExtension;
          remaining -= appliedToExtension;
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

    // Calcular total pago de taxas para referência
    const totalFeesPaid = Object.values(feesPaid).reduce((sum, paid) => sum + paid, 0);

    return {
      serviceFeesPending: feesPending,
      serviceFeesPaid: totalFeesPaid,
    };
  }, [reservation, payments, reservationServiceFees, activityLogs]);

  // Calcular quantidade de hóspedes baseado no web check-in ou dados da reserva
  const guestCount = useMemo(() => {
    // Se houver web check-in com hóspedes cadastrados, usar essa contagem
    if (reservation?.web_checkin?.guests && reservation.web_checkin.guests.length > 0) {
      const totalGuests = reservation.web_checkin.guests.length;
      // Tentar identificar adultos e crianças baseado na data de nascimento
      const today = new Date();
      const adults = reservation.web_checkin.guests.filter((guest: any) => {
        if (!guest.birth_date) return true; // Se não tiver data de nascimento, considerar adulto
        const birthDate = parseISO(guest.birth_date);
        const age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        const dayDiff = today.getDate() - birthDate.getDate();
        const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
        return actualAge >= 18;
      }).length;
      const children = totalGuests - adults;
      return { total: totalGuests, adults, children, fromWebCheckin: true };
    }
    // Caso contrário, usar os dados da reserva
    return {
      total: (reservation?.adults || 0) + (reservation?.children || 0),
      adults: reservation?.adults || 0,
      children: reservation?.children || 0,
      fromWebCheckin: false,
    };
  }, [reservation?.web_checkin?.guests, reservation?.adults, reservation?.children]);

  // Função para estornar pagamento
  const handleRefundPayment = async () => {
    if (!paymentToRefund || !reservation) return;

    // Validar que o pagamento tem um ID válido
    if (!paymentToRefund.id) {
      toast.error("Erro: ID do pagamento não encontrado");
      console.error("Payment to refund:", paymentToRefund);
      return;
    }

    setIsRefunding(true);
    try {
      const paymentAmount = Number(paymentToRefund.amount || 0);
      const currentPaidAmount = Number(reservation.paid_amount || 0);
      const newPaidAmount = Math.max(0, currentPaidAmount - paymentAmount);

      // Calcular total com taxas extras
      const serviceFeesTotal = (reservationServiceFees || []).reduce((sum: number, fee: any) => {
        return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
      }, 0);
      const totalWithFees = (reservation.total_amount || 0) + serviceFeesTotal;

      // Determinar novo status de pagamento
      let newPaymentStatus: "pending" | "partial" | "paid" = "pending";
      if (newPaidAmount >= totalWithFees && totalWithFees > 0) {
        newPaymentStatus = "paid";
      } else if (newPaidAmount > 0) {
        newPaymentStatus = "partial";
      }

      // Remover o pagamento
      const { error: deleteError } = await supabase
        .from("payments")
        .delete()
        .eq("id", paymentToRefund.id);

      if (deleteError) throw deleteError;

      // Atualizar a reserva
      const { error: updateError } = await supabase
        .from("reservations")
        .update({
          paid_amount: newPaidAmount,
          payment_status: newPaymentStatus,
        })
        .eq("id", reservation.id);

      if (updateError) throw updateError;

      // Registrar log de atividade
      try {
        await logActivity({
          actionType: "payment_refunded",
          entityType: "payment",
          entityId: reservation.id,
          entityCode: reservation.reservation_code || reservation.id.substring(0, 8).toUpperCase(),
          description: `Pagamento de ${formatCurrency(paymentAmount)} estornado da reserva ${reservation.reservation_code || reservation.id.substring(0, 8)}. Valor pago atualizado: ${formatCurrency(newPaidAmount)}`,
          oldValues: {
            paid_amount: currentPaidAmount,
            payment_status: reservation.payment_status || "pending",
            payment_id: paymentToRefund.id,
            payment_amount: paymentAmount,
          },
          newValues: {
            paid_amount: newPaidAmount,
            payment_status: newPaymentStatus,
          },
          metadata: {
            payment_id: paymentToRefund.id,
            refunded_amount: paymentAmount,
            payment_date: paymentToRefund.payment_date || null,
            payment_method: paymentToRefund.payment_method || null,
            carrier_id: paymentToRefund.carrier_id || null,
            payment_type_id: paymentToRefund.payment_type_id || null,
            notes: paymentToRefund.notes || null,
          },
        });
      } catch (logError) {
        console.error("Erro ao registrar log de estorno:", logError);
        // Não bloquear o estorno se o log falhar, mas avisar
        toast.error("Estorno realizado, mas houve erro ao salvar o log");
      }

      toast.success("Pagamento estornado com sucesso!");
      
      // Fechar diálogo e limpar estado
      setRefundDialogOpen(false);
      setPaymentToRefund(null);

      // Atualizar dados - invalidar todas as queries relacionadas
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["reservation", reservationCode] });
      queryClient.invalidateQueries({ queryKey: ["reservation_payments", reservation.id] });
      queryClient.invalidateQueries({ queryKey: ["reservation_service_fees", reservation.id] });
      queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
      
      // Refetch para atualizar os dados imediatamente
      await Promise.all([
        refetch(),
        refetchPayments(),
      ]);
      
      // Forçar atualização do React Query cache para garantir que os dados estão sincronizados
      queryClient.refetchQueries({ queryKey: ["reservation", reservationCode] });
      queryClient.refetchQueries({ queryKey: ["reservation_payments", reservation.id] });
      
      // Aguardar um pouco e refetch novamente para garantir que os dados estão atualizados
      setTimeout(async () => {
        await Promise.all([
          refetch(),
          refetchPayments(),
        ]);
      }, 300);
    } catch (error: any) {
      console.error("Erro ao estornar pagamento:", error);
      toast.error(error.message || "Erro ao estornar pagamento");
    } finally {
      setIsRefunding(false);
    }
  };

  // Função para recalcular preço baseado no tarifário
  const handleRecalculatePrice = useCallback(async (showToast: boolean = true, force: boolean = false) => {
    if (!reservation || !editCheckinDate || !editCheckoutDate) return;

    // Criar uma chave única para esta combinação de datas/reserva
    const calculationKey = `${reservation.id}-${editCheckinDate.toISOString()}-${editCheckoutDate.toISOString()}`;
    
    // Se já estamos calculando ou se já calculamos para essas datas (e não for forçado), não recalcular
    if (calculatingRef.current || (!force && lastCalculationRef.current === calculationKey)) {
      return;
    }

    calculatingRef.current = true;
    lastCalculationRef.current = calculationKey;
    setIsRecalculating(true);
    try {
      const nights = differenceInDays(editCheckoutDate, editCheckinDate);
      if (nights <= 0) {
        if (showToast) {
          toast.error("A data de check-out deve ser posterior à data de check-in");
        }
        setIsRecalculating(false);
        return;
      }

      // Buscar tarifário da categoria
      // Primeiro tenta usar o pricing_plan_id da reserva
      let pricingPlanId = reservation.pricing_plan_id;
      
      // Se não houver, buscar através de pricing_rules usando o category_id
      if (!pricingPlanId) {
        // Obter category_id da reserva ou do quarto
        let categoryId = reservation.room_category_id || reservation.category_id;
        
        // Se não tiver category_id direto, buscar através do quarto
        if (!categoryId && reservation.rooms?.room_category_id) {
          categoryId = reservation.rooms.room_category_id;
        }
        
        if (categoryId) {
          // Buscar pricing_plan_id através de pricing_rules
          // O campo correto pode ser category_id ao invés de room_category_id
          let query = supabase
            .from("pricing_rules")
            .select("pricing_plan_id")
            .eq("category_id", categoryId)
            .limit(1);
          
          const { data: pricingRules, error: pricingError } = await query;
          
          if (!pricingError && pricingRules && pricingRules.length > 0 && pricingRules[0]?.pricing_plan_id) {
            pricingPlanId = pricingRules[0].pricing_plan_id;
          } else if (pricingError) {
            console.error("Erro ao buscar pricing_rules:", pricingError);
            // Se category_id não funcionar, tentar buscar todos e filtrar manualmente
            // ou simplesmente não usar pricing_plan_id (o cálculo pode funcionar só com categoryId)
          }
        }
      }

      // Obter category_id para o cálculo
      let categoryId = reservation.room_category_id || reservation.category_id;
      if (!categoryId && reservation.rooms?.room_category_id) {
        categoryId = reservation.rooms.room_category_id;
      }
      
      if (!categoryId) {
        if (showToast) {
          toast.error("Categoria não encontrada para esta reserva");
        }
        setIsRecalculating(false);
        return;
      }

      // Calcular preço usando o hook de pricing
      // O pricingPlanId é opcional, o cálculo pode ser feito apenas com categoryId
      const price = await calculatePrice(
        categoryId,
        format(editCheckinDate, "yyyy-MM-dd"),
        format(editCheckoutDate, "yyyy-MM-dd"),
        undefined, // promotionCode
        pricingPlanId || undefined, // pricingPlanId (opcional)
        undefined // channelType
      );

      if (price && price > 0) {
        setEditTotalAmount(price.toString());
        if (showToast) {
          toast.success("Valor recalculado com sucesso!");
        }
      } else {
        if (showToast) {
          toast.error("Não foi possível calcular o valor automaticamente");
        }
      }
    } catch (error: any) {
      console.error("Erro ao recalcular preço:", error);
      if (showToast) {
        toast.error(error.message || "Erro ao recalcular preço");
      }
    } finally {
      setIsRecalculating(false);
      calculatingRef.current = false;
    }
  }, [reservation, editCheckinDate, editCheckoutDate, calculatePrice]);

  // Recalcular automaticamente quando as datas mudarem
  useEffect(() => {
    if (isEditingDates && editCheckinDate && editCheckoutDate && reservation) {
      const nights = differenceInDays(editCheckoutDate, editCheckinDate);
      // Só recalcular se as datas forem válidas (checkout > checkin)
      if (nights > 0) {
        // Criar uma chave única para esta combinação de datas/reserva
        const calculationKey = `${reservation.id}-${editCheckinDate.toISOString()}-${editCheckoutDate.toISOString()}`;
        
        // Só recalcular se as datas realmente mudaram e não houver cálculo em andamento
        if (lastCalculationRef.current !== calculationKey && !calculatingRef.current) {
          // Usar um debounce para evitar muitas chamadas
          const timeoutId = setTimeout(() => {
            // Verificar novamente antes de calcular (pode ter mudado durante o timeout)
            const currentKey = `${reservation.id}-${editCheckinDate.toISOString()}-${editCheckoutDate.toISOString()}`;
            if (lastCalculationRef.current !== currentKey && !calculatingRef.current) {
              handleRecalculatePrice(false); // false = não mostrar toast
            }
          }, 500); // Aguardar 500ms após a última mudança

          return () => clearTimeout(timeoutId);
        }
      }
    }
  }, [isEditingDates, editCheckinTimestamp, editCheckoutTimestamp, reservation?.id, handleRecalculatePrice]);

  // Função para salvar alterações de datas e valores
  const handleSaveDates = async () => {
    if (!reservation?.id || !editCheckinDate || !editCheckoutDate) return;

    const nights = differenceInDays(editCheckoutDate, editCheckinDate);
    if (nights <= 0) {
      toast.error("A data de check-out deve ser posterior à data de check-in");
      return;
    }

    setSavingDates(true);
    try {
      const totalAmount = Number(editTotalAmount.replace(",", ".")) || 0;
      
      // Guardar valores antigos para o log
      const oldCheckinDate = reservation.checkin_date;
      const oldCheckoutDate = reservation.checkout_date;
      const oldTotalAmount = reservation.total_amount;
      
      const newCheckinDate = format(editCheckinDate, "yyyy-MM-dd");
      const newCheckoutDate = format(editCheckoutDate, "yyyy-MM-dd");
      
      // Normalizar datas para comparação
      const normalizeDate = (dateStr: string | null | undefined): string | null => {
        if (!dateStr) return null;
        return dateStr.split('T')[0]; // Pegar apenas a parte da data (YYYY-MM-DD)
      };
      
      const normalizedOriginalCheckin = normalizeDate(oldCheckinDate);
      const normalizedOriginalCheckout = normalizeDate(oldCheckoutDate);
      const normalizedNewCheckin = normalizeDate(newCheckinDate);
      const normalizedNewCheckout = normalizeDate(newCheckoutDate);
      
      // Verificar se as datas foram alteradas
      const datesChanged = normalizedNewCheckin && normalizedNewCheckout && 
        normalizedOriginalCheckin && normalizedOriginalCheckout &&
        ((normalizedOriginalCheckin !== normalizedNewCheckin) || 
         (normalizedOriginalCheckout !== normalizedNewCheckout));
      
      // VALIDAÇÃO: Se as datas foram alteradas, verificar disponibilidade
      if (datesChanged) {
        // Verificar se é uma extensão de reserva (checkout posterior)
        const isExtension = normalizedOriginalCheckout && normalizedNewCheckout &&
          isAfter(parseISO(normalizedNewCheckout), parseISO(normalizedOriginalCheckout));
        
        console.log("🔍 Validando alteração de datas na página de detalhes:", {
          originalCheckin: normalizedOriginalCheckin,
          originalCheckout: normalizedOriginalCheckout,
          newCheckin: normalizedNewCheckin,
          newCheckout: normalizedNewCheckout,
          isExtension,
          reservationId: reservation.id
        });
        
        // Se for extensão, validar disponibilidade
        if (isExtension) {
          console.log("📅 Extensão de reserva detectada na página de detalhes");
          
          // Calcular noites adicionais
          const additionalNights = differenceInDays(
            parseISO(normalizedNewCheckout!),
            parseISO(normalizedOriginalCheckout!)
          );
          
          const totalNights = differenceInDays(
            parseISO(normalizedNewCheckout!),
            parseISO(normalizedOriginalCheckin!)
          );
          
          console.log(`📊 Total de noites após extensão: ${totalNights} (${additionalNights} noites adicionais)`);
          
          // Verificar se a reserva tem quarto específico
          const roomIdToCheck = reservation.room_id;
          
          if (!roomIdToCheck) {
            toast.error("❌ Não é possível estender uma reserva sem quarto específico. Selecione um quarto primeiro.");
            setSavingDates(false);
            return;
          }
          
          // Verificar se o quarto está interditado
          const { data: roomCheck, error: roomError } = await supabase
            .from("rooms")
            .select("is_blocked, room_number, name, status")
            .eq("id", roomIdToCheck)
            .single();
          
          if (roomError) {
            console.error("Erro ao verificar quarto:", roomError);
            toast.error("❌ Erro ao verificar disponibilidade do quarto");
            setSavingDates(false);
            return;
          }
          
          if (roomCheck?.is_blocked === true) {
            toast.error(`❌ O quarto ${roomCheck.room_number || roomCheck.name || ""} está interditado e não pode receber extensões de reserva`);
            setSavingDates(false);
            return;
          }
          
          if (roomCheck?.status && !["available", "cleaning"].includes(roomCheck.status)) {
            toast.error(`❌ O quarto ${roomCheck.room_number || roomCheck.name || ""} está ${roomCheck.status === "maintenance" ? "em manutenção" : "indisponível"} e não pode receber extensões`);
            setSavingDates(false);
            return;
          }
          
          // Validar disponibilidade para o período de extensão
          try {
            console.log("🔍 Verificando disponibilidade para período de extensão:", {
              extensionStart: normalizedOriginalCheckout,
              extensionEnd: normalizedNewCheckout,
              roomId: roomIdToCheck
            });
            
            const availabilityCheck = await validateRoomAvailability(
              roomIdToCheck,
              normalizedOriginalCheckin || newCheckinDate, // Usar checkin original
              normalizedNewCheckout || newCheckoutDate, // Usar novo checkout
              reservation.id // Excluir a reserva atual da verificação
            );

            if (!availabilityCheck.available) {
              console.warn("❌ Disponibilidade não confirmada para extensão:", availabilityCheck.reason);
              
              // Mensagem mais específica para extensões
              if (availabilityCheck.conflictingReservation) {
                const conflict = availabilityCheck.conflictingReservation;
                const conflictGuest = conflict.guest_name || conflict.reservation_code || "outro hóspede";
                toast.error(
                  `❌ Não é possível estender a reserva. O quarto já está reservado para ${conflictGuest} no período de ${format(parseISO(conflict.checkin_date), "dd/MM/yyyy", { locale: ptBR })} a ${format(parseISO(conflict.checkout_date), "dd/MM/yyyy", { locale: ptBR })}.`,
                  { duration: 6000 }
                );
              } else {
                toast.error(availabilityCheck.reason || "❌ Quarto não está disponível para o período de extensão solicitado");
              }
              setSavingDates(false);
              return;
            }
            
            console.log("✅ Disponibilidade confirmada para extensão de reserva");
            toast.success(`✅ Extensão de ${additionalNights} noite(s) disponível! A reserva pode ser estendida até ${format(parseISO(normalizedNewCheckout!), "dd/MM/yyyy", { locale: ptBR })}.`, { duration: 4000 });
          } catch (error: any) {
            console.error("Erro ao validar disponibilidade para extensão:", error);
            toast.error("❌ Erro ao verificar disponibilidade para extensão. Tente novamente.");
            setSavingDates(false);
            return;
          }
        } else {
          // Mudança de período (não é extensão) - validar disponibilidade normalmente
          const roomIdToCheck = reservation.room_id;
          
          if (roomIdToCheck) {
            // Verificar se o quarto está interditado
            const { data: roomCheck, error: roomError } = await supabase
              .from("rooms")
              .select("is_blocked, room_number, name")
              .eq("id", roomIdToCheck)
              .single();
            
            if (roomError) {
              console.error("Erro ao verificar quarto:", roomError);
              toast.error("Erro ao verificar disponibilidade do quarto");
              setSavingDates(false);
              return;
            }
            
            if (roomCheck?.is_blocked === true) {
              toast.error(`O quarto ${roomCheck.room_number || roomCheck.name || ""} está interditado e não pode receber reservas`);
              setSavingDates(false);
              return;
            }
            
            // Validar disponibilidade do quarto específico
            try {
              const availabilityCheck = await validateRoomAvailability(
                roomIdToCheck,
                normalizedNewCheckin || newCheckinDate,
                normalizedNewCheckout || newCheckoutDate,
                reservation.id // Excluir a reserva atual da verificação
              );

              if (!availabilityCheck.available) {
                console.warn("❌ Disponibilidade não confirmada:", availabilityCheck.reason);
                toast.error(availabilityCheck.reason || "Quarto não está disponível neste período");
                setSavingDates(false);
                return;
              }
              
              console.log("✅ Disponibilidade confirmada para o quarto");
            } catch (error: any) {
              console.error("Erro ao validar disponibilidade do quarto:", error);
              toast.error("Erro ao verificar disponibilidade. Tente novamente.");
              setSavingDates(false);
              return;
            }
          } else if (reservation.category_id) {
            // Validar disponibilidade por categoria (sem quarto específico)
            try {
              const categoryAvailability = await validateCategoryAvailability(
                reservation.category_id,
                normalizedNewCheckin || newCheckinDate,
                normalizedNewCheckout || newCheckoutDate,
                reservation.id // Excluir a reserva atual da verificação
              );

              if (!categoryAvailability.available) {
                console.warn("❌ Disponibilidade não confirmada na categoria:", categoryAvailability.reason);
                toast.error(categoryAvailability.reason || "Nenhum quarto disponível neste período");
                setSavingDates(false);
                return;
              }
              
              console.log("✅ Disponibilidade confirmada na categoria");
            } catch (error: any) {
              console.error("Erro ao validar disponibilidade da categoria:", error);
              toast.error("Erro ao verificar disponibilidade. Tente novamente.");
              setSavingDates(false);
              return;
            }
          }
        }
      }
      
      // Se todas as validações passaram, atualizar a reserva
      await updateReservation({
        id: reservation.id,
        checkin_date: newCheckinDate,
        checkout_date: newCheckoutDate,
        checkin_time: editCheckinTime || null,
        checkout_time: editCheckoutTime || null,
        total_amount: totalAmount,
      });

      // Registrar log de alteração de datas
      try {
        const datesChanged = oldCheckinDate !== newCheckinDate || oldCheckoutDate !== newCheckoutDate;
        const amountChanged = oldTotalAmount !== totalAmount;
        
        if (datesChanged || amountChanged) {
          const actionType = datesChanged && amountChanged ? "updated" : datesChanged ? "dates_changed" : "amount_changed";
          
          let description = `Reserva ${reservation.reservation_code} `;
          if (datesChanged) {
            description += `datas alteradas de ${format(parseISO(oldCheckinDate), "dd/MM/yyyy", { locale: ptBR })} - ${format(parseISO(oldCheckoutDate), "dd/MM/yyyy", { locale: ptBR })} para ${format(editCheckinDate, "dd/MM/yyyy", { locale: ptBR })} - ${format(editCheckoutDate, "dd/MM/yyyy", { locale: ptBR })}`;
            if (amountChanged) {
              description += `. Valor alterado de R$ ${oldTotalAmount.toFixed(2).replace(".", ",")} para R$ ${totalAmount.toFixed(2).replace(".", ",")}`;
            }
          } else if (amountChanged) {
            description += `valor alterado de R$ ${oldTotalAmount.toFixed(2).replace(".", ",")} para R$ ${totalAmount.toFixed(2).replace(".", ",")}`;
          }
          
          await logActivity({
            actionType: actionType as any,
            entityType: "reservation",
            entityId: reservation.id,
            entityCode: reservation.reservation_code,
            description,
            oldValues: {
              checkin_date: oldCheckinDate,
              checkout_date: oldCheckoutDate,
              total_amount: oldTotalAmount,
            },
            newValues: {
              checkin_date: newCheckinDate,
              checkout_date: newCheckoutDate,
              total_amount: totalAmount,
            },
          });
        }
      } catch (logError) {
        console.error("Erro ao registrar log de alteração:", logError);
        // Não bloquear a atualização se o log falhar
      }

      toast.success("Datas e valores atualizados com sucesso!");
      setIsEditingDates(false);
      refetch();
    } catch (error: any) {
      console.error("Erro ao salvar alterações:", error);
      toast.error(error.message || "Erro ao salvar alterações");
    } finally {
      setSavingDates(false);
    }
  };

  // Função para salvar número de hóspedes
  const handleSaveGuestCount = async () => {
    if (!reservation?.id) return;

    try {
      setSavingGuestCount(true);
      
      const oldAdults = reservation.adults || 0;
      const oldChildren = reservation.children || 0;

      // Atualizar a reserva
      await updateReservation({
        id: reservation.id,
        adults: editAdults,
        children: editChildren,
      });

      // Registrar log de alteração
      try {
        if (oldAdults !== editAdults || oldChildren !== editChildren) {
          await logActivity({
            actionType: "updated",
            entityType: "reservation",
            entityId: reservation.id,
            entityCode: reservation.reservation_code,
            description: `Número de hóspedes da reserva ${reservation.reservation_code} atualizado: ${oldAdults} adultos, ${oldChildren} crianças → ${editAdults} adultos, ${editChildren} crianças`,
            metadata: {
              old_adults: oldAdults,
              old_children: oldChildren,
              new_adults: editAdults,
              new_children: editChildren,
            },
          });
        }
      } catch (logError) {
        console.error("Erro ao registrar log:", logError);
      }

      toast.success("Número de hóspedes atualizado com sucesso!");
      setIsEditingGuestCount(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["reservation", reservationCode] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    } catch (error: any) {
      console.error("Erro ao salvar número de hóspedes:", error);
      toast.error(error.message || "Erro ao salvar número de hóspedes");
    } finally {
      setSavingGuestCount(false);
    }
  };

  // Função para salvar observações
  const handleSaveNotes = async () => {
    if (!reservation?.id) return;

    try {
      setSavingNotes(true);
      
      const oldNotes = reservation.notes || null;
      const newNotes = editNotes.trim() || null;

      // Atualizar a reserva
      await updateReservation({
        id: reservation.id,
        notes: newNotes,
      });

      // Registrar log de alteração
      try {
        if (oldNotes !== newNotes) {
          await logActivity({
            actionType: "updated",
            entityType: "reservation",
            entityId: reservation.id,
            entityCode: reservation.reservation_code,
            description: `Observações da reserva ${reservation.reservation_code} atualizadas`,
            oldValues: {
              notes: oldNotes,
            },
            newValues: {
              notes: newNotes,
            },
          });
        }
      } catch (logError) {
        console.error("Erro ao registrar log de alteração:", logError);
      }

      toast.success("Observações atualizadas com sucesso!");
      setIsEditingNotes(false);
      refetch();
    } catch (error: any) {
      console.error("Erro ao salvar observações:", error);
      toast.error(error.message || "Erro ao salvar observações");
    } finally {
      setSavingNotes(false);
    }
  };

  const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pendente", variant: "secondary" },
    confirmed: { label: "Confirmada", variant: "default" },
    checkedin: { label: "Check-in Realizado", variant: "default" },
    checkedout: { label: "Check-out Realizado", variant: "outline" },
    cancelled: { label: "Cancelada", variant: "destructive" },
    noshow: { label: "No-show", variant: "destructive" },
    blocked: { label: "Bloqueado", variant: "secondary" },
    preregistration: { label: "Pré-reserva", variant: "secondary" },
  };

  const handleConfirmCancel = async (reason: string, refundPayments: boolean) => {
    if (!reservation?.id) return;

    try {
      await cancelReservation({ id: reservation.id, reason, refundPayments });
      setCancelDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao cancelar reserva");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <XCircle className="h-12 w-12 text-destructive mb-4" />
        <h2 className="text-2xl font-bold mb-2">Reserva não encontrada</h2>
        <Button onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  const status = statusConfig[reservation.status] || statusConfig.pending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Premium Header with Breadcrumb */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
              className="h-8 px-2 text-slate-600 hover:text-slate-900"
          >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Reservas
          </Button>
            <span className="text-slate-400">/</span>
            <span className="font-medium text-slate-900">
              {reservation.identification_number ? `#${reservation.identification_number}` : reservation.reservation_code}
            </span>
          </div>
          <div className="flex items-start justify-between">
          <div>
              <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-2">
                Detalhes da Reserva
              </h1>
              <div className="flex items-center gap-3">
                <p className="text-lg text-slate-600">
                  {reservation.reservation_code}
                </p>
                {reservation.identification_number && (
                  <span className="text-sm font-mono text-slate-500 bg-slate-100 px-2 py-1 rounded">
                    ID: #{reservation.identification_number}
                  </span>
                )}
              </div>
          </div>
            <Badge 
              variant={status.variant}
              className="px-4 py-1.5 text-sm font-semibold rounded-full shadow-sm"
            >
              {status.label}
            </Badge>
        </div>
      </div>

        {/* Premium Steps Navigation */}
        <Card className="p-6 rounded-2xl shadow-sm border-0 bg-white/80 backdrop-blur-sm mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
              <div className={`flex items-center gap-3 ${currentStep >= 1 ? 'text-blue-600' : 'text-slate-400'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${currentStep >= 1 ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                  {currentStep > 1 ? <CheckCircle2 className="h-5 w-5" /> : <span className="font-semibold">1</span>}
              </div>
                <span className="font-semibold">Informações</span>
            </div>
              <div className="flex-1 h-0.5 bg-slate-200 mx-4" />
              <div className={`flex items-center gap-3 ${currentStep >= 2 ? 'text-blue-600' : 'text-slate-400'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${currentStep >= 2 ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                  {currentStep > 2 ? <CheckCircle2 className="h-5 w-5" /> : <span className="font-semibold">2</span>}
                </div>
                <span className="font-semibold">Pagamentos & Taxas</span>
              </div>
              <div className="flex-1 h-0.5 bg-slate-200 mx-4" />
              <div className={`flex items-center gap-3 ${currentStep >= 3 ? 'text-blue-600' : 'text-slate-400'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${currentStep >= 3 ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                  {currentStep > 3 ? <CheckCircle2 className="h-5 w-5" /> : <span className="font-semibold">3</span>}
              </div>
                <span className="font-semibold">Ações</span>
            </div>
              <div className="flex-1 h-0.5 bg-slate-200 mx-4" />
              <div className={`flex items-center gap-3 ${currentStep >= 4 ? 'text-blue-600' : 'text-slate-400'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${currentStep >= 4 ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-400'}`}>
                  <span className="font-semibold">4</span>
                </div>
                <span className="font-semibold">Logs</span>
              </div>
          </div>
        </div>
      </Card>

      {/* Step 1: Informações */}
      {currentStep === 1 && (
        <div className="space-y-6">
          {/* Alerta de Reserva Cancelada */}
          {reservation.status === "cancelled" && (
            <Card className="p-4 bg-red-50 border-red-200">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-900 mb-2">Reserva Cancelada</h3>
                  <div className="space-y-1 text-sm text-red-800">
                    {reservation.cancelled_at && (() => {
                      const cancelledDate = parseISO(reservation.cancelled_at);
                      return isValid(cancelledDate) ? (
                        <div>
                          <span className="font-medium">Cancelada em: </span>
                          {format(cancelledDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </div>
                      ) : null;
                    })()}
                    {reservation.cancelled_by_user && (
                      <div>
                        <span className="font-medium">Cancelada por: </span>
                        {reservation.cancelled_by_user.full_name || reservation.cancelled_by_user.email || "Usuário desconhecido"}
                      </div>
                    )}
                    {reservation.cancellation_reason && (
                      <div className="mt-2 pt-2 border-t border-red-200">
                        <span className="font-medium">Motivo: </span>
                        <span>{reservation.cancellation_reason}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Premium Guest Card */}
          <Card className="p-8 rounded-2xl shadow-sm border-0 bg-white/80 backdrop-blur-sm mb-6">
            <div className="flex items-start gap-6">
              {/* Avatar Placeholder */}
              <div className="flex-shrink-0">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg">
                  <User className="h-10 w-10 text-white" />
                    </div>
                      </div>
              
              {/* Guest Info */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <User className="h-5 w-5 text-slate-400" />
                  <h2 className="text-xl font-semibold text-slate-900">Dados do Hóspede</h2>
                      </div>
                <h3 className="text-2xl font-bold text-slate-900 mb-4 mt-2">
                  {reservation.guest?.full_name || reservation.financial_responsible?.full_name || "N/A"}
                </h3>
                <div className="space-y-2">
                  {reservation.guest?.email || reservation.financial_responsible?.email ? (
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="text-sm">{reservation.guest?.email || reservation.financial_responsible?.email}</span>
                      </div>
                  ) : null}
                  {reservation.guest?.phone || reservation.financial_responsible?.phone ? (
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="text-sm">{reservation.guest?.phone || reservation.financial_responsible?.phone}</span>
                  </div>
                  ) : null}
                  {reservation.guest?.document_number || reservation.financial_responsible?.document_number ? (
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="text-sm">
                        {reservation.guest?.document_type || reservation.financial_responsible?.document_type}: {reservation.guest?.document_number || reservation.financial_responsible?.document_number}
                      </span>
                </div>
                  ) : null}
              </div>
              </div>
            </div>
          </Card>

          {/* Premium Reservation Details Card with Timeline */}
          <Card className="p-8 rounded-2xl shadow-sm border-0 bg-white/80 backdrop-blur-sm mb-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <CalendarIconLucide className="h-5 w-5 text-blue-600" />
                      </div>
                <h2 className="text-xl font-semibold text-slate-900">Detalhes da Reserva</h2>
                        </div>
              <div className="flex items-center gap-2">
                {activityLogs && activityLogs.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setLogsDialogOpen(true)}
                    className="gap-2 rounded-lg border-slate-200 hover:bg-slate-50"
                  >
                    <Activity className="h-4 w-4" />
                    Ver Logs ({activityLogs.length})
                  </Button>
                      )}
                {reservation?.web_checkin && 
                 (reservation.web_checkin.status === "completed" || reservation.status === "checkedin") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setWebCheckinDialogOpen(true)}
                    className="gap-2 rounded-lg border-slate-200 hover:bg-slate-50"
                  >
                    <EyeIcon className="h-4 w-4" />
                    Ver Check-in
                  </Button>
                )}
                {reservation && 
                 reservation.status !== "checkedin" && 
                 reservation.status !== "checkedout" && 
                 reservation.status !== "cancelled" && 
                 !(reservation.web_checkin && reservation.web_checkin.status === "completed") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setManualCheckinDialogOpen(true)}
                    className="gap-2 rounded-lg border-green-200 hover:bg-green-50 text-green-700"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Check-in Manual
                  </Button>
                      )}
                    </div>
                  </div>
            
            {/* Visual Timeline */}
            <div className="mb-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
              <div className="flex items-center justify-between">
                {/* Check-in */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center shadow-lg mb-3">
                    <CalendarIconLucide className="h-6 w-6 text-white" />
                </div>
                  <div className="text-center">
                    <div className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">Check-in</div>
                    <div className="text-lg font-bold text-slate-900">
                      {format(parseISO(reservation.checkin_date), "dd MMM", { locale: ptBR }).toUpperCase()}
            </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {reservation.checkin_time ? reservation.checkin_time.substring(0, 5) : "14:00"}
                    </div>
                  </div>
                </div>

                {/* Timeline Line */}
                <div className="flex-1 mx-4 relative">
                  <div className="h-0.5 bg-gradient-to-r from-blue-400 to-indigo-400"></div>
                  <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                    <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow"></div>
                  </div>
                </div>
                
                {/* Check-out */}
                <div className="flex-1 flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center shadow-lg mb-3">
                    <CalendarIconLucide className="h-6 w-6 text-white" />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-1">Check-out</div>
                    <div className="text-lg font-bold text-slate-900">
                      {format(parseISO(reservation.checkout_date), "dd MMM", { locale: ptBR }).toUpperCase()}
                    </div>
                    <div className="text-sm text-slate-600 mt-1">
                      {reservation.checkout_time ? reservation.checkout_time.substring(0, 5) : "12:00"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Minimalist Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column */}
              <div className="space-y-6">
                {/* Localizador */}
                <div className="pb-6 border-b border-slate-100">
                  <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                    Localizador
                  </Label>
                  <div className="flex items-center gap-3">
                    <div className="font-mono text-xl font-semibold text-slate-900 tracking-tight">
                      {reservation.reservation_code}
                    </div>
                <Button
                      variant="ghost"
                  size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(reservation.reservation_code);
                          setCopied(true);
                          toast.success("Localizador copiado!");
                          setTimeout(() => setCopied(false), 2000);
                        } catch (error) {
                          toast.error("Erro ao copiar localizador");
                        }
                      }}
                      className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                      title="Copiar localizador"
                >
                      {copied ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                </Button>
            </div>
                </div>

                {/* Unidade / Categoria */}
                <div className="pb-6 border-b border-slate-100">
                  <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                    Unidade / Categoria
                  </Label>
                  <div className="text-base font-medium text-slate-900">
                    {reservation.rooms?.room_number || reservation.rooms?.name || "N/A"} - {reservation.room_categories?.name || "N/A"}
                  </div>
                </div>

                {/* Check-in e Check-out lado a lado */}
                <div className="pb-6 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Datas de Estadia
                    </Label>
                    {!isEditingDates && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsEditingDates(true)}
                        className="h-7 px-2 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                      >
                        <Edit2 className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                    )}
                  </div>
                  {isEditingDates ? (
                    <div className="grid grid-cols-2 gap-4">
                      {/* Check-in */}
                      <div className="space-y-3">
                        <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider block">
                          Check-in
                        </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                                "w-full justify-start text-left font-normal bg-white border-slate-200 hover:bg-slate-50",
                                !editCheckinDate && "text-slate-400"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {editCheckinDate ? (
                              format(editCheckinDate, "dd/MM/yyyy", { locale: ptBR })
                            ) : (
                              <span>Selecione a data</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={editCheckinDate}
                            onSelect={(date) => {
                              if (date) {
                                setEditCheckinDate(date);
                                if (editCheckoutDate && date >= editCheckoutDate) {
                                  setEditCheckoutDate(addDays(date, 1));
                                }
                              }
                            }}
                            disabled={(date) => date < new Date()}
                            initialFocus
                            defaultMonth={editCheckinDate || (reservation?.checkin_date ? parseISO(reservation.checkin_date) : new Date())}
                          />
                        </PopoverContent>
                      </Popover>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={editCheckinTime}
                          onChange={(e) => setEditCheckinTime(e.target.value)}
                            className="flex-1 bg-white border-slate-200"
                        />
                          <Clock className="h-4 w-4 text-slate-400" />
                      </div>
                    </div>
                      {/* Check-out */}
                      <div className="space-y-3">
                        <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider block">
                          Check-out
                        </Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                                "w-full justify-start text-left font-normal bg-white border-slate-200 hover:bg-slate-50",
                                !editCheckoutDate && "text-slate-400"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {editCheckoutDate ? (
                              format(editCheckoutDate, "dd/MM/yyyy", { locale: ptBR })
                            ) : (
                              <span>Selecione a data</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={editCheckoutDate}
                            onSelect={(date) => {
                              if (date && editCheckinDate && date > editCheckinDate) {
                                setEditCheckoutDate(date);
                              } else if (date) {
                                toast.error("A data de check-out deve ser posterior à data de check-in");
                              }
                            }}
                            disabled={(date) => {
                              if (editCheckinDate) {
                                return date <= editCheckinDate;
                              }
                              return date < new Date();
                            }}
                            initialFocus
                            defaultMonth={editCheckoutDate || (reservation?.checkout_date ? parseISO(reservation.checkout_date) : new Date())}
                          />
                        </PopoverContent>
                      </Popover>
                      <div className="flex items-center gap-2">
                        <Input
                          type="time"
                          value={editCheckoutTime}
                          onChange={(e) => setEditCheckoutTime(e.target.value)}
                            className="flex-1 bg-white border-slate-200"
                        />
                          <Clock className="h-4 w-4 text-slate-400" />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      {/* Check-in */}
                      <div>
                        <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                          Check-in
                        </Label>
                        <div className="text-lg font-semibold text-slate-900">
                          {format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale: ptBR })}
                        </div>
                        {reservation.checkin_time && (
                          <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {reservation.checkin_time.substring(0, 5)}
                    </div>
                  )}
                </div>
                      {/* Check-out */}
                <div>
                        <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                          Check-out
                        </Label>
                        <div className="text-lg font-semibold text-slate-900">
                          {format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale: ptBR })}
                  </div>
                        {reservation.checkout_time && (
                          <div className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {reservation.checkout_time.substring(0, 5)}
                </div>
                        )}
              </div>
                  </div>
                  )}
                </div>

                {/* Número de Diárias */}
                <div>
                  <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                    Número de Diárias
                  </Label>
                  <div className="text-lg font-semibold text-slate-900">
                    {numberOfNights} {numberOfNights === 1 ? 'diária' : 'diárias'}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Quantidade de Hóspedes */}
                <div className="pb-6 border-b border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-slate-400" />
                      <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Quantidade de Hóspedes
                      </Label>
                      {guestCount.fromWebCheckin && (
                        <Badge variant="outline" className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border-blue-200">
                          Web Check-in
                        </Badge>
                      )}
                    </div>
                    {!guestCount.fromWebCheckin && !isEditingGuestCount && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        onClick={() => {
                          setEditAdults(reservation?.adults || 0);
                          setEditChildren(reservation?.children || 0);
                          setIsEditingGuestCount(true);
                        }}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                        Editar
                      </Button>
                    )}
                  </div>
                  {isEditingGuestCount ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="editAdults" className="text-xs text-slate-600 mb-1 block">
                            Adultos
                          </Label>
                          <Input
                            id="editAdults"
                            type="number"
                            min="0"
                            value={editAdults}
                            onChange={(e) => setEditAdults(parseInt(e.target.value) || 0)}
                            className="text-sm"
                          />
                        </div>
                        <div>
                          <Label htmlFor="editChildren" className="text-xs text-slate-600 mb-1 block">
                            Crianças
                          </Label>
                          <Input
                            id="editChildren"
                            type="number"
                            min="0"
                            value={editChildren}
                            onChange={(e) => setEditChildren(parseInt(e.target.value) || 0)}
                            className="text-sm"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setIsEditingGuestCount(false);
                            setEditAdults(reservation?.adults || 0);
                            setEditChildren(reservation?.children || 0);
                          }}
                          disabled={savingGuestCount}
                          className="text-slate-600 hover:text-slate-900"
                        >
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveGuestCount}
                          disabled={savingGuestCount}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          {savingGuestCount ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              Salvando...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4 mr-2" />
                              Salvar
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="text-base font-medium text-slate-900">
                        {guestCount.adults} {guestCount.adults === 1 ? 'adulto' : 'adultos'}
                        {guestCount.children > 0 ? `, ${guestCount.children} ${guestCount.children === 1 ? 'criança' : 'crianças'}` : ""}
                      </div>
                      {guestCount.fromWebCheckin && (
                        <div className="text-xs text-slate-500 mt-1">
                          Total: {guestCount.total} {guestCount.total === 1 ? 'hóspede' : 'hóspedes'} cadastrado{guestCount.total === 1 ? '' : 's'} no check-in web
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Reserva Criada em */}
                <div className="pb-6 border-b border-slate-100">
                  <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                    Reserva Criada em
                  </Label>
                  <div className="text-base font-medium text-slate-700">
                    {reservation.created_at 
                      ? format(parseISO(reservation.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : "Data não disponível"}
                  </div>
                </div>

                {/* Origem / Canal */}
                {(reservation.origin || reservation.channel) && (
                  <div className="pb-6 border-b border-slate-100">
                    <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                      Origem / Canal
                    </Label>
                    <div className="text-base font-medium text-slate-900">
                      {reservation.origin || reservation.channel || "Direto"}
                    </div>
                  </div>
                )}

                {/* Plano de Tarifa */}
                <div className="pb-6 border-b border-slate-100">
                  <Label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">
                    Plano de Tarifa
                  </Label>
                  <div className="text-base font-medium text-slate-900">
                    {(() => {
                      const plan = reservation.pricing_plans;
                      if (!plan) return "Padrão";
                      if (Array.isArray(plan)) {
                        return plan[0]?.name || "Padrão";
                      }
                      return plan?.name || "Padrão";
                    })()}
                  </div>
                </div>

                {/* Observações */}
                <Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40 shadow-sm">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <Label className="text-xs font-medium text-amber-700 dark:text-amber-300 uppercase tracking-wider">
                          Observações
                        </Label>
                      </div>
                      {!isEditingNotes && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 gap-1.5 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                          onClick={() => {
                            setEditNotes(reservation.notes || "");
                            setIsEditingNotes(true);
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          Editar
                        </Button>
                      )}
                    </div>
                    {isEditingNotes ? (
                      <div className="space-y-3">
                        <Textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Digite as observações da reserva..."
                          rows={4}
                          className="text-sm bg-white dark:bg-slate-900 border-amber-300 dark:border-amber-700 focus:border-amber-400 dark:focus:border-amber-600"
                        />
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setIsEditingNotes(false);
                              setEditNotes("");
                            }}
                            disabled={savingNotes}
                            className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            onClick={handleSaveNotes}
                            disabled={savingNotes}
                            className="bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white"
                          >
                            {savingNotes ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Salvando...
                              </>
                            ) : (
                              "Salvar"
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed min-h-[60px] bg-white/60 dark:bg-slate-800/40 rounded-md p-3 border border-amber-200/40 dark:border-amber-800/30">
                        {reservation.notes ? (
                          <div className="whitespace-pre-wrap">{reservation.notes}</div>
                        ) : (
                          <span className="text-muted-foreground italic">Nenhuma observação cadastrada</span>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            </div>
            
            {/* Botões de ação para edição de datas */}
            {isEditingDates && (
              <div className="mt-6 pt-4 border-t space-y-4">
                <div>
                  <Label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Valor Total da Reserva
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={editTotalAmount}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^\d,.-]/g, "");
                        setEditTotalAmount(value);
                      }}
                      placeholder="0,00"
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleRecalculatePrice(true, true)}
                      disabled={isRecalculating || !editCheckinDate || !editCheckoutDate}
                      className="gap-2"
                    >
                      {isRecalculating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Calculando...
                        </>
                      ) : (
                        <>
                          <DollarSign className="h-4 w-4" />
                          Recalcular
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Clique em "Recalcular" para atualizar o valor baseado no tarifário, ou edite manualmente
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditingDates(false);
                      // Restaurar valores originais
                      if (reservation) {
                        if (reservation.checkin_date) {
                          setEditCheckinDate(parseISO(reservation.checkin_date));
                        }
                        if (reservation.checkout_date) {
                          setEditCheckoutDate(parseISO(reservation.checkout_date));
                        }
                        setEditCheckinTime(reservation.checkin_time || "15:00");
                        setEditCheckoutTime(reservation.checkout_time || "12:00");
                        setEditTotalAmount(reservation.total_amount?.toString() || "0");
                      }
                    }}
                    disabled={savingDates}
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleSaveDates}
                    disabled={savingDates || !editCheckinDate || !editCheckoutDate}
                    className="gap-2"
                  >
                    {savingDates ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Salvar Alterações
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Premium Financial Summary Card */}
          <Card className="p-8 rounded-2xl shadow-sm border-0 bg-white/80 backdrop-blur-sm mb-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <h2 className="text-xl font-semibold text-slate-900">Resumo Financeiro</h2>
              {(() => {
                // Verificar se há valor pendente baseado no cálculo real, não apenas no payment_status
                // Isso garante que mesmo se payment_status não estiver atualizado, a UI mostra corretamente
                const paidAmount = Number(reservation.paid_amount || 0);
                const remainingAmount = Math.max(0, totalWithFees - paidAmount);
                const hasPendingAmount = remainingAmount > 0;
                
                // Mostrar badge apenas se realmente houver valor pendente
                return hasPendingAmount ? (
                  <Badge className="ml-auto px-3 py-1 bg-amber-100 text-amber-800 border-0 rounded-full font-medium">
                    Pagamento Pendente
                  </Badge>
                ) : paidAmount >= totalWithFees && totalWithFees > 0 ? (
                  <Badge className="ml-auto px-3 py-1 bg-green-100 text-green-800 border-0 rounded-full font-medium">
                    Pagamento Completo
                  </Badge>
                ) : null;
              })()}
            </div>
            <div className="grid grid-cols-3 gap-6 mb-6">
              <div className="p-6 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
                <Label className="text-sm font-medium text-slate-600 mb-2 block">Valor Total</Label>
                <div className="text-3xl font-bold text-blue-700">
                  {formatCurrency(totalWithFees)}
                </div>
              </div>
              <div className="p-6 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200">
                <Label className="text-sm font-medium text-slate-600 mb-2 block">Valor Pago</Label>
                <div className="text-3xl font-bold text-emerald-700">
                  {formatCurrency(reservation.paid_amount || 0)}
                </div>
              </div>
              <div className="p-6 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200">
                <Label className="text-sm font-medium text-slate-600 mb-2 block">Valor Restante</Label>
                <div className="text-3xl font-bold text-amber-700">
                  {formatCurrency(Math.max(0, totalWithFees - (reservation.paid_amount || 0)))}
                </div>
              </div>
            </div>
            
            {/* Cupom de Desconto Aplicado */}
            {reservation?.discount_coupons && typeof reservation.discount_coupons === 'object' && !Array.isArray(reservation.discount_coupons) && (() => {
              const coupon = reservation.discount_coupons as any;
              const baseTotal = Number(reservation?.total_amount || 0);
              const feesTotal = reservationServiceFees.reduce((sum: number, fee: any) => {
                return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
              }, 0);
              
              // Calcular valor original antes do desconto
              let originalAmount = baseTotal;
              let discountAmount = 0;
              
              if (coupon.discount_type === 'fixed') {
                // Desconto fixo: valor original = valor atual + desconto
                originalAmount = baseTotal + Number(coupon.discount_value || 0);
                discountAmount = Number(coupon.discount_value || 0);
              } else if (coupon.discount_type === 'percentage') {
                // Desconto percentual: valor original = valor atual / (1 - percentual/100)
                const discountPercent = Number(coupon.discount_value || 0) / 100;
                if (coupon.apply_to === 'total') {
                  originalAmount = baseTotal / (1 - discountPercent);
                  discountAmount = originalAmount - baseTotal;
                } else {
                  // Se aplicado nas diárias, calcular baseado nas noites
                  const nights = reservation?.checkin_date && reservation?.checkout_date
                    ? differenceInDays(parseISO(reservation.checkout_date), parseISO(reservation.checkin_date))
                    : 0;
                  if (nights > 0) {
                    const pricePerNight = baseTotal / nights;
                    const originalPricePerNight = pricePerNight / (1 - discountPercent);
                    originalAmount = originalPricePerNight * nights;
                    discountAmount = originalAmount - baseTotal;
                  }
                }
              }
              
              const originalTotalWithFees = originalAmount + feesTotal;
              
              return (
                <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-purple-50 to-purple-100/50 border border-purple-200">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-200 flex items-center justify-center">
                      <Tag className="h-4 w-4 text-purple-700" />
                    </div>
                    <div className="flex-1">
                      <Label className="text-sm font-semibold text-purple-900">
                        Cupom de Desconto Aplicado
                      </Label>
                      <div className="text-xs text-purple-700 mt-0.5">
                        {coupon.name} ({coupon.code})
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-purple-700 mb-1 block">
                        Valor Original
                      </Label>
                      <div className="text-lg font-semibold text-purple-900 line-through">
                        {formatCurrency(originalTotalWithFees)}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-purple-700 mb-1 block">
                        Desconto Aplicado
                      </Label>
                      <div className="text-lg font-semibold text-purple-900">
                        - {formatCurrency(discountAmount)}
                        {coupon.discount_type === 'percentage' && (
                          <span className="text-sm ml-1">({coupon.discount_value}%)</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </Card>

          {/* Botão de Efetivar Pré-reserva - apenas se for pré-reserva */}
          {reservation.status === "preregistration" && (
            <Card className="p-6 bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-purple-900 mb-1">Pré-reserva</h3>
                  <p className="text-sm text-purple-700">
                    Esta é uma pré-reserva. Efetive para convertê-la em uma reserva confirmada.
                  </p>
                </div>
                <Button
                  onClick={async () => {
                    try {
                      await confirmPreregistration(reservation.id);
                      refetch();
                    } catch (error) {
                      // Erro já tratado no hook
                    }
                  }}
                  className="gap-2 px-6 py-6 h-auto rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  Efetivar Pré-reserva
                </Button>
              </div>
            </Card>
          )}

          {/* Premium Navigation Button */}
          <div className="flex justify-end pt-4">
            <Button 
              onClick={() => setCurrentStep(2)} 
              className="gap-2 px-8 py-6 h-auto rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Próximo
              <ArrowRight className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Pagamentos & Taxas */}
      {currentStep === 2 && (
        <div className="space-y-6">
          {/* Lançar Pagamento */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Pagamentos
              </h2>
              <Button
                onClick={() => setPaymentModalOpen(true)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Lançar Pagamento
              </Button>
            </div>
            {/* Lista de pagamentos */}
            {payments && payments.length > 0 ? (
              <div className="space-y-2">
                {payments.map((payment: any, index: number) => (
                  <div
                    key={payment.id || `payment-${index}`}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors group"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-sm">
                        {payment.payment_carriers?.description || payment.payment_carriers?.code || "Sem portador"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {payment.payment_types?.name || payment.payment_method} - 
                        {payment.payment_date ? (() => {
                          const paymentDate = parseISO(payment.payment_date);
                          return isValid(paymentDate) ? format(paymentDate, "dd/MM/yyyy", { locale: ptBR }) : "Data inválida";
                        })() : "Data não informada"}
                      </div>
                      {payment.notes && (
                        <div className="text-xs text-slate-600 mt-1 italic">
                          📝 {payment.notes}
                    </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                    <div className="text-right min-w-[100px]">
                      <div className="font-semibold">
                        {formatCurrency(payment.amount || 0)}
                      </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPaymentToEditNotes(payment);
                          setPaymentNotes(payment.notes || "");
                          setEditPaymentNotesDialogOpen(true);
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Editar observação"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!payment.id) {
                            toast.error("Erro: Pagamento sem ID válido");
                            console.error("Payment without ID:", payment);
                            return;
                          }
                          setPaymentToRefund(payment);
                          setRefundDialogOpen(true);
                        }}
                        disabled={!payment.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive disabled:opacity-50"
                        title={payment.id ? "Estornar pagamento" : "Pagamento sem ID válido"}
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-4">
                Nenhum pagamento lançado
              </div>
            )}
          </Card>

          {/* Taxas / Consumo */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Taxas / Consumo</h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">Taxas / Consumo</TableHead>
                  <TableHead className="w-[40%]">Observações</TableHead>
                  <TableHead className="w-[20%] text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {serviceFees
                .filter((fee: any) => fee.is_active)
                .map((fee: any) => {
                  const existingFee = reservationServiceFees.find(
                    (rsf: any) => rsf.service_fees?.id === fee.id || rsf.service_fee_id === fee.id
                  );
                  const feeAmount = existingFee 
                    ? Number(existingFee.amount || 0) * Number(existingFee.quantity || 1)
                    : 0;
                    
                    // Verificar se a taxa foi paga
                    // O paymentBreakdown usa o ID da reservation_service_fees (existingFee.id)
                    const feeId = existingFee?.id;
                    // Se não houver ID ou não estiver no breakdown, considerar como pendente (valor total)
                    const feePending = feeId && paymentBreakdown.serviceFeesPending.hasOwnProperty(feeId) 
                      ? paymentBreakdown.serviceFeesPending[feeId] 
                      : feeAmount; // Se não estiver no breakdown, está totalmente pendente
                    // Uma taxa só está paga se feePending === 0 E houver pagamentos registrados
                    const isPaid = existingFee && feePending === 0 && feeAmount > 0 && payments && payments.length > 0;
                    const isPartiallyPaid = existingFee && feePending > 0 && feePending < feeAmount;

                  return (
                      <TableRow key={fee.id} className="group hover:bg-muted/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {!existingFee ? (
                              <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                                <Plus className="h-4 w-4 text-white" />
                              </div>
                            ) : (
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isPaid ? 'bg-green-100' : 'bg-slate-200'}`}>
                                <CheckCircle2 className={`h-4 w-4 ${isPaid ? 'text-green-600' : 'text-slate-400'}`} />
                              </div>
                            )}
                      <div className="flex-1">
                        <div className="font-medium text-sm">{fee.name}</div>
                        {existingFee && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                            Qtd: {existingFee.quantity} × {formatCurrency(existingFee.amount || 0)}
                          </div>
                        )}
                      </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {existingFee?.notes ? (
                            <span className="text-sm text-muted-foreground">{existingFee.notes}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground italic">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {existingFee && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedServiceFee(fee);
                                setEditingServiceFee({
                                  id: existingFee.id,
                                  amount: existingFee.amount || 0,
                                  quantity: existingFee.quantity || 1,
                                  notes: existingFee.notes,
                                });
                                setAddServiceFeeDialogOpen(true);
                              }}
                              title="Editar taxa"
                                  className="h-7 w-7 p-0"
                            >
                                  <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                if (confirm(`Remover a taxa "${fee.name}"?`)) {
                                  try {
                                    await removeServiceFee(existingFee.id);
                                  } catch (error) {
                                    console.error(error);
                                  }
                                }
                              }}
                              title="Remover taxa"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            >
                                  <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                            )}
                            <div className="flex flex-col items-end gap-1">
                              <div className="font-semibold">
                                {formatCurrency(feeAmount)}
                              </div>
                              {existingFee && feeAmount > 0 && (
                                <div className="text-xs">
                                  {isPaid ? (
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                      Pago
                                    </Badge>
                                  ) : isPartiallyPaid ? (
                                    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                                      Parcial
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                      Pendente
                                    </Badge>
                                  )}
                                </div>
                              )}
                              {!existingFee && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedServiceFee(fee);
                              setEditingServiceFee(null);
                              setAddServiceFeeDialogOpen(true);
                            }}
                            title="Adicionar taxa"
                                  className="h-7 px-2 text-xs"
                          >
                                  Adicionar
                          </Button>
                        )}
                      </div>
                    </div>
                        </TableCell>
                      </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Navegação */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button onClick={() => setCurrentStep(3)} className="gap-2">
              Próximo
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Ações */}
      {currentStep === 3 && (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Ações</h2>
            <div className="space-y-4">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => {
                  setEditDialogOpen(true);
                }}
              >
                <Edit2 className="h-4 w-4" />
                Editar Responsável e Hóspede
              </Button>
              {reservation.status === "preregistration" && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-primary hover:text-primary"
                  onClick={async () => {
                    try {
                      await confirmPreregistration(reservation.id);
                      refetch();
                    } catch (error) {
                      // Erro já tratado no hook
                    }
                  }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Efetivar Pré-reserva
                </Button>
              )}
              {!["checkedout", "cancelled"].includes(reservation.status) && canDelete("reservations") && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 text-destructive hover:text-destructive"
                  onClick={() => setCancelDialogOpen(true)}
                >
                  <Trash2 className="h-4 w-4" />
                  Cancelar Reserva
                </Button>
              )}
            </div>
          </Card>

          {/* Navegação */}
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setCurrentStep(2)} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button variant="outline" onClick={() => setCurrentStep(4)} className="gap-2">
              Próximo
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Logs */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Logs de Atividades
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTechnicalView(!showTechnicalView)}
                className="gap-2"
              >
                {showTechnicalView ? (
                  <>
                    <EyeIcon className="h-4 w-4" />
                    Visualização Simples
                  </>
                ) : (
                  <>
                    <Code className="h-4 w-4" />
                    Visualização Técnica
                  </>
                )}
              </Button>
            </div>
            
            {isLoadingLogs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum log de atividade encontrado para esta reserva.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activityLogs.map((log: ActivityLog) => (
                  <Card key={log.id} className="p-4 border-l-4 border-l-primary">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            className={actionTypeColors[log.action_type] || "bg-gray-100 text-gray-800"}
                          >
                            {actionTypeLabels[log.action_type] || log.action_type}
                          </Badge>
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <ClockIcon className="h-3 w-3" />
                            {(() => {
                              try {
                                const date = parseISO(log.created_at);
                                if (!isNaN(date.getTime())) {
                                  return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
                                }
                                return log.created_at;
                              } catch {
                                return log.created_at;
                              }
                            })()}
                          </span>
                        </div>
                        
                        <p className="text-sm font-medium">{log.description}</p>
                        
                        {/* Mostrar usuário ou hóspede que realizou a ação */}
                        {(log.user || log.metadata?.performed_by === "guest") && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>
                              {log.metadata?.performed_by === "guest" 
                                ? (log.metadata?.guest_name || log.new_values?.performed_by || "Hóspede")
                                : (log.user?.full_name || log.user?.email || "Usuário desconhecido")
                              }
                              {log.metadata?.performed_by === "guest" && (
                                <span className="ml-1 text-xs italic">(Check-in Web)</span>
                              )}
                            </span>
                          </div>
                        )}
                        
                        {/* Visualização Simples - Mostrar apenas mudanças importantes de forma amigável */}
                        {!showTechnicalView && (
                          <>
                            {/* Seção específica para logs de pagamento */}
                            {(log.action_type === "payment_added" || log.action_type === "payment_refunded" || log.action_type === "payment_updated") && (
                              <div className="mt-3 pt-3 border-t">
                                <div className="flex items-start gap-3">
                                  <div className={`p-2 rounded-lg ${log.action_type === "payment_refunded" ? "bg-red-50" : "bg-green-50"}`}>
                                    {log.action_type === "payment_refunded" ? (
                                      <RotateCcw className="h-4 w-4 text-red-600" />
                                    ) : (
                                      <DollarSign className="h-4 w-4 text-green-600" />
                                    )}
                                  </div>
                                  <div className="flex-1 space-y-2">
                                    {log.metadata?.total_amount && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-slate-900">
                                          {log.action_type === "payment_refunded" ? "Valor Estornado" : "Valor Pago"}
                                        </span>
                                        <span className={`text-sm font-bold ${log.action_type === "payment_refunded" ? "text-red-600" : "text-green-600"}`}>
                                          {formatCurrency(log.metadata.total_amount)}
                                        </span>
                                      </div>
                                    )}
                                    
                                    {log.metadata?.payment_method && (
                                      <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <CreditCard className="h-3 w-3" />
                                        <span>
                                          Método: {log.metadata.payment_method === "deposit" ? "Depósito" :
                                                   log.metadata.payment_method === "pix" ? "PIX" :
                                                   log.metadata.payment_method === "credit_card" ? "Cartão de Crédito" :
                                                   log.metadata.payment_method === "debit_card" ? "Cartão de Débito" :
                                                   log.metadata.payment_method}
                                        </span>
                                      </div>
                                    )}
                                    
                                    {log.metadata?.installments && log.metadata.installments > 1 && (
                                      <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <Receipt className="h-3 w-3" />
                                        <span>
                                          {log.metadata.installments} parcela(s)
                                        </span>
                                      </div>
                                    )}
                                    
                                    {log.metadata?.payment_date && (
                                      <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <CalendarIconLucide className="h-3 w-3" />
                                        <span>
                                          Data: {(() => {
                                            try {
                                              return format(parseISO(log.metadata.payment_date), "dd/MM/yyyy", { locale: ptBR });
                                            } catch {
                                              return log.metadata.payment_date;
                                            }
                                          })()}
                                        </span>
                                      </div>
                                    )}
                                    
                                    {log.old_values?.paid_amount !== undefined && log.new_values?.paid_amount !== undefined && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="text-slate-500">Valor pago:</span>
                                        <span className="text-red-600 line-through">{formatCurrency(log.old_values.paid_amount)}</span>
                                        <span>→</span>
                                        <span className="text-green-600 font-semibold">{formatCurrency(log.new_values.paid_amount)}</span>
                                      </div>
                                    )}
                                    
                                    {log.old_values?.payment_status && log.new_values?.payment_status && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="text-slate-500">Status:</span>
                                        <Badge variant="outline" className="text-xs">
                                          {log.old_values.payment_status === "pending" ? "Pendente" :
                                           log.old_values.payment_status === "paid" ? "Pago" :
                                           log.old_values.payment_status === "partial" ? "Parcial" : log.old_values.payment_status}
                                        </Badge>
                                        <span>→</span>
                                        <Badge variant="outline" className="text-xs">
                                          {log.new_values.payment_status === "pending" ? "Pendente" :
                                           log.new_values.payment_status === "paid" ? "Pago" :
                                           log.new_values.payment_status === "partial" ? "Parcial" : log.new_values.payment_status}
                                        </Badge>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Outras mudanças */}
                            {(log.old_values || log.new_values) && !(log.action_type === "payment_added" || log.action_type === "payment_refunded" || log.action_type === "payment_updated") && (
                              <div className="mt-3 pt-3 border-t space-y-2">
                                {(() => {
                                  const changes: string[] = [];
                                  
                                  // Verificar mudanças de status
                                  if (log.old_values?.status && log.new_values?.status && log.old_values.status !== log.new_values.status) {
                                    const statusLabels: Record<string, string> = {
                                      pending: "Pendente",
                                      confirmed: "Confirmada",
                                      checkedin: "Check-in Realizado",
                                      checkedout: "Check-out Realizado",
                                      cancelled: "Cancelada",
                                    };
                                    changes.push(`Status: ${statusLabels[log.old_values.status] || log.old_values.status} → ${statusLabels[log.new_values.status] || log.new_values.status}`);
                                  }
                                  
                                  // Verificar mudanças de pagamento
                                  if (log.old_values?.payment_status && log.new_values?.payment_status && log.old_values.payment_status !== log.new_values.payment_status) {
                                    const paymentLabels: Record<string, string> = {
                                      pending: "Pendente",
                                      paid: "Pago",
                                      partial: "Parcial",
                                    };
                                    changes.push(`Pagamento: ${paymentLabels[log.old_values.payment_status] || log.old_values.payment_status} → ${paymentLabels[log.new_values.payment_status] || log.new_values.payment_status}`);
                                  }
                                  
                                  // Verificar mudanças de valor pago
                                  if (log.old_values?.paid_amount !== undefined && log.new_values?.paid_amount !== undefined && log.old_values.paid_amount !== log.new_values.paid_amount) {
                                    changes.push(`Valor pago: ${formatCurrency(log.old_values.paid_amount)} → ${formatCurrency(log.new_values.paid_amount)}`);
                                  }
                                  
                                  // Verificar mudanças de valor total
                                  if (log.old_values?.total_amount !== undefined && log.new_values?.total_amount !== undefined && log.old_values.total_amount !== log.new_values.total_amount) {
                                    changes.push(`Valor total: ${formatCurrency(log.old_values.total_amount)} → ${formatCurrency(log.new_values.total_amount)}`);
                                  }
                                  
                                  // Verificar mudanças de quarto
                                  if (log.old_values?.room_id && log.new_values?.room_id && log.old_values.room_id !== log.new_values.room_id) {
                                    changes.push(`Quarto alterado`);
                                  }
                                  
                                  // Verificar mudanças de datas
                                  if (log.old_values?.checkin_date && log.new_values?.checkin_date && log.old_values.checkin_date !== log.new_values.checkin_date) {
                                    try {
                                      const oldDate = parseISO(log.old_values.checkin_date);
                                      const newDate = parseISO(log.new_values.checkin_date);
                                      if (!isNaN(oldDate.getTime()) && !isNaN(newDate.getTime())) {
                                        changes.push(`Check-in: ${format(oldDate, "dd/MM/yyyy", { locale: ptBR })} → ${format(newDate, "dd/MM/yyyy", { locale: ptBR })}`);
                                      } else {
                                        changes.push(`Check-in: ${log.old_values.checkin_date} → ${log.new_values.checkin_date}`);
                                      }
                                    } catch {
                                      changes.push(`Check-in: ${log.old_values.checkin_date} → ${log.new_values.checkin_date}`);
                                    }
                                  }
                                  
                                  if (log.old_values?.checkout_date && log.new_values?.checkout_date && log.old_values.checkout_date !== log.new_values.checkout_date) {
                                    try {
                                      const oldDate = parseISO(log.old_values.checkout_date);
                                      const newDate = parseISO(log.new_values.checkout_date);
                                      if (!isNaN(oldDate.getTime()) && !isNaN(newDate.getTime())) {
                                        changes.push(`Check-out: ${format(oldDate, "dd/MM/yyyy", { locale: ptBR })} → ${format(newDate, "dd/MM/yyyy", { locale: ptBR })}`);
                                      } else {
                                        changes.push(`Check-out: ${log.old_values.checkout_date} → ${log.new_values.checkout_date}`);
                                      }
                                    } catch {
                                      changes.push(`Check-out: ${log.old_values.checkout_date} → ${log.new_values.checkout_date}`);
                                    }
                                  }
                                  
                                  if (changes.length > 0) {
                                    return (
                                      <div className="text-xs space-y-1">
                                        {changes.map((change, index) => (
                                          <div key={index} className="text-slate-700">
                                            {change}
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  }
                                  
                                  return null;
                                })()}
                              </div>
                            )}
                          </>
                        )}
                        
                        {/* Visualização Técnica - Mostrar todos os detalhes */}
                        {showTechnicalView && (
                          <>
                            {/* Mostrar valores antigos e novos se existirem */}
                            {(log.old_values || log.new_values) && (
                              <div className="mt-3 pt-3 border-t space-y-2">
                                {log.old_values && Object.keys(log.old_values).length > 0 && (
                                  <div className="text-xs">
                                    <span className="font-semibold text-muted-foreground">Valores anteriores: </span>
                                    <span className="text-red-600">
                                      {Object.entries(log.old_values)
                                        .map(([key, value]) => `${key}: ${value}`)
                                        .join(", ")}
                                    </span>
                                  </div>
                                )}
                                {log.new_values && Object.keys(log.new_values).length > 0 && (
                                  <div className="text-xs">
                                    <span className="font-semibold text-muted-foreground">Valores novos: </span>
                                    <span className="text-green-600">
                                      {Object.entries(log.new_values)
                                        .map(([key, value]) => `${key}: ${value}`)
                                        .join(", ")}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Mostrar metadados se existirem */}
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <div className="mt-2 pt-2 border-t">
                                <details className="text-xs">
                                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                    Ver metadados técnicos
                                  </summary>
                                  <div className="mt-2 p-2 bg-muted rounded text-xs">
                                    <pre className="whitespace-pre-wrap">
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </div>
                                </details>
                              </div>
                            )}
                            
                            {/* Informações técnicas adicionais */}
                            <div className="mt-2 pt-2 border-t space-y-1 text-xs text-muted-foreground">
                              <div>ID do Log: <span className="font-mono">{log.id}</span></div>
                              {log.entity_id && (
                                <div>ID da Entidade: <span className="font-mono">{log.entity_id}</span></div>
                              )}
                              {log.entity_code && (
                                <div>Código da Entidade: <span className="font-mono">{log.entity_code}</span></div>
                              )}
                              <div>Tipo de Entidade: {log.entity_type}</div>
                              <div>Tipo de Ação: {log.action_type}</div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
          
          {/* Navegação */}
          <div className="flex justify-start">
            <Button variant="outline" onClick={() => setCurrentStep(3)} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Anterior
            </Button>
          </div>
        </div>
      )}

      {/* Diálogo de Logs */}
      <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Logs de Atividades da Reserva
            </DialogTitle>
            <DialogDescription>
              Histórico completo de todas as ações realizadas nesta reserva
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">
                {activityLogs.length} registro(s) encontrado(s)
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTechnicalView(!showTechnicalView)}
                className="gap-2"
              >
                {showTechnicalView ? (
                  <>
                    <EyeIcon className="h-4 w-4" />
                    Visualização Simples
                  </>
                ) : (
                  <>
                    <Code className="h-4 w-4" />
                    Visualização Técnica
                  </>
                )}
              </Button>
            </div>
            
            {isLoadingLogs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum log de atividade encontrado para esta reserva.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activityLogs.map((log: ActivityLog) => (
                  <Card key={log.id} className="p-4 border-l-4 border-l-primary">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            className={actionTypeColors[log.action_type] || "bg-gray-100 text-gray-800"}
                          >
                            {actionTypeLabels[log.action_type] || log.action_type}
                          </Badge>
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <ClockIcon className="h-3 w-3" />
                            {(() => {
                              try {
                                const date = parseISO(log.created_at);
                                if (!isNaN(date.getTime())) {
                                  return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
                                }
                                return log.created_at;
                              } catch {
                                return log.created_at;
                              }
                            })()}
                          </span>
                        </div>
                        
                        <p className="text-sm font-medium">{log.description}</p>
                        
                        {/* Mostrar usuário ou hóspede que realizou a ação */}
                        {(log.user || log.metadata?.performed_by === "guest") && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            <span>
                              {log.metadata?.performed_by === "guest" 
                                ? (log.metadata?.guest_name || log.new_values?.performed_by || "Hóspede")
                                : (log.user?.full_name || log.user?.email || "Usuário desconhecido")
                              }
                              {log.metadata?.performed_by === "guest" && (
                                <span className="ml-1 text-xs italic">(Check-in Web)</span>
                              )}
                            </span>
                          </div>
                        )}
                        
                        {/* Visualização Simples - Mostrar apenas mudanças importantes de forma amigável */}
                        {!showTechnicalView && (
                          <>
                            {/* Seção específica para logs de pagamento */}
                            {(log.action_type === "payment_added" || log.action_type === "payment_refunded" || log.action_type === "payment_updated") && (
                              <div className="mt-3 pt-3 border-t">
                                <div className="flex items-start gap-3">
                                  <div className={`p-2 rounded-lg ${log.action_type === "payment_refunded" ? "bg-red-50" : "bg-green-50"}`}>
                                    {log.action_type === "payment_refunded" ? (
                                      <RotateCcw className="h-4 w-4 text-red-600" />
                                    ) : (
                                      <DollarSign className="h-4 w-4 text-green-600" />
                                    )}
                                  </div>
                                  <div className="flex-1 space-y-2">
                                    {log.metadata?.total_amount && (
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-slate-900">
                                          {log.action_type === "payment_refunded" ? "Valor Estornado" : "Valor Pago"}
                                        </span>
                                        <span className={`text-sm font-bold ${log.action_type === "payment_refunded" ? "text-red-600" : "text-green-600"}`}>
                                          {formatCurrency(log.metadata.total_amount)}
                                        </span>
                                      </div>
                                    )}
                                    
                                    {log.metadata?.payment_method && (
                                      <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <CreditCard className="h-3 w-3" />
                                        <span>
                                          Método: {log.metadata.payment_method === "deposit" ? "Depósito" :
                                                   log.metadata.payment_method === "pix" ? "PIX" :
                                                   log.metadata.payment_method === "credit_card" ? "Cartão de Crédito" :
                                                   log.metadata.payment_method === "debit_card" ? "Cartão de Débito" :
                                                   log.metadata.payment_method}
                                        </span>
                                      </div>
                                    )}
                                    
                                    {log.metadata?.installments && log.metadata.installments > 1 && (
                                      <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <Receipt className="h-3 w-3" />
                                        <span>
                                          {log.metadata.installments} parcela(s)
                                        </span>
                                      </div>
                                    )}
                                    
                                    {log.metadata?.payment_date && (
                                      <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <CalendarIconLucide className="h-3 w-3" />
                                        <span>
                                          Data: {(() => {
                                            try {
                                              return format(parseISO(log.metadata.payment_date), "dd/MM/yyyy", { locale: ptBR });
                                            } catch {
                                              return log.metadata.payment_date;
                                            }
                                          })()}
                                        </span>
                                      </div>
                                    )}
                                    
                                    {log.old_values?.paid_amount !== undefined && log.new_values?.paid_amount !== undefined && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="text-slate-500">Valor pago:</span>
                                        <span className="text-red-600 line-through">{formatCurrency(log.old_values.paid_amount)}</span>
                                        <span>→</span>
                                        <span className="text-green-600 font-semibold">{formatCurrency(log.new_values.paid_amount)}</span>
                                      </div>
                                    )}
                                    
                                    {log.old_values?.payment_status && log.new_values?.payment_status && (
                                      <div className="flex items-center gap-2 text-xs">
                                        <span className="text-slate-500">Status:</span>
                                        <Badge variant="outline" className="text-xs">
                                          {log.old_values.payment_status === "pending" ? "Pendente" :
                                           log.old_values.payment_status === "paid" ? "Pago" :
                                           log.old_values.payment_status === "partial" ? "Parcial" : log.old_values.payment_status}
                                        </Badge>
                                        <span>→</span>
                                        <Badge variant="outline" className="text-xs">
                                          {log.new_values.payment_status === "pending" ? "Pendente" :
                                           log.new_values.payment_status === "paid" ? "Pago" :
                                           log.new_values.payment_status === "partial" ? "Parcial" : log.new_values.payment_status}
                                        </Badge>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Outras mudanças */}
                            {(log.old_values || log.new_values) && !(log.action_type === "payment_added" || log.action_type === "payment_refunded" || log.action_type === "payment_updated") && (
                              <div className="mt-3 pt-3 border-t space-y-2">
                                {(() => {
                                  const changes: string[] = [];
                                  
                                  // Verificar mudanças de status
                                  if (log.old_values?.status && log.new_values?.status && log.old_values.status !== log.new_values.status) {
                                    const statusLabels: Record<string, string> = {
                                      pending: "Pendente",
                                      confirmed: "Confirmada",
                                      checkedin: "Check-in Realizado",
                                      checkedout: "Check-out Realizado",
                                      cancelled: "Cancelada",
                                    };
                                    changes.push(`Status: ${statusLabels[log.old_values.status] || log.old_values.status} → ${statusLabels[log.new_values.status] || log.new_values.status}`);
                                  }
                                  
                                  // Verificar mudanças de pagamento
                                  if (log.old_values?.payment_status && log.new_values?.payment_status && log.old_values.payment_status !== log.new_values.payment_status) {
                                    const paymentLabels: Record<string, string> = {
                                      pending: "Pendente",
                                      paid: "Pago",
                                      partial: "Parcial",
                                    };
                                    changes.push(`Pagamento: ${paymentLabels[log.old_values.payment_status] || log.old_values.payment_status} → ${paymentLabels[log.new_values.payment_status] || log.new_values.payment_status}`);
                                  }
                                  
                                  // Verificar mudanças de valor pago
                                  if (log.old_values?.paid_amount !== undefined && log.new_values?.paid_amount !== undefined && log.old_values.paid_amount !== log.new_values.paid_amount) {
                                    changes.push(`Valor pago: ${formatCurrency(log.old_values.paid_amount)} → ${formatCurrency(log.new_values.paid_amount)}`);
                                  }
                                  
                                  // Verificar mudanças de valor total
                                  if (log.old_values?.total_amount !== undefined && log.new_values?.total_amount !== undefined && log.old_values.total_amount !== log.new_values.total_amount) {
                                    changes.push(`Valor total: ${formatCurrency(log.old_values.total_amount)} → ${formatCurrency(log.new_values.total_amount)}`);
                                  }
                                  
                                  // Verificar mudanças de quarto
                                  if (log.old_values?.room_id && log.new_values?.room_id && log.old_values.room_id !== log.new_values.room_id) {
                                    changes.push(`Quarto alterado`);
                                  }
                                  
                                  // Verificar mudanças de datas
                                  if (log.old_values?.checkin_date && log.new_values?.checkin_date && log.old_values.checkin_date !== log.new_values.checkin_date) {
                                    try {
                                      const oldDate = parseISO(log.old_values.checkin_date);
                                      const newDate = parseISO(log.new_values.checkin_date);
                                      if (!isNaN(oldDate.getTime()) && !isNaN(newDate.getTime())) {
                                        changes.push(`Check-in: ${format(oldDate, "dd/MM/yyyy", { locale: ptBR })} → ${format(newDate, "dd/MM/yyyy", { locale: ptBR })}`);
                                      } else {
                                        changes.push(`Check-in: ${log.old_values.checkin_date} → ${log.new_values.checkin_date}`);
                                      }
                                    } catch {
                                      changes.push(`Check-in: ${log.old_values.checkin_date} → ${log.new_values.checkin_date}`);
                                    }
                                  }
                                  
                                  if (log.old_values?.checkout_date && log.new_values?.checkout_date && log.old_values.checkout_date !== log.new_values.checkout_date) {
                                    try {
                                      const oldDate = parseISO(log.old_values.checkout_date);
                                      const newDate = parseISO(log.new_values.checkout_date);
                                      if (!isNaN(oldDate.getTime()) && !isNaN(newDate.getTime())) {
                                        changes.push(`Check-out: ${format(oldDate, "dd/MM/yyyy", { locale: ptBR })} → ${format(newDate, "dd/MM/yyyy", { locale: ptBR })}`);
                                      } else {
                                        changes.push(`Check-out: ${log.old_values.checkout_date} → ${log.new_values.checkout_date}`);
                                      }
                                    } catch {
                                      changes.push(`Check-out: ${log.old_values.checkout_date} → ${log.new_values.checkout_date}`);
                                    }
                                  }
                                  
                                  if (changes.length > 0) {
                                    return (
                                      <div className="text-xs space-y-1">
                                        {changes.map((change, index) => (
                                          <div key={index} className="text-slate-700">
                                            {change}
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  }
                                  
                                  return null;
                                })()}
                              </div>
                            )}
                          </>
                        )}
                        
                        {/* Visualização Técnica - Mostrar todos os detalhes */}
                        {showTechnicalView && (
                          <>
                            {/* Mostrar valores antigos e novos se existirem */}
                            {(log.old_values || log.new_values) && (
                              <div className="mt-3 pt-3 border-t space-y-2">
                                {log.old_values && Object.keys(log.old_values).length > 0 && (
                                  <div className="text-xs">
                                    <span className="font-semibold text-muted-foreground">Valores anteriores: </span>
                                    <span className="text-red-600">
                                      {Object.entries(log.old_values)
                                        .map(([key, value]) => `${key}: ${value}`)
                                        .join(", ")}
                                    </span>
                                  </div>
                                )}
                                {log.new_values && Object.keys(log.new_values).length > 0 && (
                                  <div className="text-xs">
                                    <span className="font-semibold text-muted-foreground">Valores novos: </span>
                                    <span className="text-green-600">
                                      {Object.entries(log.new_values)
                                        .map(([key, value]) => `${key}: ${value}`)
                                        .join(", ")}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Mostrar metadados se existirem */}
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                              <div className="mt-2 pt-2 border-t">
                                <details className="text-xs">
                                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                    Ver metadados técnicos
                                  </summary>
                                  <div className="mt-2 p-2 bg-muted rounded text-xs">
                                    <pre className="whitespace-pre-wrap">
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </div>
                                </details>
                              </div>
                            )}
                            
                            {/* Informações técnicas adicionais */}
                            <div className="mt-2 pt-2 border-t space-y-1 text-xs text-muted-foreground">
                              <div>ID do Log: <span className="font-mono">{log.id}</span></div>
                              {log.entity_id && (
                                <div>ID da Entidade: <span className="font-mono">{log.entity_id}</span></div>
                              )}
                              {log.entity_code && (
                                <div>Código da Entidade: <span className="font-mono">{log.entity_code}</span></div>
                              )}
                              <div>Tipo de Entidade: {log.entity_type}</div>
                              <div>Tipo de Ação: {log.action_type}</div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modais */}
      {selectedServiceFee && reservation?.id && (
        <AddServiceFeeDialog
          open={addServiceFeeDialogOpen}
          onOpenChange={(open) => {
            setAddServiceFeeDialogOpen(open);
            if (!open) {
              setSelectedServiceFee(null);
              setEditingServiceFee(null);
            }
          }}
          serviceFee={selectedServiceFee}
          reservationId={reservation?.id}
          existingFee={editingServiceFee || undefined}
          onConfirm={async (data) => {
            try {
              if (editingServiceFee) {
                await updateServiceFee({
                  id: editingServiceFee.id,
                  ...data,
                });
              } else {
                await addServiceFee({
                  reservation_id: reservation.id,
                  ...data,
                });
              }
              setAddServiceFeeDialogOpen(false);
              setSelectedServiceFee(null);
              setEditingServiceFee(null);
            } catch (error) {
              console.error(error);
            }
          }}
          isSubmitting={isAddingServiceFee || isUpdatingServiceFee}
        />
      )}

      <ReservationPaymentModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        reservation={reservation}
        onSuccess={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          queryClient.invalidateQueries({ queryKey: ["reservation_payments", reservation?.id] });
        }}
      />

      {/* Diálogo de Confirmação de Estorno */}
      {/* Dialog de Editar Observação do Pagamento */}
      <Dialog open={editPaymentNotesDialogOpen} onOpenChange={setEditPaymentNotesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Observação do Pagamento</DialogTitle>
            <DialogDescription>
              Adicione ou edite uma observação para facilitar a verificação financeira
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {paymentToEditNotes && (
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  <div className="font-medium">Pagamento:</div>
                  <div>
                    {formatCurrency(paymentToEditNotes.amount || 0)} - 
                    {paymentToEditNotes.payment_date ? (() => {
                      const paymentDate = parseISO(paymentToEditNotes.payment_date);
                      return isValid(paymentDate) ? format(paymentDate, "dd/MM/yyyy", { locale: ptBR }) : "Data inválida";
                    })() : "Data não informada"}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-notes">Observação</Label>
                  <Textarea
                    id="payment-notes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Ex: Pagamento via PIX, comprovante anexado..."
                    className="min-h-[100px] resize-none"
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setEditPaymentNotesDialogOpen(false);
                  setPaymentToEditNotes(null);
                  setPaymentNotes("");
                }}
                disabled={isUpdatingPaymentNotes}
              >
                Cancelar
              </Button>
              <Button
                onClick={async () => {
                  if (!paymentToEditNotes) return;
                  
                  setIsUpdatingPaymentNotes(true);
                  try {
                    const oldNotes = paymentToEditNotes.notes || null;
                    
                    const { error } = await supabase
                      .from("payments")
                      .update({ notes: paymentNotes || null })
                      .eq("id", paymentToEditNotes.id);

                    if (error) throw error;

                    // Registrar log de atividade
                    try {
                      await logActivity({
                        actionType: "payment_notes_updated",
                        entityType: "payment",
                        entityId: paymentToEditNotes.id,
                        entityCode: reservation?.reservation_code,
                        description: `Observação do pagamento de ${formatCurrency(paymentToEditNotes.amount || 0)} atualizada na reserva ${reservation?.reservation_code || ""}`,
                        oldValues: {
                          notes: oldNotes,
                        },
                        newValues: {
                          notes: paymentNotes || null,
                        },
                        metadata: {
                          payment_id: paymentToEditNotes.id,
                          payment_amount: paymentToEditNotes.amount,
                          payment_date: paymentToEditNotes.payment_date,
                          reservation_id: reservation?.id,
                          reservation_code: reservation?.reservation_code,
                        },
                      });
                    } catch (logError) {
                      console.error("Erro ao registrar log de atividade:", logError);
                      // Não lançar erro para não interromper o fluxo principal
                    }

                    toast.success("Observação atualizada com sucesso!");
                    setEditPaymentNotesDialogOpen(false);
                    setPaymentToEditNotes(null);
                    setPaymentNotes("");
                    
                    // Atualizar lista de pagamentos e logs
                    queryClient.invalidateQueries({ queryKey: ["reservation_payments", reservation?.id] });
                    queryClient.invalidateQueries({ queryKey: ["activity_logs"] });
                  } catch (error: any) {
                    console.error("Erro ao atualizar observação:", error);
                    toast.error(error.message || "Erro ao atualizar observação");
                  } finally {
                    setIsUpdatingPaymentNotes(false);
                  }
                }}
                disabled={isUpdatingPaymentNotes}
              >
                {isUpdatingPaymentNotes ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Estorno de Pagamento</AlertDialogTitle>
            <div className="space-y-4">
              <AlertDialogDescription>
                Tem certeza que deseja estornar este pagamento? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
              {paymentToRefund && (
                <div className="space-y-2 p-4 bg-muted rounded-md">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Valor:</span>
                    <span className="text-sm font-semibold">{formatCurrency(paymentToRefund.amount || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Data:</span>
                    <span className="text-sm">
                      {paymentToRefund.payment_date ? (() => {
                        const paymentDate = parseISO(paymentToRefund.payment_date);
                        return isValid(paymentDate) ? format(paymentDate, "dd/MM/yyyy", { locale: ptBR }) : "Data inválida";
                      })() : "Data não informada"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Método:</span>
                    <span className="text-sm">
                      {paymentToRefund.payment_types?.name || paymentToRefund.payment_method || "N/A"}
                    </span>
                  </div>
                  {paymentToRefund.payment_carriers && (
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Portador:</span>
                      <span className="text-sm">
                        {paymentToRefund.payment_carriers.description || paymentToRefund.payment_carriers.code}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRefunding}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRefundPayment}
              disabled={isRefunding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRefunding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Estornando...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Confirmar Estorno
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {reservation?.id && (
        <CancelReservationDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          reservationId={reservation?.id}
          reservationCode={reservation.reservation_code}
          paidAmount={reservation.paid_amount || 0}
          hasPayments={(payments && payments.length > 0) || (reservation.paid_amount || 0) > 0}
          reservationData={reservation ? {
            checkin_date: reservation.checkin_date,
            checkout_date: reservation.checkout_date,
            total_amount: reservation.total_amount || 0,
            pricing_plan_id: reservation.pricing_plan_id || null,
          } : undefined}
          onConfirm={handleConfirmCancel}
        />
      )}

      {/* Modal de Edição */}
      <ReservationDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        reservationId={reservation?.id}
        initialEditMode={true}
        onSuccess={() => {
          refetch();
          queryClient.invalidateQueries({ queryKey: ["reservations"] });
          setEditDialogOpen(false);
        }}
      />

      {/* Modal de Detalhes do Web Check-in */}
      <Dialog open={webCheckinDialogOpen} onOpenChange={setWebCheckinDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Check-in Web</DialogTitle>
            <DialogDescription>
              Informações sobre o check-in realizado pelo hóspede
            </DialogDescription>
          </DialogHeader>
          
          {reservation?.web_checkin ? (
            <div className="space-y-6 mt-4">
              {/* Status do Check-in */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-semibold text-slate-600">Status</Label>
                    <div className="mt-1">
                      <Badge 
                        variant={
                          reservation.web_checkin.status === "completed" ? "default" :
                          reservation.web_checkin.status === "in_progress" ? "secondary" :
                          reservation.web_checkin.status === "expired" ? "destructive" :
                          "outline"
                        }
                        className={
                          reservation.web_checkin.status === "completed" ? "bg-green-500" :
                          reservation.web_checkin.status === "in_progress" ? "bg-blue-500" :
                          reservation.web_checkin.status === "expired" ? "bg-red-500" :
                          ""
                        }
                      >
                        {reservation.web_checkin.status === "completed" ? "Concluído" :
                         reservation.web_checkin.status === "in_progress" ? "Em Andamento" :
                         reservation.web_checkin.status === "expired" ? "Expirado" :
                         reservation.web_checkin.status === "pending" ? "Pendente" :
                         reservation.web_checkin.status}
                      </Badge>
                    </div>
                  </div>
                  {reservation.web_checkin.status === "completed" && reservation.web_checkin.completed_at && (() => {
                    const completedDate = parseISO(reservation.web_checkin.completed_at);
                    return isValid(completedDate) ? (
                      <div className="text-right">
                        <Label className="text-sm font-semibold text-slate-600">Concluído em</Label>
                        <div className="mt-1 text-sm text-slate-700">
                          {format(completedDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              </Card>

              {/* Informações Básicas */}
              <Card className="p-4">
                <Collapsible open={isBasicInfoOpen} onOpenChange={setIsBasicInfoOpen}>
                  <CollapsibleTrigger className="w-full">
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Informações Básicas
                      <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${isBasicInfoOpen ? 'rotate-180' : ''}`} />
                    </h3>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm text-slate-600">Localizador</Label>
                        <div className="mt-1 text-sm font-mono">{reservation.web_checkin.locator || reservation.reservation_code}</div>
                      </div>
                      <div>
                        <Label className="text-sm text-slate-600">Token</Label>
                        <div className="mt-1 text-xs font-mono truncate">{reservation.web_checkin.token}</div>
                      </div>
                      {reservation.web_checkin.created_at && (() => {
                        const createdDate = parseISO(reservation.web_checkin.created_at);
                        return isValid(createdDate) ? (
                          <div>
                            <Label className="text-sm text-slate-600">Criado em</Label>
                            <div className="mt-1 text-sm">
                              {format(createdDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                          </div>
                        ) : null;
                      })()}
                      {reservation.web_checkin.expires_at && (() => {
                        const expiresDate = parseISO(reservation.web_checkin.expires_at);
                        return isValid(expiresDate) ? (
                          <div>
                            <Label className="text-sm text-slate-600">Expira em</Label>
                            <div className="mt-1 text-sm">
                              {format(expiresDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                          </div>
                        ) : null;
                      })()}
                      {reservation.web_checkin.started_at && (() => {
                        const startedDate = parseISO(reservation.web_checkin.started_at);
                        return isValid(startedDate) ? (
                          <div>
                            <Label className="text-sm text-slate-600">Iniciado em</Label>
                            <div className="mt-1 text-sm">
                              {format(startedDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </div>
                          </div>
                        ) : null;
                      })()}
                      {reservation.web_checkin.ip_address && (
                        <div>
                          <Label className="text-sm text-slate-600">IP de Acesso</Label>
                          <div className="mt-1 text-sm font-mono">{reservation.web_checkin.ip_address}</div>
                        </div>
                      )}
                      {reservation.web_checkin.user_agent && (
                        <div className="col-span-2">
                          <Label className="text-sm text-slate-600">User Agent</Label>
                          <div className="mt-1 text-xs break-all">{reservation.web_checkin.user_agent}</div>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>

              {/* Informações dos Hóspedes */}
              <div className="space-y-6">
                {/* Hóspede Principal - Priorizar dados do Web Check-in se disponível */}
                {(() => {
                  // Verificar se há hóspede principal do web check-in
                  const mainGuestFromWebCheckin = reservation.web_checkin?.guests?.find((g: any) => g.is_main_guest);
                  
                  // Debug: verificar dados do hóspede principal
                  if (mainGuestFromWebCheckin) {
                    console.log("🔍 Main guest from web check-in (ReservationDetails):", {
                      name: mainGuestFromWebCheckin.name,
                      country: mainGuestFromWebCheckin.country,
                      nationality: mainGuestFromWebCheckin.nationality,
                      hasCountry: !!mainGuestFromWebCheckin.country,
                      allFields: Object.keys(mainGuestFromWebCheckin),
                      fullData: mainGuestFromWebCheckin
                    });
                  }
                  
                  // Se houver dados do web check-in, mostrar eles (com dados mais completos)
                  if (mainGuestFromWebCheckin) {
                    // Garantir que o país seja derivado da nacionalidade se não estiver presente
                    const displayCountry = mainGuestFromWebCheckin.country || mainGuestFromWebCheckin.nationality || null;
                    return (
                      <Card className="p-6 border border-slate-200">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200">
                          <User className="h-5 w-5 text-slate-600" />
                          <h3 className="font-semibold text-slate-900">Informações Completas do Hóspede</h3>
                          <Badge variant="outline" className="text-xs">Check-in Web</Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {mainGuestFromWebCheckin.name && (
                            <div>
                              <Label className="text-sm font-semibold text-slate-600">Nome Completo</Label>
                              <div className="mt-1 text-sm font-medium">{mainGuestFromWebCheckin.name}</div>
                            </div>
                          )}
                          {mainGuestFromWebCheckin.email && (
                            <div>
                              <Label className="text-sm font-semibold text-slate-600">E-mail</Label>
                              <div className="mt-1 text-sm">{mainGuestFromWebCheckin.email}</div>
                            </div>
                          )}
                          {mainGuestFromWebCheckin.phone && (
                            <div>
                              <Label className="text-sm font-semibold text-slate-600">Telefone</Label>
                              <div className="mt-1 text-sm">{mainGuestFromWebCheckin.phone}</div>
                            </div>
                          )}
                          {mainGuestFromWebCheckin.cpf && (
                            <div>
                              <Label className="text-sm font-semibold text-slate-600">CPF</Label>
                              <div className="mt-1 text-sm">{mainGuestFromWebCheckin.cpf}</div>
                            </div>
                          )}
                          {mainGuestFromWebCheckin.birth_date && (() => {
                            const birthDate = parseISO(mainGuestFromWebCheckin.birth_date);
                            return isValid(birthDate) ? (
                              <div>
                                <Label className="text-sm font-semibold text-slate-600">Data de Nascimento</Label>
                                <div className="mt-1 text-sm">
                                  {format(birthDate, "dd/MM/yyyy", { locale: ptBR })}
                                </div>
                              </div>
                            ) : null;
                          })()}
                          {mainGuestFromWebCheckin.nationality && (
                            <div>
                              <Label className="text-sm font-semibold text-slate-600">Nacionalidade</Label>
                              <div className="mt-1 text-sm">{mainGuestFromWebCheckin.nationality}</div>
                            </div>
                          )}
                          {displayCountry && (
                            <div>
                              <Label className="text-sm font-semibold text-slate-600">País</Label>
                              <div className="mt-1 text-sm">{displayCountry}</div>
                            </div>
                          )}
                          {/* Endereço Completo */}
                          {(mainGuestFromWebCheckin.zip_code || mainGuestFromWebCheckin.postal_code || mainGuestFromWebCheckin.street || mainGuestFromWebCheckin.city || mainGuestFromWebCheckin.state || displayCountry) && (
                            <div className="md:col-span-2 border-t pt-4 mt-2">
                              <Label className="text-sm font-semibold text-slate-600 mb-3 block">Endereço</Label>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {mainGuestFromWebCheckin.street && (
                                  <div className="md:col-span-2">
                                    <Label className="text-xs text-slate-500">Rua</Label>
                                    <div className="mt-1 text-sm">{mainGuestFromWebCheckin.street}{mainGuestFromWebCheckin.number ? `, ${mainGuestFromWebCheckin.number}` : ""}</div>
                                  </div>
                                )}
                                {mainGuestFromWebCheckin.complement && (
                                  <div className="md:col-span-2">
                                    <Label className="text-xs text-slate-500">Complemento</Label>
                                    <div className="mt-1 text-sm">{mainGuestFromWebCheckin.complement}</div>
                                  </div>
                                )}
                                  {mainGuestFromWebCheckin.neighborhood && (
                                    <div>
                                      <Label className="text-xs text-slate-500">Bairro</Label>
                                      <div className="mt-1 text-sm">{mainGuestFromWebCheckin.neighborhood}</div>
                                    </div>
                                  )}
                                  {mainGuestFromWebCheckin.city && (
                                    <div>
                                      <Label className="text-xs text-slate-500">Cidade</Label>
                                      <div className="mt-1 text-sm">{mainGuestFromWebCheckin.city}</div>
                                    </div>
                                  )}
                                  {mainGuestFromWebCheckin.state && (
                                    <div>
                                      <Label className="text-xs text-slate-500">
                                        {displayCountry && displayCountry !== "BR" ? "Estado/Província" : "Estado"}
                                      </Label>
                                      <div className="mt-1 text-sm">{mainGuestFromWebCheckin.state}</div>
                                    </div>
                                  )}
                                {mainGuestFromWebCheckin.zip_code && (
                                  <div>
                                    <Label className="text-xs text-slate-500">CEP</Label>
                                    <div className="mt-1 text-sm">{mainGuestFromWebCheckin.zip_code}</div>
                                  </div>
                                )}
                                {mainGuestFromWebCheckin.postal_code && (
                                  <div>
                                    <Label className="text-xs text-slate-500">Código Postal</Label>
                                    <div className="mt-1 text-sm">{mainGuestFromWebCheckin.postal_code}</div>
                                  </div>
                                )}
                                {displayCountry && (
                                  <div>
                                    <Label className="text-xs text-slate-500">País</Label>
                                    <div className="mt-1 text-sm">{displayCountry}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  }
                  
                  // Se não houver dados do web check-in, mostrar dados da tabela clients
                  // (apenas se não houver dados do web check-in)
                  if (!mainGuestFromWebCheckin && reservation.guest) {
                    return (
                      <Card className="p-6 border border-slate-200">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200">
                          <User className="h-5 w-5 text-slate-600" />
                          <h3 className="font-semibold text-slate-900">Informações Completas do Hóspede</h3>
                          <Badge variant="outline" className="text-xs">Principal</Badge>
                        </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label className="text-sm font-semibold text-slate-600">Nome Completo</Label>
                        <div className="mt-1 text-sm font-medium">{reservation.guest.full_name || "N/A"}</div>
                      </div>
                      {reservation.guest.email && (
                        <div>
                          <Label className="text-sm font-semibold text-slate-600">E-mail</Label>
                          <div className="mt-1 text-sm">{reservation.guest.email}</div>
                        </div>
                      )}
                      {reservation.guest.phone && (
                        <div>
                          <Label className="text-sm font-semibold text-slate-600">Telefone</Label>
                          <div className="mt-1 text-sm">{reservation.guest.phone}</div>
                        </div>
                      )}
                      {reservation.guest.document_type && reservation.guest.document_number && (
                        <div>
                          <Label className="text-sm font-semibold text-slate-600">Documento</Label>
                          <div className="mt-1 text-sm">
                            <span className="font-medium">{reservation.guest.document_type}:</span> {reservation.guest.document_number}
                          </div>
                        </div>
                      )}
                      {reservation.guest.birth_date && (() => {
                        const birthDate = parseISO(reservation.guest.birth_date);
                        return isValid(birthDate) ? (
                          <div>
                            <Label className="text-sm font-semibold text-slate-600">Data de Nascimento</Label>
                            <div className="mt-1 text-sm">
                              {format(birthDate, "dd/MM/yyyy", { locale: ptBR })}
                            </div>
                          </div>
                        ) : null;
                      })()}
                      {reservation.guest.gender && (
                        <div>
                          <Label className="text-sm font-semibold text-slate-600">Gênero</Label>
                          <div className="mt-1 text-sm">
                            {reservation.guest.gender === "M" ? "Masculino" :
                             reservation.guest.gender === "F" ? "Feminino" :
                             reservation.guest.gender === "O" ? "Outro" :
                             reservation.guest.gender}
                          </div>
                        </div>
                      )}
                      {reservation.guest.nationality && (
                        <div>
                          <Label className="text-sm font-semibold text-slate-600">Nacionalidade</Label>
                          <div className="mt-1 text-sm">{reservation.guest.nationality}</div>
                        </div>
                      )}
                      {reservation.guest.address && (
                        <div className="md:col-span-2">
                          <Label className="text-sm font-semibold text-slate-600">Endereço</Label>
                          <div className="mt-1 text-sm">{reservation.guest.address}</div>
                        </div>
                      )}
                      {reservation.guest.city && (
                        <div>
                          <Label className="text-sm font-semibold text-slate-600">Cidade</Label>
                          <div className="mt-1 text-sm">{reservation.guest.city}</div>
                        </div>
                      )}
                      {reservation.guest.state && (
                        <div>
                          <Label className="text-sm font-semibold text-slate-600">Estado</Label>
                          <div className="mt-1 text-sm">{reservation.guest.state}</div>
                        </div>
                      )}
                      {reservation.guest.zip_code && (
                        <div>
                          <Label className="text-sm font-semibold text-slate-600">CEP</Label>
                          <div className="mt-1 text-sm">{reservation.guest.zip_code}</div>
                        </div>
                      )}
                      {reservation.guest.country && (
                        <div>
                          <Label className="text-sm font-semibold text-slate-600">País</Label>
                          <div className="mt-1 text-sm">{reservation.guest.country}</div>
                        </div>
                      )}
                      {reservation.guest.emergency_contact_name && (
                        <div>
                          <Label className="text-sm font-semibold text-slate-600">Contato de Emergência - Nome</Label>
                          <div className="mt-1 text-sm">{reservation.guest.emergency_contact_name}</div>
                        </div>
                      )}
                      {reservation.guest.emergency_contact_phone && (
                        <div>
                          <Label className="text-sm font-semibold text-slate-600">Contato de Emergência - Telefone</Label>
                          <div className="mt-1 text-sm">{reservation.guest.emergency_contact_phone}</div>
                        </div>
                      )}
                      {reservation.guest.special_requests && (
                        <div className="md:col-span-2">
                          <Label className="text-sm font-semibold text-slate-600">Solicitações Especiais</Label>
                          <div className="mt-1 text-sm whitespace-pre-wrap">{reservation.guest.special_requests}</div>
                        </div>
                      )}
                    </div>
                  </Card>
                    );
                  }
                  
                  return null;
                })()}
                
                {/* Companhantes do Web Check-in */}
                {reservation.web_checkin?.guests && reservation.web_checkin.guests.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide pt-2 border-t-2 border-slate-200">
                      Companhantes ({reservation.web_checkin.guests.filter((g: any) => !g.is_main_guest).length})
                    </h4>
                    {reservation.web_checkin.guests
                      .filter((guest: any) => !guest.is_main_guest)
                      .map((guest: any, index: number) => (
                        <Card key={guest.id || `guest-${index}`} className="p-6 border border-slate-200">
                          <h5 className="font-semibold text-slate-900 mb-4 pb-3 border-b border-slate-200">
                            {guest.name || `Companhante ${index + 1}`}
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {guest.name && (
                              <div>
                                <Label className="text-sm font-semibold text-slate-600">Nome Completo</Label>
                                <div className="mt-1 text-sm font-medium">{guest.name}</div>
                              </div>
                            )}
                            {guest.email && (
                              <div>
                                <Label className="text-sm font-semibold text-slate-600">E-mail</Label>
                                <div className="mt-1 text-sm">{guest.email}</div>
                              </div>
                            )}
                            {guest.phone && (
                              <div>
                                <Label className="text-sm font-semibold text-slate-600">Telefone</Label>
                                <div className="mt-1 text-sm">{guest.phone}</div>
                              </div>
                            )}
                            {guest.document_type && guest.document_number && (
                              <div>
                                <Label className="text-sm font-semibold text-slate-600">Documento</Label>
                                <div className="mt-1 text-sm">
                                  <span className="font-medium">{guest.document_type}:</span> {guest.document_number}
                                </div>
                              </div>
                            )}
                            {guest.cpf && (
                              <div>
                                <Label className="text-sm font-semibold text-slate-600">CPF</Label>
                                <div className="mt-1 text-sm">{guest.cpf}</div>
                              </div>
                            )}
                            {guest.birth_date && (() => {
                              const birthDate = parseISO(guest.birth_date);
                              return isValid(birthDate) ? (
                                <div>
                                  <Label className="text-sm font-semibold text-slate-600">Data de Nascimento</Label>
                                  <div className="mt-1 text-sm">
                                    {format(birthDate, "dd/MM/yyyy", { locale: ptBR })}
                                  </div>
                                </div>
                              ) : null;
                            })()}
                            {guest.nationality && (
                              <div>
                                <Label className="text-sm font-semibold text-slate-600">Nacionalidade</Label>
                                <div className="mt-1 text-sm">{guest.nationality}</div>
                              </div>
                            )}
                            {/* Endereço Completo */}
                            {(guest.zip_code || guest.postal_code || guest.street || guest.city || guest.state || guest.country) && (
                              <div className="md:col-span-2 border-t pt-4 mt-2">
                                <Label className="text-sm font-semibold text-slate-600 mb-3 block">Endereço</Label>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {guest.street && (
                                    <div className="md:col-span-2">
                                      <Label className="text-xs text-slate-500">Rua</Label>
                                      <div className="mt-1 text-sm">{guest.street}{guest.number ? `, ${guest.number}` : ""}</div>
                                    </div>
                                  )}
                                  {guest.complement && (
                                    <div className="md:col-span-2">
                                      <Label className="text-xs text-slate-500">Complemento</Label>
                                      <div className="mt-1 text-sm">{guest.complement}</div>
                                    </div>
                                  )}
                                  {guest.neighborhood && (
                                    <div>
                                      <Label className="text-xs text-slate-500">Bairro</Label>
                                      <div className="mt-1 text-sm">{guest.neighborhood}</div>
                                    </div>
                                  )}
                                  {guest.city && (
                                    <div>
                                      <Label className="text-xs text-slate-500">Cidade</Label>
                                      <div className="mt-1 text-sm">{guest.city}</div>
                                    </div>
                                  )}
                                  {guest.state && (
                                    <div>
                                      <Label className="text-xs text-slate-500">
                                        {guest.country && guest.country !== "BR" ? "Estado/Província" : "Estado"}
                                      </Label>
                                      <div className="mt-1 text-sm">{guest.state}</div>
                                    </div>
                                  )}
                                  {guest.zip_code && (
                                    <div>
                                      <Label className="text-xs text-slate-500">CEP</Label>
                                      <div className="mt-1 text-sm">{guest.zip_code}</div>
                                    </div>
                                  )}
                                  {guest.postal_code && (
                                    <div>
                                      <Label className="text-xs text-slate-500">Código Postal</Label>
                                      <div className="mt-1 text-sm">{guest.postal_code}</div>
                                    </div>
                                  )}
                                  {guest.country && (
                                    <div>
                                      <Label className="text-xs text-slate-500">País</Label>
                                      <div className="mt-1 text-sm">{guest.country}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </Card>
                      ))}
                  </div>
                )}
              </div>

              {/* Documentos e Fotos */}
              {reservation.web_checkin.documents && reservation.web_checkin.documents.length > 0 && (
                <Card className="p-6 border border-slate-200">
                  <h3 className="font-semibold text-slate-900 mb-6 flex items-center gap-2">
                    <ImageIcon className="h-5 w-5 text-slate-600" />
                    Documentos e Fotos
                  </h3>
                  
                  {(() => {
                    // Separar hóspede principal dos companhantes
                    const allDocuments = reservation.web_checkin.documents || [];
                    
                    // Debug: verificar dados
                    console.log("📋 Todos os documentos:", allDocuments);
                    console.log("📋 Total de documentos:", allDocuments.length);
                    
                    // Identificar hóspede principal
                    // Prioridade: is_main_guest === true > order === 0 > primeiro da lista
                    let mainGuest = allDocuments.find((doc: any) => doc.is_main_guest === true);
                    if (!mainGuest) {
                      mainGuest = allDocuments.find((doc: any) => doc.order === 0);
                    }
                    if (!mainGuest && allDocuments.length > 0) {
                      mainGuest = allDocuments[0];
                    }
                    
                    console.log("👤 Hóspede principal:", mainGuest);
                    
                    // Companhantes são todos os documentos que não são o principal
                    // Filtrar também por guest_name para evitar duplicatas
                    const companions = allDocuments.filter((doc: any) => {
                      if (!mainGuest) return false;
                      
                      // Se tiver ID, comparar por ID
                      if (doc.id && mainGuest.id) {
                        return doc.id !== mainGuest.id;
                      }
                      
                      // Se tiver is_main_guest, usar isso
                      if (doc.is_main_guest !== undefined && mainGuest.is_main_guest !== undefined) {
                        return doc.is_main_guest === false && mainGuest.is_main_guest === true;
                      }
                      
                      // Se tiver order, usar isso
                      if (doc.order !== undefined && mainGuest.order !== undefined) {
                        return doc.order !== mainGuest.order;
                      }
                      
                      // Comparar por guest_name (evitar duplicatas com mesmo nome)
                      if (doc.guest_name && mainGuest.guest_name) {
                        return doc.guest_name !== mainGuest.guest_name;
                      }
                      
                      // Último recurso: comparar por referência
                      return doc !== mainGuest;
                    });
                    
                    console.log("👥 Companhantes:", companions);
                    console.log("👥 Total de companhantes:", companions.length);
                    
                    // Função para renderizar documentos de um hóspede
                    const renderGuestDocuments = (doc: any, index: number, isMain: boolean = false) => (
                      <div key={index} className="space-y-4">
                        <div className="pb-3 border-b-2 border-slate-300">
                          <div className="flex items-center gap-2">
                            <p className="text-base font-semibold text-slate-900">{doc.guest_name || `Hóspede ${index + 1}`}</p>
                            {isMain && (
                              <Badge variant="outline" className="text-xs">Principal</Badge>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {/* Selfie */}
                          {doc.selfie_url && (
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Selfie</Label>
                              <div className="relative group">
                                <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50 hover:border-slate-300 transition-colors">
                                  <img
                                    src={doc.selfie_url}
                                    alt={`Selfie - ${doc.guest_name || `Hóspede ${index + 1}`}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ddd' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3EImagem não encontrada%3C/text%3E%3C/svg%3E";
                                    }}
                                  />
                                </div>
                                <button
                                  onClick={() => setSelectedImage({ 
                                    url: doc.selfie_url, 
                                    title: `Selfie - ${doc.guest_name || `Hóspede ${index + 1}`}` 
                                  })}
                                  className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-white rounded-lg shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Ampliar imagem"
                                >
                                  <Maximize2 className="h-4 w-4 text-slate-700" />
                                </button>
                              </div>
                            </div>
                          )}
                          
                          {/* Documento Frente */}
                          {doc.document_front_url && (
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Documento - Frente</Label>
                              <div className="relative group">
                                <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-slate-50 hover:border-slate-300 transition-colors">
                                  <img
                                    src={doc.document_front_url}
                                    alt={`Documento Frente - ${doc.guest_name || `Hóspede ${index + 1}`}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ddd' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3EImagem não encontrada%3C/text%3E%3C/svg%3E";
                                    }}
                                  />
                                </div>
                                <button
                                  onClick={() => setSelectedImage({ 
                                    url: doc.document_front_url, 
                                    title: `Documento Frente - ${doc.guest_name || `Hóspede ${index + 1}`}` 
                                  })}
                                  className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-white rounded-lg shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Ampliar imagem"
                                >
                                  <Maximize2 className="h-4 w-4 text-slate-700" />
                                </button>
                              </div>
                            </div>
                          )}
                          
                          {/* Documento Verso */}
                          {doc.document_back_url && (
                            <div className="space-y-2">
                              <Label className="text-xs font-medium text-slate-600 uppercase tracking-wide">Documento - Verso</Label>
                              <div className="relative group">
                                <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden border border-slate-200 bg-slate-50 hover:border-slate-300 transition-colors">
                                  <img
                                    src={doc.document_back_url}
                                    alt={`Documento Verso - ${doc.guest_name || `Hóspede ${index + 1}`}`}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ddd' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3EImagem não encontrada%3C/text%3E%3C/svg%3E";
                                    }}
                                  />
                                </div>
                                <button
                                  onClick={() => setSelectedImage({ 
                                    url: doc.document_back_url, 
                                    title: `Documento Verso - ${doc.guest_name || `Hóspede ${index + 1}`}` 
                                  })}
                                  className="absolute top-2 right-2 p-2 bg-white/90 hover:bg-white rounded-lg shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Ampliar imagem"
                                >
                                  <Maximize2 className="h-4 w-4 text-slate-700" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                    
                    return (
                      <div className="space-y-8">
                        {/* Hóspede Principal */}
                        {mainGuest && (
                          <div>
                            {renderGuestDocuments(mainGuest, 0, true)}
                          </div>
                        )}
                        
                        {/* Companhantes */}
                        {companions.length > 0 && (
                          <div className="space-y-6 pt-6 border-t-2 border-slate-200">
                            <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
                              Companhantes ({companions.length})
                            </h4>
                            {companions.map((doc: any, index: number) => {
                              console.log(`🔄 Renderizando companhante ${index + 1}:`, doc);
                              return (
                                <div key={doc.id || `companion-${index}`}>
                                  {renderGuestDocuments(doc, index + 1, false)}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        
                        {/* Debug info */}
                        {allDocuments.length > 1 && companions.length === 0 && mainGuest && (
                          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
                            <p>⚠️ Debug: {allDocuments.length} documento(s) encontrado(s), mas nenhum companhante foi identificado.</p>
                            <p className="mt-1">Principal: {mainGuest.guest_name || 'Sem nome'}</p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </Card>
              )}
              
              {/* Modal para exibir imagem ampliada */}
              <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
                <DialogContent className="max-w-4xl max-h-[90vh] p-0">
                  {selectedImage && (
                    <div className="relative">
                      <div className="p-4 border-b border-slate-200">
                        <DialogTitle className="text-lg font-semibold text-slate-900">
                          {selectedImage.title}
                        </DialogTitle>
                      </div>
                      <div className="p-4 bg-slate-50">
                        <div className="relative w-full max-h-[70vh] flex items-center justify-center">
                          <img
                            src={selectedImage.url}
                            alt={selectedImage.title}
                            className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23ddd' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3EImagem não encontrada%3C/text%3E%3C/svg%3E";
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              {/* Observações */}
              {reservation.web_checkin.notes && (
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Observações</h3>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{reservation.web_checkin.notes}</p>
                </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum check-in web encontrado para esta reserva.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de Check-in Manual */}
      <ManualCheckinDialog
        open={manualCheckinDialogOpen}
        onOpenChange={setManualCheckinDialogOpen}
        reservation={reservation || undefined}
      />
      </div>
    </div>
  );
};

export default ReservationDetails;

