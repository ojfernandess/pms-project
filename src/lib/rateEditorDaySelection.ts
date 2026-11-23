import { addDays, differenceInDays, format, getDay, parseISO, startOfDay } from "date-fns";

export type RateDateSelectionMode = "all" | "weekdays" | "specific";

export const RATE_WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

const MAX_INCLUSIVE_DAYS = 366;

export function eachDateStringInRange(start: Date, end: Date): string[] {
  const s = startOfDay(start);
  const e = startOfDay(end);
  if (s > e) return [];
  const count = differenceInDays(e, s) + 1;
  if (count > MAX_INCLUSIVE_DAYS) {
    return eachDateStringInRange(s, addDays(s, MAX_INCLUSIVE_DAYS - 1));
  }
  const out: string[] = [];
  let cur = s;
  while (cur <= e) {
    out.push(format(cur, "yyyy-MM-dd"));
    cur = addDays(cur, 1);
  }
  return out;
}

export function weekdayIndexFromDateStr(dateStr: string): number {
  return getDay(parseISO(dateStr));
}

export function filterDatesBySelection(
  allDatesInRange: string[],
  mode: RateDateSelectionMode,
  selectedWeekdays: Set<number>,
  specificDates: Set<string>,
): string[] {
  if (mode === "all") return allDatesInRange;
  if (mode === "specific") {
    return allDatesInRange.filter((d) => specificDates.has(d));
  }
  return allDatesInRange.filter((d) => selectedWeekdays.has(weekdayIndexFromDateStr(d)));
}

export function validateRateDateSelection(params: {
  startDate: Date;
  endDate: Date;
  mode: RateDateSelectionMode;
  selectedWeekdays: Set<number>;
  specificDates: Set<string>;
}): string | null {
  const { startDate, endDate, mode, selectedWeekdays, specificDates } = params;
  if (startDate > endDate) return "A data inicial deve ser anterior ou igual à data final.";
  const span = differenceInDays(endDate, startDate) + 1;
  if (span > MAX_INCLUSIVE_DAYS) return `Selecione um período de até ${MAX_INCLUSIVE_DAYS} dias.`;
  const all = eachDateStringInRange(startDate, endDate);
  const applicable = filterDatesBySelection(all, mode, selectedWeekdays, specificDates);
  if (applicable.length === 0) return "Selecione ao menos uma data para aplicar a tarifa.";
  if (mode === "weekdays" && selectedWeekdays.size === 0) {
    return "Marque ao menos um dia da semana.";
  }
  if (mode === "specific" && specificDates.size === 0) {
    return "Selecione ao menos uma data específica.";
  }
  return null;
}

export function parseOptionalMoney(value: string | undefined): number | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const n = Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

export function pruneSpecificDatesInRange(
  specificDates: Set<string>,
  start: Date,
  end: Date,
): Set<string> {
  const allowed = new Set(eachDateStringInRange(start, end));
  return new Set([...specificDates].filter((d) => allowed.has(d)));
}

export function pruneSpecificDatePricesInRange(
  prices: Record<string, string>,
  start: Date,
  end: Date,
): Record<string, string> {
  const allowed = new Set(eachDateStringInRange(start, end));
  const next: Record<string, string> = {};
  for (const [d, v] of Object.entries(prices)) {
    if (allowed.has(d)) next[d] = v;
  }
  return next;
}

export function hasPerDateSpecificPrices(specificDatePrices: Record<string, string>): boolean {
  return Object.values(specificDatePrices).some((v) => parseOptionalMoney(v) != null);
}

export function allSelectedDatesHaveIndividualPrices(
  dates: string[],
  specificDatePrices: Record<string, string>,
): boolean {
  if (dates.length === 0) return false;
  return dates.every((d) => parseOptionalMoney(specificDatePrices[d]) != null);
}

/**
 * Prioridade (mockup criar tarifário):
 * exceção → valor individual da data (modo específico) → preço por dia da semana → valor geral.
 */
export function resolveCreateBasePriceForDate(
  dateStr: string,
  opts: {
    mode: RateDateSelectionMode;
    generalPrice: number | null;
    useWeeklyPrices: boolean;
    weeklyByDow: Partial<Record<number, number>>;
    specificDatePrices: Record<string, string>;
    exceptions: Record<string, number>;
  },
): number | null {
  const dow = weekdayIndexFromDateStr(dateStr);

  if (Object.prototype.hasOwnProperty.call(opts.exceptions, dateStr)) {
    const ex = opts.exceptions[dateStr];
    if (Number.isFinite(ex) && ex > 0) return ex;
  }

  if (opts.mode === "specific") {
    const individual = parseOptionalMoney(opts.specificDatePrices[dateStr]);
    if (individual != null) return individual;
  }

  if (opts.useWeeklyPrices) {
    const w = opts.weeklyByDow[dow];
    if (w != null && w > 0) return w;
  }

  if (opts.generalPrice != null && opts.generalPrice > 0) return opts.generalPrice;
  return null;
}

/** Edição em lote: valor por data (somente substituir) tem prioridade sobre o ajuste geral. */
export function resolveBulkAdjustedPrice(
  currentPrice: number,
  adjustmentType: "percentage" | "fixed" | "replace",
  adjustmentValue: number,
  dateStr: string,
  mode: RateDateSelectionMode,
  specificDatePrices: Record<string, string>,
): number {
  if (mode === "specific") {
    const perDate = parseOptionalMoney(specificDatePrices[dateStr]);
    if (perDate != null) return perDate;
  }

  let newPrice = currentPrice;
  if (adjustmentType === "percentage") {
    newPrice = currentPrice * (1 + adjustmentValue / 100);
  } else if (adjustmentType === "fixed") {
    newPrice = currentPrice + adjustmentValue;
  } else {
    newPrice = adjustmentValue;
  }
  return Math.max(0, Math.round(newPrice * 100) / 100);
}

export function validateCreatePlanPricing(params: {
  mode: RateDateSelectionMode;
  applicableDates: string[];
  useWeeklyPrices: boolean;
  generalPrice: number | null;
  specificDatePrices: Record<string, string>;
  isDerivedPlan: boolean;
}): string | null {
  const { mode, applicableDates, useWeeklyPrices, generalPrice, specificDatePrices, isDerivedPlan } =
    params;
  if (isDerivedPlan) return null;

  if (useWeeklyPrices) return null;

  if (
    mode === "specific" &&
    allSelectedDatesHaveIndividualPrices(applicableDates, specificDatePrices)
  ) {
    return null;
  }

  if (generalPrice != null && generalPrice > 0) return null;

  if (mode === "specific") {
    return "Informe o valor geral da diária ou preencha um valor para cada data selecionada.";
  }
  return "Informe o valor da diária.";
}

export function validateBulkSpecificDatePrices(
  mode: RateDateSelectionMode,
  specificDatePrices: Record<string, string>,
  adjustmentTypes: Array<"percentage" | "fixed" | "replace">,
): string | null {
  if (mode !== "specific" || !hasPerDateSpecificPrices(specificDatePrices)) return null;
  const invalid = adjustmentTypes.some((t) => t !== "replace");
  if (invalid) {
    return "Para preços individuais por data, use o tipo Substituir valor (R$).";
  }
  return null;
}