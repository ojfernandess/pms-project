import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  CheckCircle2, 
  Mail, 
  Calendar, 
  MapPin, 
  Key, 
  Navigation, 
  Home, 
  LogOut, 
  History, 
  ArrowRight, 
  User,
  Clock,
  Bed,
  ChevronRight,
  MessageCircle,
  Settings,
  Bell,
  XCircle,
  Ban,
  AlertCircle,
  CreditCard,
  UserCheck,
  UserX,
  Lock,
  FileText,
  Phone,
  CheckCircle,
  Circle,
  Upload,
  Receipt,
  Check,
  Trash2,
  CheckCheck,
  MessageSquare,
  Star
} from "lucide-react";
import { format, parseISO, isAfter, startOfDay, differenceInDays, isBefore, addDays } from "date-fns";
import { useGuestAccount } from "@/hooks/useGuestAccount";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GuestMenu } from "@/components/webcheckin/GuestMenu";
import { GuestStayHistoryDialog } from "@/components/webcheckin/GuestStayHistoryDialog";
import { GuestProfileDialog } from "@/components/webcheckin/GuestProfileDialog";
import { MaintenanceTicketDialog } from "@/components/webcheckin/MaintenanceTicketDialog";
import { GuestMaintenanceTickets } from "@/components/guest/GuestMaintenanceTickets";
import { PoliciesViewDialog } from "@/components/webcheckin/PoliciesViewDialog";
import { StayReviewForm } from "@/components/reviews/StayReviewForm";
import { useStayReviews } from "@/hooks/useStayReviews";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
import { FiscalDocumentRequest } from "@/components/webcheckin/FiscalDocumentRequest";
import { SpecialRequestsDialog } from "@/components/webcheckin/SpecialRequestsDialog";
import { WebCheckoutDialog } from "@/components/webcheckin/WebCheckoutDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useTranslation } from "react-i18next";
import { useDateLocale } from "@/hooks/useDateLocale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Função helper para obter informações do status da reserva
function getReservationStatusInfo(status: string | null | undefined, t: any) {
  if (!status || typeof status !== 'string') {
    return {
      label: t("guestDashboard.status.unknown"),
      color: "bg-slate-500",
      textColor: "text-slate-700",
      bgColor: "bg-slate-50",
      borderColor: "border-slate-200",
      icon: AlertCircle,
      description: t("guestDashboard.status.unknownDescription")
    };
  }

  const statusLower = status.toLowerCase().trim();
  
  switch (statusLower) {
    case "pending":
      return {
        label: t("guestDashboard.status.pending"),
        color: "bg-yellow-500",
        textColor: "text-yellow-700",
        bgColor: "bg-yellow-50",
        borderColor: "border-yellow-200",
        icon: Clock,
        description: t("guestDashboard.status.pendingDescription")
      };
    case "unpaid":
      return {
        label: t("guestDashboard.status.unpaid"),
        color: "bg-orange-500",
        textColor: "text-orange-700",
        bgColor: "bg-orange-50",
        borderColor: "border-orange-200",
        icon: CreditCard,
        description: t("guestDashboard.status.unpaidDescription")
      };
    case "confirmed":
      return {
        label: t("guestDashboard.status.confirmed"),
        color: "bg-blue-500",
        textColor: "text-blue-700",
        bgColor: "bg-blue-50",
        borderColor: "border-blue-200",
        icon: CheckCircle2,
        description: t("guestDashboard.status.confirmedDescription")
      };
    case "checkedin":
    case "checked_in":
      return {
        label: t("guestDashboard.status.checkedin"),
        color: "bg-green-500",
        textColor: "text-green-700",
        bgColor: "bg-green-50",
        borderColor: "border-green-200",
        icon: UserCheck,
        description: t("guestDashboard.status.checkedinDescription")
      };
    case "checkedout":
    case "checked_out":
      return {
        label: t("guestDashboard.status.checkedout"),
        color: "bg-indigo-500",
        textColor: "text-indigo-700",
        bgColor: "bg-indigo-50",
        borderColor: "border-indigo-200",
        icon: LogOut,
        description: t("guestDashboard.status.checkedoutDescription")
      };
    case "cancelled":
      return {
        label: t("guestDashboard.status.cancelled"),
        color: "bg-red-500",
        textColor: "text-red-700",
        bgColor: "bg-red-50",
        borderColor: "border-red-200",
        icon: XCircle,
        description: t("guestDashboard.status.cancelledDescription")
      };
    case "noshow":
      return {
        label: t("guestDashboard.status.noshow"),
        color: "bg-gray-500",
        textColor: "text-gray-700",
        bgColor: "bg-gray-50",
        borderColor: "border-gray-200",
        icon: UserX,
        description: t("guestDashboard.status.noshowDescription")
      };
    case "blocked":
      return {
        label: t("guestDashboard.status.blocked"),
        color: "bg-purple-500",
        textColor: "text-purple-700",
        bgColor: "bg-purple-50",
        borderColor: "border-purple-200",
        icon: Lock,
        description: t("guestDashboard.status.blockedDescription")
      };
    case "preregistration":
      return {
        label: t("guestDashboard.status.preregistration"),
        color: "bg-cyan-500",
        textColor: "text-cyan-700",
        bgColor: "bg-cyan-50",
        borderColor: "border-cyan-200",
        icon: User,
        description: t("guestDashboard.status.preregistrationDescription")
      };
    default:
      return {
        label: status,
        color: "bg-slate-500",
        textColor: "text-slate-700",
        bgColor: "bg-slate-50",
        borderColor: "border-slate-200",
        icon: AlertCircle,
        description: `${t("common.status")}: ${status}`
      };
  }
}

// Componente ActionCard moderno
function ActionCard({ 
  icon, 
  title, 
  description, 
  color, 
  onClick 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string; 
  color: string;
  onClick: () => void;
}) {
  return (
    <button 
      onClick={onClick}
      className="group bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 text-left w-full"
    >
      <div className={`w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br ${color} rounded-xl flex items-center justify-center mb-3 sm:mb-4 group-hover:scale-110 transition-transform`}>
        <div className="text-white">
          {icon}
        </div>
      </div>
      <h3 className="font-bold text-slate-800 mb-1 text-base sm:text-lg">{title}</h3>
      <p className="text-xs sm:text-sm text-slate-500">{description}</p>
      <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400 mt-2 group-hover:translate-x-1 transition-transform" />
    </button>
  );
}

// Componente ServiceItem moderno
function ServiceItem({ 
  icon, 
  title, 
  description, 
  onClick 
}: { 
  icon: React.ReactNode; 
  title: string; 
  description: string;
  onClick?: () => void;
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("🔍 ServiceItem onClick chamado para:", title);
    if (onClick) {
      onClick();
    }
  };

  return (
    <div 
      onClick={handleClick}
      className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
    >
      <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
        <div className="text-slate-600 group-hover:text-blue-600 transition-colors">
          {icon}
        </div>
      </div>
      <div className="flex-1">
        <h4 className="font-semibold text-slate-800">{title}</h4>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
    </div>
  );
}

// Componente Check-in Stepper
function CheckInStepper({ 
  currentStep, 
  reservation,
  webCheckin 
}: { 
  currentStep: number;
  reservation: any;
  webCheckin: any;
}) {
  const steps = [
    { id: 1, label: "Reserva Confirmada", icon: CheckCircle },
    { id: 2, label: "Dados Pessoais", icon: User },
    { id: 3, label: "Documentos", icon: FileText },
    { id: 4, label: "Check-in Concluído", icon: CheckCircle2 },
  ];

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <h4 className="text-sm font-semibold text-slate-700 mb-4">Progresso do Check-in</h4>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const StepIcon = step.icon;
          const isCompleted = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          const isPending = currentStep < step.id;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isCompleted
                      ? "bg-blue-600 text-white shadow-md"
                      : isCurrent
                      ? "bg-blue-100 text-blue-600 ring-4 ring-blue-100"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  <StepIcon className="w-5 h-5" />
                </div>
                <p
                  className={`text-xs mt-2 text-center max-w-[80px] ${
                    isCompleted || isCurrent
                      ? "text-slate-800 font-medium"
                      : "text-slate-400"
                  }`}
                >
                  {step.label}
                </p>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 -mt-6 ${
                    isCompleted ? "bg-blue-600" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function GuestDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const locale = useDateLocale();
  const { getCurrentSession, logout: guestLogout, getStayHistory, getCurrentAccount } = useGuestAccount();
  const session = getCurrentSession();
  const accountId = session.accountId;
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showCurrentReservation, setShowCurrentReservation] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);
  const [showReservationSelector, setShowReservationSelector] = useState(false);
  const [selectedReservationForTicket, setSelectedReservationForTicket] = useState<any>(null);
  const [showPoliciesDialog, setShowPoliciesDialog] = useState(false);
  const [showAllCancelledReservations, setShowAllCancelledReservations] = useState(false);
  const [selectedCancelledReservation, setSelectedCancelledReservation] = useState<any>(null);
  const [showFiscalDocumentDialog, setShowFiscalDocumentDialog] = useState(false);
  const [selectedReservationForFiscal, setSelectedReservationForFiscal] = useState<any>(null);
  const [showFiscalReservationSelector, setShowFiscalReservationSelector] = useState(false);
  const [showSpecialRequestsDialog, setShowSpecialRequestsDialog] = useState(false);
  const [showSpecialRequestsReservationSelector, setShowSpecialRequestsReservationSelector] = useState(false);
  const [selectedReservationForSpecialRequests, setSelectedReservationForSpecialRequests] = useState<any>(null);
  const [showReviewReservationSelector, setShowReviewReservationSelector] = useState(false);
  const [selectedReservationForReview, setSelectedReservationForReview] = useState<any>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [selectedReservationForCheckout, setSelectedReservationForCheckout] = useState<any>(null);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const [showNotificationsDropdown, setShowNotificationsDropdown] = useState(false);
  const [readNotifications, setReadNotifications] = useState<Set<string>>(new Set());
  const [deletedNotifications, setDeletedNotifications] = useState<Set<string>>(new Set());
  
  // Carregar notificações lidas/excluídas do localStorage
  useEffect(() => {
    if (accountId) {
      const storedRead = localStorage.getItem(`guest_notifications_read_${accountId}`);
      const storedDeleted = localStorage.getItem(`guest_notifications_deleted_${accountId}`);
      
      if (storedRead) {
        try {
          setReadNotifications(new Set(JSON.parse(storedRead)));
        } catch (e) {
          console.error("Erro ao carregar notificações lidas:", e);
        }
      }
      
      if (storedDeleted) {
        try {
          setDeletedNotifications(new Set(JSON.parse(storedDeleted)));
        } catch (e) {
          console.error("Erro ao carregar notificações excluídas:", e);
        }
      }
    }
  }, [accountId]);
  
  // Debug: monitorar mudanças no estado do diálogo fiscal
  useEffect(() => {
    console.log("🔍 Estado showFiscalReservationSelector mudou:", showFiscalReservationSelector);
  }, [showFiscalReservationSelector]);

  // Debug: monitorar mudanças no estado do diálogo de solicitações especiais
  useEffect(() => {
    console.log("🔍 Estado showSpecialRequestsReservationSelector mudou:", showSpecialRequestsReservationSelector);
  }, [showSpecialRequestsReservationSelector]);
  
  // Buscar dados da conta do hóspede
  const { data: accountData } = getCurrentAccount(accountId || "");
  
  // Buscar logo do PMS (site_settings)
  const { settings: siteSettings } = useSiteSettings();

  // Redirecionar se não estiver autenticado
  useEffect(() => {
    if (!accountId) {
      navigate("/web-checkin");
    }
  }, [accountId, navigate]);

  // Buscar histórico de estadas (com atualização automática)
  const { data: stayHistory, isLoading: isLoadingHistory } = getStayHistory(accountId || "");
  
  // Invalidar queries periodicamente para atualizar status das reservas e garantir que sempre mostre a mais próxima
  useEffect(() => {
    if (!accountId) return;
    
    const interval = setInterval(() => {
      // Invalidar queries para forçar atualização e buscar a reserva mais próxima
      queryClient.invalidateQueries({ queryKey: ["current_guest_reservation", accountId] });
      queryClient.invalidateQueries({ queryKey: ["all_guest_reservations", accountId] });
      queryClient.invalidateQueries({ queryKey: ["current_web_checkin"] });
    }, 30000); // A cada 30 segundos

    return () => clearInterval(interval);
  }, [accountId, queryClient]);

  // Buscar todas as reservas do hóspede para seleção
  const { data: allReservations, isLoading: isLoadingAllReservations } = useQuery({
    queryKey: ["all_guest_reservations", accountId],
    refetchInterval: 30000, // Refetch a cada 30 segundos para atualizar status
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!accountId) return [];

      // Buscar histórico para obter todas as reservation_ids
      const { data: historyList } = await (supabase as any)
        .from("guest_stay_history")
        .select("reservation_id, checkin_date, checkout_date, status")
        .eq("guest_account_id", accountId)
        .order("checkin_date", { ascending: false });

      if (!historyList || historyList.length === 0) return [];

      // Buscar dados completos de cada reserva
      const reservations = await Promise.all(
        historyList.map(async (history: any) => {
          const { data: reservation, error } = await supabase
            .from("reservations")
            .select(`
              *,
              rooms(room_number, name),
              room_categories(name),
              establishment:establishments(name)
            `)
            .eq("id", history.reservation_id)
            .maybeSingle();

          if (error || !reservation) return null;

          return {
            ...reservation,
            history_status: history.status,
            history_checkin_date: history.checkin_date,
            history_checkout_date: history.checkout_date,
          };
        })
      );

      return reservations.filter((r) => r !== null);
    },
    enabled: !!accountId,
  });

  // Buscar reserva atual (com data de check-in mais próxima) - EXCLUINDO CANCELADAS
  const { data: currentReservation, isLoading: isLoadingReservation } = useQuery({
    queryKey: ["current_guest_reservation", accountId],
    refetchInterval: 30000, // Refetch a cada 30 segundos para atualizar status
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!accountId) return null;

      // Buscar histórico para obter todas as reservation_ids
      const { data: historyList } = await (supabase as any)
        .from("guest_stay_history")
        .select("reservation_id, checkin_date, checkout_date")
        .eq("guest_account_id", accountId)
        .order("checkin_date", { ascending: true }); // Ordenar por checkin_date ascendente para pegar a mais próxima

      if (!historyList || historyList.length === 0) return null;

      // Filtrar reservas que ainda não passaram do checkout e ordenar por data de check-in mais próxima
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Buscar todas as reservas válidas (que ainda não passaram do checkout e NÃO estão canceladas)
      const validReservations = [];
      
      for (const history of historyList) {
        const checkoutDate = new Date(history.checkout_date);
        checkoutDate.setHours(0, 0, 0, 0);
        
        // Incluir reservas que ainda não passaram do checkout
        if (checkoutDate >= today) {
          // Buscar dados básicos da reserva primeiro (sem relacionamentos complexos)
          const { data: reservation, error } = await supabase
            .from("reservations")
            .select(`
              *,
              rooms(room_number, name, fixed_password, authentication_type),
              room_categories(name),
              establishment:establishments(name)
            `)
            .eq("id", history.reservation_id)
            .maybeSingle();

          if (error) {
            console.error("Erro ao buscar reserva:", error);
            continue;
          }
          
          if (!reservation) continue;

          // FILTRAR RESERVAS CANCELADAS - não incluir na lista de reservas atuais
          const reservationStatus = (reservation.status || "").toLowerCase();
          if (reservationStatus === "cancelled") {
            continue; // Pular reservas canceladas
          }

          // Buscar dados do hóspede separadamente
          let guest = null;
          if ((reservation as any).guest_id) {
            const { data: guestData } = await supabase
              .from("clients")
              .select("full_name, email, phone")
              .eq("id", (reservation as any).guest_id)
              .maybeSingle();
            guest = guestData;
          }

          // Buscar dados do responsável financeiro separadamente
          let financialResponsible = null;
          if (reservation.client_id) {
            const { data: financialData } = await supabase
              .from("clients")
              .select("full_name, email, phone")
              .eq("id", reservation.client_id)
              .maybeSingle();
            financialResponsible = financialData;
          }

          // Buscar dados do building separadamente (se category_id existir e tiver building_id)
          let building = null;
          if (reservation.category_id) {
            const { data: categoryData } = await (supabase as any)
              .from("room_categories")
              .select("building_id")
              .eq("id", reservation.category_id)
              .maybeSingle();
            
            if ((categoryData as any)?.building_id) {
              const { data: buildingData } = await (supabase as any)
                .from("buildings")
                .select("street, city, state, number, neighborhood, zip_code, name")
                .eq("id", (categoryData as any).building_id)
                .maybeSingle();
              building = buildingData;
            }
          }

          // Buscar endereço do estabelecimento de hotel_settings
          let establishmentAddress = null;
          if ((reservation as any).establishment_id) {
            const { data: hotelSettings, error: hotelSettingsError } = await (supabase as any)
              .from("hotel_settings")
              .select("street, number, neighborhood, city, state, zip_code")
              .eq("establishment_id", (reservation as any).establishment_id)
              .maybeSingle();
            
            if (hotelSettingsError) {
              console.warn("Erro ao buscar hotel_settings:", hotelSettingsError);
            } else if (hotelSettings) {
              establishmentAddress = {
                ...(reservation.establishment as any),
                ...hotelSettings,
              };
            }
          }

          // Garantir que usamos as datas da própria reserva (não do histórico)
          // Se a reserva não tiver datas, usar as do histórico como fallback
          const reservationCheckinDate = reservation.checkin_date || history.checkin_date;
          const reservationCheckoutDate = reservation.checkout_date || history.checkout_date;

          validReservations.push({
            ...reservation,
            checkin_date: reservationCheckinDate, // Garantir que sempre temos a data correta
            checkout_date: reservationCheckoutDate, // Garantir que sempre temos a data correta
            status: reservationStatus, // Garantir que sempre temos o status correto da reserva
            guest,
            financial_responsible: financialResponsible,
            building,
            establishment: establishmentAddress || reservation.establishment,
            checkin_date_for_sort: reservationCheckinDate, // Usar para ordenação
          } as any);
        }
      }

      // Se não houver reservas válidas, retornar null
      if (validReservations.length === 0) return null;

      // Ordenar por data de check-in (mais próxima primeiro)
      validReservations.sort((a, b) => {
        const dateA = new Date(a.checkin_date_for_sort || a.checkin_date);
        const dateB = new Date(b.checkin_date_for_sort || b.checkin_date);
        return dateA.getTime() - dateB.getTime(); // Ascendente: mais próxima primeiro
      });

      // Retornar a reserva com check-in mais próximo
      const closestReservation = validReservations[0];
      // Remover campo auxiliar antes de retornar
      delete closestReservation.checkin_date_for_sort;
      
      // Garantir que as datas estão presentes e formatadas corretamente
      if (!closestReservation.checkin_date || !closestReservation.checkout_date) {
        console.warn("Reserva sem datas de check-in/check-out:", closestReservation);
      }
      
      return closestReservation;
    },
    enabled: !!accountId,
  });


  // Buscar reservas canceladas separadamente
  const { data: cancelledReservations, isLoading: isLoadingCancelled } = useQuery({
    queryKey: ["cancelled_guest_reservations", accountId],
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!accountId) return [];

      // Buscar histórico para obter todas as reservation_ids
      const { data: historyList } = await (supabase as any)
        .from("guest_stay_history")
        .select("reservation_id, checkin_date, checkout_date, status")
        .eq("guest_account_id", accountId)
        .order("checkin_date", { ascending: false }); // Mais recentes primeiro

      if (!historyList || historyList.length === 0) return [];

      // Buscar apenas reservas canceladas
      const cancelledReservations = [];
      
      for (const history of historyList) {
        const { data: reservation, error } = await supabase
          .from("reservations")
          .select(`
            *,
            rooms(room_number, name),
            room_categories(name),
            establishment:establishments(name)
          `)
          .eq("id", history.reservation_id)
          .maybeSingle();

        if (error || !reservation) continue;

        // Incluir apenas reservas canceladas
        const reservationStatus = (reservation.status || "").toLowerCase();
        if (reservationStatus === "cancelled") {
          // Buscar dados de contato do hotel_settings
          let contactInfo = {
            phone: null as string | null,
            whatsapp: null as string | null,
          };

          if ((reservation as any).establishment_id) {
            const { data: hotelSettings } = await (supabase as any)
              .from("hotel_settings")
              .select("phone, whatsapp, phone_ddi, phone_number, whatsapp_ddi, whatsapp_number")
              .eq("establishment_id", (reservation as any).establishment_id)
              .maybeSingle();

            if (hotelSettings) {
              // Montar telefone: priorizar campo único 'phone', senão montar dos campos antigos
              contactInfo.phone = hotelSettings.phone || 
                (hotelSettings.phone_ddi && hotelSettings.phone_number 
                  ? `${hotelSettings.phone_ddi} ${hotelSettings.phone_number}`.trim()
                  : hotelSettings.phone_number || null);
              
              // Montar WhatsApp: priorizar campo único 'whatsapp', senão montar dos campos antigos
              contactInfo.whatsapp = hotelSettings.whatsapp || 
                (hotelSettings.whatsapp_ddi && hotelSettings.whatsapp_number 
                  ? `${hotelSettings.whatsapp_ddi}${hotelSettings.whatsapp_number}`.trim()
                  : hotelSettings.whatsapp_number || null);
            }
          }

          cancelledReservations.push({
            ...reservation,
            checkin_date: reservation.checkin_date || history.checkin_date,
            checkout_date: reservation.checkout_date || history.checkout_date,
            history_status: history.status,
            contact_phone: contactInfo.phone,
            contact_whatsapp: contactInfo.whatsapp,
          });
        }
      }

      // Ordenar por data de check-in (mais recente primeiro)
      cancelledReservations.sort((a, b) => {
        const dateA = new Date(a.checkin_date);
        const dateB = new Date(b.checkin_date);
        return dateB.getTime() - dateA.getTime(); // Descendente: mais recente primeiro
      });

      return cancelledReservations;
    },
    enabled: !!accountId,
  });

  // Buscar reservas com check-out realizado para avaliação
  const { data: reviewableReservations, isLoading: isLoadingReviewableReservations } = useQuery({
    queryKey: ["reviewable_reservations_for_dialog", accountId, siteSettings?.features_enabled?.stay_reviews],
    queryFn: async () => {
      if (!accountId) return [];

      // Buscar histórico de estadias do hóspede (sem filtrar por status, para pegar todas)
      const { data: history } = await supabase
        .from("guest_stay_history")
        .select("reservation_id, status, checkout_date")
        .eq("guest_account_id", accountId)
        .order("checkout_date", { ascending: false });

      if (!history || history.length === 0) return [];

      const reservationIds = history.map((h) => h.reservation_id);

      // Buscar reservas com check-out realizado
      const { data: reservations } = await supabase
        .from("reservations")
        .select(`
          id,
          reservation_code,
          checkin_date,
          checkout_date,
          status,
          establishment_id,
          rooms(id, room_number, name),
          establishment:establishments(id, name)
        `)
        .in("id", reservationIds)
        .eq("status", "checkedout")
        .order("checkout_date", { ascending: false });

      if (!reservations) return [];

      // Filtrar reservas com data de check-out já passada
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const pastCheckoutReservations = reservations.filter((r) => {
        if (!r.checkout_date) return false;
        const checkoutDate = new Date(r.checkout_date);
        checkoutDate.setHours(0, 0, 0, 0);
        return checkoutDate < today;
      });

      if (pastCheckoutReservations.length === 0) return [];

      const pastCheckoutReservationIds = pastCheckoutReservations.map((r) => r.id);

      // Buscar avaliações existentes
      const { data: reviews } = await supabase
        .from("stay_reviews")
        .select("reservation_id")
        .in("reservation_id", pastCheckoutReservationIds);

      const reviewedReservationIds = new Set(
        reviews?.map((r) => r.reservation_id) || []
      );

      // Filtrar reservas que ainda não foram avaliadas E que têm o feature flag habilitado
      return pastCheckoutReservations.filter((r) => {
        // Verificar se já foi avaliada
        if (reviewedReservationIds.has(r.id)) {
          return false;
        }
        
        // Verificar se o feature flag está habilitado para o estabelecimento desta reserva
        return isFeatureEnabledForEstablishment(
          siteSettings?.features_enabled?.stay_reviews,
          r.establishment_id
        );
      });
    },
    enabled: !!accountId,
  });

  // Buscar todas as avaliações do hóspede para verificar quais reservas já foram avaliadas
  const { data: allGuestReviews } = useQuery({
    queryKey: ["all_guest_reviews", accountId],
    queryFn: async () => {
      if (!accountId) return [];
      
      // Buscar todas as avaliações do hóspede
      const { data: reviews } = await supabase
        .from("stay_reviews")
        .select("reservation_id")
        .eq("guest_account_id", accountId);
      
      return reviews || [];
    },
    enabled: !!accountId,
  });

  // Buscar web_checkin para obter token e locator
  const { data: webCheckin, isLoading: isLoadingWebCheckin } = useQuery({
    queryKey: ["current_web_checkin", currentReservation?.id],
    queryFn: async () => {
      if (!currentReservation?.id) return null;

      const { data, error } = await (supabase as any)
        .from("web_checkin")
        .select(`
          *,
          reservation:reservations(*),
          establishment:establishments(*)
        `)
        .eq("reservation_id", currentReservation.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        // Se não encontrar web_checkin, não é erro - apenas retorna null
        if (error.code === 'PGRST116') {
          return null;
        }
        throw error;
      }
      return data;
    },
    enabled: !!currentReservation?.id,
    retry: false, // Não tentar novamente se não encontrar
  });

  // Buscar estabelecimento
  const establishment = currentReservation?.establishment;

  // Buscar WhatsApp do estabelecimento
  const { data: hotelSettings } = useQuery({
    queryKey: ["hotel_settings", currentReservation?.establishment_id],
    queryFn: async () => {
      if (!currentReservation?.establishment_id) return null;
      
      const { data, error } = await supabase
        .from("hotel_settings")
        .select("whatsapp, whatsapp_ddi, whatsapp_number, phone, phone_ddi, phone_number")
        .eq("establishment_id", currentReservation.establishment_id)
        .maybeSingle();

      if (error) {
        console.error("Erro ao buscar hotel_settings:", error);
        return null;
      }

      if (data) {
        // Montar WhatsApp: priorizar campo único 'whatsapp', senão montar dos campos antigos
        const whatsapp = data.whatsapp || 
          (data.whatsapp_ddi && data.whatsapp_number 
            ? `${data.whatsapp_ddi}${data.whatsapp_number}`.trim()
            : data.whatsapp_number || null);
        
        // Montar telefone: priorizar campo único 'phone', senão montar dos campos antigos
        const phone = data.phone || 
          (data.phone_ddi && data.phone_number 
            ? `${data.phone_ddi} ${data.phone_number}`.trim()
            : data.phone_number || null);
        
        return { whatsapp, phone };
      }
      
      return null;
    },
    enabled: !!currentReservation?.establishment_id,
  });

  const handleLogout = () => {
    guestLogout();
    navigate("/web-checkin");
  };

  // Buscar notificações (check-in próximo, check-out próximo, chamados respondidos)
  const { data: notifications, isLoading: isLoadingNotifications } = useQuery({
    queryKey: ["guest_notifications", accountId, currentReservation?.id],
    refetchInterval: 60000, // Refetch a cada 1 minuto
    refetchOnWindowFocus: true,
    queryFn: async () => {
      if (!accountId) return [];

      const notificationsList: any[] = [];
      const today = startOfDay(new Date());
      const twoDaysFromNow = addDays(today, 2);

      // 1. Verificar check-in próximo (próximos 2 dias)
      if (currentReservation?.checkin_date) {
        const checkinDateOnly = startOfDay(parseISO(currentReservation.checkin_date));
        const daysUntilCheckin = differenceInDays(checkinDateOnly, today);
        
        if (daysUntilCheckin >= 0 && daysUntilCheckin <= 2 && isBefore(today, checkinDateOnly)) {
          const establishmentName = (currentReservation?.establishment as any)?.name || "Hotel";
          
          // Combinar data com horário de check-in
          let checkinDateTime = new Date(parseISO(currentReservation.checkin_date));
          if ((currentReservation as any).checkin_time) {
            const timeStr = (currentReservation as any).checkin_time;
            // Formato TIME do PostgreSQL: "HH:MM:SS" ou "HH:MM"
            const timeParts = timeStr.split(':');
            if (timeParts.length >= 2) {
              checkinDateTime.setHours(parseInt(timeParts[0]) || 14, parseInt(timeParts[1]) || 0, 0, 0);
            } else {
              checkinDateTime.setHours(14, 0, 0, 0); // Horário padrão
            }
          } else {
            // Se não houver horário específico, usar horário padrão (14:00)
            checkinDateTime.setHours(14, 0, 0, 0);
          }
          
          notificationsList.push({
            id: `checkin-${currentReservation.id}`,
            type: "checkin_reminder",
            title: "Check-in chegando!",
            message: `Sua reserva no ${establishmentName} está chegando. Check-in em ${daysUntilCheckin === 0 ? "hoje" : `${daysUntilCheckin} ${daysUntilCheckin === 1 ? "dia" : "dias"}`}.`,
            date: checkinDateTime,
            reservationId: currentReservation.id,
            priority: daysUntilCheckin === 0 ? "high" : "medium",
          });
        }
      }

      // 2. Verificar check-out próximo (próximos 2 dias)
      if (currentReservation?.checkout_date) {
        const checkoutDateOnly = startOfDay(parseISO(currentReservation.checkout_date));
        const daysUntilCheckout = differenceInDays(checkoutDateOnly, today);
        
        if (daysUntilCheckout >= 0 && daysUntilCheckout <= 2 && isBefore(today, checkoutDateOnly)) {
          const establishmentName = (currentReservation?.establishment as any)?.name || "Hotel";
          
          // Combinar data com horário de check-out
          let checkoutDateTime = new Date(parseISO(currentReservation.checkout_date));
          if ((currentReservation as any).checkout_time) {
            const timeStr = (currentReservation as any).checkout_time;
            // Formato TIME do PostgreSQL: "HH:MM:SS" ou "HH:MM"
            const timeParts = timeStr.split(':');
            if (timeParts.length >= 2) {
              checkoutDateTime.setHours(parseInt(timeParts[0]) || 12, parseInt(timeParts[1]) || 0, 0, 0);
            } else {
              checkoutDateTime.setHours(12, 0, 0, 0); // Horário padrão
            }
          } else {
            // Se não houver horário específico, usar horário padrão (12:00)
            checkoutDateTime.setHours(12, 0, 0, 0);
          }
          
          notificationsList.push({
            id: `checkout-${currentReservation.id}`,
            type: "checkout_reminder",
            title: "Check-out se aproxima",
            message: `Seu check-out no ${establishmentName} é ${daysUntilCheckout === 0 ? "hoje" : `em ${daysUntilCheckout} ${daysUntilCheckout === 1 ? "dia" : "dias"}`}.`,
            date: checkoutDateTime,
            reservationId: currentReservation.id,
            priority: daysUntilCheckout === 0 ? "high" : "medium",
          });
        }
      }

      // 3. Verificar reservas com check-out que ainda não foram avaliadas
      if (accountId) {
        try {
          // Buscar histórico de estadias do hóspede
          const { data: history } = await supabase
            .from("guest_stay_history")
            .select("reservation_id, status, checkout_date")
            .eq("guest_account_id", accountId)
            .order("checkout_date", { ascending: false });

          if (history && history.length > 0) {
            const reservationIds = history.map((h) => h.reservation_id);

            // Buscar reservas com check-out realizado
            const { data: checkedOutReservations } = await supabase
              .from("reservations")
              .select(`
                id,
                reservation_code,
                identification_number,
                checkout_date,
                status,
                establishment_id,
                rooms(id, room_number, name),
                establishment:establishments(id, name)
              `)
              .in("id", reservationIds)
              .eq("status", "checkedout")
              .order("checkout_date", { ascending: false })
              .limit(5);

            // Buscar locators do web_checkin para cada reserva
            const reservationIdsForLocator = checkedOutReservations?.map((r) => r.id) || [];
            let locatorsMap: Record<string, string> = {};
            
            if (reservationIdsForLocator.length > 0) {
              const { data: webCheckins } = await supabase
                .from("web_checkin")
                .select("reservation_id, locator")
                .in("reservation_id", reservationIdsForLocator)
                .order("created_at", { ascending: false });
              
              if (webCheckins) {
                webCheckins.forEach((wc: any) => {
                  if (wc.locator && !locatorsMap[wc.reservation_id]) {
                    locatorsMap[wc.reservation_id] = wc.locator;
                  }
                });
              }
            }

            if (checkedOutReservations && checkedOutReservations.length > 0) {
              // Filtrar reservas com data de check-out já passada
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              
              const pastCheckoutReservations = checkedOutReservations.filter((r) => {
                if (!r.checkout_date) return false;
                const checkoutDate = new Date(r.checkout_date);
                checkoutDate.setHours(0, 0, 0, 0);
                return checkoutDate < today;
              });

              if (pastCheckoutReservations.length > 0) {
                const pastCheckoutReservationIds = pastCheckoutReservations.map((r) => r.id);

                // Buscar avaliações existentes
                const { data: reviews } = await supabase
                  .from("stay_reviews")
                  .select("reservation_id")
                  .in("reservation_id", pastCheckoutReservationIds);

                const reviewedReservationIds = new Set(
                  reviews?.map((r) => r.reservation_id) || []
                );

                // Verificar feature flag
                const { data: siteSettings } = await supabase
                  .from("site_settings")
                  .select("features_enabled")
                  .eq("id", "00000000-0000-0000-0000-000000000001")
                  .maybeSingle();

                const { isFeatureEnabledForEstablishment } = await import("@/lib/featureAccess");

                // Criar notificação para cada reserva não avaliada
                for (const reservation of pastCheckoutReservations) {
                  // Verificar se já foi avaliada
                  if (reviewedReservationIds.has(reservation.id)) {
                    continue;
                  }

                  // Verificar se o feature flag está habilitado para o estabelecimento
                  const isStayReviewsEnabled = isFeatureEnabledForEstablishment(
                    siteSettings?.features_enabled?.stay_reviews,
                    reservation.establishment_id
                  );

                  if (isStayReviewsEnabled) {
                    // Usar o locator do web_checkin, se disponível, caso contrário usar reservation_code
                    const locator = locatorsMap[reservation.id] || reservation.reservation_code || "N/A";
                    const checkoutDate = reservation.checkout_date 
                      ? new Date(reservation.checkout_date)
                      : new Date();
                    
                    notificationsList.push({
                      id: `review-reminder-${reservation.id}`,
                      type: "review_reminder",
                      title: "Avalie sua estadia",
                      message: `Sua reserva ${locator} já teve check-out realizado. Avalie sua experiência e nos ajude a melhorar!`,
                      date: checkoutDate,
                      reservationId: reservation.id,
                      reservationCode: reservation.reservation_code,
                      locator: locator,
                      priority: "medium",
                    });
                  }
                }
              }
            }
          }
        } catch (error) {
          console.error("Erro ao buscar reservas para avaliação:", error);
        }
      }

      // 4. Buscar chamados de manutenção (completados ou atualizados recentemente)
      if (accountId) {
        try {
          // Buscar tickets do hóspede que foram atualizados recentemente (últimos 7 dias)
          const sevenDaysAgo = addDays(today, -7);
          const sevenDaysAgoISO = sevenDaysAgo.toISOString();
          
          // Buscar tickets completados
          const { data: completedTickets, error: completedError } = await supabase
            .from("maintenance_tickets")
            .select("id, title, description, status, resolved_at, completed_at, updated_at, ticket_type")
            .eq("guest_account_id", accountId)
            .eq("status", "completed")
            .gte("updated_at", sevenDaysAgoISO)
            .order("updated_at", { ascending: false })
            .limit(10);

          // Buscar tickets em progresso (para notificar que estão sendo trabalhados)
          const { data: inProgressTickets, error: inProgressError } = await supabase
            .from("maintenance_tickets")
            .select("id, title, description, status, resolved_at, completed_at, updated_at, ticket_type")
            .eq("guest_account_id", accountId)
            .eq("status", "in_progress")
            .gte("updated_at", sevenDaysAgoISO)
            .order("updated_at", { ascending: false })
            .limit(5);

          if (!completedError && completedTickets && completedTickets.length > 0) {
            completedTickets.forEach((ticket: any) => {
              // Tentar usar completed_at, depois updated_at
              const completedDateStr = ticket.completed_at || ticket.updated_at;
              if (completedDateStr) {
                const completedDate = parseISO(completedDateStr);
                notificationsList.push({
                  id: `maintenance-completed-${ticket.id}`,
                  type: "maintenance_resolved",
                  title: "Chamado completado",
                  message: `Seu chamado "${ticket.title}" foi completado.`,
                  date: completedDate,
                  ticketId: ticket.id,
                  priority: "medium",
                });
              }
            });
          }

          // Adicionar notificações para tickets em progresso (apenas se não foram notificados recentemente)
          if (!inProgressError && inProgressTickets && inProgressTickets.length > 0) {
            inProgressTickets.forEach((ticket: any) => {
              const updatedDate = parseISO(ticket.updated_at);
              // Notificar apenas se foi atualizado nas últimas 24 horas
              const oneDayAgo = addDays(today, -1);
              if (isAfter(updatedDate, oneDayAgo)) {
                notificationsList.push({
                  id: `maintenance-progress-${ticket.id}`,
                  type: "maintenance_progress",
                  title: "Chamado em andamento",
                  message: `Seu chamado "${ticket.title}" está sendo atendido.`,
                  date: updatedDate,
                  ticketId: ticket.id,
                  priority: "low",
                });
              }
            });
          }

          // 4. Buscar comentários novos de usuários do PMS (últimos 7 dias)
          // Primeiro buscar tickets do hóspede
          const { data: guestTickets, error: ticketsError } = await supabase
            .from("maintenance_tickets")
            .select("id, title, guest_account_id")
            .eq("guest_account_id", accountId)
            .limit(50);

          let recentComments: any[] = [];
          let commentsError: any = null;
          
          if (!ticketsError && guestTickets && guestTickets.length > 0) {
            const ticketIds = guestTickets.map((t: any) => t.id);
            
            // Buscar comentários desses tickets criados por usuários do PMS
            const { data: commentsData, error: commentsErr } = await supabase
              .from("maintenance_ticket_comments")
              .select("id, ticket_id, comment, created_at, created_by_user_id")
              .in("ticket_id", ticketIds)
              .not("created_by_user_id", "is", null) // Apenas comentários de usuários do PMS
              .is("created_by_guest_id", null) // Não comentários de hóspedes
              .gte("created_at", sevenDaysAgoISO)
              .order("created_at", { ascending: false })
              .limit(20);

            commentsError = commentsErr;
            
            if (!commentsError && commentsData) {
              // Combinar com dados dos tickets
              recentComments = commentsData.map((comment: any) => ({
                ...comment,
                maintenance_tickets: guestTickets.find((t: any) => t.id === comment.ticket_id)
              }));
            }
          }

          if (!commentsError && recentComments && recentComments.length > 0) {
            // Buscar nomes dos usuários que comentaram
            const userIds = [...new Set(recentComments.map((c: any) => c.created_by_user_id).filter(Boolean))];
            let usersMap: Record<string, any> = {};
            
            if (userIds.length > 0) {
              const { data: usersData } = await supabase
                .from("users")
                .select("id, full_name, email")
                .in("id", userIds);
              
              if (usersData) {
                usersData.forEach((user: any) => {
                  usersMap[user.id] = user;
                });
              }
            }

            // Agrupar comentários por ticket e pegar o mais recente de cada ticket
            const commentsByTicket = new Map();
            recentComments.forEach((comment: any) => {
              const ticket = comment.maintenance_tickets;
              if (ticket) {
                const ticketId = ticket.id;
                // Usar o comentário mais recente de cada ticket
                if (!commentsByTicket.has(ticketId) || 
                    new Date(comment.created_at) > new Date(commentsByTicket.get(ticketId).comment.created_at)) {
                  commentsByTicket.set(ticketId, {
                    comment,
                    ticket,
                    userName: usersMap[comment.created_by_user_id]?.full_name || 
                             usersMap[comment.created_by_user_id]?.email || 
                             "Equipe de Manutenção"
                  });
                }
              }
            });

            // Criar notificações para cada ticket com comentário novo
            commentsByTicket.forEach(({ comment, ticket, userName }) => {
              const commentDate = parseISO(comment.created_at);
              const oneDayAgo = addDays(today, -1);
              
              // Notificar apenas se o comentário foi criado nas últimas 24 horas
              if (isAfter(commentDate, oneDayAgo)) {
                const commentPreview = comment.comment.substring(0, 80);
                const message = comment.comment.length > 80 
                  ? `${commentPreview}...` 
                  : commentPreview;

                notificationsList.push({
                  id: `maintenance-comment-${comment.id}`,
                  type: "maintenance_comment",
                  title: `Nova resposta: ${ticket.title}`,
                  message: `${userName} respondeu: "${message}"`,
                  date: commentDate,
                  ticketId: ticket.id,
                  commentId: comment.id,
                  priority: "medium",
                });
              }
            });
          }
        } catch (error) {
          console.error("Erro ao buscar chamados de manutenção:", error);
          // Não adicionar notificação de erro, apenas logar
        }
      }

      // Ordenar por prioridade e data
      return notificationsList.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority as keyof typeof priorityOrder] !== priorityOrder[b.priority as keyof typeof priorityOrder]) {
          return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
        }
        return isAfter(a.date, b.date) ? -1 : 1;
      });
    },
    enabled: !!accountId,
  });

  // Filtrar notificações excluídas e contar não lidas
  const filteredNotifications = notifications?.filter(
    (notif) => !deletedNotifications.has(notif.id)
  ) || [];
  
  const unreadNotificationsCount = filteredNotifications.filter(
    (notif) => !readNotifications.has(notif.id)
  ).length;

  // Funções para gerenciar notificações
  const markAsRead = (notificationId: string) => {
    if (!accountId) return;
    
    const newRead = new Set(readNotifications);
    newRead.add(notificationId);
    setReadNotifications(newRead);
    
    localStorage.setItem(`guest_notifications_read_${accountId}`, JSON.stringify(Array.from(newRead)));
  };

  const markAllAsRead = () => {
    if (!accountId || !filteredNotifications.length) return;
    
    const newRead = new Set(readNotifications);
    filteredNotifications.forEach((notif) => newRead.add(notif.id));
    setReadNotifications(newRead);
    
    localStorage.setItem(`guest_notifications_read_${accountId}`, JSON.stringify(Array.from(newRead)));
  };

  const deleteNotification = (notificationId: string) => {
    if (!accountId) return;
    
    const newDeleted = new Set(deletedNotifications);
    newDeleted.add(notificationId);
    setDeletedNotifications(newDeleted);
    
    // Remover também da lista de lidas se estiver lá
    const newRead = new Set(readNotifications);
    newRead.delete(notificationId);
    setReadNotifications(newRead);
    
    localStorage.setItem(`guest_notifications_deleted_${accountId}`, JSON.stringify(Array.from(newDeleted)));
    localStorage.setItem(`guest_notifications_read_${accountId}`, JSON.stringify(Array.from(newRead)));
  };

  // Função para abrir WhatsApp
  const handleOpenWhatsApp = () => {
    const whatsapp = hotelSettings?.whatsapp;
    if (whatsapp) {
      const whatsappNumber = whatsapp.replace(/\D/g, '');
      window.open(`https://wa.me/${whatsappNumber}`, '_blank');
    } else {
      toast.error("WhatsApp do estabelecimento não disponível");
    }
  };

  // Função para abrir telefone
  const handleOpenPhone = () => {
    const phone = hotelSettings?.phone;
    if (phone) {
      const phoneNumber = phone.replace(/\D/g, '');
      window.open(`tel:${phoneNumber}`, '_self');
    } else {
      toast.error("Telefone do estabelecimento não disponível");
    }
  };

  // Calcular número de noites
  const calculateNights = (checkin: string, checkout: string) => {
    if (!checkin || !checkout) return 0;
    const checkinDate = new Date(checkin);
    const checkoutDate = new Date(checkout);
    const diffTime = Math.abs(checkoutDate.getTime() - checkinDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (!accountId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <Card className="p-8 max-w-md w-full">
          <div className="text-center">
            <p className="text-slate-600 mb-4">{t("guestDashboard.auth.needAuth")}</p>
            <Button onClick={() => navigate("/web-checkin")}>{t("guestDashboard.auth.goToCheckin")}</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (isLoadingReservation || isLoadingHistory || isLoadingCancelled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">{t("guestDashboard.auth.loadingInfo")}</p>
        </div>
      </div>
    );
  }

  // Obter nome do usuário para saudação e avatar
  const getUserName = () => {
    return (accountData as any)?.full_name?.split(" ")[0] || t("guestDashboard.guest");
  };

  const getUserInitials = () => {
    const name = (accountData as any)?.full_name || "";
    if (!name) return "GU";
    return name
      .split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  // Se não quiser mostrar a reserva atual, mostrar dashboard geral
  if (!showCurrentReservation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        {/* Header Moderno Estilo App */}
        <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
            <div className="flex items-center justify-between">
              {/* Logo e Nome do App */}
              <div className="flex items-center gap-3">
                  {siteSettings?.logo_url ? (
                    <img 
                      src={siteSettings.logo_url} 
                      alt="Logo" 
                    className="h-10 w-10 sm:h-12 sm:w-12 object-contain rounded-lg flex-shrink-0"
                    />
                  ) : (
                  <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Home className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  )}
                <div className="hidden sm:block">
                  <h1 className="text-lg font-bold text-slate-900">Meu Check-in</h1>
                  <p className="text-xs text-slate-500">Guest Portal</p>
            </div>
          </div>

              {/* Direita: Saudação, Notificações, Idioma, Avatar */}
              <div className="flex items-center gap-3">
                {/* Saudação - apenas desktop */}
                <div className="hidden md:block text-right">
                  <p className="text-sm font-medium text-slate-900">
                    Olá, {getUserName()} 👋
                  </p>
                </div>

                {/* Notificações */}
                <DropdownMenu open={showNotificationsDropdown} onOpenChange={setShowNotificationsDropdown}>
                  <DropdownMenuTrigger asChild>
                    <button className="relative p-2 rounded-full hover:bg-slate-100 transition-colors">
                      <Bell className="w-5 h-5 text-slate-600" />
                      {unreadNotificationsCount > 0 && (
                        <span className="absolute top-1 right-1 h-5 w-5 bg-red-500 rounded-full flex items-center justify-center text-xs text-white font-semibold">
                          {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                        </span>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] sm:w-[380px] max-w-[380px] p-0">
                    <div className="flex items-center justify-between gap-3 p-4 border-b">
                      <h3 className="font-semibold text-base">Notificações</h3>
                      <div className="flex items-center gap-2">
                        {unreadNotificationsCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {unreadNotificationsCount} {unreadNotificationsCount === 1 ? "nova" : "novas"}
                          </Badge>
                        )}
                        {filteredNotifications.length > 0 && unreadNotificationsCount > 0 && (
                <button 
                            onClick={markAllAsRead}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                            title="Marcar todas como lidas"
                >
                            <CheckCheck className="h-3 w-3 inline mr-1" />
                            Marcar todas
                </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto">
                      {isLoadingNotifications ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                        </div>
                      ) : filteredNotifications && filteredNotifications.length > 0 ? (
                        <div className="divide-y">
                          {filteredNotifications.map((notification) => {
                            const isRead = readNotifications.has(notification.id);
                            const getNotificationIcon = () => {
                              switch (notification.type) {
                                case "checkin_reminder":
                                  return <Key className="h-4 w-4 text-blue-600" />;
                                case "checkout_reminder":
                                  return <LogOut className="h-4 w-4 text-orange-600" />;
                                case "review_reminder":
                                  return <Star className="h-4 w-4 text-yellow-600" />;
                                case "maintenance_resolved":
                                  return <CheckCircle className="h-4 w-4 text-green-600" />;
                                case "maintenance_progress":
                                  return <Clock className="h-4 w-4 text-yellow-600" />;
                                case "maintenance_comment":
                                  return <MessageSquare className="h-4 w-4 text-blue-600" />;
                                default:
                                  return <Bell className="h-4 w-4 text-slate-600" />;
                              }
                            };

                            const getNotificationColor = () => {
                              switch (notification.priority) {
                                case "high":
                                  return "border-l-4 border-l-red-500 bg-red-50";
                                case "medium":
                                  return "border-l-4 border-l-blue-500 bg-blue-50";
                                default:
                                  return "border-l-4 border-l-slate-500 bg-slate-50";
                              }
                            };

                            return (
                              <div
                                key={notification.id}
                                className={`p-4 hover:bg-slate-50 transition-colors ${getNotificationColor()} ${isRead ? "opacity-75" : ""}`}
                              >
                                <div className="flex items-start gap-3">
                                  <div 
                                    className="mt-0.5 cursor-pointer flex-shrink-0"
                                    onClick={() => {
                                      if (notification.reservationId) {
                                        setSelectedCancelledReservation(null); // Limpar reserva cancelada ao abrir detalhes
                                        setShowCurrentReservation(true);
                                      }
                                      if (!isRead) {
                                        markAsRead(notification.id);
                                      }
                                      setShowNotificationsDropdown(false);
                                    }}
                                  >
                                    {getNotificationIcon()}
                                  </div>
                                  <div 
                                    className="flex-1 min-w-0 cursor-pointer"
                                    onClick={() => {
                                      // Se for notificação de review, abrir detalhes da reserva
                                      if (notification.type === "review_reminder" && notification.reservationId) {
                                        if (!isRead) {
                                          markAsRead(notification.id);
                                        }
                                        setSelectedCancelledReservation(null); // Limpar reserva cancelada ao abrir detalhes
                                        setShowCurrentReservation(true);
                                        setShowNotificationsDropdown(false);
                                        return;
                                      }
                                      
                                      if (notification.reservationId) {
                                        setSelectedCancelledReservation(null); // Limpar reserva cancelada ao abrir detalhes
                                        setShowCurrentReservation(true);
                                      }
                                      // Se for notificação de ticket de manutenção, rolar até a seção de tickets
                                      if (notification.ticketId) {
                                        // Marcar como lida e fechar dropdown
                                        if (!isRead) {
                                          markAsRead(notification.id);
                                        }
                                        setShowNotificationsDropdown(false);
                                        // Rolar até a seção de tickets e abrir o ticket após um pequeno delay
                                        setTimeout(() => {
                                          const ticketsSection = document.getElementById("guest-maintenance-tickets");
                                          if (ticketsSection) {
                                            ticketsSection.scrollIntoView({ behavior: "smooth", block: "start" });
                                            // Disparar evento customizado para abrir o ticket
                                            window.dispatchEvent(new CustomEvent('openMaintenanceTicket', { 
                                              detail: { ticketId: notification.ticketId } 
                                            }));
                                          }
                                        }, 300);
                                      } else {
                                        if (!isRead) {
                                          markAsRead(notification.id);
                                        }
                                        setShowNotificationsDropdown(false);
                                      }
                                    }}
                                  >
                                    <p className={`font-semibold text-sm mb-1 ${isRead ? "text-slate-600" : "text-slate-900"}`}>
                                      {notification.title}
                                    </p>
                                    <p className="text-sm text-slate-600 mb-2">
                                      {notification.message}
                                    </p>
                                    {notification.locator && (
                                      <p className="text-xs text-slate-500 mb-2">
                                        Localizador: <span className="font-semibold">{notification.locator}</span>
                                      </p>
                                    )}
                                    <p className="text-xs text-slate-500 mb-2">
                                      {format(notification.date, "dd/MM/yyyy 'às' HH:mm", { locale })}
                                    </p>
                                    {notification.type === "review_reminder" && notification.reservationId && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="mt-2 text-xs h-7"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (!isRead) {
                                            markAsRead(notification.id);
                                          }
                                          setSelectedCancelledReservation(null); // Limpar reserva cancelada ao abrir detalhes
                                          setShowCurrentReservation(true);
                                          setShowNotificationsDropdown(false);
                                        }}
                                      >
                                        <FileText className="h-3 w-3 mr-1" />
                                        Ver Detalhes da Reserva
                                      </Button>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {!isRead && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          markAsRead(notification.id);
                                        }}
                                        className="p-1.5 rounded hover:bg-blue-100 text-blue-600 transition-colors"
                                        title="Marcar como lida"
                                      >
                                        <Check className="h-4 w-4" />
                                      </button>
                                    )}
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteNotification(notification.id);
                                      }}
                                      className="p-1.5 rounded hover:bg-red-100 text-red-600 transition-colors"
                                      title="Excluir notificação"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 px-4">
                          <Bell className="h-12 w-12 text-slate-300 mb-3" />
                          <p className="text-sm text-slate-500 text-center">
                            Nenhuma notificação no momento
                          </p>
                        </div>
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Idioma */}
                <LanguageSelector />

                {/* Avatar com Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors">
                      <Avatar className="h-9 w-9 ring-2 ring-slate-200">
                        <AvatarFallback className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-sm font-semibold">
                          {getUserInitials()}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>
                      <div className="flex flex-col">
                        <span className="font-medium">{(accountData as any)?.full_name || "Usuário"}</span>
                        <span className="text-xs text-slate-500">{(accountData as any)?.email || ""}</span>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setShowProfileDialog(true)}>
                      <User className="h-4 w-4 mr-2" />
                      Meu Perfil
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                      <LogOut className="h-4 w-4 mr-2" />
                      Sair
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Saudação Mobile */}
          <div className="mb-6 md:hidden">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">
              Olá, {getUserName()} 👋
            </h2>
            <p className="text-sm text-slate-600">{t("guestDashboard.welcomeBack")}</p>
          </div>

          {/* Current Reservation Card - Destaque */}
            {currentReservation ? (
            (() => {
              try {
                const statusInfo = getReservationStatusInfo(currentReservation?.status, t);
                const StatusIcon = statusInfo?.icon || AlertCircle;
                const statusLower = currentReservation?.status?.toLowerCase() || "";
                const isCancelled = statusLower === "cancelled";
                const isCheckedOut = statusLower === "checkedout" || statusLower === "checked_out";
                
                // Mapear cores para classes completas do Tailwind
                const getIconBgClass = (color: string) => {
                  const colorMap: Record<string, string> = {
                    "bg-yellow-500": "bg-gradient-to-br from-yellow-500 to-yellow-600",
                    "bg-orange-500": "bg-gradient-to-br from-orange-500 to-orange-600",
                    "bg-blue-500": "bg-gradient-to-br from-blue-500 to-blue-600",
                    "bg-green-500": "bg-gradient-to-br from-green-500 to-green-600",
                    "bg-indigo-500": "bg-gradient-to-br from-indigo-500 to-indigo-600",
                    "bg-red-500": "bg-gradient-to-br from-red-500 to-red-600",
                    "bg-gray-500": "bg-gradient-to-br from-gray-500 to-gray-600",
                    "bg-purple-500": "bg-gradient-to-br from-purple-500 to-purple-600",
                    "bg-cyan-500": "bg-gradient-to-br from-cyan-500 to-cyan-600",
                    "bg-slate-500": "bg-gradient-to-br from-slate-500 to-slate-600",
                  };
                  return colorMap[color] || "bg-gradient-to-br from-slate-500 to-slate-600";
                };
              
              // Reservas canceladas não devem aparecer aqui - serão mostradas em seção separada
              // Esta função só renderiza reservas não canceladas
              
              // Verificar se precisa mostrar alerta de check-in pendente
              // Verificar se status é "confirmed" (case insensitive) e não está checked in ou checked out
              const isConfirmed = statusLower === "confirmed" || statusLower === "confirmada";
              const isCheckedIn = statusLower === "checkedin" || statusLower === "checked_in";
              
              // Verificar se o webCheckin foi COMPLETADO
              // IMPORTANTE: web_checkin pode existir com status "pending" ou "in_progress" sem estar completo
              // Só considerar como check-in feito se o status for "completed"
              const webCheckinStatus = webCheckin?.status?.toLowerCase() || "";
              const isWebCheckinCompleted = !isLoadingWebCheckin && webCheckin && webCheckinStatus === "completed";
              const showPendingCheckinAlert = isConfirmed && !isCheckedIn && !isCheckedOut && !isWebCheckinCompleted;
              
              // Debug log - sempre mostrar para debug
              console.log("🔍 Verificação de alerta de check-in:", {
                status: currentReservation?.status,
                statusLower,
                isConfirmed,
                isCheckedIn,
                isCheckedOut,
                isLoadingWebCheckin,
                webCheckinExists: !!webCheckin,
                webCheckinStatus: webCheckinStatus || "NÃO EXISTE",
                isWebCheckinCompleted,
                showAlert: showPendingCheckinAlert,
                reservationCode: currentReservation?.reservation_code,
                reservationId: currentReservation?.id,
                "CONDIÇÃO FINAL": `isConfirmed(${isConfirmed}) && !isCheckedIn(${!isCheckedIn}) && !isCheckedOut(${!isCheckedOut}) && !isWebCheckinCompleted(${!isWebCheckinCompleted}) = ${showPendingCheckinAlert}`
              });
              
              const establishmentName = (currentReservation?.establishment as any)?.name || "Hotel";
              const roomNumber = (currentReservation?.rooms as any)?.room_number || (currentReservation?.rooms as any)?.name || "";
              
              // Calcular step do check-in
              const getCheckInStep = () => {
                if (!currentReservation) return 1;
                const statusLower = currentReservation?.status?.toLowerCase() || "";
                const webCheckinStatus = webCheckin?.status?.toLowerCase() || "";
                
                if (webCheckinStatus === "completed") return 4;
                if (webCheckin && webCheckinStatus !== "completed") return 3;
                if (statusLower === "confirmed" || statusLower === "confirmada") return 2;
                return 1;
              };
              
              return (
                <div className="mb-6 sm:mb-8">
                  {/* Hero Card Premium - Estadia Atual */}
                  <div className={`relative overflow-hidden bg-gradient-to-br ${isCheckedOut ? 'from-indigo-600 via-purple-600 to-pink-600' : 'from-blue-600 via-indigo-600 to-blue-700'} rounded-3xl p-6 sm:p-8 text-white shadow-2xl mb-6`}>
                    {/* Decorative Pattern */}
                    <div className="absolute inset-0 opacity-10">
                      <div className="absolute top-0 right-0 w-64 h-64 bg-white rounded-full -mr-32 -mt-32"></div>
                      <div className="absolute bottom-0 left-0 w-48 h-48 bg-white rounded-full -ml-24 -mb-24"></div>
                      </div>
                    
                    <div className="relative z-10">
                      {/* Status Badge */}
                      <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-full mb-4">
                        <StatusIcon className="w-4 h-4 text-white" />
                        <span className="text-sm font-medium">{statusInfo?.label}</span>
                      </div>

                      {/* Hotel Name e Room */}
                      <div className="mb-6">
                        <h2 className="text-2xl sm:text-3xl font-bold mb-2">{establishmentName}</h2>
                        {roomNumber && (
                          <div className="flex items-center gap-2 text-blue-100">
                            <Bed className="w-5 h-5" />
                            <span className="text-lg font-semibold">Quarto {roomNumber}</span>
                          </div>
                        )}
                        {currentReservation?.reservation_code && (
                          <p className="text-blue-100/80 text-sm mt-1">
                            {t("guestDashboard.reservation.locatorLabel")} {currentReservation.reservation_code}
                          </p>
                        )}
                  </div>
                  
                      {/* Datas e Noites */}
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                          <div className="flex items-center gap-2 text-blue-100 mb-2">
                        <Calendar className="w-4 h-4" />
                            <span className="text-xs font-medium">Check-in</span>
                      </div>
                          <p className="text-xl font-bold">
                            {currentReservation.checkin_date ? format(parseISO(currentReservation.checkin_date), "dd/MM/yyyy", { locale }) : "-"}
                      </p>
                    </div>
                        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                          <div className="flex items-center gap-2 text-blue-100 mb-2">
                        <Calendar className="w-4 h-4" />
                            <span className="text-xs font-medium">Check-out</span>
                      </div>
                          <p className="text-xl font-bold">
                            {currentReservation.checkout_date ? format(parseISO(currentReservation.checkout_date), "dd/MM/yyyy", { locale }) : "-"}
                      </p>
                    </div>
                  </div>

                  {currentReservation.checkin_date && currentReservation.checkout_date && (
                    <div className="flex items-center gap-2 text-blue-100 mb-6">
                          <Clock className="w-5 h-5" />
                          <span className="text-base font-semibold">
                        {calculateNights(currentReservation.checkin_date, currentReservation.checkout_date)} {t("guestDashboard.reservation.nights")}
                      </span>
                    </div>
                      )}

                      {/* CTA Principal */}
                      <button 
                        onClick={() => {
                          setSelectedCancelledReservation(null); // Limpar reserva cancelada ao abrir detalhes
                          setShowCurrentReservation(true);
                        }}
                        className="w-full bg-white text-blue-600 font-bold py-4 rounded-2xl hover:bg-blue-50 transition-all transform hover:scale-[1.02] shadow-xl text-base"
                      >
                        Gerenciar Estadia
                      </button>
                    </div>
                  </div>

                  {/* Ações Rápidas - Chips Horizontais */}
                  {!isCheckedOut && (
                    <div className="flex flex-wrap gap-2 mb-6">
                      {!isWebCheckinCompleted && (
                        <button
                          onClick={() => navigate(`/web-checkin/${currentReservation.reservation_code}`)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all shadow-sm hover:shadow-md"
                        >
                          <Key className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium text-slate-700">Check-in Online</span>
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all shadow-sm hover:shadow-md">
                            <MessageCircle className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-slate-700">Falar com Hotel</span>
                            <ChevronRight className="w-3 h-3 text-slate-400 rotate-90" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          <DropdownMenuItem
                            onClick={handleOpenWhatsApp}
                            className="cursor-pointer"
                            disabled={!hotelSettings?.whatsapp}
                          >
                            <MessageCircle className="w-4 h-4 mr-2" />
                            <div className="flex flex-col flex-1">
                              <span>WhatsApp do Estabelecimento</span>
                              {hotelSettings?.whatsapp && (
                                <span className="text-xs text-slate-500 mt-0.5">
                                  {hotelSettings.whatsapp}
                                </span>
                              )}
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={handleOpenPhone}
                            className="cursor-pointer"
                            disabled={!hotelSettings?.phone}
                          >
                            <Phone className="w-4 h-4 mr-2" />
                            <div className="flex flex-col flex-1">
                              <span>Telefone do Estabelecimento</span>
                              {hotelSettings?.phone && (
                                <span className="text-xs text-slate-500 mt-0.5">
                                  {hotelSettings.phone}
                                </span>
                              )}
                            </div>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <button
                        onClick={() => setShowSpecialRequestsReservationSelector(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all shadow-sm hover:shadow-md"
                      >
                        <Clock className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-slate-700">Late Checkout</span>
                      </button>
                      <button
                        onClick={() => {
                          setSelectedReservationForFiscal(currentReservation);
                          setShowFiscalDocumentDialog(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all shadow-sm hover:shadow-md"
                      >
                        <Receipt className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-medium text-slate-700">Nota Fiscal</span>
                      </button>
                      {reviewableReservations && reviewableReservations.length > 0 && (
                        <button
                          onClick={() => setShowReviewReservationSelector(true)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-xl hover:bg-blue-50 border border-slate-200 hover:border-blue-300 transition-all shadow-sm hover:shadow-md"
                        >
                          <Star className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-medium text-slate-700">Avaliar Estadia</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Progresso do Check-in */}
                  {!isCheckedOut && (
                    <CheckInStepper 
                      currentStep={getCheckInStep()} 
                      reservation={currentReservation}
                      webCheckin={webCheckin}
                    />
                  )}

                  {/* Alerta para reserva confirmada pendente de check-in */}
                  {(() => {
                    // Re-verificar condições aqui para garantir que está correto no momento da renderização
                    const statusLowerCheck = (currentReservation?.status || "").toLowerCase();
                    const isConfirmedCheck = statusLowerCheck === "confirmed" || statusLowerCheck === "confirmada";
                    const isCheckedInCheck = statusLowerCheck === "checkedin" || statusLowerCheck === "checked_in";
                    const isCheckedOutCheck = statusLowerCheck === "checkedout" || statusLowerCheck === "checked_out";
                    
                    // Verificar se o webCheckin foi COMPLETADO (não apenas se existe)
                    const webCheckinStatusCheck = webCheckin?.status?.toLowerCase() || "";
                    const isWebCheckinCompletedCheck = !isLoadingWebCheckin && webCheckin && webCheckinStatusCheck === "completed";
                    const shouldShowAlert = isConfirmedCheck && !isCheckedInCheck && !isCheckedOutCheck && !isWebCheckinCompletedCheck;
                    
                    // Log adicional para debug
                    if (isConfirmedCheck && !isCheckedInCheck && !isCheckedOutCheck) {
                      console.log("🚨 ALERTA DE CHECK-IN - Verificação no JSX:", {
                        shouldShowAlert,
                        isWebCheckinCompletedCheck,
                        webCheckinStatus: webCheckinStatusCheck || "NÃO EXISTE",
                        isLoadingWebCheckin,
                        webCheckin: webCheckin ? "existe" : "null"
                      });
                    }
                    
                    if (!shouldShowAlert) return null;
                    
                    return (
                      <div className="mb-6 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-yellow-300 flex-shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-white mb-2">
                              {t("guestDashboard.reservation.pendingCheckinAlert")}
                            </p>
                            <p className="text-xs text-blue-100 mb-3">
                              {t("guestDashboard.reservation.pendingCheckinMessage")}
                            </p>
                            <button
                              onClick={() => {
                                console.log("✅ Navegando para check-in:", currentReservation.reservation_code);
                                navigate(`/web-checkin/${currentReservation.reservation_code}`);
                              }}
                              className="w-full bg-yellow-400 text-slate-900 font-semibold py-2.5 px-4 rounded-lg hover:bg-yellow-300 transition-all transform hover:scale-[1.02] shadow-lg text-sm"
                            >
                              {t("guestDashboard.reservation.startCheckinNow")}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
              } catch (error) {
                console.error("Erro ao renderizar card de reserva:", error);
                return (
                  <div className="mb-8 bg-gradient-to-br from-slate-500 to-slate-600 rounded-3xl p-8 text-white shadow-2xl">
                    <p className="text-center">{t("guestDashboard.messages.errorLoadingReservation")}</p>
                  </div>
                );
              }
            })()
          ) : (
            <div className="mb-6 sm:mb-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 text-white shadow-2xl hover:shadow-emerald-500/20 transition-all duration-300">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2">{t("guestDashboard.reservation.noReservation")}</h3>
                  <p className="text-emerald-100 text-sm sm:text-base">{t("guestDashboard.reservation.noReservationText")}</p>
                </div>
                <CheckCircle2 className="w-8 h-8 sm:w-12 sm:h-12 text-white/30 flex-shrink-0 ml-2" />
              </div>
              <button 
                onClick={() => navigate("/web-checkin")}
                className="w-full bg-white text-emerald-600 font-semibold py-3 sm:py-4 rounded-xl sm:rounded-2xl hover:bg-emerald-50 transition-all transform hover:scale-[1.02] shadow-xl text-sm sm:text-base"
              >
                {t("guestDashboard.reservation.startCheckin")}
              </button>
            </div>
          )}

          {/* Seção de Reserva Cancelada Mais Recente */}
          {cancelledReservations && cancelledReservations.length > 0 && (
            <div className="mb-8">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Ban className="w-5 h-5 text-red-500" />
                  {t("guestDashboard.cancelledReservations.title_one")}
                </h3>
                {cancelledReservations.length > 1 && (
                  <button
                    onClick={() => {
                      console.log("Abrindo dialog de reservas canceladas", cancelledReservations.length);
                      setShowAllCancelledReservations(true);
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <History className="w-4 h-4" />
                    {t("guestDashboard.cancelledReservations.viewAll").replace("{{count}}", cancelledReservations.length.toString())}
                  </button>
                )}
              </div>
              
              {/* Card de Reserva Cancelada - Design Premium */}
              {(() => {
                const mostRecentCancelled = cancelledReservations[0];
                const statusInfo = getReservationStatusInfo(mostRecentCancelled?.status, t);
                const StatusIcon = statusInfo?.icon || Ban;
                const establishmentName = (mostRecentCancelled?.establishment as any)?.name || "";
                
                return (
                  <div className="relative overflow-hidden bg-white rounded-3xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-all">
                    {/* Decorative Pattern Sutil */}
                    <div className="absolute inset-0 opacity-5">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-red-500 rounded-full -mr-16 -mt-16"></div>
                        </div>
                    
                    <div className="relative z-10">
                      {/* Status Badge */}
                      <div className="inline-flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-full mb-4 border border-red-100">
                        <StatusIcon className="w-4 h-4 text-red-600" />
                        <span className="text-sm font-medium text-red-700">{statusInfo?.label}</span>
                      </div>

                      {/* Informações da Reserva */}
                      <div className="mb-6">
                        <h4 className="text-xl font-bold text-slate-900 mb-2">
                          {mostRecentCancelled.reservation_code && `${t("guestDashboard.reservation.locatorLabel")} ${mostRecentCancelled.reservation_code}`}
                          {mostRecentCancelled.identification_number && (
                            <span className="ml-2 text-slate-500 font-normal text-base">• #{mostRecentCancelled.identification_number}</span>
                          )}
                        </h4>
                        {establishmentName && (
                          <div className="flex items-center gap-2 text-slate-600 mb-4">
                            <MapPin className="w-4 h-4" />
                            <span className="text-sm">{establishmentName}</span>
                          </div>
                        )}
                        <p className="text-sm text-slate-500">
                          {t("guestDashboard.reservation.cancelledMessage")}
                        </p>
                    </div>
                    
                      {/* Datas */}
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                          <div className="flex items-center gap-2 text-slate-600 mb-2">
                            <Calendar className="w-4 h-4" />
                            <span className="text-xs font-medium">Check-in</span>
                        </div>
                          <p className="text-base font-bold text-slate-900">
                          {mostRecentCancelled.checkin_date ? format(parseISO(mostRecentCancelled.checkin_date), "dd/MM/yyyy", { locale }) : "-"}
                        </p>
                      </div>
                        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
                          <div className="flex items-center gap-2 text-slate-600 mb-2">
                            <Calendar className="w-4 h-4" />
                            <span className="text-xs font-medium">Check-out</span>
                        </div>
                          <p className="text-base font-bold text-slate-900">
                          {mostRecentCancelled.checkout_date ? format(parseISO(mostRecentCancelled.checkout_date), "dd/MM/yyyy", { locale }) : "-"}
                        </p>
                      </div>
                    </div>

                      {/* Contato */}
                    {(() => {
                      const phone = mostRecentCancelled.contact_phone;
                      const whatsapp = mostRecentCancelled.contact_whatsapp;
                      const whatsappUrl = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, '')}` : null;
                      const phoneUrl = phone ? `tel:${phone.replace(/\D/g, '')}` : null;
                      
                      if (!phone && !whatsapp) return null;
                      
                      return (
                          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6">
                            <p className="text-xs text-slate-600 text-center mb-3 font-medium">
                              {t("guestDashboard.cancelledReservations.contactMessage")}
                            </p>
                            <div className="flex flex-col gap-2">
                          {phone && (
                            <a
                              href={phoneUrl || '#'}
                                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 hover:border-red-300 hover:bg-red-50 text-sm text-slate-700 hover:text-red-700 transition-all"
                            >
                                  <Phone className="w-4 h-4" />
                              {phone}
                            </a>
                          )}
                          {whatsapp && (
                            <a
                              href={whatsappUrl || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                                  className="flex items-center justify-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200 hover:border-green-300 hover:bg-green-50 text-sm text-slate-700 hover:text-green-700 transition-all"
                            >
                                  <MessageCircle className="w-4 h-4" />
                              WhatsApp: {whatsapp}
                            </a>
                          )}
                            </div>
                        </div>
                      );
                    })()}

                      {/* Botão Ver Detalhes */}
                      <button
                    onClick={() => {
                      setSelectedCancelledReservation(mostRecentCancelled);
                      setShowCurrentReservation(true);
                    }}
                        className="w-full bg-slate-900 text-white font-semibold py-3 rounded-2xl hover:bg-slate-800 transition-all transform hover:scale-[1.02] shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                  >
                        <FileText className="w-4 h-4" />
                    {t("guestDashboard.reservation.viewDetails")}
                      </button>
                    </div>
                </div>
              );
            })()}
            </div>
          )}

          {/* Cards de Navegação Rápida - Design Moderno */}
          <div className="mb-8">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Ações Rápidas</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <ActionCard
              icon={<CheckCircle2 className="w-6 h-6" />}
              title={t("guestDashboard.actions.newCheckin")}
              description={t("guestDashboard.actions.newCheckinDescription")}
              color="from-emerald-500 to-teal-600"
              onClick={() => navigate("/web-checkin")}
            />
            <ActionCard
              icon={<History className="w-6 h-6" />}
              title={t("guestDashboard.actions.history")}
              description={t("guestDashboard.actions.historyDescription")}
              color="from-purple-500 to-pink-600"
              onClick={() => setShowHistoryDialog(true)}
            />
            <ActionCard
              icon={<MessageCircle className="w-6 h-6" />}
              title={t("guestDashboard.actions.support")}
              description={t("guestDashboard.actions.supportDescription")}
              color="from-orange-500 to-red-600"
              onClick={() => {
                if (!allReservations || allReservations.length === 0) {
                  toast.info(t("guestDashboard.messages.needReservationForTicket"));
                  return;
                }

                // Se houver apenas uma reserva, abrir diretamente
                if (allReservations.length === 1) {
                  setSelectedReservationForTicket(allReservations[0]);
                  setShowMaintenanceDialog(true);
                } else {
                  // Se houver múltiplas, mostrar seletor
                  setShowReservationSelector(true);
                }
              }}
            />
            <ActionCard
              icon={<User className="w-6 h-6" />}
              title={t("guestDashboard.actions.profile")}
              description={t("guestDashboard.actions.profileDescription")}
              color="from-blue-500 to-cyan-600"
              onClick={() => setShowProfileDialog(true)}
            />
            {(() => {
              // Verificar se a feature está habilitada globalmente
              const stayReviewsConfig = siteSettings?.features_enabled?.stay_reviews;
              const isGloballyEnabled = 
                stayReviewsConfig === true || 
                (typeof stayReviewsConfig === 'object' && 
                 stayReviewsConfig?.enabled === true);
              
              return isGloballyEnabled && (
                <ActionCard
                  icon={<Star className="w-6 h-6" />}
                  title="Avaliar Minhas Estadias"
                  description="Avalie suas estadias e compartilhe sua experiência"
                  color="from-yellow-500 to-orange-600"
                  onClick={() => {
                    setShowReviewReservationSelector(true);
                  }}
                />
              );
            })()}
            </div>
          </div>

          {/* Chamados de Manutenção */}
          {accountId && (
            <div className="mb-8">
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
                <h3 className="text-xl font-bold text-slate-900 mb-4">Meus Chamados de Manutenção</h3>
                <GuestMaintenanceTickets 
                  guestAccountId={accountId}
                  reservationId={currentReservation?.id}
                />
              </div>
            </div>
          )}


          {/* Serviços Disponíveis - Design Premium */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-100">
            <h3 className="text-xl font-bold text-slate-900 mb-6">{t("guestDashboard.services.title")}</h3>
            
            <div className="space-y-3">
              <ServiceItem
                icon={<MapPin className="w-5 h-5" />}
                title={t("guestDashboard.services.hotelInfo")}
                description={t("guestDashboard.services.hotelInfoDescription")}
                onClick={() => {
                  console.log("🏨 Informações do Hotel - onClick chamado", {
                    hasCurrentReservation: !!currentReservation,
                    currentReservation: currentReservation?.id
                  });
                  if (currentReservation) {
                    console.log("✅ Abrindo detalhes da reserva");
                    setSelectedCancelledReservation(null); // Limpar reserva cancelada ao abrir detalhes
                    setShowCurrentReservation(true);
                  } else {
                    console.log("⚠️ Não há reserva ativa para mostrar informações");
                    toast.error("Nenhuma reserva ativa encontrada");
                  }
                }}
              />
              <ServiceItem
                icon={<Bell className="w-5 h-5" />}
                title={t("guestDashboard.services.specialRequests")}
                description={t("guestDashboard.services.specialRequestsDescription")}
                onClick={() => {
                  console.log("🔔 Solicitações Especiais - onClick chamado, definindo showSpecialRequestsReservationSelector para true");
                  setShowSpecialRequestsReservationSelector(true);
                  console.log("🔔 Estado após setState:", showSpecialRequestsReservationSelector);
                }}
              />
              <ServiceItem
                icon={<Receipt className="w-5 h-5" />}
                title="Solicitar Documento Fiscal"
                description="Recibo ou Nota Fiscal"
                onClick={() => {
                  setShowFiscalReservationSelector(true);
                }}
              />
            </div>
          </div>
        </div>

          {/* Dialog de Histórico de Estadas */}
          {showHistoryDialog && (
            <GuestStayHistoryDialog
              open={showHistoryDialog}
              onOpenChange={setShowHistoryDialog}
              webCheckin={webCheckin || {
                reservation: currentReservation,
                establishment: currentReservation?.establishment,
                locator: currentReservation?.reservation_code || "",
                status: "completed",
              }}
              token={webCheckin?.token || ""}
            />
          )}

        {/* Dialog de Editar Perfil */}
        {showProfileDialog && accountId && (
          <GuestProfileDialog
            open={showProfileDialog}
            onOpenChange={setShowProfileDialog}
            accountId={accountId}
          />
        )}

        {/* Dialog de Seleção de Reserva para Chamado */}
        <Dialog open={showReservationSelector} onOpenChange={setShowReservationSelector}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{t("guestDashboard.dialogs.selectReservation")}</DialogTitle>
              <DialogDescription>
                {t("guestDashboard.dialogs.selectReservationDescription")}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
              {isLoadingAllReservations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
              ) : allReservations && allReservations.length > 0 ? (
                allReservations.map((reservation: any) => (
                  <button
                    key={reservation.id}
                    onClick={() => {
                      setSelectedReservationForTicket(reservation);
                      setShowReservationSelector(false);
                      setShowMaintenanceDialog(true);
                    }}
                    className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h4 className="font-semibold text-slate-900">
                            {reservation.reservation_code || t("guestDashboard.dialogs.reservationWithoutCode")}
                          </h4>
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-slate-600 mb-2">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span>
                              {reservation.checkin_date && format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale })}
                            </span>
                          </div>
                          <span className="hidden sm:inline">→</span>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span>
                              {reservation.checkout_date && format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale })}
                            </span>
                          </div>
                          {reservation.rooms && ((reservation.rooms as any).room_number || (reservation.rooms as any).name) && (
                            <>
                              <span className="text-slate-300 hidden sm:inline">•</span>
                              <div className="flex items-center gap-1">
                                <Bed className="w-3 h-3 sm:w-4 sm:h-4" />
                                <span className="font-medium text-slate-700">
                                  {t("guestDashboard.reservation.room")} {(reservation.rooms as any).room_number || (reservation.rooms as any).name}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                        {reservation.establishment && (
                          <p className="text-xs text-slate-500 mt-1">
                            {(reservation.establishment as any).name || ""}
                          </p>
                        )}
              </div>
                      <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
            </div>
                  </button>
                ))
              ) : (
                <p className="text-center text-slate-500 py-8">
                  {t("guestDashboard.dialogs.noReservations")}
                </p>
              )}
        </div>
          </DialogContent>
        </Dialog>

        {/* Dialog de Chamado de Manutenção */}
        {showMaintenanceDialog && selectedReservationForTicket && (
          <MaintenanceTicketDialog
            open={showMaintenanceDialog}
            onOpenChange={(open) => {
              setShowMaintenanceDialog(open);
              if (!open) {
                setSelectedReservationForTicket(null);
              }
            }}
            reservation={selectedReservationForTicket}
            webCheckin={{
              reservation: selectedReservationForTicket,
              establishment: selectedReservationForTicket.establishment,
              locator: selectedReservationForTicket.reservation_code || "",
              status: "completed",
            }}
            token={webCheckin?.token || crypto.randomUUID()}
            onSuccess={() => {
              setShowMaintenanceDialog(false);
              setSelectedReservationForTicket(null);
            }}
          />
        )}

        {/* Dialog de Todas as Reservas Canceladas */}
        <CancelledReservationsDialog
          open={showAllCancelledReservations}
          onOpenChange={setShowAllCancelledReservations}
          cancelledReservations={cancelledReservations}
          isLoadingCancelled={isLoadingCancelled}
        />

        {/* Dialog de Seleção de Reserva para Documento Fiscal */}
        <Dialog open={showFiscalReservationSelector} onOpenChange={(open) => {
          console.log("🔍 Dialog onOpenChange chamado:", open);
          setShowFiscalReservationSelector(open);
        }}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Selecionar Estadia para Documento Fiscal</DialogTitle>
              <DialogDescription>
                Escolha qual estadia você deseja solicitar o documento fiscal (Recibo ou Nota Fiscal)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
              {isLoadingAllReservations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : allReservations && allReservations.length > 0 ? (
                (() => {
                  // Filtrar apenas reservas que já tiveram check-out
                  const checkedOutReservations = allReservations.filter((res: any) => {
                    const status = res?.status?.toLowerCase();
                    const checkoutDate = res?.checkout_date;
                    
                    // Verificar por status
                    if (status === "checkedout" || status === "checked_out") {
                      return true;
                    }
                    
                    // Verificar se a data de check-out já passou
                    if (checkoutDate) {
                      try {
                        const checkout = startOfDay(new Date(checkoutDate));
                        const today = startOfDay(new Date());
                        return isAfter(today, checkout) || checkout.getTime() === today.getTime();
                      } catch (error) {
                        console.error("Erro ao verificar data de check-out:", error);
                        return false;
                      }
                    }
                    
                    return false;
                  });

                  if (checkedOutReservations.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                        <p className="text-slate-600">
                          Você ainda não possui reservas com check-out concluído.
                        </p>
                        <p className="text-sm text-slate-500 mt-2">
                          A solicitação de documentos fiscais só pode ser feita após o check-out das reservas.
                        </p>
                      </div>
                    );
                  }

                  return checkedOutReservations.map((reservation: any) => (
                    <button
                      key={reservation.id}
                      onClick={() => {
                        setSelectedReservationForFiscal(reservation);
                        setShowFiscalReservationSelector(false);
                        setShowFiscalDocumentDialog(true);
                      }}
                      className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50 transition-all group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h4 className="font-semibold text-slate-900">
                              {reservation.reservation_code || "Reserva sem código"}
                            </h4>
                            {(() => {
                              const statusInfo = getReservationStatusInfo(reservation.status, t);
                              const StatusIcon = statusInfo.icon;
                              return (
                                <Badge variant="outline" className={`${statusInfo.textColor} ${statusInfo.borderColor} border text-xs`}>
                                  <StatusIcon className="w-3 h-3 mr-1" />
                                  {statusInfo.label}
                                </Badge>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>
                                {reservation.checkin_date && format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale })}
                              </span>
                            </div>
                            <span>→</span>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>
                                {reservation.checkout_date && format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale })}
                              </span>
                            </div>
                          </div>
                          {reservation.rooms && (
                            <div className="text-sm text-slate-500">
                              <Bed className="w-4 h-4 inline mr-1" />
                              {(reservation.rooms as any).room_number || (reservation.rooms as any).name || "Quarto não informado"}
                            </div>
                          )}
                          {reservation.paid_amount && (
                            <div className="text-sm font-semibold text-slate-900 mt-1">
                              Valor: {new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(reservation.paid_amount)}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-amber-600 transition-colors" />
                      </div>
                    </button>
                  ));
                })()
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-600">Nenhuma reserva encontrada.</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog de Solicitar Documento Fiscal */}
        {showFiscalDocumentDialog && selectedReservationForFiscal && (
          <Dialog open={showFiscalDocumentDialog} onOpenChange={setShowFiscalDocumentDialog}>
            <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Solicitar Documento Fiscal</DialogTitle>
                <DialogDescription>
                  Solicite um recibo ou nota fiscal para sua reserva
                </DialogDescription>
              </DialogHeader>
              <FiscalDocumentRequest
                reservation={selectedReservationForFiscal}
                establishment={establishment}
                onSuccess={() => {
                  setShowFiscalDocumentDialog(false);
                  setSelectedReservationForFiscal(null);
                }}
              />
            </DialogContent>
          </Dialog>
        )}

        {/* Dialog de Seleção de Reserva para Solicitações Especiais */}
        <Dialog 
          open={showSpecialRequestsReservationSelector} 
          onOpenChange={setShowSpecialRequestsReservationSelector}
        >
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Selecionar Reserva para Solicitações Especiais</DialogTitle>
              <DialogDescription>
                Escolha qual reserva você deseja fazer solicitações especiais (check-in atual ou próximo)
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
              {isLoadingAllReservations ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : allReservations && allReservations.length > 0 ? (
                (() => {
                  // Filtrar reservas com check-in atual ou próximo (não canceladas e que ainda não passaram do checkout)
                  const today = startOfDay(new Date());
                  const validReservations = allReservations.filter((res: any) => {
                    const status = res?.status?.toLowerCase();
                    
                    // Excluir canceladas
                    if (status === "cancelled" || status === "canceled") {
                      return false;
                    }
                    
                    // Verificar se a data de check-out ainda não passou
                    if (res.checkout_date) {
                      try {
                        const checkout = startOfDay(new Date(res.checkout_date));
                        return checkout >= today;
                      } catch (error) {
                        console.error("Erro ao verificar data de check-out:", error);
                        return false;
                      }
                    }
                    
                    return true;
                  });

                  // Ordenar por data de check-in (mais próxima primeiro)
                  validReservations.sort((a: any, b: any) => {
                    const dateA = a.checkin_date ? new Date(a.checkin_date).getTime() : 0;
                    const dateB = b.checkin_date ? new Date(b.checkin_date).getTime() : 0;
                    return dateA - dateB;
                  });

                  if (validReservations.length === 0) {
                    return (
                      <div className="text-center py-8">
                        <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                        <p className="text-slate-600">
                          Você não possui reservas ativas ou próximas.
                        </p>
                        <p className="text-sm text-slate-500 mt-2">
                          As solicitações especiais só podem ser feitas para reservas com check-in atual ou próximo.
                        </p>
                      </div>
                    );
                  }

                  return validReservations.map((reservation: any) => (
                    <button
                      key={reservation.id}
                      onClick={() => {
                        setSelectedReservationForSpecialRequests(reservation);
                        setShowSpecialRequestsReservationSelector(false);
                        setShowSpecialRequestsDialog(true);
                      }}
                      className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h4 className="font-semibold text-slate-900">
                              {reservation.reservation_code || "Reserva sem código"}
                            </h4>
                            {(() => {
                              const statusInfo = getReservationStatusInfo(reservation.status, t);
                              const StatusIcon = statusInfo.icon;
                              return (
                                <Badge variant="outline" className={`${statusInfo.textColor} ${statusInfo.borderColor} border text-xs`}>
                                  <StatusIcon className="w-3 h-3 mr-1" />
                                  {statusInfo.label}
                                </Badge>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>
                                {reservation.checkin_date && format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale })}
                              </span>
                            </div>
                            <span>→</span>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4" />
                              <span>
                                {reservation.checkout_date && format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale })}
                              </span>
                            </div>
                          </div>
                          {reservation.rooms && (
                            <div className="text-sm text-slate-500">
                              <Bed className="w-4 h-4 inline mr-1" />
                              {(reservation.rooms as any).room_number || (reservation.rooms as any).name || "Quarto não informado"}
                            </div>
                          )}
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                      </div>
                    </button>
                  ));
                })()
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                  <p className="text-slate-600">
                    Nenhuma reserva encontrada.
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog de Solicitações Especiais */}
        {showSpecialRequestsDialog && selectedReservationForSpecialRequests && (
          <SpecialRequestsDialog
            open={showSpecialRequestsDialog}
            onOpenChange={(open) => {
              setShowSpecialRequestsDialog(open);
              if (!open) {
                setSelectedReservationForSpecialRequests(null);
              }
            }}
            reservation={selectedReservationForSpecialRequests}
            onSuccess={() => {
              setShowSpecialRequestsDialog(false);
              setSelectedReservationForSpecialRequests(null);
              queryClient.invalidateQueries({ queryKey: ["current_guest_reservation"] });
              queryClient.invalidateQueries({ queryKey: ["reservations"] });
              queryClient.invalidateQueries({ queryKey: ["all_guest_reservations"] });
          }}
        />
      )}

      {/* Dialog de Seleção de Reserva para Avaliação */}
      <Dialog open={showReviewReservationSelector} onOpenChange={setShowReviewReservationSelector}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Avaliar Minhas Estadias</DialogTitle>
            <DialogDescription>
              Escolha qual estadia você deseja avaliar. Para avaliar, é necessário realizar o check-out da reserva.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
            {isLoadingAllReservations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : allReservations && allReservations.length > 0 ? (
              (() => {
                // Criar Set com IDs de reservas já avaliadas
                const reviewedReservationIds = new Set(
                  allGuestReviews?.map((r: any) => r.reservation_id) || []
                );

                return allReservations
                  .filter((r: any) => r.status?.toLowerCase() !== "cancelled")
                  .map((reservation: any) => {
                    const isCheckedOut = reservation.status?.toLowerCase() === "checkedout" || reservation.status?.toLowerCase() === "checked_out";
                    const canReview = reviewableReservations?.some((r: any) => r.id === reservation.id);
                    const isReviewed = reviewedReservationIds.has(reservation.id);
                    
                    return (
                      <div
                        key={reservation.id}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                          isCheckedOut && canReview
                            ? "border-green-200 bg-green-50 hover:border-green-500 hover:bg-green-100"
                            : isReviewed
                            ? "border-blue-200 bg-blue-50"
                            : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h4 className="font-semibold text-slate-900">
                                {reservation.reservation_code || "Reserva sem código"}
                              </h4>
                              {isReviewed ? (
                                <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 border-blue-300">
                                  <Star className="w-3 h-3 mr-1 fill-blue-600" />
                                  Já avaliada
                                </Badge>
                              ) : isCheckedOut ? (
                                <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-300">
                                  Check-out realizado
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-300">
                                  Aguardando check-out
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-slate-600 space-y-1">
                              <div>
                                Quarto: {reservation.rooms?.room_number || reservation.rooms?.name || "N/A"}
                              </div>
                              <div>
                                Estabelecimento: {reservation.establishment?.name || "N/A"}
                              </div>
                              <div>
                                Check-out:{" "}
                                {reservation.checkout_date
                                  ? format(new Date(reservation.checkout_date), "dd/MM/yyyy", { locale })
                                  : "N/A"}
                              </div>
                            </div>
                            {isReviewed && (
                              <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-sm text-blue-800 flex items-center gap-2">
                                  <Star className="w-4 h-4 fill-blue-600" />
                                  Esta estadia já foi avaliada. Obrigado pelo seu feedback!
                                </p>
                              </div>
                            )}
                            {!isCheckedOut && !isReviewed && (
                              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <p className="text-sm text-yellow-800 mb-2">
                                  Para avaliar esta estadia, é necessário realizar o check-out primeiro.
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full border-yellow-300 text-yellow-700 hover:bg-yellow-100"
                                  onClick={async () => {
                                    // Buscar web_checkin para esta reserva
                                    const { data: webCheckinData } = await supabase
                                      .from("web_checkin")
                                      .select("*")
                                      .eq("reservation_id", reservation.id)
                                      .order("created_at", { ascending: false })
                                      .limit(1)
                                      .maybeSingle();

                                    if (!webCheckinData) {
                                      toast.error("Não foi possível encontrar os dados de check-out. Por favor, tente novamente.");
                                      return;
                                    }

                                    setSelectedReservationForCheckout({
                                      ...reservation,
                                      webCheckin: webCheckinData,
                                    });
                                    setShowCheckoutDialog(true);
                                  }}
                                >
                                  <LogOut className="h-4 w-4 mr-2" />
                                  Realizar Check-out
                                </Button>
                              </div>
                            )}
                            {isCheckedOut && !isReviewed && canReview && (
                              <div className="mt-3">
                                <Button
                                  size="sm"
                                  className="w-full bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white"
                                  onClick={async () => {
                                    // Buscar configurações de avaliação do estabelecimento
                                    const { data: settings } = await supabase
                                      .from("establishment_review_settings")
                                      .select("is_enabled, review_type")
                                      .eq("establishment_id", reservation.establishment_id)
                                      .maybeSingle();

                                    if (!settings || !settings.is_enabled) {
                                      toast.error("O sistema de avaliações não está habilitado para este estabelecimento.");
                                      return;
                                    }

                                    setSelectedReservationForReview({
                                      ...reservation,
                                      reviewType: settings.review_type,
                                      maxRating: settings.review_type === "numeric" ? 10 : 5,
                                    });
                                    setShowReviewReservationSelector(false);
                                    setShowReviewDialog(true);
                                  }}
                                >
                                  <Star className="h-4 w-4 mr-2" />
                                  Avaliar Estadia
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  });
              })()
            ) : (
              <div className="text-center py-8">
                <Star className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600">
                  Nenhuma reserva encontrada.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Check-out */}
      {showCheckoutDialog && selectedReservationForCheckout && (
        <WebCheckoutDialog
          open={showCheckoutDialog}
          onOpenChange={(open) => {
            setShowCheckoutDialog(open);
            if (!open) {
              setSelectedReservationForCheckout(null);
              queryClient.invalidateQueries({ queryKey: ["all_guest_reservations"] });
              queryClient.invalidateQueries({ queryKey: ["reviewable_reservations_for_dialog"] });
            }
          }}
          reservation={selectedReservationForCheckout}
          webCheckin={selectedReservationForCheckout.webCheckin}
          token={selectedReservationForCheckout.webCheckin?.token || ""}
          onSuccess={async () => {
            setShowCheckoutDialog(false);
            setSelectedReservationForCheckout(null);
            queryClient.invalidateQueries({ queryKey: ["all_guest_reservations"] });
            queryClient.invalidateQueries({ queryKey: ["reviewable_reservations_for_dialog"] });
            
            // Buscar dados atualizados da reserva após check-out
            const { data: updatedReservation } = await supabase
              .from("reservations")
              .select(`
                *,
                rooms(id, room_number, name),
                establishment:establishments(id, name)
              `)
              .eq("id", selectedReservationForCheckout.id)
              .single();

            if (updatedReservation) {
              // Buscar configurações de avaliação do estabelecimento
              const { data: settings } = await supabase
                .from("establishment_review_settings")
                .select("is_enabled, review_type")
                .eq("establishment_id", updatedReservation.establishment_id)
                .maybeSingle();

              if (settings && settings.is_enabled) {
                // Abrir diretamente o formulário de avaliação
                setSelectedReservationForReview({
                  ...updatedReservation,
                  reviewType: settings.review_type,
                  maxRating: settings.review_type === "numeric" ? 10 : 5,
                });
                setShowReviewDialog(true);
                toast.success("Check-out realizado com sucesso! Agora você pode avaliar sua estadia.");
              } else {
                toast.success("Check-out realizado com sucesso!");
                // Reabrir o modal de seleção se avaliações não estiverem habilitadas
                setTimeout(() => {
                  setShowReviewReservationSelector(true);
                }, 500);
              }
            } else {
              toast.success("Check-out realizado com sucesso!");
              // Reabrir o modal de seleção se não conseguir buscar a reserva
              setTimeout(() => {
                setShowReviewReservationSelector(true);
              }, 500);
            }
          }}
        />
      )}

      {/* Dialog de Avaliação */}
      {showReviewDialog && selectedReservationForReview && accountId && (
        <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Avaliar Estadia</DialogTitle>
              <DialogDescription>
                Avalie sua experiência na estadia {selectedReservationForReview.reservation_code}
              </DialogDescription>
            </DialogHeader>
            <StayReviewForm
              reservationId={selectedReservationForReview.id}
              establishmentId={selectedReservationForReview.establishment_id}
              guestAccountId={accountId}
              reviewType={selectedReservationForReview.reviewType}
              maxRating={selectedReservationForReview.maxRating}
              onSubmit={() => {
                setShowReviewDialog(false);
                setSelectedReservationForReview(null);
                queryClient.invalidateQueries({ queryKey: ["reviewable_reservations_for_dialog"] });
                queryClient.invalidateQueries({ queryKey: ["reviewable_reservations"] });
                queryClient.invalidateQueries({ queryKey: ["all_guest_reviews"] });
                queryClient.invalidateQueries({ queryKey: ["all_guest_reservations"] });
                toast.success("Avaliação enviada com sucesso! Obrigado pelo seu feedback.");
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

  // Visualização de detalhes da reserva
  // Se houver uma reserva cancelada selecionada E ela for realmente cancelada, usar ela; caso contrário, usar currentReservation
  const reservation = (selectedCancelledReservation && selectedCancelledReservation.status?.toLowerCase() === "cancelled") 
    ? selectedCancelledReservation 
    : currentReservation;
  const building = reservation?.building;
  
  // Se não houver reserva, não renderizar nada
  if (!reservation) {
    return null;
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        {/* Header Premium */}
        <header className="bg-white/80 backdrop-blur-lg border-b border-slate-200/50 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 sm:gap-3">
                  {siteSettings?.logo_url ? (
                    <img 
                      src={siteSettings.logo_url} 
                      alt="Logo" 
                    className="h-16 w-16 sm:h-20 sm:w-20 object-contain flex-shrink-0"
                    />
                  ) : (
                  <Home className="w-6 h-6 sm:w-7 sm:h-7 text-slate-600" />
                  )}
            <div>
                  <h1 className="text-lg sm:text-xl font-bold text-slate-800">{t("guestDashboard.hospitality")}</h1>
                  <p className="text-xs text-slate-500 hidden sm:block">{t("guestDashboard.guestPortal")}</p>
            </div>
          </div>

              <div className="flex items-center gap-2 sm:gap-4">
                <LanguageSelector />
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <LogOut className="w-4 h-4 text-slate-600" />
                  <span className="text-xs sm:text-sm font-medium text-slate-700 hidden sm:inline">{t("guestDashboard.logout")}</span>
                </button>
              </div>
            </div>
        </div>
      </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          {/* Botão Voltar */}
          <Button
            variant="ghost"
            onClick={() => {
              setShowCurrentReservation(false);
              // Limpar reserva cancelada selecionada ao voltar, para evitar conflitos
              if (selectedCancelledReservation && selectedCancelledReservation.status?.toLowerCase() !== "cancelled") {
                setSelectedCancelledReservation(null);
              }
            }}
            className="mb-4 sm:mb-6 flex items-center gap-2"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            {t("guestDashboard.messages.backToDashboard")}
          </Button>

          {/* Conteúdo da Reserva */}
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Status Card Moderno - Mostrar status real da reserva */}
        {(() => {
          const statusInfo = getReservationStatusInfo(reservation?.status, t);
          const StatusIcon = statusInfo.icon;
          const isCancelled = reservation?.status?.toLowerCase() === "cancelled";
          const isCheckedIn = reservation?.status?.toLowerCase() === "checkedin" || reservation?.status?.toLowerCase() === "checked_in";
          const isCheckedOut = reservation?.status?.toLowerCase() === "checkedout" || reservation?.status?.toLowerCase() === "checked_out";
          
          // Mapear cores para classes completas do Tailwind
          const getIconBgClass = (color: string) => {
            const colorMap: Record<string, string> = {
              "bg-yellow-500": "bg-gradient-to-br from-yellow-500 to-yellow-600",
              "bg-orange-500": "bg-gradient-to-br from-orange-500 to-orange-600",
              "bg-blue-500": "bg-gradient-to-br from-blue-500 to-blue-600",
              "bg-green-500": "bg-gradient-to-br from-green-500 to-green-600",
              "bg-indigo-500": "bg-gradient-to-br from-indigo-500 to-indigo-600",
              "bg-red-500": "bg-gradient-to-br from-red-500 to-red-600",
              "bg-gray-500": "bg-gradient-to-br from-gray-500 to-gray-600",
              "bg-purple-500": "bg-gradient-to-br from-purple-500 to-purple-600",
              "bg-cyan-500": "bg-gradient-to-br from-cyan-500 to-cyan-600",
              "bg-slate-500": "bg-gradient-to-br from-slate-500 to-slate-600",
            };
            return colorMap[color] || "bg-gradient-to-br from-slate-500 to-slate-600";
          };
          
          return (
            <Card className={`p-4 sm:p-6 lg:p-8 bg-gradient-to-br ${statusInfo.bgColor} ${statusInfo.borderColor} border shadow-lg mb-6 sm:mb-8`}>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                <div className={`inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ${getIconBgClass(statusInfo.color)} shadow-lg flex-shrink-0`}>
                  <StatusIcon className="h-8 w-8 sm:h-10 sm:w-10 text-white" style={{ color: 'white' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 mb-2">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                      {statusInfo.label}
                    </h2>
                    <Badge variant="outline" className={`${statusInfo.textColor} ${statusInfo.borderColor} border text-xs`}>
                      {reservation?.status}
                    </Badge>
                  </div>
                  <p className="text-slate-700 text-sm sm:text-base">
                    {statusInfo.description}
                    {isCancelled && ` ${t("guestDashboard.reservation.cancelledMessage")}`}
                    {isCheckedIn && ` ${t("guestDashboard.reservation.confirmedMessage")}`}
                    {isCheckedOut && ` ${t("guestDashboard.reservation.completedMessage")}`}
                  </p>
                </div>
                {(webCheckin as any)?.locator && (
                  <div className={`text-center sm:text-right bg-white/60 backdrop-blur-sm rounded-xl p-3 sm:p-4 ${statusInfo.borderColor} border shadow-sm w-full sm:w-auto`}>
                    <p className="text-xs text-slate-600 mb-1 sm:mb-2 font-medium uppercase tracking-wide">{t("guestDashboard.reservation.locator")}</p>
                    <p className={`text-2xl sm:text-3xl font-bold ${statusInfo.textColor} font-mono tracking-wider break-all`}>{(webCheckin as any).locator}</p>
                  </div>
                )}
              </div>
            </Card>
          );
        })()}

        {/* Informações da Reserva */}
        <Card className="p-4 sm:p-6 lg:p-8 shadow-lg border-slate-200/50 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4 sm:mb-6 pb-3 sm:pb-4 border-b border-slate-200">
            <h3 className="text-xl sm:text-2xl font-bold text-slate-900">{t("guestDashboard.reservation.information")}</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPoliciesDialog(true)}
              className="flex items-center gap-2 text-xs sm:text-sm"
            >
              <FileText className="h-3 w-3 sm:h-4 sm:w-4" />
              {t("guestDashboard.reservation.viewPolicies")}
            </Button>
          </div>
          <div className="space-y-4 sm:space-y-6">
            <div className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-blue-50/50 border border-blue-100">
              <div className="w-10 h-10 sm:w-12 sm:h-12 sm:w-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Mail className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-1">{t("guestDashboard.reservation.confirmationEmail")}</p>
                <p className="text-sm text-slate-600">
                  {t("guestDashboard.reservation.confirmationEmailText")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl bg-indigo-50/50 border border-indigo-100">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-indigo-600" />
              </div>
              <div>
                <p className="font-semibold text-slate-900 mb-2">{t("guestDashboard.reservation.stayDates")}</p>
                <div className="space-y-1">
                <p className="text-sm text-slate-600">
                  {t("guestDashboard.reservation.checkin")}:{" "}
                    <span className="font-semibold text-slate-900">
                    {reservation?.checkin_date ? format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale }) : t("guestDashboard.reservation.dateNotAvailable")}
                      {reservation?.checkin_time && ` às ${(reservation as any).checkin_time.substring(0, 5)}`}
                    </span>
                </p>
                <p className="text-sm text-slate-600">
                  {t("guestDashboard.reservation.checkout")}:{" "}
                    <span className="font-semibold text-slate-900">
                    {reservation?.checkout_date ? format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale }) : t("guestDashboard.reservation.dateNotAvailable")}
                      {reservation?.checkout_time && ` às ${(reservation as any).checkout_time.substring(0, 5)}`}
                    </span>
                </p>
                </div>
              </div>
            </div>

            {/* Acomodação e Senha do Quarto */}
            {/* Mostrar apenas após check-in completo */}
            {(() => {
              // Verificar se o web_checkin foi completado
              const webCheckinStatus = webCheckin?.status?.toLowerCase() || "";
              const isCheckinCompleted = webCheckinStatus === "completed";
              const hasRoomInfo = (reservation?.rooms as any)?.room_number || (reservation?.rooms as any)?.name;
              const hasRoomPassword = (reservation?.rooms as any)?.fixed_password && (reservation?.rooms as any)?.authentication_type === 'fixed_password';
              
              // Se o check-in foi completado e há informações do quarto, mostrar
              if (isCheckinCompleted && hasRoomInfo) {
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    {/* Card de Acomodação */}
                    <Card className="p-4 sm:p-6 border-0 shadow-md bg-gradient-to-br from-slate-50 to-white hover:shadow-lg transition-shadow">
                      <div className="flex items-start gap-3 sm:gap-4">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md">
                          <Home className="h-6 w-6 sm:h-7 sm:w-7 text-white" strokeWidth={2} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 sm:mb-4">
                            {t("guestDashboard.reservation.accommodation")}
                          </p>
                          <div className="space-y-3 sm:space-y-4">
                            <div>
                              <p className="text-3xl sm:text-4xl font-bold text-slate-900 tracking-tight break-words">
                                {(reservation?.rooms as any)?.room_number || (reservation?.rooms as any)?.name}
                              </p>
                            </div>
                            {reservation?.room_categories?.name && (
                              <div className="pt-3 border-t border-slate-200">
                                <p className="text-sm font-medium text-slate-600">
                                  {reservation.room_categories.name}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Card de Senha do Quarto */}
                    {hasRoomPassword && (
                      <Card className="p-4 sm:p-6 border-0 shadow-md bg-gradient-to-br from-amber-50 to-orange-50 hover:shadow-lg transition-shadow">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center flex-shrink-0 shadow-md">
                            <Key className="h-6 w-6 sm:h-7 sm:w-7 text-white" strokeWidth={2} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 sm:mb-4">
                              {t("guestDashboard.reservation.roomPassword")}
                            </p>
                            <div className="space-y-2 sm:space-y-3">
                              <div className="py-3 sm:py-4 px-4 sm:px-6 bg-white border-2 border-amber-200 rounded-xl shadow-inner">
                                <p className="text-2xl sm:text-3xl font-mono font-bold text-slate-900 tracking-wider text-center break-all">
                                  {(reservation?.rooms as any)?.fixed_password}
                                </p>
                              </div>
                              <p className="text-xs text-slate-500 text-center font-medium">
                                {t("guestDashboard.reservation.roomPasswordText")}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                );
              }
              
              // Se o check-in não foi completado, mostrar mensagem informativa
              return (
                <div className="grid grid-cols-1 gap-4 sm:gap-6">
                  <Card className="p-4 sm:p-6 border-0 shadow-md bg-gradient-to-br from-slate-50 to-white hover:shadow-lg transition-shadow">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md">
                        <Home className="h-6 w-6 sm:h-7 sm:w-7 text-white" strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 sm:mb-4">
                          {t("guestDashboard.reservation.accommodation")}
                        </p>
                        <p className="text-xs sm:text-sm text-slate-500">{t("guestDashboard.reservation.willBeInformed")}</p>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })()}

            {/* Como Chegar */}
            {(() => {
              const hasBuildingAddress = building && (building.street || building.city || building.state);
              const addressSource = hasBuildingAddress ? building : establishment;
              
              const buildAddress = (source: any): string | null => {
                if (!source) return null;
                
                if (source.address && typeof source.address === 'string') {
                  return source.address;
                }
                
                const parts = [];
                if (source.street) {
                  parts.push(source.street);
                  if (source.number) {
                    parts[parts.length - 1] += `, ${source.number}`;
                  }
                }
                if (source.neighborhood) {
                  parts.push(source.neighborhood);
                }
                return parts.length > 0 ? parts.join(", ") : null;
              };
              
              const fullAddress = buildAddress(addressSource);
              const hasAddress = fullAddress || addressSource?.city || addressSource?.state;
              
              return hasAddress && (
                <Card className="p-4 sm:p-6 border-0 shadow-md bg-gradient-to-br from-teal-50 to-cyan-50 hover:shadow-lg transition-shadow">
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center flex-shrink-0 shadow-md">
                      <Navigation className="h-6 w-6 sm:h-7 sm:w-7 text-white" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 sm:mb-4">
                        {t("guestDashboard.reservation.howToGet")}
                        {building && (
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            ({building.name || t("guestDashboard.reservation.building")})
                          </span>
                        )}
                      </p>
                      <div className="space-y-2 text-xs sm:text-sm text-slate-700 mb-3 sm:mb-4">
                        {fullAddress && (
                          <p className="font-semibold text-sm sm:text-base break-words">{fullAddress}</p>
                        )}
                        {(addressSource?.city || addressSource?.state || addressSource?.zip_code) && (
                          <p className="text-slate-600">
                            {addressSource.city && addressSource.city}
                            {addressSource.city && addressSource.state && ", "}
                            {addressSource.state && addressSource.state}
                            {addressSource.zip_code && ` - ${addressSource.zip_code}`}
                          </p>
                        )}
                      </div>
                      {fullAddress && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const address = `${fullAddress || ""} ${addressSource?.city || ""} ${addressSource?.state || ""}`.trim();
                              const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
                              window.open(googleMapsUrl, '_blank');
                            }}
                          className="border-teal-300 text-teal-700 hover:bg-teal-50 hover:border-teal-400 shadow-sm hover:shadow-md transition-all"
                          >
                          <Navigation className="h-4 w-4 mr-2" strokeWidth={2} />
                            {t("guestDashboard.reservation.openGoogleMaps")}
                          </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })()}
          </div>
        </Card>

        {/* Menu de Funcionalidades - Não mostrar se reserva estiver cancelada ou check-out realizado */}
        {reservation && reservation.status?.toLowerCase() !== "cancelled" && reservation.status?.toLowerCase() !== "checkedout" && reservation.status?.toLowerCase() !== "checked_out" && (
          (webCheckin && (webCheckin as any).token) ? (
            <GuestMenu 
              webCheckin={{
                ...webCheckin,
                reservation: (webCheckin as any).reservation || reservation,
                establishment: (webCheckin as any).establishment || establishment,
                locator: (webCheckin as any).locator || reservation.reservation_code,
                status: (webCheckin as any).status || "completed",
              }} 
              token={(webCheckin as any).token} 
              isLastStep={true} 
            />
          ) : (
            <Card className="p-4 sm:p-6 mt-4 sm:mt-6">
              <div className="text-center mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">
                  {t("guestDashboard.messages.whatWouldYouLike")}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mb-3 sm:mb-4">
                  {t("guestDashboard.messages.needCheckinText")}
                </p>
                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                  <Button onClick={() => navigate(`/web-checkin/${reservation.reservation_code}`)} className="w-full sm:w-auto">
                    {t("guestDashboard.messages.doCheckin")}
                  </Button>
                  <Button 
                    onClick={() => setShowHistoryDialog(true)} 
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    {t("guestDashboard.messages.viewHistory")}
                  </Button>
                </div>
              </div>
            </Card>
          )
        )}

        {/* Mensagem se reserva estiver cancelada */}
        {reservation && reservation.status?.toLowerCase() === "cancelled" && (
          <Card className="p-4 sm:p-6 mt-4 sm:mt-6 bg-red-50 border-red-200">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-red-100 mb-3 sm:mb-4">
                <XCircle className="h-6 w-6 sm:h-8 sm:w-8 text-red-600" />
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">
                {t("guestDashboard.messages.reservationCancelled")}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 mb-3 sm:mb-4">
                {t("guestDashboard.messages.reservationCancelledText")}
              </p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                <Button 
                  onClick={() => setShowHistoryDialog(true)} 
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  {t("guestDashboard.messages.viewHistory")}
                </Button>
                <Button 
                  onClick={() => {
                    setShowCurrentReservation(false);
                    setSelectedCancelledReservation(null); // Limpar reserva cancelada selecionada ao voltar
                  }} 
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  {t("guestDashboard.messages.backToDashboard")}
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Botão de Avaliar Estadia - Mostrar apenas se check-out realizado e feature habilitado */}
        {(() => {
          const isCheckedOut = reservation?.status?.toLowerCase() === "checkedout" || reservation?.status?.toLowerCase() === "checked_out";
          if (!isCheckedOut || !accountId || !reservation?.establishment_id) return null;

          // Verificar se o feature flag está habilitado e se a reserva pode ser avaliada
          const isStayReviewsEnabled = isFeatureEnabledForEstablishment(
            siteSettings?.features_enabled?.stay_reviews,
            reservation.establishment_id
          );

          if (!isStayReviewsEnabled) return null;

          // Verificar se a reserva já foi avaliada
          const hasReview = reviewableReservations?.some((r: any) => r.id === reservation.id);
          
          // Se não está na lista de reviewable, pode ser que já foi avaliada ou não está disponível
          // Vamos mostrar o botão se estiver na lista ou se não temos certeza
          if (reviewableReservations && !hasReview) return null;

          return (
            <Card className="p-4 sm:p-6 mt-4 sm:mt-6 bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-yellow-100 mb-3 sm:mb-4">
                  <Star className="h-6 w-6 sm:h-8 sm:w-8 text-yellow-600 fill-yellow-600" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-slate-900 mb-2">
                  Avalie sua Estadia
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 mb-3 sm:mb-4">
                  Sua reserva já teve check-out realizado. Compartilhe sua experiência e nos ajude a melhorar!
                </p>
                <Button
                  onClick={async () => {
                    // Buscar configurações de avaliação do estabelecimento
                    const { data: settings } = await supabase
                      .from("establishment_review_settings")
                      .select("is_enabled, review_type")
                      .eq("establishment_id", reservation.establishment_id)
                      .maybeSingle();

                    if (!settings || !settings.is_enabled) {
                      toast.error("O sistema de avaliações não está habilitado para este estabelecimento.");
                      return;
                    }

                    setSelectedReservationForReview({
                      ...reservation,
                      reviewType: settings.review_type,
                      maxRating: settings.review_type === "numeric" ? 10 : 5,
                    });
                    setShowReviewDialog(true);
                  }}
                  className="bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white shadow-md hover:shadow-lg transition-all"
                >
                  <Star className="h-4 w-4 mr-2" />
                  Avaliar Estadia
                </Button>
              </div>
            </Card>
          );
        })()}

        {/* Ações Rápidas */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center pt-4 sm:pt-6">
          <Button
            onClick={() => window.print()}
            variant="outline"
            className="shadow-sm hover:shadow-md transition-all border-slate-200 hover:border-slate-300 w-full sm:w-auto"
          >
            {t("guestDashboard.messages.printConfirmation")}
          </Button>
          <Button
            onClick={() => {
              const email = reservation.guest?.email || reservation.financial_responsible?.email;
              if (email) {
                window.location.href = `mailto:${email}`;
              } else {
                toast.error(t("guestDashboard.messages.emailNotAvailable"));
              }
            }}
            variant="outline"
            className="shadow-sm hover:shadow-md transition-all border-slate-200 hover:border-slate-300"
          >
            {t("guestDashboard.messages.sendEmail")}
          </Button>
          {accountId && (
            <Button
              onClick={() => setShowProfileDialog(true)}
              variant="outline"
              className="shadow-sm hover:shadow-md transition-all border-slate-200 hover:border-slate-300"
            >
              <User className="h-4 w-4 mr-2" />
              {t("guestDashboard.messages.editProfile")}
            </Button>
          )}
        </div>
      </div>

      </div>

      {/* Dialogs que dependem de variáveis do conteúdo principal */}
      {/* Dialog de Seleção de Reserva para Solicitações Especiais */}
      <Dialog 
        open={showSpecialRequestsReservationSelector} 
        onOpenChange={setShowSpecialRequestsReservationSelector}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Selecionar Reserva para Solicitações Especiais</DialogTitle>
            <DialogDescription>
              Escolha qual reserva você deseja fazer solicitações especiais (check-in atual ou próximo)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
            {isLoadingAllReservations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : allReservations && allReservations.length > 0 ? (
              (() => {
                // Filtrar reservas com check-in atual ou próximo (não canceladas e que ainda não passaram do checkout)
                const today = startOfDay(new Date());
                const validReservations = allReservations.filter((res: any) => {
                  const status = res?.status?.toLowerCase();
                  
                  // Excluir canceladas
                  if (status === "cancelled" || status === "canceled") {
                    return false;
                  }
                  
                  // Verificar se a data de check-out ainda não passou
                  if (res.checkout_date) {
                    try {
                      const checkout = startOfDay(new Date(res.checkout_date));
                      return checkout >= today;
                    } catch (error) {
                      console.error("Erro ao verificar data de check-out:", error);
                      return false;
                    }
                  }
                  
                  return true;
                });

                // Ordenar por data de check-in (mais próxima primeiro)
                validReservations.sort((a: any, b: any) => {
                  const dateA = a.checkin_date ? new Date(a.checkin_date).getTime() : 0;
                  const dateB = b.checkin_date ? new Date(b.checkin_date).getTime() : 0;
                  return dateA - dateB;
                });

                if (validReservations.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                      <p className="text-slate-600">
                        Você não possui reservas ativas ou próximas.
                      </p>
                      <p className="text-sm text-slate-500 mt-2">
                        As solicitações especiais só podem ser feitas para reservas com check-in atual ou próximo.
                      </p>
                    </div>
                  );
                }

                return validReservations.map((reservation: any) => (
                  <button
                    key={reservation.id}
                    onClick={() => {
                      setSelectedReservationForSpecialRequests(reservation);
                      setShowSpecialRequestsReservationSelector(false);
                      setShowSpecialRequestsDialog(true);
                    }}
                    className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h4 className="font-semibold text-slate-900">
                            {reservation.reservation_code || "Reserva sem código"}
                          </h4>
                          {(() => {
                            const statusInfo = getReservationStatusInfo(reservation.status, t);
                            const StatusIcon = statusInfo.icon;
                            return (
                              <Badge variant="outline" className={`${statusInfo.textColor} ${statusInfo.borderColor} border text-xs`}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {statusInfo.label}
                              </Badge>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {reservation.checkin_date && format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale })}
                            </span>
                          </div>
                          <span>→</span>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {reservation.checkout_date && format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale })}
                            </span>
                          </div>
                        </div>
                        {reservation.rooms && (
                          <div className="text-sm text-slate-500">
                            <Bed className="w-4 h-4 inline mr-1" />
                            {(reservation.rooms as any).room_number || (reservation.rooms as any).name || "Quarto não informado"}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                  </button>
                ));
              })()
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <p className="text-slate-600">
                  Nenhuma reserva encontrada.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Solicitações Especiais */}
      {showSpecialRequestsDialog && selectedReservationForSpecialRequests && (
        <SpecialRequestsDialog
          open={showSpecialRequestsDialog}
          onOpenChange={(open) => {
            setShowSpecialRequestsDialog(open);
            if (!open) {
              setSelectedReservationForSpecialRequests(null);
            }
          }}
          reservation={selectedReservationForSpecialRequests}
          onSuccess={() => {
            setShowSpecialRequestsDialog(false);
            setSelectedReservationForSpecialRequests(null);
            queryClient.invalidateQueries({ queryKey: ["current_guest_reservation"] });
            queryClient.invalidateQueries({ queryKey: ["reservations"] });
            queryClient.invalidateQueries({ queryKey: ["all_guest_reservations"] });
          }}
        />
      )}
      
      {/* Dialog de Histórico de Estadas */}
      {showHistoryDialog && (
        <GuestStayHistoryDialog
          open={showHistoryDialog}
          onOpenChange={setShowHistoryDialog}
          webCheckin={webCheckin || {
            reservation: reservation,
            establishment: establishment,
            locator: reservation.reservation_code,
            status: "completed",
          }}
          token={(webCheckin as any)?.token || ""}
        />
      )}

      {/* Dialog de Editar Perfil */}
      {showProfileDialog && accountId && (
        <GuestProfileDialog
          open={showProfileDialog}
          onOpenChange={setShowProfileDialog}
          accountId={accountId}
        />
      )}

      {/* Dialog de Seleção de Reserva para Chamado */}
      <Dialog open={showReservationSelector} onOpenChange={setShowReservationSelector}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{t("guestDashboard.dialogs.selectReservation")}</DialogTitle>
            <DialogDescription>
              {t("guestDashboard.dialogs.selectReservationDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
            {isLoadingAllReservations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : allReservations && allReservations.length > 0 ? (
              allReservations.map((reservation: any) => (
                <button
                  key={reservation.id}
                  onClick={() => {
                    // Não permitir selecionar reserva cancelada para chamado
                    if (reservation.status === "cancelled") {
                      toast.error(t("guestDashboard.messages.cannotOpenTicketCancelled"));
                      return;
                    }
                    setSelectedReservationForTicket(reservation);
                    setShowReservationSelector(false);
                    setShowMaintenanceDialog(true);
                  }}
                  disabled={reservation.status === "cancelled"}
                  className={`w-full text-left p-4 rounded-xl border transition-all group ${
                    reservation.status === "cancelled"
                      ? "border-red-200 bg-red-50 opacity-60 cursor-not-allowed"
                      : "border-slate-200 hover:border-blue-500 hover:bg-blue-50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h4 className="font-semibold text-slate-900">
                            {reservation.reservation_code || t("guestDashboard.dialogs.reservationWithoutCode")}
                          </h4>
                          {(() => {
                            const statusInfo = getReservationStatusInfo(reservation.status, t);
                            const StatusIcon = statusInfo.icon;
                            return (
                              <Badge variant="outline" className={`${statusInfo.textColor} ${statusInfo.borderColor} border text-xs`}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {statusInfo.label}
                              </Badge>
                            );
                          })()}
                        </div>
                      <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {reservation.checkin_date && format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale })}
                          </span>
                        </div>
                        <span>→</span>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {reservation.checkout_date && format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale })}
                          </span>
                        </div>
                        {reservation.rooms && ((reservation.rooms as any).room_number || (reservation.rooms as any).name) && (
                          <>
                            <span className="text-slate-300">•</span>
                            <div className="flex items-center gap-1">
                              <Bed className="w-4 h-4" />
                              <span className="font-medium text-slate-700">
                                {t("guestDashboard.reservation.room")} {(reservation.rooms as any).room_number || (reservation.rooms as any).name}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                      {reservation.establishment && (
                        <p className="text-xs text-slate-500 mt-1">
                          {(reservation.establishment as any).name || ""}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              ))
            ) : (
              <p className="text-center text-slate-500 py-8">
                {t("guestDashboard.dialogs.noReservations")}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Chamado de Manutenção */}
      {showMaintenanceDialog && selectedReservationForTicket && (
        <MaintenanceTicketDialog
          open={showMaintenanceDialog}
          onOpenChange={(open) => {
            setShowMaintenanceDialog(open);
            if (!open) {
              setSelectedReservationForTicket(null);
            }
          }}
          reservation={selectedReservationForTicket}
          webCheckin={{
            reservation: selectedReservationForTicket,
            establishment: selectedReservationForTicket.establishment,
            locator: selectedReservationForTicket.reservation_code || "",
            status: "completed",
          }}
          token={(webCheckin as any)?.token || crypto.randomUUID()}
          onSuccess={() => {
            setShowMaintenanceDialog(false);
            setSelectedReservationForTicket(null);
          }}
        />
      )}

      {/* Dialog de Políticas */}
      <PoliciesViewDialog
        open={showPoliciesDialog}
        onOpenChange={setShowPoliciesDialog}
        establishmentId={currentReservation?.establishment_id || (currentReservation?.establishment as any)?.id}
        categoryId={currentReservation?.category_id}
      />

      {/* Dialog de Todas as Reservas Canceladas */}
      <CancelledReservationsDialog
        open={showAllCancelledReservations}
        onOpenChange={(open) => {
          setShowAllCancelledReservations(open);
          if (!open) {
            setSelectedCancelledReservation(null);
          }
        }}
        cancelledReservations={cancelledReservations}
        isLoadingCancelled={isLoadingCancelled}
        onViewDetails={(reservation) => {
          setSelectedCancelledReservation(reservation);
          setShowAllCancelledReservations(false);
          setShowCurrentReservation(true);
        }}
      />

      {/* Dialog de Seleção de Reserva para Documento Fiscal */}
      <Dialog open={showFiscalReservationSelector} onOpenChange={setShowFiscalReservationSelector}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Selecionar Estadia para Documento Fiscal</DialogTitle>
            <DialogDescription>
              Escolha qual estadia você deseja solicitar o documento fiscal (Recibo ou Nota Fiscal)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
            {isLoadingAllReservations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : allReservations && allReservations.length > 0 ? (
              (() => {
                // Filtrar apenas reservas que já tiveram check-out
                const checkedOutReservations = allReservations.filter((res: any) => {
                  const status = res?.status?.toLowerCase();
                  const checkoutDate = res?.checkout_date;
                  
                  // Verificar por status
                  if (status === "checkedout" || status === "checked_out") {
                    return true;
                  }
                  
                  // Verificar se a data de check-out já passou
                  if (checkoutDate) {
                    try {
                      const checkout = startOfDay(new Date(checkoutDate));
                      const today = startOfDay(new Date());
                      return isAfter(today, checkout) || checkout.getTime() === today.getTime();
                    } catch (error) {
                      console.error("Erro ao verificar data de check-out:", error);
                      return false;
                    }
                  }
                  
                  return false;
                });

                if (checkedOutReservations.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                      <p className="text-slate-600">
                        Você ainda não possui reservas com check-out concluído.
                      </p>
                      <p className="text-sm text-slate-500 mt-2">
                        A solicitação de documentos fiscais só pode ser feita após o check-out das reservas.
                      </p>
                    </div>
                  );
                }

                return checkedOutReservations.map((reservation: any) => (
                  <button
                    key={reservation.id}
                    onClick={() => {
                      setSelectedReservationForFiscal(reservation);
                      setShowFiscalReservationSelector(false);
                      setShowFiscalDocumentDialog(true);
                    }}
                    className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50 transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h4 className="font-semibold text-slate-900">
                            {reservation.reservation_code || "Reserva sem código"}
                          </h4>
                          {(() => {
                            const statusInfo = getReservationStatusInfo(reservation.status, t);
                            const StatusIcon = statusInfo.icon;
                            return (
                              <Badge variant="outline" className={`${statusInfo.textColor} ${statusInfo.borderColor} border text-xs`}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {statusInfo.label}
                              </Badge>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {reservation.checkin_date && format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale })}
                            </span>
                          </div>
                          <span>→</span>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {reservation.checkout_date && format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale })}
                            </span>
                          </div>
                        </div>
                        {reservation.rooms && (
                          <div className="text-sm text-slate-500">
                            <Bed className="w-4 h-4 inline mr-1" />
                            {(reservation.rooms as any).room_number || (reservation.rooms as any).name || "Quarto não informado"}
                          </div>
                        )}
                        {reservation.paid_amount && (
                          <div className="text-sm font-semibold text-slate-900 mt-1">
                            Valor: {new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: "BRL",
                            }).format(reservation.paid_amount)}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-amber-600 transition-colors" />
                    </div>
                  </button>
                ));
              })()
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <p className="text-slate-600">Nenhuma reserva encontrada.</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Seleção de Reserva para Solicitações Especiais */}
      <Dialog 
        open={showSpecialRequestsReservationSelector} 
        onOpenChange={setShowSpecialRequestsReservationSelector}
      >
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Selecionar Reserva para Solicitações Especiais</DialogTitle>
            <DialogDescription>
              Escolha qual reserva você deseja fazer solicitações especiais (check-in atual ou próximo)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4 max-h-[400px] overflow-y-auto">
            {isLoadingAllReservations ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : allReservations && allReservations.length > 0 ? (
              (() => {
                // Filtrar reservas com check-in atual ou próximo (não canceladas e que ainda não passaram do checkout)
                const today = startOfDay(new Date());
                const validReservations = allReservations.filter((res: any) => {
                  const status = res?.status?.toLowerCase();
                  
                  // Excluir canceladas
                  if (status === "cancelled" || status === "canceled") {
                    return false;
                  }
                  
                  // Verificar se a data de check-out ainda não passou
                  if (res.checkout_date) {
                    try {
                      const checkout = startOfDay(new Date(res.checkout_date));
                      return checkout >= today;
                    } catch (error) {
                      console.error("Erro ao verificar data de check-out:", error);
                      return false;
                    }
                  }
                  
                  return true;
                });

                // Ordenar por data de check-in (mais próxima primeiro)
                validReservations.sort((a: any, b: any) => {
                  const dateA = a.checkin_date ? new Date(a.checkin_date).getTime() : 0;
                  const dateB = b.checkin_date ? new Date(b.checkin_date).getTime() : 0;
                  return dateA - dateB;
                });

                if (validReservations.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                      <p className="text-slate-600">
                        Você não possui reservas ativas ou próximas.
                      </p>
                      <p className="text-sm text-slate-500 mt-2">
                        As solicitações especiais só podem ser feitas para reservas com check-in atual ou próximo.
                      </p>
                    </div>
                  );
                }

                return validReservations.map((reservation: any) => (
                  <button
                    key={reservation.id}
                    onClick={() => {
                      setSelectedReservationForSpecialRequests(reservation);
                      setShowSpecialRequestsReservationSelector(false);
                      setShowSpecialRequestsDialog(true);
                    }}
                    className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <h4 className="font-semibold text-slate-900">
                            {reservation.reservation_code || "Reserva sem código"}
                          </h4>
                          {(() => {
                            const statusInfo = getReservationStatusInfo(reservation.status, t);
                            const StatusIcon = statusInfo.icon;
                            return (
                              <Badge variant="outline" className={`${statusInfo.textColor} ${statusInfo.borderColor} border text-xs`}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {statusInfo.label}
                              </Badge>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-slate-600 mb-2">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {reservation.checkin_date && format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale })}
                            </span>
                          </div>
                          <span>→</span>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span>
                              {reservation.checkout_date && format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale })}
                            </span>
                          </div>
                        </div>
                        {reservation.rooms && (
                          <div className="text-sm text-slate-500">
                            <Bed className="w-4 h-4 inline mr-1" />
                            {(reservation.rooms as any).room_number || (reservation.rooms as any).name || "Quarto não informado"}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-600 transition-colors" />
                    </div>
                  </button>
                ));
              })()
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <p className="text-slate-600">
                  Nenhuma reserva encontrada.
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de Solicitar Documento Fiscal */}
      {showFiscalDocumentDialog && selectedReservationForFiscal && (
        <Dialog open={showFiscalDocumentDialog} onOpenChange={setShowFiscalDocumentDialog}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Solicitar Documento Fiscal</DialogTitle>
              <DialogDescription>
                Solicite um recibo ou nota fiscal para sua reserva
              </DialogDescription>
            </DialogHeader>
            <FiscalDocumentRequest
              reservation={selectedReservationForFiscal}
              establishment={establishment}
              onSuccess={() => {
                setShowFiscalDocumentDialog(false);
                setSelectedReservationForFiscal(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Dialog de Solicitações Especiais */}
      {showSpecialRequestsDialog && selectedReservationForSpecialRequests && (
        <SpecialRequestsDialog
          open={showSpecialRequestsDialog}
          onOpenChange={(open) => {
            setShowSpecialRequestsDialog(open);
            if (!open) {
              setSelectedReservationForSpecialRequests(null);
            }
          }}
          reservation={selectedReservationForSpecialRequests}
          onSuccess={() => {
            setShowSpecialRequestsDialog(false);
            setSelectedReservationForSpecialRequests(null);
            queryClient.invalidateQueries({ queryKey: ["current_guest_reservation"] });
            queryClient.invalidateQueries({ queryKey: ["reservations"] });
            queryClient.invalidateQueries({ queryKey: ["all_guest_reservations"] });
          }}
        />
      )}

      </div>
    </>
  );
}

// Dialog de Todas as Reservas Canceladas - Renderizado fora dos blocos condicionais
function CancelledReservationsDialog({ 
  open, 
  onOpenChange, 
  cancelledReservations, 
  isLoadingCancelled,
  onViewDetails
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  cancelledReservations: any[] | undefined; 
  isLoadingCancelled: boolean;
  onViewDetails?: (reservation: any) => void;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-500" />
            {t("guestDashboard.cancelledReservations.title_other").replace("{{count}}", (cancelledReservations?.length || 0).toString())}
          </DialogTitle>
          <DialogDescription>
            {t("guestDashboard.cancelledReservations.dialogDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoadingCancelled ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-red-600" />
            </div>
          ) : cancelledReservations && cancelledReservations.length > 0 ? (
            cancelledReservations.map((reservation: any) => {
              const statusInfo = getReservationStatusInfo(reservation?.status, t);
              const StatusIcon = statusInfo?.icon || Ban;
              
              return (
                <div 
                  key={reservation.id}
                  className="bg-gradient-to-br from-red-50 to-rose-50 border-2 border-red-200 rounded-xl p-5 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="inline-flex items-center gap-2 bg-red-100 px-3 py-1 rounded-full mb-2">
                        <StatusIcon className="w-4 h-4 text-red-600" />
                        <span className="text-sm font-medium text-red-700">{statusInfo?.label}</span>
                      </div>
                      <h4 className="text-lg font-bold text-slate-800 mb-1">
                        {reservation.reservation_code && `${t("guestDashboard.reservation.locatorLabel")} ${reservation.reservation_code}`}
                      </h4>
                    </div>
                    <Ban className="w-6 h-6 text-red-300 flex-shrink-0" />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 text-slate-600 mb-1">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm font-medium">{t("guestDashboard.reservation.checkin")}</span>
                      </div>
                      <p className="text-base font-semibold text-slate-800">
                        {reservation.checkin_date ? format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale }) : "-"}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-slate-600 mb-1">
                        <Calendar className="w-4 h-4" />
                        <span className="text-sm font-medium">{t("guestDashboard.reservation.checkout")}</span>
                      </div>
                      <p className="text-base font-semibold text-slate-800">
                        {reservation.checkout_date ? format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale }) : "-"}
                      </p>
                    </div>
                  </div>

                  {reservation.establishment && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 text-slate-600 mb-1">
                        <MapPin className="w-4 h-4" />
                        <span className="text-sm font-medium">{t("guestDashboard.reservation.establishment")}</span>
                      </div>
                      <p className="text-sm text-slate-700">
                        {(reservation.establishment as any)?.name || "-"}
                      </p>
                    </div>
                  )}

                  {reservation.rooms && ((reservation.rooms as any).room_number || (reservation.rooms as any).name) && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 text-slate-600 mb-1">
                        <Bed className="w-4 h-4" />
                        <span className="text-sm font-medium">{t("guestDashboard.reservation.room")}</span>
                      </div>
                      <p className="text-sm text-slate-700">
                        {(reservation.rooms as any).room_number || (reservation.rooms as any).name || "-"}
                      </p>
                    </div>
                  )}

                  {reservation.total_amount && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 text-slate-600 mb-1">
                        <CreditCard className="w-4 h-4" />
                        <span className="text-sm font-medium">{t("guestDashboard.reservation.totalAmount")}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-800">
                        R$ {Number(reservation.total_amount).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  )}

                  <div className="bg-white/60 rounded-xl p-3 border border-red-200 mb-4">
                    <p className="text-xs text-slate-600 text-center mb-3">
                      {t("guestDashboard.cancelledReservations.contactMessage")}
                    </p>
                    {(() => {
                      const phone = reservation.contact_phone;
                      const whatsapp = reservation.contact_whatsapp;
                      const whatsappUrl = whatsapp ? `https://wa.me/${whatsapp.replace(/\D/g, '')}` : null;
                      const phoneUrl = phone ? `tel:${phone.replace(/\D/g, '')}` : null;
                      
                      if (!phone && !whatsapp) return null;
                      
                      return (
                        <div className="flex flex-col gap-2 mt-3">
                          {phone && (
                            <a
                              href={phoneUrl || '#'}
                              className="flex items-center justify-center gap-2 text-xs text-red-700 hover:text-red-800 hover:underline"
                            >
                              <Phone className="w-3 h-3" />
                              {phone}
                            </a>
                          )}
                          {whatsapp && (
                            <a
                              href={whatsappUrl || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-center gap-2 text-xs text-green-700 hover:text-green-800 hover:underline"
                            >
                              <MessageCircle className="w-3 h-3" />
                              WhatsApp: {whatsapp}
                            </a>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {onViewDetails && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onViewDetails(reservation)}
                      className="w-full text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      {t("guestDashboard.reservation.viewDetails")}
                    </Button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-8">
              <Ban className="w-12 h-12 text-red-300 mx-auto mb-3" />
              <p className="text-slate-600">{t("guestDashboard.cancelledReservations.noCancelledReservations")}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
