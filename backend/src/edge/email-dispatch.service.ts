import { Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";

type ProviderBody = {
  to?: string;
  to_name?: string;
  from?: string;
  from_name?: string;
  reply_to?: string;
  subject?: string;
  html?: string;
  text?: string;
  api_key?: string;
  cc?: string[] | string;
  bcc?: string[] | string;
  smtp_config?: { host?: string; port?: number; secure?: boolean; auth?: { user?: string; pass?: string } };
};

@Injectable()
export class EmailDispatchService {
  async resend(body: ProviderBody) {
    const missing = missingFields(body);
    if (missing) return missing;
    if (!body.api_key?.trim()) {
      return { status: 400, body: { error: "Missing API Key", details: "API Key do Resend é obrigatória", hint: "Configure a API Key nas configurações de e-mail do PMS" } };
    }
    const payload: Record<string, unknown> = {
      from: body.from_name ? `${body.from_name} <${body.from}>` : body.from,
      to: body.to,
      subject: body.subject,
      html: body.html,
      ...(body.reply_to ? { reply_to: body.reply_to } : {}),
      ...(body.text ? { text: body.text } : {}),
      ...(Array.isArray(body.cc) && body.cc.length ? { cc: body.cc } : {}),
      ...(Array.isArray(body.bcc) && body.bcc.length ? { bcc: body.bcc } : {}),
    };
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${body.api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string; error?: { message?: string } };
      if (!response.ok) {
        return {
          status: response.status,
          body: { error: "Failed to send email via Resend", details: data.message || data.error?.message || `Erro HTTP ${response.status}`, hint: providerHint("Resend", response.status) },
        };
      }
      return { status: 200, body: { success: true, message: "Email sent successfully", id: data.id } };
    } catch (error) {
      return { status: 500, body: { error: "Failed to send email via Resend", details: error instanceof Error ? error.message : String(error) } };
    }
  }

  async sendgrid(body: ProviderBody) {
    const missing = missingFields(body);
    if (missing) return missing;
    if (!body.api_key?.trim()) {
      return { status: 400, body: { error: "Missing API Key", details: "API Key do SendGrid é obrigatória", hint: "Configure a API Key nas configurações de e-mail do PMS" } };
    }
    const personalizations: Record<string, unknown> = { to: [{ email: body.to, name: body.to_name || undefined }] };
    if (Array.isArray(body.cc) && body.cc.length) personalizations.cc = body.cc.map((email) => ({ email }));
    if (Array.isArray(body.bcc) && body.bcc.length) personalizations.bcc = body.bcc.map((email) => ({ email }));
    const payload = {
      personalizations: [personalizations],
      from: { email: body.from, name: body.from_name || undefined },
      reply_to: { email: body.reply_to || body.from },
      subject: body.subject,
      content: [{ type: "text/html", value: body.html }, ...(body.text ? [{ type: "text/plain", value: body.text }] : [])],
    };
    try {
      const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${body.api_key}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      const data = parseJson(text);
      if (!response.ok) {
        const details = data.errors?.[0]?.message || data.message || `Erro HTTP ${response.status}`;
        return { status: response.status, body: { error: "Failed to send email via SendGrid", details, hint: providerHint("SendGrid", response.status) } };
      }
      return { status: 200, body: { success: true, message: "Email sent successfully via SendGrid" } };
    } catch (error) {
      return { status: 500, body: { error: "Failed to send email via SendGrid", details: error instanceof Error ? error.message : String(error) } };
    }
  }

  async smtp(authorization: string | undefined, body: ProviderBody) {
    if (!authorization) return { status: 401, body: { error: "Missing authorization header" } };
    if (!body.to || !body.from || !body.subject || !body.html) {
      return { status: 400, body: { error: "Missing required fields", details: "Required: to, from, subject, html" } };
    }
    const smtp = body.smtp_config;
    if (!smtp?.host || !smtp.auth?.user || !smtp.auth?.pass) {
      return { status: 400, body: { error: "Missing SMTP configuration", details: "Required: smtp_config.host, smtp_config.auth.user, smtp_config.auth.pass" } };
    }
    const port = smtp.port || (smtp.secure ? 465 : 587);
    const cc = typeof body.cc === "string" ? splitList(body.cc) : [];
    const bcc = typeof body.bcc === "string" ? splitList(body.bcc) : [];
    try {
      const transport = nodemailer.createTransport({
        host: smtp.host,
        port,
        secure: Boolean(smtp.secure) || port === 465,
        auth: { user: smtp.auth.user, pass: smtp.auth.pass },
      });
      await transport.sendMail({
        from: body.from_name ? `${body.from_name} <${body.from}>` : body.from,
        to: body.to_name ? `${body.to_name} <${body.to}>` : body.to,
        subject: body.subject,
        html: body.html,
        text: body.text,
        replyTo: body.reply_to,
        cc: cc.length ? cc.join(", ") : undefined,
        bcc: bcc.length ? bcc.join(", ") : undefined,
      });
      return { status: 200, body: { success: true, message: "Email sent successfully" } };
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      return {
        status: 500,
        body: {
          error: "Failed to send email via SMTP",
          details,
          hint: smtpHint(details),
          recommendation: "Para uma solução mais confiável, considere usar Resend, SendGrid ou Mailgun que não requerem Edge Functions.",
        },
      };
    }
  }
}

function missingFields(body: ProviderBody) {
  const missing: string[] = [];
  if (!body.to) missing.push("to (destinatário)");
  if (!body.from) missing.push("from (remetente)");
  if (!body.subject) missing.push("subject (assunto)");
  if (!body.html) missing.push("html (corpo do e-mail)");
  if (!missing.length) return null;
  return { status: 400, body: { error: "Missing required fields", details: `Campos obrigatórios faltando: ${missing.join(", ")}`, hint: "Verifique se todos os dados foram enviados corretamente" } };
}

function providerHint(name: string, status: number): string {
  if (status === 401 || status === 403) return `API Key inválida ou sem permissão. Verifique sua API Key no ${name}.`;
  if (status === 422 || status === 400) return `Dados inválidos. Verifique o e-mail do remetente (deve ser de domínio verificado no ${name}) e destinatário.`;
  if (status === 429) return `Limite de envio excedido. Verifique seu plano no ${name}.`;
  return "";
}

function smtpHint(message: string): string {
  if (message.includes("auth") || message.includes("535")) return "Erro de autenticação. Verifique usuário e senha. Para Gmail, use App Password (não a senha normal).";
  if (message.includes("ECONNREFUSED") || message.includes("connect") || message.includes("timeout")) return "Erro de conexão. Verifique host e porta. Tente porta 465 (SSL) ou 587 (TLS). Verifique também se o firewall permite a conexão.";
  if (message.includes("certificate") || message.includes("TLS") || message.includes("SSL")) return "Erro de TLS/SSL. Verifique se 'secure' está configurado corretamente. Para porta 465 use SSL, para 587 use TLS.";
  return "Verifique: host, porta, credenciais e se o servidor SMTP está acessível";
}

function splitList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseJson(text: string): { errors?: Array<{ message?: string }>; message?: string } {
  try {
    return JSON.parse(text) as { errors?: Array<{ message?: string }>; message?: string };
  } catch {
    return { message: text };
  }
}
