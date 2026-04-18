import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Star, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { StayReviewForm } from "@/components/reviews/StayReviewForm";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";

export default function ReviewPage() {
  const { locator } = useParams<{ locator: string }>();
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<any>(null);
  const [reviewSettings, setReviewSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useSiteSettings();
  
  // Verificar se o feature flag está habilitado para o estabelecimento da reserva
  const isStayReviewsEnabled = reservation 
    ? isFeatureEnabledForEstablishment(
        settings?.features_enabled?.stay_reviews,
        reservation.establishment_id
      )
    : false;

  // Buscar reserva pelo localizador
  useEffect(() => {
    const fetchReservation = async () => {
      if (!locator) {
        setError("Localizador não fornecido");
        setIsLoading(false);
        return;
      }

      try {
        // Tentar buscar pelo identification_number ou reservation_code
        const { data: reservationData, error: reservationError } = await supabase
          .from("reservations")
          .select(`
            id,
            reservation_code,
            identification_number,
            checkin_date,
            checkout_date,
            status,
            establishment_id,
            rooms(id, room_number, name),
            establishment:establishments(id, name)
          `)
          .or(`identification_number.eq.${locator},reservation_code.eq.${locator}`)
          .maybeSingle();

        if (reservationError) {
          throw reservationError;
        }

        if (!reservationData) {
          setError("Reserva não encontrada");
          setIsLoading(false);
          return;
        }

        // Verificar se a reserva está com check-out concluído
        if (reservationData.status !== "checkedout") {
          setError("Esta reserva ainda não foi finalizada. Apenas reservas com check-out concluído podem ser avaliadas.");
          setIsLoading(false);
          return;
        }

        // Buscar configurações de avaliação
        const { data: settings, error: settingsError } = await supabase
          .from("establishment_review_settings")
          .select("is_enabled, review_type")
          .eq("establishment_id", reservationData.establishment_id)
          .maybeSingle();

        if (settingsError) {
          throw settingsError;
        }

        // Verificar feature flag global primeiro
        const { data: siteSettings } = await supabase
          .from("site_settings")
          .select("features_enabled")
          .eq("id", "00000000-0000-0000-0000-000000000001")
          .maybeSingle();
        
        const { isFeatureEnabledForEstablishment } = await import("@/lib/featureAccess");
        const isFeatureEnabled = isFeatureEnabledForEstablishment(
          siteSettings?.features_enabled?.stay_reviews,
          reservationData.establishment_id
        );
        
        if (!isFeatureEnabled) {
          setError("O sistema de avaliações não está habilitado para este estabelecimento.");
          setIsLoading(false);
          return;
        }

        if (!settings || !settings.is_enabled) {
          setError("O sistema de avaliações não está habilitado para este estabelecimento.");
          setIsLoading(false);
          return;
        }

        // Verificar se já existe avaliação
        const { data: existingReview } = await supabase
          .from("stay_reviews")
          .select("id")
          .eq("reservation_id", reservationData.id)
          .maybeSingle();

        setReservation({
          ...reservationData,
          reviewType: settings.review_type,
          maxRating: settings.review_type === "numeric" ? 10 : 5,
          hasReview: !!existingReview,
        });
        setReviewSettings(settings);
      } catch (err: any) {
        console.error("Erro ao buscar reserva:", err);
        setError(err.message || "Erro ao carregar dados da reserva");
      } finally {
        setIsLoading(false);
      }
    };

    fetchReservation();
  }, [locator]);

  const handleSubmitSuccess = () => {
    navigate("/thank-you?from=review");
  };

  // Verificar novamente após carregar a reserva
  const finalIsStayReviewsEnabled = reservation 
    ? isFeatureEnabledForEstablishment(
        settings?.features_enabled?.stay_reviews,
        reservation.establishment_id
      )
    : false;

  if (reservation && !finalIsStayReviewsEnabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="p-8 max-w-md w-full text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Sistema Desabilitado</h2>
          <p className="text-slate-600 mb-6">O sistema de avaliações está desabilitado para este estabelecimento.</p>
          <Button onClick={() => navigate("/guest-dashboard")}>
            Voltar ao Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="p-8 max-w-md w-full text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-slate-600">Carregando dados da reserva...</p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="p-8 max-w-md w-full text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">Erro</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <Button onClick={() => navigate("/guest-dashboard")}>
            Voltar ao Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  if (!reservation) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Card className="p-6 sm:p-8">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Star className="h-6 w-6 text-yellow-500" />
              <h1 className="text-2xl font-bold text-slate-900">
                Avaliar sua Estadia
              </h1>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Reserva:</span>
                <span className="font-semibold">{reservation.reservation_code}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Quarto:</span>
                <span className="font-semibold">
                  {(() => {
                    const roomsData = Array.isArray(reservation.rooms) 
                      ? reservation.rooms[0] 
                      : reservation.rooms;
                    return roomsData?.room_number || roomsData?.name || "N/A";
                  })()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Check-out:</span>
                <span className="font-semibold">
                  {reservation.checkout_date
                    ? format(new Date(reservation.checkout_date), "dd/MM/yyyy", {
                        locale: ptBR,
                      })
                    : "N/A"}
                </span>
              </div>
              {reservation.establishment && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Estabelecimento:</span>
                  <span className="font-semibold">
                    {(reservation.establishment as any).name}
                  </span>
                </div>
              )}
            </div>
          </div>

          {reservation.hasReview ? (
            <div className="text-center py-8">
              <p className="text-slate-600 mb-4">
                Você já avaliou esta estadia. Obrigado pelo seu feedback!
              </p>
              <Button onClick={() => navigate("/guest-dashboard")}>
                Voltar ao Dashboard
              </Button>
            </div>
          ) : (
            <StayReviewForm
              reservationId={reservation.id}
              establishmentId={reservation.establishment_id}
              guestAccountId={null} // Não requer login para avaliar via localizador
              reviewType={reservation.reviewType}
              maxRating={reservation.maxRating}
              onSubmit={handleSubmitSuccess}
            />
          )}
        </Card>
      </div>
    </div>
  );
}

