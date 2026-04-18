import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { toast } from "sonner";

export const usePaymentCarriers = () => {
  const queryClient = useQueryClient();

  // Buscar portadores de pagamento
  const carriersQuery = useQuery({
    queryKey: ["payment_carriers"],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      let query = supabase.from("payment_carriers").select("*");
      
      if (establishmentId) {
        query = query.eq("establishment_id", establishmentId);
      }
      
      const { data, error } = await query.order("code");

      if (error) {
        toast.error("Erro ao carregar portadores de pagamento");
        throw error;
      }
      return data;
    },
  });

  // Buscar tipos de pagamento por portador
  const paymentTypesQuery = useQuery({
    queryKey: ["payment_types"],
    queryFn: async () => {
      const establishmentId = getSelectedEstablishmentId();
      // Buscar portadores do estabelecimento primeiro
      let carriersQuery = supabase.from("payment_carriers").select("id");
      if (establishmentId) {
        carriersQuery = carriersQuery.eq("establishment_id", establishmentId);
      }
      const { data: carriers } = await carriersQuery;
      const carrierIds = carriers?.map((c: any) => c.id) || [];
      
      // Se não há portadores, retornar array vazio
      if (carrierIds.length === 0) return [];
      
      // Buscar tipos de pagamento dos portadores do estabelecimento
      const { data, error } = await supabase
        .from("payment_types")
        .select(`
          *,
          payment_carriers (*)
        `)
        .in("carrier_id", carrierIds)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar tipos de pagamento");
        throw error;
      }
      return data;
    },
  });

  // Criar portador de pagamento
  const createCarrier = useMutation({
    mutationFn: async (carrier: {
      code: string;
      description: string;
      agency?: string;
      account?: string;
      is_active?: boolean;
    }) => {
      const establishmentId = getSelectedEstablishmentId();
      const { data, error } = await supabase
        .from("payment_carriers")
        .insert([{ ...carrier, establishment_id: establishmentId || undefined }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_carriers"] });
      toast.success("Portador de pagamento criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar portador de pagamento");
    },
  });

  // Atualizar portador de pagamento
  const updateCarrier = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const { data, error } = await supabase
        .from("payment_carriers")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_carriers"] });
      toast.success("Portador de pagamento atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar portador de pagamento");
    },
  });

  // Deletar portador de pagamento
  const deleteCarrier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payment_carriers")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_carriers"] });
      queryClient.invalidateQueries({ queryKey: ["payment_types"] });
      toast.success("Portador de pagamento excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir portador de pagamento");
    },
  });

  // Criar tipo de pagamento
  const createPaymentType = useMutation({
    mutationFn: async (paymentType: {
      carrier_id: string;
      name: string;
      payment_method: string;
      card_brand?: string;
      card_fee?: number;
      installments_2_6_fee?: number;
      installments_7_12_fee?: number;
      payment_days?: number;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("payment_types")
        .insert([paymentType])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_types"] });
      toast.success("Tipo de pagamento criado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao criar tipo de pagamento");
    },
  });

  // Atualizar tipo de pagamento
  const updatePaymentType = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & any) => {
      const { data, error } = await supabase
        .from("payment_types")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_types"] });
      toast.success("Tipo de pagamento atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao atualizar tipo de pagamento");
    },
  });

  // Deletar tipo de pagamento
  const deletePaymentType = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("payment_types")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_types"] });
      toast.success("Tipo de pagamento excluído com sucesso!");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erro ao excluir tipo de pagamento");
    },
  });

  return {
    carriers: carriersQuery.data || [],
    paymentTypes: paymentTypesQuery.data || [],
    isLoading: carriersQuery.isLoading || paymentTypesQuery.isLoading,
    refetch: () => {
      carriersQuery.refetch();
      paymentTypesQuery.refetch();
    },
    createCarrier: createCarrier.mutateAsync,
    updateCarrier: updateCarrier.mutateAsync,
    deleteCarrier: deleteCarrier.mutateAsync,
    createPaymentType: createPaymentType.mutateAsync,
    updatePaymentType: updatePaymentType.mutateAsync,
    deletePaymentType: deletePaymentType.mutateAsync,
    isCreating: createCarrier.isPending,
    isUpdating: updateCarrier.isPending,
  };
};

