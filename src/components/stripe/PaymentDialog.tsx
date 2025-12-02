import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useStripe, useElements, PaymentElement, Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useStripe as useStripeHook } from "@/hooks/useStripe";

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  currency?: string;
  paymentType: string;
  reservationId?: string;
  guestId?: string;
  description?: string;
  savePaymentMethod?: boolean;
  onSuccess?: () => void;
  establishmentId?: string; // Adicionar establishmentId como prop opcional
  locationName?: string; // Nome do estabelecimento ou prédio
  categoryName?: string; // Nome da categoria
  existingPaymentIntentId?: string; // ID do Payment Intent existente (se já foi criado)
  existingClientSecret?: string; // Client secret do Payment Intent existente (se já foi criado)
  metadata?: Record<string, string>; // Metadata adicional para o Payment Intent (ex: checkout_date, total_amount para extensões)
}

// Componente interno que usa o PaymentElement
const PaymentForm = ({
  clientSecret,
  amount,
  currency,
  description,
  locationName,
  categoryName,
  paymentIntentId,
  onSuccess,
  onClose,
}: {
  clientSecret: string;
  amount: number;
  currency: string;
  description?: string;
  locationName?: string;
  categoryName?: string;
  paymentIntentId: string | null;
  onSuccess?: () => void;
  onClose: () => void;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        throw submitError;
      }

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment/success/${paymentIntentId || 'unknown'}`,
        },
        redirect: "if_required",
      });

      if (error) {
        throw error;
      }

      if (paymentIntent?.status === "succeeded") {
        // Redirecionar para página de sucesso
        const finalPaymentIntentId = paymentIntentId || paymentIntent.id;
        if (finalPaymentIntentId) {
          window.location.href = `/payment/success/${finalPaymentIntentId}`;
        } else {
          // Fallback: usar onSuccess se não tiver paymentIntentId
          toast.success("Pagamento processado com sucesso!");
          onSuccess?.();
          onClose();
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao processar pagamento");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {locationName && (
        <div className="p-3 bg-gray-50 rounded-lg">
          <Label className="text-xs text-muted-foreground">Local</Label>
          <p className="text-sm font-semibold">{locationName}</p>
        </div>
      )}

      {categoryName && (
        <div className="p-3 bg-gray-50 rounded-lg">
          <Label className="text-xs text-muted-foreground">Categoria</Label>
          <p className="text-sm font-semibold">{categoryName}</p>
        </div>
      )}

      <div>
        <Label>Valor</Label>
        <div className="text-2xl font-bold">
          {new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency,
          }).format(amount)}
        </div>
      </div>

      {description && (
        <div>
          <Label>Descrição</Label>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      )}

      <div>
        <PaymentElement />
      </div>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isProcessing}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={!stripe || isProcessing}>
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processando...
            </>
          ) : (
            `Pagar ${new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency,
            }).format(amount)}`
          )}
        </Button>
      </div>
    </form>
  );
};

export const PaymentDialog = ({
  open,
  onOpenChange,
  amount,
  currency = "BRL",
  paymentType,
  reservationId,
  guestId,
  description,
  savePaymentMethod = false,
  onSuccess,
  establishmentId: propEstablishmentId,
  locationName,
  categoryName,
  existingPaymentIntentId,
  existingClientSecret,
  metadata,
}: PaymentDialogProps) => {
  const { getPublishableKey } = useStripeHook();
  const publishableKey = getPublishableKey();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Se já existe um Payment Intent, buscar o client_secret ao invés de criar um novo
  useEffect(() => {
    if (open) {
      if (existingPaymentIntentId) {
        // Buscar client_secret do Payment Intent existente
        console.log("[PaymentDialog] Buscando Payment Intent existente:", existingPaymentIntentId);
        fetchExistingPaymentIntent(existingPaymentIntentId);
      } else if (!clientSecret) {
        // Criar novo Payment Intent apenas se não existir um
        createPaymentIntent();
      }
    }
  }, [open, existingPaymentIntentId]);

  const fetchExistingPaymentIntent = async (paymentIntentId: string) => {
    try {
      const establishmentId = propEstablishmentId || getSelectedEstablishmentId();
      if (!establishmentId) {
        toast.error("Estabelecimento não encontrado.");
        setError("Estabelecimento não encontrado");
        return;
      }

      // Buscar o client_secret do Payment Intent existente via Edge Function
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/stripe-payment-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_intent_id: paymentIntentId,
          get_client_secret: true, // Flag para indicar que queremos o client_secret
        }),
      });

      if (!response.ok) {
        throw new Error("Erro ao buscar Payment Intent existente");
      }

      const data = await response.json();
      
      // Se a função retornar o client_secret, usar ele
      if (data.client_secret) {
        console.log("[PaymentDialog] ✅ Client secret obtido do Payment Intent existente");
        setClientSecret(data.client_secret);
        setPaymentIntentId(paymentIntentId);
        return;
      }

      // Se não retornar, criar um novo
      console.warn("[PaymentDialog] Não foi possível obter client_secret do Payment Intent existente, criando novo...");
      createPaymentIntent();
    } catch (error: any) {
      console.error("[PaymentDialog] Erro ao buscar Payment Intent existente:", error);
      // Se falhar, criar um novo
      createPaymentIntent();
    }
  };

  const createPaymentIntent = async () => {
    try {
      // Usar establishmentId da prop, ou tentar obter do contexto
      const establishmentId = propEstablishmentId || getSelectedEstablishmentId();

      if (!establishmentId) {
        toast.error("Estabelecimento não encontrado. Por favor, acesse o link de pagamento novamente.");
        setError("Estabelecimento não encontrado");
        return;
      }

      // Chamar a Edge Function sem autenticação (acesso anônimo permitido)
      const { data, error } = await supabase.functions.invoke("stripe-payment", {
        body: {
          establishment_id: establishmentId,
          amount,
          currency,
          payment_type: paymentType,
          reservation_id: reservationId,
          guest_id: guestId,
          description,
          save_payment_method: savePaymentMethod,
          ...(metadata || {}),
        },
        // Não passar headers de autenticação para permitir acesso anônimo
        // A função usa Service Role Key internamente
      });

      if (error) throw error;

      if (!data?.client_secret) {
        throw new Error("Client secret não retornado");
      }

      setClientSecret(data.client_secret);
      setPaymentIntentId(data.payment_intent_id);
    } catch (error: any) {
      console.error("Erro ao criar Payment Intent:", error);
      setError(error.message || "Erro ao criar pagamento");
      toast.error(error.message || "Erro ao criar pagamento");
    }
  };

  if (!publishableKey) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="p-4">
            <p className="text-red-600">
              Stripe não está configurado. Por favor, configure o Stripe nas configurações do estabelecimento.
            </p>
            <Button onClick={() => onOpenChange(false)} className="mt-4">
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (error) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="p-4">
            <p className="text-red-600">{error}</p>
            <Button onClick={() => onOpenChange(false)} className="mt-4">
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!clientSecret) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="ml-3 text-muted-foreground">Preparando pagamento...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const stripePromise = loadStripe(publishableKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Pagamento</DialogTitle>
        </DialogHeader>

        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: {
              theme: "stripe",
            },
          }}
        >
          <PaymentForm
            clientSecret={clientSecret}
            amount={amount}
            currency={currency}
            description={description}
            locationName={locationName}
            categoryName={categoryName}
            paymentIntentId={paymentIntentId}
            onSuccess={onSuccess}
            onClose={() => onOpenChange(false)}
          />
        </Elements>
      </DialogContent>
    </Dialog>
  );
};

