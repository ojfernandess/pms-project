import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Wrench,
  LogOut,
  History,
  Plus,
  AlertCircle,
  Clock,
  CheckCircle2,
  User,
  FileText,
} from "lucide-react";
import { isAfter, startOfDay } from "date-fns";
import { ExtendReservationDialog } from "./ExtendReservationDialog";
import { MaintenanceTicketDialog } from "./MaintenanceTicketDialog";
import { WebCheckoutDialog } from "./WebCheckoutDialog";
import { GuestStayHistoryDialog } from "./GuestStayHistoryDialog";
import { GuestProfileDialog } from "./GuestProfileDialog";
import { FiscalDocumentRequest } from "./FiscalDocumentRequest";
import { useGuestAccount } from "@/hooks/useGuestAccount";
import { toast } from "sonner";

interface GuestMenuProps {
  webCheckin: any;
  token: string;
  onActionComplete?: () => void;
  isLastStep?: boolean;
}

export function GuestMenu({ webCheckin, token, onActionComplete, isLastStep }: GuestMenuProps) {
  const { getCurrentSession } = useGuestAccount();
  const session = getCurrentSession();
  const [showExtendDialog, setShowExtendDialog] = useState(false);
  const [showMaintenanceDialog, setShowMaintenanceDialog] = useState(false);
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [showFiscalDocumentDialog, setShowFiscalDocumentDialog] = useState(false);

  const reservation = webCheckin?.reservation;
  const isCheckedIn = reservation?.status === "checkedin" || reservation?.status === "confirmed";
  const isCompleted = webCheckin?.status === "completed" || webCheckin?.status === "in_progress";
  
  // Verificar se a reserva já teve check-out
  const hasCheckedOut = () => {
    const status = reservation?.status?.toLowerCase();
    const checkoutDate = reservation?.checkout_date;
    
    // Verificar por status
    if (status === "checkedout" || status === "checked_out") {
      return true;
    }
    
    // Verificar se a data de check-out já passou
    if (checkoutDate) {
      const checkout = startOfDay(new Date(checkoutDate));
      const today = startOfDay(new Date());
      return isAfter(today, checkout) || checkout.getTime() === today.getTime();
    }
    
    return false;
  };
  
  const isCheckedOut = hasCheckedOut();

  // Mostrar menu sempre que houver webCheckin e reservation
  // O menu deve aparecer na etapa de conclusão (isLastStep) ou quando o status for completed
  if (!webCheckin || !reservation) {
    return null;
  }

  // Mostrar menu sempre que estiver na última etapa OU quando o check-in estiver completo
  // Remover a verificação restritiva para garantir que o menu apareça

  return (
    <>
      <Card className="p-6 mt-6">
        <div className="text-center mb-6">
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            O que você gostaria de fazer?
          </h3>
          <p className="text-sm text-slate-600">
            Escolha uma das opções abaixo para gerenciar sua estadia
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Estender Reserva */}
          <Button
            variant="outline"
            className="h-auto p-6 flex flex-col items-center gap-3 hover:bg-blue-50 hover:border-blue-300 transition-colors"
            onClick={() => setShowExtendDialog(true)}
          >
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <Calendar className="h-6 w-6 text-blue-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-900">Estender Reserva</p>
              <p className="text-xs text-slate-600 mt-1">
                Adicione mais dias à sua estadia
              </p>
            </div>
          </Button>

          {/* Abrir Chamado de Manutenção */}
          {isCheckedIn && (
            <Button
              variant="outline"
              className="h-auto p-6 flex flex-col items-center gap-3 hover:bg-orange-50 hover:border-orange-300 transition-colors"
              onClick={() => setShowMaintenanceDialog(true)}
            >
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                <Wrench className="h-6 w-6 text-orange-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900">
                  Abrir Chamado de Manutenção
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  Reporte problemas ou solicite serviços
                </p>
              </div>
            </Button>
          )}

          {/* Realizar Check-out */}
          {isCheckedIn && (
            <Button
              variant="outline"
              className="h-auto p-6 flex flex-col items-center gap-3 hover:bg-green-50 hover:border-green-300 transition-colors"
              onClick={() => setShowCheckoutDialog(true)}
            >
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <LogOut className="h-6 w-6 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900">Realizar Check-out</p>
                <p className="text-xs text-slate-600 mt-1">
                  Finalize sua estadia remotamente
                </p>
              </div>
            </Button>
          )}

          {/* Ver Histórico de Estadas */}
          <Button
            variant="outline"
            className="h-auto p-6 flex flex-col items-center gap-3 hover:bg-purple-50 hover:border-purple-300 transition-colors"
            onClick={() => setShowHistoryDialog(true)}
          >
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <History className="h-6 w-6 text-purple-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-900">
                Ver Histórico de Estadas
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Visualize todas as suas estadias anteriores
              </p>
            </div>
          </Button>

          {/* Solicitar Documento Fiscal */}
          <Button
            variant="outline"
            className={`h-auto p-6 flex flex-col items-center gap-3 transition-colors ${
              isCheckedOut 
                ? "hover:bg-amber-50 hover:border-amber-300" 
                : "opacity-60 cursor-not-allowed"
            }`}
            onClick={() => {
              if (!isCheckedOut) {
                toast.info("A solicitação de documentos fiscais só pode ser feita após o check-out da reserva.");
                return;
              }
              setShowFiscalDocumentDialog(true);
            }}
            disabled={!isCheckedOut}
          >
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
              <FileText className="h-6 w-6 text-amber-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-900">Solicitar Documento Fiscal</p>
              <p className="text-xs text-slate-600 mt-1">
                {isCheckedOut ? "Recibo ou Nota Fiscal" : "Disponível após check-out"}
              </p>
            </div>
          </Button>

          {/* Editar Perfil */}
          {session.accountId && (
            <Button
              variant="outline"
              className="h-auto p-6 flex flex-col items-center gap-3 hover:bg-indigo-50 hover:border-indigo-300 transition-colors"
              onClick={() => setShowProfileDialog(true)}
            >
              <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                <User className="h-6 w-6 text-indigo-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900">Editar Perfil</p>
                <p className="text-xs text-slate-600 mt-1">
                  Atualize seus dados pessoais e senha
                </p>
              </div>
            </Button>
          )}
        </div>
      </Card>

      {/* Diálogos */}
      {showExtendDialog && (
        <ExtendReservationDialog
          open={showExtendDialog}
          onOpenChange={setShowExtendDialog}
          reservation={reservation}
          webCheckin={webCheckin}
          token={token}
          onSuccess={() => {
            setShowExtendDialog(false);
            onActionComplete?.();
          }}
        />
      )}

      {showMaintenanceDialog && (
        <MaintenanceTicketDialog
          open={showMaintenanceDialog}
          onOpenChange={setShowMaintenanceDialog}
          reservation={reservation}
          webCheckin={webCheckin}
          token={token}
          onSuccess={() => {
            setShowMaintenanceDialog(false);
            onActionComplete?.();
          }}
        />
      )}

      {showCheckoutDialog && (
        <WebCheckoutDialog
          open={showCheckoutDialog}
          onOpenChange={setShowCheckoutDialog}
          reservation={reservation}
          webCheckin={webCheckin}
          token={token}
          onSuccess={() => {
            setShowCheckoutDialog(false);
            onActionComplete?.();
          }}
        />
      )}

      {showHistoryDialog && (
        <GuestStayHistoryDialog
          open={showHistoryDialog}
          onOpenChange={setShowHistoryDialog}
          webCheckin={webCheckin}
          token={token}
        />
      )}

      {showProfileDialog && session.accountId && (
        <GuestProfileDialog
          open={showProfileDialog}
          onOpenChange={setShowProfileDialog}
          accountId={session.accountId}
        />
      )}

      {showFiscalDocumentDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Solicitar Documento Fiscal</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFiscalDocumentDialog(false)}
                >
                  ×
                </Button>
              </div>
              <FiscalDocumentRequest
                reservation={reservation}
                establishment={webCheckin?.establishment}
                onSuccess={() => {
                  setShowFiscalDocumentDialog(false);
                  onActionComplete?.();
                }}
              />
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

