import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useReservations } from "@/hooks/useReservations";
import { usePricing } from "@/hooks/usePricing";
import { useHotelSettings } from "@/hooks/useHotelSettings";
import { useRateSystem } from "@/hooks/useRateSystem";
import { 
  calculateReservationTotal, 
  getAvailableRooms, 
  validateRoomCapacity,
  validateRoomAvailability,
  validateCategoryAvailability,
  formatCurrency,
  formatCNPJ,
  formatCPF,
  calculateNights
} from "@/lib/reservationUtils";
import { Loader2, UserPlus, DollarSign, ArrowLeftRight, User, Edit2, Trash2, XCircle, Plus, X } from "lucide-react";
import { format, parseISO, startOfDay, isBefore, differenceInDays, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Switch } from "@/components/ui/switch";
import { ReservationPaymentModal } from "./ReservationPaymentModal";
import { CancelReservationDialog } from "./CancelReservationDialog";
import { AddServiceFeeDialog } from "./AddServiceFeeDialog";
import { useServiceFees } from "@/hooks/useServiceFees";
import { useReservationServiceFees } from "@/hooks/useReservationServiceFees";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle } from "lucide-react";

interface ReservationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  reservationId?: string; // Para edição
  initialData?: {
    checkin_date?: string;
    checkout_date?: string;
    category_id?: string;
    room_id?: string;
    channel?: string;
    pricing_plan_id?: string;
    adults?: number;
    children?: number;
    total_amount?: number;
    action?: "confirmed" | "blocked" | "preregistration";
  }; // Para pré-preencher ao criar nova reserva
}

export const ReservationDialog = ({ 
  open, 
  onOpenChange, 
  onSuccess,
  reservationId,
  initialData
}: ReservationDialogProps) => {
  const { createReservation, updateReservation, isCreating, isUpdating, cancelReservation } = useReservations();
  const { calculatePrice } = usePricing();
  const { settings: hotelSettings } = useHotelSettings();
  const { ratePlans } = useRateSystem();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [calculatedTotal, setCalculatedTotal] = useState<number>(0);
  const [isManualPrice, setIsManualPrice] = useState(false); // Flag para indicar que o preço foi definido manualmente
  
  // Estados para taxas/serviços
  const { serviceFees } = useServiceFees();
  const {
    serviceFees: reservationServiceFees,
    addServiceFee,
    updateServiceFee,
    removeServiceFee,
    isAdding: isAddingServiceFee,
    isUpdating: isUpdatingServiceFee,
  } = useReservationServiceFees(reservationId);
  const [addServiceFeeDialogOpen, setAddServiceFeeDialogOpen] = useState(false);
  const [selectedServiceFee, setSelectedServiceFee] = useState<{ id: string; name: string; description?: string } | null>(null);
  const [editingServiceFee, setEditingServiceFee] = useState<{ id: string; amount: number; quantity: number; notes?: string } | null>(null);
  
  // Calcular total incluindo taxas
  const totalWithFees = useMemo(() => {
    const baseTotal = calculatedTotal || 0;
    const feesTotal = reservationServiceFees.reduce((sum: number, fee: any) => {
      return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
    }, 0);
    return baseTotal + feesTotal;
  }, [calculatedTotal, reservationServiceFees]);
  const [promotionCode, setPromotionCode] = useState("");
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [createNewClient, setCreateNewClient] = useState(true); // Sempre criar novo cliente
  const [creatingClient, setCreatingClient] = useState(false);
  
  // Estados para busca automática por documento
  const [searchingFinancialClient, setSearchingFinancialClient] = useState(false);
  const [searchingGuestClient, setSearchingGuestClient] = useState(false);
  const [foundFinancialClientId, setFoundFinancialClientId] = useState<string | null>(null);
  const [foundGuestClientId, setFoundGuestClientId] = useState<string | null>(null);
  
  // Estados para busca inicial
  const [searchStep, setSearchStep] = useState<"initial" | "found" | "not_found">("initial");
  const [initialSearchDocument, setInitialSearchDocument] = useState("");
  const [initialSearchDocumentType, setInitialSearchDocumentType] = useState("CPF");
  const [searchingInitialClient, setSearchingInitialClient] = useState(false);

  const [formData, setFormData] = useState({
    client_id: "",
    category_id: "",
    room_id: "",
    checkin_date: "",
    checkout_date: "",
    checkin_time: "",
    checkout_time: "",
    adults: 1,
    children: 0,
    channel: "direct",
    pricing_plan_id: "",
    notes: "",
  });

  const [reservationAction, setReservationAction] = useState<"confirmed" | "blocked" | "preregistration" | null>(null);
  const [expirationDate, setExpirationDate] = useState("");
  const [expirationTime, setExpirationTime] = useState("23:59");
  const [blockReason, setBlockReason] = useState("");
  const [showPastDateAlert, setShowPastDateAlert] = useState(false);
  const [pendingReservationData, setPendingReservationData] = useState<any>(null);

  const [clientData, setClientData] = useState({
    full_name: "",
    email: "",
    phone: "",
    document_number: "",
    document_type: "CPF",
  });

  // Estados para responsável financeiro e hóspede
  const [clientType, setClientType] = useState<"guest" | "financial">("guest");
  const [hasFinancialResponsible, setHasFinancialResponsible] = useState(false);
  const [financialResponsibleData, setFinancialResponsibleData] = useState({
    full_name: "",
    email: "",
    phone: "",
    document_number: "",
    document_type: "CPF",
  });
  const [guestData, setGuestData] = useState({
    full_name: "",
    email: "",
    phone: "",
    document_number: "",
    document_type: "CPF",
  });

  // Estados para modal de pagamento
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [currentReservation, setCurrentReservation] = useState<any | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  
  // Estado para controlar se está em modo de edição ou visualização
  const [isEditMode, setIsEditMode] = useState(false);

  // Buscar clientes
  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name, email")
        .order("full_name");

      if (error) throw error;
      return data;
    },
  });

  // Buscar categorias
  const { data: categories } = useQuery({
    queryKey: ["room_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_categories")
        .select("*")
        .order("name");

      if (error) throw error;
      return data;
    },
  });

  // Função para busca inicial de cliente
  const searchInitialClient = async () => {
    if (!initialSearchDocument || initialSearchDocument.length < 5) {
      toast.error("Digite pelo menos 5 caracteres do documento");
      return;
    }
    
    // Não executar busca se estiver editando uma reserva
    if (reservationId) {
      console.log("⚠️ Busca cancelada: editando reserva existente");
      return;
    }
    
    try {
      setSearchingInitialClient(true);
      const establishmentId = localStorage.getItem("selectedEstablishmentId");
      
      console.log("🔍 Busca inicial:", { doc: initialSearchDocument, type: initialSearchDocumentType });
      
      // Construir query base
      let query = supabase
        .from("clients")
        .select("*")
        .eq("document_number", initialSearchDocument)
        .eq("document_type", initialSearchDocumentType);
      
      // Só adicionar filtro de establishment_id se não for null
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (error) {
        console.error("❌ Erro ao buscar cliente:", error);
        toast.error("Erro ao buscar cliente");
        return;
      }
      
      // Se encontrou múltiplos clientes com mesmo documento
      if (data && data.length > 1) {
        console.warn(`⚠️ Encontrados ${data.length} clientes com o documento ${initialSearchDocumentType} ${initialSearchDocument}`);
        toast.warning(`Encontrados ${data.length} clientes com este documento. Usando o mais recente.`);
      }
      
      // Pegar o primeiro resultado (mais recente)
      const clientFound = data && data.length > 0 ? data[0] : null;
      
      if (clientFound) {
        // Cliente encontrado!
        console.log("✅ Cliente encontrado:", clientFound);
        
        // Preencher dados do cliente
        setClientData({
          full_name: clientFound.full_name || "",
          email: clientFound.email || "",
          phone: clientFound.phone || "",
          document_number: clientFound.document_number || "",
          document_type: clientFound.document_type || "CPF",
        });
        setFoundGuestClientId(clientFound.id);
        
        setSearchStep("found");
        toast.success(`Cliente "${clientFound.full_name}" encontrado!`);
      } else {
        // Cliente não encontrado
        console.log("ℹ️ Cliente não encontrado");
        
        // Pré-preencher o documento para facilitar o cadastro
        setClientData({
          full_name: "",
          email: "",
          phone: "",
          document_number: initialSearchDocument,
          document_type: initialSearchDocumentType,
        });
        
        setSearchStep("not_found");
        toast.info("Cliente não encontrado. Preencha os dados para cadastro.");
      }
    } catch (error) {
      console.error("❌ Erro ao buscar cliente:", error);
      toast.error("Erro ao buscar cliente");
    } finally {
      setSearchingInitialClient(false);
    }
  };
  
  // Função para buscar cliente por documento (responsável financeiro e hóspede duplo)
  const searchClientByDocument = async (documentNumber: string, documentType: string, isFinancial: boolean, isSimpleMode: boolean = false) => {
    if (!documentNumber || documentNumber.length < 5) return; // Mínimo de 5 caracteres
    
    // Não executar busca se estiver editando uma reserva
    if (reservationId) {
      console.log("⚠️ Busca cancelada: editando reserva existente");
      return;
    }
    
    console.log("🔍 Iniciando busca:", { documentNumber, documentType, isFinancial, isSimpleMode });
    
    const setSearching = isFinancial ? setSearchingFinancialClient : setSearchingGuestClient;
    const setFoundId = isFinancial ? setFoundFinancialClientId : setFoundGuestClientId;
    
    // No modo simples (sem responsável financeiro), usar clientData
    // Caso contrário, usar financialResponsibleData ou guestData
    let setData;
    if (isSimpleMode) {
      console.log("📝 Modo SIMPLES - Usando setClientData");
      setData = setClientData;
    } else {
      console.log(`📝 Modo DUPLO - Usando ${isFinancial ? 'setFinancialResponsibleData' : 'setGuestData'}`);
      setData = isFinancial ? setFinancialResponsibleData : setGuestData;
    }
    
    try {
      setSearching(true);
      const establishmentId = localStorage.getItem("selectedEstablishmentId");
      
      console.log("🔎 Buscando no Supabase...");
      
      // Construir query base
      let query = supabase
        .from("clients")
        .select("*")
        .eq("document_number", documentNumber)
        .eq("document_type", documentType);
      
      // Só adicionar filtro de establishment_id se não for null
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(10);
      
      if (error) {
        console.error("❌ Erro ao buscar cliente:", error);
        toast.error("Erro ao buscar cliente");
        setSearching(false);
        return;
      }
      
      // Se encontrou múltiplos clientes com mesmo documento
      if (data && data.length > 1) {
        console.warn(`⚠️ Encontrados ${data.length} clientes com o documento ${documentType} ${documentNumber}`);
        toast.warning(`Encontrados ${data.length} clientes com este documento. Usando o mais recente.`);
      }
      
      // Pegar o primeiro resultado (mais recente)
      const clientFound = data && data.length > 0 ? data[0] : null;
      
      if (clientFound) {
        // Cliente encontrado! Preencher os campos
        const clientInfo = {
          full_name: clientFound.full_name || "",
          email: clientFound.email || "",
          phone: clientFound.phone || "",
          document_number: clientFound.document_number || "",
          document_type: clientFound.document_type || "CPF",
        };
        
        console.log("✅ Cliente encontrado:", clientFound);
        console.log("📋 Preenchendo campos com:", clientInfo);
        
        setData(clientInfo);
        setFoundId(clientFound.id);
        
        console.log("✓ Campos preenchidos e ID salvo:", clientFound.id);
        toast.success(`Cliente "${clientFound.full_name}" encontrado!`);
      } else {
        // Cliente não encontrado, limpar apenas o ID
        console.log("ℹ️ Cliente não encontrado no banco");
        setFoundId(null);
        toast.info("Cliente não encontrado. Preencha os dados para cadastro.");
      }
    } catch (error) {
      console.error("❌ Erro ao buscar cliente:", error);
      toast.error("Erro ao buscar cliente");
    } finally {
      setSearching(false);
    }
  };

  // Atualizar horários padrão quando as configurações do hotel mudarem
  useEffect(() => {
    if (hotelSettings && !reservationId && !formData.checkin_time && !formData.checkout_time) {
      const defaultCheckinTime = hotelSettings.checkin_time 
        ? hotelSettings.checkin_time.substring(0, 5) 
        : "14:00";
      const defaultCheckoutTime = hotelSettings.checkout_time 
        ? hotelSettings.checkout_time.substring(0, 5) 
        : "12:00";
      
      setFormData(prev => ({
        ...prev,
        checkin_time: prev.checkin_time || defaultCheckinTime,
        checkout_time: prev.checkout_time || defaultCheckoutTime,
      }));
    }
  }, [hotelSettings, reservationId]);

  // Resetar formulário quando abrir/fechar
  useEffect(() => {
    if (!open) {
      // Obter horários padrão do hotel
      const defaultCheckinTime = hotelSettings?.checkin_time 
        ? hotelSettings.checkin_time.substring(0, 5) 
        : "14:00";
      const defaultCheckoutTime = hotelSettings?.checkout_time 
        ? hotelSettings.checkout_time.substring(0, 5) 
        : "12:00";
      
      setFormData({
        client_id: "",
        category_id: "",
        room_id: "",
        checkin_date: "",
        checkout_date: "",
        checkin_time: defaultCheckinTime,
        checkout_time: defaultCheckoutTime,
        adults: 1,
        children: 0,
        channel: "direct",
        pricing_plan_id: "",
        notes: "",
      });
      setClientData({
        full_name: "",
        email: "",
        phone: "",
        document_number: "",
        document_type: "CPF",
      });
      setFinancialResponsibleData({
        full_name: "",
        email: "",
        phone: "",
        document_number: "",
        document_type: "CPF",
      });
      setGuestData({
        full_name: "",
        email: "",
        phone: "",
        document_number: "",
        document_type: "CPF",
      });
      setHasFinancialResponsible(false);
      setCreateNewClient(true); // Sempre em modo de cadastro
      setFoundFinancialClientId(null);
      setFoundGuestClientId(null);
      setSearchStep("initial");
      setInitialSearchDocument("");
      setInitialSearchDocumentType("CPF");
      setPromotionCode("");
      setReservationAction(null);
      setExpirationDate("");
      setExpirationTime("23:59");
      setBlockReason("");
    } else if (open && !reservationId && initialData) {
      // Pré-preencher com dados iniciais ao criar nova reserva
      setFormData(prev => {
        // Se initialData tem pricing_plan_id, usar ele (mesmo que seja string vazia, significa que não foi selecionado)
        // Se não tem, manter o valor anterior ou string vazia
        const pricingPlanId = initialData.pricing_plan_id !== undefined 
          ? initialData.pricing_plan_id 
          : (prev.pricing_plan_id || "");
        
        return {
        ...prev,
        checkin_date: initialData.checkin_date || prev.checkin_date,
        checkout_date: initialData.checkout_date || prev.checkout_date,
        category_id: initialData.category_id || prev.category_id,
        room_id: initialData.room_id || prev.room_id,
        channel: initialData.channel || prev.channel,
          pricing_plan_id: pricingPlanId,
          adults: initialData.adults !== undefined ? initialData.adults : prev.adults,
          children: initialData.children !== undefined ? initialData.children : prev.children,
        };
      });
      setReservationAction(initialData.action || null);
      if (initialData.total_amount) {
        setCalculatedTotal(initialData.total_amount);
        setIsManualPrice(true); // Marcar como preço manual quando vem do initialData
      } else {
        setIsManualPrice(false); // Resetar se não houver valor manual
      }
    }
  }, [open, reservationId, initialData]);

  // Buscar reserva para edição
  useEffect(() => {
    if (reservationId && open) {
      // Ao abrir uma reserva existente, iniciar em modo de VISUALIZAÇÃO
      setIsEditMode(false);
      
      const fetchReservation = async () => {
        const { data, error } = await supabase
          .from("reservations")
          .select(`
            *, 
            financial_responsible:clients!client_id(full_name, email, phone, document_number, document_type),
            guest:clients!guest_id(full_name, email, phone, document_number, document_type),
            rooms(room_number)
          `)
          .eq("id", reservationId)
          .single();

        if (error) {
          setCurrentReservation(null);
          toast.error("Erro ao carregar reserva");
          return;
        }
        
        // Buscar informações do usuário que cancelou separadamente
        let cancelledByUser = null;
        if (data?.cancelled_by) {
          const { data: userData } = await supabase
            .from("users")
            .select("id, email, full_name")
            .eq("id", data.cancelled_by)
            .single();
          
          if (userData) {
            cancelledByUser = userData;
          }
        }

        if (data) {
          // Não permitir editar apenas bloqueios através deste modal
          if (data.status === "blocked") {
            toast.error("Bloqueios não podem ser editados através deste modal. Use o modal específico de bloqueios.");
            onOpenChange(false);
            return;
          }

          // Obter horários padrão do hotel se não houver horários específicos na reserva
          const defaultCheckinTime = hotelSettings?.checkin_time 
            ? hotelSettings.checkin_time.substring(0, 5) 
            : "14:00";
          const defaultCheckoutTime = hotelSettings?.checkout_time 
            ? hotelSettings.checkout_time.substring(0, 5) 
            : "12:00";

          setFormData({
            client_id: data.client_id,
            category_id: data.category_id,
            room_id: data.room_id || "",
            checkin_date: data.checkin_date,
            checkout_date: data.checkout_date,
            checkin_time: data.checkin_time ? data.checkin_time.substring(0, 5) : defaultCheckinTime,
            checkout_time: data.checkout_time ? data.checkout_time.substring(0, 5) : defaultCheckoutTime,
            adults: data.adults,
            children: data.children,
            channel: data.channel || "direct",
            pricing_plan_id: data.pricing_plan_id || "",
            notes: data.notes || "",
          });
          
          // Armazenar dados completos da reserva para o modal de pagamento
          setCurrentReservation({
            ...data,
            guest_name: data.guest?.full_name || data.financial_responsible?.full_name,
            cancelled_by_user: cancelledByUser,
          });

          // Carregar dados completos do cliente para exibir no formulário
          const { data: clientDataArray, error: clientError } = await supabase
            .from("clients")
            .select("*")
            .eq("id", data.client_id)
            .order("created_at", { ascending: false })
            .limit(1);

          const clientData = clientDataArray && clientDataArray.length > 0 ? clientDataArray[0] : null;

          if (!clientError && clientData) {
            // Verificar se há guest_id diferente (modo duplo)
            if (data.guest_id && data.guest_id !== data.client_id) {
              // Modo duplo: Responsável financeiro diferente do hóspede
              setFinancialResponsibleData({
                full_name: clientData.full_name || "",
                email: clientData.email || "",
                phone: clientData.phone || "",
                document_number: clientData.document_number || "",
                document_type: clientData.document_type || "CPF",
              });
              setFoundFinancialClientId(data.client_id);
              
              // Carregar dados do hóspede
              const { data: guestClientDataArray, error: guestError } = await supabase
                .from("clients")
                .select("*")
                .eq("id", data.guest_id)
                .order("created_at", { ascending: false })
                .limit(1);
              
              const guestClientData = guestClientDataArray && guestClientDataArray.length > 0 ? guestClientDataArray[0] : null;
              
              if (!guestError && guestClientData) {
                setGuestData({
                  full_name: guestClientData.full_name || "",
                  email: guestClientData.email || "",
                  phone: guestClientData.phone || "",
                  document_number: guestClientData.document_number || "",
                  document_type: guestClientData.document_type || "CPF",
                });
                setFoundGuestClientId(data.guest_id);
              }
              
              setHasFinancialResponsible(true);
              setClientData({
                full_name: guestClientData?.full_name || "",
                email: guestClientData?.email || "",
                phone: guestClientData?.phone || "",
                document_number: guestClientData?.document_number || "",
                document_type: guestClientData?.document_type || "CPF",
              });
            } else {
              // Modo simples: Cliente é o hóspede e responsável
              setClientData({
                full_name: clientData.full_name || "",
                email: clientData.email || "",
                phone: clientData.phone || "",
                document_number: clientData.document_number || "",
                document_type: clientData.document_type || "CPF",
              });
              setFoundGuestClientId(data.client_id);
              setHasFinancialResponsible(false);
            }
            
            // Mudar para etapa "found" para mostrar os dados
            setSearchStep("found");
          } else if (clientError) {
            console.error("Erro ao carregar cliente:", clientError);
            toast.error("Erro ao carregar dados do cliente");
          }
        }
      };

      fetchReservation();
    } else if (!reservationId && open && !initialData) {
      // Nova reserva: sempre em modo de EDIÇÃO
      setIsEditMode(true);
      setCurrentReservation(null);
      // Reset form for new reservation (apenas se não houver initialData)
      // Obter horários padrão do hotel
      const defaultCheckinTime = hotelSettings?.checkin_time 
        ? hotelSettings.checkin_time.substring(0, 5) 
        : "14:00";
      const defaultCheckoutTime = hotelSettings?.checkout_time 
        ? hotelSettings.checkout_time.substring(0, 5) 
        : "12:00";
      
      setFormData({
        client_id: "",
        category_id: "",
        room_id: "",
        checkin_date: "",
        checkout_date: "",
        checkin_time: defaultCheckinTime,
        checkout_time: defaultCheckoutTime,
        adults: 1,
        children: 0,
        channel: "direct",
        notes: "",
      });
      setAvailableRooms([]);
      setCalculatedTotal(0);
      setIsManualPrice(false); // Resetar flag ao limpar
    }
  }, [reservationId, open, initialData]);

  // Buscar quartos disponíveis quando categoria e datas mudarem
  useEffect(() => {
    const fetchAvailableRooms = async () => {
      if (
        formData.category_id &&
        formData.checkin_date &&
        formData.checkout_date &&
        new Date(formData.checkout_date) > new Date(formData.checkin_date)
      ) {
        setLoadingRooms(true);
        try {
          // Incluir o quarto já selecionado (se houver) na busca
          const rooms = await getAvailableRooms(
            formData.category_id,
            formData.checkin_date,
            formData.checkout_date,
            formData.room_id || undefined
          );
          setAvailableRooms(rooms);
        } catch (error: any) {
          toast.error(error.message || "Erro ao buscar quartos disponíveis");
        } finally {
          setLoadingRooms(false);
        }
      } else {
        setAvailableRooms([]);
      }
    };

    fetchAvailableRooms();
  }, [formData.category_id, formData.checkin_date, formData.checkout_date, formData.room_id]);

  // Calcular total quando necessário (com tarifário dinâmico)
  useEffect(() => {
    // Evitar cálculo se estiver editando uma reserva existente sem mudanças
    if (reservationId && !isEditMode) {
      return;
    }

    // Se o preço foi definido manualmente, não recalcular automaticamente
    if (isManualPrice) {
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      if (
        formData.category_id &&
        formData.checkin_date &&
        formData.checkout_date &&
        categories &&
        !cancelled
      ) {
        setCalculatingPrice(true);
        try {
          // Tentar calcular com tarifário dinâmico usando o plano selecionado
          const dynamicPrice = await calculatePrice(
            formData.category_id,
            formData.checkin_date,
            formData.checkout_date,
            promotionCode || undefined,
            formData.pricing_plan_id && formData.pricing_plan_id.trim() !== "" ? formData.pricing_plan_id : undefined,
            undefined,
            formData.adults,
            formData.children
          );

          if (cancelled) return;

          if (dynamicPrice > 0) {
            setCalculatedTotal(dynamicPrice);
          } else {
            // Fallback para cálculo simples
            const category = categories.find((c) => c.id === formData.category_id);
            if (category) {
              const total = calculateReservationTotal(
                category.base_price,
                formData.checkin_date,
                formData.checkout_date
              );
              setCalculatedTotal(total);
            }
          }
        } catch (error) {
          if (cancelled) return;
          // Fallback para cálculo simples
          const category = categories.find((c) => c.id === formData.category_id);
          if (category) {
            const total = calculateReservationTotal(
              category.base_price,
              formData.checkin_date,
              formData.checkout_date
            );
            setCalculatedTotal(total);
          }
        } finally {
          if (!cancelled) {
          setCalculatingPrice(false);
          }
        }
      } else {
        if (!cancelled) {
        setCalculatedTotal(0);
      setIsManualPrice(false); // Resetar flag ao limpar
      }
      }
    }, 500); // Debounce de 500ms para evitar recálculos excessivos

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    formData.category_id,
    formData.checkin_date,
    formData.checkout_date,
    formData.pricing_plan_id,
    formData.adults,
    formData.children,
    categories,
    promotionCode,
    reservationId,
    isEditMode,
    isManualPrice, // Adicionar isManualPrice como dependência
    // Remover calculatePrice das dependências para evitar recriação constante
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let clientId = formData.client_id;

      // Sempre criar ou usar cliente existente (busca por documento)
      const establishmentId = localStorage.getItem("selectedEstablishmentId");
      
      if (hasFinancialResponsible) {
        // Validar dados do responsável financeiro
        if (!financialResponsibleData.full_name || !financialResponsibleData.email || !financialResponsibleData.phone) {
          toast.error("Dados do responsável financeiro são obrigatórios (Nome, Email e Telefone)");
          setLoading(false);
          return;
        }

        // Validar dados do hóspede
        if (!guestData.full_name) {
          toast.error("Nome do hóspede é obrigatório");
          setLoading(false);
          return;
        }

        setCreatingClient(true);

        // Responsável Financeiro: Usar existente se encontrado, senão criar
        let financialClientId = foundFinancialClientId;
        if (!financialClientId) {
          const { data: financialClient, error: financialError } = await supabase
            .from("clients")
            .insert([{
              full_name: financialResponsibleData.full_name,
              email: financialResponsibleData.email,
              phone: financialResponsibleData.phone,
              document_number: financialResponsibleData.document_number || null,
              document_type: financialResponsibleData.document_type || null,
              establishment_id: establishmentId || undefined,
            }])
            .select()
            .single();

          if (financialError) {
            console.error("Erro ao criar responsável financeiro:", financialError);
            toast.error("Erro ao criar responsável financeiro");
            setCreatingClient(false);
            setLoading(false);
            return;
          }
          financialClientId = financialClient.id;
          toast.success(`Responsável financeiro "${financialClient.full_name}" cadastrado!`);
        } else {
          toast.info(`Usando responsável financeiro existente: "${financialResponsibleData.full_name}"`);
        }

        // Hóspede: Usar existente se encontrado, senão criar
        let guestClientId = foundGuestClientId;
        if (!guestClientId) {
          const { data: guestClient, error: guestError } = await supabase
            .from("clients")
            .insert([{
              full_name: guestData.full_name,
              email: guestData.email || null,
              phone: guestData.phone || null,
              document_number: guestData.document_number || null,
              document_type: guestData.document_type || null,
              establishment_id: establishmentId || undefined,
            }])
            .select()
            .single();

          if (guestError) {
            console.error("Erro ao criar hóspede:", guestError);
            toast.error("Erro ao criar hóspede");
            setCreatingClient(false);
            setLoading(false);
            return;
          }
          guestClientId = guestClient.id;
          toast.success(`Hóspede "${guestClient.full_name}" cadastrado!`);
        } else {
          toast.info(`Usando hóspede existente: "${guestData.full_name}"`);
        }

        // Responsável financeiro será o client_id (para pagamentos)
        clientId = financialClientId;
        
        // Armazenar guest_id para enviar na reserva
        formData.guest_id = guestClientId;
        formData.guest_name = guestData.full_name;
        
        setCreatingClient(false);
      } else {
        // Modo simples: Hóspede = Responsável Financeiro
        if (!clientData.full_name) {
          toast.error("Nome do cliente é obrigatório");
          setLoading(false);
          return;
        }

        setCreatingClient(true);
        
        // Usar existente se encontrado (modo simples usa guestData internamente)
        let singleClientId = foundGuestClientId;
        if (!singleClientId) {
        const { data: newClient, error: clientError } = await supabase
          .from("clients")
          .insert([{
            full_name: clientData.full_name,
            email: clientData.email || null,
            phone: clientData.phone || null,
            document_number: clientData.document_number || null,
            document_type: clientData.document_type || null,
            establishment_id: establishmentId || undefined,
          }])
          .select()
          .single();

        if (clientError) {
          toast.error(clientError.message || "Erro ao cadastrar cliente");
          setLoading(false);
          setCreatingClient(false);
          return;
        }

          singleClientId = newClient.id;
          toast.success(`Cliente "${newClient.full_name}" cadastrado com sucesso!`);
        } else {
          toast.info(`Usando cliente existente: "${clientData.full_name}"`);
        }

        clientId = singleClientId;
        formData.guest_name = clientData.full_name;
        setCreatingClient(false);
      }
        
        // Invalidar cache de clientes para atualizar a lista
        queryClient.invalidateQueries({ queryKey: ["clients"] });

      // Determinar se é bloqueio ou pré-reserva
      const isBlocked = reservationAction === "blocked";
      const isPreReservation = reservationAction === "preregistration";
      
      // Para bloqueios e pré-reservas, criar cliente temporário se necessário
      if (!clientId && (isBlocked || isPreReservation)) {
        const establishmentId = localStorage.getItem("selectedEstablishmentId");
        const { data: tempClient, error: clientError } = await supabase
          .from("clients")
          .insert([{
            full_name: isBlocked ? "Bloqueio Temporário" : "Pré-reserva Temporária",
            email: `temp_${Date.now()}@temp.com`,
            document_type: "CPF",
            document_number: `00000000000`,
            establishment_id: establishmentId || undefined,
          }])
          .select()
          .single();

        if (clientError) {
          toast.error("Erro ao criar cliente temporário");
          setLoading(false);
          return;
        }

        clientId = tempClient.id;
      } else if (!clientId && !isBlocked && !isPreReservation) {
        toast.error(createNewClient ? "Erro ao cadastrar cliente" : "Selecione um cliente");
        setLoading(false);
        return;
      }

      if (!formData.category_id) {
        toast.error("Selecione uma categoria");
        return;
      }

      if (!formData.checkin_date || !formData.checkout_date) {
        toast.error("Selecione as datas de check-in e check-out");
        return;
      }

      if (new Date(formData.checkout_date) <= new Date(formData.checkin_date)) {
        toast.error("Data de check-out deve ser posterior ao check-in");
        return;
      }

      // Validar motivo do bloqueio
      if (isBlocked && !blockReason.trim()) {
        toast.error("Informe o motivo do bloqueio");
        return;
      }

      // Validar data de expiração para pré-reserva
      if (isPreReservation && !expirationDate) {
        toast.error("Informe a data de expiração da pré-reserva");
        return;
      }

      // Validar capacidade (apenas para reservas normais)
      if (!isBlocked && !isPreReservation) {
        const category = categories?.find((c) => c.id === formData.category_id);
        if (category) {
          const capacityCheck = validateRoomCapacity(
            category,
            formData.adults,
            formData.children
          );
          if (!capacityCheck.valid) {
            toast.error(capacityCheck.reason);
            return;
          }
        }
      }

      // Validar disponibilidade ANTES de criar a reserva
      const roomIdToCheck = formData.room_id && formData.room_id !== "__none__" ? formData.room_id : null;
      
      if (roomIdToCheck) {
        // Verificar se o quarto está interditado ANTES de validar disponibilidade
        const { data: roomCheck } = await supabase
          .from("rooms")
          .select("is_blocked, room_number, name")
          .eq("id", roomIdToCheck)
          .single();
        
        if (roomCheck?.is_blocked === true) {
          toast.error(`O quarto ${roomCheck.room_number || roomCheck.name || ""} está interditado e não pode receber reservas`);
          setLoading(false);
          return;
        }
        
        // Validar disponibilidade do quarto específico
        const availabilityCheck = await validateRoomAvailability(
          roomIdToCheck,
          formData.checkin_date,
          formData.checkout_date,
          reservationId || undefined
        );

        if (!availabilityCheck.available) {
          toast.error(availabilityCheck.reason || "Quarto não está disponível neste período");
          setLoading(false);
          return;
        }
      } else {
        // Validar disponibilidade por categoria (sem quarto específico)
        const categoryAvailability = await validateCategoryAvailability(
          formData.category_id,
          formData.checkin_date,
          formData.checkout_date,
          reservationId || undefined
        );

        if (!categoryAvailability.available) {
          toast.error(categoryAvailability.reason || "Nenhum quarto disponível neste período");
          setLoading(false);
          return;
        }
      }


      // Determinar status baseado na ação e pagamento
      // IMPORTANTE: Nunca usar "checkedin" ao criar uma nova reserva
      // "checkedin" só deve ser usado quando o check-in é realizado
      // NOVA LÓGICA:
      // - "unpaid": reserva sem pagamento (padrão para novas reservas)
      // - "confirmed": reserva com pagamento completo (só quando há pagamento)
      // - "pending": reserva paga mas com taxas adicionais sem pagamento
      // - "blocked": bloqueio de quarto
      // - "preregistration": pré-reserva
      let status: "unpaid" | "pending" | "confirmed" | "blocked" | "preregistration" = "unpaid";
      if (isBlocked) {
        status = "blocked";
      } else if (isPreReservation) {
        status = "preregistration";
      } else {
        // Por padrão, criar como "unpaid" (sem pagamento)
        // O status será atualizado automaticamente quando o pagamento for lançado
        status = "unpaid";
      }

      // Limpar pricing_plan_id se estiver vazio
      const pricingPlanId = formData.pricing_plan_id && formData.pricing_plan_id.trim() !== "" 
        ? formData.pricing_plan_id 
        : null;

      const reservationData: any = {
        client_id: clientId as string,
        category_id: formData.category_id,
        room_id: formData.room_id && formData.room_id !== "__none__" ? formData.room_id : null,
        checkin_date: formData.checkin_date,
        checkout_date: formData.checkout_date,
        checkin_time: formData.checkin_time || null,
        checkout_time: formData.checkout_time || null,
        adults: isBlocked ? 0 : formData.adults,
        children: isBlocked ? 0 : formData.children,
        channel: formData.channel || "direct",
        pricing_plan_id: pricingPlanId,
        notes: (isBlocked ? `Bloqueio: ${blockReason}` : formData.notes) || null,
        total_amount: isBlocked ? 0 : calculatedTotal,
        status: status,
        // IMPORTANTE: Campos financeiros só devem ser incluídos para novas reservas
        // Para atualizações, esses campos serão preservados do currentReservation se não forem alterados
        ...(reservationId ? {} : {
          // IMPORTANTE: Toda nova reserva deve ser criada sem pagamento
          // O pagamento deve ser lançado separadamente através do modal de pagamento
          payment_status: "pending",
          paid_amount: 0,
        }),
      };

      // Adicionar guest_id e guest_name se houver responsável financeiro diferente
      if (hasFinancialResponsible) {
        // Modo duplo: Responsável financeiro diferente do hóspede
        // Usar foundGuestClientId se disponível (do estado atual), senão usar formData.guest_id
        const guestIdToUse = foundGuestClientId || formData.guest_id;
        const guestNameToUse = guestData.full_name || formData.guest_name || clientData.full_name;
        
        if (guestIdToUse) {
          reservationData.guest_id = guestIdToUse;
          reservationData.guest_name = guestNameToUse || null;
        } else {
          // Fallback: se não houver guest_id, usar o clientId (não deveria acontecer)
          reservationData.guest_id = clientId as string;
          reservationData.guest_name = guestNameToUse || null;
        }
      } else {
        // Modo simples: guest_id = client_id (mesmo cliente)
        reservationData.guest_id = clientId as string;
        reservationData.guest_name = (formData.guest_name || clientData.full_name) || null;
      }
      
      // Garantir que guest_name não seja string vazia
      if (reservationData.guest_name === "") {
        reservationData.guest_name = null;
      }

      // Adicionar data de expiração para pré-reserva
      if (isPreReservation && expirationDate) {
        // Criar data com timezone local
        // O PostgreSQL TIMESTAMPTZ armazena em UTC, então precisamos garantir que a data seja interpretada no timezone local
        const [year, month, day] = expirationDate.split('-').map(Number);
        const [hours, minutes] = expirationTime.split(':').map(Number);
        // Criar Date no timezone local (o construtor Date usa o timezone local)
        const expirationDateTimeObj = new Date(year, month - 1, day, hours, minutes, 0);
        // Converter para ISO string (que inclui timezone UTC)
        // Isso garante que a hora seja salva corretamente considerando o timezone local
        // Exemplo: se o usuário informa 23:59 no timezone local (UTC-3), será salvo como 02:59 UTC do dia seguinte
        // Mas quando comparado com NOW() no PostgreSQL, será comparado corretamente
        reservationData.expiration_date = expirationDateTimeObj.toISOString();
      }

      // Verificar se a data de check-in é no passado (apenas para novas reservas)
      if (!reservationId && formData.checkin_date) {
        // Criar data no timezone local para evitar problemas de conversão UTC
        // Parse da string "yyyy-MM-dd" como data local (não UTC)
        const [year, month, day] = formData.checkin_date.split('-').map(Number);
        const checkinDate = startOfDay(new Date(year, month - 1, day));
        const today = startOfDay(new Date());
        
        if (isBefore(checkinDate, today)) {
          // Data no passado: mostrar alerta antes de criar
          setPendingReservationData({
            ...reservationData,
            hasFinancialResponsible,
            financialClientId: foundFinancialClientId,
            guestId: foundGuestClientId || formData.guest_id,
            guestData,
            financialResponsibleData,
            isBlocked,
            isPreReservation,
            expirationDate: isPreReservation && expirationDate ? (() => {
              // Criar data com timezone local e converter para ISO string completo
              const [year, month, day] = expirationDate.split('-').map(Number);
              const [hours, minutes] = expirationTime.split(':').map(Number);
              const expirationDateTimeObj = new Date(year, month - 1, day, hours, minutes, 0);
              return expirationDateTimeObj.toISOString();
            })() : null,
            blockReason: isBlocked ? blockReason : null,
          });
          setShowPastDateAlert(true);
          setLoading(false);
          return;
        }
      }

      if (reservationId) {
        // Ao atualizar, garantir que guest_id e guest_name sejam preservados
        // Se não foram definidos no reservationData, tentar manter os valores existentes
        // IMPORTANTE: Remover payment_status e paid_amount do reservationData para não sobrescrever valores originais
        const { payment_status: _, paid_amount: __, ...reservationDataWithoutPayment } = reservationData;
        const updateData = { ...reservationDataWithoutPayment };
        
        // IMPORTANTE: Preservar campos que não devem ser alterados quando apenas o responsável é editado
        // SEMPRE buscar valores originais da reserva diretamente do banco para garantir preservação correta
        const { data: originalReservation } = await supabase
          .from("reservations")
          .select(`
            room_id, 
            category_id, 
            paid_amount, 
            total_amount, 
            payment_status, 
            status, 
            guest_id, 
            guest_name, 
            checkin_date, 
            checkout_date,
            client_id,
            financial_responsible:clients!client_id(full_name, email, phone, document_number, document_type),
            guest:clients!guest_id(full_name, email, phone, document_number, document_type)
          `)
          .eq("id", reservationId)
          .single();
        
        if (!originalReservation) {
          toast.error("Erro ao buscar dados originais da reserva");
          setLoading(false);
          return;
        }
        
        const originalRoomId = originalReservation.room_id;
        const originalCategoryId = originalReservation.category_id;
        const originalPaidAmount = originalReservation.paid_amount || 0;
        const originalTotalAmount = originalReservation.total_amount || 0;
        const originalPaymentStatus = originalReservation.payment_status || "pending";
        const originalStatus = originalReservation.status || "pending";
        const originalGuestId = originalReservation.guest_id;
        const originalGuestName = originalReservation.guest_name;
        const originalClientId = originalReservation.client_id;
        
        // IMPORTANTE: Atualizar perfil do responsável financeiro se os dados foram alterados
        let finalClientId = originalClientId;
        
        if (hasFinancialResponsible) {
          // Modo duplo: Verificar se os dados do responsável financeiro foram alterados
          const financialDataChanged = financialResponsibleData.full_name && (
            financialResponsibleData.full_name !== (originalReservation.financial_responsible?.full_name || "") ||
            financialResponsibleData.email !== (originalReservation.financial_responsible?.email || "") ||
            financialResponsibleData.phone !== (originalReservation.financial_responsible?.phone || "") ||
            financialResponsibleData.document_number !== (originalReservation.financial_responsible?.document_number || "")
          );
          
          if (financialDataChanged) {
            // Dados do responsável financeiro foram alterados, atualizar perfil
            if (foundFinancialClientId || originalClientId) {
              // Responsável financeiro já existe, atualizar perfil
              const financialIdToUpdate = foundFinancialClientId || originalClientId;
              const { error: updateFinancialError } = await supabase
                .from("clients")
                .update({
                  full_name: financialResponsibleData.full_name,
                  email: financialResponsibleData.email,
                  phone: financialResponsibleData.phone,
                  document_number: financialResponsibleData.document_number || null,
                  document_type: financialResponsibleData.document_type || null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", financialIdToUpdate);
              
              if (updateFinancialError) {
                console.error("Erro ao atualizar perfil do responsável financeiro:", updateFinancialError);
                toast.error("Erro ao atualizar perfil do responsável financeiro");
                setLoading(false);
                return;
              }
              
              finalClientId = financialIdToUpdate;
              toast.success(`Perfil do responsável financeiro "${financialResponsibleData.full_name}" atualizado!`);
            } else {
              // Responsável financeiro não existe, criar novo
              const { data: newFinancialClient, error: createFinancialError } = await supabase
                .from("clients")
                .insert([{
                  full_name: financialResponsibleData.full_name,
                  email: financialResponsibleData.email,
                  phone: financialResponsibleData.phone,
                  document_number: financialResponsibleData.document_number || null,
                  document_type: financialResponsibleData.document_type || null,
                  establishment_id: establishmentId || undefined,
                }])
                .select()
                .single();
              
              if (createFinancialError) {
                console.error("Erro ao criar responsável financeiro:", createFinancialError);
                toast.error("Erro ao criar responsável financeiro");
                setLoading(false);
                return;
              }
              
              finalClientId = newFinancialClient.id;
              toast.success(`Responsável financeiro "${financialResponsibleData.full_name}" cadastrado!`);
            }
          } else if (foundFinancialClientId) {
            // Usar o client_id encontrado se não houve alterações
            finalClientId = foundFinancialClientId;
          }
        } else {
          // Modo simples: Verificar se os dados do cliente foram alterados
          const clientDataChanged = clientData.full_name && (
            clientData.full_name !== (originalReservation.financial_responsible?.full_name || "") ||
            clientData.email !== (originalReservation.financial_responsible?.email || "") ||
            clientData.phone !== (originalReservation.financial_responsible?.phone || "") ||
            clientData.document_number !== (originalReservation.financial_responsible?.document_number || "")
          );
          
          if (clientDataChanged && originalClientId) {
            // Dados do cliente foram alterados, atualizar perfil
            const { error: updateClientError } = await supabase
              .from("clients")
              .update({
                full_name: clientData.full_name,
                email: clientData.email || null,
                phone: clientData.phone || null,
                document_number: clientData.document_number || null,
                document_type: clientData.document_type || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", originalClientId);
            
            if (updateClientError) {
              console.error("Erro ao atualizar perfil do cliente:", updateClientError);
              toast.error("Erro ao atualizar perfil do cliente");
              setLoading(false);
              return;
            }
            
            finalClientId = originalClientId;
            toast.success(`Perfil do cliente "${clientData.full_name}" atualizado!`);
          }
        }
        
        // Atualizar client_id na reserva se foi alterado
        updateData.client_id = finalClientId;
        
        // Preservar room_id se não foi alterado explicitamente
        if (!formData.room_id || formData.room_id === "__none__" || formData.room_id === "") {
          // Se room_id não foi alterado, manter o valor original da reserva
          updateData.room_id = originalRoomId;
          console.log("✅ Preservando room_id original:", originalRoomId?.substring(0, 8) || "null");
        }
        
        // Preservar category_id se não foi alterado explicitamente
        if (!formData.category_id || formData.category_id === "") {
          updateData.category_id = originalCategoryId;
          console.log("✅ Preservando category_id original:", originalCategoryId?.substring(0, 8) || "null");
        }
        
        // IMPORTANTE: Preservar valores financeiros e de pagamento que NÃO devem ser alterados ao editar dados do hóspede/responsável
        // Preservar paid_amount SEMPRE (não deve ser alterado ao editar dados do hóspede ou responsável)
        updateData.paid_amount = originalPaidAmount;
        console.log("✅ Preservando paid_amount original:", originalPaidAmount);
        
        // Preservar payment_status SEMPRE (não deve ser alterado ao editar dados do hóspede ou responsável)
        // Este campo só deve ser alterado através do modal de pagamento
        updateData.payment_status = originalPaymentStatus;
        console.log("✅ Preservando payment_status original:", originalPaymentStatus);
        
        // Preservar total_amount se não foi alterado explicitamente
        // Verificar se o calculatedTotal é diferente do valor original
        const newTotalAmount = isBlocked ? 0 : calculatedTotal;
        
        // Só atualizar total_amount se realmente mudou (e não é bloqueio)
        if (isBlocked) {
          // Para bloqueios, total_amount deve ser 0
          updateData.total_amount = 0;
        } else if (Math.abs(newTotalAmount - originalTotalAmount) > 0.01) {
          // Total mudou significativamente, atualizar
          updateData.total_amount = newTotalAmount;
          console.log("✅ Atualizando total_amount:", originalTotalAmount, "->", newTotalAmount);
        } else {
          // Total não mudou, preservar o original
          updateData.total_amount = originalTotalAmount;
          console.log("✅ Preservando total_amount original:", originalTotalAmount);
        }
        
        // Preservar status se não foi alterado explicitamente
        // Só atualizar status se realmente mudou (ex: de pending para confirmed)
        if (updateData.status && updateData.status !== originalStatus) {
          // Status foi alterado explicitamente, manter a alteração
          console.log("✅ Atualizando status:", originalStatus, "->", updateData.status);
        } else {
          // Status não foi alterado, preservar o original
          updateData.status = originalStatus;
          console.log("✅ Preservando status original:", originalStatus);
        }
        
        // IMPORTANTE: Atualizar perfil do hóspede se os dados foram alterados
        let finalGuestId = originalGuestId;
        let finalGuestName = originalGuestName;
        
        if (hasFinancialResponsible) {
          // Modo duplo: Responsável financeiro diferente do hóspede
          // Verificar se os dados do hóspede foram alterados
          const guestDataChanged = guestData.full_name && (
            guestData.full_name !== originalGuestName ||
            guestData.email !== (currentReservation?.guest?.email || "") ||
            guestData.phone !== (currentReservation?.guest?.phone || "") ||
            guestData.document_number !== (currentReservation?.guest?.document_number || "")
          );
          
          if (guestDataChanged) {
            // Dados do hóspede foram alterados, atualizar ou criar cliente
            if (foundGuestClientId || originalGuestId) {
              // Hóspede já existe, atualizar perfil
              const guestIdToUpdate = foundGuestClientId || originalGuestId;
              const { error: updateGuestError } = await supabase
                .from("clients")
                .update({
                  full_name: guestData.full_name,
                  email: guestData.email || null,
                  phone: guestData.phone || null,
                  document_number: guestData.document_number || null,
                  document_type: guestData.document_type || null,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", guestIdToUpdate);
              
              if (updateGuestError) {
                console.error("Erro ao atualizar perfil do hóspede:", updateGuestError);
                toast.error("Erro ao atualizar perfil do hóspede");
                setLoading(false);
                return;
              }
              
              finalGuestId = guestIdToUpdate;
              finalGuestName = guestData.full_name;
              toast.success(`Perfil do hóspede "${guestData.full_name}" atualizado!`);
            } else {
              // Hóspede não existe, criar novo
              const { data: newGuestClient, error: createGuestError } = await supabase
                .from("clients")
                .insert([{
                  full_name: guestData.full_name,
                  email: guestData.email || null,
                  phone: guestData.phone || null,
                  document_number: guestData.document_number || null,
                  document_type: guestData.document_type || null,
                  establishment_id: establishmentId || undefined,
                }])
                .select()
                .single();
              
              if (createGuestError) {
                console.error("Erro ao criar hóspede:", createGuestError);
                toast.error("Erro ao criar hóspede");
                setLoading(false);
                return;
              }
              
              finalGuestId = newGuestClient.id;
              finalGuestName = guestData.full_name;
              toast.success(`Hóspede "${guestData.full_name}" cadastrado!`);
            }
          } else {
            // Não houve alterações nos dados do hóspede
            // Preservar guest_id original, mas atualizar guest_name se foi alterado no formulário
            if (originalGuestId) {
              finalGuestId = originalGuestId;
            } else if (foundGuestClientId) {
              // Se não há guest_id original mas encontrou um novo, usar o encontrado
              finalGuestId = foundGuestClientId;
            }
            
            // Atualizar guest_name se foi alterado no formulário
            if (guestData.full_name && guestData.full_name !== originalGuestName) {
              finalGuestName = guestData.full_name;
            } else {
              finalGuestName = originalGuestName;
            }
          }
        } else {
          // Modo simples: Hóspede = Responsável Financeiro
          // Verificar se os dados do cliente foram alterados
          const clientDataChanged = clientData.full_name && (
            clientData.full_name !== (currentReservation?.financial_responsible?.full_name || "") ||
            clientData.email !== (currentReservation?.financial_responsible?.email || "") ||
            clientData.phone !== (currentReservation?.financial_responsible?.phone || "") ||
            clientData.document_number !== (currentReservation?.financial_responsible?.document_number || "")
          );
          
          if (clientDataChanged && originalGuestId) {
            // Dados do cliente foram alterados e há um guest_id, atualizar perfil
            const { error: updateClientError } = await supabase
              .from("clients")
              .update({
                full_name: clientData.full_name,
                email: clientData.email || null,
                phone: clientData.phone || null,
                document_number: clientData.document_number || null,
                document_type: clientData.document_type || null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", originalGuestId);
            
            if (updateClientError) {
              console.error("Erro ao atualizar perfil do cliente:", updateClientError);
              toast.error("Erro ao atualizar perfil do cliente");
              setLoading(false);
              return;
            }
            
            finalGuestId = originalGuestId;
            finalGuestName = clientData.full_name;
            toast.success(`Perfil do cliente "${clientData.full_name}" atualizado!`);
          }
        }
        
        // Atualizar guest_id e guest_name na reserva
        updateData.guest_id = finalGuestId;
        updateData.guest_name = finalGuestName;
        
        console.log("📋 Dados preservados na atualização:", {
          room_id: updateData.room_id?.substring(0, 8) || "null",
          category_id: updateData.category_id?.substring(0, 8) || "null",
          paid_amount: updateData.paid_amount,
          total_amount: updateData.total_amount,
          payment_status: updateData.payment_status,
          status: updateData.status,
          guest_id: updateData.guest_id?.substring(0, 8) || "null",
        });
        
        // Verificar se as datas foram alteradas (extensão ou alteração de período)
        // Usar as datas originais já buscadas acima
        const originalCheckin = originalReservation.checkin_date;
        const originalCheckout = originalReservation.checkout_date;
        console.log("✅ Datas originais obtidas do banco:", { originalCheckin, originalCheckout });
        
        const newCheckin = updateData.checkin_date;
        const newCheckout = updateData.checkout_date;
        
        // Normalizar datas para comparação (remover hora se houver)
        const normalizeDate = (dateStr: string | null | undefined): string | null => {
          if (!dateStr) return null;
          return dateStr.split('T')[0]; // Pegar apenas a parte da data (YYYY-MM-DD)
        };
        
        const normalizedOriginalCheckin = normalizeDate(originalCheckin);
        const normalizedOriginalCheckout = normalizeDate(originalCheckout);
        const normalizedNewCheckin = normalizeDate(newCheckin);
        const normalizedNewCheckout = normalizeDate(newCheckout);
        
        // Verificar se as datas foram alteradas (comparar strings de data normalizadas)
        const datesChanged = normalizedNewCheckin && normalizedNewCheckout && 
          normalizedOriginalCheckin && normalizedOriginalCheckout &&
          ((normalizedOriginalCheckin !== normalizedNewCheckin) || 
           (normalizedOriginalCheckout !== normalizedNewCheckout));
        
        console.log("🔍 Comparação de datas:", {
          originalCheckin: normalizedOriginalCheckin,
          originalCheckout: normalizedOriginalCheckout,
          newCheckin: normalizedNewCheckin,
          newCheckout: normalizedNewCheckout,
          datesChanged
        });
        
        // Se as datas foram alteradas, SEMPRE validar disponibilidade antes de atualizar
        if (datesChanged) {
          // Verificar se é uma extensão de reserva (checkout posterior)
          const isExtension = normalizedOriginalCheckout && normalizedNewCheckout &&
            isAfter(parseISO(normalizedNewCheckout), parseISO(normalizedOriginalCheckout));
          
          // Verificar se checkout foi reduzido (não é extensão)
          const isReduction = normalizedOriginalCheckout && normalizedNewCheckout &&
            isBefore(parseISO(normalizedNewCheckout), parseISO(normalizedOriginalCheckout));
          
          console.log("🔍 Validando alteração de datas:", {
            originalCheckin: normalizedOriginalCheckin,
            originalCheckout: normalizedOriginalCheckout,
            newCheckin: normalizedNewCheckin,
            newCheckout: normalizedNewCheckout,
            isExtension,
            isReduction,
            reservationId
          });
          
          // VALIDAÇÃO 1: Se for extensão, verificar se a nova data de check-out é posterior à atual
          if (isExtension) {
            console.log("📅 Extensão de reserva detectada");
            
            // Calcular noites adicionais
            const additionalNights = differenceInDays(
              parseISO(normalizedNewCheckout!),
              parseISO(normalizedOriginalCheckout!)
            );
            
            // VALIDAÇÃO 2: Verificar política de estadia máxima (se configurada)
            // Por enquanto, vamos apenas logar - pode ser expandido no futuro
            const totalNights = calculateNights(normalizedOriginalCheckin!, normalizedNewCheckout!);
            console.log(`📊 Total de noites após extensão: ${totalNights} (${additionalNights} noites adicionais)`);
            
            // VALIDAÇÃO 3: Verificar disponibilidade especificamente para o período de extensão
            const roomIdToCheck = updateData.room_id && updateData.room_id !== "__none__" ? updateData.room_id : null;
            
            if (!roomIdToCheck) {
              toast.error("Não é possível estender uma reserva sem quarto específico. Selecione um quarto primeiro.");
              setLoading(false);
              return;
            }
            
            // Verificar se o quarto está interditado ANTES de validar disponibilidade
            const { data: roomCheck, error: roomError } = await supabase
              .from("rooms")
              .select("is_blocked, room_number, name, status")
              .eq("id", roomIdToCheck)
              .single();
            
            if (roomError) {
              console.error("Erro ao verificar quarto:", roomError);
              toast.error("Erro ao verificar disponibilidade do quarto");
              setLoading(false);
              return;
            }
            
            if (roomCheck?.is_blocked === true) {
              toast.error(`❌ O quarto ${roomCheck.room_number || roomCheck.name || ""} está interditado e não pode receber extensões de reserva`);
              setLoading(false);
              return;
            }
            
            if (roomCheck?.status && !["available", "cleaning"].includes(roomCheck.status)) {
              toast.error(`❌ O quarto ${roomCheck.room_number || roomCheck.name || ""} está ${roomCheck.status === "maintenance" ? "em manutenção" : "indisponível"} e não pode receber extensões`);
              setLoading(false);
              return;
            }
            
            // VALIDAÇÃO 4: Verificar disponibilidade especificamente para o período de extensão
            // Verificar conflitos no período entre checkout original e novo checkout
            try {
              console.log("🔍 Verificando disponibilidade para período de extensão:", {
                extensionStart: normalizedOriginalCheckout,
                extensionEnd: normalizedNewCheckout,
                roomId: roomIdToCheck
              });
              
              // Verificar disponibilidade para o período completo (checkin original até novo checkout)
              const availabilityCheck = await validateRoomAvailability(
                roomIdToCheck,
                normalizedOriginalCheckin || newCheckin, // Usar checkin original
                normalizedNewCheckout || newCheckout, // Usar novo checkout
                reservationId // Excluir a reserva atual da verificação
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
                setLoading(false);
                return;
              }
              
              console.log("✅ Disponibilidade confirmada para extensão de reserva");
              toast.success(`✅ Extensão de ${additionalNights} noite(s) disponível! A reserva pode ser estendida até ${format(parseISO(normalizedNewCheckout!), "dd/MM/yyyy", { locale: ptBR })}.`, { duration: 4000 });
            } catch (error: any) {
              console.error("Erro ao validar disponibilidade para extensão:", error);
              toast.error("❌ Erro ao verificar disponibilidade para extensão. Tente novamente.");
              setLoading(false);
              return;
            }
          } else if (isReduction) {
            // Se checkout foi reduzido, apenas avisar (não precisa validar disponibilidade)
            console.log("📅 Redução de período detectada (checkout anterior)");
            // Permitir redução sem validação de disponibilidade
          } else {
            // Mudança de período (checkin ou checkout alterados, mas não é extensão)
            console.log("📅 Alteração de período detectada (não é extensão)");
            
            const roomIdToCheck = updateData.room_id && updateData.room_id !== "__none__" ? updateData.room_id : null;
            
            if (roomIdToCheck) {
              // Verificar se o quarto está interditado ANTES de validar disponibilidade
              const { data: roomCheck, error: roomError } = await supabase
                .from("rooms")
                .select("is_blocked, room_number, name")
                .eq("id", roomIdToCheck)
                .single();
              
              if (roomError) {
                console.error("Erro ao verificar quarto:", roomError);
                toast.error("Erro ao verificar disponibilidade do quarto");
                setLoading(false);
                return;
              }
              
              if (roomCheck?.is_blocked === true) {
                toast.error(`O quarto ${roomCheck.room_number || roomCheck.name || ""} está interditado e não pode receber reservas`);
                setLoading(false);
                return;
              }
              
              // Validar disponibilidade do quarto específico (excluindo a reserva atual)
              try {
                const availabilityCheck = await validateRoomAvailability(
                  roomIdToCheck,
                  normalizedNewCheckin || newCheckin,
                  normalizedNewCheckout || newCheckout,
                  reservationId // Excluir a reserva atual da verificação
                );

                if (!availabilityCheck.available) {
                  console.warn("❌ Disponibilidade não confirmada:", availabilityCheck.reason);
                  toast.error(availabilityCheck.reason || "Quarto não está disponível neste período");
                  setLoading(false);
                  return;
                }
                
                console.log("✅ Disponibilidade confirmada para o quarto");
              } catch (error: any) {
                console.error("Erro ao validar disponibilidade do quarto:", error);
                toast.error("Erro ao verificar disponibilidade. Tente novamente.");
                setLoading(false);
                return;
              }
            } else {
              // Validar disponibilidade por categoria (sem quarto específico)
              try {
                const categoryAvailability = await validateCategoryAvailability(
                  updateData.category_id,
                  normalizedNewCheckin || newCheckin,
                  normalizedNewCheckout || newCheckout,
                  reservationId // Excluir a reserva atual da verificação
                );

                if (!categoryAvailability.available) {
                  console.warn("❌ Disponibilidade não confirmada na categoria:", categoryAvailability.reason);
                  toast.error(categoryAvailability.reason || "Nenhum quarto disponível neste período");
                  setLoading(false);
                  return;
                }
                
                console.log("✅ Disponibilidade confirmada na categoria");
              } catch (error: any) {
                console.error("Erro ao validar disponibilidade da categoria:", error);
                toast.error("Erro ao verificar disponibilidade. Tente novamente.");
                setLoading(false);
                return;
              }
            }
          }
        } else {
          // Se as datas não mudaram, ainda assim validar se há quarto específico e se está interditado
          const roomIdToCheck = updateData.room_id && updateData.room_id !== "__none__" ? updateData.room_id : null;
          if (roomIdToCheck) {
            const { data: roomCheck } = await supabase
              .from("rooms")
              .select("is_blocked, room_number, name")
              .eq("id", roomIdToCheck)
              .single();
            
            if (roomCheck?.is_blocked === true) {
              toast.error(`O quarto ${roomCheck.room_number || roomCheck.name || ""} está interditado e não pode receber reservas`);
              setLoading(false);
              return;
            }
          }
        }
        
        await updateReservation({
          id: reservationId,
          ...updateData,
        });
        
        // Invalidar cache de reservas para atualizar a lista e o mapa
        queryClient.invalidateQueries({ queryKey: ["reservations"] });
        queryClient.refetchQueries({ queryKey: ["reservations"] });
        
        // Invalidar cache de clientes se os dados foram atualizados
        queryClient.invalidateQueries({ queryKey: ["clients"] });
        
        // Sair do modo de edição após salvar
        setIsEditMode(false);
        
        // Mostrar mensagem de sucesso
        toast.success("Reserva atualizada com sucesso!");
      } else {
        // Limpar campos opcionais que podem estar como string vazia
        const cleanReservationData = {
          ...reservationData,
          notes: reservationData.notes && reservationData.notes.trim() !== "" ? reservationData.notes : null,
          guest_name: reservationData.guest_name && reservationData.guest_name.trim() !== "" ? reservationData.guest_name : null,
          checkin_time: reservationData.checkin_time && reservationData.checkin_time.trim() !== "" ? reservationData.checkin_time : null,
          checkout_time: reservationData.checkout_time && reservationData.checkout_time.trim() !== "" ? reservationData.checkout_time : null,
        };
        
        // Validar campos obrigatórios antes de enviar
        if (!cleanReservationData.client_id) {
          toast.error("Cliente é obrigatório");
          setLoading(false);
          return;
        }
        if (!cleanReservationData.category_id) {
          toast.error("Categoria é obrigatória");
          setLoading(false);
          return;
        }
        if (!cleanReservationData.checkin_date) {
          toast.error("Data de check-in é obrigatória");
          setLoading(false);
          return;
        }
        if (!cleanReservationData.checkout_date) {
          toast.error("Data de check-out é obrigatória");
          setLoading(false);
          return;
        }
        
        console.log("📤 Dados da reserva a serem enviados:", cleanReservationData);
        
        await createReservation(cleanReservationData);
      }

      // Limpar formulário
      // Obter horários padrão do hotel
      const defaultCheckinTime = hotelSettings?.checkin_time 
        ? hotelSettings.checkin_time.substring(0, 5) 
        : "14:00";
      const defaultCheckoutTime = hotelSettings?.checkout_time 
        ? hotelSettings.checkout_time.substring(0, 5) 
        : "12:00";
      
      setFormData({
        client_id: "",
        category_id: "",
        room_id: "",
        checkin_date: "",
        checkout_date: "",
        checkin_time: defaultCheckinTime,
        checkout_time: defaultCheckoutTime,
        adults: 1,
        children: 0,
        channel: "direct",
        pricing_plan_id: "",
        notes: "",
      });
      setClientData({
        full_name: "",
        email: "",
        phone: "",
        document_number: "",
        document_type: "CPF",
      });
      setCreateNewClient(false);
      setPromotionCode("");
      setReservationAction(null);
      setExpirationDate("");
      setExpirationTime("23:59");
      setBlockReason("");

      // Invalidar cache de clientes se criou novo cliente
      if (createNewClient) {
        queryClient.invalidateQueries({ queryKey: ["clients"] });
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar reserva");
    } finally {
      setLoading(false);
      setCreatingClient(false);
    }
  };

  const selectedCategory = categories?.find((c) => c.id === formData.category_id);

  // Função para abrir modal de cancelamento
  const handleCancelReservation = () => {
    if (!reservationId) return;
    setCancelDialogOpen(true);
  };

  // Função para confirmar cancelamento
  const handleConfirmCancel = async (reason: string, refundPayments: boolean) => {
    if (!reservationId) return;

    try {
      setLoading(true);
      await cancelReservation({ id: reservationId, reason, refundPayments });
      onSuccess();
      onOpenChange(false);
      setCancelDialogOpen(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao cancelar reserva");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>
              {reservationId 
                ? (isEditMode ? "Editar Responsável" : "Detalhes da Reserva")
                : reservationAction === "blocked"
                ? "Bloquear Quarto"
                : reservationAction === "preregistration"
                ? "Criar Pré-reserva"
                : "Nova Reserva"}
            </span>
            {/* Ícone de Cancelar Reserva - só aparece em modo de visualização e se não estiver cancelada/checkedout */}
            {reservationId && !isEditMode && currentReservation && 
             !["cancelled", "checkedout"].includes(currentReservation.status) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancelReservation}
                disabled={loading}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                title="Cancelar reserva"
              >
                <Trash2 className="h-4 w-4" />
                <span className="text-xs">Cancelar Reserva</span>
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>
            {reservationId 
              ? (isEditMode 
                  ? "Edite os dados do responsável financeiro e/ou hóspede." 
                  : "Visualize os detalhes da reserva.")
              : "Preencha os dados da reserva do hóspede."}
          </DialogDescription>
        </DialogHeader>
        
        {/* Alerta de Reserva Cancelada */}
        {reservationId && !isEditMode && currentReservation?.status === "cancelled" && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-2">Reserva Cancelada</h3>
                <div className="space-y-1 text-sm text-red-800">
                  {currentReservation.cancelled_at && (
                    <div>
                      <span className="font-medium">Cancelada em: </span>
                      {format(parseISO(currentReservation.cancelled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </div>
                  )}
                  {currentReservation.cancelled_by_user && (
                    <div>
                      <span className="font-medium">Cancelada por: </span>
                      {currentReservation.cancelled_by_user.full_name || currentReservation.cancelled_by_user.email || "Usuário desconhecido"}
                    </div>
                  )}
                  {currentReservation.cancellation_reason && (
                    <div className="mt-2 pt-2 border-t border-red-200">
                      <span className="font-medium">Motivo: </span>
                      <span>{currentReservation.cancellation_reason}</span>
                    </div>
                  )}
                  {!currentReservation.cancelled_at && !currentReservation.cancelled_by_user && (
                    <div className="text-red-600 italic">
                      Informações de cancelamento não disponíveis
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Cliente - Oculto apenas para bloqueios */}
            {reservationAction !== "blocked" && (
              <div className="col-span-2">
                <div className={`space-y-4 p-4 border rounded-lg ${reservationId && !isEditMode ? 'bg-slate-50' : 'bg-muted/50'} relative`}>
                  {/* Ícone de Editar - só aparece em modo de visualização */}
                  {reservationId && !isEditMode && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditMode(true)}
                      className="absolute top-2 right-2 gap-2 h-8 px-2"
                      title="Editar dados do responsável e hóspede"
                    >
                      <Edit2 className="h-4 w-4" />
                      <span className="text-xs">Editar</span>
                    </Button>
                  )}
                  {/* Etapa 1: Busca inicial por documento */}
                  {searchStep === "initial" && (
                    <div className="space-y-4">
                <div className="flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Buscar Cliente por Documento</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <Label htmlFor="initial_document_type">Tipo de Documento *</Label>
                          <Select
                            value={initialSearchDocumentType}
                            onValueChange={(value) => setInitialSearchDocumentType(value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="CPF">CPF</SelectItem>
                              <SelectItem value="CNPJ">CNPJ</SelectItem>
                              <SelectItem value="RG">RG</SelectItem>
                              <SelectItem value="Passaporte">Passaporte</SelectItem>
                              <SelectItem value="CNH">CNH</SelectItem>
                              <SelectItem value="Outro">Outro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="col-span-2">
                          <Label htmlFor="initial_document_number">Número do Documento *</Label>
                          <div className="flex gap-2">
                            <Input
                              id="initial_document_number"
                              value={initialSearchDocument}
                              onChange={(e) => {
                                let value = e.target.value;
                                // Aplicar máscara baseado no tipo de documento
                                if (initialSearchDocumentType === "CNPJ") {
                                  value = formatCNPJ(value);
                                } else if (initialSearchDocumentType === "CPF") {
                                  value = formatCPF(value);
                                }
                                setInitialSearchDocument(value);
                              }}
                              placeholder={
                                initialSearchDocumentType === "CNPJ" 
                                  ? "00.000.000/0000-00" 
                                  : initialSearchDocumentType === "CPF"
                                  ? "000.000.000-00"
                                  : "Digite o número do documento"
                              }
                              maxLength={initialSearchDocumentType === "CNPJ" ? 18 : initialSearchDocumentType === "CPF" ? 14 : undefined}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  searchInitialClient();
                                }
                              }}
                            />
                            <Button
                              type="button"
                              onClick={searchInitialClient}
                              disabled={
                                searchingInitialClient || 
                                (initialSearchDocumentType === "CNPJ" && initialSearchDocument.replace(/\D/g, "").length < 14) ||
                                (initialSearchDocumentType !== "CNPJ" && initialSearchDocument.length < 5)
                              }
                            >
                              {searchingInitialClient ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Buscando...
                                </>
                              ) : (
                                "Buscar"
                              )}
                            </Button>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Digite o documento e clique em Buscar para localizar o cliente
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Etapa 2: Cliente encontrado - Escolher tipo */}
                  {searchStep === "found" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <UserPlus className="h-4 w-4 text-green-600" />
                            <span className="text-sm font-medium text-green-700">
                              Cliente Encontrado: {clientData.full_name}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            Documento: {clientData.document_type} {clientData.document_number}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {hasFinancialResponsible && !reservationId && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                // Trocar dados entre hóspede e responsável financeiro
                                // Usar guestData em vez de clientData no modo com responsável financeiro
                                const tempData = { ...guestData };
                                setGuestData({ ...financialResponsibleData });
                                setFinancialResponsibleData(tempData);
                                
                                // Trocar IDs também
                                const tempId = foundGuestClientId;
                                setFoundGuestClientId(foundFinancialClientId);
                                setFoundFinancialClientId(tempId);
                                
                                console.log("Troca realizada:", {
                                  novoGuestData: financialResponsibleData,
                                  novoFinancialData: tempData,
                                  novoGuestId: foundFinancialClientId,
                                  novoFinancialId: tempId
                                });
                                
                                toast.success("Dados trocados entre hóspede e responsável financeiro!");
                              }}
                              title="Trocar dados entre hóspede e responsável financeiro"
                            >
                              <ArrowLeftRight className="h-4 w-4" />
                            </Button>
                          )}
                          {!reservationId && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSearchStep("initial");
                                setInitialSearchDocument("");
                                setFoundGuestClientId(null);
                                setHasFinancialResponsible(false);
                                setFinancialResponsibleData({
                                  full_name: "",
                                  email: "",
                                  phone: "",
                                  document_number: "",
                                  document_type: "CPF",
                                });
                              }}
                            >
                              Nova Busca
                            </Button>
                          )}
                          {reservationId && (
                            <span className="text-xs text-slate-500">
                              (Editando reserva existente)
                            </span>
                          )}
                        </div>
                      </div>

                  {/* Tipo de Cliente - Aparece em nova reserva ou ao editar reserva existente */}
                  {(!reservationId || (reservationId && isEditMode)) && (
                    <div className="space-y-2">
                      <Label>Tipo de Cliente</Label>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            id="guest_only"
                            name="clientType"
                            checked={!hasFinancialResponsible}
                            onChange={() => {
                            if (hasFinancialResponsible) {
                              // Ao voltar para modo simples, consolidar dados
                              let consolidatedData = { full_name: "", email: "", phone: "", document_number: "", document_type: "CPF" };
                              let consolidatedId = null;
                              
                              // Priorizar dados do hóspede se existirem
                              if (guestData.full_name) {
                                consolidatedData = { ...guestData };
                                consolidatedId = foundGuestClientId;
                                toast.info("Dados do hóspede movidos para o cliente único.");
                              } else if (financialResponsibleData.full_name) {
                                // Se não houver hóspede, usar dados do responsável financeiro
                                consolidatedData = { ...financialResponsibleData };
                                consolidatedId = foundFinancialClientId;
                                toast.info("Dados do responsável financeiro movidos para o cliente único.");
                              }
                              
                              // Atualizar clientData e limpar os outros estados
                              setClientData(consolidatedData);
                              setFoundGuestClientId(consolidatedId);
                              
                              // Limpar estados do modo duplo
                              setGuestData({
                                full_name: "",
                                email: "",
                                phone: "",
                                document_number: "",
                                document_type: "CPF",
                              });
                              setFinancialResponsibleData({
                                full_name: "",
                                email: "",
                                phone: "",
                                document_number: "",
                                document_type: "CPF",
                              });
                              setFoundFinancialClientId(null);
                            }
                            setHasFinancialResponsible(false);
                          }}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="guest_only" className="font-normal cursor-pointer">
                          Hóspede é o responsável financeiro
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="radio"
                          id="has_financial"
                          name="clientType"
                          checked={hasFinancialResponsible}
                          onChange={() => {
                            if (!hasFinancialResponsible) {
                              // Mudando de modo simples para modo duplo
                              // Verificar se financialResponsibleData já tem dados (evitar duplicação)
                              if (!financialResponsibleData.full_name && clientData.full_name) {
                                // Mover dados do clientData para financialResponsibleData
                                setFinancialResponsibleData({ ...clientData });
                                setFoundFinancialClientId(foundGuestClientId);
                                toast.info("Dados do cliente encontrado movidos para Responsável Financeiro. Cadastre o hóspede abaixo.");
                              } else if (financialResponsibleData.full_name || guestData.full_name) {
                                // Já tem dados no modo duplo, apenas avisar
                                toast.info("Modo alterado para responsável financeiro diferente.");
                              }
                              
                              // Limpar clientData para evitar confusão
                        setClientData({
                          full_name: "",
                          email: "",
                          phone: "",
                          document_number: "",
                          document_type: "CPF",
                        });
                              setFoundGuestClientId(null);
                      }
                            setHasFinancialResponsible(true);
                    }}
                          className="h-4 w-4"
                  />
                        <Label htmlFor="has_financial" className="font-normal cursor-pointer">
                          Responsável financeiro diferente do hóspede
                  </Label>
                </div>
              </div>
                    </div>
                  )}

                  {/* Responsável Financeiro - Etapa Found */}
                  {hasFinancialResponsible && (
                    <div className="space-y-3 border-l-4 border-orange-500 pl-4 bg-orange-50/50 py-3 rounded-r">
                      <div>
                        <Label className="text-base font-semibold text-orange-900">
                          Responsável Financeiro
                        </Label>
                        <p className="text-xs text-slate-600 mt-1">
                          {foundFinancialClientId 
                            ? "Dados do responsável financeiro (já cadastrado)"
                            : "Pessoa responsável pelo pagamento da reserva"}
                        </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                          <Label htmlFor="financial_full_name">
                            Nome Completo * {foundFinancialClientId && <span className="text-green-600 ml-2">✓ Cadastrado</span>}
                          </Label>
                      <Input
                            id="financial_full_name"
                            value={financialResponsibleData.full_name}
                        onChange={(e) =>
                              setFinancialResponsibleData({ ...financialResponsibleData, full_name: e.target.value })
                        }
                            placeholder="Nome completo do responsável financeiro"
                            required={hasFinancialResponsible}
                            disabled={reservationId ? (!isEditMode) : false}
                            className={
                              reservationId && !isEditMode 
                                ? "bg-slate-100" 
                                : foundFinancialClientId ? "bg-green-50" : ""
                            }
                      />
                    </div>
                    <div>
                          <Label htmlFor="financial_email">Email *</Label>
                      <Input
                            id="financial_email"
                        type="email"
                            value={financialResponsibleData.email}
                        onChange={(e) =>
                              setFinancialResponsibleData({ ...financialResponsibleData, email: e.target.value })
                        }
                        placeholder="email@exemplo.com"
                            required={hasFinancialResponsible}
                            disabled={reservationId ? (!isEditMode) : false}
                            className={
                              reservationId && !isEditMode 
                                ? "bg-slate-100" 
                                : foundFinancialClientId ? "bg-green-50" : ""
                            }
                      />
                    </div>
                    <div>
                          <Label htmlFor="financial_phone">Telefone *</Label>
                      <Input
                            id="financial_phone"
                            value={financialResponsibleData.phone}
                        onChange={(e) =>
                              setFinancialResponsibleData({ ...financialResponsibleData, phone: e.target.value })
                        }
                        placeholder="(00) 00000-0000"
                            required={hasFinancialResponsible}
                            disabled={reservationId ? (!isEditMode) : false}
                            className={
                              reservationId && !isEditMode 
                                ? "bg-slate-100" 
                                : foundFinancialClientId ? "bg-green-50" : ""
                            }
                      />
                    </div>
                    <div>
                          <Label htmlFor="financial_document_type">Tipo de Documento</Label>
                      <Select
                            value={financialResponsibleData.document_type}
                            onValueChange={(value) => {
                              setFinancialResponsibleData({ ...financialResponsibleData, document_type: value, document_number: "" });
                              setFoundFinancialClientId(null); // Resetar quando mudar o tipo
                            }}
                            disabled={reservationId ? (!isEditMode) : false}
                      >
                        <SelectTrigger className={reservationId && !isEditMode ? "bg-slate-100" : ""}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CPF">CPF</SelectItem>
                          <SelectItem value="RG">RG</SelectItem>
                          <SelectItem value="Passaporte">Passaporte</SelectItem>
                          <SelectItem value="CNH">CNH</SelectItem>
                              <SelectItem value="Outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                          <Label htmlFor="financial_document_number">
                            Número do Documento {searchingFinancialClient && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                          </Label>
                      <Input
                            id="financial_document_number"
                            value={financialResponsibleData.document_number}
                            onChange={(e) => {
                              let value = e.target.value;
                              // Aplicar máscara baseado no tipo de documento
                              if (financialResponsibleData.document_type === "CNPJ") {
                                value = formatCNPJ(value);
                              } else if (financialResponsibleData.document_type === "CPF") {
                                value = formatCPF(value);
                              }
                              setFinancialResponsibleData({ ...financialResponsibleData, document_number: value });
                              setFoundFinancialClientId(null); // Resetar quando mudar
                            }}
                            onBlur={(e) => {
                              if (e.target.value.length >= 5 && (isEditMode || !reservationId)) {
                                searchClientByDocument(e.target.value, financialResponsibleData.document_type, true);
                              }
                            }}
                        placeholder={
                          financialResponsibleData.document_type === "CNPJ" 
                            ? "00.000.000/0000-00" 
                            : financialResponsibleData.document_type === "CPF"
                            ? "000.000.000-00"
                            : "Digite o número do documento"
                        }
                        maxLength={financialResponsibleData.document_type === "CNPJ" ? 18 : financialResponsibleData.document_type === "CPF" ? 14 : undefined}
                            disabled={reservationId ? (!isEditMode) : false}
                            className={
                              foundFinancialClientId 
                                ? "border-green-500 bg-green-50" 
                                : (reservationId && !isEditMode ? "bg-slate-100" : "")
                            }
                      />
                          {foundFinancialClientId && (
                            <p className="text-xs text-green-600 mt-1">✓ Cliente encontrado no sistema</p>
                          )}
                    </div>
                  </div>
                </div>
                  )}

                  {/* Ícone de troca centralizado */}
                  {hasFinancialResponsible && (
                    <div className="flex justify-center my-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Trocar dados entre responsável financeiro e hóspede
                          const tempFinancial = { ...financialResponsibleData };
                          const tempGuest = { ...guestData };
                          const tempFinancialId = foundFinancialClientId;
                          const tempGuestId = foundGuestClientId;
                          
                          // Trocar os dados
                          setFinancialResponsibleData({
                            full_name: tempGuest.full_name || "",
                            email: tempGuest.email || "",
                            phone: tempGuest.phone || "",
                            document_number: tempGuest.document_number || "",
                            document_type: tempGuest.document_type || "CPF",
                          });
                          setGuestData({
                            full_name: tempFinancial.full_name || "",
                            email: tempFinancial.email || "",
                            phone: tempFinancial.phone || "",
                            document_number: tempFinancial.document_number || "",
                            document_type: tempFinancial.document_type || "CPF",
                          });
                          // Limpar os IDs encontrados para permitir edição após a troca
                          setFoundFinancialClientId(null);
                          setFoundGuestClientId(null);
                          
                          toast.success("Dados trocados entre Responsável Financeiro e Hóspede");
                        }}
                        className="h-10 w-10 rounded-full border-2 border-slate-300 hover:border-blue-500 hover:bg-blue-50 shadow-sm"
                        title="Trocar dados entre Responsável Financeiro e Hóspede"
                        disabled={reservationId && !isEditMode}
                      >
                        <ArrowLeftRight className="h-5 w-5 text-slate-600" />
                      </Button>
                </div>
                  )}

                  {/* Dados do Hóspede */}
                  <div className={cn(
                    "space-y-3 rounded",
                    hasFinancialResponsible && "border-l-4 border-blue-500 pl-4 bg-blue-50/50 py-3 rounded-r"
                  )}>
                    {hasFinancialResponsible && (
                      <div>
                        <Label className="text-base font-semibold text-blue-900">
                          Dados do Hóspede
                        </Label>
                        <p className="text-xs text-slate-600 mt-1">
                          Pessoa que ficará hospedada (receberá informações da reserva)
                        </p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Label htmlFor="guest_full_name">
                          Nome Completo * {foundGuestClientId && hasFinancialResponsible && <span className="text-green-600 ml-2">✓ Cadastrado</span>}
                        </Label>
                        <Input
                          id="guest_full_name"
                          value={hasFinancialResponsible ? guestData.full_name : clientData.full_name}
                          onChange={(e) => {
                            if (hasFinancialResponsible) {
                              setGuestData({ ...guestData, full_name: e.target.value });
                            } else {
                              setClientData({ ...clientData, full_name: e.target.value });
                            }
                          }}
                          placeholder="Nome completo do hóspede"
                  required
                          disabled={reservationId ? (!isEditMode) : (!hasFinancialResponsible && foundGuestClientId !== null)}
                          className={
                            reservationId && !isEditMode 
                              ? "bg-slate-100" 
                              : (foundGuestClientId && hasFinancialResponsible) ? "bg-green-50" : ""
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="guest_email">Email</Label>
                        <Input
                          id="guest_email"
                          type="email"
                          value={hasFinancialResponsible ? guestData.email : clientData.email}
                          onChange={(e) => {
                            if (hasFinancialResponsible) {
                              setGuestData({ ...guestData, email: e.target.value });
                            } else {
                              setClientData({ ...clientData, email: e.target.value });
                            }
                          }}
                          placeholder="email@exemplo.com"
                          disabled={reservationId ? (!isEditMode) : (!hasFinancialResponsible && foundGuestClientId !== null)}
                          className={
                            reservationId && !isEditMode 
                              ? "bg-slate-100" 
                              : (foundGuestClientId && hasFinancialResponsible) ? "bg-green-50" : ""
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="guest_phone">Telefone</Label>
                        <Input
                          id="guest_phone"
                          value={hasFinancialResponsible ? guestData.phone : clientData.phone}
                          onChange={(e) => {
                            if (hasFinancialResponsible) {
                              setGuestData({ ...guestData, phone: e.target.value });
                            } else {
                              setClientData({ ...clientData, phone: e.target.value });
                            }
                          }}
                          placeholder="(00) 00000-0000"
                          disabled={reservationId ? (!isEditMode) : (!hasFinancialResponsible && foundGuestClientId !== null)}
                          className={
                            reservationId && !isEditMode 
                              ? "bg-slate-100" 
                              : (foundGuestClientId && hasFinancialResponsible) ? "bg-green-50" : ""
                          }
                        />
                      </div>
                      <div>
                        <Label htmlFor="guest_document_type">Tipo de Documento</Label>
                        <Select
                          value={hasFinancialResponsible ? guestData.document_type : clientData.document_type}
                          onValueChange={(value) => {
                            if (hasFinancialResponsible) {
                              setGuestData({ ...guestData, document_type: value, document_number: "" });
                            } else {
                              setClientData({ ...clientData, document_type: value, document_number: "" });
                            }
                            setFoundGuestClientId(null); // Resetar quando mudar o tipo
                          }}
                          disabled={reservationId ? (!isEditMode) : (hasFinancialResponsible ? false : foundGuestClientId !== null)}
                >
                  <SelectTrigger className={reservationId && !isEditMode ? "bg-slate-100" : ""}>
                            <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                            <SelectItem value="CPF">CPF</SelectItem>
                            <SelectItem value="RG">RG</SelectItem>
                            <SelectItem value="Passaporte">Passaporte</SelectItem>
                            <SelectItem value="CNH">CNH</SelectItem>
                            <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
                      </div>
                      <div>
                        <Label htmlFor="guest_document_number">
                          Número do Documento {searchingGuestClient && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                        </Label>
                        <Input
                          id="guest_document_number"
                          value={hasFinancialResponsible ? guestData.document_number : clientData.document_number}
                          onChange={(e) => {
                            let value = e.target.value;
                            const docType = hasFinancialResponsible ? guestData.document_type : clientData.document_type;
                            // Aplicar máscara baseado no tipo de documento
                            if (docType === "CNPJ") {
                              value = formatCNPJ(value);
                            } else if (docType === "CPF") {
                              value = formatCPF(value);
                            }
                            if (hasFinancialResponsible) {
                              setGuestData({ ...guestData, document_number: value });
                            } else {
                              setClientData({ ...clientData, document_number: value });
                            }
                            setFoundGuestClientId(null); // Resetar quando mudar
                          }}
                          onBlur={(e) => {
                            if (e.target.value.length >= 5 && (isEditMode || !reservationId)) {
                              const docType = hasFinancialResponsible ? guestData.document_type : clientData.document_type;
                              const isSimpleMode = !hasFinancialResponsible;
                              searchClientByDocument(e.target.value, docType, false, isSimpleMode);
                            }
                          }}
                          placeholder={
                            (hasFinancialResponsible ? guestData.document_type : clientData.document_type) === "CNPJ" 
                              ? "00.000.000/0000-00" 
                              : (hasFinancialResponsible ? guestData.document_type : clientData.document_type) === "CPF"
                              ? "000.000.000-00"
                              : "Digite o número do documento"
                          }
                          maxLength={(hasFinancialResponsible ? guestData.document_type : clientData.document_type) === "CNPJ" ? 18 : (hasFinancialResponsible ? guestData.document_type : clientData.document_type) === "CPF" ? 14 : undefined}
                          disabled={reservationId ? (!isEditMode) : (hasFinancialResponsible ? false : foundGuestClientId !== null)}
                          className={
                            foundGuestClientId 
                              ? "border-green-500 bg-green-50" 
                              : (reservationId && !isEditMode ? "bg-slate-100" : "")
                          }
                        />
                        {foundGuestClientId && (
                          <p className="text-xs text-green-600 mt-1">✓ Cliente encontrado no sistema</p>
                        )}
                      </div>
                    </div>
                  </div>
                    </div>
                  )}
                  
                  {/* Etapa 3: Cliente não encontrado - Cadastrar novo */}
                  {searchStep === "not_found" && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <UserPlus className="h-4 w-4 text-orange-600" />
                            <span className="text-sm font-medium text-orange-700">
                              Cliente Não Encontrado - Cadastrar Novo
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">
                            Documento: {initialSearchDocumentType} {initialSearchDocument}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSearchStep("initial");
                            setInitialSearchDocument("");
                            setClientData({
                              full_name: "",
                              email: "",
                              phone: "",
                              document_number: "",
                              document_type: "CPF",
                            });
                          }}
                        >
                          Nova Busca
                        </Button>
                      </div>

                      {/* Tipo de Cliente para cadastro */}
                      <div className="space-y-2">
                        <Label>Tipo de Cliente</Label>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="guest_only_new"
                              name="clientType_new"
                              checked={!hasFinancialResponsible}
                              onChange={() => setHasFinancialResponsible(false)}
                              className="h-4 w-4"
                            />
                            <Label htmlFor="guest_only_new" className="font-normal cursor-pointer">
                              Hóspede é o responsável financeiro
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="radio"
                              id="has_financial_new"
                              name="clientType_new"
                              checked={hasFinancialResponsible}
                              onChange={() => setHasFinancialResponsible(true)}
                              className="h-4 w-4"
                            />
                            <Label htmlFor="has_financial_new" className="font-normal cursor-pointer">
                              Responsável financeiro diferente do hóspede
                            </Label>
                          </div>
                        </div>
                      </div>

                      {/* Formulário de cadastro (reutilizar o existente) */}
                      {/* Responsável Financeiro */}
                      {hasFinancialResponsible && (
                        <div className="space-y-3 border-l-4 border-orange-500 pl-4 bg-orange-50/50 py-3 rounded-r">
                          <div>
                            <Label className="text-base font-semibold text-orange-900">
                              Responsável Financeiro
                            </Label>
                            <p className="text-xs text-slate-600 mt-1">
                              Pessoa responsável pelo pagamento da reserva
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <Label htmlFor="financial_full_name_new">Nome Completo *</Label>
                              <Input
                                id="financial_full_name_new"
                                value={financialResponsibleData.full_name}
                                onChange={(e) =>
                                  setFinancialResponsibleData({ ...financialResponsibleData, full_name: e.target.value })
                                }
                                placeholder="Nome completo do responsável financeiro"
                                required={hasFinancialResponsible}
                              />
                            </div>
                            <div>
                              <Label htmlFor="financial_email_new">Email *</Label>
                              <Input
                                id="financial_email_new"
                                type="email"
                                value={financialResponsibleData.email}
                                onChange={(e) =>
                                  setFinancialResponsibleData({ ...financialResponsibleData, email: e.target.value })
                                }
                                placeholder="email@exemplo.com"
                                required={hasFinancialResponsible}
                              />
                            </div>
                            <div>
                              <Label htmlFor="financial_phone_new">Telefone *</Label>
                              <Input
                                id="financial_phone_new"
                                value={financialResponsibleData.phone}
                                onChange={(e) =>
                                  setFinancialResponsibleData({ ...financialResponsibleData, phone: e.target.value })
                                }
                                placeholder="(00) 00000-0000"
                                required={hasFinancialResponsible}
                              />
                            </div>
                            <div>
                              <Label htmlFor="financial_document_type_new">Tipo de Documento</Label>
                              <Select
                                value={financialResponsibleData.document_type}
                                onValueChange={(value) => {
                                  setFinancialResponsibleData({ ...financialResponsibleData, document_type: value, document_number: "" });
                                  setFoundFinancialClientId(null);
                                }}
                >
                  <SelectTrigger>
                                  <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                                  <SelectItem value="CPF">CPF</SelectItem>
                                  <SelectItem value="CNPJ">CNPJ</SelectItem>
                                  <SelectItem value="RG">RG</SelectItem>
                                  <SelectItem value="Passaporte">Passaporte</SelectItem>
                                  <SelectItem value="CNH">CNH</SelectItem>
                                  <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
                            </div>
                            <div>
                              <Label htmlFor="financial_document_number_new">
                                Número do Documento {searchingFinancialClient && <Loader2 className="inline h-3 w-3 animate-spin ml-1" />}
                              </Label>
                              <Input
                                id="financial_document_number_new"
                                value={financialResponsibleData.document_number}
                                onChange={(e) => {
                                  let value = e.target.value;
                                  // Aplicar máscara baseado no tipo de documento
                                  if (financialResponsibleData.document_type === "CNPJ") {
                                    value = formatCNPJ(value);
                                  } else if (financialResponsibleData.document_type === "CPF") {
                                    value = formatCPF(value);
                                  }
                                  setFinancialResponsibleData({ ...financialResponsibleData, document_number: value });
                                  setFoundFinancialClientId(null);
                                }}
                                onBlur={(e) => {
                                  if (e.target.value.length >= 5) {
                                    searchClientByDocument(e.target.value, financialResponsibleData.document_type, true);
                                  }
                                }}
                                placeholder={
                                  financialResponsibleData.document_type === "CNPJ" 
                                    ? "00.000.000/0000-00" 
                                    : financialResponsibleData.document_type === "CPF"
                                    ? "000.000.000-00"
                                    : "Digite o número do documento"
                                }
                                maxLength={financialResponsibleData.document_type === "CNPJ" ? 18 : financialResponsibleData.document_type === "CPF" ? 14 : undefined}
                                className={foundFinancialClientId ? "border-green-500 bg-green-50" : ""}
                              />
                              {foundFinancialClientId && (
                                <p className="text-xs text-green-600 mt-1">✓ Cliente encontrado no sistema</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Ícone de troca centralizado */}
                      {hasFinancialResponsible && (
                        <div className="flex justify-center my-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              // Trocar dados entre responsável financeiro e hóspede
                              // Na seção "not_found", os dados do hóspede estão em clientData
                              const tempFinancial = { ...financialResponsibleData };
                              const tempGuest = searchStep === "not_found" ? { ...clientData } : { ...guestData };
                              const tempFinancialId = foundFinancialClientId;
                              const tempGuestId = foundGuestClientId;
                              
                              // Trocar os dados
                              setFinancialResponsibleData({
                                full_name: tempGuest.full_name || "",
                                email: tempGuest.email || "",
                                phone: tempGuest.phone || "",
                                document_number: tempGuest.document_number || "",
                                document_type: tempGuest.document_type || "CPF",
                              });
                              
                              if (searchStep === "not_found") {
                                // Na seção "not_found", atualizar clientData
                                setClientData({
                                  full_name: tempFinancial.full_name || "",
                                  email: tempFinancial.email || "",
                                  phone: tempFinancial.phone || "",
                                  document_number: tempFinancial.document_number || "",
                                  document_type: tempFinancial.document_type || "CPF",
                                });
                              } else {
                                // Na seção "found", atualizar guestData
                                setGuestData({
                                  full_name: tempFinancial.full_name || "",
                                  email: tempFinancial.email || "",
                                  phone: tempFinancial.phone || "",
                                  document_number: tempFinancial.document_number || "",
                                  document_type: tempFinancial.document_type || "CPF",
                                });
                              }
                              
                              // Limpar os IDs encontrados para permitir edição após a troca
                              setFoundFinancialClientId(null);
                              setFoundGuestClientId(null);
                              
                              toast.success("Dados trocados entre Responsável Financeiro e Hóspede");
                            }}
                            className="h-10 w-10 rounded-full border-2 border-slate-300 hover:border-blue-500 hover:bg-blue-50 shadow-sm"
                            title="Trocar dados entre Responsável Financeiro e Hóspede"
                            disabled={reservationId && !isEditMode}
                          >
                            <ArrowLeftRight className="h-5 w-5 text-slate-600" />
                          </Button>
                        </div>
                      )}

                      {/* Dados do Hóspede (documento pré-preenchido) */}
                      <div className={cn(
                        "space-y-3 rounded",
                        hasFinancialResponsible && "border-l-4 border-blue-500 pl-4 bg-blue-50/50 py-3 rounded-r"
                      )}>
                        {hasFinancialResponsible && (
                          <div>
                            <Label className="text-base font-semibold text-blue-900">
                              Dados do Hóspede
                            </Label>
                            <p className="text-xs text-slate-600 mt-1">
                              Pessoa que ficará hospedada (receberá informações da reserva)
                            </p>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2">
                            <Label htmlFor="guest_full_name_new">Nome Completo *</Label>
                            <Input
                              id="guest_full_name_new"
                              value={clientData.full_name}
                              onChange={(e) => setClientData({ ...clientData, full_name: e.target.value })}
                              placeholder="Nome completo do hóspede"
                              required
                            />
                          </div>
                          <div>
                            <Label htmlFor="guest_email_new">Email</Label>
                              <Input
                                id="guest_email_new"
                                type="email"
                                value={clientData.email}
                                onChange={(e) => setClientData({ ...clientData, email: e.target.value })}
                                placeholder="email@exemplo.com"
                                disabled={reservationId && !isEditMode}
                                className={reservationId && !isEditMode ? "bg-slate-100" : ""}
                              />
                          </div>
                          <div>
                            <Label htmlFor="guest_phone_new">Telefone</Label>
                              <Input
                                id="guest_phone_new"
                                value={clientData.phone}
                                onChange={(e) => setClientData({ ...clientData, phone: e.target.value })}
                                placeholder="(00) 00000-0000"
                                disabled={reservationId && !isEditMode}
                                className={reservationId && !isEditMode ? "bg-slate-100" : ""}
                              />
                          </div>
                          <div>
                            <Label htmlFor="guest_document_type_new">Tipo de Documento</Label>
                              <Input
                                id="guest_document_type_new"
                                value={clientData.document_type}
                                disabled
                                className="bg-slate-100"
                                title="Tipo de documento do hóspede"
                              />
                          </div>
                          <div>
                            <Label htmlFor="guest_document_number_new">Número do Documento</Label>
                              <Input
                                id="guest_document_number_new"
                                value={clientData.document_number}
                                disabled
                                className="bg-slate-100"
                                title="Documento do hóspede (não editável)"
                              />
                              {(!reservationId || isEditMode) && (
                                <p className="text-xs text-slate-500 mt-1">Documento informado na busca</p>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Categoria - Desabilitado se vier de initialData */}
            <div>
              <Label htmlFor="category_id">Categoria *</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, category_id: value, room_id: "" })
                }
                required
                disabled={!!(initialData?.category_id && !reservationId)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name} - {formatCurrency(category.base_price)}/noite
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Canal */}
            <div>
              <Label htmlFor="channel">Canal</Label>
              <Select
                value={formData.channel}
                onValueChange={(value) =>
                  setFormData({ ...formData, channel: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direto</SelectItem>
                  <SelectItem value="booking">Booking.com</SelectItem>
                  <SelectItem value="airbnb">Airbnb</SelectItem>
                  <SelectItem value="expedia">Expedia</SelectItem>
                  <SelectItem value="other">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Plano Tarifário */}
            <div>
              <Label htmlFor="pricing_plan">Plano Tarifário</Label>
              <Select
                value={formData.pricing_plan_id || "__none__"}
                onValueChange={(value) =>
                  setFormData({ ...formData, pricing_plan_id: value === "__none__" ? "" : value })
                }
              >
                <SelectTrigger id="pricing_plan">
                  <SelectValue placeholder="Selecione um plano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum (Usar padrão)</SelectItem>
                  {ratePlans
                    .filter(plan => plan.is_active)
                    .map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.name} {plan.code ? `(${plan.code})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Check-in - Desabilitado se vier de initialData */}
            <div>
              <Label htmlFor="checkin_date">Check-in *</Label>
              <Input
                id="checkin_date"
                type="date"
                value={formData.checkin_date}
                onChange={(e) =>
                  setFormData({ ...formData, checkin_date: e.target.value })
                }
                min={new Date().toISOString().split("T")[0]}
                required
                disabled={!!(initialData?.checkin_date && !reservationId) || (reservationId && !isEditMode)}
              />
            </div>

            {/* Horário de Check-in */}
            <div>
              <Label htmlFor="checkin_time">Horário Check-in</Label>
              <Input
                id="checkin_time"
                type="time"
                value={formData.checkin_time}
                onChange={(e) =>
                  setFormData({ ...formData, checkin_time: e.target.value })
                }
                disabled={reservationId && !isEditMode}
              />
            </div>

            {/* Check-out - Desabilitado se vier de initialData */}
            <div>
              <Label htmlFor="checkout_date">Check-out *</Label>
              <Input
                id="checkout_date"
                type="date"
                value={formData.checkout_date}
                onChange={(e) =>
                  setFormData({ ...formData, checkout_date: e.target.value })
                }
                min={
                  formData.checkin_date
                    ? new Date(
                        new Date(formData.checkin_date).getTime() +
                          24 * 60 * 60 * 1000
                      )
                        .toISOString()
                        .split("T")[0]
                    : new Date().toISOString().split("T")[0]
                }
                required
                disabled={!!(initialData?.checkout_date && !reservationId) || (reservationId && !isEditMode)}
              />
            </div>

            {/* Horário de Check-out */}
            <div>
              <Label htmlFor="checkout_time">Horário Check-out</Label>
              <Input
                id="checkout_time"
                type="time"
                value={formData.checkout_time}
                onChange={(e) =>
                  setFormData({ ...formData, checkout_time: e.target.value })
                }
                disabled={reservationId && !isEditMode}
              />
            </div>

            {/* Adultos */}
            <div>
              <Label htmlFor="adults">Adultos *</Label>
              <Input
                id="adults"
                type="number"
                min="1"
                max={selectedCategory?.capacity_adults || 10}
                value={formData.adults}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    adults: parseInt(e.target.value) || 1,
                  })
                }
                required
              />
              {selectedCategory && (
                <p className="text-xs text-muted-foreground mt-1">
                  Máximo: {selectedCategory.capacity_adults}
                </p>
              )}
            </div>

            {/* Crianças */}
            <div>
              <Label htmlFor="children">Crianças</Label>
              <Input
                id="children"
                type="number"
                min="0"
                max={
                  selectedCategory
                    ? selectedCategory.capacity_children
                    : 10
                }
                value={formData.children}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    children: parseInt(e.target.value) || 0,
                  })
                }
              />
              {selectedCategory && (
                <p className="text-xs text-muted-foreground mt-1">
                  Máximo: {selectedCategory.capacity_children}
                </p>
              )}
            </div>

            {/* Quarto (opcional) - Oculto se vier de initialData (mapa de reservas) */}
            {!(initialData?.room_id && !reservationId) && (
              <div className="col-span-2">
                <Label htmlFor="room_id">Quarto (opcional)</Label>
                {loadingRooms ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Buscando quartos disponíveis...
                  </div>
                ) : (
                  <Select
                    value={formData.room_id || "__none__"}
                    onValueChange={async (value) => {
                      const roomId = value === "__none__" ? "" : value;
                      
                      // Verificar se o quarto selecionado está interditado
                      if (roomId) {
                        const { data: selectedRoom } = await supabase
                          .from("rooms")
                          .select("is_blocked, room_number, name")
                          .eq("id", roomId)
                          .single();
                        
                        if (selectedRoom?.is_blocked === true) {
                          toast.error(`O quarto ${selectedRoom.room_number || selectedRoom.name || ""} está interditado e não pode receber reservas`);
                          return; // Não atualizar o formData
                        }
                      }
                      
                      setFormData({ ...formData, room_id: roomId });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um quarto (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Não atribuir agora</SelectItem>
                      {availableRooms.map((room) => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.room_number} {room.floor && `- Andar ${room.floor}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {formData.category_id &&
                  formData.checkin_date &&
                  formData.checkout_date &&
                  availableRooms.length === 0 &&
                  !loadingRooms && (
                    <p className="text-xs text-warning mt-1">
                      Nenhum quarto disponível neste período
                    </p>
                  )}
              </div>
            )}

            {/* Código de Promoção */}
            <div className="col-span-2">
              <Label htmlFor="promotion_code">Código de Promoção (opcional)</Label>
              <Input
                id="promotion_code"
                value={promotionCode}
                onChange={(e) => setPromotionCode(e.target.value.toUpperCase())}
                placeholder="Digite o código da promoção"
              />
            </div>

            {/* Total calculado */}
            {calculatedTotal > 0 && (
              <div className="col-span-2 p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total estimado:</span>
                  {calculatingPrice ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <span className="text-2xl font-bold text-primary">
                      {formatCurrency(calculatedTotal)}
                    </span>
                  )}
                </div>
                {formData.checkin_date && formData.checkout_date && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {Math.ceil(
                      (new Date(formData.checkout_date).getTime() -
                        new Date(formData.checkin_date).getTime()) /
                        (1000 * 60 * 60 * 24)
                    )}{" "}
                    noite(s)
                    {promotionCode && (
                      <span className="text-success ml-2">• Promoção aplicada</span>
                    )}
                  </p>
                )}
              </div>
            )}

            {/* Motivo do Bloqueio - Apenas para bloqueios */}
            {reservationAction === "blocked" && (
              <div className="col-span-2">
                <Label htmlFor="block_reason">Motivo do Bloqueio *</Label>
                <Textarea
                  id="block_reason"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Ex: Manutenção, Limpeza, Reforma, etc."
                  rows={3}
                  required
                />
              </div>
            )}

            {/* Data de Expiração - Apenas para pré-reservas */}
            {reservationAction === "preregistration" && (
              <div className="col-span-2 grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="expiration_date">Data de Expiração *</Label>
                  <Input
                    id="expiration_date"
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="expiration_time">Hora de Expiração *</Label>
                  <Input
                    id="expiration_time"
                    type="time"
                    value={expirationTime}
                    onChange={(e) => setExpirationTime(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {/* Taxas / Consumo - apenas para reservas existentes */}
            {reservationId && !isEditMode && (
              <div className="col-span-2">
                <Label className="text-base font-semibold mb-3 block">Taxas / Consumo</Label>
                <div className="space-y-2 border rounded-lg p-4 bg-slate-50">
                  {serviceFees
                    .filter((fee: any) => fee.is_active)
                    .map((fee: any) => {
                      const existingFee = reservationServiceFees.find(
                        (rsf: any) => rsf.service_fees?.id === fee.id || rsf.service_fee_id === fee.id
                      );
                      const feeAmount = existingFee 
                        ? Number(existingFee.amount || 0) * Number(existingFee.quantity || 1)
                        : 0;

                      return (
                        <div
                          key={fee.id}
                          className="flex items-center justify-between p-3 border rounded-lg bg-white hover:bg-slate-50 transition-colors"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-sm">{fee.name}</div>
                            {existingFee && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Qtd: {existingFee.quantity} × {formatCurrency(existingFee.amount || 0)}
                                {existingFee.notes && ` - ${existingFee.notes}`}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right min-w-[100px]">
                              <div className="font-semibold">
                                {formatCurrency(feeAmount)}
                              </div>
                            </div>
                            {existingFee ? (
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
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
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
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
                                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedServiceFee(fee);
                                  setEditingServiceFee(null);
                                  setAddServiceFeeDialogOpen(true);
                                }}
                                title="Adicionar taxa"
                                className="h-8 w-8 p-0"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Observações */}
            <div className="col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={3}
                placeholder={reservationAction === "blocked" ? "Observações adicionais sobre o bloqueio" : "Observações sobre a reserva"}
                disabled={reservationId && !isEditMode}
              />
            </div>
          </div>

          {/* Resumo de Valores - apenas para reservas existentes */}
          {reservationId && !isEditMode && currentReservation && (
            <div className="grid grid-cols-3 gap-4 p-4 border-t bg-slate-50 rounded-lg">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Valor Total</div>
                <div className="text-lg font-bold text-blue-600">
                  {formatCurrency(totalWithFees)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Valor Pago</div>
                <div className="text-lg font-bold text-orange-600">
                  {formatCurrency(currentReservation.paid_amount || 0)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Valor Restante</div>
                <div className="text-lg font-bold text-red-600">
                  {formatCurrency(Math.max(0, totalWithFees - (currentReservation.paid_amount || 0)))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between gap-2">
            {/* Botão Lançar Pagamento - apenas para reservas existentes */}
            {reservationId && currentReservation && (
            <Button
              type="button"
              variant="outline"
                onClick={() => {
                  setPaymentModalOpen(true);
                }}
                className="gap-2"
            >
                <DollarSign className="h-4 w-4" />
                Lançar Pagamento
            </Button>
            )}
            
            <div className="flex gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (reservationId && isEditMode) {
                  // Se estava editando, voltar para visualização
                  setIsEditMode(false);
                } else {
                  // Senão, fechar dialog
                  onOpenChange(false);
                }
              }}
            >
              {reservationId && isEditMode ? "Cancelar Edição" : "Fechar"}
            </Button>
            
            {/* Botão submit só aparece em modo de edição ou nova reserva */}
            {(!reservationId || isEditMode) && (
            <Button
              type="submit"
              disabled={loading || isCreating || isUpdating}
            >
              {loading || isCreating || isUpdating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : reservationId ? (
                  "Salvar Alterações"
              ) : (
                "Criar Reserva"
              )}
            </Button>
            )}
            </div>
          </div>
        </form>

        {/* Modal de Lançamento de Pagamento */}
        <ReservationPaymentModal
          open={paymentModalOpen}
          onOpenChange={setPaymentModalOpen}
          reservation={currentReservation}
          onSuccess={() => {
            // Recarregar dados
            queryClient.invalidateQueries({ queryKey: ["reservations"] });
            onSuccess();
            // Recarregar dados da reserva atual
            if (reservationId) {
              supabase
                .from("reservations")
                .select(`
                  *, 
                  financial_responsible:clients!client_id(full_name),
                  guest:clients!guest_id(full_name),
                  rooms(room_number)
                `)
                .eq("id", reservationId)
                .single()
                .then(({ data }) => {
                  if (data) {
                    setCurrentReservation({
                      ...data,
                      guest_name: data.guest?.full_name || data.financial_responsible?.full_name,
                    });
                  }
                });
            }
          }}
        />

      {/* Modal de Cancelamento */}
      {reservationId && (
        <CancelReservationDialog
          open={cancelDialogOpen}
          onOpenChange={(open) => {
            setCancelDialogOpen(open);
          }}
          reservationId={reservationId}
          reservationCode={currentReservation?.reservation_code}
          paidAmount={currentReservation?.paid_amount || 0}
          hasPayments={(currentReservation?.paid_amount || 0) > 0}
          onConfirm={handleConfirmCancel}
        />
      )}

      {/* Modal de Adicionar/Editar Taxa */}
      {selectedServiceFee && reservationId && (
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
          reservationId={reservationId}
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
                  reservation_id: reservationId,
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

      {/* Alerta para data no passado */}
      <AlertDialog open={showPastDateAlert} onOpenChange={setShowPastDateAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <AlertDialogTitle className="text-lg font-semibold">
                Atenção: Data de Check-in no Passado
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base pt-2">
              Você está tentando criar uma reserva com data de check-in no passado ({pendingReservationData?.checkin_date ? format(new Date(pendingReservationData.checkin_date), "dd/MM/yyyy", { locale: ptBR }) : ""}).
              <br /><br />
              Deseja continuar mesmo assim? Esta ação pode ser útil para registrar reservas retroativas ou ajustes de histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowPastDateAlert(false);
              setPendingReservationData(null);
            }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingReservationData) {
                  setShowPastDateAlert(false);
                  return;
                }

                try {
                  setLoading(true);
                  
                  // Remover campos auxiliares antes de criar
                  const { hasFinancialResponsible, financialClientId, guestId, guestData, financialResponsibleData, isBlocked, isPreReservation, expirationDate, blockReason, ...cleanReservationData } = pendingReservationData;

                  // Limpar campos opcionais que podem estar como string vazia
                  if (cleanReservationData.pricing_plan_id === "" || !cleanReservationData.pricing_plan_id) {
                    cleanReservationData.pricing_plan_id = null;
                  }
                  if (cleanReservationData.notes === "" || !cleanReservationData.notes) {
                    cleanReservationData.notes = null;
                  }
                  if (cleanReservationData.guest_name === "" || !cleanReservationData.guest_name) {
                    cleanReservationData.guest_name = null;
                  }
                  if (cleanReservationData.checkin_time === "" || !cleanReservationData.checkin_time) {
                    cleanReservationData.checkin_time = null;
                  }
                  if (cleanReservationData.checkout_time === "" || !cleanReservationData.checkout_time) {
                    cleanReservationData.checkout_time = null;
                  }
                  
                  await createReservation(cleanReservationData);

                  // Limpar formulário
                  const defaultCheckinTime = hotelSettings?.checkin_time 
                    ? hotelSettings.checkin_time.substring(0, 5) 
                    : "14:00";
                  const defaultCheckoutTime = hotelSettings?.checkout_time 
                    ? hotelSettings.checkout_time.substring(0, 5) 
                    : "12:00";
                  
                  setFormData({
                    client_id: "",
                    category_id: "",
                    room_id: "",
                    checkin_date: "",
                    checkout_date: "",
                    checkin_time: defaultCheckinTime,
                    checkout_time: defaultCheckoutTime,
                    adults: 1,
                    children: 0,
                    channel: "direct",
                    notes: "",
                  });
                  setClientData({
                    full_name: "",
                    email: "",
                    phone: "",
                    document_number: "",
                    document_type: "CPF",
                  });
                  setCreateNewClient(false);
                  setPromotionCode("");
                  setReservationAction(null);
                  setExpirationDate("");
                  setExpirationTime("23:59");
                  setBlockReason("");

                  queryClient.invalidateQueries({ queryKey: ["clients"] });
                  onSuccess();
                  onOpenChange(false);
                } catch (error: any) {
                  toast.error(error.message || "Erro ao salvar reserva");
                } finally {
                  setLoading(false);
                  setShowPastDateAlert(false);
                  setPendingReservationData(null);
                }
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Continuar Mesmo Assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};

export default ReservationDialog;

