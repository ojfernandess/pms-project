import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, MapPin, DollarSign, ArrowLeft, CheckCircle2, Mail, Key, Navigation, Home, Clock, CheckCircle, XCircle } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useGuestAccount } from "@/hooks/useGuestAccount";
import { useWebCheckin } from "@/hooks/useWebCheckin";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { GuestMenu } from "./GuestMenu";
import { ReservationDetailsView } from "./ReservationDetailsView";

interface GuestStayHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webCheckin: any;
  token: string;
}

export function GuestStayHistoryDialog({
  open,
  onOpenChange,
  webCheckin,
  token,
}: GuestStayHistoryDialogProps) {
  const { getCurrentSession, getStayHistory } = useGuestAccount();
  const { getWebCheckinByToken } = useWebCheckin();
  
  const session = getCurrentSession();
  const hasAccount = !!session.accountId;
  const { data: stayHistory, isLoading } = getStayHistory(session.accountId || "");
  const { data: currentWebCheckin } = getWebCheckinByToken(token);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);

  // Incluir reserva atual se ainda não estiver no histórico
  const allStays = stayHistory || [];
  const currentReservation = currentWebCheckin?.reservation;
  
  const hasCurrentInHistory = currentReservation
    ? allStays.some((stay: any) => stay.reservation_id === currentReservation.id)
    : false;

  // Atualizar stays existentes com dados atualizados da reserva quando necessário
  const updatedStays = allStays.map((stay: any) => {
    // Se a reserva atual corresponde a este stay, usar os dados atualizados
    if (currentReservation && stay.reservation_id === currentReservation.id) {
      return {
        ...stay,
        // Priorizar datas atualizadas da reserva (importante para extensões)
        checkin_date: currentReservation.checkin_date || stay.checkin_date,
        checkout_date: currentReservation.checkout_date || stay.checkout_date,
        total_amount: currentReservation.total_amount || stay.total_amount,
        paid_amount: currentReservation.paid_amount || stay.paid_amount,
        reservation_service_fees: currentReservation.reservation_service_fees || stay.reservation_service_fees || [],
        status: (() => {
          // Determinar status baseado em pagamento (mesma lógica do PMS)
          if (currentReservation.status === "cancelled") return "cancelled";
          if (currentReservation.status === "checkedin") return "completed";
          
          const paidAmount = Number(currentReservation.paid_amount || 0);
          const baseTotalAmount = Number(currentReservation.total_amount || 0);
          const serviceFeesTotal = (currentReservation.reservation_service_fees || []).reduce((sum: number, fee: any) => {
            return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
          }, 0);
          const totalAmount = baseTotalAmount + serviceFeesTotal;
          
          if (paidAmount === 0) return "unpaid";
          if (paidAmount >= totalAmount && totalAmount > 0) return "confirmed";
          return "pending";
        })(),
        reservation: {
          ...stay.reservation,
          reservation_code: currentReservation.reservation_code,
          status: currentReservation.status,
        },
      };
    }
    return stay;
  });

  const displayStays = hasCurrentInHistory
    ? updatedStays
    : currentReservation
    ? [
        {
          id: "current",
          reservation_id: currentReservation.id,
          checkin_date: currentReservation.checkin_date,
          checkout_date: currentReservation.checkout_date,
          room_number: currentReservation.rooms?.room_number,
          room_category_name: currentReservation.room_categories?.name,
          total_amount: currentReservation.total_amount,
          paid_amount: currentReservation.paid_amount || 0,
          reservation_service_fees: currentReservation.reservation_service_fees || [],
          status: (() => {
            // Determinar status baseado em pagamento (mesma lógica do PMS)
            if (currentReservation.status === "cancelled") return "cancelled";
            if (currentReservation.status === "checkedin") return "completed";
            
            const paidAmount = Number(currentReservation.paid_amount || 0);
            const baseTotalAmount = Number(currentReservation.total_amount || 0);
            const serviceFeesTotal = (currentReservation.reservation_service_fees || []).reduce((sum: number, fee: any) => {
              return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
            }, 0);
            const totalAmount = baseTotalAmount + serviceFeesTotal;
            
            if (paidAmount === 0) return "unpaid";
            if (paidAmount >= totalAmount && totalAmount > 0) return "confirmed";
            return "pending";
          })(),
          establishment: currentWebCheckin?.establishment,
          webCheckinStatus: currentWebCheckin?.status || null,
          webCheckinCompletedAt: currentWebCheckin?.status === "completed" ? currentWebCheckin.updated_at : null,
          reservation: {
            reservation_code: currentReservation.reservation_code,
            status: currentReservation.status,
          },
        },
        ...updatedStays,
      ]
    : updatedStays;

  const getStatusBadge = (status: string, reservationStatus?: string, paidAmount?: number, totalAmount?: number, serviceFeesTotal?: number) => {
    // Se a reserva estiver cancelada, sempre mostrar como cancelada
    if (reservationStatus === "cancelled") {
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <XCircle className="h-3 w-3" />
          Cancelada
        </Badge>
      );
    }

    // Determinar status real baseado em pagamento (mesma lógica do PMS)
    const actualTotalAmount = (totalAmount || 0) + (serviceFeesTotal || 0);
    const actualPaidAmount = paidAmount || 0;
    
    let actualStatus = status;
    if (actualPaidAmount === 0 && reservationStatus !== "cancelled") {
      actualStatus = "unpaid";
    } else if (actualPaidAmount >= actualTotalAmount && actualTotalAmount > 0) {
      actualStatus = "confirmed";
    } else if (actualPaidAmount > 0 && actualPaidAmount < actualTotalAmount) {
      actualStatus = "pending";
    }

    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      unpaid: { label: "Não Pago", variant: "destructive" },
      completed: { label: "Concluída", variant: "default" },
      confirmed: { label: "Confirmada", variant: "default" },
      pending: { label: "Pendente", variant: "secondary" },
      cancelled: { label: "Cancelada", variant: "destructive" },
    };

    const config = statusConfig[actualStatus] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) {
        setSelectedReservationId(null);
      }
      onOpenChange(newOpen);
    }}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {selectedReservationId ? "Detalhes da Reserva" : "Histórico de Estadas"}
          </DialogTitle>
          <DialogDescription>
            {selectedReservationId 
              ? "Visualize todos os detalhes da sua reserva"
              : "Visualize todas as suas estadias anteriores e atuais"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {!hasAccount ? (
            <div className="text-center py-8">
              <p className="text-slate-600 mb-4">
                Crie uma conta para visualizar seu histórico de estadas.
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : displayStays.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-600">
                Nenhuma estadia encontrada no histórico.
              </p>
            </div>
          ) : selectedReservationId ? (
            <ReservationDetailsView
              reservationId={selectedReservationId}
              onBack={() => setSelectedReservationId(null)}
              token={token}
            />
          ) : (
            displayStays.map((stay: any) => {
              // Verificar se a reserva está cancelada (pode estar em reservation.status ou status direto)
              const reservationStatus = stay.reservation?.status || stay.status;
              const isCancelled = reservationStatus === "cancelled";
              
              return (
                <Card 
                  key={stay.id} 
                  className={`p-4 transition-shadow cursor-pointer ${
                    isCancelled 
                      ? "bg-red-50 border-red-200 hover:shadow-md" 
                      : "hover:shadow-md"
                  }`}
                  onClick={() => setSelectedReservationId(stay.reservation_id)}
                >
                  <div className="space-y-3">
                    {/* Header com código da reserva e status */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold ${isCancelled ? "text-red-900" : "text-slate-900"}`}>
                            {stay.reservation?.reservation_code || "Reserva"}
                          </p>
                          {isCancelled && (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        {stay.establishment?.name && (
                          <p className={`text-sm mt-1 ${isCancelled ? "text-red-700" : "text-slate-600"}`}>
                            {stay.establishment.name}
                          </p>
                        )}
                        {/* Status do Check-in - Não mostrar se reserva estiver cancelada */}
                        {!isCancelled && stay.webCheckinStatus && (
                          <div className="flex items-center gap-2 mt-2">
                            {stay.webCheckinStatus === "completed" ? (
                              <>
                                <CheckCircle className="h-4 w-4 text-green-600" />
                                <span className="text-xs text-green-700 font-medium">
                                  Check-in concluído
                                </span>
                                {stay.webCheckinCompletedAt && (
                                  <span className="text-xs text-slate-500">
                                    {format(parseISO(stay.webCheckinCompletedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  </span>
                                )}
                              </>
                            ) : stay.webCheckinStatus === "in_progress" ? (
                              <>
                                <Clock className="h-4 w-4 text-blue-600" />
                                <span className="text-xs text-blue-700 font-medium">
                                  Check-in em andamento
                                </span>
                              </>
                            ) : (
                              <>
                                <Clock className="h-4 w-4 text-amber-600" />
                                <span className="text-xs text-amber-700 font-medium">
                                  Check-in pendente
                                </span>
                              </>
                            )}
                          </div>
                        )}
                        {!isCancelled && !stay.webCheckinStatus && (
                          <div className="flex items-center gap-2 mt-2">
                            <Clock className="h-4 w-4 text-amber-600" />
                            <span className="text-xs text-amber-700 font-medium">
                              Check-in pendente
                            </span>
                          </div>
                        )}
                        {/* Mensagem de cancelamento */}
                        {isCancelled && (
                          <div className="flex items-center gap-2 mt-2 p-2 bg-red-100 rounded-md">
                            <XCircle className="h-4 w-4 text-red-600" />
                            <span className="text-xs text-red-800 font-medium">
                              Esta reserva foi cancelada
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="ml-4">
                        {getStatusBadge(
                          isCancelled ? "cancelled" : stay.status, 
                          reservationStatus,
                          stay.paid_amount,
                          stay.total_amount,
                          (stay.reservation_service_fees || []).reduce((sum: number, fee: any) => {
                            return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
                          }, 0)
                        )}
                      </div>
                    </div>

                  {/* Datas */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500">Check-in</p>
                        <p className="text-sm font-medium text-slate-900">
                          {stay.checkin_date
                            ? format(parseISO(stay.checkin_date), "dd/MM/yyyy", {
                                locale: ptBR,
                              })
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Calendar className="h-4 w-4 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500">Check-out</p>
                        <p className="text-sm font-medium text-slate-900">
                          {stay.checkout_date
                            ? format(parseISO(stay.checkout_date), "dd/MM/yyyy", {
                                locale: ptBR,
                              })
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Quarto e categoria */}
                  {(stay.room_number || stay.room_category_name) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500">Acomodação</p>
                        <p className="text-sm font-medium text-slate-900">
                          {stay.room_number && stay.room_category_name
                            ? `Quarto ${stay.room_number} - ${stay.room_category_name}`
                            : stay.room_number
                            ? `Quarto ${stay.room_number}`
                            : stay.room_category_name}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Valor total */}
                  {stay.total_amount && (
                    <div className="flex items-start gap-2 pt-2 border-t border-slate-200">
                      <DollarSign className="h-4 w-4 text-slate-400 mt-0.5" />
                      <div>
                        <p className="text-xs text-slate-500">Valor Total</p>
                        <p className="text-sm font-semibold text-slate-900">
                          R$ {Number(stay.total_amount).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Botão para ver detalhes */}
                  <div className="pt-2 border-t border-slate-200">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className={`w-full ${isCancelled ? "border-red-200 text-red-700 hover:bg-red-50" : ""}`}
                    >
                      Ver Detalhes
                    </Button>
                  </div>
                </div>
              </Card>
            );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

