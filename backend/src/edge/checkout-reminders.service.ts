import { Injectable } from "@nestjs/common";
import { email_event_type, email_status, reservation_status } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EmailDispatchService } from "./email-dispatch.service";
import { SITE_SETTINGS_ID } from "./robots.service";
import { buildWebCheckinLocatorUrl } from "../lib/web-checkin-public-url";
import {
  emailLogoVariables,
  pickEmailLogoUrl,
  renderEmailTemplate,
  resolveEstablishmentEmailTemplate,
  type ResolvedEmailTemplate,
} from "./email-template.util";

type RequestHints = { origin?: string; referer?: string; forwardedHost?: string; forwardedProto?: string };

@Injectable()
export class CheckoutRemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailDispatchService,
  ) {}

  async run(input: { days?: string | number; establishmentId?: string; hints: RequestHints }) {
    const days = Number.parseInt(String(input.days ?? "1"), 10) || 1;
    const target = new Date();
    target.setDate(target.getDate() + days);
    const targetDate = target.toISOString().split("T")[0];
    const next = new Date(`${targetDate}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const reservations = await this.prisma.reservations.findMany({
      where: {
        status: reservation_status.confirmed,
        checkout_date: { gte: new Date(`${targetDate}T00:00:00.000Z`), lt: next },
        ...(input.establishmentId ? { establishment_id: input.establishmentId } : {}),
      },
      select: {
        id: true,
        checkin_date: true,
        checkout_date: true,
        establishment_id: true,
        identification_number: true,
        reservation_code: true,
        guest_name: true,
        clients_reservations_guest_idToclients: { select: { email: true, full_name: true } },
        clients_reservations_client_idToclients: { select: { email: true, full_name: true } },
        ota_reservations: { select: { ota_guest_email: true, ota_guest_name: true }, take: 1 },
        rooms: { select: { room_number: true, name: true, room_categories: { select: { name: true, building_id: true } } } },
      },
    });
    if (!reservations.length) return { status: 200, body: { success: true, sent: 0, errors: 0, message: "Nenhuma reserva encontrada" } };
    const settings = await this.prisma.email_settings.findFirst({ where: { is_active: true } });
    if (!settings) return { status: 400, body: { success: false, error: "Configurações de e-mail não encontradas ou inativas" } };
    const site = await this.prisma.site_settings.findUnique({ where: { id: SITE_SETTINGS_ID } });
    let sent = 0;
    let errors = 0;
    let skippedDisabled = 0;
    const errorsDetails: Array<{ reservation_id: string; error: string }> = [];
    const today = new Date().toISOString().split("T")[0];
    const templateCache = new Map<string, ResolvedEmailTemplate | null>();

    for (const reservation of reservations) {
      try {
        const existing = await this.prisma.email_queue.findFirst({
          where: { reservation_id: reservation.id, event_type: email_event_type.checkout_reminder, created_at: { gte: new Date(`${today}T00:00:00.000Z`) } },
          select: { id: true },
        });
        if (existing) continue;

        const estId = reservation.establishment_id || "";
        let template: ResolvedEmailTemplate | null;
        if (templateCache.has(estId)) {
          template = templateCache.get(estId) ?? null;
        } else {
          template = await resolveEstablishmentEmailTemplate(
            this.prisma,
            "checkout.reminder",
            reservation.establishment_id,
          );
          templateCache.set(estId, template);
        }
        if (!template) {
          skippedDisabled += 1;
          continue;
        }

        const guest = reservation.clients_reservations_guest_idToclients;
        const payer = reservation.clients_reservations_client_idToclients;
        const ota = reservation.ota_reservations[0];
        const recipientEmail = guest?.email || payer?.email || ota?.ota_guest_email?.trim() || "";
        const recipientName = guest?.full_name || payer?.full_name || ota?.ota_guest_name?.trim() || reservation.guest_name?.trim() || "Hóspede";
        if (!recipientEmail) {
          errors += 1;
          errorsDetails.push({ reservation_id: reservation.id, error: "E-mail do destinatário não encontrado" });
          continue;
        }
        const hotel = reservation.establishment_id
          ? await this.prisma.hotel_settings.findFirst({ where: { establishment_id: reservation.establishment_id } })
          : null;
        const baseUrl = resolveBase(site?.pms_base_url, input.hints);
        const locator = reservation.reservation_code || String(reservation.identification_number || "");
        const buildingId = reservation.rooms?.room_categories?.building_id;
        const variables: Record<string, string> = {
          guest_name: recipientName,
          guest_email: recipientEmail,
          reservation_code: reservation.reservation_code,
          identification_number: reservation.identification_number ? `#${reservation.identification_number}` : reservation.reservation_code,
          checkin_date: formatBr(reservation.checkin_date),
          checkout_date: formatBr(reservation.checkout_date),
          room_number: reservation.rooms?.room_number || "",
          room_name: reservation.rooms?.name || reservation.rooms?.room_number || "",
          category_name: reservation.rooms?.room_categories?.name || "",
          hotel_name: hotel?.name || site?.site_title || "Hotel",
          hotel_email: hotel?.email || "",
          hotel_phone: hotel?.phone || hotel?.phone_number || "",
          hotel_whatsapp: hotel?.whatsapp || "",
          hotel_address: [hotel?.street, hotel?.number, hotel?.neighborhood, hotel?.city].filter(Boolean).join(", "),
          hotel_website: hotel?.website || "",
          ...emailLogoVariables(pickEmailLogoUrl(hotel?.logo_url, site?.logo_url)),
          web_checkin_link: locator ? buildWebCheckinLocatorUrl(locator, site) : "",
          policies_link: policiesLink(baseUrl, hotel?.name || "hotel", buildingId ? "building" : "establishment", buildingId || reservation.establishment_id),
        };
        const subject = renderEmailTemplate(template.subject, variables);
        const bodyHtml = renderEmailTemplate(template.body_html, variables);
        const queued = await this.prisma.email_queue.create({
          data: {
            template_id: template.id,
            event_type: email_event_type.checkout_reminder,
            recipient_email: recipientEmail,
            recipient_name: recipientName,
            subject,
            body_html: bodyHtml,
            variables,
            reservation_id: reservation.id,
            status: email_status.pending,
            priority: 1,
          },
        });
        await this.sendNow(queued.id, settings);
        sent += 1;
      } catch (error) {
        errors += 1;
        errorsDetails.push({ reservation_id: reservation.id, error: error instanceof Error ? error.message : "Erro desconhecido" });
      }
    }
    return {
      status: 200,
      body: {
        success: true,
        sent,
        errors,
        skippedDisabled,
        total: reservations.length,
        errorsDetails: errors ? errorsDetails : undefined,
      },
    };
  }

  private async sendNow(queueId: string, settings: { provider: string; api_key: string | null; sender_email: string; sender_name: string; reply_to_email: string | null; smtp_host: string | null; smtp_port: number | null; smtp_secure: boolean | null; smtp_username: string | null; smtp_password: string | null }) {
    const item = await this.prisma.email_queue.findUnique({ where: { id: queueId } });
    if (!item) return false;
    await this.prisma.email_queue.update({ where: { id: queueId }, data: { status: email_status.sending } });
    try {
      const payload = {
        to: item.recipient_email,
        to_name: item.recipient_name || undefined,
        from: settings.sender_email,
        from_name: settings.sender_name,
        reply_to: settings.reply_to_email || settings.sender_email,
        subject: item.subject,
        html: item.body_html,
        text: item.body_text || undefined,
        api_key: settings.api_key || "",
        smtp_config: { host: settings.smtp_host || "", port: settings.smtp_port || 587, secure: Boolean(settings.smtp_secure), auth: { user: settings.smtp_username || "", pass: settings.smtp_password || "" } },
      };
      const result = settings.provider === "smtp"
        ? await this.email.smtp("Bearer internal", payload)
        : settings.provider === "sendgrid"
          ? await this.email.sendgrid(payload)
          : settings.provider === "resend"
            ? await this.email.resend(payload)
            : settings.provider === "mailgun"
              ? await sendMailgun(item.recipient_email, item.subject, item.body_html, item.body_text, settings)
              : { status: 400, body: { error: `Provedor não suportado: ${settings.provider}` } };
      if (result.status >= 300) throw new Error(String((result.body as { error?: string; details?: string }).details || (result.body as { error?: string }).error || "Erro ao enviar e-mail"));
      await this.prisma.email_queue.update({ where: { id: queueId }, data: { status: email_status.sent, sent_at: new Date() } });
      return true;
    } catch (error) {
      const retry = (item.retry_count || 0) + 1;
      await this.prisma.email_queue.update({
        where: { id: queueId },
        data: { status: retry >= (item.max_retries || 3) ? email_status.failed : email_status.pending, error_message: error instanceof Error ? error.message : "Erro ao enviar e-mail", retry_count: retry },
      });
      return false;
    }
  }
}

function resolveBase(pmsBase: string | null | undefined, hints: RequestHints): string {
  if (pmsBase?.trim()) {
    try {
      return new URL(pmsBase.startsWith("http") ? pmsBase : `https://${pmsBase}`).origin;
    } catch {
      return pmsBase;
    }
  }
  const candidates = [hints.origin, hints.referer, hints.forwardedHost ? `${hints.forwardedProto || "https"}://${hints.forwardedHost}` : ""];
  for (const candidate of candidates) {
    if (!candidate || /supabase\.co|localhost|127\.0\.0\.1/.test(candidate)) continue;
    try {
      const url = new URL(candidate);
      return `${url.protocol}//${url.host}`;
    } catch {
      return candidate.replace(/\/$/, "");
    }
  }
  const envUrl = process.env.VITE_APP_URL || process.env.SITE_URL || "";
  if (envUrl.startsWith("http") && !envUrl.includes("supabase.co")) return envUrl.replace(/\/$/, "");
  return "http://localhost:8080";
}

function policiesLink(baseUrl: string, hotelName: string, type: string, id: string | null | undefined): string {
  if (!id) return "";
  const slug = hotelName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${baseUrl}/policies/${slug}/${Buffer.from(`${type}:${id}`).toString("base64")}`;
}

function formatBr(value: Date): string {
  return value.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

async function sendMailgun(to: string, subject: string, html: string, text: string | null, settings: { api_key: string | null; sender_email: string; sender_name: string; reply_to_email: string | null }) {
  const domain = settings.sender_email.split("@")[1];
  if (!settings.api_key || !domain) return { status: 400, body: { error: "Configuração Mailgun incompleta" } };
  const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`api:${settings.api_key}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ from: settings.sender_name ? `${settings.sender_name} <${settings.sender_email}>` : settings.sender_email, to, subject, html, ...(text ? { text } : {}), ...(settings.reply_to_email ? { "h:Reply-To": settings.reply_to_email } : {}) }),
  });
  return response.ok ? { status: 200, body: { success: true } } : { status: response.status, body: { error: await response.text() } };
}
