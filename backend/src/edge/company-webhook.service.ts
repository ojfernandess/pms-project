import { createHmac } from "crypto";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CompanyWebhookService {
  constructor(private readonly prisma: PrismaService) {}

  async send(body: { establishment_id?: string; event?: string; payload?: unknown }) {
    if (!body.establishment_id || !body.event) {
      return { status: 400, body: { error: "establishment_id and event are required" } };
    }
    const establishment = await this.prisma.establishments.findUnique({
      where: { id: body.establishment_id },
      select: { company_id: true },
    });
    if (!establishment?.company_id) {
      return { status: 404, body: { error: "Establishment or company not found" } };
    }
    const company = await this.prisma.companies.findUnique({
      where: { id: establishment.company_id },
      select: { booking_engine_webhook_url: true, booking_engine_webhook_secret: true },
    });
    if (!company?.booking_engine_webhook_url?.trim()) {
      return { status: 200, body: { ok: true, message: "No webhook configured" } };
    }

    const webhookBody = JSON.stringify({
      event: body.event,
      payload: body.payload ?? null,
      timestamp: new Date().toISOString(),
    });
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-Event": body.event,
      "User-Agent": "PMS-BookingEngine-Webhook/1",
    };
    const secret = company.booking_engine_webhook_secret?.trim();
    if (secret) {
      headers["X-Webhook-Signature"] = `sha256=${createHmac("sha256", secret).update(webhookBody).digest("hex")}`;
    }

    const response = await fetch(company.booking_engine_webhook_url.trim(), {
      method: "POST",
      headers,
      body: webhookBody,
    });
    if (!response.ok) {
      const text = await response.text();
      return {
        status: 502,
        body: { ok: false, error: "Webhook delivery failed", status: response.status, response: text.slice(0, 500) },
      };
    }
    return { status: 200, body: { ok: true, status: response.status } };
  }
}
