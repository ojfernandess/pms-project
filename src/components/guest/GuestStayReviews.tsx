import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, MessageSquare, CheckCircle2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { StayReviewForm } from "@/components/reviews/StayReviewForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStayReviews } from "@/hooks/useStayReviews";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";

interface GuestStayReviewsProps {
  guestAccountId: string;
  reservationId?: string;
}

export function GuestStayReviews({ guestAccountId, reservationId }: GuestStayReviewsProps) {
  const [selectedReservation, setSelectedReservation] = useState<any>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const { useGetReviewSettings } = useStayReviews();
  const { settings } = useSiteSettings();
  const { selectedEstablishment } = useEstablishment();
  
  // Buscar reservas com check-out concluído que podem ser avaliadas
  const { data: reviewableReservations, isLoading } = useQuery({
    queryKey: ["reviewable_reservations", guestAccountId, reservationId, settings?.features_enabled?.stay_reviews],
    queryFn: async () => {
      // Buscar histórico de estadias do hóspede
      const { data: history } = await supabase
        .from("guest_stay_history")
        .select("reservation_id, status, checkout_date")
        .eq("guest_account_id", guestAccountId)
        .eq("status", "completed")
        .order("checkout_date", { ascending: false });

      if (!history || history.length === 0) return [];

      const reservationIds = history.map((h) => h.reservation_id);

      // Buscar reservas
      const { data: reservations } = await supabase
        .from("reservations")
        .select(`
          id,
          reservation_code,
          checkin_date,
          checkout_date,
          status,
          establishment_id,
          rooms(id, room_number, name),
          establishment:establishments(id, name)
        `)
        .in("id", reservationIds)
        .eq("status", "checkedout")
        .order("checkout_date", { ascending: false });

      if (!reservations) return [];

      // Buscar avaliações existentes
      const { data: reviews } = await supabase
        .from("stay_reviews")
        .select("reservation_id")
        .in("reservation_id", reservationIds);

      const reviewedReservationIds = new Set(
        reviews?.map((r) => r.reservation_id) || []
      );

      // Filtrar reservas que ainda não foram avaliadas E que têm o feature flag habilitado
      const { isFeatureEnabledForEstablishment } = await import("@/lib/featureAccess");
      return reservations.filter((r) => {
        // Verificar se já foi avaliada
        if (reviewedReservationIds.has(r.id)) {
          return false;
        }
        
        // Verificar se o feature flag está habilitado para o estabelecimento desta reserva
        return isFeatureEnabledForEstablishment(
          settings?.features_enabled?.stay_reviews,
          r.establishment_id
        );
      });
    },
    enabled: !!guestAccountId,
  });
  
  // Se não houver reservas disponíveis, não renderizar o componente
  if (!isLoading && (!reviewableReservations || reviewableReservations.length === 0)) {
    return null;
  }

  const handleReviewClick = async (reservation: any) => {
    // Buscar configurações de avaliação do estabelecimento
    const { data: settings } = await supabase
      .from("establishment_review_settings")
      .select("is_enabled, review_type")
      .eq("establishment_id", reservation.establishment_id)
      .maybeSingle();

    if (!settings || !settings.is_enabled) {
      return;
    }

    setSelectedReservation({
      ...reservation,
      reviewType: settings.review_type,
      maxRating: settings.review_type === "numeric" ? 10 : 5,
    });
    setReviewDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="text-center py-4 text-slate-500">
        Carregando avaliações...
      </div>
    );
  }

  if (!reviewableReservations || reviewableReservations.length === 0) {
    return (
      <div className="text-center py-4 text-slate-500">
        Nenhuma reserva disponível para avaliação no momento.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {reviewableReservations.map((reservation: any) => (
          <Card key={reservation.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-semibold text-slate-900">
                    {reservation.reservation_code}
                  </h4>
                  <Badge variant="outline" className="text-xs">
                    Check-out realizado
                  </Badge>
                </div>
                <div className="text-sm text-slate-600 space-y-1">
                  <div>
                    Quarto: {reservation.rooms?.room_number || reservation.rooms?.name || "N/A"}
                  </div>
                  <div>
                    Check-out:{" "}
                    {reservation.checkout_date
                      ? format(new Date(reservation.checkout_date), "dd/MM/yyyy", {
                          locale: ptBR,
                        })
                      : "N/A"}
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleReviewClick(reservation)}
                className="ml-4"
              >
                <Star className="h-4 w-4 mr-2" />
                Avaliar
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Dialog de Avaliação */}
      {selectedReservation && (
        <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Avaliar Estadia</DialogTitle>
            </DialogHeader>
            <StayReviewForm
              reservationId={selectedReservation.id}
              establishmentId={selectedReservation.establishment_id}
              guestAccountId={guestAccountId}
              reviewType={selectedReservation.reviewType}
              maxRating={selectedReservation.maxRating}
              onSubmit={() => {
                setReviewDialogOpen(false);
                setSelectedReservation(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

