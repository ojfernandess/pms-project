/** Soma taxas de serviço vinculadas à reserva (limpeza, estacionamento, etc.). */
export function sumReservationServiceFees(
  fees: Array<{ amount?: unknown; quantity?: unknown }> | null | undefined,
): number {
  if (!Array.isArray(fees) || fees.length === 0) return 0;
  return fees.reduce((sum, fee) => {
    const amount = Number(fee?.amount || 0);
    const quantity = Number(fee?.quantity || 1);
    return sum + amount * (Number.isFinite(quantity) && quantity > 0 ? quantity : 1);
  }, 0);
}

/** Base para multa: diárias + taxas inclusas. */
export function cancellationBaseAmount(lodgingTotal: number, serviceFeesTotal: number): number {
  return Math.max(0, Number(lodgingTotal || 0) + Number(serviceFeesTotal || 0));
}