import type { QueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { triggerEmail } from "@/lib/emailService";

type ReservationLike = Record<string, unknown> & {
  id?: string;
  reservation_code?: string | null;
  establishment_id?: string | null;
  room_id?: string | null;
  checkout_date?: string | null;
  checkin_date?: string | null;
  checkout_time?: string | null;
  identification_number?: string | null;
  _skipEmail?: boolean;
};

export async function runAfterCheckIn(updatedReservation: ReservationLike): Promise<void> {
  if (!updatedReservation.id) return;

  try {
    await logActivity({
      actionType: "checked_in",
      entityType: "reservation",
      entityId: String(updatedReservation.id),
      entityCode: (updatedReservation.reservation_code as string) ?? undefined,
      description: `Check-in realizado para reserva ${updatedReservation.reservation_code}`,
      oldValues: { status: "confirmed" },
      newValues: {
        status: "checkedin",
        room_id: updatedReservation.room_id,
      },
    });
  } catch (logError) {
    console.error("runAfterCheckIn: log", logError);
  }

  if (updatedReservation._skipEmail) return;

  try {
    await triggerEmail("checkin.confirmed", updatedReservation);
  } catch (emailError) {
    console.error("runAfterCheckIn: e-mail", emailError);
  }
}

export async function runAfterCheckOut(
  updatedReservation: ReservationLike,
  queryClient: QueryClient,
): Promise<void> {
  const reservationAny = updatedReservation;

  if (reservationAny.room_id && reservationAny.establishment_id) {
    try {
      const room = reservationAny.rooms as { room_number?: string } | undefined;
      const guestName =
        (reservationAny.guest as { full_name?: string } | undefined)?.full_name ||
        (reservationAny.financial_responsible as { full_name?: string } | undefined)?.full_name ||
        (reservationAny.guest_name as string) ||
        "Hóspede";

      const { data: hotelSettings } = await supabase
        .from("hotel_settings")
        .select("enable_cleaning_notifications")
        .eq("establishment_id", reservationAny.establishment_id as string)
        .maybeSingle();

      const isCleaningNotificationsEnabled = hotelSettings?.enable_cleaning_notifications !== false;

      if (isCleaningNotificationsEnabled) {
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        const { data: recentNotifications } = await supabase
          .from("notifications")
          .select("id, metadata")
          .eq("establishment_id", reservationAny.establishment_id as string)
          .eq("type", "cleaning_required")
          .eq("metadata->>room_id", String(reservationAny.room_id))
          .gte("created_at", twoHoursAgo.toISOString())
          .limit(1);

        if (!recentNotifications?.length) {
          await supabase.rpc("create_notification_for_establishment", {
            p_establishment_id: reservationAny.establishment_id,
            p_type: "cleaning_required",
            p_title: "Quarto Precisa de Limpeza",
            p_message: `O quarto ${room?.room_number || "N/A"} precisa de limpeza após check-out da reserva ${reservationAny.reservation_code || ""} (${guestName})`,
            p_priority: "high",
            p_metadata: {
              room_id: reservationAny.room_id,
              room_number: room?.room_number || "N/A",
              reservation_id: reservationAny.id,
              reservation_code: reservationAny.reservation_code || "",
              guest_name: guestName,
              checkout_date: reservationAny.checkout_date || format(new Date(), "yyyy-MM-dd"),
              checkout_time: reservationAny.checkout_time || format(new Date(), "HH:mm"),
              checkin_date: reservationAny.checkin_date,
            },
          });
          queryClient.invalidateQueries({ queryKey: ["notifications"], refetchType: "active" });
        }
      }
    } catch (notificationError) {
      console.error("runAfterCheckOut: notificação limpeza", notificationError);
    }
  }

  try {
    const checkoutDate = updatedReservation.checkout_date
      ? new Date(String(updatedReservation.checkout_date))
      : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (checkoutDate) {
      checkoutDate.setHours(0, 0, 0, 0);
      if (checkoutDate <= today) {
        await triggerEmail("checkout.completed", updatedReservation);
      }
    }
  } catch (error) {
    console.warn("runAfterCheckOut: e-mail checkout", error);
  }

  try {
    const { data: siteSettings } = await supabase
      .from("site_settings")
      .select("features_enabled")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();

    const { isFeatureEnabledForEstablishment } = await import("@/lib/featureAccess");
    const isStayReviewsEnabled = isFeatureEnabledForEstablishment(
      (siteSettings as { features_enabled?: { stay_reviews?: unknown } } | null)?.features_enabled
        ?.stay_reviews,
      updatedReservation.establishment_id as string,
    );

    if (!isStayReviewsEnabled || !updatedReservation.establishment_id) return;

    const { sendStayReviewRequestEmail } = await import("@/lib/emailService");
    const { data: reviewSettings } = await supabase
      .from("establishment_review_settings")
      .select("is_enabled, send_email_after_checkout, email_delay_hours")
      .eq("establishment_id", updatedReservation.establishment_id)
      .maybeSingle();

    if (!reviewSettings?.is_enabled || !reviewSettings?.send_email_after_checkout) return;

    const checkoutDate = updatedReservation.checkout_date
      ? new Date(String(updatedReservation.checkout_date))
      : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!checkoutDate) return;
    checkoutDate.setHours(0, 0, 0, 0);
    if (checkoutDate > today) return;

    const baseUrl =
      typeof window !== "undefined"
        ? window.location.origin
        : (import.meta.env.VITE_APP_URL || "http://localhost:8080");
    const locator =
      updatedReservation.identification_number || updatedReservation.reservation_code;
    const reviewLink = `${baseUrl}/review/${locator}`;
    await sendStayReviewRequestEmail(updatedReservation, reviewLink);
  } catch (error) {
    console.warn("runAfterCheckOut: avaliação", error);
  }
}