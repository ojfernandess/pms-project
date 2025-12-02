import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, User, Phone, Mail, CreditCard } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { formatCurrency } from "@/lib/reservationUtils";
import { useTranslation } from "react-i18next";

interface VerifyReservationStepProps {
  webCheckin: any;
  token: string;
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export function VerifyReservationStep({
  webCheckin,
  onNext,
}: VerifyReservationStepProps) {
  const { t, i18n } = useTranslation();
  const reservation = webCheckin?.reservation;
  const establishment = webCheckin?.establishment;
  
  // Selecionar locale baseado no idioma atual
  const getDateLocale = () => {
    const lang = i18n.language;
    if (lang.startsWith('es')) return es;
    if (lang.startsWith('en')) return enUS;
    return ptBR;
  };
  
  // Debug: verificar dados do establishment
  console.log("🔍 VerifyReservationStep - establishment:", establishment);
  console.log("🔍 VerifyReservationStep - establishment.address:", establishment?.address);
  console.log("🔍 VerifyReservationStep - establishment.city:", establishment?.city);
  console.log("🔍 VerifyReservationStep - establishment.state:", establishment?.state);

  if (!reservation) {
    return (
      <div className="text-center py-8">
        <p className="text-slate-600">{t("webCheckin.verify.loading")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {t("webCheckin.verify.title")}
        </h2>
        {establishment?.name && (
          <p className="text-lg font-semibold text-blue-600 mb-2">
            {establishment.name}
          </p>
        )}
        <p className="text-slate-600">
          {t("webCheckin.verify.subtitle")}
        </p>
      </div>

      <Card className="p-6 bg-blue-50 border-blue-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-slate-600 mb-1">{t("webCheckin.verify.locator")}</p>
            <p className="text-2xl font-bold text-blue-600">{webCheckin.locator}</p>
          </div>
          {(() => {
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
            const statusLabels: Record<string, { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
              unpaid: { labelKey: "webCheckin.verify.status.unpaid", variant: "destructive" },
              pending: { labelKey: "webCheckin.verify.status.pending", variant: "secondary" },
              confirmed: { labelKey: "webCheckin.verify.status.confirmed", variant: "default" },
              cancelled: { labelKey: "webCheckin.verify.status.cancelled", variant: "destructive" },
            };
            const statusInfo = statusLabels[actualStatus] || { labelKey: "webCheckin.verify.status.pending", variant: "secondary" };
            
            return (
              <Badge variant={statusInfo.variant} className="text-sm">
                {t(statusInfo.labelKey)}
              </Badge>
            );
          })()}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 mb-2">{t("webCheckin.verify.dates")}</p>
              <div className="space-y-1 text-sm text-slate-600">
                <div>
                  <span className="font-medium">{t("webCheckin.verify.checkin")} </span>
                  {format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale: getDateLocale() })}
                  {reservation.checkin_time && ` ${t("webCheckin.verify.at")} ${reservation.checkin_time.substring(0, 5)}`}
                </div>
                <div>
                  <span className="font-medium">{t("webCheckin.verify.checkout")} </span>
                  {format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale: getDateLocale() })}
                  {reservation.checkout_time && ` ${t("webCheckin.verify.at")} ${reservation.checkout_time.substring(0, 5)}`}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 mb-2">{t("webCheckin.verify.accommodation")}</p>
              <div className="space-y-1 text-sm text-slate-600">
                {/* Mostrar quarto apenas se o check-in estiver completo */}
                {webCheckin?.status === "completed" && (
                  <div>
                    <span className="font-medium">{t("webCheckin.verify.room")} </span>
                    {reservation.rooms?.room_number || reservation.rooms?.name || t("webCheckin.verify.toDefine")}
                  </div>
                )}
                <div>
                  <span className="font-medium">{t("webCheckin.verify.category")} </span>
                  {reservation.room_categories?.name || t("webCheckin.verify.notAvailable")}
                </div>
                {(() => {
                  // Priorizar endereço do prédio se a categoria tiver um prédio associado, senão usar estabelecimento
                  const building = reservation?.building;
                  const hasBuildingAddress = building && (building.street || building.city || building.state);
                  const addressSource = hasBuildingAddress ? building : establishment;
                  
                  const buildAddress = (source: any) => {
                    if (!source) return null;
                    
                    // Se o estabelecimento já tem o endereço formatado, usar ele
                    if (source.address && typeof source.address === 'string') {
                      return source.address;
                    }
                    
                    // Caso contrário, montar o endereço a partir dos campos
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
                  
                  return addressSource && (
                    <div className="mt-2 pt-2 border-t border-slate-200">
                      <span className="font-medium text-slate-700">
                        {t("webCheckin.verify.address")}{building && ` (${building.name || t("webCheckin.verify.building")})`}: 
                      </span>
                      <div className="text-slate-600 mt-1">
                        {fullAddress ? (
                          <div>{fullAddress}</div>
                        ) : (
                          <div className="text-slate-400 italic">{t("webCheckin.verify.addressNotRegistered")}</div>
                        )}
                        {(addressSource.city || addressSource.state || addressSource.zip_code) ? (
                          <div>
                            {addressSource.city && addressSource.city}
                            {addressSource.city && addressSource.state && ", "}
                            {addressSource.state && addressSource.state}
                            {addressSource.zip_code && ` - ${addressSource.zip_code}`}
                          </div>
                        ) : fullAddress ? null : (
                          <div className="text-slate-400 italic text-xs mt-1">
                            {t("webCheckin.verify.cityStateNotRegistered")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <User className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 mb-2">{t("webCheckin.verify.guest")}</p>
              <div className="space-y-1 text-sm text-slate-600">
                <div className="font-medium">
                  {reservation.guest?.full_name || reservation.financial_responsible?.full_name || t("webCheckin.verify.notAvailable")}
                </div>
                {reservation.guest?.email && (
                  <div className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {reservation.guest.email}
                  </div>
                )}
                {reservation.guest?.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {reservation.guest.phone}
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-start gap-3">
            <CreditCard className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900 mb-2">{t("webCheckin.verify.value")}</p>
              
              {/* Calcular valor total incluindo taxas */}
              {(() => {
                const baseAmount = reservation.total_amount || 0;
                const serviceFeesTotal = (reservation.reservation_service_fees || []).reduce((sum: number, fee: any) => {
                  return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
                }, 0);
                const totalWithFees = baseAmount + serviceFeesTotal;
                
                // Usar paid_amount do banco de dados (valor oficial atualizado)
                // Este valor é atualizado automaticamente quando há pagamentos via Stripe ou outros métodos
                const totalPaid = Number(reservation.paid_amount || 0);
                
                const pendingAmount = totalWithFees - totalPaid;
                
                return (
                  <div className="space-y-2">
                    <div>
                      <p className="text-lg font-bold text-green-600">
                        {formatCurrency(totalWithFees)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {t("webCheckin.verify.baseValue")} {formatCurrency(baseAmount)}
                        {serviceFeesTotal > 0 && (
                          <span className="ml-2">
                            + {t("webCheckin.verify.fees")} {formatCurrency(serviceFeesTotal)}
                          </span>
                        )}
                      </p>
                    </div>
                    
                    {/* Mostrar taxas detalhadas se houver */}
                    {serviceFeesTotal > 0 && (reservation.reservation_service_fees || []).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-200">
                        <p className="text-xs font-semibold text-slate-700 mb-1">{t("webCheckin.verify.includedFees")}</p>
                        <div className="space-y-1">
                          {(reservation.reservation_service_fees || []).map((fee: any, index: number) => {
                            const feeTotal = Number(fee.amount || 0) * Number(fee.quantity || 1);
                            return (
                              <div key={fee.id || index} className="text-xs text-slate-600 flex justify-between">
                                <span>
                                  {fee.service_fees?.name || t("webCheckin.verify.fees")} 
                                  {fee.quantity > 1 && ` (${fee.quantity}x)`}
                                </span>
                                <span className="font-medium">{formatCurrency(feeTotal)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {/* Mostrar valor pago e pendente */}
                    <div className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">{t("webCheckin.verify.paidValue")}</span>
                        <span className="font-semibold text-green-600">
                          {formatCurrency(totalPaid)}
                        </span>
                      </div>
                      {pendingAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">{t("webCheckin.verify.pendingValue")}</span>
                          <span className="font-semibold text-orange-600">
                            {formatCurrency(pendingAmount)}
                          </span>
                        </div>
                      )}
                      {pendingAmount <= 0 && totalPaid > 0 && (
                        <div className="text-xs text-green-600 font-medium">
                          {t("webCheckin.verify.paymentComplete")}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end pt-4">
        <Button onClick={() => onNext({})} className="px-8">
          {t("webCheckin.verify.continue")}
        </Button>
      </div>
    </div>
  );
}

