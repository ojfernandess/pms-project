/** Valor bruto da reserva de hospedagem = diárias (total_amount) + taxas vinculadas. */

export function sumReservationServiceFeeRows(
  rows: Array<{ amount?: number | null; quantity?: number | null }> | null | undefined,
): number {
  return (rows ?? []).reduce(
    (sum, f) => sum + Number(f.amount || 0) * Number(f.quantity || 1),
    0,
  );
}

export function reservationGrossCharge(
  baseTotalAmount: number,
  feeRows: Array<{ amount?: number | null; quantity?: number | null }> | null | undefined,
): number {
  const base = Number(baseTotalAmount || 0);
  return Math.round((base + sumReservationServiceFeeRows(feeRows)) * 100) / 100;
}