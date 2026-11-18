import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wifi, Car, MapPinned, FileText, Copy } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { CheckinGuestInfoServiceRow } from "@/hooks/useCheckinGuestInfoServices";
import {
  substituteCheckinTemplateVars,
  type CheckinArrivalConfig,
  type CheckinCustomConfig,
  type CheckinParkingConfig,
  type CheckinTemplateContext,
  type CheckinWifiConfig,
} from "@/lib/checkinCompleteVariables";

type Props = {
  items: CheckinGuestInfoServiceRow[];
  templateContext: CheckinTemplateContext;
};

async function copyText(text: string, successMessage: string, errorMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error(errorMessage);
  }
}

export function CheckinGuestInfoDisplay({ items, templateContext }: Props) {
  const { t } = useTranslation();
  if (!items.length) return null;

  const sub = (text?: string | null) => substituteCheckinTemplateVars(text, templateContext).trim();

  return (
    <div className="space-y-4">
      {items.map((row) => {
        const cfg = row.checkin_guest_config || {};
        if (row.checkin_guest_info_type === "wifi") {
          const w = cfg as CheckinWifiConfig;
          const network = sub(w.network);
          const password = sub(w.password);
          const notes = sub(w.notes);
          if (!network && !password && !notes) return null;
          return (
            <Card key={row.id} className="rounded-2xl border-slate-200/80 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50">
                  <Wifi className="h-5 w-5 text-sky-700" />
                </div>
                <div className="min-w-0 flex-1 space-y-2 text-sm">
                  <p className="font-semibold text-slate-900">{sub(row.name) || row.name}</p>
                  {network && (
                    <p className="text-slate-700">
                      <span className="text-slate-500">{t("webCheckin.complete.wifiNetwork")}: </span>
                      <span className="font-medium">{network}</span>
                    </p>
                  )}
                  {password && (
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-slate-700">
                        <span className="text-slate-500">{t("webCheckin.complete.wifiPassword")}: </span>
                        <span className="font-mono font-medium">{password}</span>
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() =>
                          copyText(
                            password,
                            t("webCheckin.complete.wifiCopied"),
                            t("webCheckin.complete.passwordCopyError"),
                          )
                        }
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        {t("webCheckin.complete.copy")}
                      </Button>
                    </div>
                  )}
                  {notes && <p className="whitespace-pre-line text-slate-600">{notes}</p>}
                </div>
              </div>
            </Card>
          );
        }

        if (row.checkin_guest_info_type === "arrival") {
          const a = cfg as CheckinArrivalConfig;
          const title = sub(a.title) || sub(row.name) || row.name;
          const body = sub(a.body);
          if (!body && !title) return null;
          return (
            <Card key={row.id} className="rounded-2xl border-slate-200/80 p-5 shadow-sm">
              <div className="flex gap-3">
                <MapPinned className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-semibold text-slate-900">{title}</p>
                  {body && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{body}</p>}
                </div>
              </div>
            </Card>
          );
        }

        if (row.checkin_guest_info_type === "parking") {
          const p = cfg as CheckinParkingConfig;
          const fee = sub(p.fee_amount);
          const instructions = sub(p.instructions);
          if (!fee && !instructions) return null;
          return (
            <Card key={row.id} className="rounded-2xl border-slate-200/80 p-5 shadow-sm">
              <div className="flex gap-3">
                <Car className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" />
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-slate-900">{sub(row.name) || row.name}</p>
                  {fee && (
                    <p>
                      <span className="text-slate-500">{t("webCheckin.complete.parkingFee")}: </span>
                      <span className="font-medium text-slate-800">{fee}</span>
                    </p>
                  )}
                  {instructions && <p className="whitespace-pre-line text-slate-600">{instructions}</p>}
                </div>
              </div>
            </Card>
          );
        }

        const c = cfg as CheckinCustomConfig;
        const title = sub(c.title) || sub(row.name) || row.name;
        const body = sub(c.body);
        if (!title && !body) return null;
        return (
          <Card key={row.id} className="rounded-2xl border-slate-200/80 p-5 shadow-sm">
            <div className="flex gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <div>
                <p className="font-semibold text-slate-900">{title}</p>
                {body && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{body}</p>}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}