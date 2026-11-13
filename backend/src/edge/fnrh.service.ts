import { createHash } from "crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthService } from "../auth/auth.service";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { PrismaService } from "../prisma/prisma.service";

const FNRH_BASE_PROD = "https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2";
const FNRH_BASE_HOMOLOG = "https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2";
const CHECKIN_SKEW_MS = 120_000;

type Result = { status: number; body: Record<string, unknown> };
type GuestJson = Record<string, unknown>;

@Injectable()
export class FnrhService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: StaffIdentityService,
    private readonly auth: AuthService,
  ) {}

  async submit(authorization: string | undefined, body: Record<string, unknown>): Promise<Result> {
    try {
      if (body.web_checkin_id) return fail(400, "Parâmetro web_checkin_id não é suportado neste endpoint.");
      const webToken = String(body.web_checkin_token ?? "").trim();
      const webSource = body.source === "web";
      if (webToken && !webSource) return fail(400, 'Informe source: "web" junto com web_checkin_token.');
      if (webSource && !webToken) return fail(400, 'web_checkin_token é obrigatório quando source é "web".');

      let reservationId = String(body.reservation_id ?? "").trim();
      let webCheckinId: string | null = null;
      let webGuestFlow = false;
      const commitCheckin = body.commit_checkin !== false;
      const confirmExplicit = body.confirm_explicit === true;

      if (webSource && webToken) {
        if (!reservationId) return fail(400, "reservation_id é obrigatório");
        const webCheckin = await this.prisma.web_checkin.findFirst({ where: { token: webToken, reservation_id: reservationId }, select: { id: true } });
        if (!webCheckin) return fail(403, "Token de check-in web inválido ou não corresponde à reserva.");
        const reservation = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { establishment_id: true } });
        if (!reservation?.establishment_id) return fail(404, "Reserva não encontrada");
        const option = await this.prisma.establishment_fnrh_settings.findUnique({ where: { establishment_id: reservation.establishment_id }, select: { auto_submit_on_web_checkin: true } });
        if (!option?.auto_submit_on_web_checkin) return fail(400, "Envio à FNRH ao concluir o pré check-in online não está habilitado neste estabelecimento.");
        webGuestFlow = true;
        webCheckinId = webCheckin.id;
      }

      if (!webGuestFlow) {
        if (!authorization?.replace(/^Bearer\s+/i, "").trim()) return fail(401, "Autenticação obrigatória (equipe)");
        if (!reservationId) return fail(400, "reservation_id é obrigatório");
        const reservation = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { id: true, establishment_id: true } });
        if (!reservation?.establishment_id || !(await this.canAccess(authorization, reservation.establishment_id))) return fail(403, "Sem acesso a esta reserva");
        const latest = await this.prisma.web_checkin.findFirst({ where: { reservation_id: reservationId }, orderBy: { created_at: "desc" }, select: { id: true } });
        webCheckinId = latest?.id ?? null;
      }

      if (!reservationId) return fail(400, "reservation_id não resolvido");
      const reservation = await this.prisma.reservations.findUnique({
        where: { id: reservationId },
        select: { id: true, reservation_code: true, establishment_id: true, checkin_date: true, checkout_date: true, adults: true, children: true, channel: true, category_id: true },
      });
      if (!reservation?.establishment_id) return fail(404, "Reserva não encontrada");
      const establishmentId = reservation.establishment_id;
      const settings = await this.prisma.establishment_fnrh_settings.findUnique({ where: { establishment_id: establishmentId } });
      if (!settings?.enabled) return ok({ success: true, skipped: true, reason: "fnrh_disabled" });
      if (settings.fnrh_category_scope === "selected") {
        if (!settings.fnrh_category_ids.length) return ok({ success: true, skipped: true, reason: "fnrh_category_scope_empty" });
        if (!settings.fnrh_category_ids.includes(reservation.category_id)) return ok({ success: true, skipped: true, reason: "fnrh_category_not_in_scope" });
      }
      if (!webGuestFlow && !confirmExplicit && settings.auto_submit_on_manual_checkin === false) {
        return ok({ success: true, skipped: true, reason: "auto_submit_manual_disabled" });
      }
      const secret = await this.prisma.establishment_fnrh_secrets.findUnique({ where: { establishment_id: establishmentId }, select: { api_password: true } });
      const apiUser = settings.api_username?.trim();
      if (!apiUser || !secret?.api_password) {
        return ok({ success: false, skipped: true, reason: "credentials_incomplete", error: "Configure usuário e senha da API FNRH nas configurações do estabelecimento." });
      }
      const cpf = onlyDigits(settings.cpf_solicitante);
      if (cpf.length !== 11 || !isValidCpf(cpf)) return fail(400, "CPF do solicitante (auditoria FNRH) inválido. Ajuste nas configurações do estabelecimento.");
      const baseUrl = fnrhBase(settings.environment, settings.base_url_override);
      const idempotencyKey = sha256(`${establishmentId}:${reservationId}:hospedagem_registrar`);
      const previous = await this.prisma.fnrh_submission_log.findUnique({ where: { idempotency_key: idempotencyKey }, select: { status: true } });
      if (previous?.status === "success") {
        await this.markRegistered(webCheckinId);
        return ok({ success: true, skipped: true, reason: "already_synced", idempotency_key: idempotencyKey });
      }
      if (previous) await this.prisma.fnrh_submission_log.delete({ where: { idempotency_key: idempotencyKey } });
      if (!webCheckinId) return fail(400, "Envio FNRH requer web check-in com hóspedes cadastrados. Conclua o cadastro no fluxo de check-in.");

      const rows = await this.prisma.web_checkin_guests.findMany({ where: { web_checkin_id: webCheckinId }, orderBy: { created_at: "asc" } });
      const webCheckin = await this.prisma.web_checkin.findUnique({ where: { id: webCheckinId }, select: { guest_data: true } });
      const guestData = ((webCheckin?.guest_data as { guests?: GuestJson[] } | null)?.guests ?? []);
      if (!rows.length) return fail(400, "Nenhum hóspede encontrado para envio FNRH");
      const situacao = commitCheckin ? "CHECKIN_REALIZADO" : String(settings.situacao_hospede_inicial || "PRECHECKIN_PENDENTE").trim();
      const checkInEm = situacao === "CHECKIN_REALIZADO" ? new Date(Date.now() - CHECKIN_SKEW_MS).toISOString() : "";
      const channel = String(reservation.channel || "direct").toLowerCase();
      const origemOta = channel !== "direct" && channel !== "directo";
      const numeroReserva = String(reservation.reservation_code || reservation.id).slice(0, 80);
      const dadosHospede: Record<string, unknown>[] = [];

      for (let index = 0; index < rows.length; index += 1) {
        const guest = { ...rowToJson(rows[index]), ...(guestData[index] || {}) };
        const document = mapDocumento(guest);
        if (!document) return fail(400, "FNRH exige documento CPF (11 dígitos) ou passaporte para cada hóspede. Ajuste os documentos no check-in.");
        if (document.tipo === "CPF" && !isValidCpf(document.numero)) return fail(400, `CPF inválido para o hóspede: ${String(guest.name || "")}`);
        const birth = parseBirth(guest.birth_date);
        const isMinor = birth ? ageYears(birth, new Date()) < 18 : false;
        const paisNac = toIsoAlpha2(guest.nationality || guest.country, "BR");
        const paisRes = toIsoAlpha2(guest.country || guest.nationality, paisNac);
        let cidadeId = parseCity(guest.cidade_ibge_id);
        const cep = onlyDigits(guest.zip_code) || onlyDigits(guest.postal_code) || onlyDigits(guest.cep);
        let ufFromCep: string | null = null;
        if (paisRes === "BR" && cep.length === 8) {
          const geo = await fetchCepGeo(cep);
          if (geo.ibge === null) return fail(400, "Não foi possível obter o código IBGE do município a partir do CEP (serviço indisponível ou CEP inválido). Verifique o CEP e tente de novo em instantes.");
          cidadeId = geo.ibge;
          ufFromCep = geo.uf;
        }
        if (paisRes === "BR" && cidadeId === null) return fail(400, `Não foi possível obter o código IBGE da cidade para ${String(guest.name || "hóspede")}. Informe um CEP válido (Brasil) ou o código IBGE nos dados do hóspede.`);
        const generoId = text(guest.fnrh_genero_id) || text(settings.default_genero_id) || "NAOINFORMADO";
        const defId = text(guest.fnrh_deficiencia_id) || text(settings.default_deficiencia_id) || "NAO";
        const tipoDef = text(guest.fnrh_tipo_deficiencia_id);
        const generoDescricao = text(guest.fnrh_genero_descricao);
        if (generoId === "OUTRO" && !generoDescricao) return fail(400, `FNRH: descreva o gênero quando a opção for "Outros" (${text(guest.name) || "hóspede"}).`);
        if (defId === "SIM" && !tipoDef) return fail(400, `FNRH: informe o tipo de deficiência (${text(guest.name) || "hóspede"}).`);
        const nome = text(guest.name).toUpperCase();
        if (!nome) return fail(400, "Nome do hóspede é obrigatório para FNRH");
        const hosp: Record<string, unknown> = {
          is_principal: Boolean(guest.is_main_guest),
          situacao_hospede: situacao,
          check_in_em: checkInEm,
          check_out_em: "",
          dados_pessoais: {
            nome,
            nome_social: text(guest.nome_social),
            PaisNacionalidade_id: paisNac || "BR",
            genero_id: generoId,
            GeneroDescricao: generoId === "OUTRO" ? generoDescricao : text(guest.GeneroDescricao),
            data_nascimento: birth ? birth.toISOString().slice(0, 10) : "1900-01-01",
            raca_id: text(guest.fnrh_raca_id) || text(settings.default_raca_id) || "NAOINFORMAR",
            deficiencia_id: defId,
            tipo_deficiencia_id: defId === "SIM" ? tipoDef : "",
            documento_id: { numero_documento: document.numero, tipo_documento_id: document.tipo },
            contato: {
              email: text(guest.email).slice(0, 200),
              telefone: onlyDigits(guest.phone),
              cep,
              logradouro: text(guest.street),
              numero: text(guest.number),
              complemento: text(guest.complement),
              bairro: text(guest.neighborhood),
              PaisResidencia_id: paisRes || "BR",
              cidade_id: paisRes === "BR" ? cidadeId : null,
              estado_id: paisRes === "BR" ? ufFromCep || text(guest.state).toUpperCase().slice(0, 2) : "",
            },
          },
          dados_ficha: {
            motivo_viagem_id: text(guest.fnrh_motivo_viagem_id) || text(settings.default_motivo_viagem_id) || "LAZER_FERIAS",
            meio_transporte_id: text(guest.fnrh_meio_transporte_id) || text(settings.default_meio_transporte_id) || "AUTOMOVEL",
          },
        };
        if (isMinor) {
          const responsible = onlyDigits(guest.responsavel_numero_documento);
          if (responsible.length < 4) return fail(400, `Hóspede menor: informe documento do responsável (campos FNRH) para ${nome}`);
          const type = text(guest.responsavel_tipo_documento_id || "CPF").toUpperCase();
          hosp.responsavel = { numero_documento: responsible, tipo_documento_id: type === "PASSAPORTE" ? "PASSAPORTE" : "CPF" };
        }
        dadosHospede.push(hosp);
      }

      const payload = {
        reserva: {
          numero_reserva: numeroReserva,
          numero_reserva_ota: origemOta ? numeroReserva : "",
          data_entrada: dateOnly(reservation.checkin_date),
          data_saida: dateOnly(reservation.checkout_date),
          quantidade_hospede_adulto: Math.max(1, Number(reservation.adults) || 1),
          quantidade_hospede_menor: Math.max(0, Number(reservation.children) || 0),
          origem_reserva_id: origemOta ? "OTA" : "MEIOHOSPEDAGEM",
        },
        dados_hospede: dadosHospede,
      };
      await this.prisma.fnrh_submission_log.create({
        data: {
          establishment_id: establishmentId,
          reservation_id: reservationId,
          web_checkin_id: webCheckinId,
          operation: "hospedagem_registrar",
          idempotency_key: idempotencyKey,
          status: "pending",
          request_sha256: sha256(JSON.stringify({ r: payload.reserva.numero_reserva, n: dadosHospede.length })),
        },
      });
      const response = await fetch(`${baseUrl}/hospedagem/registrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: basic(apiUser, secret.api_password), cpf_solicitante: cpf },
        body: JSON.stringify(payload),
      });
      const parsed = await readBody(response);
      const reservaId = String(((parsed.dados as GuestJson | undefined)?.reserva as GuestJson | undefined)?.reserva_id ?? "");
      if (!response.ok) {
        const error = String(parsed.mensagem || parsed.erro || "").slice(0, 400);
        await this.finish(idempotencyKey, { status: "failed", http_status: response.status, error_message: error, response_summary: { status: response.status, keys: Object.keys(parsed) } });
        return ok({ success: false, error, http_status: response.status, idempotency_key: idempotencyKey });
      }
      const hospedeIds = extractHospedeIds(parsed);
      for (let index = 0; index < rows.length && index < hospedeIds.length; index += 1) {
        await this.prisma.web_checkin_guests.update({ where: { id: rows[index].id }, data: { fnrh_hospede_id: hospedeIds[index] } });
      }
      await this.finish(idempotencyKey, { status: "success", http_status: response.status, fnrh_reserva_id: reservaId || null, response_summary: { reserva_id: reservaId || null, fnrh_hospede_ids: hospedeIds }, error_message: null });
      await this.markRegistered(webCheckinId);
      return ok({ success: true, fnrh_reserva_id: reservaId || null, idempotency_key: idempotencyKey });
    } catch (error) {
      return fail(500, error instanceof Error ? error.message : "Erro interno");
    }
  }

  async lifecycle(authorization: string | undefined, body: Record<string, unknown>): Promise<Result> {
    const reservationId = String(body.reservation_id ?? "").trim();
    const action = body.action;
    if (!reservationId || (action !== "checkout" && action !== "cancel" && action !== "noshow")) {
      return fail(400, "Informe reservation_id e action: checkout | cancel | noshow");
    }
    try {
      const reservation = await this.prisma.reservations.findUnique({ where: { id: reservationId }, select: { establishment_id: true } });
      let establishmentId = reservation?.establishment_id ?? null;
      if (establishmentId && !(await this.canAccess(authorization, establishmentId))) establishmentId = null;
      const token = String(body.web_checkin_token ?? "").trim();
      if (!establishmentId && token) {
        const webCheckin = await this.prisma.web_checkin.findFirst({ where: { token, reservation_id: reservationId }, select: { id: true } });
        if (webCheckin) establishmentId = reservation?.establishment_id ?? null;
      }
      if (!establishmentId) return fail(403, "Sem acesso a esta reserva. Use sessão do hóspede ou envie web_checkin_token do fluxo.");
      const settings = await this.prisma.establishment_fnrh_settings.findUnique({ where: { establishment_id: establishmentId } });
      if (!settings?.enabled) return ok({ success: true, skipped: true, reason: "fnrh_disabled" });
      const secret = await this.prisma.establishment_fnrh_secrets.findUnique({ where: { establishment_id: establishmentId }, select: { api_password: true } });
      const apiUser = settings.api_username?.trim();
      if (!apiUser || !secret?.api_password) return ok({ success: true, skipped: true, reason: "credentials_incomplete" });
      const cpf = onlyDigits(settings.cpf_solicitante);
      if (!cpf || !isValidCpf(cpf)) return fail(400, "CPF do solicitante (FNRH) inválido nas configurações do estabelecimento.");
      const baseUrl = fnrhBase(settings.environment, settings.base_url_override);
      const registered = await this.prisma.fnrh_submission_log.findFirst({
        where: { reservation_id: reservationId, operation: "hospedagem_registrar", status: "success", fnrh_reserva_id: { not: null } },
        orderBy: { created_at: "desc" },
        select: { fnrh_reserva_id: true },
      });
      const fnrhReservaId = registered?.fnrh_reserva_id?.trim() || "";
      if (!fnrhReservaId) return ok({ success: true, skipped: true, reason: "no_fnrh_reserva", message: "Reserva ainda não consta na FNRH (sem envio hospedagem/registrar bem-sucedido)." });
      if (action === "noshow") return this.noShow(establishmentId, reservationId, fnrhReservaId, baseUrl, apiUser, secret.api_password, cpf);
      return this.checkoutOrCancel(action, establishmentId, reservationId, fnrhReservaId, baseUrl, apiUser, secret.api_password, cpf);
    } catch (error) {
      return fail(500, error instanceof Error ? error.message : "Erro interno");
    }
  }

  private async noShow(establishmentId: string, reservationId: string, fnrhReservaId: string, baseUrl: string, apiUser: string, apiPass: string, cpf: string): Promise<Result> {
    const webCheckins = await this.prisma.web_checkin.findMany({ where: { reservation_id: reservationId }, orderBy: { created_at: "desc" }, take: 8, select: { id: true } });
    const guests = webCheckins.length
      ? await this.prisma.web_checkin_guests.findMany({ where: { web_checkin_id: { in: webCheckins.map((row) => row.id) }, fnrh_hospede_id: { not: null } }, select: { fnrh_hospede_id: true } })
      : [];
    const hospedeIds = [...new Set(guests.map((guest) => guest.fnrh_hospede_id?.trim()).filter((id): id is string => Boolean(id)))];
    const patch = (path: string, operation: string, extra: string) => this.patchOnce({ establishmentId, reservationId, webCheckinId: webCheckins[0]?.id ?? null, baseUrl, path, operation, extra, fnrhReservaId, apiUser, apiPass, cpf });
    if (hospedeIds.length) {
      for (const id of hospedeIds) {
        const result = await patch(`/hospedes/${encodeURIComponent(id)}/noshow`, "hospede_noshow", id);
        if (!result.ok) return ok({ success: false, error: result.error ?? "Falha ao informar no-show na FNRH (hóspede)", http_status: result.http });
      }
      return ok({ success: true, action: "noshow", mode: "hospedes", count: hospedeIds.length });
    }
    const result = await patch(`/reservas/${encodeURIComponent(fnrhReservaId)}/noshow`, "reserva_noshow", fnrhReservaId);
    if (!result.ok) return ok({ success: false, error: result.error ?? "Falha ao informar no-show na FNRH (reserva)", http_status: result.http });
    return ok({ success: true, action: "noshow", mode: "reserva" });
  }

  private async checkoutOrCancel(action: "checkout" | "cancel", establishmentId: string, reservationId: string, fnrhReservaId: string, baseUrl: string, apiUser: string, apiPass: string, cpf: string): Promise<Result> {
    const operation = action === "checkout" ? "reserva_checkout" : "reserva_cancelar";
    const key = sha256(`${establishmentId}:${reservationId}:${operation}`);
    const previous = await this.prisma.fnrh_submission_log.findFirst({ where: { idempotency_key: key, status: "success" }, select: { id: true } });
    if (previous) return ok({ success: true, skipped: true, reason: "already_synced", idempotency_key: key });
    await this.prisma.fnrh_submission_log.deleteMany({ where: { idempotency_key: key } });
    const webCheckin = await this.prisma.web_checkin.findFirst({ where: { reservation_id: reservationId }, orderBy: { created_at: "desc" }, select: { id: true } });
    await this.prisma.fnrh_submission_log.create({ data: { establishment_id: establishmentId, reservation_id: reservationId, web_checkin_id: webCheckin?.id, operation, idempotency_key: key, status: "pending" } });
    const path = action === "checkout" ? `/reservas/${encodeURIComponent(fnrhReservaId)}/checkout` : `/reservas/${encodeURIComponent(fnrhReservaId)}/cancelar`;
    const response = action === "checkout"
      ? await fetch(`${baseUrl}${path}`, { method: "POST", headers: { Authorization: basic(apiUser, apiPass), cpf_solicitante: cpf, "Content-Type": "text/plain" }, body: new Date().toISOString() })
      : await fetch(`${baseUrl}${path}`, { method: "POST", headers: { Authorization: basic(apiUser, apiPass), cpf_solicitante: cpf } });
    const parsed = await readBody(response);
    if (!response.ok) {
      const error = String(parsed.mensagem || parsed.erro || "").slice(0, 400);
      await this.finish(key, { status: "failed", http_status: response.status, error_message: error, response_summary: { status: response.status } });
      return ok({ success: false, error, http_status: response.status, idempotency_key: key });
    }
    await this.finish(key, { status: "success", http_status: response.status, fnrh_reserva_id: fnrhReservaId, response_summary: { action }, error_message: null });
    return ok({ success: true, action, idempotency_key: key });
  }

  private async patchOnce(input: { establishmentId: string; reservationId: string; webCheckinId: string | null; baseUrl: string; path: string; operation: string; extra: string; fnrhReservaId: string; apiUser: string; apiPass: string; cpf: string }) {
    const key = sha256(`${input.establishmentId}:${input.reservationId}:${input.operation}:${input.extra}`);
    const previous = await this.prisma.fnrh_submission_log.findFirst({ where: { idempotency_key: key, status: "success" }, select: { id: true } });
    if (previous) return { ok: true };
    await this.prisma.fnrh_submission_log.deleteMany({ where: { idempotency_key: key } });
    await this.prisma.fnrh_submission_log.create({ data: { establishment_id: input.establishmentId, reservation_id: input.reservationId, web_checkin_id: input.webCheckinId, operation: input.operation, idempotency_key: key, status: "pending" } });
    const response = await fetch(`${input.baseUrl}${input.path}`, { method: "PATCH", headers: { Authorization: basic(input.apiUser, input.apiPass), cpf_solicitante: input.cpf, "Content-Type": "application/json" }, body: "{}" });
    const parsed = await readBody(response);
    if (!response.ok) {
      const error = String(parsed.mensagem || parsed.erro || "").slice(0, 400);
      await this.finish(key, { status: "failed", http_status: response.status, error_message: error, response_summary: { status: response.status } });
      return { ok: false, error, http: response.status };
    }
    await this.finish(key, { status: "success", http_status: response.status, fnrh_reserva_id: input.fnrhReservaId, response_summary: { action: "noshow", op: input.operation }, error_message: null });
    return { ok: true };
  }

  private async canAccess(authorization: string | undefined, establishmentId: string): Promise<boolean> {
    const userId = await this.identity.resolve(authorization);
    if (!userId) return false;
    try {
      await this.auth.assertEstablishment(await this.auth.me(userId), establishmentId);
      return true;
    } catch {
      return false;
    }
  }

  private async markRegistered(webCheckinId: string | null) {
    if (!webCheckinId) return;
    await this.prisma.web_checkin.update({ where: { id: webCheckinId }, data: { fnrh_registered_at: new Date() } });
  }

  private async finish(key: string, data: Prisma.fnrh_submission_logUpdateInput) {
    await this.prisma.fnrh_submission_log.update({ where: { idempotency_key: key }, data });
  }
}

function ok(body: Record<string, unknown>): Result {
  return { status: 200, body };
}

function fail(status: number, error: string): Result {
  return { status, body: { success: false, error } };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function basic(user: string, pass: string): string {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;
}

function fnrhBase(environment: string, override: string | null): string {
  const raw = (override?.trim() || (environment === "homologation" ? FNRH_BASE_HOMOLOG : FNRH_BASE_PROD)).replace(/\/$/, "");
  return raw.replace(/\/rest\/v1\b/i, "/rest/v2");
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let index = 0; index < 9; index += 1) sum += Number(cpf[index]) * (10 - index);
  let digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  if (digit !== Number(cpf[9])) return false;
  sum = 0;
  for (let index = 0; index < 10; index += 1) sum += Number(cpf[index]) * (11 - index);
  digit = (sum * 10) % 11;
  if (digit === 10) digit = 0;
  return digit === Number(cpf[10]);
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function rowToJson(row: Record<string, unknown>): GuestJson {
  const json: GuestJson = {};
  for (const [key, value] of Object.entries(row)) json[key] = value instanceof Date ? value.toISOString().slice(0, 10) : value;
  return json;
}

function parseBirth(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageYears(birth: Date, ref: Date): number {
  let age = ref.getFullYear() - birth.getFullYear();
  const month = ref.getMonth() - birth.getMonth();
  if (month < 0 || (month === 0 && ref.getDate() < birth.getDate())) age -= 1;
  return age;
}

function parseCity(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.replace(/\D/g, "")) {
    const parsed = Number.parseInt(value.replace(/\D/g, ""), 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function mapDocumento(guest: GuestJson): { tipo: "CPF" | "PASSAPORTE"; numero: string } | null {
  const docType = text(guest.document_type || guest.documento_id).toLowerCase();
  const cpfField = onlyDigits(guest.cpf);
  const docNum = text(guest.document_number).replace(/\s/g, "");
  if (docType === "cpf" || (cpfField.length === 11 && !docNum)) {
    const number = cpfField.length === 11 ? cpfField : onlyDigits(docNum);
    return number.length === 11 ? { tipo: "CPF", numero: number } : null;
  }
  if (docType === "passport" || docType === "passaporte") {
    const number = docNum || cpfField;
    return number.length >= 4 ? { tipo: "PASSAPORTE", numero: number.toUpperCase() } : null;
  }
  const digits = onlyDigits(docNum || cpfField);
  if (digits.length === 11) return { tipo: "CPF", numero: digits };
  return docNum.length >= 4 ? { tipo: "PASSAPORTE", numero: docNum.toUpperCase() } : null;
}

function toIsoAlpha2(value: unknown, fallback: string): string {
  const safe = /^[A-Z]{2}$/.test(fallback) ? fallback : "BR";
  const raw = text(value).toUpperCase();
  if (!raw || raw === "OTHER" || raw === "OUTRO" || raw === "OT") return safe;
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  const alpha3: Record<string, string> = { BRA: "BR", ARG: "AR", CHL: "CL", COL: "CO", PER: "PE", URY: "UY", PRY: "PY", MEX: "MX", PRT: "PT", ESP: "ES", FRA: "FR", ITA: "IT", DEU: "DE", GBR: "GB", CAN: "CA", AUS: "AU", JPN: "JP", CHN: "CN", USA: "US" };
  if (alpha3[raw]) return alpha3[raw];
  if (raw.startsWith("BRAS") || raw.startsWith("BRAZIL")) return "BR";
  if (raw.startsWith("UNITED") || raw.startsWith("ESTADOS UNID")) return "US";
  const prefixes: Array<[string, string]> = [["ARGENT", "AR"], ["CHILE", "CL"], ["COLOMB", "CO"], ["PERU", "PE"], ["URUGU", "UY"], ["PARAGU", "PY"], ["MEXIC", "MX"], ["PORTUGAL", "PT"], ["ESPANHA", "ES"], ["SPAIN", "ES"], ["FRAN", "FR"], ["ITAL", "IT"], ["GERMAN", "DE"], ["JAPAN", "JP"], ["CHINA", "CN"], ["CANAD", "CA"], ["AUSTRAL", "AU"], ["REINO UNIDO", "GB"], ["UNITED KINGDOM", "GB"]];
  return prefixes.find(([prefix]) => raw.startsWith(prefix))?.[1] ?? safe;
}

function extractHospedeIds(parsed: GuestJson): string[] {
  const dados = parsed.dados as GuestJson | undefined;
  if (!dados) return [];
  const ids: string[] = [];
  const push = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const id = (value as GuestJson).hospede_id ?? (value as GuestJson).Hospede_id;
    if (typeof id === "string" && id.trim()) ids.push(id.trim());
  };
  for (const key of ["hospede", "hospedes", "dados_hospede"]) {
    const list = dados[key];
    if (Array.isArray(list)) list.forEach(push);
    else push(list);
  }
  return ids;
}

async function readBody(response: Response): Promise<GuestJson> {
  const textBody = await response.text();
  try {
    return JSON.parse(textBody) as GuestJson;
  } catch {
    return { raw: textBody.slice(0, 500) };
  }
}

async function fetchCepGeo(cep: string): Promise<{ ibge: number | null; uf: string | null }> {
  const sources = [
    `https://opencep.com/v1/${cep}`,
    `https://viacep.com.br/ws/${cep}/json/`,
    `https://cep.awesomeapi.com.br/json/${cep}`,
  ];
  for (const url of sources) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const json = await fetchJson(url);
      const ibge = parseIbge(json?.ibge ?? json?.city_ibge);
      const ufRaw = json?.uf ?? json?.state;
      if (ibge !== null) return { ibge, uf: typeof ufRaw === "string" ? ufRaw.toUpperCase().slice(0, 2) : null };
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  return { ibge: null, uf: null };
}

function parseIbge(value: unknown): number | null {
  if (typeof value === "number" && value >= 1_000_000 && value <= 99_999_999) return Math.floor(value);
  if (typeof value === "string" && /^\d{7}$/.test(value.trim())) return Number.parseInt(value.trim(), 10);
  return null;
}

async function fetchJson(url: string): Promise<GuestJson | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; PMS-FNRH/1.0)" } });
    if (!response.ok) return null;
    const json = (await response.json()) as GuestJson;
    return json.erro ? null : json;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
