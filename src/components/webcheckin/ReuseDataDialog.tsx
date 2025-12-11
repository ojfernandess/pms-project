import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { History, User, FileText, Settings, CheckCircle2, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTranslation } from "react-i18next";

interface ReuseDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  previousData: {
    guests: any[];
    documents: any[];
    preferences: any;
    reservationCode?: string;
    checkinDate?: string;
    completedAt?: string;
  } | null;
  onReuse: (data: any) => void;
  onSkip: () => void;
}

export function ReuseDataDialog({
  open,
  onOpenChange,
  previousData,
  onReuse,
  onSkip,
}: ReuseDataDialogProps) {
  const { t } = useTranslation();
  const [isReusing, setIsReusing] = useState(false);

  if (!previousData) return null;

  const handleReuse = () => {
    setIsReusing(true);
    onReuse({
      guests: previousData.guests,
      documents: previousData.documents,
      preferences: previousData.preferences,
    });
    setIsReusing(false);
    onOpenChange(false);
  };

  const handleSkip = () => {
    onSkip();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <History className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <DialogTitle className="text-xl">
                {t("webCheckin.reuseData.title")}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {t("webCheckin.reuseData.description")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Informações do check-in anterior */}
          <Card className="p-4 bg-blue-50/50 border-blue-200">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900 mb-1">
                  {t("webCheckin.reuseData.lastCheckin")}
                </p>
                <div className="space-y-1 text-sm text-slate-600">
                  {previousData.reservationCode && (
                    <p>
                      <span className="font-medium">{t("webCheckin.reuseData.reservationCode")}:</span>{" "}
                      {previousData.reservationCode}
                    </p>
                  )}
                  {previousData.checkinDate && (
                    <p>
                      <span className="font-medium">{t("webCheckin.reuseData.checkinDate")}:</span>{" "}
                      {format(parseISO(previousData.checkinDate), "dd/MM/yyyy", { locale: ptBR })}
                    </p>
                  )}
                  {previousData.completedAt && (
                    <p>
                      <span className="font-medium">{t("webCheckin.reuseData.completedAt")}:</span>{" "}
                      {format(parseISO(previousData.completedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Dados disponíveis para reutilização */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">
              {t("webCheckin.reuseData.availableData")}:
            </p>

            {/* Hóspedes */}
            {previousData.guests && previousData.guests.length > 0 && (
              <Card className="p-3 border-slate-200">
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 mb-1">
                      {t("webCheckin.reuseData.guests")}
                    </p>
                    <div className="space-y-1">
                      {previousData.guests.map((guest, index) => (
                        <div key={index} className="text-xs text-slate-600">
                          <p>
                            {guest.name || t("webCheckin.reuseData.guest")} {index + 1}
                            {guest.email && ` • ${guest.email}`}
                            {guest.cpf && ` • CPF: ${guest.cpf}`}
                          </p>
                          {(guest.street || guest.city || guest.state) && (
                            <p className="text-xs text-slate-500 mt-0.5 italic">
                              📍 {guest.street && guest.number 
                                ? `${guest.street}, ${guest.number}` 
                                : guest.street || ""}
                              {guest.city && ` - ${guest.city}`}
                              {guest.state && `/${guest.state}`}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Documentos */}
            {previousData.documents && previousData.documents.length > 0 && (
              <Card className="p-3 border-slate-200">
                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 mb-1">
                      {t("webCheckin.reuseData.documents")}
                    </p>
                    <p className="text-xs text-slate-600">
                      {previousData.documents.length} {t("webCheckin.reuseData.documentCount")}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Preferências */}
            {previousData.preferences && Object.keys(previousData.preferences).length > 0 && (
              <Card className="p-3 border-slate-200">
                <div className="flex items-start gap-3">
                  <Settings className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-900 mb-1">
                      {t("webCheckin.reuseData.preferences")}
                    </p>
                    <p className="text-xs text-slate-600">
                      {t("webCheckin.reuseData.preferencesSaved")}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Aviso */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800">
              {t("webCheckin.reuseData.warning")}
            </p>
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleSkip}
              variant="outline"
              className="flex-1"
              disabled={isReusing}
            >
              <X className="w-4 h-4 mr-2" />
              {t("webCheckin.reuseData.fillManually")}
            </Button>
            <Button
              onClick={handleReuse}
              className="flex-1"
              disabled={isReusing}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {isReusing ? t("webCheckin.reuseData.loading") : t("webCheckin.reuseData.reuseData")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

