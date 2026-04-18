import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CheckCircle2, Mail, Calendar, Key, Navigation, Home, XCircle, Ban, FileText, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { GuestMenu } from "./GuestMenu";
import { PoliciesViewDialog } from "./PoliciesViewDialog";

interface ReservationDetailsViewProps {
  reservationId: string;
  onBack: () => void;
  token: string;
}

export function ReservationDetailsView({ reservationId, onBack, token }: ReservationDetailsViewProps) {
  const [showPoliciesDialog, setShowPoliciesDialog] = useState(false);
  
  // Buscar dados completos da reserva
  const { data: reservation, isLoading } = useQuery({
    queryKey: ["reservation_details", reservationId],
    refetchInterval: 30000, // Refetch a cada 30 segundos para atualizar status
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Buscar dados básicos da reserva
      const { data: reservationData, error } = await supabase
        .from("reservations")
        .select(`
          *,
          rooms(room_number, name, fixed_password, authentication_type),
          room_categories(name),
          establishment:establishments(name),
          reservation_service_fees(amount, quantity, service_fees(name))
        `)
        .eq("id", reservationId)
        .maybeSingle();

      if (error) throw error;
      if (!reservationData) return null;

      // Buscar dados do hóspede
      let guest = null;
      if (reservationData.guest_id) {
        const { data: guestData } = await supabase
          .from("clients")
          .select("full_name, email, phone")
          .eq("id", reservationData.guest_id)
          .maybeSingle();
        guest = guestData;
      }

      // Buscar dados do building através da categoria
      let building = null;
      if (reservationData.category_id) {
        const { data: categoryData } = await supabase
          .from("room_categories")
          .select("building_id")
          .eq("id", reservationData.category_id)
          .maybeSingle();
        
        if (categoryData?.building_id) {
          const { data: buildingData } = await supabase
            .from("buildings")
            .select("street, city, state, number, neighborhood, zip_code, name")
            .eq("id", categoryData.building_id)
            .maybeSingle();
          building = buildingData;
        }
      }

      // Buscar endereço do estabelecimento
      let establishmentAddress = null;
      if (reservationData.establishment_id) {
        const { data: hotelSettings } = await supabase
          .from("hotel_settings")
          .select("street, number, neighborhood, city, state, zip_code")
          .eq("establishment_id", reservationData.establishment_id)
          .maybeSingle();
        
        if (hotelSettings) {
          establishmentAddress = {
            ...reservationData.establishment,
            ...hotelSettings,
          };
        }
      }

      // Buscar web_checkin para obter locator
      const { data: webCheckinData } = await supabase
        .from("web_checkin")
        .select("locator, status")
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...reservationData,
        guest,
        building,
        establishment: establishmentAddress || reservationData.establishment,
        webCheckin: webCheckinData,
      };
    },
    enabled: !!reservationId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-600 mb-4">Reserva não encontrada.</p>
        <Button onClick={onBack} variant="outline">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>
    );
  }

  const establishment = reservation.establishment;
  const building = reservation.building;
  
  // Determinar status real baseado em pagamento (mesma lógica do PMS)
  const getReservationStatus = () => {
    // Status especiais que não dependem de pagamento
    if (['blocked', 'cancelled', 'checkedin', 'checkedout', 'noshow'].includes(reservation.status)) {
      return reservation.status;
    }

    const paidAmount = Number(reservation.paid_amount || 0);
    const baseTotalAmount = Number(reservation.total_amount || 0);
    
    // Calcular total incluindo taxas extras
    const serviceFeesTotal = (reservation.reservation_service_fees || []).reduce((sum: number, fee: any) => {
      return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
    }, 0);
    
    const totalAmount = baseTotalAmount + serviceFeesTotal;
    
    if (paidAmount === 0) {
      // Sem pagamento = Não Pago
      return "unpaid";
    } else if (paidAmount >= totalAmount && totalAmount > 0) {
      // Pagamento completo = Confirmada
      return "confirmed";
    } else {
      // Pagamento parcial ou serviço extra = Pendente
      return "pending";
    }
  };

  const actualStatus = getReservationStatus();
  const isCancelled = actualStatus === "cancelled";
  const isUnpaid = actualStatus === "unpaid";
  const isPending = actualStatus === "pending";

  return (
    <div className="space-y-6">
      {/* Botão Voltar */}
      <Button onClick={onBack} variant="outline" size="sm">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar para Histórico
      </Button>

      {/* Status Card - Verificar status baseado em pagamento */}
      {isCancelled ? (
        <Card className="p-6 bg-red-50 border-red-200">
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900 mb-1">
                Reserva Cancelada
              </h2>
              <p className="text-sm text-slate-600">
                Esta reserva foi cancelada. Para mais informações ou para reativar sua reserva, 
                entre em contato com o estabelecimento.
              </p>
            </div>
            {reservation.webCheckin?.locator && (
              <div className="text-right">
                <p className="text-xs text-slate-600 mb-1">Localizador</p>
                <p className="text-2xl font-bold text-red-600 font-mono">{reservation.webCheckin.locator}</p>
              </div>
            )}
          </div>
        </Card>
      ) : isUnpaid ? (
        <Card className="p-6 bg-red-50 border-red-200">
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900 mb-1">
                Reserva Não Paga
              </h2>
              <p className="text-sm text-slate-600">
                Esta reserva ainda não possui pagamento registrado. Entre em contato com o estabelecimento para realizar o pagamento.
              </p>
            </div>
            {reservation.webCheckin?.locator && (
              <div className="text-right">
                <p className="text-xs text-slate-600 mb-1">Localizador</p>
                <p className="text-2xl font-bold text-red-600 font-mono">{reservation.webCheckin.locator}</p>
              </div>
            )}
          </div>
        </Card>
      ) : isPending ? (
        <Card className="p-6 bg-yellow-50 border-yellow-200">
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yellow-100">
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900 mb-1">
                Pagamento Pendente
              </h2>
              <p className="text-sm text-slate-600">
                Esta reserva possui pagamento parcial ou taxas adicionais pendentes. Entre em contato com o estabelecimento para regularizar.
              </p>
            </div>
            {reservation.webCheckin?.locator && (
              <div className="text-right">
                <p className="text-xs text-slate-600 mb-1">Localizador</p>
                <p className="text-2xl font-bold text-yellow-600 font-mono">{reservation.webCheckin.locator}</p>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-6 bg-green-50 border-green-200">
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-slate-900 mb-1">
                Reserva Confirmada
              </h2>
              <p className="text-sm text-slate-600">
                Sua reserva está confirmada e pronta para sua estadia
              </p>
            </div>
            {reservation.webCheckin?.locator && (
              <div className="text-right">
                <p className="text-xs text-slate-600 mb-1">Localizador</p>
                <p className="text-2xl font-bold text-green-600 font-mono">{reservation.webCheckin.locator}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Informações da Reserva */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900">Informações da Reserva</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPoliciesDialog(true)}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            Ver Políticas
          </Button>
        </div>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900">Email de Confirmação</p>
              <p className="text-sm text-slate-600">
                Você receberá um email de confirmação em breve com todos os detalhes da sua reserva.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900">Datas da Estadia</p>
              <p className="text-sm text-slate-600">
                Check-in:{" "}
                <strong>
                  {format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale: ptBR })}
                  {reservation.checkin_time && ` às ${reservation.checkin_time.substring(0, 5)}`}
                </strong>
              </p>
              <p className="text-sm text-slate-600">
                Check-out:{" "}
                <strong>
                  {format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale: ptBR })}
                  {reservation.checkout_time && ` às ${reservation.checkout_time.substring(0, 5)}`}
                </strong>
              </p>
            </div>
          </div>

          {/* Acomodação e Senha do Quarto */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card de Acomodação */}
            <Card className="p-6 border border-slate-200 bg-white">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <Home className="h-6 w-6 text-slate-400" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                    Acomodação
                  </p>
                  {reservation.rooms?.room_number || reservation.rooms?.name ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-3xl font-light text-slate-900 tracking-tight">
                          {reservation.rooms.room_number || reservation.rooms.name}
                        </p>
                      </div>
                      {reservation.room_categories?.name && (
                        <div className="pt-3 border-t border-slate-100">
                          <p className="text-sm text-slate-600">
                            {reservation.room_categories.name}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Será informado na recepção</p>
                  )}
                </div>
              </div>
            </Card>

            {/* Card de Senha do Quarto */}
            {reservation.rooms?.fixed_password && reservation.rooms?.authentication_type === 'fixed_password' && (
              <Card className="p-6 border border-slate-200 bg-white">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <Key className="h-6 w-6 text-slate-400" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                      Senha do Quarto
                    </p>
                    <div className="space-y-3">
                      <div className="py-3 px-4 bg-slate-50 border border-slate-200 rounded-md">
                        <p className="text-2xl font-mono font-light text-slate-900 tracking-wider text-center">
                          {reservation.rooms.fixed_password}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500 text-center">
                        Senha do quarto do hóspede
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Como Chegar */}
          {(() => {
            const hasBuildingAddress = building && (building.street || building.city || building.state);
            const addressSource = hasBuildingAddress ? building : establishment;
            
            const buildAddress = (source: any) => {
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
              <Card className="p-6 border border-slate-200 bg-white">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <Navigation className="h-6 w-6 text-slate-400" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                      Como Chegar
                      {building && (
                        <span className="ml-2 text-xs font-normal text-slate-400">
                          ({building.name || "Prédio"})
                        </span>
                      )}
                    </p>
                    <div className="space-y-2 text-sm text-slate-700">
                      {fullAddress && (
                        <p className="font-normal">{fullAddress}</p>
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
                      <div className="mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const address = `${fullAddress || ""} ${addressSource?.city || ""} ${addressSource?.state || ""}`.trim();
                            const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
                            window.open(googleMapsUrl, '_blank');
                          }}
                          className="text-xs border-slate-300 text-slate-700 hover:bg-slate-50"
                        >
                          <Navigation className="h-3 w-3 mr-1.5" strokeWidth={2} />
                          Abrir no Google Maps
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })()}
        </div>
      </Card>

      {/* Menu de Funcionalidades (apenas se tiver webCheckin completo, não estiver cancelada e não estiver sem pagamento) */}
      {!isCancelled && !isUnpaid && reservation.webCheckin && reservation.webCheckin.status === "completed" && token && (
        <GuestMenu 
          webCheckin={{
            reservation: reservation,
            establishment: establishment,
            locator: reservation.webCheckin.locator || reservation.reservation_code,
            status: reservation.webCheckin.status,
          }} 
          token={token} 
          isLastStep={true} 
        />
      )}

      {/* Mensagem se reserva estiver cancelada */}
      {isCancelled && (
        <Card className="p-6 bg-red-50 border-red-200">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
              <Ban className="h-8 w-8 text-red-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              Reserva Cancelada
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Esta reserva foi cancelada. As funcionalidades de check-in, estender reserva, 
              abrir chamados e check-out não estão disponíveis para reservas canceladas.
            </p>
            <p className="text-xs text-slate-500">
              Para mais informações ou para reativar sua reserva, entre em contato com o estabelecimento.
            </p>
          </div>
        </Card>
      )}

      {/* Mensagem se reserva estiver sem pagamento */}
      {isUnpaid && (
        <Card className="p-6 bg-red-50 border-red-200">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              Reserva Não Paga
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Esta reserva não possui pagamento registrado. As funcionalidades de check-in, estender reserva, 
              abrir chamados e check-out não estão disponíveis para reservas sem pagamento.
            </p>
            <p className="text-xs text-slate-500">
              Entre em contato com o estabelecimento para realizar o pagamento e confirmar sua reserva.
            </p>
          </div>
        </Card>
      )}

      {/* Dialog de Políticas */}
      <PoliciesViewDialog
        open={showPoliciesDialog}
        onOpenChange={setShowPoliciesDialog}
        establishmentId={reservation?.establishment_id}
        categoryId={reservation?.category_id}
      />
    </div>
  );
}

