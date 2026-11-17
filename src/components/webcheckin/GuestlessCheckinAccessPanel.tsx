import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { setGuestlessCheckinSession } from "@/lib/guestlessCheckinSession";
import { useTranslation } from "react-i18next";

type Props = {
  locator: string;
  onVerified: (locator: string) => void;
  onBack: () => void;
};

type VerifyResult = {
  success?: boolean;
  code?: string;
  account_matched?: boolean;
  message?: string;
};

export function GuestlessCheckinAccessPanel({ locator, onVerified, onBack }: Props) {
  const { t } = useTranslation();
  const [isBrazilian, setIsBrazilian] = useState<"yes" | "no">("yes");
  const [identifier, setIdentifier] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [needsBirthDate, setNeedsBirthDate] = useState(false);
  const [loading, setLoading] = useState(false);

  const callVerify = async (includeBirth: boolean) => {
    const loc = locator.trim();
    if (!loc) {
      toast.error(t("webCheckin.auth.errors.enterLocator", "Informe o localizador da reserva."));
      return;
    }
    const id = identifier.trim();
    if (!id) {
      toast.error(
        isBrazilian === "yes"
          ? t("webCheckin.guestless.cpfRequired", "Informe o CPF.")
          : t("webCheckin.guestless.emailRequired", "Informe o e-mail."),
      );
      return;
    }
    if (needsBirthDate && includeBirth && !birthDate) {
      toast.error(t("webCheckin.guestless.birthRequired", "Informe sua data de nascimento."));
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("verify_web_checkin_guest_access", {
        p_locator: loc,
        p_is_brazilian: isBrazilian === "yes",
        p_identifier: isBrazilian === "yes" ? id.replace(/\D/g, "") : id.toLowerCase(),
        p_birth_date: needsBirthDate && includeBirth && birthDate ? birthDate : null,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const payload = (Array.isArray(data) ? data[0] : data) as VerifyResult | null;
      if (!payload) {
        toast.error(t("webCheckin.guestless.verifyFailed", "Não foi possível validar os dados."));
        return;
      }

      if (payload.code === "birth_date_required") {
        setNeedsBirthDate(true);
        toast.message(
          payload.message ||
            t(
              "webCheckin.guestless.birthPrompt",
              "Encontramos um cadastro com estes dados. Confirme sua data de nascimento.",
            ),
        );
        return;
      }

      if (payload.success) {
        setGuestlessCheckinSession(loc);
        toast.success(t("webCheckin.guestless.verified", "Identidade confirmada. Continue o check-in."));
        onVerified(loc);
        return;
      }

      toast.error(payload.message || t("webCheckin.guestless.verifyFailed", "Não foi possível validar os dados."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <motionHeader
        title={t("webCheckin.guestless.title", "Check-in sem cadastro")}
        subtitle={t(
          "webCheckin.guestless.subtitle",
          "Valide sua identidade com os dados da reserva. Se já existir uma conta, confirmaremos sua data de nascimento.",
        )}
      />

      <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
        <span className="font-medium">{t("webCheckin.auth.locatorLabel", "Localizador")}: </span>
        <span className="font-mono tracking-wide">{locator.trim().toUpperCase()}</span>
      </div>

      <div className="space-y-3">
        <Label>{t("webCheckin.guestless.nationality", "Você é brasileiro(a)?")}</Label>
        <RadioGroup
          value={isBrazilian}
          onValueChange={(v) => {
            setIsBrazilian(v as "yes" | "no");
            setIdentifier("");
            setNeedsBirthDate(false);
            setBirthDate("");
          }}
          className="flex gap-6"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="yes" id="br-yes" />
            <Label htmlFor="br-yes" className="cursor-pointer font-normal">
              {t("webCheckin.guestless.brazilian", "Sim")}
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="no" id="br-no" />
            <Label htmlFor="br-no" className="cursor-pointer font-normal">
              {t("webCheckin.guestless.foreigner", "Não (estrangeiro)")}
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="guestless-id">
          {isBrazilian === "yes"
            ? t("webCheckin.guestless.cpfLabel", "CPF")
            : t("webCheckin.guestless.emailLabel", "E-mail")}
        </Label>
        <Input
          id="guestless-id"
          type={isBrazilian === "yes" ? "text" : "email"}
          inputMode={isBrazilian === "yes" ? "numeric" : "email"}
          value={identifier}
          onChange={(e) => setIdentifier(isBrazilian === "yes" ? e.target.value : e.target.value)}
          placeholder={
            isBrazilian === "yes"
              ? t("webCheckin.guestless.cpfPlaceholder", "000.000.000-00")
              : t("webCheckin.guestless.emailPlaceholder", "seu@email.com")
          }
          className="h-12"
        />
      </div>

      {needsBirthDate ? (
        <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 p-4">
          <div className="flex items-center gap-2 text-amber-900 text-sm font-medium">
            <ShieldCheck className="h-4 w-4" />
            {t("webCheckin.guestless.birthTitle", "Confirme sua data de nascimento")}
          </div>
          <Label htmlFor="guestless-birth">{t("webCheckin.guestless.birthLabel", "Data de nascimento")}</Label>
          <Input
            id="guestless-birth"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="h-12"
            max={new Date().toISOString().slice(0, 10)}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={loading} className="h-12">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("webCheckin.guestless.back", "Voltar")}
        </Button>
        <Button
          type="button"
          className="h-12 bg-blue-600 hover:bg-blue-700"
          disabled={loading}
          onClick={() => void callVerify(needsBirthDate)}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          {needsBirthDate
            ? t("webCheckin.guestless.confirmBirth", "Confirmar e continuar")
            : t("webCheckin.guestless.continue", "Continuar sem cadastro")}
        </Button>
      </div>
    </div>
  );
}

function motionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="space-y-2">
      <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-600">{subtitle}</p>
    </div>
  );
}