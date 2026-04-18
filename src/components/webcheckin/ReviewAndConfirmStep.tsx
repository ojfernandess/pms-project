import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { useWebCheckin } from "@/hooks/useWebCheckin";
import { useGuestAccount } from "@/hooks/useGuestAccount";
import { useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { useTranslation } from "react-i18next";

interface ReviewAndConfirmStepProps {
  webCheckin: any;
  token: string;
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export function ReviewAndConfirmStep({
  webCheckin,
  token,
  data,
  onNext,
  onBack,
  isFirstStep,
}: ReviewAndConfirmStepProps) {
  const { t, i18n } = useTranslation();
  const { acceptTerms, completeWebCheckin } = useWebCheckin();
  const { linkReservationToAccount, getCurrentSession } = useGuestAccount();
  const queryClient = useQueryClient();
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  
  // Selecionar locale baseado no idioma atual
  const getDateLocale = () => {
    const lang = i18n.language;
    if (lang.startsWith('es')) return es;
    if (lang.startsWith('en')) return enUS;
    return ptBR;
  };

  const reservation = webCheckin.reservation;
  const guests = data.guests || [];
  const preferences = data.preferences || {};
  
  // Obter accountId do hóspede logado
  const session = getCurrentSession();
  const guestAccountId = session.accountId;

  const handleComplete = async () => {
    if (!termsAccepted) {
      alert(t("webCheckin.review.errors.acceptTerms"));
      return;
    }

    setIsCompleting(true);

    try {
      // Aceitar termos primeiro
      await acceptTerms.mutateAsync(token);

      // Vincular reserva à conta do hóspede (se ainda não estiver vinculada)
      if (guestAccountId && webCheckin.locator) {
        try {
          await linkReservationToAccount.mutateAsync({
            accountId: guestAccountId,
            locator: webCheckin.locator,
            reservationId: reservation.id,
          });
        } catch (linkError) {
          // Não bloquear o check-in se a vinculação falhar (pode já estar vinculada)
          console.warn("Aviso ao vincular reserva:", linkError);
        }
      }

      // Completar check-in
      await completeWebCheckin.mutateAsync(token);

      // Invalidar queries para garantir atualização
      queryClient.invalidateQueries({ queryKey: ["web_checkin"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      queryClient.invalidateQueries({ queryKey: ["guest_stay_history"] });

      // Aguardar um pouco para garantir que os dados foram atualizados
      await new Promise(resolve => setTimeout(resolve, 500));

      onNext({ completed: true });
    } catch (error: any) {
      console.error("Erro ao completar check-in:", error);
      alert(t("webCheckin.review.errors.completeError") || "Erro ao completar check-in. Tente novamente.");
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {t("webCheckin.review.title")}
        </h2>
        <p className="text-slate-600">
          {t("webCheckin.review.subtitle")}
        </p>
      </div>

      {/* Resumo da Reserva */}
      <Card className="p-6">
        <h3 className="font-semibold text-slate-900 mb-4">{t("webCheckin.review.reservationSummary")}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">{t("webCheckin.review.locator")}</span>
            <span className="font-semibold">{webCheckin.locator}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">{t("webCheckin.review.checkin")}</span>
            <span>
              {format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale: getDateLocale() })}
              {reservation.checkin_time && ` ${t("webCheckin.verify.at")} ${reservation.checkin_time.substring(0, 5)}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">{t("webCheckin.review.checkout")}</span>
            <span>
              {format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale: getDateLocale() })}
              {reservation.checkout_time && ` ${t("webCheckin.verify.at")} ${reservation.checkout_time.substring(0, 5)}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">{t("webCheckin.review.accommodation")}</span>
            <span>
              {reservation.rooms?.room_number || reservation.rooms?.name || t("webCheckin.review.toDefine")} -{" "}
              {reservation.room_categories?.name}
            </span>
          </div>
        </div>
      </Card>

      {/* Hóspedes */}
      <Card className="p-6">
        <h3 className="font-semibold text-slate-900 mb-4">{t("webCheckin.review.guests")}</h3>
        <div className="space-y-3">
          {guests.map((guest: any, index: number) => (
            <div key={index} className="border-b pb-3 last:border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {guest.name}
                    {guest.is_main_guest && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                        {t("webCheckin.review.main")}
                      </span>
                    )}
                  </p>
                  {guest.email && <p className="text-sm text-slate-600">{guest.email}</p>}
                  {guest.phone && <p className="text-sm text-slate-600">{guest.phone}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Preferências */}
      {preferences && Object.keys(preferences).length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-slate-900 mb-4">{t("webCheckin.review.preferences")}</h3>
          <div className="space-y-2 text-sm">
            {preferences.early_checkin && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>{t("webCheckin.review.earlyCheckinRequested")}</span>
              </div>
            )}
            {preferences.late_checkout && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>{t("webCheckin.review.lateCheckoutRequested")}</span>
              </div>
            )}
            {preferences.special_requests && (
              <div>
                <span className="font-medium">{t("webCheckin.review.specialRequests")} </span>
                <span>{preferences.special_requests}</span>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Termos e Condições */}
      <Card className="p-6 bg-slate-50">
        <div className="flex items-start space-x-3">
          <Checkbox
            id="terms"
            checked={termsAccepted}
            onCheckedChange={(checked) => setTermsAccepted(!!checked)}
            className="mt-1"
          />
          <div className="flex-1">
            <Label htmlFor="terms" className="cursor-pointer">
              <span className="font-semibold">{t("webCheckin.review.terms")}</span>
              <p className="text-sm text-slate-600 mt-1">
                {t("webCheckin.review.termsText")}
              </p>
            </Label>
          </div>
        </div>
      </Card>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">{t("webCheckin.review.important")}</p>
            <p>
              {t("webCheckin.review.importantText")}
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={isFirstStep}>
          {t("webCheckin.review.back")}
        </Button>
        <Button
          onClick={handleComplete}
          disabled={!termsAccepted || isCompleting || completeWebCheckin.isPending}
          className="bg-green-600 hover:bg-green-700"
        >
          {isCompleting || completeWebCheckin.isPending
            ? t("webCheckin.review.finalizing")
            : t("webCheckin.review.confirmCheckin")}
        </Button>
      </div>
    </div>
  );
}


