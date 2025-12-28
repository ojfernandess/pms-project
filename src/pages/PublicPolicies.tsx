import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Loader2, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function PublicPolicies() {
  const { token, slug } = useParams<{ token: string; slug?: string }>();
  const [policiesType, setPoliciesType] = useState<'establishment' | 'building' | null>(null);
  const [entityId, setEntityId] = useState<string | null>(null);

  // Decodificar o token para obter o tipo e ID
  // Suporta dois formatos:
  // 1. /policies/:slug/:token (novo formato amigável)
  // 2. /policies/:token (formato antigo para compatibilidade)
  useEffect(() => {
    if (token) {
      try {
        // O token é um base64 no formato "type:id" (ex: "building:uuid" ou "establishment:uuid")
        const decoded = atob(token);
        const [type, id] = decoded.split(':');
        
        if ((type === 'establishment' || type === 'building') && id) {
          setPoliciesType(type);
          setEntityId(id);
        } else {
          // Fallback: se não tiver o formato esperado, tratar como establishment_id antigo
          setPoliciesType('establishment');
          setEntityId(decoded);
        }
      } catch (error) {
        console.error("Erro ao decodificar token:", error);
      }
    }
  }, [token]);

  // Buscar políticas do estabelecimento
  const { data: hotelSettings, isLoading: isLoadingHotel } = useQuery({
    queryKey: ["public_hotel_policies", policiesType, entityId],
    queryFn: async () => {
      if (!entityId || !policiesType) return null;

      if (policiesType === 'building') {
        // Buscar políticas do prédio
        const { data: building, error: buildingError } = await supabase
          .from("buildings")
          .select("policies, name")
          .eq("id", entityId)
          .maybeSingle();

        if (buildingError) {
          console.error("Erro ao buscar políticas do prédio:", buildingError);
          return null;
        }

        return {
          policies: building?.policies || {},
          name: building?.name || "Prédio",
          type: 'building' as const,
        };
      } else {
        // Buscar políticas do estabelecimento
        const { data, error } = await supabase
          .from("hotel_settings")
          .select("policies, name")
          .eq("establishment_id", entityId)
          .maybeSingle();

        if (error) {
          console.error("Erro ao buscar políticas:", error);
          return null;
        }

        return {
          policies: data?.policies || {},
          name: data?.name || "Estabelecimento",
          type: 'establishment' as const,
        };
      }
    },
    enabled: !!entityId && !!policiesType,
  });

  if (isLoadingHotel) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Carregando políticas...</p>
        </div>
      </div>
    );
  }

  const policies = hotelSettings?.policies || {};
  const entityName = hotelSettings?.name || (hotelSettings?.type === 'building' ? "Prédio" : "Estabelecimento");
  const isBuilding = hotelSettings?.type === 'building';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
            <FileText className="h-8 w-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {isBuilding ? "Políticas do Prédio" : "Políticas do Estabelecimento"}
          </h1>
          <p className="text-slate-600">{entityName}</p>
        </div>

        <div className="space-y-6">
          {/* Texto Livre das Políticas */}
          {policies.policies_text && (
            <Card className="p-6 border-l-4 border-l-indigo-500 shadow-lg">
              <div className="flex items-start gap-3 mb-3">
                <FileText className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <h3 className="font-semibold text-slate-900 text-lg">
                  {isBuilding ? "Políticas do Prédio" : "Políticas do Estabelecimento"}
                </h3>
              </div>
              <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                {policies.policies_text}
              </div>
            </Card>
          )}

          {/* Política de Cancelamento */}
          {policies.cancellation && (
            <Card className="p-6 border-l-4 border-l-blue-500 shadow-lg">
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <h3 className="font-semibold text-slate-900 text-lg">Política de Cancelamento</h3>
              </div>
              {policies.cancellation.free_cancellation_days > 0 && (
                <p className="text-sm text-slate-700 mb-2">
                  <strong>Cancelamento Gratuito:</strong> Até {policies.cancellation.free_cancellation_days} dia(s) antes do check-in.
                </p>
              )}
              {policies.cancellation.cancellation_policy && (
                <div className="text-sm text-slate-600 mb-2">
                  <strong>Política:</strong>
                  <p className="mt-1 whitespace-pre-line leading-relaxed">{policies.cancellation.cancellation_policy}</p>
                </div>
              )}
              {policies.cancellation.refund_policy && (
                <div className="text-sm text-slate-600">
                  <strong>Reembolso:</strong>
                  <p className="mt-1 whitespace-pre-line leading-relaxed">{policies.cancellation.refund_policy}</p>
                </div>
              )}
            </Card>
          )}

          {/* Política de Check-in/Check-out */}
          {policies.checkin_checkout && (
            <Card className="p-6 border-l-4 border-l-green-500 shadow-lg">
              <div className="flex items-start gap-3 mb-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <h3 className="font-semibold text-slate-900 text-lg">Check-in e Check-out</h3>
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
                  <p className="mt-1 whitespace-pre-line leading-relaxed">{policies.checkin_checkout.checkin_instructions}</p>
                </div>
              )}
              {policies.checkin_checkout.checkout_instructions && (
                <div className="text-sm text-slate-600">
                  <strong>Instruções de Check-out:</strong>
                  <p className="mt-1 whitespace-pre-line leading-relaxed">{policies.checkin_checkout.checkout_instructions}</p>
                </div>
              )}
            </Card>
          )}

          {/* Política de Animais */}
          {policies.pets && policies.pets.pets_allowed && (
            <Card className="p-6 border-l-4 border-l-purple-500 shadow-lg">
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                <h3 className="font-semibold text-slate-900 text-lg">Política de Animais</h3>
              </div>
              <p className="text-sm text-slate-700 mb-2">
                <strong>Animais Permitidos:</strong> Sim
                {policies.pets.pet_fee && ` - ${policies.pets.pet_fee}`}
              </p>
              {policies.pets.pet_policy && (
                <div className="text-sm text-slate-600">
                  <strong>Política:</strong>
                  <p className="mt-1 whitespace-pre-line leading-relaxed">{policies.pets.pet_policy}</p>
                </div>
              )}
            </Card>
          )}

          {/* Política de Crianças */}
          {policies.children && (
            <Card className="p-6 border-l-4 border-l-orange-500 shadow-lg">
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <h3 className="font-semibold text-slate-900 text-lg">Política de Crianças</h3>
              </div>
              {policies.children.children_policy && (
                <div className="text-sm text-slate-600 mb-2">
                  <strong>Política:</strong>
                  <p className="mt-1 whitespace-pre-line leading-relaxed">{policies.children.children_policy}</p>
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
            <Card className="p-6 border-l-4 border-l-slate-500 shadow-lg">
              <div className="flex items-start gap-3 mb-3">
                <AlertCircle className="h-5 w-5 text-slate-600 flex-shrink-0 mt-0.5" />
                <h3 className="font-semibold text-slate-900 text-lg">Políticas Gerais</h3>
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
                  <p className="mt-1 whitespace-pre-line leading-relaxed">{policies.general.special_requests}</p>
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
            <Card className="p-6 text-center shadow-lg">
              <p className="text-slate-600">
                Nenhuma política específica configurada para este estabelecimento.
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

