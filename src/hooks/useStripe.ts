import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { postPmsApi } from "@/lib/pmsApi";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";

export interface StripeGlobalConfig {
  id: string;
  is_enabled: boolean;
  test_mode: boolean;
  test_publishable_key?: string;
  test_secret_key?: string;
  live_publishable_key?: string;
  live_secret_key?: string;
  webhook_secret_test?: string;
  webhook_secret_live?: string;
  created_at: string;
  updated_at: string;
}

export interface StripeEstablishmentConfig {
  id: string;
  establishment_id: string;
  is_enabled: boolean;
  stripe_account_id?: string;
  stripe_customer_id?: string;
  test_publishable_key?: string;
  test_secret_key?: string;
  live_publishable_key?: string;
  live_secret_key?: string;
  webhook_secret_test?: string;
  webhook_secret_live?: string;
  show_establishment_policies?: boolean;
  show_refund_policy?: boolean;
  show_legal_policies?: boolean;
  show_contact_info?: boolean;
  refund_policy_text?: string;
  created_at: string;
  updated_at: string;
}

export interface StripePaymentMethod {
  id: string;
  establishment_id: string;
  guest_id?: string;
  reservation_id?: string;
  stripe_payment_method_id: string;
  stripe_customer_id: string;
  type: string;
  card_brand?: string;
  card_last4?: string;
  card_exp_month?: number;
  card_exp_year?: number;
  is_default: boolean;
  is_active: boolean;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface StripePayment {
  id: string;
  establishment_id: string;
  reservation_id?: string;
  guest_id?: string;
  stripe_payment_intent_id: string;
  stripe_customer_id?: string;
  stripe_payment_method_id?: string;
  amount: number;
  currency: string;
  status: string;
  payment_type: string;
  description?: string;
  metadata?: any;
  receipt_url?: string;
  created_at: string;
  updated_at: string;
}

export interface StripeRefund {
  id: string;
  establishment_id: string;
  payment_id: string;
  reservation_id?: string;
  stripe_refund_id: string;
  amount: number;
  currency: string;
  status: string;
  reason?: string;
  description?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export const useStripe = () => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();

  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  // ========== GLOBAL CONFIG (Super Admin) ==========
  const globalConfigQuery = useQuery({
    queryKey: ["stripe_global_config"],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from("stripe_global_config")
          .select("*")
          .maybeSingle(); // Usar maybeSingle para evitar erro se não houver dados

        if (error) {
          // Se for erro 406, pode ser problema de RLS ou formato
          if (error.code === 'PGRST301' || error.message?.includes('406')) {
            console.warn('Erro 406 ao buscar stripe_global_config. Verificando se tabela existe e políticas RLS estão corretas.');
            // Retornar configuração padrão desabilitada
            return {
              id: '00000000-0000-0000-0000-000000000001',
              is_enabled: false,
              test_mode: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as StripeGlobalConfig;
          }
          throw error;
        }
        
        // Se não houver dados, retornar configuração padrão
        if (!data) {
          return {
            id: '00000000-0000-0000-0000-000000000001',
            is_enabled: false,
            test_mode: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as StripeGlobalConfig;
        }
        
        return data as StripeGlobalConfig;
      } catch (err: any) {
        console.error('Erro ao buscar stripe_global_config:', err);
        // Retornar configuração padrão em caso de erro
        return {
          id: '00000000-0000-0000-0000-000000000001',
          is_enabled: false,
          test_mode: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as StripeGlobalConfig;
      }
    },
    retry: 1, // Tentar apenas uma vez para evitar loops
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  const updateGlobalConfig = useMutation({
    mutationFn: async (config: Partial<StripeGlobalConfig>) => {
      const { data, error } = await supabase
        .from("stripe_global_config")
        .update(config)
        .eq("id", "00000000-0000-0000-0000-000000000001")
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stripe_global_config"] });
      toast.success("Configuração global do Stripe atualizada!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar configuração global");
    },
  });

  // ========== ESTABLISHMENT CONFIG ==========
  const establishmentConfigQuery = useQuery({
    queryKey: ["stripe_establishment_config", getEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return null;

      // Remover verificação de autenticação para permitir acesso público
      // A segurança é garantida pelas políticas RLS que permitem SELECT público
      // quando relacionado a pagamentos públicos (via stripe_payments)
      const { data, error } = await supabase
        .from("stripe_establishment_config")
        .select("*")
        .eq("establishment_id", establishmentId)
        .maybeSingle(); // Usar maybeSingle() ao invés de single() para permitir 0 resultados

      if (error) {
        console.error("Error fetching stripe establishment config:", error);
        // PGRST116 = nenhum resultado encontrado (esperado quando não há configuração)
        // PGRST301 = erro de RLS (pode acontecer se não houver política pública)
        if (error.code !== "PGRST116" && error.code !== "PGRST301") {
          console.warn("Erro ao buscar stripe_establishment_config:", error);
        }
        return null;
      }
      return data as StripeEstablishmentConfig | null;
    },
    enabled: !!getEstablishmentId(),
  });

  const upsertEstablishmentConfig = useMutation({
    mutationFn: async (config: Partial<StripeEstablishmentConfig>) => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) {
        console.error('[Stripe Hook] Establishment ID não encontrado');
        throw new Error("Establishment ID não encontrado");
      }

      console.log('[Stripe Hook] Salvando configuração...', {
        establishment_id: establishmentId,
        is_enabled: config.is_enabled,
        has_test_keys: !!(config.test_publishable_key && config.test_secret_key),
        has_live_keys: !!(config.live_publishable_key && config.live_secret_key),
      });

      // Verificar autenticação
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[Stripe Hook] Usuário não autenticado');
        throw new Error("Usuário não autenticado");
      }

      const payload = { ...config, establishment_id: establishmentId };
      console.log('[Stripe Hook] Payload a ser enviado:', {
        ...payload,
        test_secret_key: payload.test_secret_key ? '***' : undefined,
        live_secret_key: payload.live_secret_key ? '***' : undefined,
      });

      const { data, error } = await supabase
        .from("stripe_establishment_config")
        .upsert(
          payload,
          { onConflict: "establishment_id" }
        )
        .select()
        .single();

      if (error) {
        console.error('[Stripe Hook] ❌ Erro ao salvar:', error);
        console.error('[Stripe Hook] Código:', error.code, 'Mensagem:', error.message);
        console.error('[Stripe Hook] Detalhes:', error.details, 'Hint:', error.hint);
        throw error;
      }

      console.log('[Stripe Hook] ✅ Configuração salva com sucesso:', {
        id: data?.id,
        establishment_id: data?.establishment_id,
        is_enabled: data?.is_enabled,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stripe_establishment_config"] });
      toast.success("Configuração do Stripe atualizada!");
    },
    onError: (error: any) => {
      console.error('[Stripe Hook] Erro no onError:', error);
      toast.error(error.message || "Erro ao atualizar configuração");
    },
  });

  // ========== PAYMENT METHODS ==========
  const paymentMethodsQuery = useQuery({
    queryKey: ["stripe_payment_methods", getEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("stripe_payment_methods")
        .select("*")
        .eq("establishment_id", establishmentId)
        .eq("is_active", true)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as StripePaymentMethod[];
    },
    enabled: !!getEstablishmentId(),
  });

  const guestPaymentMethodsQuery = (guestId: string) =>
    useQuery({
      queryKey: ["stripe_payment_methods", "guest", guestId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("stripe_payment_methods")
          .select("*")
          .eq("guest_id", guestId)
          .eq("is_active", true)
          .order("is_default", { ascending: false })
          .order("created_at", { ascending: false });

        if (error) throw error;
        return (data || []) as StripePaymentMethod[];
      },
    });

  // ========== PAYMENTS ==========
  const paymentsQuery = useQuery({
    queryKey: ["stripe_payments", getEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("stripe_payments")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as StripePayment[];
    },
    enabled: !!getEstablishmentId(),
  });

  const reservationPaymentsQuery = (reservationId: string) =>
    useQuery({
      queryKey: ["stripe_payments", "reservation", reservationId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("stripe_payments")
          .select("*")
          .eq("reservation_id", reservationId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        return (data || []) as StripePayment[];
      },
    });

  // ========== REFUNDS ==========
  const refundsQuery = useQuery({
    queryKey: ["stripe_refunds", getEstablishmentId()],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      const { data, error } = await supabase
        .from("stripe_refunds")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as StripeRefund[];
    },
    enabled: !!getEstablishmentId(),
  });

  const createRefund = useMutation({
    mutationFn: async ({
      paymentId,
      amount,
      reason,
      description,
    }: {
      paymentId: string;
      amount: number;
      reason?: string;
      description?: string;
    }) => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) throw new Error("Establishment ID não encontrado");

      const data = await postPmsApi<{
        refund_id: string;
        refund_record_id?: string;
        status: string;
        amount: number;
      }>("/api/pagamentos/stripe/refund", {
        payment_id: paymentId,
        amount,
        reason,
        description,
        establishment_id: establishmentId,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stripe_refunds"] });
      queryClient.invalidateQueries({ queryKey: ["stripe_payments"] });
      toast.success("Reembolso processado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao processar reembolso");
    },
  });

  // ========== HELPER FUNCTIONS ==========
  const isStripeEnabled = () => {
    const global = globalConfigQuery.data;
    const establishment = establishmentConfigQuery.data;
    return global?.is_enabled && establishment?.is_enabled;
  };

  const getPublishableKey = () => {
    const global = globalConfigQuery.data;
    const establishment = establishmentConfigQuery.data;
    const isTestMode = global?.test_mode ?? true;

    if (establishment) {
      return isTestMode
        ? establishment.test_publishable_key
        : establishment.live_publishable_key;
    }

    return isTestMode ? global?.test_publishable_key : global?.live_publishable_key;
  };

  return {
    // Global Config
    globalConfig: globalConfigQuery.data,
    isLoadingGlobalConfig: globalConfigQuery.isLoading,
    updateGlobalConfig: updateGlobalConfig.mutateAsync,

    // Establishment Config
    establishmentConfig: establishmentConfigQuery.data,
    isLoadingEstablishmentConfig: establishmentConfigQuery.isLoading,
    upsertEstablishmentConfig: upsertEstablishmentConfig.mutateAsync,

    // Payment Methods
    paymentMethods: paymentMethodsQuery.data || [],
    isLoadingPaymentMethods: paymentMethodsQuery.isLoading,
    guestPaymentMethodsQuery,

    // Payments
    payments: paymentsQuery.data || [],
    isLoadingPayments: paymentsQuery.isLoading,
    reservationPaymentsQuery,

    // Refunds
    refunds: refundsQuery.data || [],
    isLoadingRefunds: refundsQuery.isLoading,
    createRefund: createRefund.mutateAsync,

    // Helpers
    isStripeEnabled: isStripeEnabled(),
    getPublishableKey,
  };
};

