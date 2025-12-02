import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Mail, Calendar, MapPin, Key, Navigation, Home, Wifi, LayoutDashboard, Loader2 } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { GuestMenu } from "./GuestMenu";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { triggerEmail } from "@/lib/emailService";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface CheckinCompleteStepProps {
  webCheckin: any;
  token: string;
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export function CheckinCompleteStep({ webCheckin, token }: CheckinCompleteStepProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const reservation = webCheckin.reservation;
  const establishment = webCheckin?.establishment;
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  
  // Selecionar locale baseado no idioma atual
  const getDateLocale = () => {
    const lang = i18n.language;
    if (lang.startsWith('es')) return es;
    if (lang.startsWith('en')) return enUS;
    return ptBR;
  };

  const handleSendEmail = async () => {
    if (!reservation?.id) {
      toast.error(t("webCheckin.complete.errors.reservationNotFound") || "Erro: Reserva não encontrada");
      return;
    }

    const recipientEmail = reservation.guest?.email || reservation.financial_responsible?.email;
    
    if (!recipientEmail) {
      toast.error(t("webCheckin.complete.errors.emailNotFound") || "E-mail do hóspede não encontrado");
      return;
    }

    setIsSendingEmail(true);
    try {
      // Usar triggerEmail que busca o template configurado para checkin.confirmed
      // O template será processado automaticamente com todas as variáveis da reserva
      const queueId = await triggerEmail('checkin.confirmed', reservation);
      
      if (queueId) {
        toast.success("E-mail de confirmação enviado com sucesso!");
      } else {
        toast.warning("E-mail adicionado à fila. Verifique se o template está configurado e as configurações de e-mail estão ativas.");
      }
    } catch (error: any) {
      console.error("Erro ao enviar e-mail:", error);
      toast.error(error?.message || "Erro ao enviar e-mail. Tente novamente.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-4">
          <CheckCircle2 className="h-12 w-12 text-green-600" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">
          {t("webCheckin.complete.title")}
        </h2>
        <p className="text-slate-600 text-lg">
          {t("webCheckin.complete.subtitle")}
        </p>
      </div>

      <Card className="p-6 bg-green-50 border-green-200">
        <div className="text-center">
          <p className="text-sm text-slate-600 mb-2">{t("webCheckin.complete.locator")}</p>
          <p className="text-3xl font-bold text-green-600">{webCheckin.locator}</p>
          {reservation?.identification_number && (
            <div className="mt-3 pt-3 border-t border-green-200">
              <p className="text-xs text-slate-500 mb-1">{t("webCheckin.complete.identificationNumber")}</p>
              <p className="text-xl font-semibold text-green-700">#{reservation.identification_number}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Datas de Check-in e Check-out */}
      <Card className="p-6">
        <h3 className="font-semibold text-slate-900 mb-4 text-center">{t("webCheckin.complete.reservationDates")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <Calendar className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                {t("webCheckin.verify.checkin")}
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {reservation.checkin_date
                  ? format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale: getDateLocale() })
                  : t("webCheckin.complete.notInformed")}
              </p>
              {reservation.checkin_time && (
                <p className="text-sm text-slate-600 mt-1">
                  {t("webCheckin.verify.at")} {reservation.checkin_time.substring(0, 5)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <Calendar className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
                {t("webCheckin.verify.checkout")}
              </p>
              <p className="text-lg font-semibold text-slate-900">
                {reservation.checkout_date
                  ? format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale: getDateLocale() })
                  : t("webCheckin.complete.notInformed")}
              </p>
              {reservation.checkout_time && (
                <p className="text-sm text-slate-600 mt-1">
                  {t("webCheckin.verify.at")} {reservation.checkout_time.substring(0, 5)}
                </p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold text-slate-900 mb-4">{t("webCheckin.complete.nextSteps")}</h3>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <Mail className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900">{t("webCheckin.complete.confirmationEmail")}</p>
              <p className="text-sm text-slate-600">
                {t("webCheckin.complete.confirmationEmailText")}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-slate-900">{t("webCheckin.complete.checkinDay")}</p>
              <p className="text-sm text-slate-600">
                {t("webCheckin.complete.checkinDayText", {
                  date: `${format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale: getDateLocale() })}${reservation.checkin_time ? ` ${t("webCheckin.verify.at")} ${reservation.checkin_time.substring(0, 5)}` : ''}`
                })}
              </p>
            </div>
          </div>

          {/* Acomodação e Senha do Quarto em Cards Separados */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card de Acomodação */}
            <Card className="p-6 border border-slate-200 bg-white">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <Home className="h-6 w-6 text-slate-400" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                    {t("webCheckin.complete.accommodation")}
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
                    <p className="text-sm text-slate-500">
                      {t("webCheckin.complete.willBeInformed")}
                    </p>
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
                      {t("webCheckin.complete.roomPassword")}
                    </p>
                    <div className="space-y-3">
                      <div className="py-3 px-4 bg-slate-50 border border-slate-200 rounded-md">
                        <p className="text-2xl font-mono font-light text-slate-900 tracking-wider text-center">
                          {reservation.rooms.fixed_password}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500 text-center">
                        {t("webCheckin.complete.roomPasswordText")}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Como Chegar - Priorizar endereço do prédio se disponível, senão usar estabelecimento */}
          {(() => {
            // Priorizar endereço do prédio se a categoria tiver um prédio associado
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
            const hasAddress = fullAddress || addressSource?.city || addressSource?.state;
            
            return hasAddress && (
              <Card className="p-6 border border-slate-200 bg-white">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <Navigation className="h-6 w-6 text-slate-400" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                      {t("webCheckin.complete.howToGet")}
                      {building && (
                        <span className="ml-2 text-xs font-normal text-slate-400">
                          ({building.name || t("webCheckin.complete.building")})
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
                          {t("webCheckin.complete.openGoogleMaps")}
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

      <Card className="p-6 bg-blue-50 border-blue-200">
        <p className="text-sm text-blue-800">
          <strong>{t("webCheckin.complete.tip")}</strong> {t("webCheckin.complete.tipText", { locator: webCheckin.locator })}
        </p>
      </Card>

      <div className="text-center pt-4 space-y-4">
        <div className="flex gap-4 justify-center">
          <Button
            onClick={() => window.print()}
            variant="outline"
          >
            {t("webCheckin.complete.printConfirmation")}
          </Button>
          <Button
            onClick={handleSendEmail}
            disabled={isSendingEmail}
          >
            {isSendingEmail ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("webCheckin.complete.sending") || "Enviando..."}
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                {t("webCheckin.complete.sendEmail")}
              </>
            )}
          </Button>
        </div>
        
        {/* Botão para Dashboard */}
        <div className="pt-4 border-t border-slate-200">
          <Button
            onClick={() => navigate("/guest-dashboard")}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            size="lg"
          >
            <LayoutDashboard className="h-5 w-5 mr-2" />
            {t("webCheckin.complete.goToDashboard")}
          </Button>
          <p className="text-xs text-slate-500 mt-2">
            {t("webCheckin.complete.dashboardHint")}
          </p>
        </div>
      </div>

      {/* Menu pós-check-in */}
      <GuestMenu webCheckin={webCheckin} token={token} isLastStep={true} />
    </div>
  );
}

