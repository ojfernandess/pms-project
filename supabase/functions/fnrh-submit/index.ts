/**
 * FNRH — envio seguro para POST /hospedagem/registrar (credenciais só server-side).
 *
 * Contrato OpenAPI v2 (homolog): https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2/swagger.json
 * (a UI em /rest/v1/#/ é genérica; usar sempre /rest/v2 para o novo FNRH.)
 *
 * O web check-in no PMS é apenas pré-cadastro; o envio à FNRH ocorre na recepção
 * (JWT + body staff). Opcionalmente `commit_checkin: false` envia situação inicial
 * sem marcar CHECKIN_REALIZADO (uso avançado).
 *
 * Autenticação:
 * - Equipe PMS: body { reservation_id, source: "staff", commit_checkin?, confirm_explicit? }
 *   + Authorization Bearer (JWT do funcionário)
 * - Pré check-in web (se `auto_submit_on_web_checkin` no estabelecimento): body
 *   { reservation_id, source: "web", web_checkin_token } — sem JWT; valida token + reserva.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FNRH_BASE_PROD = "https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2";
const FNRH_BASE_HOMOLOG = "https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2";

type Body = {
  reservation_id?: string;
  source?: "staff" | "web";
  /** Token secreto do fluxo web (obrigatório com source: web) */
  web_checkin_token?: string;
  /** default true — CHECKIN_REALIZADO + check_in_em na FNRH */
  commit_checkin?: boolean;
  /** true ignora `auto_submit_on_manual_checkin === false` (botão explícito na reserva) */
  confirm_explicit?: boolean;
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Marca web_checkin como tendo registro FNRH concluído (check-in realizado na ficha). */
async function setWebCheckinFnrhRegistered(
  admin: ReturnType<typeof createClient>,
  webCheckinId: string | null,
): Promise<void> {
  if (!webCheckinId) return;
  const iso = new Date().toISOString();
  const { error } = await admin
    .from("web_checkin")
    .update({ fnrh_registered_at: iso, updated_at: iso })
    .eq("id", webCheckinId);
  if (error) {
    console.error("fnrh-submit: atualizar fnrh_registered_at", error);
  }
}

/** Aceita número (ex.: CEP salvo como int no JSON) ou string. */
function onlyDigits(s: string | number | null | undefined): string {
  return String(s ?? "").replace(/\D/g, "");
}

function isValidCpfDigits(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i], 10) * (10 - i);
  let d1 = (s * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i], 10) * (11 - i);
  let d2 = (s * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10], 10);
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** hospede_id retornados por POST /hospedagem/registrar (mesma ordem dos hóspedes enviados). */
function extractHospedeIdsFromRegistrarResponse(
  parsed: Record<string, unknown>,
): string[] {
  const dados = parsed?.dados as Record<string, unknown> | undefined;
  if (!dados || typeof dados !== "object") return [];
  const out: string[] = [];
  const pushFromObject = (h: unknown) => {
    if (!h || typeof h !== "object" || Array.isArray(h)) return;
    const o = h as Record<string, unknown>;
    const id = o.hospede_id ?? o.Hospede_id;
    if (typeof id === "string" && id.trim()) out.push(id.trim());
  };
  const collect = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) pushFromObject(item);
  };
  collect(dados.hospede);
  collect(dados.hospedes);
  collect(dados.dados_hospede);
  pushFromObject(dados.hospede);
  return out;
}

function parseIbge7(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.floor(raw);
    return n >= 1_000_000 && n <= 99_999_999 ? n : null;
  }
  if (typeof raw === "string" && /^\d{7}$/.test(raw.trim())) {
    return parseInt(raw.trim(), 10);
  }
  return null;
}

const CEP_FETCH_HEADERS: Record<string, string> = {
  Accept: "application/json",
  // Alguns provedores bloqueiam requisições sem User-Agent (comum no Edge).
  "User-Agent":
    "Mozilla/5.0 (compatible; PMS-FNRH/1.0; +https://www.gov.br/turismo/pt-br)",
};

async function fetchJsonGet(url: string, timeoutMs: number): Promise<unknown | null> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: CEP_FETCH_HEADERS,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

function geoFromViaCepLike(j: Record<string, unknown>): {
  ibge: number | null;
  uf: string | null;
} | null {
  if (j?.erro) return null;
  const ibge = parseIbge7(j?.ibge ?? j?.city_ibge);
  const ufRaw = j?.uf ?? j?.state;
  const uf = typeof ufRaw === "string"
    ? ufRaw.toUpperCase().slice(0, 2)
    : null;
  if (ibge !== null) return { ibge, uf };
  return null;
}

/**
 * IBGE + UF a partir do CEP. No Edge da Supabase ViaCEP/Awesome podem falhar
 * (timeout, bloqueio). Ordem: OpenCEP → ViaCEP → AwesomeAPI; 2 tentativas cada.
 */
async function fetchCepGeo(
  cepRaw: string,
): Promise<{ ibge: number | null; uf: string | null }> {
  const cep = onlyDigits(cepRaw);
  if (cep.length !== 8) return { ibge: null, uf: null };

  const tryOnce = async (
    url: string,
    parse: (j: Record<string, unknown>) => {
      ibge: number | null;
      uf: string | null;
    } | null,
  ): Promise<{ ibge: number | null; uf: string | null } | null> => {
    const raw = await fetchJsonGet(url, 10_000);
    if (!raw || typeof raw !== "object") return null;
    return parse(raw as Record<string, unknown>);
  };

  const tryTwice = async (
    url: string,
    parse: (j: Record<string, unknown>) => {
      ibge: number | null;
      uf: string | null;
    } | null,
  ): Promise<{ ibge: number | null; uf: string | null } | null> => {
    let last = await tryOnce(url, parse);
    if (last?.ibge !== null) return last;
    await new Promise((r) => setTimeout(r, 350));
    last = await tryOnce(url, parse);
    return last?.ibge !== null ? last : null;
  };

  const parseAwesome = (j: Record<string, unknown>) => {
    const ibge = parseIbge7(j?.city_ibge ?? j?.ibge);
    const uf = typeof j?.state === "string"
      ? j.state.toUpperCase().slice(0, 2)
      : null;
    if (ibge !== null) return { ibge, uf };
    return null;
  };

  type CepParse = (j: Record<string, unknown>) => {
    ibge: number | null;
    uf: string | null;
  } | null;

  const chain: [string, CepParse][] = [
    [`https://opencep.com/v1/${cep}`, geoFromViaCepLike],
    [`https://viacep.com.br/ws/${cep}/json/`, geoFromViaCepLike],
    [`https://cep.awesomeapi.com.br/json/${cep}`, parseAwesome as CepParse],
  ];

  for (const [url, parse] of chain) {
    const g = await tryTwice(url, parse);
    if (g !== null && g.ibge !== null) {
      return { ibge: g.ibge, uf: g.uf };
    }
  }

  return { ibge: null, uf: null };
}

function parseBirthDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function ageYears(birth: Date, ref: Date): number {
  let a = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) a--;
  return a;
}

type GuestRow = Record<string, unknown>;
type GuestJson = Record<string, unknown>;

function mergeGuest(
  row: GuestRow,
  jsonGuest: GuestJson | undefined,
  index: number,
): GuestJson {
  const j = jsonGuest || {};
  return {
    ...row,
    ...j,
    _order: index,
  };
}

function mapDocumento(
  guest: GuestJson,
): { tipo: "CPF" | "PASSAPORTE"; numero: string } | null {
  const docType = String(
    guest.document_type || guest.documento_id || "",
  ).toLowerCase();
  const cpfField = onlyDigits(
    typeof guest.cpf === "string" ? guest.cpf : undefined,
  );
  const docNum = String(guest.document_number || "").replace(/\s/g, "");

  if (docType === "cpf" || (cpfField.length === 11 && !docNum)) {
    const n = cpfField.length === 11 ? cpfField : onlyDigits(docNum);
    if (n.length !== 11) return null;
    return { tipo: "CPF", numero: n };
  }
  if (docType === "passport" || docType === "passaporte") {
    const n = docNum || cpfField;
    if (n.length < 4) return null;
    return { tipo: "PASSAPORTE", numero: n.toUpperCase() };
  }
  // Fallback: 11 dígitos numéricos → CPF
  const digits = onlyDigits(docNum || cpfField);
  if (digits.length === 11) return { tipo: "CPF", numero: digits };
  if (docNum.length >= 4) return { tipo: "PASSAPORTE", numero: docNum.toUpperCase() };
  return null;
}

/**
 * PaisNacionalidade_id e PaisResidencia_id na API FNRH v2: ISO 3166-1 alpha-2 (ex.: "BR").
 * Doc. oficial v2.3 — não usar alpha-3 ("BRA"); o validador retorna "Nacionalidade inválida".
 * Não usar .slice(0,2) em texto livre: "OTHER" → "OT", "United States" → "UN".
 */
function toIsoAlpha2Country(value: unknown, fallback: string): string {
  const fb = /^[A-Z]{2}$/.test(fallback) ? fallback : "BR";
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw || raw === "OTHER" || raw === "OUTRO" || raw === "OT") return fb;

  if (/^[A-Z]{2}$/.test(raw)) return raw;

  const alpha3: Record<string, string> = {
    BRA: "BR",
    ARG: "AR",
    CHL: "CL",
    COL: "CO",
    PER: "PE",
    URY: "UY",
    PRY: "PY",
    MEX: "MX",
    PRT: "PT",
    ESP: "ES",
    FRA: "FR",
    ITA: "IT",
    DEU: "DE",
    GBR: "GB",
    CAN: "CA",
    AUS: "AU",
    JPN: "JP",
    CHN: "CN",
    USA: "US",
  };
  if (raw.length === 3 && alpha3[raw]) return alpha3[raw];

  if (raw.startsWith("BRAS")) return "BR";
  if (raw.startsWith("BRAZIL")) return "BR";
  if (
    raw.startsWith("UNITED") || raw === "USA" ||
    raw.startsWith("ESTADOS UNID")
  ) {
    return "US";
  }

  const prefixToIso: [string, string][] = [
    ["ARGENT", "AR"],
    ["CHILE", "CL"],
    ["COLOMB", "CO"],
    ["PERU", "PE"],
    ["URUGU", "UY"],
    ["PARAGU", "PY"],
    ["MEXIC", "MX"],
    ["PORTUGAL", "PT"],
    ["ESPANHA", "ES"],
    ["SPAIN", "ES"],
    ["FRAN", "FR"],
    ["FRANCE", "FR"],
    ["ITAL", "IT"],
    ["ITALY", "IT"],
    ["GERMAN", "DE"],
    ["DEUTSCH", "DE"],
    ["JAPAN", "JP"],
    ["CHINA", "CN"],
    ["CANAD", "CA"],
    ["AUSTRAL", "AU"],
    ["REINO UNIDO", "GB"],
    ["UNITED KINGDOM", "GB"],
  ];
  for (const [p, code] of prefixToIso) {
    if (raw.startsWith(p)) return code;
  }

  // Último recurso: não inventar código inválido
  return fb;
}

/**
 * O body desta função segue o manual FNRH **v2** (`PaisNacionalidade_id`, `PaisResidencia_id`).
 * Se `base_url_override` apontar para `/rest/v1`, o servidor ignora esses campos e responde
 * "Nacionalidade inválida" (v1 usava `tipo_nacionalidade_id` / `nacionalidade` — ver migração v1→v2).
 */
function ensureFnrhApiV2BaseUrl(raw: string): string {
  const u = raw.replace(/\/$/, "");
  if (/\/rest\/v1\b/i.test(u)) {
    console.warn(
      "fnrh-submit: URL base continha /rest/v1; redirecionando para /rest/v2 (payload é apenas v2).",
    );
    return u.replace(/\/rest\/v1\b/i, "/rest/v2");
  }
  return u;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { success: false, error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceKey) {
    return jsonResponse(500, {
      success: false,
      error: "Server misconfiguration",
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse(400, { success: false, error: "Invalid JSON" });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  let reservationId: string | null = body.reservation_id ?? null;
  let webCheckinId: string | null = null;
  const commitCheckin = body.commit_checkin !== false;
  const confirmExplicit = body.confirm_explicit === true;

  try {
    const webToken = String(
      (body as { web_checkin_token?: string }).web_checkin_token ?? "",
    ).trim();
    const webSource = body.source === "web";
    const hasWebCheckinId = !!(body as { web_checkin_id?: string }).web_checkin_id;

    if (hasWebCheckinId) {
      return jsonResponse(400, {
        success: false,
        error: "Parâmetro web_checkin_id não é suportado neste endpoint.",
      });
    }

    if (webToken && !webSource) {
      return jsonResponse(400, {
        success: false,
        error: 'Informe source: "web" junto com web_checkin_token.',
      });
    }
    if (webSource && !webToken) {
      return jsonResponse(400, {
        success: false,
        error: 'web_checkin_token é obrigatório quando source é "web".',
      });
    }

    let webGuestFlow = false;

    if (webSource && webToken) {
      const rid = body.reservation_id?.trim();
      if (!rid) {
        return jsonResponse(400, {
          success: false,
          error: "reservation_id é obrigatório",
        });
      }
      const { data: wcGuest } = await admin
        .from("web_checkin")
        .select("id")
        .eq("token", webToken)
        .eq("reservation_id", rid)
        .maybeSingle();
      if (!wcGuest) {
        return jsonResponse(403, {
          success: false,
          error: "Token de check-in web inválido ou não corresponde à reserva.",
        });
      }
      const { data: rPre } = await admin
        .from("reservations")
        .select("establishment_id")
        .eq("id", rid)
        .maybeSingle();
      if (!rPre?.establishment_id) {
        return jsonResponse(404, {
          success: false,
          error: "Reserva não encontrada",
        });
      }
      const { data: webOpt } = await admin
        .from("establishment_fnrh_settings")
        .select("auto_submit_on_web_checkin")
        .eq("establishment_id", rPre.establishment_id)
        .maybeSingle();
      if (!webOpt?.auto_submit_on_web_checkin) {
        return jsonResponse(400, {
          success: false,
          error:
            "Envio à FNRH ao concluir o pré check-in online não está habilitado neste estabelecimento.",
        });
      }
      webGuestFlow = true;
      reservationId = rid;
      webCheckinId = wcGuest.id;
    }

    if (!webGuestFlow) {
      const authHeader = req.headers.get("Authorization") || "";
      const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!jwt || !anonKey) {
        return jsonResponse(401, {
          success: false,
          error: "Autenticação obrigatória (equipe)",
        });
      }
      if (!body.reservation_id) {
        return jsonResponse(400, {
          success: false,
          error: "reservation_id é obrigatório",
        });
      }
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: res, error: resErr } = await userClient
        .from("reservations")
        .select("id")
        .eq("id", body.reservation_id)
        .maybeSingle();
      if (resErr || !res) {
        return jsonResponse(403, {
          success: false,
          error: "Sem acesso a esta reserva",
        });
      }
      reservationId = res.id;
      const { data: wcRows, error: wcLookupErr } = await admin
        .from("web_checkin")
        .select("id, guest_data")
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (wcLookupErr) {
        console.error("fnrh-submit web_checkin lookup", wcLookupErr);
        return jsonResponse(500, {
          success: false,
          error: "Erro ao localizar web check-in desta reserva.",
        });
      }
      const wc2 = wcRows?.[0];
      if (wc2) {
        webCheckinId = wc2.id;
      }
    }

    if (!reservationId) {
      return jsonResponse(400, {
        success: false,
        error: "reservation_id não resolvido",
      });
    }

    const { data: reservation, error: rErr } = await admin
      .from("reservations")
      .select(
        "id, reservation_code, establishment_id, checkin_date, checkout_date, adults, children, channel, category_id",
      )
      .eq("id", reservationId)
      .single();

    if (rErr || !reservation) {
      return jsonResponse(404, {
        success: false,
        error: "Reserva não encontrada",
      });
    }

    const establishmentId = reservation.establishment_id as string;

    const { data: settings } = await admin
      .from("establishment_fnrh_settings")
      .select("*")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (!settings?.enabled) {
      return jsonResponse(200, {
        success: true,
        skipped: true,
        reason: "fnrh_disabled",
      });
    }

    const fnrhScope = String(
      (settings as { fnrh_category_scope?: string }).fnrh_category_scope ||
        "all",
    );
    const fnrhCatIds =
      (settings as { fnrh_category_ids?: string[] | null })
        .fnrh_category_ids ?? [];
    const resCatId = String(
      (reservation as { category_id?: string | null }).category_id ?? "",
    ).trim();
    if (fnrhScope === "selected") {
      if (!fnrhCatIds.length) {
        return jsonResponse(200, {
          success: true,
          skipped: true,
          reason: "fnrh_category_scope_empty",
        });
      }
      const allowed = fnrhCatIds.some((id) => String(id) === resCatId);
      if (!resCatId || !allowed) {
        return jsonResponse(200, {
          success: true,
          skipped: true,
          reason: "fnrh_category_not_in_scope",
        });
      }
    }

    if (
      !webGuestFlow &&
      !confirmExplicit &&
      settings.auto_submit_on_manual_checkin === false
    ) {
      return jsonResponse(200, {
        success: true,
        skipped: true,
        reason: "auto_submit_manual_disabled",
      });
    }

    const { data: secretRow } = await admin
      .from("establishment_fnrh_secrets")
      .select("api_password")
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    const apiUser = (settings.api_username as string | null)?.trim();
    const apiPass = secretRow?.api_password as string | undefined;
    if (!apiUser || !apiPass) {
      return jsonResponse(200, {
        success: false,
        skipped: true,
        reason: "credentials_incomplete",
        error: "Configure usuário e senha da API FNRH nas configurações do estabelecimento.",
      });
    }

    const cpfSol = onlyDigits(settings.cpf_solicitante as string);
    if (cpfSol.length !== 11 || !isValidCpfDigits(cpfSol)) {
      return jsonResponse(400, {
        success: false,
        error:
          "CPF do solicitante (auditoria FNRH) inválido. Ajuste nas configurações do estabelecimento.",
      });
    }

    const env = settings.environment as string;
    let baseUrl = (settings.base_url_override as string | null)?.trim();
    if (!baseUrl) {
      baseUrl = env === "homologation" ? FNRH_BASE_HOMOLOG : FNRH_BASE_PROD;
    }
    baseUrl = ensureFnrhApiV2BaseUrl(baseUrl.replace(/\/$/, ""));

    const op = "hospedagem_registrar";
    const idempotencyKey = await sha256Hex(
      `${establishmentId}:${reservationId}:${op}`,
    );

    const { data: prevLog } = await admin
      .from("fnrh_submission_log")
      .select("id, status")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (prevLog?.status === "success") {
      await setWebCheckinFnrhRegistered(admin, webCheckinId);
      return jsonResponse(200, {
        success: true,
        skipped: true,
        reason: "already_synced",
        idempotency_key: idempotencyKey,
      });
    }

    if (prevLog?.status === "failed" || prevLog?.status === "pending") {
      await admin.from("fnrh_submission_log").delete().eq(
        "idempotency_key",
        idempotencyKey,
      );
    }

    if (!webCheckinId) {
      return jsonResponse(400, {
        success: false,
        error:
          "Envio FNRH requer web check-in com hóspedes cadastrados. Conclua o cadastro no fluxo de check-in.",
      });
    }

    const { data: guestRows, error: gErr } = await admin
      .from("web_checkin_guests")
      .select("*")
      .eq("web_checkin_id", webCheckinId)
      .order("created_at", { ascending: true });

    if (gErr) {
      console.error("fnrh-submit guests", gErr);
      return jsonResponse(500, {
        success: false,
        error: "Erro ao carregar hóspedes do web check-in",
      });
    }

    let guestDataGuests: GuestJson[] = [];
    {
      const { data: wcFull } = await admin
        .from("web_checkin")
        .select("guest_data")
        .eq("id", webCheckinId)
        .maybeSingle();
      const gd = wcFull?.guest_data as { guests?: GuestJson[] } | null;
      if (gd?.guests && Array.isArray(gd.guests)) {
        guestDataGuests = gd.guests;
      }
    }

    const rows = guestRows || [];
    if (rows.length === 0) {
      return jsonResponse(400, {
        success: false,
        error: "Nenhum hóspede encontrado para envio FNRH",
      });
    }

    const merged: GuestJson[] = rows.map((row, i) =>
      mergeGuest(row as GuestRow, guestDataGuests[i], i),
    );

    const situacaoInicial = String(
      settings.situacao_hospede_inicial || "PRECHECKIN_PENDENTE",
    ).trim();
    const situacao = commitCheckin
      ? "CHECKIN_REALIZADO"
      : situacaoInicial;
    /**
     * A FNRH valida que `check_in_em` não seja "no futuro" em relação ao horário do servidor.
     * Entre Deno (edge) e Serpro há deriva de relógio; sem margem aparece:
     * "Data de checkin não pode ser superior a data atual."
     */
    const FNRH_CHECKIN_CLOCK_SKEW_MS = 120_000; // 2 min
    const checkInInstant = new Date(Date.now() - FNRH_CHECKIN_CLOCK_SKEW_MS);
    const nowIso = checkInInstant.toISOString();
    const checkInEm =
      situacao === "CHECKIN_REALIZADO" ? nowIso : "";
    const checkOutEm = "";

    const channel = String(reservation.channel || "direct").toLowerCase();
    const origemOta = channel !== "direct" && channel !== "directo";
    const numeroReserva = String(reservation.reservation_code || reservation.id)
      .slice(0, 80);
    const numeroReservaOta = origemOta ? numeroReserva : "";

    const dadosHospede: Record<string, unknown>[] = [];

    const strTrim = (v: unknown) => String(v ?? "").trim();

    for (const g of merged) {
      const docMap = mapDocumento(g);
      if (!docMap) {
        return jsonResponse(400, {
          success: false,
          error:
            "FNRH exige documento CPF (11 dígitos) ou passaporte para cada hóspede. Ajuste os documentos no check-in.",
        });
      }
      if (docMap.tipo === "CPF" && !isValidCpfDigits(docMap.numero)) {
        return jsonResponse(400, {
          success: false,
          error: `CPF inválido para o hóspede: ${String(g.name || "")}`,
        });
      }

      const birth = parseBirthDate(
        typeof g.birth_date === "string" ? g.birth_date : undefined,
      );
      const ref = new Date();
      const isMinor = birth ? ageYears(birth, ref) < 18 : false;

      const paisNac = toIsoAlpha2Country(
        g.nationality || g.country,
        "BR",
      );
      const paisRes = toIsoAlpha2Country(
        g.country || g.nationality,
        paisNac,
      );

      let cidadeId: number | null =
        typeof g.cidade_ibge_id === "number"
          ? g.cidade_ibge_id
          : typeof g.cidade_ibge_id === "string"
          ? parseInt(String(g.cidade_ibge_id).replace(/\D/g, ""), 10)
          : null;
      if (cidadeId !== null && Number.isNaN(cidadeId)) cidadeId = null;

      const cep =
        onlyDigits(g.zip_code as string | number | undefined) ||
        onlyDigits(g.postal_code as string | number | undefined) ||
        onlyDigits(g.cep as string | number | undefined);

      // Brasil + CEP 8 dígitos: IBGE/UF **só** pelos serviços de CEP (Swagger v2:
      // cidade_id = código IBGE do município). Se confiarmos no cidade_ibge_id
      // salvo no pré-check-in quando ViaCEP/Awesome falham no Edge, enviamos
      // código inválido → 500 "Error executing query" no Serpro.
      let ufFromCep: string | null = null;
      if (paisRes === "BR" && cep.length === 8) {
        const geo = await fetchCepGeo(cep);
        if (geo.ibge === null) {
          return jsonResponse(400, {
            success: false,
            error:
              "Não foi possível obter o código IBGE do município a partir do CEP (serviço indisponível ou CEP inválido). Verifique o CEP e tente de novo em instantes.",
          });
        }
        cidadeId = geo.ibge;
        ufFromCep = geo.uf;
      }

      if (paisRes === "BR" && (cidadeId === null || Number.isNaN(cidadeId))) {
        return jsonResponse(400, {
          success: false,
          error:
            `Não foi possível obter o código IBGE da cidade para ${String(g.name || "hóspede")}. Informe um CEP válido (Brasil) ou o código IBGE nos dados do hóspede.`,
        });
      }

      const generoId =
        strTrim(g.fnrh_genero_id) ||
        strTrim(settings.default_genero_id) ||
        "NAOINFORMADO";
      const racaId =
        strTrim(g.fnrh_raca_id) ||
        strTrim(settings.default_raca_id) ||
        "NAOINFORMAR";
      const defId =
        strTrim(g.fnrh_deficiencia_id) ||
        strTrim(settings.default_deficiencia_id) ||
        "NAO";
      const tipoDef = strTrim(g.fnrh_tipo_deficiencia_id);
      const motivo =
        strTrim(g.fnrh_motivo_viagem_id) ||
        strTrim(settings.default_motivo_viagem_id) ||
        "LAZER_FERIAS";
      const meio =
        strTrim(g.fnrh_meio_transporte_id) ||
        strTrim(settings.default_meio_transporte_id) ||
        "AUTOMOVEL";
      const generoDescricao = strTrim(g.fnrh_genero_descricao);

      if (generoId === "OUTRO" && !generoDescricao) {
        return jsonResponse(400, {
          success: false,
          error:
            `FNRH: descreva o gênero quando a opção for "Outros" (${strTrim(g.name) || "hóspede"}).`,
        });
      }
      if (defId === "SIM" && !tipoDef) {
        return jsonResponse(400, {
          success: false,
          error:
            `FNRH: informe o tipo de deficiência (${strTrim(g.name) || "hóspede"}).`,
        });
      }

      const telefone = onlyDigits(
        typeof g.phone === "string" ? g.phone : undefined,
      );
      const email = String(g.email || "").trim().slice(0, 200);

      const nome = String(g.name || "").trim().toUpperCase();
      if (!nome) {
        return jsonResponse(400, {
          success: false,
          error: "Nome do hóspede é obrigatório para FNRH",
        });
      }

      const dataNasc = birth
        ? birth.toISOString().slice(0, 10)
        : "1900-01-01";

      const estadoId = paisRes === "BR"
        ? (ufFromCep ||
          String(g.state || "")
            .toUpperCase()
            .slice(0, 2))
        : "";
      const logradouro = String(g.street || "").trim();
      const numero = String(g.number || "").trim();
      const complemento = String(g.complement || "").trim();
      const bairro = String(g.neighborhood || "").trim();

      const hosp: Record<string, unknown> = {
        is_principal: !!g.is_main_guest,
        situacao_hospede: situacao,
        check_in_em: checkInEm,
        check_out_em: checkOutEm,
        dados_pessoais: {
          nome,
          nome_social: String(g.nome_social || "").trim(),
          PaisNacionalidade_id: String(paisNac || "BR"),
          genero_id: generoId,
          GeneroDescricao: generoId === "OUTRO"
            ? generoDescricao
            : String(g.GeneroDescricao || "").trim(),
          data_nascimento: dataNasc,
          raca_id: racaId,
          deficiencia_id: defId,
          tipo_deficiencia_id: defId === "SIM" ? tipoDef : "",
          documento_id: {
            numero_documento: docMap.numero,
            tipo_documento_id: docMap.tipo,
          },
          contato: {
            email,
            telefone,
            cep: cep || "",
            logradouro,
            numero,
            complemento,
            bairro,
            PaisResidencia_id: String(paisRes || "BR"),
            cidade_id: paisRes === "BR" ? cidadeId : null,
            estado_id: paisRes === "BR" ? estadoId : "",
          },
        },
        dados_ficha: {
          motivo_viagem_id: motivo,
          meio_transporte_id: meio,
        },
      };

      if (isMinor) {
        const rDoc = onlyDigits(
          typeof g.responsavel_numero_documento === "string"
            ? g.responsavel_numero_documento
            : undefined,
        );
        const rTipo = String(
          g.responsavel_tipo_documento_id || "CPF",
        ).toUpperCase();
        if (rDoc.length < 4) {
          return jsonResponse(400, {
            success: false,
            error:
              `Hóspede menor: informe documento do responsável (campos FNRH) para ${nome}`,
          });
        }
        hosp.responsavel = {
          numero_documento: rDoc,
          tipo_documento_id: rTipo === "PASSAPORTE" ? "PASSAPORTE" : "CPF",
        };
      }

      dadosHospede.push(hosp);
    }

    const payload = {
      reserva: {
        numero_reserva: numeroReserva,
        numero_reserva_ota: numeroReservaOta,
        data_entrada: reservation.checkin_date,
        data_saida: reservation.checkout_date,
        quantidade_hospede_adulto: Math.max(
          1,
          Number(reservation.adults) || 1,
        ),
        quantidade_hospede_menor: Math.max(
          0,
          Number(reservation.children) || 0,
        ),
        origem_reserva_id: origemOta ? "OTA" : "MEIOHOSPEDAGEM",
      },
      dados_hospede: dadosHospede,
    };

    const reqHash = await sha256Hex(
      JSON.stringify({
        r: payload.reserva.numero_reserva,
        n: dadosHospede.length,
      }),
    );

    await admin.from("fnrh_submission_log").insert({
      establishment_id: establishmentId,
      reservation_id: reservationId,
      web_checkin_id: webCheckinId,
      operation: op,
      idempotency_key: idempotencyKey,
      status: "pending",
      request_sha256: reqHash,
    });

    const basic = btoa(`${apiUser}:${apiPass}`);
    const url = `${baseUrl}/hospedagem/registrar`;

    const fr = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${basic}`,
        cpf_solicitante: cpfSol,
      },
      body: JSON.stringify(payload),
    });

    const text = await fr.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { raw: text.slice(0, 500) };
    }

    const dadosResp = parsed?.dados as Record<string, unknown> | undefined;
    const reservaBlock = dadosResp?.reserva as
      | Record<string, unknown>
      | undefined;
    const fnrhReservaId = reservaBlock?.reserva_id != null
      ? String(reservaBlock.reserva_id)
      : "";

    if (!fr.ok) {
      const errMsg =
        (parsed?.mensagem as string) ||
        (parsed?.erro as string) ||
        text.slice(0, 400);
      await admin
        .from("fnrh_submission_log")
        .update({
          status: "failed",
          http_status: fr.status,
          error_message: errMsg,
          response_summary: {
            status: fr.status,
            keys: Object.keys(parsed),
          },
        })
        .eq("idempotency_key", idempotencyKey);

      return jsonResponse(200, {
        success: false,
        error: errMsg,
        http_status: fr.status,
        idempotency_key: idempotencyKey,
      });
    }

    const hospedeIds = extractHospedeIdsFromRegistrarResponse(parsed);
    for (let i = 0; i < rows.length && i < hospedeIds.length; i++) {
      const gid = (rows[i] as { id?: string }).id;
      if (!gid) continue;
      await admin
        .from("web_checkin_guests")
        .update({
          fnrh_hospede_id: hospedeIds[i],
          updated_at: new Date().toISOString(),
        })
        .eq("id", gid);
    }

    await admin
      .from("fnrh_submission_log")
      .update({
        status: "success",
        http_status: fr.status,
        fnrh_reserva_id: fnrhReservaId || null,
        response_summary: {
          reserva_id: fnrhReservaId || null,
          fnrh_hospede_ids: hospedeIds,
        },
        error_message: null,
      })
      .eq("idempotency_key", idempotencyKey);

    await setWebCheckinFnrhRegistered(admin, webCheckinId);

    return jsonResponse(200, {
      success: true,
      fnrh_reserva_id: fnrhReservaId || null,
      idempotency_key: idempotencyKey,
    });
  } catch (e) {
    console.error("fnrh-submit", e);
    return jsonResponse(500, {
      success: false,
      error: e instanceof Error ? e.message : "Erro interno",
    });
  }
});
