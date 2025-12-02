import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useWebCheckin } from "@/hooks/useWebCheckin";
import { useTranslation } from "react-i18next";

interface GuestPreferencesStepProps {
  webCheckin: any;
  token: string;
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export function GuestPreferencesStep({
  webCheckin,
  token,
  data,
  onNext,
  onBack,
  isFirstStep,
}: GuestPreferencesStepProps) {
  const { t } = useTranslation();
  const { savePreferences } = useWebCheckin();
  const [preferences, setPreferences] = useState({
    early_checkin: false,
    late_checkout: false,
    smoking_room: false,
    floor_preference: "",
    special_requests: "",
    accessibility_needs: false,
    extra_bed: false,
    extra_pillows: false,
  });

  // Carregar preferências salvas quando o componente montar ou quando webCheckin mudar
  useEffect(() => {
    // Flag para evitar resetar se já temos dados no estado
    let hasLoadedData = false;
    
    // Tentar carregar de webCheckin.preferences primeiro
    if (webCheckin?.preferences && typeof webCheckin.preferences === 'object' && Object.keys(webCheckin.preferences).length > 0) {
      setPreferences((prev) => ({
        ...prev,
        ...webCheckin.preferences,
      }));
      hasLoadedData = true;
    }
    
    // Se não tiver dados salvos, usar dados do prop data (se vier de navegação)
    if (!hasLoadedData && data?.preferences && typeof data.preferences === 'object' && Object.keys(data.preferences).length > 0) {
      setPreferences((prev) => ({
        ...prev,
        ...data.preferences,
      }));
      hasLoadedData = true;
    }
    
    // Se não tiver nenhum dado salvo, manter o estado atual (não resetar)
  }, [webCheckin?.preferences, data?.preferences]);

  const handleSubmit = () => {
    savePreferences.mutate(
      { token, preferences },
      {
        onSuccess: () => {
          onNext({ preferences });
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {t("webCheckin.preferences.title")}
        </h2>
        <p className="text-slate-600">
          {t("webCheckin.preferences.subtitle")}
        </p>
      </div>

      <Card className="p-6">
        <div className="space-y-6">
          <div>
            <h3 className="font-semibold text-slate-900 mb-4">{t("webCheckin.preferences.schedules")}</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="early_checkin"
                  checked={preferences.early_checkin}
                  onCheckedChange={(checked) =>
                    setPreferences({ ...preferences, early_checkin: !!checked })
                  }
                />
                <Label htmlFor="early_checkin" className="cursor-pointer">
                  {t("webCheckin.preferences.earlyCheckin")}
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="late_checkout"
                  checked={preferences.late_checkout}
                  onCheckedChange={(checked) =>
                    setPreferences({ ...preferences, late_checkout: !!checked })
                  }
                />
                <Label htmlFor="late_checkout" className="cursor-pointer">
                  {t("webCheckin.preferences.lateCheckout")}
                </Label>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-4">{t("webCheckin.preferences.room")}</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="smoking_room"
                  checked={preferences.smoking_room}
                  onCheckedChange={(checked) =>
                    setPreferences({ ...preferences, smoking_room: !!checked })
                  }
                />
                <Label htmlFor="smoking_room" className="cursor-pointer">
                  {t("webCheckin.preferences.smokingRoom")}
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="extra_bed"
                  checked={preferences.extra_bed}
                  onCheckedChange={(checked) =>
                    setPreferences({ ...preferences, extra_bed: !!checked })
                  }
                />
                <Label htmlFor="extra_bed" className="cursor-pointer">
                  {t("webCheckin.preferences.extraBed")}
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="extra_pillows"
                  checked={preferences.extra_pillows}
                  onCheckedChange={(checked) =>
                    setPreferences({ ...preferences, extra_pillows: !!checked })
                  }
                />
                <Label htmlFor="extra_pillows" className="cursor-pointer">
                  {t("webCheckin.preferences.extraPillows")}
                </Label>
              </div>

              <div>
                <Label htmlFor="floor_preference">{t("webCheckin.preferences.floorPreference")}</Label>
                <input
                  id="floor_preference"
                  type="text"
                  value={preferences.floor_preference}
                  onChange={(e) =>
                    setPreferences({ ...preferences, floor_preference: e.target.value })
                  }
                  placeholder={t("webCheckin.preferences.floorPlaceholder")}
                  className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-4">{t("webCheckin.preferences.accessibility")}</h3>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="accessibility_needs"
                checked={preferences.accessibility_needs}
                onCheckedChange={(checked) =>
                  setPreferences({ ...preferences, accessibility_needs: !!checked })
                }
              />
              <Label htmlFor="accessibility_needs" className="cursor-pointer">
                {t("webCheckin.preferences.accessibilityNeeds")}
              </Label>
            </div>
          </div>

          <div>
            <Label htmlFor="special_requests">{t("webCheckin.preferences.specialRequests")}</Label>
            <Textarea
              id="special_requests"
              value={preferences.special_requests}
              onChange={(e) =>
                setPreferences({ ...preferences, special_requests: e.target.value })
              }
              placeholder={t("webCheckin.preferences.specialRequestsPlaceholder")}
              className="mt-1"
              rows={4}
            />
          </div>
        </div>
      </Card>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack} disabled={isFirstStep}>
          {t("webCheckin.preferences.back")}
        </Button>
        <Button onClick={handleSubmit} disabled={savePreferences.isPending}>
          {savePreferences.isPending ? t("webCheckin.preferences.saving") : t("webCheckin.preferences.continue")}
        </Button>
      </div>
    </div>
  );
}


