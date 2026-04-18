/**
 * Gerenciador de fila de requisições para evitar sobrecarga de recursos.
 * Limita concorrência (2-3 requests simultâneos) e evita ERR_INSUFFICIENT_RESOURCES.
 */

export const DEFAULT_CONCURRENCY = 3;

export interface QueuedRequest<T> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

class RequestQueueService {
  private queue: QueuedRequest<unknown>[] = [];
  private activeCount = 0;
  private concurrency: number;
  private nextId = 0;

  constructor(concurrency = DEFAULT_CONCURRENCY) {
    this.concurrency = concurrency;
  }

  private nextQueueId(): string {
    return `req_${++this.nextId}_${Date.now()}`;
  }

  addRequest<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: this.nextQueueId(),
        execute,
        resolve,
        reject,
      };
      this.queue.push(request as QueuedRequest<unknown>);
      this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const request = this.queue.shift();
    if (!request) return;

    this.activeCount++;
    try {
      const result = await request.execute();
      request.resolve(result);
    } catch (err) {
      request.reject(err);
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }

  setConcurrency(n: number): void {
    this.concurrency = Math.max(1, n);
    while (this.activeCount < this.concurrency && this.queue.length > 0) {
      this.processNext();
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  getActiveCount(): number {
    return this.activeCount;
  }
}

let globalQueue: RequestQueueService | null = null;

export function getRequestQueue(concurrency = DEFAULT_CONCURRENCY): RequestQueueService {
  if (!globalQueue) {
    globalQueue = new RequestQueueService(concurrency);
  }
  return globalQueue;
}
