/** Após pagamento de orçamento público: quita hospedagem + taxas na reserva e vagas vinculadas. */
// deno-lint-ignore no-explicit-any
export async function settleQuoteLodgingReservationsAfterPayment(
  supabaseClient: any,
  reservationIds: string[],
): Promise<void> {
  if (reservationIds.length === 0) return;

  for (const lodgingId of reservationIds) {
    const { data: res, error: resErr } = await supabaseClient
      .from("reservations")
      .select("total_amount, paid_amount, status")
      .eq("id", lodgingId)
      .single();

    if (resErr || !res) continue;

    const base = Number(res.total_amount || 0);
    const currentPaid = Number(res.paid_amount || 0);

    const { data: feeRows } = await supabaseClient
      .from("reservation_service_fees")
      .select("amount, quantity")
      .eq("reservation_id", lodgingId);

    const feeTotal = (feeRows ?? []).reduce(
      (sum: number, f: { amount?: number; quantity?: number }) =>
        sum + Number(f.amount || 0) * Number(f.quantity || 1),
      0,
    );

    const targetPaid = Math.round((base + feeTotal) * 100) / 100;
    let newPaid = Math.max(currentPaid, targetPaid);
    if (targetPaid > 0 && newPaid > targetPaid + 0.02) {
      newPaid = targetPaid;
    }
    newPaid = Math.round(newPaid * 100) / 100;
    const lodgingFullyPaid = base > 0 && newPaid + 0.02 >= targetPaid;

    const update: Record<string, unknown> = {
      paid_amount: Math.round(newPaid * 100) / 100,
      payment_status: lodgingFullyPaid ? "paid" : newPaid > 0.01 ? "partial" : "pending",
    };
    if (lodgingFullyPaid && res.status !== "checkedin") {
      update.status = "confirmed";
    }

    await supabaseClient.from("reservations").update(update).eq("id", lodgingId);

    const { data: parkingRows } = await supabaseClient
      .from("reservations")
      .select("id")
      .eq("lodging_reservation_id", lodgingId);

    for (const parking of parkingRows ?? []) {
      if (!lodgingFullyPaid) continue;
      await supabaseClient
        .from("reservations")
        .update({ payment_status: "paid", status: "confirmed" })
        .eq("id", parking.id);
    }
  }
}