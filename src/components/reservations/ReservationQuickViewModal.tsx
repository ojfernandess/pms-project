import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  User, 
  Calendar, 
  MapPin, 
  Users, 
  DollarSign, 
  Hash, 
  Tag,
  Edit,
  CreditCard,
  Info,
  ArrowRightLeft,
  Ban,
  CheckCircle2,
  Building2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { PreregistrationExpiryTimer } from "@/components/reservations/PreregistrationExpiryTimer";

interface ReservationQuickViewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reservation: any;
  onEdit?: () => void;
  onEditPayments?: () => void;
  onLaunchPayment?: () => void;
  onViewDetails?: () => void;
  onTransfer?: () => void;
  onReallocate?: () => void;
  onCancel?: () => void;
  onConfirmPreregistration?: () => void;
}

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  unpaid: { label: "Não Pago", variant: "destructive" },
  pending: { label: "Pendente", variant: "secondary" },
  confirmed: { label: "Confirmada", variant: "default" },
  checkedin: { label: "Check-in", variant: "default" },
  checkedout: { label: "Check-out", variant: "outline" },
  cancelled: { label: "Cancelada", variant: "destructive" },
  noshow: { label: "No-show", variant: "destructive" },
  blocked: { label: "Bloqueado", variant: "secondary" },
  preregistration: { label: "Pré-reserva", variant: "secondary" },
};

export function ReservationQuickViewModal({
  open,
  onOpenChange,
  reservation,
  onEdit,
  onEditPayments,
  onLaunchPayment,
  onViewDetails,
  onTransfer,
  onReallocate,
  onCancel,
  onConfirmPreregistration,
}: ReservationQuickViewModalProps) {
  const navigate = useNavigate();
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { canDelete } = usePermissions();
  if (!reservation) return null;

  // Debug: verificar estrutura do pricing_plans
  // O Supabase pode retornar como array ou objeto único dependendo da query
  const pricingPlanName = Array.isArray(reservation.pricing_plans) 
    ? reservation.pricing_plans[0]?.name 
    : reservation.pricing_plans?.name;

  // Determinar status real baseado em pagamento (mesma lógica do mapa de reservas)
  const getReservationStatus = () => {
    // Status especiais que não dependem de pagamento
    if (['blocked', 'cancelled', 'checkedin', 'checkedout', 'noshow', 'preregistration'].includes(reservation.status)) {
      return reservation.status;
    }

    const paidAmount = Number(reservation.paid_amount || 0);
    const baseTotalAmount = Number(reservation.total_amount || 0);
    
    // Calcular total incluindo taxas extras
    const serviceFeesTotal = (reservation.reservation_service_fees || []).reduce((sum: number, fee: any) => {
      return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
    }, 0);
    
    const totalWithFees = baseTotalAmount + serviceFeesTotal;
    
    if (paidAmount === 0) {
      // Sem pagamento = Não Pago
      return "unpaid";
    } else if (paidAmount >= baseTotalAmount && baseTotalAmount > 0) {
      // Valor base pago: verificar se há taxas pendentes
      if (serviceFeesTotal > 0 && paidAmount < totalWithFees) {
        // Base paga MAS com taxas pendentes = Pendente
        return "pending";
      } else {
        // Base paga E sem taxas pendentes = Confirmada
        return "confirmed";
      }
    } else {
      // Base não paga completamente = Pendente
      return "pending";
    }
  };

  const actualStatus = getReservationStatus();
  const statusInfo = statusConfig[actualStatus] || statusConfig.confirmed;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden rounded-xl border-slate-200 shadow-xl">
        <DialogHeader className="space-y-2 px-5 pt-5 pb-3 border-b border-slate-100 bg-slate-50/70">
          <DialogTitle className="text-lg font-semibold text-slate-900">
            Reserva {reservation.reservation_code || reservation.id?.substring(0, 8)}
          </DialogTitle>
          <Badge variant={statusInfo.variant} className="w-fit">
            {statusInfo.label}
          </Badge>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          {/* Nome do Hóspede */}
          {reservation.guest_name && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Hóspede
              </label>
              <div className="text-base font-semibold text-slate-900">
                {reservation.guest_name}
              </div>
            </div>
          )}

          {/* Check In / Check Out */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Check In
              </label>
              <div className="text-sm font-semibold text-slate-900 border border-slate-200 rounded-md p-2.5 bg-slate-50">
                {format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale: ptBR })}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Check Out
              </label>
              <div className="text-sm font-semibold text-slate-900 border border-slate-200 rounded-md p-2.5 bg-slate-50">
                {format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale: ptBR })}
              </div>
            </div>
          </div>

          {/* Origem / Plano de Tarifa */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              Origem / Plano de Tarifa
            </label>
            <div className="text-sm text-slate-900 border border-slate-200 rounded-md p-2.5 bg-slate-50">
              {reservation.source || reservation.channel || "Direto"} / {pricingPlanName || "Padrão"}
            </div>
          </div>

          {/* Quantidade de Hóspedes e Valor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Qtd de Hóspedes
              </label>
              <div className="text-sm font-semibold text-slate-900 border border-slate-200 rounded-md p-2.5 bg-slate-50">
                {reservation.adults || 1}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5" />
                Valor Total
              </label>
              <div className="text-sm font-bold text-slate-900 border border-slate-200 rounded-md p-2.5 bg-slate-50">
                {(() => {
                  const baseTotalAmount = Number(reservation.total_amount || 0);
                  const serviceFeesTotal = (reservation.reservation_service_fees || []).reduce((sum: number, fee: any) => {
                    return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
                  }, 0);
                  const totalWithFees = baseTotalAmount + serviceFeesTotal;
                  return `R$ ${totalWithFees.toFixed(2).replace('.', ',')}`;
                })()}
              </div>
            </div>
          </div>

          {/* Localizador */}
          {(reservation.locator || reservation.reservation_code) && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" />
                Localizador
              </label>
              <div className="text-sm font-mono text-slate-900 border border-slate-200 rounded-md p-2.5 bg-slate-50">
                {reservation.locator || reservation.reservation_code}
              </div>
            </div>
          )}

          {/* Botões de Ação */}
          <div className="space-y-2 pt-2">
            <div className="grid grid-cols-2 gap-2">
              {onEdit && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onEdit();
                    onOpenChange(false);
                  }}
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Editar Responsável
                </Button>
              )}
              {onLaunchPayment && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    onLaunchPayment();
                    onOpenChange(false);
                  }}
                >
                  <CreditCard className="h-4 w-4 mr-2" />
                  Lançar Pagamento
                </Button>
              )}
            </div>

            {reservation.status === "preregistration" && (
              <PreregistrationExpiryTimer
                expirationDate={reservation.expiration_date}
                variant="compact"
              />
            )}

            {/* Botão de Efetivar Pré-reserva - apenas se for pré-reserva */}
            {/* Verificar o status original da reserva, não o status calculado */}
            {reservation.status === "preregistration" && onConfirmPreregistration && (
              <Button
                variant="outline"
                className="w-full bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-900"
                onClick={() => {
                  onConfirmPreregistration();
                  onOpenChange(false);
                }}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Efetivar Pré-reserva
              </Button>
            )}

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                const currentId = establishmentId || localStorage.getItem("selectedEstablishmentId");
                if (currentId && reservation?.id) {
                  if (reservation?.reservation_code) {
              navigate(`/${currentId}/reservas/${reservation.reservation_code}`);
            } else {
              // Fallback: se não encontrar o código, usar o ID
              navigate(`/${currentId}/reservas/${reservation.id}`);
            }
                  onOpenChange(false);
                } else if (onViewDetails) {
                  onViewDetails();
                  onOpenChange(false);
                }
              }}
            >
              <Info className="h-4 w-4 mr-2" />
              Detalhes da Reserva
            </Button>

            <div className="grid grid-cols-2 gap-2">
              {onTransfer && (
                <Button
                  variant="outline"
                  className="w-full bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900"
                  onClick={() => {
                    onTransfer();
                    onOpenChange(false);
                  }}
                >
                  <ArrowRightLeft className="h-4 w-4 mr-2" />
                  Transferir
                </Button>
              )}
              {onReallocate && (
                <Button
                  variant="outline"
                  className="w-full bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-900"
                  onClick={() => {
                    onReallocate();
                    onOpenChange(false);
                  }}
                >
                  <Building2 className="h-4 w-4 mr-2" />
                  Realocar
                </Button>
              )}
              {onCancel && reservation.status !== 'cancelled' && canDelete("reservations") && (
                <Button
                  variant="outline"
                  className="w-full bg-red-50 hover:bg-red-100 border-red-200 text-red-900"
                  onClick={() => {
                    onCancel();
                    onOpenChange(false);
                  }}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Cancelar Reserva
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

