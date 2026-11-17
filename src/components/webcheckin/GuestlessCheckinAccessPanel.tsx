import { useState, useEffect, useCallback, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, ArrowLeft, ArrowRight, ShieldCheck, Hash, Fingerprint, Mail, Globe2, LogIn } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { setGuestlessCheckinSession } from "@/lib/guestlessCheckinSession";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

type Props = {
  locator: string;
  onVerified: (locator: string) => void;
  onBack: () => void;
  onRequestLogin?: () => void;
};

type VerifyResult = {
  success?: boolean;
  code?: string;
  account_matched?: boolean;
  registered_guest?: boolean;
  guest_account_id?: string;
  message?: string;
};

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function parseVerifyPayload(data: unknown): VerifyResult | null {
  const raw = data as VerifyResult | VerifyResult[] | null;
  const payload = (Array.isArray(raw) ? raw[0] : raw) as VerifyResult | null;
  return payload && typeof payload === "object" ? payload : null;
}

export function GuestlessCheckinAccessPanel({ locator, onVerified, onBack, onRequestLogin }: Props) {
  const { t } = useTranslation();
  const [isBrazilian, setIsBrazilian] = useState(true);
  const [identifier, setIdentifier] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [needsBirthDate, setNeedsBirthDate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [precheckLoading, setPrecheckLoading] = useState(false);
  const [linkedAccountNotice, setLinkedAccountNotice] = useState(false);
  const [forceIdentityForm, setForceIdentityForm] = useState(false);

  const runPrecheck = useCallback(async () => {
    const loc = locator.trim();
    if (!loc) return;
    setPrecheckLoading(true);
    try {
      const { data, error } = await supabase.rpc("verify_web_checkin_guest_access", {
        p_locator: loc,
        p_is_brazilian: true,
        p_identifier: "",
      });
      if (error) return;
      const payload = parseVerifyPayload(data);
      if (payload?.code === "reservation_requires_login") {
        setLinkedAccountNotice(true);
      } else {
        setLinkedAccountNotice(false);
      }
    } finally {
      setPrecheckLoading(false);
    }
  }, [locator]);

  useEffect(() => {
    void runPrecheck();
    setForceIdentityForm(false);
    setNeedsBirthDate(false);
    setBirthDate("");
    setIdentifier("");
  }, [locator, runPrecheck]);

  const handleVerifyPayload = (payload: VerifyResult): boolean => {
    if (payload.code === "birth_date_required") {
      setNeedsBirthDate(true);
      toast.message(payload.message || t("webCheckin.guestless.birthPrompt"));
      return true;
    }

    if (
      payload.code === "birth_date_missing_on_account" ||
      payload.code === "birth_date_mismatch" ||
      payload.code === "reservation_linked_other_account"
    ) {
      toast.error(payload.message || t("webCheckin.guestless.verifyFailed"));
      return true;
    }

    if (payload.code === "account_exists_use_login" || payload.code === "reservation_requires_login") {
      setLinkedAccountNotice(payload.code === "reservation_requires_login");
      toast.error(payload.message || t("webCheckin.guestless.reservationRequiresLogin"));
      return true;
    }

    if (payload.success === true) {
      const loc = locator.trim();
      const contacts = isBrazilian
        ? { cpf: identifier.replace(/\D/g, "") }
        : { email: identifier.trim().toLowerCase() };
      setGuestlessCheckinSession(loc, contacts);
      if (payload.account_matched || payload.registered_guest) {
        toast.success(t("webCheckin.guestless.verifiedWithAccount"));
      } else {
        toast.success(t("webCheckin.guestless.verifiedNoRegisteredAccount"));
      }
      onVerified(loc);
      return true;
    }

    toast.error(payload.message || t("webCheckin.guestless.verifyFailed"));
    return true;
  };

  const callVerify = async (includeBirth: boolean) => {
    const loc = locator.trim();
    if (!loc) {
      toast.error(t("webCheckin.auth.errors.enterLocator"));
      return;
    }
    const id = identifier.trim();
    if (!id) {
      toast.error(isBrazilian ? t("webCheckin.guestless.cpfRequired") : t("webCheckin.guestless.emailRequired"));
      return;
    }
    if (needsBirthDate && includeBirth && !birthDate) {
      toast.error(t("webCheckin.guestless.birthRequired"));
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        p_locator: loc,
        p_is_brazilian: isBrazilian,
        p_identifier: isBrazilian ? id.replace(/\D/g, "") : id.toLowerCase(),
      };
      if (needsBirthDate && includeBirth && birthDate) {
        body.p_birth_date = birthDate;
      }

      const { data, error } = await supabase.rpc("verify_web_checkin_guest_access", body);
      if (error) {
        const msg = error.message || "";
        if (msg.includes("não disponível") || msg.includes("não encontrada")) {
          toast.error(t("webCheckin.guestless.serviceUnavailable"));
        } else {
          toast.error(msg || t("webCheckin.guestless.verifyFailed"));
        }
        return;
      }

      const payload = parseVerifyPayload(data);
      if (!payload) {
        toast.error(t("webCheckin.guestless.verifyFailed"));
        return;
      }
      handleVerifyPayload(payload);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center sm:text-left">
        <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 text-blue-800 px-3 py-1 text-xs font-medium">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t("webCheckin.guestless.badge")}
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          {t("webCheckin.guestless.title")}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed">{t("webCheckin.guestless.subtitle")}</p>
      </div>

      <Card className="border-blue-100 bg-gradient-to-br from-blue-50/80 to-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Hash className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{t("webCheckin.auth.locatorLabel")}</p>
            <p className="font-mono text-lg font-semibold text-blue-700">{locator.trim().toUpperCase()}</p>
          </div>
        </div>
      </Card>

      {precheckLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("webCheckin.guestless.checkingReservation")}
        </div>
      ) : null}

      {linkedAccountNotice && !forceIdentityForm ? (
        <Card className="border-indigo-200 bg-indigo-50/90 p-4 shadow-sm space-y-3">
          <p className="text-sm font-medium text-indigo-950">{t("webCheckin.guestless.reservationRequiresLoginTitle")}</p>
          <p className="text-xs text-indigo-900/90 leading-relaxed">{t("webCheckin.guestless.reservationRequiresLogin")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            {onRequestLogin ? (
              <Button type="button" className="h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700" onClick={onRequestLogin}>
                <LogIn className="h-4 w-4 mr-2" />
                {t("webCheckin.auth.login")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-indigo-300"
              onClick={() => setForceIdentityForm(true)}
            >
              {t("webCheckin.guestless.continueProveIdentity")}
            </Button>
          </div>
        </Card>
      ) : null}

      {(!linkedAccountNotice || forceIdentityForm) && (
        <>
      <div className="flex gap-2 text-xs text-slate-500">
        <StepPill active={!needsBirthDate} label={t("webCheckin.guestless.stepIdentity")} />
        <StepPill active={needsBirthDate} label={t("webCheckin.guestless.stepSecurity")} />
      </div>

      <div className="space-y-3">
        <Label className="text-slate-700">{t("webCheckin.guestless.nationality")}</Label>
        <div className="grid grid-cols-2 gap-3">
          <NationalityCard
            selected={isBrazilian}
            onClick={() => {
              setIsBrazilian(true);
              setIdentifier("");
              setNeedsBirthDate(false);
              setBirthDate("");
            }}
            icon={<Fingerprint className="h-5 w-5" />}
            title={t("webCheckin.guestless.brazilian")}
            subtitle={t("webCheckin.guestless.brazilianHint")}
          />
          <NationalityCard
            selected={!isBrazilian}
            onClick={() => {
              setIsBrazilian(false);
              setIdentifier("");
              setNeedsBirthDate(false);
              setBirthDate("");
            }}
            icon={<Globe2 className="h-5 w-5" />}
            title={t("webCheckin.guestless.foreigner")}
            subtitle={t("webCheckin.guestless.foreignerHint")}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="guestless-id" className="flex items-center gap-2 text-slate-700">
          {isBrazilian ? <Fingerprint className="h-4 w-4" /> : <Mail className="h-4 w-4" />}
          {isBrazilian ? t("webCheckin.guestless.cpfLabel") : t("webCheckin.guestless.emailLabel")}
        </Label>
        <Input
          id="guestless-id"
          type={isBrazilian ? "text" : "email"}
          inputMode={isBrazilian ? "numeric" : "email"}
          autoComplete={isBrazilian ? "off" : "email"}
          value={identifier}
          onChange={(e) =>
            setIdentifier(isBrazilian ? formatCpfInput(e.target.value) : e.target.value)
          }
          placeholder={isBrazilian ? t("webCheckin.guestless.cpfPlaceholder") : t("webCheckin.guestless.emailPlaceholder")}
          className="h-14 rounded-xl border-slate-200 text-base"
        />
        <p className="text-xs text-slate-500">{t("webCheckin.guestless.identifierHint")}</p>
      </div>

      {needsBirthDate ? (
        <Card className="border-amber-200 bg-amber-50/90 p-4 shadow-sm space-y-3">
          <div className="flex items-start gap-2 text-amber-950">
            <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-sm">{t("webCheckin.guestless.birthTitle")}</p>
              <p className="text-xs text-amber-900/80 mt-1">{t("webCheckin.guestless.birthPrompt")}</p>
            </div>
          </div>
          <Label htmlFor="guestless-birth">{t("webCheckin.guestless.birthLabel")}</Label>
          <Input
            id="guestless-birth"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="h-12 rounded-xl bg-white"
            max={new Date().toISOString().slice(0, 10)}
          />
        </Card>
      ) : null}

      <p className="text-xs text-slate-500 leading-relaxed">{t("webCheckin.guestless.privacyNote")}</p>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack} disabled={loading} className="h-12 rounded-xl">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("webCheckin.guestless.back")}
        </Button>
        <Button
          type="button"
          className="h-12 rounded-xl bg-blue-600 hover:bg-blue-700 shadow-md"
          disabled={loading}
          onClick={() => void callVerify(needsBirthDate)}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <ArrowRight className="h-4 w-4 mr-2" />
          )}
          {needsBirthDate ? t("webCheckin.guestless.confirmBirth") : t("webCheckin.guestless.continue")}
        </Button>
      </div>
        </>
      )}
    </div>
  );
}

function StepPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 border transition-colors",
        active ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-200 text-slate-500",
      )}
    >
      {label}
    </span>
  );
}

function NationalityCard({
  selected,
  onClick,
  icon,
  title,
  subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3 text-left transition-all hover:border-blue-300",
        selected ? "border-blue-600 bg-blue-50/60 ring-2 ring-blue-500/20" : "border-slate-200 bg-white",
      )}
    >
      <div className={cn("mb-2", selected ? "text-blue-700" : "text-slate-500")}>{icon}</div>
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
    </button>
  );
}