import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { postPmsApi } from "@/lib/pmsApi";

/**
 * Página de pagamento da cobrança de check-in acessada via link seguro (token).
 * Valida o token, cria o Payment Intent no Stripe e redireciona para a tela de pagamento.
 */
export default function CheckinChargePaymentPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "error" | "redirect">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setMessage("Link inválido.");
      setStatus("error");
      return;
    }

    const run = async () => {
      try {
        const { data: rows, error: rpcError } = await supabase.rpc(
          "get_checkin_charge_by_payment_token",
          { p_token: token }
        );

        if (rpcError) {
          setMessage("Erro ao validar link. Tente novamente.");
          setStatus("error");
          return;
        }

        const charge = Array.isArray(rows) ? rows[0] : rows;
        if (!charge?.reservation_id || !charge?.establishment_id || charge?.amount == null) {
          setMessage("Link expirado ou cobrança já paga.");
          setStatus("error");
          return;
        }

        const result = await postPmsApi<{ payment_intent_id: string }>("/api/pagamentos/stripe/intent", {
          establishment_id: charge.establishment_id,
          amount: Number(charge.amount),
          payment_type: "reservation",
          reservation_id: charge.reservation_id,
          guest_id: charge.guest_id || undefined,
          description: `Cobrança de check-in - Reserva ${charge.reservation_code || charge.reservation_id}`,
        });

        const paymentIntentId = result?.payment_intent_id;
        if (paymentIntentId) {
          setStatus("redirect");
          navigate(`/payment/${paymentIntentId}`, { replace: true });
        } else {
          setMessage("Resposta inválida do servidor de pagamento.");
          setStatus("error");
        }
      } catch (e) {
        setMessage((e as Error).message || "Erro inesperado.");
        setStatus("error");
      }
    };

    run();
  }, [token, navigate]);

  if (status === "loading" || status === "redirect") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">
            {status === "redirect" ? "Redirecionando para o pagamento..." : "Validando link de pagamento..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-6 text-center">
        <p className="text-red-600 mb-4">{message}</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-blue-600 hover:underline"
        >
          Voltar ao início
        </button>
      </div>
    </div>
  );
}
