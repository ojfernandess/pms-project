/**
 * Utilitários de intervalo de datas para o sistema tarifário.
 * Garante máximo de 31 dias por requisição para evitar ERR_INSUFFICIENT_RESOURCES.
 */

import { addDays, eachDayOfInterval, format, startOfDay } from "date-fns";

export const MAX_DAYS_PER_REQUEST = 31;
/** Máximo total de dias permitido — se exceder, abortar e mostrar aviso */
export const MAX_TOTAL_DAYS_ALLOWED = 93;

export interface DateRange {
  start: Date;
  end: Date;
}

export interface CalendarRangeResult {
  /** Range efetivo (limitado ou original) */
  effective: DateRange;
  /** Todos os sub-ranges para requisições em série (se excedeu o limite) */
  chunks: DateRange[];
  /** Quantidade total de dias solicitados */
  totalDays: number;
  /** Se foi truncado (intervalo grande demais) */
  wasTruncated: boolean;
  /** Se excede limite e deve mostrar aviso ao usuário */
  exceedsLimit: boolean;
  /** Se excede MAX_TOTAL_DAYS_ALLOWED — não executar query */
  exceedsMaxAllowed: boolean;
}

/**
 * Calcula o range de calendário e quebra em chunks de no máximo MAX_DAYS_PER_REQUEST.
 * Se o intervalo exceder o limite, retorna chunks para execução em fila.
 */
export function getCalendarRange(startDate: Date, endDate: Date): CalendarRangeResult {
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  const totalDays = Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))) + 1;

  const exceedsMaxAllowed = totalDays > MAX_TOTAL_DAYS_ALLOWED;
  if (exceedsMaxAllowed) {
    return {
      effective: { start, end: addDays(start, MAX_DAYS_PER_REQUEST - 1) },
      chunks: [],
      totalDays,
      wasTruncated: true,
      exceedsLimit: true,
      exceedsMaxAllowed: true,
    };
  }

  if (totalDays <= MAX_DAYS_PER_REQUEST) {
    return {
      effective: { start, end },
      chunks: [{ start, end }],
      totalDays,
      wasTruncated: false,
      exceedsLimit: false,
      exceedsMaxAllowed: false,
    };
  }

  // Quebrar em chunks de MAX_DAYS_PER_REQUEST
  const chunks: DateRange[] = [];
  let currentStart = start;
  while (currentStart <= end) {
    const chunkEnd = addDays(currentStart, MAX_DAYS_PER_REQUEST - 1);
    const actualEnd = chunkEnd > end ? end : chunkEnd;
    chunks.push({ start: currentStart, end: actualEnd });
    currentStart = addDays(currentStart, MAX_DAYS_PER_REQUEST);
  }

  return {
    effective: chunks[0],
    chunks,
    totalDays,
    wasTruncated: true,
    exceedsLimit: true,
    exceedsMaxAllowed: false,
  };
}

/**
 * Retorna os dias formatados (yyyy-MM-dd) para um range.
 */
export function getDateStringsFromRange(range: DateRange): string[] {
  const days = eachDayOfInterval({ start: range.start, end: range.end });
  return days.map((d) => format(d, "yyyy-MM-dd"));
}
