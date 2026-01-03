import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface StayReview {
  id: string;
  reservation_id: string;
  establishment_id: string;
  guest_account_id: string | null;
  room_rating: number | null;
  comfort_rating: number | null;
  service_rating: number | null;
  cleanliness_rating: number | null;
  comment: string | null;
  is_published: boolean;
  is_anonymous: boolean;
  review_type: "stars" | "numeric" | "emoji";
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface EstablishmentReviewSettings {
  id: string;
  establishment_id: string;
  is_enabled: boolean;
  review_type: "stars" | "numeric" | "emoji";
  send_email_after_checkout: boolean;
  email_delay_hours: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewFormData {
  reservation_id: string;
  room_rating: number | null;
  comfort_rating: number | null;
  service_rating: number | null;
  cleanliness_rating: number | null;
  comment?: string;
  is_anonymous?: boolean;
}

export const useStayReviews = () => {
  const queryClient = useQueryClient();

  // Buscar avaliações de um estabelecimento
  const useGetReviews = (establishmentId: string, filters?: {
    is_published?: boolean;
    startDate?: string;
    endDate?: string;
  }) => {
    return useQuery({
      queryKey: ["stay_reviews", establishmentId, filters],
      queryFn: async () => {
        if (!establishmentId) {
          return [];
        }
        
        let query = supabase
          .from("stay_reviews")
          .select(`
            *,
            reservation:reservations(
              id,
              reservation_code,
              checkin_date,
              checkout_date,
              guest:clients!guest_id(id, full_name, email),
              rooms(
                id,
                room_number,
                name,
                category_id,
                room_categories:category_id(
                  id,
                  name,
                  building_id,
                  buildings(id, name)
                )
              )
            )
          `)
          .eq("establishment_id", establishmentId)
          .order("submitted_at", { ascending: false });

        if (filters?.is_published !== undefined) {
          query = query.eq("is_published", filters.is_published);
        }

        if (filters?.startDate) {
          query = query.gte("submitted_at", filters.startDate);
        }

        if (filters?.endDate) {
          query = query.lte("submitted_at", filters.endDate);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Erro ao buscar avaliações:", error);
          // Se a tabela não existir, retornar array vazio
          if (error.code === "42P01" || error.message?.includes("does not exist")) {
            return [];
          }
          throw error;
        }
        return (data || []) as StayReview[];
      },
      enabled: !!establishmentId,
      retry: 1,
    });
  };

  // Buscar avaliação de uma reserva específica
  const useGetReviewByReservation = (reservationId: string) => {
    return useQuery({
      queryKey: ["stay_review", reservationId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("stay_reviews")
          .select("*")
          .eq("reservation_id", reservationId)
          .maybeSingle();

        if (error) throw error;
        return data as StayReview | null;
      },
      enabled: !!reservationId,
    });
  };

  // Buscar configurações de avaliação de um estabelecimento
  const useGetReviewSettings = (establishmentId: string) => {
    return useQuery({
      queryKey: ["establishment_review_settings", establishmentId],
      queryFn: async () => {
        const { data, error } = await supabase
          .from("establishment_review_settings")
          .select("*")
          .eq("establishment_id", establishmentId)
          .maybeSingle();

        if (error) throw error;
        return data as EstablishmentReviewSettings | null;
      },
      enabled: !!establishmentId,
    });
  };

  // Criar ou atualizar avaliação
  const createOrUpdateReview = useMutation({
    mutationFn: async ({
      reservationId,
      establishmentId,
      guestAccountId,
      reviewType,
      ...formData
    }: ReviewFormData & {
      establishmentId: string;
      guestAccountId?: string | null;
      reviewType: "stars" | "numeric" | "emoji";
    }) => {
      // Verificar se já existe avaliação para esta reserva
      const { data: existingReview } = await supabase
        .from("stay_reviews")
        .select("id")
        .eq("reservation_id", reservationId)
        .maybeSingle();

      const reviewData = {
        reservation_id: reservationId,
        establishment_id: establishmentId,
        guest_account_id: guestAccountId || null,
        room_rating: formData.room_rating,
        comfort_rating: formData.comfort_rating,
        service_rating: formData.service_rating,
        cleanliness_rating: formData.cleanliness_rating,
        comment: formData.comment || null,
        is_anonymous: formData.is_anonymous || false,
        review_type: reviewType,
        submitted_at: new Date().toISOString(),
      };

      let isNewReview = false;
      let reviewResult;

      if (existingReview) {
        // Atualizar avaliação existente
        const { data, error } = await supabase
          .from("stay_reviews")
          .update(reviewData)
          .eq("id", existingReview.id)
          .select()
          .single();

        if (error) throw error;
        reviewResult = data;
      } else {
        // Criar nova avaliação
        isNewReview = true;
        const { data, error } = await supabase
          .from("stay_reviews")
          .insert(reviewData)
          .select()
          .single();

        if (error) throw error;
        reviewResult = data;
      }

      return { review: reviewResult, isNewReview, reservationId, establishmentId };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ["stay_reviews"] });
      queryClient.invalidateQueries({ queryKey: ["stay_review"] });
      toast.success("Avaliação enviada com sucesso!");

      // Criar notificação apenas para novas avaliações
      if (result.isNewReview) {
        try {
          // Buscar informações da reserva para a notificação
          const { data: reservation } = await supabase
            .from("reservations")
            .select("reservation_code, guest_name")
            .eq("id", result.reservationId)
            .single();

          const reservationCode = reservation?.reservation_code || result.reservationId.substring(0, 8).toUpperCase();
          const guestName = reservation?.guest_name || "Hóspede";

          // Criar notificação para todos os usuários do estabelecimento
          const { error: notificationError } = await supabase.rpc("create_notification_for_establishment", {
            p_establishment_id: result.establishmentId,
            p_type: "other",
            p_title: "Nova Avaliação Recebida",
            p_message: `${guestName} enviou uma nova avaliação para a reserva ${reservationCode}`,
            p_priority: "medium",
            p_metadata: {
              reservation_id: result.reservationId,
              review_id: result.review.id,
              type: "stay_review"
            }
          });

          if (notificationError) {
            console.error("Erro ao criar notificação de avaliação:", notificationError);
          }
        } catch (error) {
          console.error("Erro ao processar notificação de avaliação:", error);
        }
      }
    },
    onError: (error: any) => {
      console.error("Erro ao salvar avaliação:", error);
      toast.error(error.message || "Erro ao salvar avaliação");
    },
  });

  // Atualizar configurações de avaliação
  const updateReviewSettings = useMutation({
    mutationFn: async ({
      establishmentId,
      ...settings
    }: Partial<EstablishmentReviewSettings> & { establishmentId: string }) => {
      // Verificar se já existe configuração
      const { data: existing } = await supabase
        .from("establishment_review_settings")
        .select("id")
        .eq("establishment_id", establishmentId)
        .maybeSingle();

      const settingsData = {
        establishment_id: establishmentId,
        ...settings,
      };

      if (existing) {
        const { data, error } = await supabase
          .from("establishment_review_settings")
          .update(settingsData)
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from("establishment_review_settings")
          .insert(settingsData)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["establishment_review_settings"] });
      toast.success("Configurações salvas com sucesso!");
    },
    onError: (error: any) => {
      console.error("Erro ao salvar configurações:", error);
      toast.error(error.message || "Erro ao salvar configurações");
    },
  });

  // Moderar avaliação (publicar/ocultar)
  const moderateReview = useMutation({
    mutationFn: async ({
      reviewId,
      is_published,
    }: {
      reviewId: string;
      is_published: boolean;
    }) => {
      const { data, error } = await supabase
        .from("stay_reviews")
        .update({ is_published })
        .eq("id", reviewId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stay_reviews"] });
      toast.success("Avaliação atualizada com sucesso!");
    },
    onError: (error: any) => {
      console.error("Erro ao moderar avaliação:", error);
      toast.error(error.message || "Erro ao atualizar avaliação");
    },
  });

  // Estatísticas de avaliações
  const useGetReviewStatistics = (establishmentId: string) => {
    return useQuery({
      queryKey: ["stay_reviews_statistics", establishmentId],
      queryFn: async () => {
        if (!establishmentId) {
          return {
            total: 0,
            averageRoom: 0,
            averageComfort: 0,
            averageService: 0,
            averageCleanliness: 0,
            averageOverall: 0,
            distribution: {
              stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
              numeric: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
            },
          };
        }
        
        const { data: reviews, error } = await supabase
          .from("stay_reviews")
          .select("room_rating, comfort_rating, service_rating, cleanliness_rating")
          .eq("establishment_id", establishmentId)
          .eq("is_published", true);

        if (error) {
          console.error("Erro ao buscar estatísticas de avaliações:", error);
          // Se a tabela não existir ou houver erro de RLS, retornar estatísticas vazias
          if (error.code === "42P01" || error.message?.includes("does not exist") || error.code === "42501") {
            console.warn("Tabela stay_reviews não existe ou acesso negado. Retornando estatísticas vazias.");
            return {
              total: 0,
              averageRoom: 0,
              averageComfort: 0,
              averageService: 0,
              averageCleanliness: 0,
              averageOverall: 0,
              distribution: {
                stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                numeric: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
              },
            };
          }
          throw error;
        }

        const total = (reviews || [])?.length || 0;
        if (total === 0) {
          return {
            total: 0,
            averageRoom: 0,
            averageComfort: 0,
            averageService: 0,
            averageCleanliness: 0,
            averageOverall: 0,
            distribution: {
              stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
              numeric: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
            },
          };
        }

        const sumRoom = reviews?.reduce((sum, r) => sum + (r.room_rating || 0), 0) || 0;
        const sumComfort = reviews?.reduce((sum, r) => sum + (r.comfort_rating || 0), 0) || 0;
        const sumService = reviews?.reduce((sum, r) => sum + (r.service_rating || 0), 0) || 0;
        const sumCleanliness = reviews?.reduce((sum, r) => sum + (r.cleanliness_rating || 0), 0) || 0;

        const averageRoom = sumRoom / total;
        const averageComfort = sumComfort / total;
        const averageService = sumService / total;
        const averageCleanliness = sumCleanliness / total;
        const averageOverall = (averageRoom + averageComfort + averageService + averageCleanliness) / 4;

        // Distribuição (assumindo que ratings são de 1-5 para stars/emoji ou 1-10 para numeric)
        const distribution = {
          stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          numeric: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 },
        };

        (reviews || [])?.forEach((review) => {
          const avg = (review.room_rating || 0 + review.comfort_rating || 0 + review.service_rating || 0 + review.cleanliness_rating || 0) / 4;
          const rounded = Math.round(avg);
          if (rounded >= 1 && rounded <= 5) {
            distribution.stars[rounded as keyof typeof distribution.stars]++;
          }
          if (rounded >= 1 && rounded <= 10) {
            distribution.numeric[rounded as keyof typeof distribution.numeric]++;
          }
        });

        return {
          total,
          averageRoom: Number(averageRoom.toFixed(2)),
          averageComfort: Number(averageComfort.toFixed(2)),
          averageService: Number(averageService.toFixed(2)),
          averageCleanliness: Number(averageCleanliness.toFixed(2)),
          averageOverall: Number(averageOverall.toFixed(2)),
          distribution,
        };
      },
      enabled: !!establishmentId,
    });
  };

  return {
    useGetReviews,
    useGetReviewByReservation,
    useGetReviewSettings,
    useGetReviewStatistics,
    createOrUpdateReview,
    updateReviewSettings,
    moderateReview,
  };
};

