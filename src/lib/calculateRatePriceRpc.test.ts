import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  calculateRatePriceWithResilience,
  resetCalculateRatePriceRpcStateForTests,
  getCalculateRatePriceRpcMetrics,
  stableSerializeRpcParams,
} from "./calculateRatePriceRpc";

const sampleParams = {
  p_establishment_id: "b4a0a862-55ea-40ed-a149-a64ebca326be",
  p_category_id: "23cc2732-3ce4-474c-9158-e26b19126975",
  p_pricing_plan_id: "19157640-d6c7-4506-9e1a-55132814f5b3",
  p_date: "2026-05-12",
  p_adults: 1,
  p_children: 0,
};

describe("calculateRatePriceWithResilience", () => {
  beforeEach(() => {
    resetCalculateRatePriceRpcStateForTests();
    vi.useRealTimers();
  });

  it("serializa payload de forma estável para memoização", () => {
    const a = stableSerializeRpcParams(sampleParams);
    const b = stableSerializeRpcParams({
      ...sampleParams,
      p_adults: 1.0,
      p_children: 0,
    });
    expect(a).toBe(b);
  });

  it("com 100 chamadas concorrentes idênticas, executa uma única RPC", async () => {
    let rpcCalls = 0;
    const supabase = {
      rpc: vi.fn(async () => {
        rpcCalls++;
        await new Promise((r) => setTimeout(r, 5));
        return { data: 199.9, error: null };
      }),
    };

    await Promise.all(
      Array.from({ length: 100 }, () =>
        calculateRatePriceWithResilience(supabase as never, sampleParams, { basePrice: 50 })
      )
    );

    expect(rpcCalls).toBe(1);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const m = getCalculateRatePriceRpcMetrics();
    expect(m.totalCalls).toBe(100);
    expect(m.rpcCalls).toBe(1);
    // Coalescing in-flight: a maioria não conta como cacheHits (só dedup pela mesma Promise).
    expect(m.cacheHits).toBe(0);
  });

  it("segunda invocação sequencial com mesmo payload usa cache (TTL)", async () => {
    let rpcCalls = 0;
    const supabase = {
      rpc: vi.fn(async () => {
        rpcCalls++;
        return { data: 55, error: null };
      }),
    };

    await calculateRatePriceWithResilience(supabase as never, sampleParams, { basePrice: 1 });
    await calculateRatePriceWithResilience(supabase as never, sampleParams, { basePrice: 1 });

    expect(rpcCalls).toBe(1);
    expect(getCalculateRatePriceRpcMetrics().cacheHits).toBe(1);
  });

  it("não excede 5 RPCs em paralelo com payloads distintos", async () => {
    let inFlight = 0;
    let peak = 0;
    const supabase = {
      rpc: vi.fn(async (_fn: string, args: { p_date: string }) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 15));
        inFlight--;
        return { data: Number(args.p_date.replace(/-/g, "")) % 1000, error: null };
      }),
    };

    const dates = Array.from({ length: 30 }, (_, i) => ({
      ...sampleParams,
      p_date: `2026-05-${String(i + 1).padStart(2, "0")}`,
    }));

    await Promise.all(
      dates.map((p) => calculateRatePriceWithResilience(supabase as never, p, { basePrice: 0 }))
    );

    expect(peak).toBeLessThanOrEqual(5);
    const m = getCalculateRatePriceRpcMetrics();
    expect(m.maxConcurrentRpcObserved).toBeLessThanOrEqual(5);
  });

  it("circuit breaker: após 3 falhas consecutivas, não dispara novas RPC", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "503", code: "PGRST302" } })),
    };

    const mk = (day: string) => ({
      ...sampleParams,
      p_date: day,
    });

    await calculateRatePriceWithResilience(supabase as never, mk("2026-07-01"), { basePrice: 10 });
    await calculateRatePriceWithResilience(supabase as never, mk("2026-07-02"), { basePrice: 10 });
    await calculateRatePriceWithResilience(supabase as never, mk("2026-07-03"), { basePrice: 10 });

    const rpcAfter3 = supabase.rpc.mock.calls.length;
    expect(rpcAfter3).toBeGreaterThan(0);

    const r4 = await calculateRatePriceWithResilience(supabase as never, mk("2026-07-04"), { basePrice: 10 });
    expect(r4.fallback).toBe(true);
    expect(supabase.rpc.mock.calls.length).toBe(rpcAfter3);
    expect(getCalculateRatePriceRpcMetrics().circuitTrips).toBeGreaterThanOrEqual(1);
  });

  it("mantém compatibilidade de forma de resultado (data numérica + error opcional)", async () => {
    const supabase = {
      rpc: vi.fn(async () => ({ data: 42, error: null })),
    };
    const r = await calculateRatePriceWithResilience(supabase as never, sampleParams, { basePrice: 7 });
    expect(r.error).toBeNull();
    expect(r.data).toBe(42);
    expect(r.fromCache).toBe(false);
    expect(r.fallback).toBe(false);
  });
});
