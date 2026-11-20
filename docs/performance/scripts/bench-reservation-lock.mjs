#!/usr/bin/env node
/**
 * Benchmark Node (sem k6) — POST /reservations/lock em paralelo.
 *
 * Env:
 *   PMS_API_URL, PMS_ESTABLISHMENT_ID, PMS_CATEGORY_ID
 *   PMS_ROOM_ID (opcional)
 *   PMS_BENCH_ITERATIONS (default 20)
 *   PMS_BENCH_CONCURRENCY (default 5)
 *   PMS_BENCH_MODE=throughput|contention
 */

const baseUrl = (process.env.PMS_API_URL || "http://localhost:3000").replace(/\/$/, "");
const establishmentId = process.env.PMS_ESTABLISHMENT_ID;
const categoryId = process.env.PMS_CATEGORY_ID;
const roomId = process.env.PMS_ROOM_ID || null;
const iterations = Number(process.env.PMS_BENCH_ITERATIONS || 20);
const concurrency = Number(process.env.PMS_BENCH_CONCURRENCY || 5);
const mode = (process.env.PMS_BENCH_MODE || "throughput").toLowerCase();

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function payloadForIndex(i) {
  const offset = mode === "contention" ? 0 : i * 3;
  const checkin = addDays("2030-08-01", offset);
  const checkout = addDays(checkin, 2);
  return {
    p_reservation_data: {
      establishment_id: establishmentId,
      category_id: categoryId,
      room_id: roomId,
      guest_name: `node-bench-${i}-${Date.now()}`,
      adults: 1,
      children: 0,
      total_amount: 120,
      paid_amount: 0,
      payment_status: "pending",
      status: "pending",
      channel: "direct",
    },
    p_checkin_date: checkin,
    p_checkout_date: checkout,
    p_establishment_id: establishmentId,
    p_room_id: roomId,
    p_category_id: categoryId,
  };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function oneLock(i) {
  const started = performance.now();
  const res = await fetch(`${baseUrl}/reservations/lock`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadForIndex(i)),
  });
  const ms = Math.round(performance.now() - started);
  const body = await res.json().catch(() => ({}));
  return {
    ms,
    httpOk: res.ok,
    success: Boolean(body?.success),
    error: body?.error,
    reservationId: body?.reservation_id,
  };
}

async function runPool() {
  if (!establishmentId || !categoryId) {
    console.error("Defina PMS_ESTABLISHMENT_ID e PMS_CATEGORY_ID");
    process.exit(1);
  }

  const results = [];
  let next = 0;

  async function worker() {
    while (next < iterations) {
      const i = next++;
      results.push(await oneLock(i));
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  const durations = results.map((r) => r.ms).sort((a, b) => a - b);
  const successes = results.filter((r) => r.success).length;
  const conflicts = results.filter(
    (r) => !r.success && /indispon|conflit|lock|ocupad/i.test(String(r.error || "")),
  ).length;

  console.log("=== bench-reservation-lock ===");
  console.log(`url=${baseUrl} mode=${mode} n=${results.length} concurrency=${concurrency}`);
  console.log(
    `p50=${percentile(durations, 50)}ms p95=${percentile(durations, 95)}ms max=${durations.at(-1)}ms`,
  );
  console.log(`success=${successes} fail=${results.length - successes} conflicts=${conflicts}`);
  console.log("Registre em docs/performance/BENCHMARK_RESULTS.md");

  if (successes === 0 && mode === "throughput") {
    process.exitCode = 1;
  }
}

runPool().catch((err) => {
  console.error(err);
  process.exit(1);
});