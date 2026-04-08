import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AnyObj = Record<string, unknown>;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ensureString(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeRevisionStatus(raw: unknown): "new" | "modified" | "cancelled" | "" {
  const s = ensureString(raw).toLowerCase();
  if (!s) return "";
  if (s === "new" || s === "booked" || s === "created") return "new";
  if (s === "modified" || s === "modify" || s === "updated" || s === "update") return "modified";
  if (s === "cancelled" || s === "canceled" || s === "cancel") return "cancelled";
  return "";
}

function isRoomCancelled(room: AnyObj): boolean {
  const v = room.is_cancelled;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["true", "1", "yes"].includes(v.toLowerCase());
  if (typeof v === "number") return v === 1;
  return false;
}

function deriveRevisionStatus(attrs: AnyObj, hasExistingReservation: boolean): "new" | "modified" | "cancelled" {
  const direct = normalizeRevisionStatus(attrs.status);
  if (direct) return direct;

  const rooms = Array.isArray(attrs.rooms) ? (attrs.rooms as AnyObj[]) : [];
  if (rooms.length > 0 && rooms.every((r) => isRoomCancelled(r))) return "cancelled";

  return hasExistingReservation ? "modified" : "new";
}

function pickEmailTemplateForEstablishment(
  allTemplates: AnyObj[] | null,
  establishmentId: string,
): AnyObj | null {
  if (!allTemplates?.length) return null;
  for (const template of allTemplates) {
    const establishmentIds = template.establishment_ids;
    if (establishmentIds === null || establishmentIds === undefined) return template;
    if (Array.isArray(establishmentIds) && establishmentIds.length === 0) continue;
    if (Array.isArray(establishmentIds) && establishmentIds.includes(establishmentId)) return template;
    try {
      const parsed = typeof establishmentIds === "string" ? JSON.parse(establishmentIds) : establishmentIds;
      if (Array.isArray(parsed) && parsed.includes(establishmentId)) return template;
    } catch {
      return template;
    }
  }
  return null;
}

function replaceVars(template: string, vars: Record<string, string>): string {
  let out = template || "";
  for (const [k, v] of Object.entries(vars)) {
    const re1 = new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, "gi");
    const re2 = new RegExp(`\\{${k}\\}`, "gi");
    out = out.replace(re1, v ?? "").replace(re2, v ?? "");
  }
  return out;
}

async function queueChannelReservationEmail(
  supabase: ReturnType<typeof createClient>,
  args: {
    reservationId: string;
    establishmentId: string;
    guestName: string;
    guestEmail: string | null;
    otaGuestEmail: string | null;
    totalAmount: number;
    paidAmount: number;
    checkinDate?: string | null;
    checkoutDate?: string | null;
    reservationCode?: string | null;
  },
): Promise<void> {
  const recipientEmail = args.guestEmail || args.otaGuestEmail;
  if (!recipientEmail) return;

  const { data: templates } = await supabase
    .from("email_templates")
    .select("*")
    .eq("event_type", args.paidAmount >= args.totalAmount && args.totalAmount > 0 ? "payment.confirmed" : "reservation.created")
    .eq("is_active", true);

  const template = pickEmailTemplateForEstablishment((templates || []) as AnyObj[], args.establishmentId);
  if (!template) return;

  const vars: Record<string, string> = {
    guest_name: args.guestName || "Hóspede",
    reservation_code: String(args.reservationCode || ""),
    reservation_id: args.reservationId,
    checkin_date: String(args.checkinDate || ""),
    checkout_date: String(args.checkoutDate || ""),
    total_amount: String(args.totalAmount || 0),
    paid_amount: String(args.paidAmount || 0),
  };

  const subject = replaceVars(String(template.subject || ""), vars);
  const bodyHtml = replaceVars(String(template.body_html || ""), vars);

  await supabase.rpc("insert_email_queue", {
    p_template_id: template.id,
    p_event_type: args.paidAmount >= args.totalAmount && args.totalAmount > 0 ? "payment.confirmed" : "reservation.created",
    p_recipient_email: recipientEmail,
    p_recipient_name: args.guestName || "Hóspede",
    p_subject: subject,
    p_body_html: bodyHtml,
    p_reservation_id: args.reservationId,
    p_variables: vars,
    p_priority: 1,
    p_cc_emails: template.cc_emails ?? null,
    p_bcc_emails: template.bcc_emails ?? null,
  });
}

function normalizePartnerKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isKnownOtaPartner(key: string): boolean {
  return [
    "booking",
    "bookingcom",
    "airbnb",
    "expedia",
    "decolar",
    "despegar",
    "hoteiscom",
    "hotelbeds",
    "tripcom",
    "agoda",
    "hostelworld",
  ].includes(key);
}

async function shouldApplyChannelAutoPayment(
  supabase: ReturnType<typeof createClient>,
  establishmentId: string,
  partnerChannelName?: string | null,
): Promise<boolean> {
  const { data: hotelSettings } = await supabase
    .from("hotel_settings")
    .select("auto_payment_ota, auto_payment_ota_channels")
    .eq("establishment_id", establishmentId)
    .maybeSingle();

  const autoEnabled = (hotelSettings as { auto_payment_ota?: boolean } | null)?.auto_payment_ota === true;
  if (!autoEnabled) return false;

  const allowedPartnersRaw = (hotelSettings as { auto_payment_ota_channels?: unknown } | null)?.auto_payment_ota_channels;
  const allowedPartners = Array.isArray(allowedPartnersRaw)
    ? allowedPartnersRaw.map((v) => normalizePartnerKey(String(v))).filter(Boolean)
    : [];
  const partnerKey = normalizePartnerKey(partnerChannelName ?? "");

  if (allowedPartners.length > 0) {
    const allowsOthers = allowedPartners.includes("outros") || allowedPartners.includes("others");
    const matchesKnown = !!partnerKey && allowedPartners.includes(partnerKey);
    const matchesOthers = allowsOthers && !!partnerKey && !isKnownOtaPartner(partnerKey);
    if (!(matchesKnown || matchesOthers)) return false;
  }

  return true;
}

async function insertChannelPrepaidPayment(
  supabase: ReturnType<typeof createClient>,
  args: {
    reservationId: string;
    establishmentId: string;
    amount: number;
    bookingId: string;
    managerName: string;
    partnerName?: string | null;
  },
): Promise<{ error: string | null }> {
  if (args.amount <= 0) return { error: null };

  const { data: hotelSettings } = await supabase
    .from("hotel_settings")
    .select("auto_payment_ota, auto_payment_carrier_id, auto_payment_channel_carrier_id, auto_payment_ota_channels")
    .eq("establishment_id", args.establishmentId)
    .maybeSingle();

  const autoEnabled = (hotelSettings as { auto_payment_ota?: boolean } | null)?.auto_payment_ota === true;
  if (!autoEnabled) return { error: null };

  const allowedPartnersRaw = (hotelSettings as { auto_payment_ota_channels?: unknown } | null)?.auto_payment_ota_channels;
  const allowedPartners = Array.isArray(allowedPartnersRaw)
    ? allowedPartnersRaw.map((v) => normalizePartnerKey(String(v))).filter(Boolean)
    : [];
  const partnerKey = normalizePartnerKey(args.partnerName);
  if (allowedPartners.length > 0) {
    const allowsOthers = allowedPartners.includes("outros") || allowedPartners.includes("others");
    const matchesKnown = !!partnerKey && allowedPartners.includes(partnerKey);
    const matchesOthers = allowsOthers && !!partnerKey && !isKnownOtaPartner(partnerKey);
    if (!(matchesKnown || matchesOthers)) return { error: null };
  }

  const marker = `Pré-pago via canal OTA (${args.managerName})`;
  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("reservation_id", args.reservationId)
    .ilike("notes", `%${marker}%`)
    .maybeSingle();
  if (existing?.id) return { error: null };

  const notes = [
    marker,
    `bookingId: ${args.bookingId}`,
    args.partnerName ? `canal parceiro: ${args.partnerName}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { error } = await supabase.from("payments").insert({
    reservation_id: args.reservationId,
    establishment_id: args.establishmentId,
    amount: args.amount,
    payment_method: "deposit",
    payment_date: new Date().toISOString(),
    carrier_id:
      ((hotelSettings as { auto_payment_channel_carrier_id?: string | null } | null)?.auto_payment_channel_carrier_id) ||
      ((hotelSettings as { auto_payment_carrier_id?: string | null } | null)?.auto_payment_carrier_id) ||
      null,
    notes,
  });

  return { error: error?.message ?? null };
}

async function createChannelReservationNotification(
  supabase: ReturnType<typeof createClient>,
  args: {
    establishmentId: string;
    reservationId: string;
    reservationCode: string | null;
    guestName: string | null;
    managerName?: string | null;
    partnerName?: string | null;
  },
): Promise<void> {
  const manager = String(args.managerName ?? "Channex").trim() || "Channex";
  const partner = String(args.partnerName ?? "não informado").trim() || "não informado";
  const guest = String(args.guestName ?? "Hóspede").trim() || "Hóspede";
  const code = String(args.reservationCode ?? "").trim();
  const prefix = code ? `Nova reserva ${code}` : "Nova reserva";
  await supabase.rpc("create_notification_for_establishment", {
    p_establishment_id: args.establishmentId,
    p_type: "new_reservation",
    p_title: "Nova Reserva de Canal",
    p_message: `${prefix} de ${guest} via ${manager} / ${partner}`,
    p_priority: "medium",
    p_metadata: {
      reservation_id: args.reservationId,
      reservation_code: code || null,
      channel_manager: manager,
      source_channel: partner,
      source: "channex_channel",
    },
  });
}

async function createChannelReservationLifecycleNotification(
  supabase: ReturnType<typeof createClient>,
  args: {
    establishmentId: string;
    reservationId: string;
    reservationCode: string | null;
    guestName: string | null;
    managerName?: string | null;
    partnerName?: string | null;
    type: "reservation_modified" | "reservation_cancelled";
  },
): Promise<void> {
  const manager = String(args.managerName ?? "Channex").trim() || "Channex";
  const partner = String(args.partnerName ?? "não informado").trim() || "não informado";
  const guest = String(args.guestName ?? "Hóspede").trim() || "Hóspede";
  const code = String(args.reservationCode ?? "").trim();
  const prefix = code ? `Reserva ${code}` : "Reserva";
  const isCancelled = args.type === "reservation_cancelled";

  await supabase.rpc("create_notification_for_establishment", {
    p_establishment_id: args.establishmentId,
    p_type: args.type,
    p_title: isCancelled ? "Reserva de Canal Cancelada" : "Reserva de Canal Alterada",
    p_message: `${prefix} de ${guest} via ${manager} / ${partner} foi ${isCancelled ? "cancelada" : "alterada"}`,
    p_priority: "medium",
    p_metadata: {
      reservation_id: args.reservationId,
      reservation_code: code || null,
      channel_manager: manager,
      source_channel: partner,
      source: "channex_channel",
      action: isCancelled ? "cancelled" : "modified",
    },
  });
}

async function ensureWebCheckinRow(
  supabase: ReturnType<typeof createClient>,
  reservation: { id: string; reservation_code?: string | null; checkin_date?: string | null },
  establishmentId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("web_checkin")
    .select("id")
    .eq("reservation_id", reservation.id)
    .maybeSingle();
  if (existing?.id) return;

  const code = reservation.reservation_code;
  if (!code) return;

  const token = btoa(`${reservation.id}:${code}:${Date.now()}`).replace(/[^a-zA-Z0-9]/g, "").substring(0, 64);
  const checkinDateObj = reservation.checkin_date ? new Date(reservation.checkin_date) : new Date();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  if (checkinDateObj < expiresAt) expiresAt.setTime(checkinDateObj.getTime());

  await supabase.from("web_checkin").insert({
    reservation_id: reservation.id,
    establishment_id: establishmentId,
    token,
    locator: code,
    expires_at: expiresAt.toISOString(),
    status: "pending",
  });
}

async function maybeSendCheckinChargeAutomationsForChannelReservation(
  reservationId: string,
  establishmentId: string,
): Promise<void> {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return;

  const postIntent = async (intent: "checkin_reminder" | "payment_pending") => {
    await fetch(`${supabaseUrl}/functions/v1/send-checkin-charge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reservation_id: reservationId, intent }),
    }).catch(() => undefined);
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
  const { data: config } = await supabase
    .from("checkin_charge_config")
    .select("send_timing")
    .eq("establishment_id", establishmentId)
    .eq("enabled", true)
    .maybeSingle();
  if (!config) return;

  const { data: row } = await supabase
    .from("reservations")
    .select("status, total_amount, paid_amount, channel")
    .eq("id", reservationId)
    .maybeSingle();
  if (!row) return;

  const status = String(row.status ?? "");
  const isOta = String(row.channel ?? "direct") !== "direct";
  const checkinEligibleStatus = status === "confirmed" || (isOta && (status === "pending" || status === "preregistration"));
  const total = Number(row.total_amount ?? 0);
  const paid = Number(row.paid_amount ?? 0);
  const hasPendingPayment = total > 0 && paid < total;

  if (hasPendingPayment) {
    await postIntent("payment_pending");
    return;
  }
  if (config.send_timing === "after_confirmation" && checkinEligibleStatus) await postIntent("checkin_reminder");
  if (config.send_timing === "after_ota" && isOta && checkinEligibleStatus) await postIntent("checkin_reminder");
}

async function fetchChannex(baseUrl: string, apiKey: string, path: string) {
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    headers: { "Content-Type": "application/json", "user-api-key": apiKey },
  });
  const data = await resp.json().catch(() => ({}));
  return { resp, data };
}

async function postChannex(baseUrl: string, apiKey: string, path: string) {
  const resp = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-api-key": apiKey },
  });
  const data = await resp.json().catch(() => ({}));
  return { resp, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as {
      channel_id?: string;
      establishment_id?: string;
      revision_id?: string;
    };
    const channelId = ensureString(body.channel_id);
    const establishmentId = ensureString(body.establishment_id);
    const revisionFilter = ensureString(body.revision_id);
    if (!channelId || !establishmentId) {
      return json({ success: false, error: "channel_id e establishment_id são obrigatórios" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: channel } = await supabase.from("ota_channels").select("*").eq("id", channelId).maybeSingle();
    if (!channel) return json({ success: false, error: "Canal não encontrado" }, 404);

    const apiKey = ensureString((channel as AnyObj).channex_api_key);
    const propertyId = ensureString((channel as AnyObj).channex_property_id);
    const baseUrl = ensureString((channel as AnyObj).channex_base_url || "https://staging.channex.io");
    if (!apiKey || !propertyId) {
      return json({ success: false, error: "Canal sem channex_api_key/channex_property_id configurados" }, 400);
    }

    const feedPath = revisionFilter
      ? `/api/v1/booking_revisions/${revisionFilter}`
      : `/api/v1/booking_revisions/feed?filter[property_id]=${encodeURIComponent(propertyId)}&order[inserted_at]=asc`;
    const { resp: feedResp, data: feedData } = await fetchChannex(baseUrl, apiKey, feedPath);
    if (!feedResp.ok) {
      await supabase.from("channex_sync_logs").insert({
        ota_channel_id: channelId,
        establishment_id: establishmentId,
        direction: "pull_booking",
        status: "error",
        endpoint: feedPath,
        http_status: feedResp.status,
        response_payload: feedData,
        message: "Erro ao buscar booking revisions",
      });
      return json({ success: false, error: "Falha ao buscar revisões no Channex", hint: String(feedResp.status) }, 502);
    }

    const list: AnyObj[] = Array.isArray((feedData as AnyObj).data)
      ? ((feedData as AnyObj).data as AnyObj[])
      : (feedData as AnyObj).data
        ? [((feedData as AnyObj).data as AnyObj)]
        : [];

    let processed = 0;
    let created = 0;
    let modified = 0;
    let cancelled = 0;
    let failed = 0;

    for (const item of list) {
      const attrs = (item.attributes ?? {}) as AnyObj;
      const revisionId = ensureString(attrs.id || item.id);
      const bookingId = ensureString(attrs.booking_id);
      const uniqueId = ensureString(attrs.unique_id || attrs.ota_reservation_code);
      const otaName = ensureString(attrs.ota_name) || "Channex";
      const existingReservationLookup = await supabase
        .from("ota_reservations")
        .select("id, reservation_id")
        .eq("ota_channel_id", channelId)
        .eq("ota_reservation_code", uniqueId || bookingId)
        .maybeSingle();
      const existingOta = existingReservationLookup.data;
      const reservationAlreadyExists = !!ensureString(existingOta?.reservation_id);

      const revisionStatus = deriveRevisionStatus(attrs, reservationAlreadyExists);
      if (!revisionId || !bookingId) continue;

      const { data: exists } = await supabase
        .from("channex_booking_revisions")
        .select("id, process_status")
        .eq("ota_channel_id", channelId)
        .eq("revision_id", revisionId)
        .maybeSingle();
      if (exists?.id && exists.process_status === "acked") continue;

      processed += 1;

      try {
        const customer = (attrs.customer ?? {}) as AnyObj;
        const firstName = ensureString(customer.name);
        const lastName = ensureString(customer.surname);
        const guestName = `${firstName} ${lastName}`.trim() || "Hóspede Channex";
        const email = ensureString(customer.mail) || null;
        const phone = ensureString(customer.phone) || null;

        let clientId: string | null = null;
        if (email) {
          const { data: foundClient } = await supabase
            .from("clients")
            .select("id")
            .eq("email", email)
            .maybeSingle();
          if (foundClient?.id) clientId = foundClient.id;
        }
        if (!clientId) {
          const { data: clientRow, error: clientErr } = await supabase
            .from("clients")
            .insert({
              full_name: guestName,
              email,
              phone,
              city: ensureString(customer.city) || null,
              country: ensureString(customer.country) || null,
              address: ensureString(customer.address) || null,
            })
            .select("id")
            .single();
          if (clientErr) throw clientErr;
          clientId = clientRow.id;
        }

        const rooms = Array.isArray(attrs.rooms) ? (attrs.rooms as AnyObj[]) : [];
        const firstRoom = rooms[0] ?? {};
        const roomTypeId = ensureString((firstRoom as AnyObj).room_type_id || (firstRoom as AnyObj).room_type_code || ((firstRoom as AnyObj).meta as AnyObj | undefined)?.room_type_code);
        const ratePlanId = ensureString((firstRoom as AnyObj).rate_plan_id || (firstRoom as AnyObj).rate_plan_code || ((firstRoom as AnyObj).meta as AnyObj | undefined)?.rate_plan_code);
        const arrivalDate = ensureString(attrs.arrival_date || (firstRoom as AnyObj).checkin_date);
        const departureDate = ensureString(attrs.departure_date || (firstRoom as AnyObj).checkout_date);
        const amount = Number(attrs.amount ?? (firstRoom as AnyObj).amount ?? 0);
        const paidByOta = ensureString(attrs.payment_collect).toLowerCase() === "ota";
        const shouldApplyAutoPayment = paidByOta
          ? await shouldApplyChannelAutoPayment(supabase, establishmentId, otaName)
          : false;

        const { data: mapping } = await supabase
          .from("channel_pricing")
          .select("category_id, pricing_plan_id")
          .eq("ota_channel_id", channelId)
          .eq("channel_room_code", roomTypeId)
          .eq("channel_rate_plan_code", ratePlanId)
          .maybeSingle();
        const categoryId = ensureString(mapping?.category_id);
        if (!categoryId) {
          throw new Error(`Mapeamento não encontrado para room_type_id=${roomTypeId} rate_plan_id=${ratePlanId}`);
        }

        let reservationId = ensureString(existingOta?.reservation_id);

        if ((revisionStatus === "new" || revisionStatus === "modified") && !reservationId) {
          const { data: rpcResult, error: rpcErr } = await supabase.rpc("create_reservation_with_lock", {
            p_reservation_data: {
              guest_name: guestName,
              adults: Number((attrs.occupancy as AnyObj)?.adults ?? 2),
              children: Number((attrs.occupancy as AnyObj)?.children ?? 0),
              total_amount: amount > 0 ? amount : 0,
              paid_amount: paidByOta && shouldApplyAutoPayment && amount > 0 ? amount : 0,
              payment_status: paidByOta && shouldApplyAutoPayment && amount > 0 ? "paid" : "pending",
              status: "pending",
              channel: "ota",
              notes: `Channex ${otaName} · booking ${uniqueId || bookingId}`,
              client_id: clientId,
            },
            p_checkin_date: arrivalDate,
            p_checkout_date: departureDate,
            p_establishment_id: establishmentId,
            p_room_id: null,
            p_category_id: categoryId,
          });
          if (rpcErr) throw rpcErr;

          const result = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;
          if (!result?.success || !result?.reservation_id) throw new Error(result?.error || "Falha ao criar reserva");
          reservationId = String(result.reservation_id);

          await supabase.from("ota_reservations").insert({
            reservation_id: reservationId,
            ota_channel_id: channelId,
            ota_reservation_code: uniqueId || bookingId,
            ota_guest_name: guestName,
            ota_guest_email: email,
            ota_guest_phone: phone,
            ota_source_channel_name: otaName,
            sync_status: "synced",
            synced_at: new Date().toISOString(),
          });

          try {
            const { data: reservationRow } = await supabase
              .from("reservations")
              .select("reservation_code, checkin_date, checkout_date, total_amount, paid_amount")
              .eq("id", reservationId)
              .maybeSingle();
            await createChannelReservationNotification(supabase, {
              establishmentId,
              reservationId,
              reservationCode: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
              guestName,
              managerName: "Channex",
              partnerName: otaName,
            });
            await ensureWebCheckinRow(
              supabase,
              {
                id: reservationId,
                reservation_code: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
                checkin_date: (reservationRow as { checkin_date?: string | null } | null)?.checkin_date ?? null,
              },
              establishmentId,
            );

            await queueChannelReservationEmail(supabase, {
              reservationId,
              establishmentId,
              guestName,
              guestEmail: email,
              otaGuestEmail: email,
              totalAmount: Number((reservationRow as AnyObj | null)?.total_amount ?? amount ?? 0),
              paidAmount: Number((reservationRow as AnyObj | null)?.paid_amount ?? 0),
              checkinDate: String((reservationRow as AnyObj | null)?.checkin_date ?? arrivalDate ?? ""),
              checkoutDate: String((reservationRow as AnyObj | null)?.checkout_date ?? departureDate ?? ""),
              reservationCode: String((reservationRow as AnyObj | null)?.reservation_code ?? ""),
            });
          } catch (e) {
            console.warn("channex-reservations-sync notification/web-checkin warning", e);
          }

          try {
            await maybeSendCheckinChargeAutomationsForChannelReservation(reservationId, establishmentId);
          } catch (e) {
            console.warn("channex-reservations-sync checkin-charge warning", e);
          }

          if (paidByOta && amount > 0) {
            const payErr = await insertChannelPrepaidPayment(supabase, {
              reservationId,
              establishmentId,
              amount,
              bookingId: uniqueId || bookingId,
              managerName: "Channex",
              partnerName: otaName,
            });
            if (payErr.error) {
              console.warn("channex-reservations-sync prepaid payment warning", payErr.error);
            }
          }
          created += 1;
        } else if (revisionStatus === "modified" && reservationId) {
          const shouldApplyAutoPayment = paidByOta
            ? await shouldApplyChannelAutoPayment(supabase, establishmentId, otaName)
            : false;
          const patch: AnyObj = {
            checkin_date: arrivalDate || null,
            checkout_date: departureDate || null,
            guest_name: guestName,
            total_amount: amount > 0 ? amount : 0,
            paid_amount: paidByOta && shouldApplyAutoPayment && amount > 0 ? amount : 0,
            payment_status: paidByOta && shouldApplyAutoPayment && amount > 0 ? "paid" : "pending",
            notes: `Channex ${otaName} · booking ${uniqueId || bookingId} · modify`,
          };
          await supabase.from("reservations").update(patch).eq("id", reservationId);

          await supabase
            .from("ota_reservations")
            .update({
              ota_guest_name: guestName,
              ota_guest_email: email,
              ota_guest_phone: phone,
              ota_source_channel_name: otaName,
              sync_status: "synced",
              synced_at: new Date().toISOString(),
            })
            .eq("ota_channel_id", channelId)
            .eq("ota_reservation_code", uniqueId || bookingId);

          try {
            const { data: reservationRow } = await supabase
              .from("reservations")
              .select("reservation_code, checkin_date, checkout_date, total_amount, paid_amount")
              .eq("id", reservationId)
              .maybeSingle();
            await createChannelReservationLifecycleNotification(supabase, {
              establishmentId,
              reservationId,
              reservationCode: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
              guestName,
              managerName: "Channex",
              partnerName: otaName,
              type: "reservation_modified",
            });
            await ensureWebCheckinRow(
              supabase,
              {
                id: reservationId,
                reservation_code: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
                checkin_date: (reservationRow as { checkin_date?: string | null } | null)?.checkin_date ?? null,
              },
              establishmentId,
            );

            await queueChannelReservationEmail(supabase, {
              reservationId,
              establishmentId,
              guestName,
              guestEmail: email,
              otaGuestEmail: email,
              totalAmount: Number((reservationRow as AnyObj | null)?.total_amount ?? amount ?? 0),
              paidAmount: Number((reservationRow as AnyObj | null)?.paid_amount ?? 0),
              checkinDate: String((reservationRow as AnyObj | null)?.checkin_date ?? arrivalDate ?? ""),
              checkoutDate: String((reservationRow as AnyObj | null)?.checkout_date ?? departureDate ?? ""),
              reservationCode: String((reservationRow as AnyObj | null)?.reservation_code ?? ""),
            });
          } catch (e) {
            console.warn("channex-reservations-sync modified notification/web-checkin warning", e);
          }

          try {
            await maybeSendCheckinChargeAutomationsForChannelReservation(reservationId, establishmentId);
          } catch (e) {
            console.warn("channex-reservations-sync modified checkin-charge warning", e);
          }

          if (paidByOta && amount > 0) {
            const payErr = await insertChannelPrepaidPayment(supabase, {
              reservationId,
              establishmentId,
              amount,
              bookingId: uniqueId || bookingId,
              managerName: "Channex",
              partnerName: otaName,
            });
            if (payErr.error) {
              console.warn("channex-reservations-sync modified prepaid payment warning", payErr.error);
            }
          }
          modified += 1;
        } else if (revisionStatus === "cancelled" && reservationId) {
          await supabase
            .from("reservations")
            .update({ status: "cancelled", notes: `Cancelada via Channex · booking ${uniqueId || bookingId}` })
            .eq("id", reservationId);

          await supabase
            .from("ota_reservations")
            .update({
              sync_status: "cancelled",
              synced_at: new Date().toISOString(),
            })
            .eq("ota_channel_id", channelId)
            .eq("ota_reservation_code", uniqueId || bookingId);

          try {
            const { data: reservationRow } = await supabase
              .from("reservations")
              .select("reservation_code")
              .eq("id", reservationId)
              .maybeSingle();
            await createChannelReservationLifecycleNotification(supabase, {
              establishmentId,
              reservationId,
              reservationCode: (reservationRow as { reservation_code?: string | null } | null)?.reservation_code ?? null,
              guestName,
              managerName: "Channex",
              partnerName: otaName,
              type: "reservation_cancelled",
            });
          } catch (e) {
            console.warn("channex-reservations-sync cancelled notification warning", e);
          }
          cancelled += 1;
        } else if (revisionStatus === "cancelled" && !reservationId) {
          // Reserva cancelada sem vínculo local: mantemos revisão processada para permitir ACK e evitar loop no feed.
          cancelled += 1;
        }

        await supabase.from("channex_booking_revisions").upsert(
          {
            ota_channel_id: channelId,
            establishment_id: establishmentId,
            revision_id: revisionId,
            booking_id: bookingId,
            unique_id: uniqueId || null,
            system_id: ensureString(attrs.system_id) || null,
            status: revisionStatus || "new",
            payload: attrs,
            reservation_id: reservationId || null,
            process_status: "processed",
            processed_at: new Date().toISOString(),
            error_message: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ota_channel_id,revision_id" }
        );

        await supabase.from("channex_ack_queue").upsert(
          {
            ota_channel_id: channelId,
            establishment_id: establishmentId,
            revision_id: revisionId,
            status: "pending",
            next_attempt_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ota_channel_id,revision_id" }
        );
      } catch (e) {
        failed += 1;
        await supabase.from("channex_booking_revisions").upsert(
          {
            ota_channel_id: channelId,
            establishment_id: establishmentId,
            revision_id: revisionId,
            booking_id: bookingId,
            unique_id: uniqueId || null,
            system_id: ensureString(attrs.system_id) || null,
            status: revisionStatus || "new",
            payload: attrs,
            process_status: "failed",
            processed_at: new Date().toISOString(),
            error_message: e instanceof Error ? e.message : "Falha no processamento",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ota_channel_id,revision_id" }
        );
      }
    }

    // Try immediate ack worker execution to reduce queue delay.
    try {
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/channex-ack-worker`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({ channel_id: channelId, establishment_id: establishmentId }),
      });
    } catch {
      // ignore; queue remains pending
    }

    await supabase.from("channex_sync_logs").insert({
      ota_channel_id: channelId,
      establishment_id: establishmentId,
      direction: "pull_booking",
      status: failed > 0 ? "warning" : "success",
      endpoint: feedPath,
      message: `Processadas ${processed} revisão(ões)`,
      request_payload: { revisionFilter: revisionFilter || null },
      response_payload: { processed, created, modified, cancelled, failed },
    });

    return json({ success: true, processed, created, modified, cancelled, failed });
  } catch (error) {
    console.error("channex-reservations-sync error", error);
    return json({ success: false, error: error instanceof Error ? error.message : "Erro interno" }, 500);
  }
});
