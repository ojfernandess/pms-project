/**
 * Fases de carregamento escalonado para evitar picos de requisições.
 * Phase 0: rate_plans, rate_calendar (crítico)
 * Phase 1: dynamic_pricing_rules (após ~400ms)
 * Phase 2: rate_restrictions (após ~700ms)
 */

import { useEffect, useState } from "react";

export const STAGGER_PHASE1_MS = 400;
export const STAGGER_PHASE2_MS = 700;

/** Retorna true quando a fase 1 deve habilitar (após delay) */
export function useStaggerPhase1(enabled: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => setReady(true), STAGGER_PHASE1_MS);
    return () => clearTimeout(t);
  }, [enabled]);
  return enabled && ready;
}

/** Retorna true quando a fase 2 deve habilitar (após delay) */
export function useStaggerPhase2(enabled: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => setReady(true), STAGGER_PHASE2_MS);
    return () => clearTimeout(t);
  }, [enabled]);
  return enabled && ready;
}
