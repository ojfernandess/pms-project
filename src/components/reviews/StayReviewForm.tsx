import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, Smile, Frown, Meh } from "lucide-react";
import { useStayReviews, ReviewFormData } from "@/hooks/useStayReviews";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface StayReviewFormProps {
  reservationId: string;
  establishmentId: string;
  guestAccountId?: string | null;
  reviewType: "stars" | "numeric" | "emoji";
  maxRating: number; // 5 para stars/emoji, 10 para numeric
  onSubmit?: () => void;
}

const EMOJI_MAP = {
  1: { icon: Frown, label: "Muito Insatisfeito", color: "text-red-500" },
  2: { icon: Frown, label: "Insatisfeito", color: "text-orange-500" },
  3: { icon: Meh, label: "Neutro", color: "text-yellow-500" },
  4: { icon: Smile, label: "Satisfeito", color: "text-green-500" },
  5: { icon: Smile, label: "Muito Satisfeito", color: "text-green-600" },
};

export function StayReviewForm({
  reservationId,
  establishmentId,
  guestAccountId,
  reviewType,
  maxRating,
  onSubmit,
}: StayReviewFormProps) {
  const { createOrUpdateReview, useGetReviewByReservation } = useStayReviews();
  const { data: existingReview } = useGetReviewByReservation(reservationId);

  const [formData, setFormData] = useState<ReviewFormData>({
    reservation_id: reservationId,
    room_rating: null,
    comfort_rating: null,
    service_rating: null,
    cleanliness_rating: null,
    comment: "",
    is_anonymous: false, // Sempre false, opção removida da UI
  });

  useEffect(() => {
    if (existingReview) {
      setFormData({
        reservation_id: reservationId,
        room_rating: existingReview.room_rating,
        comfort_rating: existingReview.comfort_rating,
        service_rating: existingReview.service_rating,
        cleanliness_rating: existingReview.cleanliness_rating,
        comment: existingReview.comment || "",
        is_anonymous: existingReview.is_anonymous,
      });
    }
  }, [existingReview, reservationId]);

  const handleRatingChange = (
    category: "room_rating" | "comfort_rating" | "service_rating" | "cleanliness_rating",
    value: number
  ) => {
    setFormData((prev) => ({
      ...prev,
      [category]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validar que pelo menos uma categoria foi avaliada
    if (
      !formData.room_rating &&
      !formData.comfort_rating &&
      !formData.service_rating &&
      !formData.cleanliness_rating
    ) {
      toast.error("Por favor, avalie pelo menos uma categoria");
      return;
    }

    await createOrUpdateReview.mutateAsync({
      reservationId,
      establishmentId,
      guestAccountId,
      reviewType,
      ...formData,
    });

    onSubmit?.();
  };

  const renderRatingInput = (
    label: string,
    category: "room_rating" | "comfort_rating" | "service_rating" | "cleanliness_rating",
    value: number | null
  ) => {
    if (reviewType === "stars") {
      return (
        <div className="space-y-2">
          <Label>{label}</Label>
          <div className="flex gap-1">
            {Array.from({ length: maxRating }, (_, i) => i + 1).map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => handleRatingChange(category, rating)}
                className="focus:outline-none transition-transform hover:scale-110"
              >
                <Star
                  className={`w-8 h-8 ${
                    value && rating <= value
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300"
                  }`}
                />
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (reviewType === "numeric") {
      return (
        <div className="space-y-2">
          <Label>{label}</Label>
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: maxRating }, (_, i) => i + 1).map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => handleRatingChange(category, rating)}
                className={`px-4 py-2 rounded-md border transition-colors ${
                  value === rating
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border hover:bg-accent"
                }`}
              >
                {rating}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (reviewType === "emoji") {
      return (
        <div className="space-y-2">
          <Label>{label}</Label>
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: maxRating }, (_, i) => i + 1).map((rating) => {
              const EmojiIcon = EMOJI_MAP[rating as keyof typeof EMOJI_MAP]?.icon || Smile;
              const emojiLabel = EMOJI_MAP[rating as keyof typeof EMOJI_MAP]?.label || "";
              const emojiColor = EMOJI_MAP[rating as keyof typeof EMOJI_MAP]?.color || "";

              return (
                <button
                  key={rating}
                  type="button"
                  onClick={() => handleRatingChange(category, rating)}
                  className={`p-3 rounded-lg border transition-all hover:scale-110 ${
                    value === rating
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-accent"
                  }`}
                  title={emojiLabel}
                >
                  <EmojiIcon className={`w-8 h-8 ${value === rating ? emojiColor : "text-gray-400"}`} />
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {renderRatingInput("Quarto", "room_rating", formData.room_rating)}
        {renderRatingInput("Conforto", "comfort_rating", formData.comfort_rating)}
        {renderRatingInput("Atendimento", "service_rating", formData.service_rating)}
        {renderRatingInput("Limpeza", "cleanliness_rating", formData.cleanliness_rating)}
      </div>

      <div className="space-y-2">
        <Label htmlFor="comment">Comentários (opcional)</Label>
        <Textarea
          id="comment"
          value={formData.comment}
          onChange={(e) => setFormData((prev) => ({ ...prev, comment: e.target.value }))}
          placeholder="Compartilhe sua experiência conosco..."
          rows={4}
        />
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={createOrUpdateReview.isPending}
      >
        {createOrUpdateReview.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando...
          </>
        ) : (
          existingReview ? "Atualizar Avaliação" : "Enviar Avaliação"
        )}
      </Button>
    </form>
  );
}

