/** Rastreio leve por etapa (dev/tools); não envia PII. */

export type ReservationTraceSpan = {
  name: string;
  ms: number;
};

const spans: ReservationTraceSpan[] = [];
const RING_KEY = "pms.reservationOperationTrace";
const RING_MAX = 40;

function pushRing(entry: { operation: string; ms: number; at: string }) {
  if (typeof sessionStorage === "undefined") return;
  try {
    const raw = sessionStorage.getItem(RING_KEY);
    const list: typeof entry[] = raw ? (JSON.parse(raw) as typeof entry[]) : [];
    list.push(entry);
    while (list.length > RING_MAX) list.shift();
    sessionStorage.setItem(RING_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function readReservationTraceRing(): Array<{ operation: string; ms: number; at: string }> {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(RING_KEY);
    return raw ? (JSON.parse(raw) as Array<{ operation: string; ms: number; at: string }>) : [];
  } catch {
    return [];
  }
}

export function startReservationTrace(operation: string): () => void {
  const start = performance.now();
  const op = operation;
  return () => {
    const ms = Math.round(performance.now() - start);
    spans.push({ name: op, ms });
    pushRing({ operation: op, ms, at: new Date().toISOString() });
    if (import.meta.env.DEV && ms > 800) {
      console.info(`[reservation-trace] ${op} ${ms}ms`);
    }
  };
}

export function peekReservationTraces(): ReservationTraceSpan[] {
  return [...spans];
}

export function clearReservationTraces(): void {
  spans.length = 0;
}

export type ReservationTraceSummary = {
  operation: string;
  count: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
};

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  const idx = Math.max(0, Math.min(sortedAsc.length - 1, rank));
  return sortedAsc[idx] ?? 0;
}

/** Agrega latências do ring buffer (útil para comparar antes/depois das fases C++). */
export function summarizeReservationTraceRing(
  entries: Array<{ operation: string; ms: number; at: string }> = readReservationTraceRing(),
): ReservationTraceSummary[] {
  const byOperation = new Map<string, number[]>();
  for (const entry of entries) {
    const list = byOperation.get(entry.operation) ?? [];
    list.push(entry.ms);
    byOperation.set(entry.operation, list);
  }

  return [...byOperation.entries()]
    .map(([operation, durations]) => {
      const sorted = [...durations].sort((a, b) => a - b);
      return {
        operation,
        count: sorted.length,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        max: sorted[sorted.length - 1] ?? 0,
      };
    })
    .sort((a, b) => a.operation.localeCompare(b.operation));
}

export function formatReservationTraceReport(
  entries: Array<{ operation: string; ms: number; at: string }> = readReservationTraceRing(),
): string {
  const lines = summarizeReservationTraceRing(entries).map(
    (row) =>
      `${row.operation}\tcount=${row.count}\tp50=${row.p50}ms\tp95=${row.p95}ms\tp99=${row.p99}ms\tmax=${row.max}ms`,
  );
  return lines.length ? lines.join("\n") : "(sem amostras no sessionStorage)";
}

export function clearReservationTraceRing(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(RING_KEY);
  } catch {
    /* ignore */
  }
}

declare global {
  interface Window {
    __pmsReservationPerf?: {
      readRing: typeof readReservationTraceRing;
      summarize: typeof summarizeReservationTraceRing;
      report: typeof formatReservationTraceReport;
      clear: typeof clearReservationTraceRing;
    };
  }
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  window.__pmsReservationPerf = {
    readRing: readReservationTraceRing,
    summarize: summarizeReservationTraceRing,
    report: formatReservationTraceReport,
    clear: clearReservationTraceRing,
  };
}