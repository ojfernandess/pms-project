import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { usePricing } from "./usePricing";
import { format } from "date-fns";
import { generateQuoteCode } from "@/utils/quoteCode";

export type QuoteStatus = "pending" | "sent" | "accepted" | "rejected" | "expired" | "converted";

export interface Quote {
  id: string;
  quote_code: string;
  establishment_id: string;
  client_id?: string | null;
  guest_id?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  category_id: string;
  room_id?: string | null;
  checkin_date: string;
  checkout_date: string;
  adults: number;
  children: number;
  total_amount: number;
  pricing_plan_id?: string | null;
  channel?: string | null;
  status: QuoteStatus;
  payment_link?: string | null;
  payment_intent_id?: string | null;
  reservation_id?: string | null;
  expiration_date?: string | null;
  notes?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  converted_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  // Relacionamentos
  client?: any;
  guest?: any;
  category?: any;
  room?: any;
  pricing_plan?: any;
  reservation?: any;
}

export interface QuoteInsert {
  establishment_id: string;
  client_id?: string | null;
  guest_id?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  category_id: string;
  room_id?: string | null;
  checkin_date: string;
  checkout_date: string;
  adults?: number;
  children?: number;
  total_amount?: number;
  pricing_plan_id?: string | null;
  channel?: string | null;
  status?: QuoteStatus;
  notes?: string | null;
  expiration_date?: string | null;
}

export interface QuoteUpdate {
  client_id?: string | null;
  guest_id?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  category_id?: string;
  room_id?: string | null;
  checkin_date?: string;
  checkout_date?: string;
  adults?: number;
  children?: number;
  total_amount?: number;
  pricing_plan_id?: string | null;
  channel?: string | null;
  status?: QuoteStatus;
  payment_link?: string | null;
  payment_intent_id?: string | null;
  reservation_id?: string | null;
  expiration_date?: string | null;
  notes?: string | null;
  sent_at?: string | null;
  accepted_at?: string | null;
  converted_at?: string | null;
}

export const useQuotes = () => {
  const queryClient = useQueryClient();
  const { selectedEstablishment } = useEstablishment();
  const { calculatePrice } = usePricing();

  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      localStorage.setItem("selectedEstablishmentId", selectedEstablishment.id);
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  // Buscar todos os orçamentos
  const quotesQuery = useQuery({
    queryKey: ["quotes", selectedEstablishment?.id],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) {
        return [];
      }

      const { data, error } = await supabase
        .from("quotes")
        .select(`
          *,
          client:clients!client_id(*),
          guest:clients!guest_id(*),
          category:room_categories(*),
          room:rooms(*),
          pricing_plan:pricing_plans(*),
          reservation:reservations(*)
        `)
        .eq("establishment_id", establishmentId)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Erro ao carregar orçamentos");
        throw error;
      }

      return data as Quote[];
    },
  });

  // Criar orçamento
  const createQuote = useMutation({
    mutationFn: async (quoteData: QuoteInsert) => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) {
        throw new Error("Estabelecimento não selecionado");
      }

      // Calcular preço se não fornecido
      let totalAmount = quoteData.total_amount || 0;
      if (!quoteData.total_amount && quoteData.category_id && quoteData.checkin_date && quoteData.checkout_date) {
        try {
          totalAmount = await calculatePrice(
            quoteData.category_id,
            quoteData.checkin_date,
            quoteData.checkout_date,
            undefined,
            quoteData.pricing_plan_id || undefined,
            quoteData.channel || undefined,
            quoteData.adults || 1,
            quoteData.children || 0
          );
        } catch (error) {
          console.error("Erro ao calcular preço:", error);
          // Continuar com valor 0 se não conseguir calcular
        }
      }

      // Gerar token único para seleção de quartos
      const selectionToken = `quote_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

      const { data, error } = await supabase
        .from("quotes")
        .insert({
          ...quoteData,
          quote_code: quoteData.quote_code || generateQuoteCode(),
          establishment_id: establishmentId,
          total_amount: totalAmount,
          status: quoteData.status || "pending",
          room_selection_link: selectionToken,
        })
        .select(`
          *,
          client:clients!client_id(*),
          guest:clients!guest_id(*),
          category:room_categories(*),
          room:rooms(*),
          pricing_plan:pricing_plans(*)
        `)
        .single();

      if (error) {
        toast.error("Erro ao criar orçamento");
        throw error;
      }

      toast.success("Orçamento criado com sucesso");

      try {
        const companyId = selectedEstablishment?.company_id;
        if (companyId && data?.id) {
          const { upsertDealFromQuote } = await import("@/lib/crm/crmDeals");
          await upsertDealFromQuote({
            companyId,
            establishmentId: establishmentId || data.establishment_id,
            quoteId: data.id,
            title: `Orçamento ${data.quote_code}`,
            amount: Number(data.total_amount || 0),
            fullName: data.guest_name || data.client?.full_name || data.guest?.full_name || null,
            email: data.guest_email || data.client?.email || data.guest?.email || null,
            phone: data.guest_phone || data.client?.phone || data.guest?.phone || null,
            clientId: data.client_id || data.guest_id || null,
            source: "quote_staff",
            stageKey: "proposal",
          });
        }
      } catch (crmErr) {
        console.warn("CRM deal from quote:", crmErr);
      }

      return data as Quote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["crm-board"] });
    },
  });

  // Atualizar orçamento
  const updateQuote = useMutation({
    mutationFn: async ({ id, ...updateData }: { id: string } & QuoteUpdate) => {
      const { data, error } = await supabase
        .from("quotes")
        .update(updateData)
        .eq("id", id)
        .select(`
          *,
          client:clients!client_id(*),
          guest:clients!guest_id(*),
          category:room_categories(*),
          room:rooms(*),
          pricing_plan:pricing_plans(*),
          reservation:reservations(*)
        `)
        .single();

      if (error) {
        toast.error("Erro ao atualizar orçamento");
        throw error;
      }

      toast.success("Orçamento atualizado com sucesso");
      return data as Quote;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });

  // Deletar orçamento
  const deleteQuote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("quotes")
        .delete()
        .eq("id", id);

      if (error) {
        toast.error("Erro ao deletar orçamento");
        throw error;
      }

      toast.success("Orçamento deletado com sucesso");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });

  // Converter orçamento em reserva
  const convertQuoteToReservation = useMutation({
    mutationFn: async (quoteId: string) => {
      // Buscar dados do orçamento
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", quoteId)
        .single();

      if (quoteError || !quote) {
        throw new Error("Orçamento não encontrado");
      }

      if (quote.status === "converted") {
        throw new Error("Orçamento já foi convertido em reserva");
      }

      // Buscar ou criar cliente/hóspede
      let clientId = quote.client_id;
      let guestId = quote.guest_id;

      if (!clientId && quote.guest_email) {
        // Tentar encontrar cliente existente pelo email
        const { data: existingClient } = await supabase
          .from("clients")
          .select("id")
          .eq("email", quote.guest_email)
          .maybeSingle();

        if (existingClient) {
          clientId = existingClient.id;
          guestId = existingClient.id;
        } else {
          // Criar novo cliente
          const { data: newClient, error: clientError } = await supabase
            .from("clients")
            .insert({
              full_name: quote.guest_name || "Cliente",
              email: quote.guest_email || null,
              phone: quote.guest_phone || null,
            })
            .select("id")
            .single();

          if (clientError) {
            throw new Error("Erro ao criar cliente");
          }

          clientId = newClient.id;
          guestId = newClient.id;
        }
      }

      if (!clientId) {
        throw new Error("É necessário ter um cliente associado ao orçamento");
      }

      // Criar reserva usando a função create_reservation_with_lock
      const reservationData = {
        establishment_id: quote.establishment_id,
        room_id: quote.room_id || null,
        category_id: quote.category_id,
        guest_id: guestId,
        client_id: clientId,
        guest_name: quote.guest_name || null,
        adults: quote.adults || 1,
        children: quote.children || 0,
        total_amount: quote.total_amount || 0,
        paid_amount: quote.total_amount || 0, // Se já foi pago, marcar como pago
        payment_status: quote.payment_intent_id ? "paid" : "pending",
        status: "confirmed",
        notes: quote.notes || null,
        pricing_plan_id: quote.pricing_plan_id || null,
        created_by: quote.created_by || null,
        channel: quote.channel || "direct",
      };

      const { createReservationWithLock } = await import("@/lib/pmsApi");
      let reservationResult: { success?: boolean; error?: string; reservation_id?: string } | null = null;
      let reservationError: { message?: string } | null = null;
      try {
        reservationResult = await createReservationWithLock({
          p_reservation_data: reservationData,
          p_checkin_date: quote.checkin_date,
          p_checkout_date: quote.checkout_date,
          p_establishment_id: quote.establishment_id,
          p_room_id: quote.room_id || null,
          p_category_id: quote.category_id,
        });
      } catch (error) {
        reservationError = { message: error instanceof Error ? error.message : "Erro ao criar reserva" };
      }

      if (reservationError || !reservationResult?.success) {
        throw new Error(reservationError?.message || "Erro ao criar reserva");
      }

      // Atualizar orçamento como convertido
      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          status: "converted",
          reservation_id: reservationResult.reservation_id,
          converted_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      if (updateError) {
        console.error("Erro ao atualizar orçamento:", updateError);
        // Não lançar erro aqui, pois a reserva já foi criada
      }

      toast.success("Orçamento convertido em reserva com sucesso");
      return reservationResult;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
    },
  });

  // Gerar link de pagamento para orçamento
  const generatePaymentLink = useMutation({
    mutationFn: async (quoteId: string) => {
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", quoteId)
        .single();

      if (quoteError || !quote) {
        throw new Error("Orçamento não encontrado");
      }

      if (!quote.guest_email) {
        throw new Error("É necessário ter um email do hóspede para gerar link de pagamento");
      }

      const establishmentId = getEstablishmentId();
      if (!establishmentId) {
        throw new Error("Estabelecimento não selecionado");
      }

      // Criar Payment Intent via Edge Function
      const { invokePmsFunction } = await import("@/lib/pmsApi");
      const { data: paymentData, error: paymentError } = await invokePmsFunction(
        "stripe-payment",
        {
          body: {
            establishment_id: establishmentId,
            amount: quote.total_amount,
            currency: "BRL",
            payment_type: "quote_payment",
            quote_id: quoteId,
            guest_email: quote.guest_email,
            description: `Pagamento do orçamento #${quote.quote_code}`,
          },
        }
      );

      if (paymentError || !paymentData?.payment_intent_id) {
        throw new Error(paymentError?.message || "Erro ao gerar link de pagamento");
      }

      // Atualizar orçamento com payment_intent_id e payment_link
      const siteUrl = window.location.origin;
      const paymentLink = `${siteUrl}/quote-payment/${paymentData.payment_intent_id}`;

      const { error: updateError } = await supabase
        .from("quotes")
        .update({
          payment_intent_id: paymentData.payment_intent_id,
          payment_link: paymentLink,
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", quoteId);

      if (updateError) {
        console.error("Erro ao atualizar orçamento:", updateError);
      }

      return paymentLink;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });

  // Enviar email com link de pagamento
  const sendQuoteEmail = useMutation({
    mutationFn: async ({ quoteId, paymentLink }: { quoteId: string; paymentLink: string }) => {
      const { sendQuotePaymentLinkEmail } = await import("@/lib/emailService");
      
      // Buscar dados completos do orçamento
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .select(`
          *,
          category:room_categories(*),
          room:rooms(*)
        `)
        .eq("id", quoteId)
        .maybeSingle();

      if (quoteError) {
        console.error("Erro ao buscar orçamento:", quoteError);
        throw new Error(`Erro ao buscar orçamento: ${quoteError.message}`);
      }

      if (!quote) {
        throw new Error("Orçamento não encontrado");
      }

      if (!quote.guest_email) {
        throw new Error("Email do hóspede não informado no orçamento");
      }

      const emailQueueId = await sendQuotePaymentLinkEmail(quote, paymentLink);
      
      if (!emailQueueId) {
        throw new Error("Erro ao enviar email. Verifique os logs para mais detalhes.");
      }

      return emailQueueId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
    },
  });

  return {
    quotes: quotesQuery.data || [],
    isLoading: quotesQuery.isLoading,
    error: quotesQuery.error,
    createQuote: createQuote.mutateAsync,
    updateQuote: updateQuote.mutateAsync,
    deleteQuote: deleteQuote.mutateAsync,
    convertQuoteToReservation: convertQuoteToReservation.mutateAsync,
    generatePaymentLink: generatePaymentLink.mutateAsync,
    sendQuoteEmail: sendQuoteEmail.mutateAsync,
    isCreating: createQuote.isPending,
    isUpdating: updateQuote.isPending,
    isDeleting: deleteQuote.isPending,
    isConverting: convertQuoteToReservation.isPending,
    isGeneratingLink: generatePaymentLink.isPending,
    isSendingEmail: sendQuoteEmail.isPending,
  };
};

