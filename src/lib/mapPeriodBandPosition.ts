import { addDays, differenceInDays, format, parseISO, startOfDay } from "date-fns";

/** Posição de uma faixa contínua no grid do mapa (check-out exclusivo). */
export function getMapPeriodBandPosition(
  visibleDates: Date[],
  periodStartYmd: string,
  checkoutExclusiveYmd: string,
): { startIndex: number; duration: number; isVisible: boolean } {
  if (!visibleDates.length || !periodStartYmd || !checkoutExclusiveYmd) {
    return { startIndex: -1, duration: 0, isVisible: false };
  }

  const checkin = startOfDay(parseISO(periodStartYmd));
  const checkout = startOfDay(parseISO(checkoutExclusiveYmd));
  if (checkout <= checkin) {
    return { startIndex: -1, duration: 0, isVisible: false };
  }

  const firstVisible = startOfDay(visibleDates[0]);
  const lastVisible = startOfDay(visibleDates[visibleDates.length - 1]);

  if (checkout <= firstVisible || checkin > lastVisible) {
    return { startIndex: -1, duration: 0, isVisible: false };
  }

  let startIndex = visibleDates.findIndex((d) => format(startOfDay(d), "yyyy-MM-dd") === periodStartYmd);
  if (startIndex === -1 && checkin < firstVisible) {
    startIndex = 0;
  }
  if (startIndex === -1) {
    return { startIndex: -1, duration: 0, isVisible: false };
  }

  const actualStart = checkin < firstVisible ? firstVisible : checkin;
  const cappedCheckout =
    checkout > addDays(lastVisible, 1) ? addDays(lastVisible, 1) : checkout;

  let duration = differenceInDays(cappedCheckout, startOfDay(actualStart));
  if (duration <= 0) duration = 1;

  const maxDuration = visibleDates.length - startIndex;
  duration = Math.min(duration, maxDuration);

  return {
    startIndex,
    duration,
    isVisible: duration > 0 && startIndex >= 0,
  };
}