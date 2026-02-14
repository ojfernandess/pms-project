import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Loader2, AlertCircle } from "lucide-react";
import { formatCancellationPolicyDescription } from "@/utils/pricingPlanUtils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PublicCancellationPolicy() {
  const { policyId, companySlug } = useParams<{ policyId: string; companySlug?: string }>();

  const { data: policy, isLoading } = useQuery({
    queryKey: ["public_cancellation_policy", policyId],
    queryFn: async () => {
      if (!policyId) return null;

      const { data, error } = await supabase
        .from("cancellation_policies")
        .select("*")
        .eq("id", policyId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) {
        console.error("Erro ao buscar política:", error);
        return null;
      }

      return data;
    },
    enabled: !!policyId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Carregando política...</p>
        </div>
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Política não encontrada</h2>
          <p className="text-slate-600">A política de cancelamento solicitada não foi encontrada ou não está mais ativa.</p>
        </Card>
      </div>
    );
  }

  const description = formatCancellationPolicyDescription(policy);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <Card className="p-8 border-l-4 border-l-blue-500 shadow-lg">
          <div className="flex items-start gap-3 mb-6">
            <AlertCircle className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">
                Política de Cancelamento
              </h1>
              <p className="text-lg text-slate-600">{policy.name}</p>
            </div>
          </div>

          <div className="space-y-6">
            {/* Descrição completa */}
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Política Completa</h2>
              <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed bg-slate-50 p-4 rounded-lg">
                {description}
              </div>
            </div>

            {/* Detalhes da política */}
            <div className="border-t pt-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Detalhes</h2>
              <div className="space-y-2 text-sm text-slate-600">
                {policy.has_free_cancellation && policy.free_cancellation_deadline && (
                  <p>
                    <strong>Cancelamento Gratuito:</strong> {policy.free_cancellation_deadline}
                  </p>
                )}
                
                {policy.cancellation_fee_type && (
                  <p>
                    <strong>Tipo de Multa de Cancelamento:</strong> {
                      policy.cancellation_fee_type === "first_night" 
                        ? "Primeira Diária" 
                        : policy.cancellation_fee_percentage 
                          ? `${policy.cancellation_fee_percentage}% do Total`
                          : "Não especificado"
                    }
                  </p>
                )}

                {policy.cancellation_fee_after_deadline_type && (
                  <p>
                    <strong>Multa Após Prazo Gratuito:</strong> {
                      policy.cancellation_fee_after_deadline_type === "first_night"
                        ? "Primeira Diária"
                        : policy.cancellation_fee_after_deadline_percentage
                          ? `${policy.cancellation_fee_after_deadline_percentage}% do Total`
                          : "Não especificado"
                    }
                  </p>
                )}

                {policy.no_show_fee_type && (
                  <p>
                    <strong>Multa de No-Show:</strong> {
                      policy.no_show_fee_type === "same_as_cancellation"
                        ? "Mesma taxa de cancelamento"
                        : policy.no_show_fee_type === "first_night"
                          ? "Primeira Diária"
                          : policy.no_show_fee_percentage
                            ? `${policy.no_show_fee_percentage}% do Total`
                            : "Não especificado"
                    }
                  </p>
                )}

                {policy.requires_prepayment && policy.prepayment_percentage && (
                  <p>
                    <strong>Pré-pagamento:</strong> {policy.prepayment_percentage}% do total
                    {policy.prepayment_when && ` - ${policy.prepayment_when}`}
                  </p>
                )}

                {policy.created_at && (
                  <p className="text-xs text-slate-500 mt-4">
                    Política criada em: {format(new Date(policy.created_at), "PPP", { locale: ptBR })}
                  </p>
                )}
              </div>
            </div>

            {/* Pré-pagamento */}
            {policy.requires_prepayment && policy.prepayment_summary && (
              <div className="border-t pt-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Pré-pagamento</h2>
                <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed bg-amber-50 p-4 rounded-lg">
                  {policy.prepayment_summary}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

