import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, clientid, clientsecret, x-client-id, x-client-secret",
};

function getHeader(req: Request, names: string[]): string | null {
  for (const n of names) {
    const v = req.headers.get(n);
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function clientIp(req: Request): string | null {
  const direct = getHeader(req, ["CF-Connecting-IP", "cf-connecting-ip", "X-Real-IP", "x-real-ip"]);
  if (direct) return direct;
  const fwd = getHeader(req, ["X-Forwarded-For", "x-forwarded-for"]);
  if (fwd) return fwd.split(",")[0]?.trim() || null;
  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function toNumberOrNull(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function nightsBetween(checkinDate: string, checkoutDate: string): number | null {
  const a = Date.parse(`${checkinDate}T12:00:00Z`);
  const b = Date.parse(`${checkoutDate}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 86400000);
}

/** YYYY-MM-DD — ocupa o quarto na noite de `dateStr` se checkin <= date < checkout (checkout exclusivo). */
function reservationCoversNight(
  checkinDate: string,
  checkoutDate: string,
  dateStr: string,
): boolean {
  return checkinDate <= dateStr && checkoutDate > dateStr;
}

function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function publicAppBaseUrlFromEnv(): string {
  const raw = Deno.env.get("VITE_APP_URL") || Deno.env.get("SITE_URL") || Deno.env.get("PUBLIC_APP_URL") || "";
  return String(raw).trim().replace(/\/$/, "");
}

/** `base_url` opcional na API: apenas origem http(s), até 512 caracteres. */
function normalizeOptionalPublicBaseUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 512) return null;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin.replace(/\/$/, "");
  } catch {
    return null;
  }
}

function buildStayReviewPublicUrl(base: string, locator: string): string {
  const b = base.replace(/\/$/, "");
  const loc = encodeURIComponent(String(locator).trim());
  return `${b}/review/${loc}`;
}

function normalizeOtaGuestAddress(addr: unknown): Record<string, unknown> | null {
  if (!addr || typeof addr !== "object") return null;
  const a = addr as Record<string, unknown>;
  return {
    street: a.line1 ?? a.street ?? null,
    city: a.city ?? null,
    state: a.state ?? null,
    postal_code: a.zipCode ?? a.postal_code ?? null,
    country: a.country ?? null,
    raw: addr,
  };
}

type SupabaseAdmin = ReturnType<typeof createClient>;

async function logApiRequest(
  supabase: SupabaseAdmin,
  row: {
    company_id: string;
    http_method: string;
    action: string | null;
    status_code: number;
    response_snippet: string;
    client_ip: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("company_api_request_logs").insert({
      company_id: row.company_id,
      http_method: row.http_method,
      action: row.action,
      status_code: row.status_code,
      response_snippet: row.response_snippet.slice(0, 500),
      client_ip: row.client_ip,
    });
  } catch (e) {
    console.error("company_api_request_logs insert failed", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ip = clientIp(req);
  const url = new URL(req.url);
  const actionParam = (url.searchParams.get("action") || "me").trim().toLowerCase();

  const respondJson = async (
    companyId: string | null,
    status: number,
    body: Record<string, unknown>,
    logAction: string | null = actionParam,
  ): Promise<Response> => {
    const snippet = JSON.stringify(body).slice(0, 480);
    if (companyId) {
      await logApiRequest(supabase, {
        company_id: companyId,
        http_method: req.method,
        action: logAction,
        status_code: status,
        response_snippet: snippet,
        client_ip: ip,
      });
    }
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  };

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const clientId = getHeader(req, ["ClientId", "clientid", "X-Client-Id", "x-client-id"]);
  const clientSecret = getHeader(req, ["ClientSecret", "clientsecret", "X-Client-Secret", "x-client-secret"]);

  if (!clientId || !clientSecret) {
    return respondJson(null, 401, {
      success: false,
      error: "Credenciais ausentes. Envie ClientId e ClientSecret nos headers.",
    });
  }

  const { data: cred, error: credError } = await supabase
    .from("company_api_credentials")
    .select("company_id, client_secret_hash, is_active")
    .eq("client_id", clientId)
    .maybeSingle();

  if (credError || !cred) {
    return respondJson(null, 401, { success: false, error: "Credenciais inválidas" });
  }

  const companyId = String(cred.company_id);

  if (cred.is_active !== true) {
    return respondJson(companyId, 401, { success: false, error: "Credenciais inválidas" });
  }

  const incomingHash = await sha256Hex(clientSecret);
  if (!constantTimeEqual(incomingHash, String(cred.client_secret_hash ?? ""))) {
    return respondJson(companyId, 401, { success: false, error: "Credenciais inválidas" });
  }

  const { data: featureEnabled } = await supabase.rpc("company_has_feature_access", {
    p_feature_key: "api_integrations",
    p_company_id: companyId,
  });

  if (featureEnabled !== true) {
    return respondJson(companyId, 403, {
      success: false,
      error: "Funcionalidade api_integrations desativada para esta empresa",
    });
  }

  await supabase
    .from("company_api_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("company_id", companyId);

  const action = actionParam;

  const parseBody = async (): Promise<Record<string, unknown>> => {
    try {
      const body = await req.json();
      return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };

  const ensureEstablishmentFromCompany = async (
    establishmentId: string,
  ): Promise<{ id: string; company_id: string; name?: string } | null> => {
    const { data: establishment } = await supabase
      .from("establishments")
      .select("id, company_id, name")
      .eq("id", establishmentId)
      .maybeSingle();
    if (!establishment) return null;
    return String(establishment.company_id) === companyId ? establishment : null;
  };

  if (action === "list-reservations") {
    let establishmentId = (url.searchParams.get("establishment_id") || "").trim();
    const page = Math.max(toNumberOrNull(url.searchParams.get("page")) ?? 1, 1);
    const perPage = Math.min(Math.max(toNumberOrNull(url.searchParams.get("per_page")) ?? 20, 1), 200);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    if (!establishmentId) {
      const { data: firstEstablishment } = await supabase
        .from("establishments")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      establishmentId = String(firstEstablishment?.id || "");
    }

    if (!establishmentId) {
      return respondJson(companyId, 400, {
        success: false,
        error: "Nenhum estabelecimento ativo encontrado para esta empresa.",
      });
    }

    const establishment = await ensureEstablishmentFromCompany(establishmentId);
    if (!establishment) {
      return respondJson(companyId, 403, {
        success: false,
        error: "Estabelecimento inválido para esta empresa.",
      });
    }

    let query = supabase
      .from("reservations")
      .select(
        "id, reservation_code, checkin_date, checkout_date, adults, children, status, payment_status, total_amount, paid_amount, notes, channel, created_at, updated_at, room_id, category_id, client_id, guest_id",
        { count: "exact" },
      )
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false });

    const bookingId = (url.searchParams.get("booking_id") || "").trim();
    if (bookingId) query = query.or(`id.eq.${bookingId},reservation_code.eq.${bookingId}`);
    const statusFilter = (url.searchParams.get("status") || "").trim();
    if (statusFilter) query = query.eq("status", statusFilter);
    const checkin = (url.searchParams.get("checkin") || "").trim();
    if (checkin) query = query.gte("checkin_date", checkin);
    const checkout = (url.searchParams.get("checkout") || "").trim();
    if (checkout) query = query.lte("checkout_date", checkout);
    const created = (url.searchParams.get("created") || "").trim();
    if (created) query = query.gte("created_at", `${created}T00:00:00.000Z`);
    const periodOne = (url.searchParams.get("period_one") || "").trim();
    if (periodOne) query = query.gte("checkin_date", periodOne);
    const periodTwo = (url.searchParams.get("period_two") || "").trim();
    if (periodTwo) query = query.lte("checkout_date", periodTwo);

    const { data, error, count } = await query.range(from, to);
    if (error) {
      console.error("list-reservations failed", error);
      return respondJson(companyId, 500, { success: false, error: "Erro ao listar reservas" });
    }

    const total = count ?? 0;
    return respondJson(companyId, 200, {
      success: true,
      action,
      establishment_id: establishmentId,
      current_page: page,
      per_page: perPage,
      total_pages: total > 0 ? Math.ceil(total / perPage) : 0,
      total_bookings: total,
      bookings: data ?? [],
    });
  }

  if (action === "create-reservation") {
    const body = await parseBody();
    const establishmentId = String(body.establishment_id || url.searchParams.get("establishment_id") || "").trim();
    const checkinDate = String(body.arrival_date || body.checkin_date || "").trim();
    const checkoutDate = String(body.departure_date || body.checkout_date || "").trim();
    const rateplanId = String(body.rateplan_id || body.pricing_plan_id || "").trim();
    const adults = Number(body.adults ?? 1);
    const children = Number(body.children ?? 0);
    const totalAmount = Number(body.total_amount ?? body.price_total ?? 0);
    const notes = String(body.comment || body.notes || "").trim() || null;
    const channel = String(body.channel || "api_public").trim() || "api_public";
    const guestRaw = (body.guest && typeof body.guest === "object") ? (body.guest as Record<string, unknown>) : {};
    const roomUnits = Array.isArray(body.room_units) ? (body.room_units as Array<Record<string, unknown>>) : [];

    if (!establishmentId || !checkinDate || !checkoutDate || !rateplanId || !guestRaw.first_name) {
      return respondJson(companyId, 400, {
        success: false,
        error: "Parâmetros obrigatórios: establishment_id, arrival_date, departure_date, rateplan_id e guest.first_name",
      });
    }
    if (!Number.isFinite(adults) || adults < 1 || !Number.isFinite(children) || children < 0) {
      return respondJson(companyId, 400, { success: false, error: "adults/children inválidos" });
    }

    const establishment = await ensureEstablishmentFromCompany(establishmentId);
    if (!establishment) {
      return respondJson(companyId, 403, { success: false, error: "Estabelecimento inválido para esta empresa." });
    }

    const { data: pricingPlan } = await supabase
      .from("pricing_plans")
      .select("id, category_id")
      .eq("id", rateplanId)
      .eq("establishment_id", establishmentId)
      .maybeSingle();
    if (!pricingPlan) {
      return respondJson(companyId, 400, { success: false, error: "rateplan_id inválido para o estabelecimento." });
    }

    const { data: reservationCode } = await supabase.rpc("generate_reservation_code");
    if (!reservationCode) {
      return respondJson(companyId, 500, { success: false, error: "Falha ao gerar código de reserva." });
    }

    const guestFullName = `${String(guestRaw.first_name || "").trim()} ${String(guestRaw.last_name || "").trim()}`.trim();
    const guestEmail = String(guestRaw.email || "").trim() || null;
    const guestPhone = String(guestRaw.phone || "").trim() || null;
    const guestDocumentType = String(guestRaw.document_type || "").trim() || null;
    const guestDocument = String(guestRaw.document || "").trim() || null;

    const { data: clientInserted, error: clientErr } = await supabase
      .from("clients")
      .insert({
        establishment_id: establishmentId,
        full_name: guestFullName || "Hóspede API",
        email: guestEmail,
        phone: guestPhone,
        document_type: guestDocumentType,
        document_number: guestDocument,
      })
      .select("id, full_name, email, phone, document_type, document_number")
      .single();
    if (clientErr || !clientInserted) {
      console.error("create-reservation client insert failed", clientErr);
      return respondJson(companyId, 500, { success: false, error: "Erro ao criar hóspede da reserva." });
    }

    const roomUnit = roomUnits[0] || {};
    const computedTotal = Number.isFinite(totalAmount) && totalAmount > 0 ? totalAmount : Number(roomUnit.price ?? 0);
    const { data: reservationInserted, error: reservationErr } = await supabase
      .from("reservations")
      .insert({
        reservation_code: String(reservationCode),
        establishment_id: establishmentId,
        client_id: clientInserted.id,
        guest_id: clientInserted.id,
        category_id: pricingPlan.category_id,
        pricing_plan_id: pricingPlan.id,
        checkin_date: checkinDate,
        checkout_date: checkoutDate,
        adults,
        children,
        total_amount: Number.isFinite(computedTotal) ? computedTotal : 0,
        paid_amount: 0,
        notes,
        channel,
        status: "pending",
      })
      .select("id, reservation_code, checkin_date, checkout_date, adults, children, status, payment_status, total_amount, paid_amount, notes, channel")
      .single();

    if (reservationErr || !reservationInserted) {
      console.error("create-reservation insert failed", reservationErr);
      return respondJson(companyId, 500, { success: false, error: "Erro ao criar reserva." });
    }

    return respondJson(companyId, 201, {
      success: true,
      action,
      reservation_id: reservationInserted.id,
      reservation_code: reservationInserted.reservation_code,
      message: "Reserva criada com sucesso.",
      booking: reservationInserted,
    });
  }

  if (action === "get-reservation-by-id") {
    let bookingId = (url.searchParams.get("booking_id") || "").trim();
    if (!bookingId && req.method === "POST") {
      try {
        const body = await req.json();
        bookingId = String(body?.booking_id || "").trim();
      } catch {
        // ignore invalid body and rely on validation below
      }
    }

    if (!bookingId) {
      return respondJson(companyId, 400, {
        success: false,
        error: "Parâmetro obrigatório ausente: booking_id",
      });
    }

    const reservationColumns =
      "id, reservation_code, establishment_id, checkin_date, checkout_date, checkin_time, checkout_time, adults, children, status, payment_status, total_amount, paid_amount, notes, channel, pricing_plan_id, category_id, room_id, client_id, guest_id, guest_name, identification_number, expiration_date, coupon_id, pending_resolved_at, pending_resolved_by, cancelled_at, cancelled_by, cancellation_penalty, cancellation_policy_applied, cancellation_reason, cancellation_calculation_details, no_show_at, created_by, created_at, updated_at";

    const reservationBaseQuery = supabase.from("reservations").select(reservationColumns);

    const { data: reservation, error: reservationError } = isUuid(bookingId)
      ? await reservationBaseQuery.or(`id.eq.${bookingId},reservation_code.eq.${bookingId}`).maybeSingle()
      : await reservationBaseQuery.eq("reservation_code", bookingId).maybeSingle();

    if (reservationError) {
      console.error("get-reservation-by-id reservation query failed", reservationError);
      return respondJson(companyId, 500, {
        success: false,
        error: "Erro ao consultar reserva",
      });
    }

    if (!reservation) {
      return respondJson(companyId, 404, {
        success: false,
        error: "Reserva não encontrada",
      });
    }

    if (!reservation.establishment_id) {
      return respondJson(companyId, 404, {
        success: false,
        error: "Reserva não encontrada",
      });
    }

    const { data: establishment } = await supabase
      .from("establishments")
      .select("id, company_id, name")
      .eq("id", reservation.establishment_id)
      .maybeSingle();

    if (!establishment || String(establishment.company_id) !== companyId) {
      return respondJson(companyId, 404, {
        success: false,
        error: "Reserva não encontrada",
      });
    }

    const guestClientId = reservation.guest_id || reservation.client_id;

    const [
      pricingPlanRes,
      categoryRes,
      roomRes,
      responsibleRes,
      guestRes,
      paymentsRes,
      otaReservationRes,
      serviceFeesRes,
      couponRes,
      webCheckinRes,
    ] = await Promise.all([
      reservation.pricing_plan_id
        ? supabase.from("pricing_plans").select("id, name").eq("id", reservation.pricing_plan_id).maybeSingle()
        : Promise.resolve({ data: null }),
      reservation.category_id
        ? supabase.from("room_categories").select("id, name").eq("id", reservation.category_id).maybeSingle()
        : Promise.resolve({ data: null }),
      reservation.room_id
        ? supabase.from("rooms").select("id, room_number, floor, status").eq("id", reservation.room_id).maybeSingle()
        : Promise.resolve({ data: null }),
      reservation.client_id
        ? supabase
            .from("clients")
            .select("id, full_name, email, phone, document_type, document_number, birth_date, nationality, address, city, state, postal_code, country")
            .eq("id", reservation.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      guestClientId
        ? supabase
            .from("clients")
            .select("id, full_name, email, phone, document_type, document_number, birth_date, nationality, address, city, state, postal_code, country")
            .eq("id", guestClientId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("payments")
        .select("id, amount, payment_method, payment_date, notes")
        .eq("reservation_id", reservation.id)
        .order("payment_date", { ascending: false }),
      supabase
        .from("ota_reservations")
        .select(
          "id, ota_channel_id, ota_reservation_code, ota_guest_name, ota_guest_email, ota_guest_phone, ota_source_channel_name, ota_segment, ota_cm_booking_id, ota_special_requests, ota_guest_address, sync_status, synced_at, ota_channels(id, name)",
        )
        .eq("reservation_id", reservation.id)
        .maybeSingle(),
      supabase
        .from("reservation_service_fees")
        .select("id, amount, quantity, notes, service_fee_id, service_fees(id, name, description)")
        .eq("reservation_id", reservation.id),
      reservation.coupon_id
        ? supabase
            .from("discount_coupons")
            .select("id, code, name, description, discount_type, discount_value, apply_to, status, valid_from, valid_until")
            .eq("id", reservation.coupon_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("web_checkin")
        .select("id, status, locator, started_at, completed_at, expires_at, terms_accepted, terms_accepted_at")
        .eq("reservation_id", reservation.id)
        .maybeSingle(),
    ]);

    const totalAmount = Number(reservation.total_amount ?? 0);
    const paidAmount = Number(reservation.paid_amount ?? 0);

    const otaReservation = otaReservationRes.data ?? null;
    const fallbackGuestName = String(otaReservation?.ota_guest_name || "").trim() || null;
    const fallbackGuestEmail = String(otaReservation?.ota_guest_email || "").trim() || null;
    const fallbackGuestPhone = String(otaReservation?.ota_guest_phone || "").trim() || null;
    const otaAddrNorm = normalizeOtaGuestAddress(otaReservation?.ota_guest_address);

    /** Perfil quando não existe linha em `clients` (comum em OTA/channel). Sem campo `id` falso. */
    const otaGuestProfile = fallbackGuestName
      ? {
          source: "ota_reservations",
          has_client_record: false,
          profile_reference: otaReservation?.id
            ? `ota_reservations:${String(otaReservation.id)}`
            : `reservation:${String(reservation.id)}`,
          full_name: fallbackGuestName,
          email: fallbackGuestEmail,
          phone: fallbackGuestPhone,
          document_type: null as string | null,
          document_number: null as string | null,
          address: otaAddrNorm,
        }
      : null;

    const guestFromClient = guestRes.data
      ? {
          ...guestRes.data,
          source: "clients",
          has_client_record: true,
        }
      : null;

    const guestData = guestFromClient ?? otaGuestProfile;

    const responsibleFromClient = responsibleRes.data
      ? {
          ...responsibleRes.data,
          source: "clients",
          has_client_record: true,
        }
      : null;

    const financialResponsibleData = responsibleFromClient ?? (otaGuestProfile ? { ...otaGuestProfile } : null);

    const guestDisplayName =
      (guestData && typeof guestData === "object" && "full_name" in guestData && String((guestData as { full_name?: string }).full_name || "").trim()) ||
      String(reservation.guest_name || "").trim() ||
      fallbackGuestName ||
      null;

    const nights = nightsBetween(String(reservation.checkin_date || ""), String(reservation.checkout_date || ""));

    const hasClientRows = Boolean(reservation.client_id || reservation.guest_id);
    const guestProfileSource = guestFromClient
      ? "clients"
      : otaGuestProfile
        ? "ota_reservations"
        : String(reservation.guest_name || "").trim()
          ? "reservation_guest_name"
          : "unknown";

    return respondJson(companyId, 200, {
      success: true,
      action,
      booking: {
        ...reservation,
        establishment,
        pricing_plan: pricingPlanRes.data ?? null,
        category: categoryRes.data ?? null,
        room: roomRes.data ?? null,
        financial_responsible: financialResponsibleData,
        guest: guestData,
        guest_profile: {
          source: guestProfileSource,
          has_client_record: hasClientRows,
          client_id: reservation.client_id ?? null,
          guest_id: reservation.guest_id ?? null,
          reservation_guest_name: String(reservation.guest_name || "").trim() || null,
          financial_same_as_guest:
            Boolean(otaGuestProfile && !responsibleFromClient) ||
            Boolean(
              reservation.client_id &&
                reservation.guest_id &&
                String(reservation.client_id) === String(reservation.guest_id),
            ),
        },
        guest_display_name: guestDisplayName,
        nights,
        coupon: couponRes.data ?? null,
        service_fees: serviceFeesRes.data ?? [],
        web_checkin: webCheckinRes.data ?? null,
        ota: otaReservation
          ? {
              ota_channel_id: otaReservation.ota_channel_id,
              ota_channel_name: otaReservation.ota_channels?.name ?? otaReservation.ota_source_channel_name ?? null,
              partner_channel_name: otaReservation.ota_source_channel_name ?? null,
              ota_reservation_code: otaReservation.ota_reservation_code,
              cm_booking_id: otaReservation.ota_cm_booking_id ?? null,
              segment: otaReservation.ota_segment ?? null,
              special_requests: otaReservation.ota_special_requests ?? null,
              guest_address: otaReservation.ota_guest_address ?? null,
              sync_status: otaReservation.sync_status ?? null,
              synced_at: otaReservation.synced_at ?? null,
            }
          : null,
        payments: paymentsRes.data ?? [],
        balance_due: Math.max(totalAmount - paidAmount, 0),
      },
    });
  }

  if (action === "web-checkin") {
    const body = await parseBody();
    const bookingId = String(body.booking_id || "").trim();
    if (!bookingId) {
      return respondJson(companyId, 400, { success: false, error: "Parâmetro obrigatório ausente: booking_id" });
    }

    const reservationBaseQuery = supabase
      .from("reservations")
      .select("id, reservation_code, establishment_id");
    const { data: reservation } = isUuid(bookingId)
      ? await reservationBaseQuery.or(`id.eq.${bookingId},reservation_code.eq.${bookingId}`).maybeSingle()
      : await reservationBaseQuery.eq("reservation_code", bookingId).maybeSingle();
    if (!reservation?.establishment_id) {
      return respondJson(companyId, 404, { success: false, error: "Reserva não encontrada" });
    }

    const establishment = await ensureEstablishmentFromCompany(String(reservation.establishment_id));
    if (!establishment) {
      return respondJson(companyId, 404, { success: false, error: "Reserva não encontrada" });
    }

    const guestData = {
      main_guest: body.main_guest ?? null,
      companions: Array.isArray(body.companions) ? body.companions : [],
      vehicle: body.vehicle ?? null,
      notes: body.notes ?? null,
      arrival_time: body.arrival_time ?? null,
      origin_country: body.origin_country ?? null,
      transportation_mode: body.transportation_mode ?? null,
      consents: body.consents ?? null,
    };
    const documents = Array.isArray(body.attachments) ? body.attachments : [];
    const termsAccepted = Boolean((body.consents as Record<string, unknown> | undefined)?.accept_terms);

    const { data: existingWebCheckin } = await supabase
      .from("web_checkin")
      .select("id")
      .eq("reservation_id", reservation.id)
      .maybeSingle();

    const upsertPayload = {
      reservation_id: reservation.id,
      establishment_id: reservation.establishment_id,
      token: existingWebCheckin?.id ? undefined : crypto.randomUUID(),
      locator: existingWebCheckin?.id ? undefined : String(reservation.reservation_code || reservation.id),
      status: "completed",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      guest_data: guestData,
      documents,
      preferences: { source: "company-public-api" },
      terms_accepted: termsAccepted,
      terms_accepted_at: termsAccepted ? new Date().toISOString() : null,
      ip_address: ip,
      user_agent: req.headers.get("user-agent") ?? null,
    };

    const { error: webCheckinError } = existingWebCheckin?.id
      ? await supabase.from("web_checkin").update(upsertPayload).eq("id", existingWebCheckin.id)
      : await supabase.from("web_checkin").insert(upsertPayload);
    if (webCheckinError) {
      console.error("web-checkin upsert failed", webCheckinError);
      return respondJson(companyId, 500, { success: false, error: "Erro ao processar web check-in" });
    }

    return respondJson(companyId, 200, {
      success: true,
      action,
      booking_id: reservation.id,
      reservation_code: reservation.reservation_code,
      checkin_status: "completed",
      message: "Web check-in realizado.",
    });
  }

  if (action === "room-clean-status") {
    const roomId = (url.searchParams.get("room_id") || "").trim();
    if (!roomId) {
      return respondJson(companyId, 400, { success: false, error: "Parâmetro obrigatório ausente: room_id" });
    }

    const { data: room } = await supabase
      .from("rooms")
      .select("id, room_number, floor, status, establishment_id")
      .eq("id", roomId)
      .maybeSingle();
    if (!room?.establishment_id) {
      return respondJson(companyId, 404, { success: false, error: "Quarto não encontrado" });
    }

    const establishment = await ensureEstablishmentFromCompany(String(room.establishment_id));
    if (!establishment) {
      return respondJson(companyId, 404, { success: false, error: "Quarto não encontrado" });
    }

    const cleanStatus = room.status === "cleaning" || room.status === "maintenance" ? "dirty" : "clean";
    return respondJson(companyId, 200, {
      success: true,
      action,
      room_id: room.id,
      room_number: room.room_number,
      floor: room.floor,
      room_status: room.status,
      clean_status: cleanStatus,
    });
  }

  if (action === "list-maintenance") {
    let establishmentId = (url.searchParams.get("establishment_id") || "").trim();
    const page = Math.max(toNumberOrNull(url.searchParams.get("page")) ?? 1, 1);
    const perPage = Math.min(Math.max(toNumberOrNull(url.searchParams.get("per_page")) ?? 50, 1), 200);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    const statusFilter = (url.searchParams.get("status") || "").trim();

    if (!establishmentId) {
      const { data: firstEstablishment } = await supabase
        .from("establishments")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      establishmentId = String(firstEstablishment?.id || "");
    }

    if (!establishmentId) {
      return respondJson(companyId, 400, {
        success: false,
        error: "Nenhum estabelecimento ativo encontrado para esta empresa.",
      });
    }

    const establishment = await ensureEstablishmentFromCompany(establishmentId);
    if (!establishment) {
      return respondJson(companyId, 403, {
        success: false,
        error: "Estabelecimento inválido para esta empresa.",
      });
    }

    let query = supabase
      .from("maintenance_tickets")
      .select("*, rooms:room_id(id, room_number, floor, status)", { count: "exact" })
      .eq("establishment_id", establishmentId)
      .order("created_at", { ascending: false });

    if (statusFilter) query = query.eq("status", statusFilter);

    const { data, error, count } = await query.range(from, to);
    if (error) {
      console.error("list-maintenance failed", error);
      return respondJson(companyId, 500, { success: false, error: "Erro ao listar manutenção" });
    }

    const total = count ?? 0;
    return respondJson(companyId, 200, {
      success: true,
      action,
      establishment_id: establishmentId,
      current_page: page,
      per_page: perPage,
      total_pages: total > 0 ? Math.ceil(total / perPage) : 0,
      total_tickets: total,
      tickets: data ?? [],
    });
  }

  if (action === "list-clients") {
    let establishmentId = (url.searchParams.get("establishment_id") || "").trim();
    const page = Math.max(toNumberOrNull(url.searchParams.get("page")) ?? 1, 1);
    const perPage = Math.min(Math.max(toNumberOrNull(url.searchParams.get("per_page")) ?? 50, 1), 200);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    const search = (url.searchParams.get("search") || "").trim();

    if (!establishmentId) {
      const { data: firstEstablishment } = await supabase
        .from("establishments")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      establishmentId = String(firstEstablishment?.id || "");
    }

    if (!establishmentId) {
      return respondJson(companyId, 400, {
        success: false,
        error: "Nenhum estabelecimento ativo encontrado para esta empresa.",
      });
    }

    const establishment = await ensureEstablishmentFromCompany(establishmentId);
    if (!establishment) {
      return respondJson(companyId, 403, {
        success: false,
        error: "Estabelecimento inválido para esta empresa.",
      });
    }

    let query = supabase
      .from("clients")
      .select(
        "id, establishment_id, full_name, email, phone, document_type, document_number, birth_date, nationality, address, city, state, postal_code, country, notes, created_at, updated_at",
        { count: "exact" },
      )
      .eq("establishment_id", establishmentId)
      .order("full_name", { ascending: true });

    if (search) {
      const esc = search.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      const p = `%${esc}%`;
      query = query.or(`full_name.ilike.${p},email.ilike.${p},phone.ilike.${p}`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) {
      console.error("list-clients failed", error);
      return respondJson(companyId, 500, { success: false, error: "Erro ao listar clientes" });
    }

    const total = count ?? 0;
    return respondJson(companyId, 200, {
      success: true,
      action,
      establishment_id: establishmentId,
      current_page: page,
      per_page: perPage,
      total_pages: total > 0 ? Math.ceil(total / perPage) : 0,
      total_clients: total,
      clients: data ?? [],
    });
  }

  if (action === "occupancy-map") {
    let establishmentId = (url.searchParams.get("establishment_id") || "").trim();
    let dateStr = (url.searchParams.get("date") || "").trim();
    if (req.method === "POST") {
      try {
        const body = await parseBody();
        if (!establishmentId) establishmentId = String(body.establishment_id || "").trim();
        if (!dateStr) dateStr = String(body.date || "").trim();
      } catch {
        // ignore
      }
    }
    if (!dateStr) dateStr = todayUtcYmd();

    if (!establishmentId) {
      const { data: firstEstablishment } = await supabase
        .from("establishments")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      establishmentId = String(firstEstablishment?.id || "");
    }

    if (!establishmentId) {
      return respondJson(companyId, 400, {
        success: false,
        error: "Nenhum estabelecimento ativo encontrado para esta empresa.",
      });
    }

    const establishment = await ensureEstablishmentFromCompany(establishmentId);
    if (!establishment) {
      return respondJson(companyId, 403, {
        success: false,
        error: "Estabelecimento inválido para esta empresa.",
      });
    }

    const { data: roomsData, error: roomsError } = await supabase
      .from("rooms")
      .select(
        "id, room_number, floor, status, category_id, room_categories(id, name, building_id, buildings(id, name))",
      )
      .eq("establishment_id", establishmentId)
      .order("room_number", { ascending: true });

    if (roomsError) {
      console.error("occupancy-map rooms failed", roomsError);
      return respondJson(companyId, 500, { success: false, error: "Erro ao carregar quartos" });
    }

    const { data: reservationsData, error: resErr } = await supabase
      .from("reservations")
      .select(
        "id, reservation_code, room_id, checkin_date, checkout_date, status, guest_name, adults, children, client_id",
      )
      .eq("establishment_id", establishmentId)
      .not("status", "eq", "cancelled")
      .not("room_id", "is", null);

    if (resErr) {
      console.error("occupancy-map reservations failed", resErr);
      return respondJson(companyId, 500, { success: false, error: "Erro ao carregar reservas" });
    }

    const byRoom: Record<string, Record<string, unknown>> = {};
    for (const r of reservationsData ?? []) {
      const rid = r.room_id as string | null;
      if (!rid) continue;
      if (String(r.status) === "noshow") continue;
      const cin = String(r.checkin_date || "");
      const cout = String(r.checkout_date || "");
      if (!reservationCoversNight(cin, cout, dateStr)) continue;

      const prev = byRoom[rid];
      if (!prev) {
        byRoom[rid] = r as unknown as Record<string, unknown>;
        continue;
      }
      const priority: Record<string, number> = {
        checkedin: 4,
        confirmed: 3,
        pending: 2,
        unpaid: 2,
        preregistration: 2,
        blocked: 1,
        checkedout: 1,
        noshow: 0,
      };
      const pNew = priority[String(r.status)] ?? 0;
      const pOld = priority[String(prev.status)] ?? 0;
      if (pNew > pOld) byRoom[rid] = r as unknown as Record<string, unknown>;
    }

    const rooms = (roomsData ?? []).map((room) => {
      const cat = room.room_categories as
        | { id?: string; name?: string; building_id?: string | null; buildings?: { id?: string; name?: string } | null }
        | null
        | undefined;
      const bld = cat?.buildings;
      const buildingId = bld && typeof bld === "object" && "id" in bld ? String((bld as { id?: string }).id ?? "") : null;
      const buildingName = bld && typeof bld === "object" && "name" in bld
        ? String((bld as { name?: string }).name ?? "")
        : null;
      const reservation = byRoom[String(room.id)] ?? null;
      return {
        room_id: room.id,
        room_number: room.room_number,
        floor: room.floor,
        room_status: room.status,
        category_id: cat?.id ?? room.category_id ?? null,
        category_name: cat?.name ?? null,
        building_id: buildingId,
        building_name: buildingName,
        reservation: reservation
          ? {
              id: reservation.id,
              reservation_code: reservation.reservation_code,
              checkin_date: reservation.checkin_date,
              checkout_date: reservation.checkout_date,
              status: reservation.status,
              guest_name: reservation.guest_name ?? null,
              adults: reservation.adults ?? null,
              children: reservation.children ?? null,
            }
          : null,
        occupied: Boolean(reservation),
      };
    });

    const occupiedCount = rooms.filter((x) => x.occupied).length;
    return respondJson(companyId, 200, {
      success: true,
      action,
      establishment_id: establishmentId,
      date: dateStr,
      summary: {
        total_rooms: rooms.length,
        occupied_rooms: occupiedCount,
        available_rooms: rooms.length - occupiedCount,
      },
      rooms,
    });
  }

  if (action === "list-stay-reviews") {
    let establishmentId = (url.searchParams.get("establishment_id") || "").trim();
    const page = Math.max(toNumberOrNull(url.searchParams.get("page")) ?? 1, 1);
    const perPage = Math.min(Math.max(toNumberOrNull(url.searchParams.get("per_page")) ?? 50, 1), 200);
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    const publishedOnly = url.searchParams.get("is_published");
    const submittedFrom = (url.searchParams.get("submitted_from") || "").trim();
    const submittedTo = (url.searchParams.get("submitted_to") || "").trim();

    if (!establishmentId) {
      const { data: firstEstablishment } = await supabase
        .from("establishments")
        .select("id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      establishmentId = String(firstEstablishment?.id || "");
    }

    if (!establishmentId) {
      return respondJson(companyId, 400, {
        success: false,
        error: "Nenhum estabelecimento ativo encontrado para esta empresa.",
      });
    }

    const establishment = await ensureEstablishmentFromCompany(establishmentId);
    if (!establishment) {
      return respondJson(companyId, 403, {
        success: false,
        error: "Estabelecimento inválido para esta empresa.",
      });
    }

    let query = supabase
      .from("stay_reviews")
      .select(
        `
        id,
        reservation_id,
        establishment_id,
        guest_account_id,
        room_rating,
        comfort_rating,
        service_rating,
        cleanliness_rating,
        comment,
        is_published,
        is_anonymous,
        review_type,
        submitted_at,
        created_at,
        updated_at,
        reservation:reservations (
          id,
          reservation_code,
          checkin_date,
          checkout_date,
          guest_name,
          status
        )
      `,
        { count: "exact" },
      )
      .eq("establishment_id", establishmentId)
      .order("submitted_at", { ascending: false });

    if (publishedOnly === "true") query = query.eq("is_published", true);
    if (publishedOnly === "false") query = query.eq("is_published", false);
    if (submittedFrom) query = query.gte("submitted_at", `${submittedFrom}T00:00:00.000Z`);
    if (submittedTo) query = query.lte("submitted_at", `${submittedTo}T23:59:59.999Z`);

    const { data, error, count } = await query.range(from, to);
    if (error) {
      console.error("list-stay-reviews failed", error);
      return respondJson(companyId, 500, {
        success: false,
        error: "Erro ao listar avaliações da estadia",
      });
    }

    const total = count ?? 0;
    return respondJson(companyId, 200, {
      success: true,
      action,
      establishment_id: establishmentId,
      current_page: page,
      per_page: perPage,
      total_pages: total > 0 ? Math.ceil(total / perPage) : 0,
      total_reviews: total,
      reviews: data ?? [],
    });
  }

  if (action === "stay-review-link") {
    let bookingId = (url.searchParams.get("booking_id") || "").trim();
    let baseUrlOverride = normalizeOptionalPublicBaseUrl(url.searchParams.get("base_url"));

    if (req.method === "POST") {
      try {
        const body = await parseBody();
        if (!bookingId) bookingId = String(body.booking_id || "").trim();
        if (!baseUrlOverride) {
          baseUrlOverride = normalizeOptionalPublicBaseUrl(String(body.base_url || "").trim() || null);
        }
      } catch {
        // ignore
      }
    }

    if (!bookingId) {
      return respondJson(companyId, 400, {
        success: false,
        error: "Parâmetro obrigatório: booking_id (UUID da reserva ou reservation_code).",
      });
    }

    const reservationColumns =
      "id, reservation_code, establishment_id, identification_number";

    const reservationBaseQuery = supabase.from("reservations").select(reservationColumns);
    const { data: reservation, error: resErr } = isUuid(bookingId)
      ? await reservationBaseQuery.or(`id.eq.${bookingId},reservation_code.eq.${bookingId}`).maybeSingle()
      : await reservationBaseQuery.eq("reservation_code", bookingId).maybeSingle();

    if (resErr) {
      console.error("stay-review-link reservation query failed", resErr);
      return respondJson(companyId, 500, { success: false, error: "Erro ao consultar reserva" });
    }

    if (!reservation?.establishment_id) {
      return respondJson(companyId, 404, { success: false, error: "Reserva não encontrada" });
    }

    const est = await ensureEstablishmentFromCompany(String(reservation.establishment_id));
    if (!est) {
      return respondJson(companyId, 404, { success: false, error: "Reserva não encontrada" });
    }

    const locatorRaw =
      String((reservation as { identification_number?: string | null }).identification_number || "").trim() ||
      String((reservation as { reservation_code?: string | null }).reservation_code || "").trim();
    if (!locatorRaw) {
      return respondJson(companyId, 400, {
        success: false,
        error: "Reserva sem código/locator para montar o link de avaliação.",
      });
    }

    const base =
      baseUrlOverride ||
      publicAppBaseUrlFromEnv();
    if (!base) {
      return respondJson(companyId, 400, {
        success: false,
        error:
          "URL base do aplicativo não configurada. Defina VITE_APP_URL, SITE_URL ou PUBLIC_APP_URL no ambiente da função, ou envie base_url (https://seu-dominio) na requisição.",
      });
    }

    const review_url = buildStayReviewPublicUrl(base, locatorRaw);
    return respondJson(companyId, 200, {
      success: true,
      action,
      establishment_id: reservation.establishment_id,
      reservation_id: reservation.id,
      reservation_code: (reservation as { reservation_code?: string }).reservation_code ?? null,
      locator: locatorRaw,
      review_url,
    });
  }

  if (action === "me" || action === "establishments") {
    const [{ data: company }, { data: establishments }] = await Promise.all([
      supabase.from("companies").select("id, name, email, phone").eq("id", companyId).maybeSingle(),
      supabase
        .from("establishments")
        .select("id, name, type, is_active, created_at, updated_at")
        .eq("company_id", companyId)
        .order("name", { ascending: true }),
    ]);

    const estList = establishments ?? [];
    const establishmentIds = estList.map((e) => String(e.id));

    const { data: buildingsRows } = establishmentIds.length
      ? await supabase
          .from("buildings")
          .select(
            "id, establishment_id, name, description, is_active, street, number, neighborhood, city, state, country, zip_code, reception_email, booking_engine_link, created_at, updated_at",
          )
          .in("establishment_id", establishmentIds)
          .order("name", { ascending: true })
      : { data: [] as Record<string, unknown>[] };

    const buildingsByEstablishment = new Map<string, typeof buildingsRows>();
    for (const b of buildingsRows ?? []) {
      const eid = String((b as { establishment_id?: string }).establishment_id ?? "");
      if (!eid) continue;
      const arr = buildingsByEstablishment.get(eid) ?? [];
      arr.push(b as Record<string, unknown>);
      buildingsByEstablishment.set(eid, arr);
    }

    const buildingIds = (buildingsRows ?? []).map((b) => String((b as { id: string }).id));
    const { data: categoriesRows } = buildingIds.length
      ? await supabase
          .from("room_categories")
          .select("id, establishment_id, building_id, name, abbreviation")
          .in("building_id", buildingIds)
          .order("name", { ascending: true })
      : { data: [] as Record<string, unknown>[] };

    const categoriesByBuilding = new Map<string, typeof categoriesRows>();
    for (const c of categoriesRows ?? []) {
      const bid = String((c as { building_id?: string | null }).building_id ?? "");
      if (!bid) continue;
      const arr = categoriesByBuilding.get(bid) ?? [];
      arr.push(c as Record<string, unknown>);
      categoriesByBuilding.set(bid, arr);
    }

    const categoryIds = (categoriesRows ?? []).map((c) => String((c as { id: string }).id));
    const { data: roomsRows } = categoryIds.length
      ? await supabase
          .from("rooms")
          .select("id, category_id, room_number, floor, status, notes, created_at, updated_at")
          .in("category_id", categoryIds)
          .order("room_number", { ascending: true })
      : { data: [] as Record<string, unknown>[] };

    const roomsByCategory = new Map<string, typeof roomsRows>();
    for (const r of roomsRows ?? []) {
      const cid = String((r as { category_id?: string }).category_id ?? "");
      if (!cid) continue;
      const arr = roomsByCategory.get(cid) ?? [];
      arr.push(r as Record<string, unknown>);
      roomsByCategory.set(cid, arr);
    }

    const establishmentsWithUnits = estList.map((est) => {
      const eid = String(est.id);
      const buildingsForEst = buildingsByEstablishment.get(eid) ?? [];
      const hasBuildings = buildingsForEst.length > 0;

      const buildingsPayload = hasBuildings
        ? buildingsForEst.map((b) => {
            const bid = String((b as { id: string }).id);
            const cats = categoriesByBuilding.get(bid) ?? [];
            return {
              ...b,
              categories: cats.map((cat) => {
                const cid = String((cat as { id: string }).id);
                return {
                  ...cat,
                  rooms: roomsByCategory.get(cid) ?? [],
                };
              }),
            };
          })
        : [];

      return {
        ...est,
        units: {
          has_buildings: hasBuildings,
          buildings: buildingsPayload,
        },
      };
    });

    return respondJson(companyId, 200, {
      success: true,
      action,
      company,
      establishments: establishmentsWithUnits,
    });
  }

  return respondJson(companyId, 400, {
    success: false,
    error: `Ação não suportada: ${action}`,
    supported_actions: [
      "me",
      "establishments",
      "list-reservations",
      "create-reservation",
      "get-reservation-by-id",
      "web-checkin",
      "room-clean-status",
      "list-maintenance",
      "list-clients",
      "occupancy-map",
      "list-stay-reviews",
      "stay-review-link",
    ],
  });
});
