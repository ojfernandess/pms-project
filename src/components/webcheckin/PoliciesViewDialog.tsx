import { Card } from "@/components/ui/card";
import { Loader2, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PoliciesViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  establishmentId?: string;
  categoryId?: string;
}

export function PoliciesViewDialog({
  open,
  onOpenChange,
  establishmentId,
  categoryId,
}: PoliciesViewDialogProps) {
  // Buscar políticas do estabelecimento
  const { data: hotelSettings, isLoading: isLoadingHotel } = useQuery({
    queryKey: ["hotel_settings", establishmentId],
    queryFn: async () => {
      if (!establishmentId) return null;

      const { data, error } = await supabase
        .from("hotel_settings")
        .select("policies")
        .eq("establishment_id", establishmentId)
        .maybeSingle();

      if (error) {
        console.error("Erro ao buscar políticas:", error);
        return null;
      }

      return data;
    },
    enabled: !!establishmentId && open,
  });

  // Buscar políticas do prédio (se a reserva tiver category_id)
  const { data: buildingData, isLoading: isLoadingBuilding } = useQuery({
    queryKey: ["building_policies", categoryId],
    queryFn: async () => {
      if (!categoryId) return null;

      // Buscar category para obter building_id
      const { data: category, error: categoryError } = await supabase
        .from("room_categories")
        .select("building_id")
        .eq("id", categoryId)
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
    enabled: !!categoryId && open,
  });

  const isLoading = isLoadingHotel || isLoadingBuilding;

  // Priorizar políticas do prédio, senão usar do estabelecimento
  const policies = buildingData?.policies || hotelSettings?.policies || {};
  const isBuildingPolicies = !!buildingData?.policies;
  const buildingName = buildingData?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-slate-900">
            {isBuildingPolicies ? `Políticas do Prédio${buildingName ? `: ${buildingName}` : ''}` : "Políticas do Estabelecimento"}
          </DialogTitle>
          <DialogDescription>
            {isBuildingPolicies 
              ? `Políticas específicas do prédio${buildingName ? ` ${buildingName}` : ''} onde você ficará hospedado`
              : "Políticas e regras do estabelecimento"}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="space-y-6 overflow-y-auto pr-2 flex-1">
            {/* Texto Livre das Políticas */}
            {policies.policies_text && (
              <Card className="p-4 border-l-4 border-l-indigo-500">
                <div className="flex items-start gap-3 mb-3">
                  <FileText className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                  <h3 className="font-semibold text-slate-900">
                    {isBuildingPolicies ? "Políticas do Prédio" : "Políticas do Estabelecimento"}
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
                  <h3 className="font-semibold text-slate-900">Política de Cancelamento</h3>
                </div>
                {policies.cancellation.free_cancellation_days > 0 && (
                  <p className="text-sm text-slate-700 mb-2">
                    <strong>Cancelamento Gratuito:</strong> Até {policies.cancellation.free_cancellation_days} dia(s) antes do check-in.
                  </p>
                )}
                {policies.cancellation.cancellation_policy && (
                  <div className="text-sm text-slate-600 mb-2">
                    <strong>Política:</strong>
                    <p className="mt-1 whitespace-pre-line">{policies.cancellation.cancellation_policy}</p>
                  </div>
                )}
                {policies.cancellation.refund_policy && (
                  <div className="text-sm text-slate-600">
                    <strong>Reembolso:</strong>
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
                  <h3 className="font-semibold text-slate-900">Check-in e Check-out</h3>
                </div>
                {policies.checkin_checkout.early_checkin_available && (
                  <p className="text-sm text-slate-700 mb-2">
                    <strong>Check-in Antecipado:</strong> Disponível
                    {policies.checkin_checkout.early_checkin_fee && ` - ${policies.checkin_checkout.early_checkin_fee}`}
                  </p>
                )}
                {policies.checkin_checkout.late_checkout_available && (
                  <p className="text-sm text-slate-700 mb-2">
                    <strong>Check-out Tardio:</strong> Disponível
                    {policies.checkin_checkout.late_checkout_fee && ` - ${policies.checkin_checkout.late_checkout_fee}`}
                  </p>
                )}
                {policies.checkin_checkout.checkin_instructions && (
                  <div className="text-sm text-slate-600 mb-2">
                    <strong>Instruções de Check-in:</strong>
                    <p className="mt-1 whitespace-pre-line">{policies.checkin_checkout.checkin_instructions}</p>
                  </div>
                )}
                {policies.checkin_checkout.checkout_instructions && (
                  <div className="text-sm text-slate-600">
                    <strong>Instruções de Check-out:</strong>
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
                  <h3 className="font-semibold text-slate-900">Política de Animais</h3>
                </div>
                <p className="text-sm text-slate-700 mb-2">
                  <strong>Animais Permitidos:</strong> Sim
                  {policies.pets.pet_fee && ` - ${policies.pets.pet_fee}`}
                </p>
                {policies.pets.pet_policy && (
                  <div className="text-sm text-slate-600">
                    <strong>Política:</strong>
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
                  <h3 className="font-semibold text-slate-900">Política de Crianças</h3>
                </div>
                {policies.children.children_policy && (
                  <div className="text-sm text-slate-600 mb-2">
                    <strong>Política:</strong>
                    <p className="mt-1 whitespace-pre-line">{policies.children.children_policy}</p>
                  </div>
                )}
                {policies.children.extra_bed_available && (
                  <p className="text-sm text-slate-700 mb-2">
                    <strong>Cama Extra:</strong> Disponível
                    {policies.children.extra_bed_fee && ` - ${policies.children.extra_bed_fee}`}
                  </p>
                )}
                {policies.children.crib_available && (
                  <p className="text-sm text-slate-700">
                    <strong>Berço:</strong> Disponível
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
                  <h3 className="font-semibold text-slate-900">Políticas Gerais</h3>
                </div>
                {policies.general.smoking_policy && (
                  <p className="text-sm text-slate-700 mb-2">
                    <strong>Política de Fumantes:</strong> {policies.general.smoking_policy}
                  </p>
                )}
                {policies.general.age_restriction && (
                  <p className="text-sm text-slate-700 mb-2">
                    <strong>Restrição de Idade:</strong> {policies.general.age_restriction}
                  </p>
                )}
                {policies.general.id_required && (
                  <p className="text-sm text-slate-700 mb-2">
                    <strong>Documento de Identidade:</strong> Obrigatório no check-in
                  </p>
                )}
                {policies.general.special_requests && (
                  <div className="text-sm text-slate-600">
                    <strong>Solicitações Especiais:</strong>
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
                    ? "Nenhuma política específica configurada para este prédio."
                    : "Nenhuma política específica configurada para este estabelecimento."}
                </p>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}




