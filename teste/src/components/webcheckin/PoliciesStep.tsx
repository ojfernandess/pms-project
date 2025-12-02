import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

interface PoliciesStepProps {
  webCheckin: any;
  token: string;
  data?: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep?: boolean;
  isLastStep?: boolean;
}

export function PoliciesStep({
  webCheckin,
  token,
  data,
  onNext,
  onBack,
  isFirstStep = false,
  isLastStep = false,
}: PoliciesStepProps) {
  const { t } = useTranslation();
  const [accepted, setAccepted] = useState(false);
  const [policiesAccepted, setPoliciesAccepted] = useState(false);

  // Buscar políticas do estabelecimento
  const { data: hotelSettings, isLoading: isLoadingHotel } = useQuery({
    queryKey: ["hotel_settings", webCheckin?.establishment?.id],
    queryFn: async () => {
      if (!webCheckin?.establishment?.id) return null;

      const { data, error } = await supabase
        .from("hotel_settings")
        .select("policies")
        .eq("establishment_id", webCheckin.establishment.id)
        .maybeSingle();

      if (error) {
        console.error("Erro ao buscar políticas:", error);
        return null;
      }

      return data;
    },
    enabled: !!webCheckin?.establishment?.id,
  });

  // Buscar políticas do prédio (se a reserva tiver building_id)
  const { data: buildingData, isLoading: isLoadingBuilding } = useQuery({
    queryKey: ["building_policies", webCheckin?.reservation?.category_id],
    queryFn: async () => {
      if (!webCheckin?.reservation?.category_id) return null;

      // Buscar category para obter building_id
      const { data: category, error: categoryError } = await supabase
        .from("room_categories")
        .select("building_id")
        .eq("id", webCheckin.reservation.category_id)
        .maybeSingle();

      if (categoryError || !category?.building_id) {
        return null;
      }

      // Buscar políticas e nome do prédio
      const { data: building, error: buildingError } = await supabase
        .from("buildings")
        .select("policies, name")
        .eq("id", category.building_id)
        .maybeSingle();

      if (buildingError) {
        console.error("Erro ao buscar políticas do prédio:", buildingError);
        return null;
      }

      return building;
    },
    enabled: !!webCheckin?.reservation?.category_id,
  });

  const isLoading = isLoadingHotel || isLoadingBuilding;

  // Verificar se já aceitou as políticas anteriormente
  useEffect(() => {
    if (webCheckin?.policies_accepted) {
      setPoliciesAccepted(true);
      setAccepted(true);
    }
  }, [webCheckin]);

  // Priorizar políticas do prédio, senão usar do estabelecimento
  const policies = buildingData?.policies || hotelSettings?.policies || {};
  const isBuildingPolicies = !!buildingData?.policies;
  const buildingName = buildingData?.name;

  const handleNext = () => {
    if (!accepted) {
      return;
    }

    // Salvar aceite das políticas no web_checkin
    const saveAcceptance = async () => {
      try {
        await supabase
          .from("web_checkin")
          .update({ 
            policies_accepted: true,
            policies_accepted_at: new Date().toISOString(),
          })
          .eq("token", token);
      } catch (error) {
        console.error("Erro ao salvar aceite das políticas:", error);
      }
    };

    saveAcceptance();
    onNext({ policies_accepted: true });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
          <FileText className="h-8 w-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {isBuildingPolicies 
            ? `${t("webCheckin.policies.buildingTitle")}${buildingName ? `: ${buildingName}` : ''}` 
            : t("webCheckin.policies.title")}
        </h2>
        <p className="text-slate-600">
          {isBuildingPolicies 
            ? `${t("webCheckin.policies.buildingSubtitle")}${buildingName ? ` ${buildingName}` : ''}`
            : t("webCheckin.policies.subtitle")}
        </p>
        {isBuildingPolicies && (
          <p className="text-xs text-slate-500 mt-2">
            {t("webCheckin.policies.buildingHint")}
          </p>
        )}
      </div>

      <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2">
        {/* Texto Livre das Políticas */}
        {policies.policies_text && (
          <Card className="p-4 border-l-4 border-l-indigo-500">
            <div className="flex items-start gap-3 mb-3">
              <FileText className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
              <h3 className="font-semibold text-slate-900">
                {isBuildingPolicies ? t("webCheckin.policies.buildingTitle") : t("webCheckin.policies.title")}
              </h3>
            </div>
            <div className="text-sm text-slate-700 whitespace-pre-line">
              {policies.policies_text}
            </div>
          </Card>
        )}

        {/* Política de Cancelamento */}
        {policies.cancellation && (
          <Card className="p-4 border-l-4 border-l-blue-500">
            <div className="flex items-start gap-3 mb-3">
              <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <h3 className="font-semibold text-slate-900">{t("webCheckin.policies.cancellation")}</h3>
            </div>
            {policies.cancellation.free_cancellation_days > 0 && (
              <p className="text-sm text-slate-700 mb-2">
                <strong>{t("webCheckin.policies.freeCancellation")}</strong> {t("webCheckin.policies.daysBefore", { days: policies.cancellation.free_cancellation_days })}
              </p>
            )}
            {policies.cancellation.cancellation_policy && (
              <div className="text-sm text-slate-600 mb-2">
                <strong>{t("webCheckin.policies.policy")}</strong>
                <p className="mt-1 whitespace-pre-line">{policies.cancellation.cancellation_policy}</p>
              </div>
            )}
            {policies.cancellation.refund_policy && (
              <div className="text-sm text-slate-600">
                <strong>{t("webCheckin.policies.refund")}</strong>
                <p className="mt-1 whitespace-pre-line">{policies.cancellation.refund_policy}</p>
              </div>
            )}
          </Card>
        )}

        {/* Política de Check-in/Check-out */}
        {policies.checkin_checkout && (
          <Card className="p-4 border-l-4 border-l-green-500">
            <div className="flex items-start gap-3 mb-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <h3 className="font-semibold text-slate-900">{t("webCheckin.policies.checkinCheckout")}</h3>
            </div>
            {policies.checkin_checkout.early_checkin_available && (
              <p className="text-sm text-slate-700 mb-2">
                <strong>{t("webCheckin.policies.earlyCheckin")}</strong> {t("webCheckin.policies.available")}
                {policies.checkin_checkout.early_checkin_fee && ` - ${policies.checkin_checkout.early_checkin_fee}`}
              </p>
            )}
            {policies.checkin_checkout.late_checkout_available && (
              <p className="text-sm text-slate-700 mb-2">
                <strong>{t("webCheckin.policies.lateCheckout")}</strong> {t("webCheckin.policies.available")}
                {policies.checkin_checkout.late_checkout_fee && ` - ${policies.checkin_checkout.late_checkout_fee}`}
              </p>
            )}
            {policies.checkin_checkout.checkin_instructions && (
              <div className="text-sm text-slate-600 mb-2">
                <strong>{t("webCheckin.policies.checkinInstructions")}</strong>
                <p className="mt-1 whitespace-pre-line">{policies.checkin_checkout.checkin_instructions}</p>
              </div>
            )}
            {policies.checkin_checkout.checkout_instructions && (
              <div className="text-sm text-slate-600">
                <strong>{t("webCheckin.policies.checkoutInstructions")}</strong>
                <p className="mt-1 whitespace-pre-line">{policies.checkin_checkout.checkout_instructions}</p>
              </div>
            )}
          </Card>
        )}

        {/* Política de Animais */}
        {policies.pets && policies.pets.pets_allowed && (
          <Card className="p-4 border-l-4 border-l-purple-500">
            <div className="flex items-start gap-3 mb-3">
              <AlertCircle className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
              <h3 className="font-semibold text-slate-900">{t("webCheckin.policies.pets")}</h3>
            </div>
            <p className="text-sm text-slate-700 mb-2">
              <strong>{t("webCheckin.policies.petsAllowed")}</strong> {t("webCheckin.policies.yes")}
              {policies.pets.pet_fee && ` - ${policies.pets.pet_fee}`}
            </p>
            {policies.pets.pet_policy && (
              <div className="text-sm text-slate-600">
                <strong>{t("webCheckin.policies.policy")}</strong>
                <p className="mt-1 whitespace-pre-line">{policies.pets.pet_policy}</p>
              </div>
            )}
          </Card>
        )}

        {/* Política de Crianças */}
        {policies.children && (
          <Card className="p-4 border-l-4 border-l-orange-500">
            <div className="flex items-start gap-3 mb-3">
              <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <h3 className="font-semibold text-slate-900">{t("webCheckin.policies.children")}</h3>
            </div>
            {policies.children.children_policy && (
              <div className="text-sm text-slate-600 mb-2">
                <strong>{t("webCheckin.policies.policy")}</strong>
                <p className="mt-1 whitespace-pre-line">{policies.children.children_policy}</p>
              </div>
            )}
            {policies.children.extra_bed_available && (
              <p className="text-sm text-slate-700 mb-2">
                <strong>{t("webCheckin.policies.extraBed")}</strong> {t("webCheckin.policies.available")}
                {policies.children.extra_bed_fee && ` - ${policies.children.extra_bed_fee}`}
              </p>
            )}
            {policies.children.crib_available && (
              <p className="text-sm text-slate-700">
                <strong>{t("webCheckin.policies.crib")}</strong> {t("webCheckin.policies.available")}
                {policies.children.crib_fee && ` - ${policies.children.crib_fee}`}
              </p>
            )}
          </Card>
        )}

        {/* Políticas Gerais */}
        {policies.general && (
          <Card className="p-4 border-l-4 border-l-slate-500">
            <div className="flex items-start gap-3 mb-3">
              <AlertCircle className="h-5 w-5 text-slate-600 flex-shrink-0 mt-0.5" />
              <h3 className="font-semibold text-slate-900">{t("webCheckin.policies.general")}</h3>
            </div>
            {policies.general.smoking_policy && (
              <p className="text-sm text-slate-700 mb-2">
                <strong>{t("webCheckin.policies.smokingPolicy")}</strong> {policies.general.smoking_policy}
              </p>
            )}
            {policies.general.age_restriction && (
              <p className="text-sm text-slate-700 mb-2">
                <strong>{t("webCheckin.policies.ageRestriction")}</strong> {policies.general.age_restriction}
              </p>
            )}
            {policies.general.id_required && (
              <p className="text-sm text-slate-700 mb-2">
                <strong>{t("webCheckin.policies.idRequired")}</strong> {t("webCheckin.policies.idRequiredText")}
              </p>
            )}
            {policies.general.special_requests && (
              <div className="text-sm text-slate-600">
                <strong>{t("webCheckin.policies.specialRequests")}</strong>
                <p className="mt-1 whitespace-pre-line">{policies.general.special_requests}</p>
              </div>
            )}
          </Card>
        )}

        {/* Mensagem se não houver políticas configuradas */}
        {!policies.policies_text &&
         !policies.cancellation && 
         !policies.checkin_checkout && 
         !policies.pets && 
         !policies.children && 
         !policies.general && (
          <Card className="p-6 text-center">
            <p className="text-slate-600">
              {isBuildingPolicies 
                ? t("webCheckin.policies.noBuildingPolicies")
                : t("webCheckin.policies.noPolicies")}
            </p>
          </Card>
        )}
      </div>

      {/* Checkbox de Aceite */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-start gap-3">
          <Checkbox
            id="accept-policies"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked === true)}
            className="mt-1"
          />
          <Label
            htmlFor="accept-policies"
            className="text-sm font-medium text-slate-900 cursor-pointer flex-1"
          >
            {isBuildingPolicies ? t("webCheckin.policies.acceptBuilding") : t("webCheckin.policies.accept")}
          </Label>
        </div>
      </Card>

      {/* Botões de Navegação */}
      <div className="flex justify-between pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isFirstStep}
        >
          {t("webCheckin.policies.back")}
        </Button>
        <Button
          type="button"
          onClick={handleNext}
          disabled={!accepted}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {accepted ? (
            <>
              {t("webCheckin.policies.continue")}
            </>
          ) : (
            <>
              {t("webCheckin.policies.acceptToContinue")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

