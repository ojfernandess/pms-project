export type LoyaltyTier = {
  key: string;
  name: string;
  min_points: number;
};

export const DEFAULT_LOYALTY_TIERS: LoyaltyTier[] = [
  { key: "bronze", name: "Bronze", min_points: 0 },
  { key: "silver", name: "Prata", min_points: 500 },
  { key: "gold", name: "Ouro", min_points: 1500 },
  { key: "platinum", name: "Platinum", min_points: 4000 },
];

export function parseTiers(raw: unknown): LoyaltyTier[] {
  if (!Array.isArray(raw) || !raw.length) return DEFAULT_LOYALTY_TIERS;
  return (raw as LoyaltyTier[])
    .filter((t) => t && typeof t.key === "string")
    .map((t) => ({
      key: String(t.key),
      name: String(t.name || t.key),
      min_points: Number(t.min_points) || 0,
    }))
    .sort((a, b) => a.min_points - b.min_points);
}

/** Resolve faixa pelo lifetime points (maior min_points atingido). */
export function resolveTierKey(lifetimePoints: number, tiers: LoyaltyTier[]): string {
  const sorted = [...tiers].sort((a, b) => a.min_points - b.min_points);
  let key = sorted[0]?.key || "bronze";
  for (const t of sorted) {
    if (lifetimePoints >= t.min_points) key = t.key;
  }
  return key;
}

/** Pontos = floor(amount * pointsPerCurrency). Não aplica desconto em reserva. */
export function computeEarnPoints(amount: number, pointsPerCurrency: number): number {
  const rate = Number.isFinite(pointsPerCurrency) ? pointsPerCurrency : 0;
  const value = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return Math.floor(value * rate * 100) / 100;
}

export function buildLoyaltyIdempotencyKey(input: {
  contactId: string;
  reservationId?: string | null;
  txType: string;
}): string {
  if (input.reservationId) {
    return `loyalty:${input.txType}:${input.contactId}:${input.reservationId}`;
  }
  return `loyalty:${input.txType}:${input.contactId}:${Date.now()}`;
}
