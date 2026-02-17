/**
 * Hook para carregamento progressivo do calendário tarifário conforme scroll.
 * Scroll horizontal → carrega próximos dias.
 * Nunca carrega 365 dias de uma vez.
 */

import { useState, useCallback, useMemo } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { MAX_DAYS_PER_REQUEST } from "./calendarRangeUtils";

export interface LazyCalendarRangeState {
  /** Intervalo atualmente carregado/visível */
  loadedStart: Date;
  loadedEnd: Date;
  /** Total de dias carregados */
  loadedDays: number;
  /** Se há mais dias à direita para carregar */
  hasMoreRight: boolean;
  /** Se há mais dias à esquerda para carregar */
  hasMoreLeft: boolean;
}

const INITIAL_WINDOW_DAYS = 31;

export interface UseLazyCalendarRangeOptions {
  /** Data inicial de exibição */
  initialStart: Date;
  /** Extensão total do calendário em dias (ex: 365) */
  totalCalendarDays: number;
  /** Callback chamado quando o usuário precisa carregar mais à direita */
  onLoadMoreRight?: (start: Date, end: Date) => void;
  /** Callback chamado quando o usuário precisa carregar mais à esquerda */
  onLoadMoreLeft?: (start: Date, end: Date) => void;
}

/**
 * Gerencia o range visível do calendário para lazy loading.
 * Útil para grids que exibem o calendário com scroll horizontal.
 */
export function useLazyCalendarRange({
  initialStart,
  totalCalendarDays,
  onLoadMoreRight,
  onLoadMoreLeft,
}: UseLazyCalendarRangeOptions): [
  LazyCalendarRangeState,
  { loadRight: () => void; loadLeft: () => void; reset: () => void }
] {
  const [loadedStart, setLoadedStart] = useState(() => startOfDay(initialStart));
  const [loadedEnd, setLoadedEnd] = useState(() =>
    addDays(startOfDay(initialStart), INITIAL_WINDOW_DAYS - 1)
  );

  const calendarEnd = useMemo(
    () => addDays(startOfDay(initialStart), totalCalendarDays - 1),
    [initialStart, totalCalendarDays]
  );
  const calendarStart = startOfDay(initialStart);

  const loadedDays = useMemo(() => {
    return Math.ceil((loadedEnd.getTime() - loadedStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }, [loadedStart, loadedEnd]);

  const hasMoreRight = loadedEnd < calendarEnd;
  const hasMoreLeft = loadedStart > calendarStart;

  const loadRight = useCallback(() => {
    if (!hasMoreRight || !onLoadMoreRight) return;
    const nextStart = addDays(loadedEnd, 1);
    const nextEnd = addDays(nextStart, MAX_DAYS_PER_REQUEST - 1);
    const clampedEnd = nextEnd > calendarEnd ? calendarEnd : nextEnd;
    onLoadMoreRight(nextStart, clampedEnd);
    setLoadedEnd(clampedEnd);
  }, [hasMoreRight, onLoadMoreRight, loadedEnd, calendarEnd]);

  const loadLeft = useCallback(() => {
    if (!hasMoreLeft || !onLoadMoreLeft) return;
    const nextEnd = addDays(loadedStart, -1);
    const nextStart = addDays(nextEnd, -(MAX_DAYS_PER_REQUEST - 1));
    const clampedStart = nextStart < calendarStart ? calendarStart : nextStart;
    onLoadMoreLeft(clampedStart, nextEnd);
    setLoadedStart(clampedStart);
  }, [hasMoreLeft, onLoadMoreLeft, loadedStart, calendarStart]);

  const reset = useCallback(() => {
    setLoadedStart(startOfDay(initialStart));
    setLoadedEnd(addDays(startOfDay(initialStart), INITIAL_WINDOW_DAYS - 1));
  }, [initialStart]);

  const state: LazyCalendarRangeState = {
    loadedStart,
    loadedEnd,
    loadedDays,
    hasMoreRight,
    hasMoreLeft,
  };

  return [state, { loadRight, loadLeft, reset }];
}
