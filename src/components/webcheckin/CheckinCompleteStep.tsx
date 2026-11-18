import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CheckCircle2,
  Mail,
  Calendar,
  MapPin,
  LayoutDashboard,
  Loader2,
  DoorOpen,
  Lock,
  Copy,
  Check,
  Users,
  ChevronDown,
  Headphones,
  MessageCircle,
  Printer,
  Info,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";
import { GuestMenu } from "./GuestMenu";
import { useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { triggerEmail } from "@/lib/emailService";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { fetchCheckinGuestInfoForReservation } from "@/hooks/useCheckinGuestInfoServices";
import { buildCheckinTemplateContext } from "@/lib/checkinCompleteVariables";
import { CheckinGuestInfoDisplay } from "./CheckinGuestInfoDisplay";

interface CheckinCompleteStepProps {
  webCheckin: any;
  token: string;
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

type AddressSource = {
  address?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip_code?: string;
};

function buildAddressLine(source: AddressSource | null | undefined): string | null {
  if (!source) return null;
  if (source.address && typeof source.address === "string") return source.address;
  const parts: string[] = [];
  if (source.street) {
    let line = source.street;
    if (source.number) line += `, ${source.number}`;
    parts.push(line);
  }
  if (source.neighborhood) parts.push(source.neighborhood);
  return parts.length > 0 ? parts.join(", ") : null;
}

function buildCityLine(source: AddressSource | null | undefined): string | null {
  if (!source) return null;
  const bits: string[] = [];
  if (source.city) bits.push(source.city);
  if (source.state) bits.push(source.state);
  let line = bits.join(", ");
  if (source.zip_code) line += (line ? " — " : "") + source.zip_code;
  return line || null;
}

function buildMapsQuery(streetLine: string | null, source: AddressSource | null | undefined): string {
  return [streetLine, source?.city, source?.state].filter(Boolean).join(" ").trim();
}

function formatWhatsappUrl(
  establishment: Record<string, string | null | undefined> | null | undefined,
  message: string,
): { url: string | null; display: string | null } {
  if (!establishment) return { url: null, display: null };
  const whatsappDdi = establishment.whatsapp_ddi || "";
  const whatsappNumber = establishment.whatsapp_number || "";
  if (whatsappDdi && whatsappNumber) {
    const clean = `${whatsappDdi}${whatsappNumber}`.replace(/\D/g, "");
    return {
      url: `https://wa.me/${clean}?text=${encodeURIComponent(message)}`,
      display: `${whatsappDdi} ${whatsappNumber}`.trim(),
    };
  }
  if (whatsappNumber) {
    const clean = whatsappNumber.replace(/\D/g, "");
    return {
      url: `https://wa.me/${clean}?text=${encodeURIComponent(message)}`,
      display: whatsappNumber,
    };
  }
  return { url: null, display: null };
}

function getAccommodationTitle(reservation: any): string | null {
  const roomNum = reservation?.rooms?.room_number || reservation?.rooms?.name;
  const category = reservation?.room_categories?.name;
  if (category && roomNum) return `${category} ${roomNum}`;
  return roomNum || category || null;
}

export function CheckinCompleteStep({ webCheckin, token }: CheckinCompleteStepProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { settings } = useSiteSettings();
  const reservation = webCheckin.reservation;
  const establishment = webCheckin?.establishment;
  const building = reservation?.building;
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);

  const establishmentId =
    webCheckin?.establishment_id || establishment?.id || reservation?.establishment_id;
  const categoryId = reservation?.category_id;

  const getDateLocale = () => {
    const lang = i18n.language;
    if (lang.startsWith("es")) return es;
    if (lang.startsWith("en")) return enUS;
    return ptBR;
  };

  const guestName =
    reservation?.guest?.full_name ||
    webCheckin?.guests?.find((g: { is_main_guest?: boolean }) => g.is_main_guest)?.full_name ||
    webCheckin?.guests?.[0]?.full_name ||
    null;
  const guestFirstName = guestName?.split(" ")?.[0] || null;

  const guestCountLabel = useMemo(() => {
    const guests = webCheckin?.guests;
    if (Array.isArray(guests) && guests.length > 0) {
      return t("webCheckin.complete.guestCount", { count: guests.length });
    }
    const adults = reservation?.room_categories?.capacity_adults;
    const children = reservation?.room_categories?.capacity_children;
    if (adults != null) {
      if (children) {
        return t("webCheckin.complete.guestCountAdultsChildren", { adults, children });
      }
      return t("webCheckin.complete.guestCountAdults", { count: adults });
    }
    return null;
  }, [webCheckin?.guests, reservation?.room_categories, t]);

  const { data: policyBundle } = useQuery({
    queryKey: ["checkin_complete_policies", establishmentId, categoryId],
    queryFn: async () => {
      let buildingPolicies: { policies?: Record<string, unknown>; name?: string } | null = null;
      if (categoryId) {
        const { data: category } = await supabase
          .from("room_categories")
          .select("building_id")
          .eq("id", categoryId)
          .maybeSingle();
        if (category?.building_id) {
          const { data: bld } = await supabase
            .from("buildings")
            .select("policies, name")
            .eq("id", category.building_id)
            .maybeSingle();
          buildingPolicies = bld;
        }
      }
      let hotelPolicies: { policies?: Record<string, unknown> } | null = null;
      if (establishmentId) {
        const { data: hs } = await supabase
          .from("hotel_settings")
          .select("policies")
          .eq("establishment_id", establishmentId)
          .maybeSingle();
        hotelPolicies = hs;
      }
      const policies =
        (buildingPolicies?.policies as Record<string, any>) ||
        (hotelPolicies?.policies as Record<string, any>) ||
        {};
      return { policies, buildingName: buildingPolicies?.name };
    },
    enabled: !!(establishmentId || categoryId),
    staleTime: 60_000,
  });

  const buildingId = reservation?.building?.id as string | undefined;

  const { data: checkinGuestInfo = [] } = useQuery({
    queryKey: ["checkin_complete_guest_info", establishmentId, buildingId],
    queryFn: () => fetchCheckinGuestInfoForReservation(establishmentId, buildingId),
    enabled: !!(establishmentId || buildingId),
    staleTime: 60_000,
  });

  const checkinInstructions = policyBundle?.policies?.checkin_checkout?.checkin_instructions as
    | string
    | undefined;
  const checkoutInstructions = policyBundle?.policies?.checkin_checkout?.checkout_instructions as
    | string
    | undefined;
  const policiesText = policyBundle?.policies?.policies_text as string | undefined;
  const hasAccessSection = !!(
    checkinInstructions ||
    checkoutInstructions ||
    policiesText
  );

  const hasBuildingAddress = building && (building.street || building.city || building.state);
  const addressSource = hasBuildingAddress ? building : establishment;
  const streetLine = buildAddressLine(addressSource);
  const cityLine = buildCityLine(addressSource);
  const hasAddress = !!(streetLine || cityLine);

  const accommodationTitle = getAccommodationTitle(reservation);
  const roomFloor = reservation?.rooms?.floor;
  const locationMeta: string[] = [];
  if (building?.name) locationMeta.push(t("webCheckin.complete.blockLabel", { name: building.name }));
  if (roomFloor != null && roomFloor !== "") {
    const floorLabel =
      roomFloor === 0
        ? t("webCheckin.complete.groundFloor")
        : t("webCheckin.complete.floorLabel", { floor: roomFloor });
    locationMeta.push(floorLabel);
  }

  const usesFixedPassword = reservation?.rooms?.authentication_type === "fixed_password";
  const roomPassword = reservation?.rooms?.fixed_password;
  const passwordSpaced = roomPassword ? roomPassword.split("").join(" ") : "";

  const supportMessage = t("webCheckin.complete.whatsappDefaultMessage", {
    code: reservation?.reservation_code || webCheckin.locator || "",
  });
  const { url: whatsappUrl, display: whatsappDisplay } = formatWhatsappUrl(establishment, supportMessage);
  const phone = establishment?.phone || null;
  const hasSupport = !!(whatsappUrl || phone);

  const handleCopyPassword = async () => {
    if (!roomPassword) return;
    try {
      await navigator.clipboard.writeText(roomPassword);
      setPasswordCopied(true);
      toast.success(t("webCheckin.complete.passwordCopied"));
      window.setTimeout(() => setPasswordCopied(false), 2500);
    } catch {
      toast.error(t("webCheckin.complete.passwordCopyError"));
    }
  };

  const templateContext = useMemo(
    () =>
      buildCheckinTemplateContext({
        guestName,
        roomPassword: usesFixedPassword ? roomPassword : null,
        categoryName: reservation?.room_categories?.name,
        locator: webCheckin?.locator,
        accommodationTitle,
        checkinDate: reservation?.checkin_date,
        checkoutDate: reservation?.checkout_date,
        reservationCode: reservation?.reservation_code,
        formatDate: (iso) => format(parseISO(iso), "dd/MM/yyyy", { locale: getDateLocale() }),
      }),
    [
      guestName,
      usesFixedPassword,
      roomPassword,
      reservation,
      webCheckin?.locator,
      accommodationTitle,
      i18n.language,
    ],
  );

  const handleSendEmail = async () => {
    if (!reservation?.id) {
      toast.error(t("webCheckin.complete.errors.reservationNotFound"));
      return;
    }
    const recipientEmail = reservation.guest?.email || reservation.financial_responsible?.email;
    if (!recipientEmail) {
      toast.error(t("webCheckin.complete.errors.emailNotFound"));
      return;
    }
    setIsSendingEmail(true);
    try {
      const queueId = await triggerEmail("checkin.confirmed", reservation);
      if (queueId) {
        toast.success(t("webCheckin.complete.emailSent"));
      } else {
        toast.warning(t("webCheckin.complete.emailQueued"));
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("webCheckin.complete.emailError");
      toast.error(message);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const checkinFormatted = reservation?.checkin_date
    ? format(parseISO(reservation.checkin_date), "dd/MM/yyyy", { locale: getDateLocale() })
    : t("webCheckin.complete.notInformed");
  const checkoutFormatted = reservation?.checkout_date
    ? format(parseISO(reservation.checkout_date), "dd/MM/yyyy", { locale: getDateLocale() })
    : t("webCheckin.complete.notInformed");

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-8">
      {/* Boas-vindas */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 px-6 pb-8 pt-6 text-white shadow-sm">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-teal-400/10" />
        <div className="relative space-y-4">
          <div className="flex items-center justify-between gap-3">
            {settings?.logo_url ? (
              <img
                src={settings.logo_url}
                alt={settings.site_title || establishment?.name || "Logo"}
                className="h-10 max-w-[140px] object-contain brightness-0 invert"
              />
            ) : establishment?.name ? (
              <p className="text-sm font-semibold tracking-wide text-emerald-100/90">{establishment.name}</p>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-100 ring-1 ring-emerald-400/30">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t("webCheckin.complete.badge")}
            </span>
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("webCheckin.complete.heroTitle")}</h2>
            <p className="mt-2 text-sm leading-relaxed text-emerald-100/90 sm:text-base">
              {guestFirstName
                ? t("webCheckin.complete.heroWelcomeNamed", { name: guestFirstName })
                : t("webCheckin.complete.heroWelcome")}
            </p>
          </div>
        </div>
      </section>

      {/* Acomodação + Senha */}
      <div className={cn("grid grid-cols-1 gap-4", usesFixedPassword && "sm:grid-cols-2")}>
        <Card className="rounded-2xl border-slate-200/80 p-5 shadow-sm">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
            <DoorOpen className="h-5 w-5 text-emerald-700" />
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("webCheckin.complete.yourAccommodation")}
          </p>
          {accommodationTitle ? (
            <>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{accommodationTitle}</p>
              {establishment?.name && (
                <p className="mt-1 text-sm text-slate-600">{establishment.name}</p>
              )}
              {locationMeta.length > 0 && (
                <p className="mt-3 text-sm text-slate-500">{locationMeta.join(" • ")}</p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">{t("webCheckin.complete.willBeInformed")}</p>
          )}
        </Card>

        {usesFixedPassword && (
          <Card className="rounded-2xl border-emerald-800/20 bg-gradient-to-br from-emerald-900 to-teal-900 p-5 text-white shadow-md">
            <div className="mb-3 flex items-center gap-2 text-emerald-100/90">
              <Lock className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">
                {t("webCheckin.complete.accessPassword")}
              </span>
            </div>
            {roomPassword ? (
              <>
                <p
                  className="text-center font-mono text-2xl font-semibold tracking-[0.35em] sm:text-3xl"
                  aria-label={t("webCheckin.complete.accessPassword")}
                >
                  {passwordSpaced}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="flex-1 bg-white/15 text-white hover:bg-white/25"
                    onClick={handleCopyPassword}
                  >
                    {passwordCopied ? (
                      <Check className="mr-2 h-4 w-4" />
                    ) : (
                      <Copy className="mr-2 h-4 w-4" />
                    )}
                    {passwordCopied ? t("webCheckin.complete.copied") : t("webCheckin.complete.copy")}
                  </Button>
                </div>
                <p className="mt-3 text-center text-xs text-emerald-100/80">
                  {t("webCheckin.complete.roomPasswordHint")}
                </p>
              </>
            ) : (
              <p className="text-sm text-emerald-100/90">{t("webCheckin.complete.passwordUnavailable")}</p>
            )}
          </Card>
        )}
      </div>

      {/* Hospedagem */}
      <Card className="rounded-2xl border-slate-200/80 p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900">{t("webCheckin.complete.stayOverview")}</h3>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StayCell label={t("webCheckin.verify.checkin")} value={checkinFormatted} sub={reservation?.checkin_time?.substring(0, 5)} />
          <StayCell label={t("webCheckin.verify.checkout")} value={checkoutFormatted} sub={reservation?.checkout_time?.substring(0, 5)} />
          {guestCountLabel && (
            <div className="flex gap-3">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div>
                <p className="text-xs text-slate-500">{t("webCheckin.complete.guestsLabel")}</p>
                <p className="text-sm font-medium text-slate-900">{guestCountLabel}</p>
              </div>
            </div>
          )}
        </div>
        {guestName && (
          <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
            <span className="text-slate-500">{t("webCheckin.complete.guestLabel")}: </span>
            <span className="font-medium text-slate-900">{guestName}</span>
          </p>
        )}
        {hasAddress && (
          <div className="mt-4 flex gap-3 border-t border-slate-100 pt-4">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1 text-sm text-slate-600">
              {streetLine && <p>{streetLine}</p>}
              {cityLine && <p>{cityLine}</p>}
              {streetLine && (
                <Button
                  variant="link"
                  className="mt-1 h-auto p-0 text-emerald-700"
                  onClick={() => {
                    const q = buildMapsQuery(streetLine, addressSource);
                    window.open(
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
                      "_blank",
                    );
                  }}
                >
                  {t("webCheckin.complete.viewOnMap")}
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>

      <CheckinGuestInfoDisplay items={checkinGuestInfo} templateContext={templateContext} />

      {/* Orientações (políticas do hotel/prédio) */}
      {hasAccessSection && (
        <Collapsible open={accessOpen} onOpenChange={setAccessOpen}>
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-sm">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 p-5 text-left hover:bg-slate-50/80">
              <div className="flex items-center gap-3">
                <Info className="h-5 w-5 text-slate-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{t("webCheckin.complete.accessGuide")}</p>
                  <p className="text-xs text-slate-500">{t("webCheckin.complete.accessGuideHint")}</p>
                </div>
              </div>
              <ChevronDown className={cn("h-5 w-5 text-slate-400 transition-transform", accessOpen && "rotate-180")} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-4 border-t border-slate-100 px-5 pb-5 pt-4 text-sm text-slate-700">
                {checkinInstructions && (
                  <AccessNote title={t("webCheckin.complete.arrivalInstructions")} body={checkinInstructions} />
                )}
                {checkoutInstructions && (
                  <AccessNote title={t("webCheckin.complete.checkoutInstructions")} body={checkoutInstructions} />
                )}
                {policiesText && !checkinInstructions && (
                  <AccessNote title={t("webCheckin.complete.generalNotes")} body={policiesText} />
                )}
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Suporte */}
      {hasSupport && (
        <Card className="rounded-2xl border-emerald-900/10 bg-emerald-950 p-5 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <Headphones className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
              <div>
                <p className="font-semibold">{t("webCheckin.complete.supportTitle")}</p>
                <p className="mt-1 text-sm text-emerald-100/85">{t("webCheckin.complete.supportText")}</p>
                {phone && !whatsappUrl && (
                  <p className="mt-2 text-sm text-emerald-100">
                    {t("webCheckin.complete.phone")}: {phone}
                  </p>
                )}
              </div>
            </div>
            {whatsappUrl && (
              <Button asChild className="shrink-0 bg-white text-emerald-950 hover:bg-emerald-50">
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  {t("webCheckin.complete.whatsappCta")}
                </a>
              </Button>
            )}
          </div>
          {whatsappDisplay && whatsappUrl && (
            <p className="mt-3 text-center text-xs text-emerald-200/70 sm:text-left">{whatsappDisplay}</p>
          )}
        </Card>
      )}

      {/* Localizador + dica */}
      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 text-center text-sm text-slate-600">
        <span className="text-slate-500">{t("webCheckin.complete.locator")}: </span>
        <span className="font-mono font-semibold text-slate-900">{webCheckin.locator}</span>
        {reservation?.identification_number && (
          <span className="mt-1 block text-xs text-slate-500">
            {t("webCheckin.complete.identificationNumber")}: #{reservation.identification_number}
          </span>
        )}
        <p className="mt-2 text-xs text-slate-500">
          {t("webCheckin.complete.tipText", { locator: webCheckin.locator })}
        </p>
      </div>

      <p className="text-center text-xs text-slate-400">{t("webCheckin.complete.footerWish")}</p>

      {/* Ações */}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button variant="outline" className="rounded-xl" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          {t("webCheckin.complete.printConfirmation")}
        </Button>
        <Button className="rounded-xl" onClick={handleSendEmail} disabled={isSendingEmail}>
          {isSendingEmail ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {t("webCheckin.complete.sending")}
            </>
          ) : (
            <>
              <Mail className="mr-2 h-4 w-4" />
              {t("webCheckin.complete.sendEmail")}
            </>
          )}
        </Button>
      </div>

      <div className="border-t border-slate-200 pt-4 text-center">
        <Button
          onClick={() => navigate("/guest-dashboard")}
          className="w-full rounded-xl bg-emerald-700 hover:bg-emerald-800 sm:w-auto"
          size="lg"
        >
          <LayoutDashboard className="mr-2 h-5 w-5" />
          {t("webCheckin.complete.goToDashboard")}
        </Button>
        <p className="mt-2 text-xs text-slate-500">{t("webCheckin.complete.dashboardHint")}</p>
      </div>

      <div className="print:hidden">
        <GuestMenu webCheckin={webCheckin} token={token} isLastStep={true} />
      </div>
    </div>
  );
}

function StayCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function AccessNote({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="font-medium text-slate-900">{title}</p>
      <p className="mt-1 whitespace-pre-line text-slate-600">{body}</p>
    </div>
  );
}