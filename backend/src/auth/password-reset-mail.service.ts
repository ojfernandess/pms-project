import { Injectable, Logger } from "@nestjs/common";
import { email_event_type, email_provider } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EmailDispatchService } from "../edge/email-dispatch.service";
import { SITE_SETTINGS_ID } from "../edge/robots.service";
import { renderEmailTemplate } from "../edge/email-template.util";

@Injectable()
export class PasswordResetMailService {
  private readonly logger = new Logger(PasswordResetMailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailDispatchService,
  ) {}

  async sendStaffReset(email: string, resetToken: string): Promise<boolean> {
    const base = await this.resolvePublicBaseUrl();
    const resetUrl = `${base}/login/reset-password?type=recovery&token=${encodeURIComponent(resetToken)}`;
    const subject = "Recuperação de senha — PMS";
    const html = staffResetHtml(resetUrl);
    return this.dispatch({
      to: email,
      toName: email.split("@")[0] || "Usuário",
      subject,
      html,
      text: `Acesse o link para redefinir sua senha: ${resetUrl}`,
    });
  }

  async sendGuestReset(input: {
    email: string;
    fullName?: string | null;
    resetToken: string;
  }): Promise<boolean> {
    const base = await this.resolvePublicBaseUrl();
    const resetUrl = `${base}/web-checkin/reset-password?token=${encodeURIComponent(input.resetToken)}`;
    const guestName = (input.fullName || input.email.split("@")[0] || "Hóspede").trim();

    const site = await this.prisma.site_settings.findUnique({ where: { id: SITE_SETTINGS_ID } });
    const settings = await this.prisma.email_settings.findFirst({ where: { is_active: true } });
    const template = await this.prisma.email_templates.findFirst({
      where: { event_type: email_event_type.guest_password_reset, is_active: true },
      orderBy: { updated_at: "desc" },
    });

    const variables: Record<string, string> = {
      guest_name: guestName,
      guest_email: input.email,
      reset_url: resetUrl,
      hotel_name: site?.site_title || "Hotel",
      hotel_email: settings?.sender_email || settings?.reply_to_email || "",
      hotel_phone: "",
      hotel_website: site?.pms_base_url || "",
      hotel_logo: site?.logo_url || "",
      logo_url: site?.logo_url || "",
    };

    let subject = "Recuperação de senha — Web Check-in";
    let html = guestResetHtml(guestName, resetUrl);
    if (template?.subject && template?.body_html) {
      subject = renderEmailTemplate(template.subject, variables);
      html = renderEmailTemplate(template.body_html, variables);
    }

    return this.dispatch({
      to: input.email,
      toName: guestName,
      subject,
      html,
      text: `Olá ${guestName}, acesse o link para redefinir sua senha: ${resetUrl}`,
      templateId: template?.id,
      eventType: "guest.password_reset",
    });
  }

  private async dispatch(input: {
    to: string;
    toName: string;
    subject: string;
    html: string;
    text: string;
    templateId?: string;
    eventType?: string;
  }): Promise<boolean> {
    const settings = await this.prisma.email_settings.findFirst({ where: { is_active: true } });
    if (!settings) {
      this.logger.warn("Password reset: email_settings inativo/ausente — e-mail não enviado");
      return false;
    }

    const payload = {
      to: input.to,
      to_name: input.toName,
      from: settings.sender_email,
      from_name: settings.sender_name,
      reply_to: settings.reply_to_email || settings.sender_email,
      subject: input.subject,
      html: input.html,
      text: input.text,
      api_key: settings.api_key || "",
      smtp_config: {
        host: settings.smtp_host || "",
        port: settings.smtp_port || 587,
        secure: Boolean(settings.smtp_secure),
        auth: { user: settings.smtp_username || "", pass: settings.smtp_password || "" },
      },
    };

    try {
      if (input.templateId && input.eventType) {
        await this.prisma.email_queue.create({
          data: {
            template_id: input.templateId,
            event_type: input.eventType as never,
            recipient_email: input.to,
            recipient_name: input.toName,
            subject: input.subject,
            body_html: input.html,
            body_text: input.text,
            status: "pending" as never,
            priority: 1,
          },
        });
      }
    } catch (error) {
      this.logger.warn(`Password reset queue skipped: ${error instanceof Error ? error.message : String(error)}`);
    }

    const result =
      settings.provider === email_provider.smtp
        ? await this.email.smtp("Bearer internal", payload)
        : settings.provider === email_provider.sendgrid
          ? await this.email.sendgrid(payload)
          : settings.provider === email_provider.resend
            ? await this.email.resend(payload)
            : { status: 400, body: { error: `Provedor não suportado: ${settings.provider}` } };

    if (result.status >= 300) {
      this.logger.warn(
        `Password reset send failed: ${JSON.stringify((result.body as { details?: string; error?: string }) || {})}`,
      );
      return false;
    }
    return true;
  }

  private async resolvePublicBaseUrl(): Promise<string> {
    const site = await this.prisma.site_settings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { pms_base_url: true, web_checkin_public_base_url: true },
    });
    const candidates = [
      site?.pms_base_url,
      site?.web_checkin_public_base_url,
      process.env.VITE_APP_URL,
      process.env.SITE_URL,
      process.env.PMS_PUBLIC_URL,
    ];
    for (const raw of candidates) {
      const value = String(raw || "").trim();
      if (!value || /supabase\.co|localhost|127\.0\.0\.1/.test(value)) continue;
      try {
        const url = new URL(value.startsWith("http") ? value : `https://${value}`);
        return url.origin;
      } catch {
        return value.replace(/\/$/, "");
      }
    }
    return "http://localhost:8080";
  }
}

function staffResetHtml(resetUrl: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table width="560" style="background:#fff;border-radius:8px;padding:32px;">
  <tr><td>
  <h1 style="margin:0 0 16px;font-size:22px;">Recuperação de senha</h1>
  <p style="margin:0 0 16px;color:#444;">Recebemos um pedido para redefinir a senha da sua conta no PMS.</p>
  <p style="margin:0 0 24px;"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;">Redefinir senha</a></p>
  <p style="margin:0 0 8px;color:#666;font-size:13px;">Se o botão não funcionar, copie e cole este link no navegador:</p>
  <p style="margin:0;color:#666;font-size:12px;word-break:break-all;">${escapeHtml(resetUrl)}</p>
  <p style="margin:24px 0 0;color:#999;font-size:12px;">O link expira em 1 hora. Se você não solicitou, ignore este e-mail.</p>
  </td></tr></table></td></tr></table></body></html>`;
}

function guestResetHtml(guestName: string, resetUrl: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#f5f5f5;padding:24px;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table width="560" style="background:#fff;border-radius:8px;padding:32px;">
  <tr><td>
  <h1 style="margin:0 0 16px;font-size:22px;">Recuperação de senha</h1>
  <p style="margin:0 0 16px;color:#444;">Olá <strong>${escapeHtml(guestName)}</strong>,</p>
  <p style="margin:0 0 16px;color:#444;">Use o botão abaixo para criar uma nova senha do Web Check-in.</p>
  <p style="margin:0 0 24px;"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;">Redefinir senha</a></p>
  <p style="margin:0;color:#666;font-size:12px;word-break:break-all;">${escapeHtml(resetUrl)}</p>
  <p style="margin:24px 0 0;color:#999;font-size:12px;">O link expira em 1 hora.</p>
  </td></tr></table></td></tr></table></body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
