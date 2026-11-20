/**
 * k6 — carga em POST /reservations/lock (RPC create_reservation_with_lock via Nest).
 *
 * Variáveis de ambiente:
 *   PMS_API_URL          ex. https://api.example.com ou http://localhost:3000
 *   PMS_ESTABLISHMENT_ID uuid
 *   PMS_CATEGORY_ID      uuid (obrigatório se PMS_ROOM_ID vazio)
 *   PMS_ROOM_ID          uuid opcional — modo "contention" usa o mesmo quarto
 *   PMS_BENCH_MODE       throughput | contention (default throughput)
 *   PMS_VUS              default 10
 *   PMS_DURATION         default 30s
 *
 * Uso:
 *   k6 run -e PMS_API_URL=http://localhost:3000 -e PMS_ESTABLISHMENT_ID=... -e PMS_CATEGORY_ID=... docs/performance/k6/reservation-lock.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";

const lockDuration = new Trend("reservation_lock_duration", true);
const lockSuccess = new Rate("reservation_lock_success");
const lockConflict = new Counter("reservation_lock_conflict");

const baseUrl = (__ENV.PMS_API_URL || "http://localhost:3000").replace(/\/$/, "");
const establishmentId = __ENV.PMS_ESTABLISHMENT_ID;
const categoryId = __ENV.PMS_CATEGORY_ID;
const roomId = __ENV.PMS_ROOM_ID || null;
const mode = (__ENV.PMS_BENCH_MODE || "throughput").toLowerCase();

export const options = {
  vus: Number(__ENV.PMS_VUS || 10),
  duration: __ENV.PMS_DURATION || "30s",
  thresholds: {
    reservation_lock_duration: ["p(95)<2000"],
    http_req_failed: ["rate<0.5"],
  },
};

function addDays(isoDate, days) {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function payloadForVu(vu, iter) {
  const offset = mode === "contention" ? 0 : vu * 400 + iter;
  const checkin = addDays("2030-06-01", offset);
  const checkout = addDays(checkin, 2);
  const guestSuffix = `${vu}-${iter}-${Date.now()}`;

  return {
    p_reservation_data: {
      establishment_id: establishmentId,
      category_id: categoryId,
      room_id: roomId,
      guest_name: `k6-bench-${guestSuffix}`,
      adults: 1,
      children: 0,
      total_amount: 100,
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

export function setup() {
  if (!establishmentId || !categoryId) {
    throw new Error("Defina PMS_ESTABLISHMENT_ID e PMS_CATEGORY_ID");
  }
  return { baseUrl };
}

export default function () {
  const body = JSON.stringify(payloadForVu(__VU, __ITER));
  const res = http.post(`${baseUrl}/reservations/lock`, body, {
    headers: { "Content-Type": "application/json" },
    tags: { name: "reservation_lock" },
  });

  lockDuration.add(res.timings.duration);

  let parsed = {};
  try {
    parsed = res.json();
  } catch {
    /* ignore */
  }

  const ok = res.status === 200 || res.status === 201;
  const businessOk = Boolean(parsed?.success);
  lockSuccess.add(businessOk);

  const errText = String(parsed?.error || "");
  if (!businessOk && /indispon|conflit|lock|ocupad/i.test(errText)) {
    lockConflict.add(1);
  }

  check(res, {
    "http 2xx": () => ok,
  });

  sleep(0.05);
}

export function handleSummary(data) {
  const p95 = data.metrics?.reservation_lock_duration?.values?.["p(95)"];
  const count = data.metrics?.reservation_lock_success?.values?.passes;
  const fails = data.metrics?.reservation_lock_success?.values?.fails;
  const conflicts = data.metrics?.reservation_lock_conflict?.values?.count;
  const text = [
    "=== reservation-lock k6 ===",
    `p95 lock: ${p95 != null ? Math.round(p95) + "ms" : "n/a"}`,
    `success passes/fails: ${count ?? 0}/${fails ?? 0}`,
    `conflict signals: ${conflicts ?? 0}`,
    "Copie estes números para docs/performance/BENCHMARK_RESULTS.md",
  ].join("\n");
  return {
    stdout: text + "\n",
  };
}