import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCancellationPolicyDescription, formatCancellationPolicyShortSummary } from "@/utils/pricingPlanUtils";
import { recordPolicyAcceptance, getClientUserAgent } from "@/utils/cancellationPolicyAcceptance";
import { ExternalLink } from "lucide-react";

interface CancellationPolicyDisplayProps {
  policy: any;
  theme?: any;
  reservationId?: string;
  quoteId?: string;
  onAcceptanceChange?: (accepted: boolean) => void;
  requireAcceptance?: boolean;
  showFullPolicyLink?: boolean;
  companySlug?: string;
}

export const CancellationPolicyDisplay = ({ 
  policy, 
  theme, 
  reservationId,
  quoteId,
  onAcceptanceChange,
  requireAcceptance = false,
  showFullPolicyLink = true,
  companySlug,
}: CancellationPolicyDisplayProps) => {
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  if (!policy) return null;

  const shortSummary = formatCancellationPolicyShortSummary(policy);
  const fullDescription = formatCancellationPolicyDescription(policy);
  
  // URL para política completa (usar token da política ou ID)
  const fullPolicyUrl = companySlug 
    ? `/motor/${companySlug}/politica/${policy.id}`
    : `/politica/${policy.id}`;

  const handleAcceptance = async (checked: boolean) => {
    setAccepted(checked);
    onAcceptanceChange?.(checked);

    // Registrar aceite apenas se houver reservationId
    // Para quotes, o aceite será registrado quando a reserva for criada
    if (checked && policy.id && reservationId) {
      setAccepting(true);
      try {
        await recordPolicyAcceptance({
          reservation_id: reservationId,
          policy_id: policy.id,
          user_agent: getClientUserAgent(),
          channel: reservationId ? "booking_engine" : "quote_payment",
        });
      } catch (error) {
        console.error("Erro ao registrar aceite:", error);
        // Não bloquear o fluxo se o registro falhar
      } finally {
        setAccepting(false);
      }
    }
    // Para quotes sem reservationId, apenas atualizar o estado local
    // O aceite será registrado quando a reserva for criada a partir do quote
  };

  return (
    <div className={`mt-2 p-2 rounded-lg border ${theme?.cardBorder || "border-slate-200"} bg-slate-50/50 dark:bg-slate-800/50`}>
      <p className={`text-xs font-semibold ${theme?.textPrimary || "text-gray-900"} mb-1`}>
        Política de Cancelamento:
      </p>
      
      {/* Resumo curto dinâmico */}
      <p className={`text-xs ${theme?.textSecondary || "text-gray-600"} leading-relaxed mb-2`}>
        {shortSummary}
      </p>

      {/* Link para ler política completa */}
      {showFullPolicyLink && (
        <a
          href={fullPolicyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-xs ${theme?.linkColor || "text-blue-600 hover:text-blue-800"} underline flex items-center gap-1 mb-2`}
          onClick={(e) => {
            // Se não houver URL válida, mostrar descrição completa inline
            if (!policy.id) {
              e.preventDefault();
              setShowFullDescription(!showFullDescription);
            }
          }}
        >
          <ExternalLink className="w-3 h-3" />
          Ler política completa
        </a>
      )}

      {/* Descrição completa (se expandida) */}
      {showFullDescription && (
        <div className="mt-2 pt-2 border-t border-slate-200">
          <p className={`text-xs ${theme?.textSecondary || "text-gray-600"} leading-relaxed whitespace-pre-line`}>
            {fullDescription}
          </p>
        </div>
      )}

      {policy.requires_prepayment && policy.prepayment_summary && (
        <div className="mt-2 pt-2 border-t border-slate-200">
          <p className={`text-xs font-semibold ${theme?.textPrimary || "text-gray-900"} mb-1`}>
            Pré-pagamento:
          </p>
          <p className={`text-xs ${theme?.textSecondary || "text-gray-600"} leading-relaxed`}>
            {policy.prepayment_summary}
          </p>
        </div>
      )}
      {requireAcceptance && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex items-start gap-2">
            <Checkbox
              id={`policy-accept-${policy.id}`}
              checked={accepted}
              onCheckedChange={handleAcceptance}
              disabled={accepting}
              className="mt-0.5"
            />
            <label
              htmlFor={`policy-accept-${policy.id}`}
              className={`text-xs ${theme?.textSecondary || "text-gray-600"} cursor-pointer leading-relaxed`}
            >
              Li e aceito a política de cancelamento acima
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

