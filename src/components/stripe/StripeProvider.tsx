import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { useStripe } from "@/hooks/useStripe";
import { ReactNode } from "react";

interface StripeProviderProps {
  children: ReactNode;
}

export const StripeProvider = ({ children }: StripeProviderProps) => {
  const { getPublishableKey, globalConfig } = useStripe();
  const publishableKey = getPublishableKey();

  // Sempre renderizar Elements, mesmo sem chave
  // Isso permite que componentes verifiquem se Stripe está disponível
  // Se não houver chave, loadStripe retornará null e os componentes devem tratar isso
  const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

  return (
    <Elements
      stripe={stripePromise}
      options={{
        appearance: {
          theme: "stripe",
        },
      }}
    >
      {children}
    </Elements>
  );
};

