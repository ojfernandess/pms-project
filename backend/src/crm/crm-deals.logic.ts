export type StageLike = {
  id: string;
  stage_key: string;
  is_won: boolean;
  is_lost: boolean;
  position: number;
};

export function resolveDealStatusAfterMove(stage: StageLike): {
  status: "open" | "won" | "lost";
  convertedAt: Date | null;
} {
  if (stage.is_won || stage.stage_key === "won") {
    return { status: "won", convertedAt: new Date() };
  }
  if (stage.is_lost || stage.stage_key === "lost") {
    return { status: "lost", convertedAt: null };
  }
  return { status: "open", convertedAt: null };
}

/** Conversão Etapa 2: apenas vincula reservation existente; não cria reserva. */
export function buildConvertDealPatch(reservationId: string, wonStageId?: string | null) {
  if (!reservationId?.trim()) {
    throw new Error("reservationId is required");
  }
  return {
    reservation_id: reservationId,
    status: "won" as const,
    converted_at: new Date(),
    ...(wonStageId ? { stage_id: wonStageId } : {}),
    updated_at: new Date(),
  };
}

export function defaultPipelineStageSeeds() {
  return [
    { name: "Lead", position: 0, stage_key: "lead", is_won: false, is_lost: false },
    { name: "Qualificado", position: 1, stage_key: "qualified", is_won: false, is_lost: false },
    { name: "Proposta", position: 2, stage_key: "proposal", is_won: false, is_lost: false },
    { name: "Ganho", position: 3, stage_key: "won", is_won: true, is_lost: false },
    { name: "Perdido", position: 4, stage_key: "lost", is_won: false, is_lost: true },
  ];
}
