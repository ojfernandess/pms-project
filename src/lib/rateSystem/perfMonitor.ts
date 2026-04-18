/**
 * Monitor de performance para queries tarifárias.
 * Registra: tempo de query, linhas retornadas, uso de memória (estimado).
 */

const LOG_PREFIX = "[RateSystem Perf]";

export interface PerfMetrics {
  queryName: string;
  startTime: number;
  endTime?: number;
  rows?: number;
  error?: string;
}

const BYTES_PER_ROW_ESTIMATE = 300;

function estimatedMemoryKb(rows: number): number {
  return Math.round((rows * BYTES_PER_ROW_ESTIMATE) / 1024);
}

export function createPerfMonitor(queryName: string) {
  const start = performance.now();
  return {
    finish(rows?: number, error?: string) {
      const end = performance.now();
      const duration = Math.round(end - start);
      const memKb = rows != null ? estimatedMemoryKb(rows) : 0;
      const msg = error
        ? `${queryName} failed in ${duration}ms: ${error}`
        : `${queryName} took ${duration}ms, rows=${rows ?? "?"}${memKb > 0 ? `, ~${memKb}KB` : ""}`;
      if (import.meta.env.DEV || duration > 2000 || (rows != null && rows > 1000)) {
        console.info(`${LOG_PREFIX} ${msg}`);
      }
    },
  };
}

export function logPerfSummary(metrics: PerfMetrics[]): void {
  const total = metrics.reduce((acc, m) => acc + (m.endTime ? m.endTime - m.startTime : 0), 0);
  const totalRows = metrics.reduce((acc, m) => acc + (m.rows ?? 0), 0);
  console.info(`${LOG_PREFIX} Summary: ${metrics.length} queries, ${Math.round(total)}ms total, ${totalRows} rows`);
}
