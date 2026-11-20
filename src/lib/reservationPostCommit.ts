import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLogger";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { triggerEmail } from "@/lib/emailService";
import { invokePmsFunction } from "@/lib/pmsApi";
import { maybeFinalizeOtaCancellationAfterPmsCancel } from "@/lib/otaFinalizeCancellationAfterPms";
import { enqueueBookingCancelled, enqueueBookingCreated } from "@/lib/crm/crmOutbox";

type CreatedReservation = {
  id: string;
  establishment_id?: string | null;
  reservation_code?: string | null;
  checkin_date?: string | null;
  checkout_date?: string | null;
  total_amount?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
  status?: string | null;
  client_id?: string | null;
  guest_id?: string | null;
  guest?: { full_name?: string; email?: string; phone?: string } | null;
  financial_responsible?: { full_name?: string; email?: string; phone?: string } | null;
  guest_name?: string | null;
};

type CancelledReservationPayload = {
  id: string;
  reservation_code?: string | null;
  establishment_id?: string | null;
  originalStatus?: string | null;
  cancellation_reason?: string | null;
  refundPayments?: boolean;
  payment_status?: string | null;
  paid_amount?: number | null;
  guest_name?: string | null;
  client_id?: string | null;
  guest_id?: string | null;
  guest?: { full_name?: string } | null;
  financial_responsible?: { full_name?: string } | null;
};

/** Efeitos após persistência — não bloquear UI (chamar com void). */
export async function runAfterReservationCreated(newReservation: CreatedReservation): Promise<void> {
  try {
    const establishmentId = newReservation.establishment_id || getSelectedEstablishmentId();
    if (establishmentId) {
      const guestName =
        newReservation.guest?.full_name ||
        newReservation.financial_responsible?.full_name ||
        (newReservation.guest_name && String(newReservation.guest_name).trim()) ||
        "Hóspede";
      await supabase.rpc("create_notification_for_establishment", {
        p_establishment_id: establishmentId,
        p_type: "new_reservation",
        p_title: "Nova Reserva Criada",
        p_message: `Nova reserva ${newReservation.reservation_code || ""} criada para ${guestName}`,
        p_priority: "medium",
        p_metadata: {
          reservation_id: newReservation.id,
          reservation_code: newReservation.reservation_code,
        },
      });
    }
  } catch (error) {
    console.error("runAfterReservationCreated: notificação", error);
  }

  try {
    const establishmentId = newReservation.establishment_id || getSelectedEstablishmentId();
    if (!newReservation.id || !establishmentId) return;

    let reservationCode = String(newReservation.reservation_code ?? "").trim();
    let checkinForWeb = newReservation.checkin_date;

    if (!reservationCode) {
      for (let attempt = 0; attempt < 2 && !reservationCode; attempt++) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        const { data } = await supabase
          .from("reservations")
          .select("reservation_code, checkin_date")
          .eq("id", newReservation.id)
          .maybeSingle();
        if (data?.reservation_code) {
          reservationCode = data.reservation_code;
          checkinForWeb = data.checkin_date ?? checkinForWeb;
        }
      }
    }

    if (!reservationCode) {
      console.error("runAfterReservationCreated: reservation_code ausente", newReservation.id);
      return;
    }

    const { locatorService } = await import("@/lib/locatorService");
    const token = locatorService.generateWebCheckinToken(newReservation.id, reservationCode);
    const checkinDate = new Date(String(checkinForWeb));
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    if (checkinDate < expiresAt) expiresAt.setTime(checkinDate.getTime());

    const { data: existingWebCheckin } = await supabase
      .from("web_checkin")
      .select("id, locator")
      .eq("reservation_id", newReservation.id)
      .maybeSingle();

    if (!existingWebCheckin) {
      await supabase.from("web_checkin").insert({
        reservation_id: newReservation.id,
        establishment_id: establishmentId,
        token,
        locator: reservationCode,
        expires_at: expiresAt.toISOString(),
        status: "pending",
      });
    } else if (existingWebCheckin.locator !== reservationCode) {
      await supabase
        .from("web_checkin")
        .update({
          locator: reservationCode,
          token,
          expires_at: expiresAt.toISOString(),
        })
        .eq("id", existingWebCheckin.id);
    }

    if (newReservation.payment_status !== "paid") {
      try {
        await triggerEmail("reservation.created", newReservation);
      } catch (emailError) {
        console.error("runAfterReservationCreated: e-mail", emailError);
      }
    }

    if (newReservation.establishment_id) {
      try {
        await invokePmsFunction("call-company-webhook", {
          body: {
            establishment_id: newReservation.establishment_id,
            event: "reservation.created",
            payload: {
              reservation_id: newReservation.id,
              reservation_code: newReservation.reservation_code,
              checkin_date: newReservation.checkin_date,
              checkout_date: newReservation.checkout_date,
              total_amount: newReservation.total_amount,
              status: newReservation.status,
              payment_status: newReservation.payment_status,
              guest_name: newReservation.guest?.full_name ?? newReservation.financial_responsible?.full_name ?? null,
              guest_email: newReservation.guest?.email ?? newReservation.financial_responsible?.email ?? null,
            },
          },
        });
      } catch (webhookError) {
        console.error("runAfterReservationCreated: webhook empresa", webhookError);
      }
    }
  } catch (error) {
    console.error("runAfterReservationCreated: web check-in", error);
  }

  if (newReservation.status === "confirmed" && newReservation.establishment_id) {
    try {
      const { data: ccConfig } = await supabase
        .from("checkin_charge_config")
        .select("send_timing")
        .eq("establishment_id", newReservation.establishment_id)
        .eq("enabled", true)
        .maybeSingle();
      if (ccConfig?.send_timing === "after_confirmation") {
        await invokePmsFunction("send-checkin-charge", {
          body: { reservation_id: newReservation.id, intent: "checkin_reminder" },
        });
      }
    } catch (e) {
      console.warn("runAfterReservationCreated: check-in charge (after_confirmation)", e);
    }
  }

  const totalAmount = Number(newReservation.total_amount ?? 0);
  const paidAmount = Number(newReservation.paid_amount ?? 0);
  if (newReservation.establishment_id && totalAmount > 0 && paidAmount < totalAmount) {
    try {
      const { data: ccConfig } = await supabase
        .from("checkin_charge_config")
        .select("id")
        .eq("establishment_id", newReservation.establishment_id)
        .eq("enabled", true)
        .maybeSingle();
      if (ccConfig) {
        await invokePmsFunction("send-checkin-charge", {
          body: { reservation_id: newReservation.id, intent: "payment_pending" },
        });
      }
    } catch (e) {
      console.warn("runAfterReservationCreated: check-in charge (payment_pending)", e);
    }
  }

  try {
    await logActivity({
      actionType: "created",
      entityType: "reservation",
      entityId: newReservation.id,
      entityCode: newReservation.reservation_code ?? undefined,
      description: `Reserva ${newReservation.reservation_code} criada`,
      newValues: {
        checkin_date: newReservation.checkin_date,
        checkout_date: newReservation.checkout_date,
        total_amount: newReservation.total_amount,
        payment_status: newReservation.payment_status,
        status: newReservation.status,
      },
    });
  } catch (logError) {
    console.error("runAfterReservationCreated: activity log", logError);
  }

  try {
    const establishmentId = newReservation.establishment_id || getSelectedEstablishmentId();
    if (establishmentId && newReservation.id) {
      const guestName =
        newReservation.guest?.full_name ||
        newReservation.financial_responsible?.full_name ||
        newReservation.guest_name ||
        null;
      await enqueueBookingCreated({
        establishmentId,
        reservationId: newReservation.id,
        reservationCode: newReservation.reservation_code,
        clientId: newReservation.client_id || newReservation.guest_id || null,
        guestName,
        email: newReservation.guest?.email || newReservation.financial_responsible?.email || null,
        phone: newReservation.guest?.phone || newReservation.financial_responsible?.phone || null,
        totalAmount: newReservation.total_amount,
        status: newReservation.status,
        source: "pms_staff",
      });
    }
  } catch (crmError) {
    console.warn("runAfterReservationCreated: CRM outbox", crmError);
  }
}

export async function runAfterReservationCancelled(reservationData: CancelledReservationPayload): Promise<void> {
  try {
    const description = reservationData.refundPayments
      ? `Reserva ${reservationData.reservation_code} cancelada com estorno de pagamentos`
      : `Reserva ${reservationData.reservation_code} cancelada sem estorno`;

    await logActivity({
      actionType: "cancelled",
      entityType: "reservation",
      entityId: reservationData.id,
      entityCode: reservationData.reservation_code ?? undefined,
      description,
      oldValues: {
        status: "active",
        payment_status: reservationData.payment_status,
        paid_amount: reservationData.paid_amount || 0,
      },
      newValues: {
        status: "cancelled",
        payment_status: reservationData.refundPayments ? "pending" : reservationData.payment_status,
        paid_amount: reservationData.refundPayments ? 0 : reservationData.paid_amount || 0,
      },
      metadata: {
        refund_payments: reservationData.refundPayments || false,
        cancellation_reason: reservationData.cancellation_reason,
      },
    });
  } catch (logError) {
    console.error("runAfterReservationCancelled: activity log", logError);
  }

  if (reservationData.originalStatus === "preregistration") {
    try {
      const establishmentId = reservationData.establishment_id || getSelectedEstablishmentId();
      if (establishmentId) {
        const guestName =
          reservationData.guest?.full_name ||
          reservationData.financial_responsible?.full_name ||
          reservationData.guest_name ||
          "Hóspede";
        await supabase.rpc("create_notification_for_establishment", {
          p_establishment_id: establishmentId,
          p_type: "reservation_cancelled",
          p_title: "Pré-reserva Cancelada",
          p_message: `Pré-reserva ${reservationData.reservation_code || ""} de ${guestName} foi cancelada${
            reservationData.cancellation_reason ? ": " + reservationData.cancellation_reason : ""
          }`,
          p_priority: "medium",
          p_metadata: {
            reservation_id: reservationData.id,
            reservation_code: reservationData.reservation_code,
            cancellation_reason: reservationData.cancellation_reason,
            was_preregistration: true,
          },
        });
      }
    } catch (notificationError) {
      console.error("runAfterReservationCancelled: notificação", notificationError);
    }
  }

  try {
    await maybeFinalizeOtaCancellationAfterPmsCancel(reservationData.id);
  } catch (finalizeErr) {
    console.warn("runAfterReservationCancelled: finalização OTA", finalizeErr);
  }

  try {
    await triggerEmail("reservation.cancelled", reservationData);
  } catch (emailError) {
    console.error("runAfterReservationCancelled: e-mail", emailError);
  }

  try {
    const establishmentId = reservationData.establishment_id || getSelectedEstablishmentId();
    await enqueueBookingCancelled({
      establishmentId,
      reservationId: reservationData.id,
      reservationCode: reservationData.reservation_code,
      clientId: reservationData.client_id || reservationData.guest_id || null,
      guestName:
        reservationData.guest?.full_name ||
        reservationData.financial_responsible?.full_name ||
        reservationData.guest_name ||
        null,
    });
  } catch (crmError) {
    console.warn("runAfterReservationCancelled: CRM outbox", crmError);
  }
}