import { All, Body, Controller, Get, Headers, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApplyDynamicPricingRulesService } from "./apply-dynamic-pricing-rules.service";
import { AiosellReservationsService } from "./aiosell-reservations.service";
import { AiosellSyncService } from "./aiosell-sync.service";
import { BuklySyncService } from "./bukly-sync.service";
import { ChannexOtaService } from "./channex-ota.service";
import { ChannexReservationsService } from "./channex-reservations.service";
import { ChannexSyncService } from "./channex-sync.service";
import { ChannelTemplatesService } from "./channel-templates.service";
import { CheckinChargeScheduleService } from "./checkin-charge-schedule.service";
import { CheckinChargeService } from "./checkin-charge.service";
import { CheckoutRemindersService } from "./checkout-reminders.service";
import { CompanyPublicApiService } from "./company-public-api.service";
import { CompanyWebhookService } from "./company-webhook.service";
import { DailyDigestService } from "./daily-digest.service";
import { EmailDispatchService } from "./email-dispatch.service";
import { EmployeeAuthService } from "./employee-auth.service";
import { GetReservationService } from "./get-reservation.service";
import { NoShowService } from "./no-show.service";
import { RatesDashboardService } from "./rates-dashboard.service";
import { RatesWorkerService } from "./rates-worker.service";
import { RenderHtmlService } from "./render-html.service";
import { SitemapService } from "./sitemap.service";
import { FnrhService } from "./fnrh.service";
import { StripePaymentsService } from "./stripe-payments.service";
import { StripeWebhookService } from "./stripe-webhook.service";
import { HealthCheckService } from "./health-check.service";
import { RobotsService } from "./robots.service";
import { SiteSettingsService } from "./site-settings.service";

@Controller("functions/v1")
export class FunctionsCompatController {
  constructor(
    private readonly healthCheck: HealthCheckService,
    private readonly robots: RobotsService,
    private readonly siteSettings: SiteSettingsService,
    private readonly reservations: GetReservationService,
    private readonly noShows: NoShowService,
    private readonly sitemap: SitemapService,
    private readonly ratesDashboard: RatesDashboardService,
    private readonly companyWebhook: CompanyWebhookService,
    private readonly stripePayments: StripePaymentsService,
    private readonly email: EmailDispatchService,
    private readonly ratesWorker: RatesWorkerService,
    private readonly renderHtml: RenderHtmlService,
    private readonly channelTemplates: ChannelTemplatesService,
    private readonly dailyDigest: DailyDigestService,
    private readonly employeeAuth: EmployeeAuthService,
    private readonly bukly: BuklySyncService,
    private readonly companyApi: CompanyPublicApiService,
    private readonly fnrh: FnrhService,
    private readonly stripeWebhook: StripeWebhookService,
    private readonly checkinCharge: CheckinChargeService,
    private readonly checkinSchedule: CheckinChargeScheduleService,
    private readonly checkoutReminders: CheckoutRemindersService,
    private readonly channexOta: ChannexOtaService,
    private readonly channexSync: ChannexSyncService,
    private readonly channexReservations: ChannexReservationsService,
    private readonly aiosellSync: AiosellSyncService,
    private readonly aiosellReservations: AiosellReservationsService,
    private readonly applyDynamicPricing: ApplyDynamicPricingRulesService,
  ) {}

  @Get("health-check")
  @Post("health-check")
  async health(@Res() res: Response) {
    const result = await this.healthCheck.run();
    res.status(result.status === "unhealthy" ? 503 : 200).json(result);
  }

  @Get("robots")
  async robotsTxt(@Req() req: Request, @Query("domain") domain: string | undefined, @Query("host") host: string | undefined, @Query("company") company: string | undefined, @Res() res: Response) {
    const body = await this.robots.render({
      host: req.header("x-forwarded-host") || req.header("host"),
      domain: domain || host,
      company,
      origin: req.header("origin"),
    });
    res.status(200).type("text/plain; charset=utf-8").setHeader("Cache-Control", "public, max-age=3600").send(body);
  }

  @Get("get-site-settings")
  async settings(@Res() res: Response) {
    const body = await this.siteSettings.get();
    res.status(200).setHeader("Cache-Control", "public, max-age=300").json(body);
  }

  @Get("get-reservation")
  async reservationGet(
    @Headers("authorization") authorization: string | undefined,
    @Query("identifier") identifier: string | undefined,
    @Query("locator") locator: string | undefined,
    @Query("reservation_code") reservationCode: string | undefined,
    @Query("guest_account_id") guestAccountId: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.reservations.lookup({ authorization, identifier, locator, reservationCode, guestAccountId });
    res.status(result.status).json(result.body);
  }

  @Post("get-reservation")
  async reservationPost(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: { identifier?: string; locator?: string; reservation_code?: string; guest_account_id?: string },
    @Res() res: Response,
  ) {
    const result = await this.reservations.lookup({
      authorization,
      identifier: body?.identifier,
      locator: body?.locator,
      reservationCode: body?.reservation_code,
      guestAccountId: body?.guest_account_id,
    });
    res.status(result.status).json(result.body);
  }

  @Get("sitemap")
  async sitemapXml(@Req() req: Request, @Query("domain") domain: string | undefined, @Query("host") host: string | undefined, @Query("company") company: string | undefined, @Res() res: Response) {
    const xml = await this.sitemap.render({
      host: req.header("x-forwarded-host") || req.header("host"),
      domain: domain || host,
      company,
      origin: req.header("origin"),
    });
    res.status(200).type("application/xml; charset=utf-8").setHeader("Cache-Control", "public, max-age=3600").send(xml);
  }

  @Get("rates-dashboard")
  async dashboard(@Headers("authorization") authorization: string | undefined, @Query("establishment_id") establishmentId: string | undefined, @Res() res: Response) {
    const result = await this.ratesDashboard.run(authorization, establishmentId);
    res.status(result.status).json(result.body);
  }

  @Post("call-company-webhook")
  async companyWebhookCall(@Body() body: { establishment_id?: string; event?: string; payload?: unknown }, @Res() res: Response) {
    const result = await this.companyWebhook.send(body);
    res.status(result.status).json(result.body);
  }

  @Post("stripe-payment")
  async stripePayment(@Body() body: Record<string, unknown>, @Res() res: Response) {
    await this.reply(res, () => this.stripePayments.create(body));
  }

  @Post("stripe-payment-status")
  async stripeStatus(@Body() body: { payment_intent_id?: string; get_client_secret?: boolean }, @Res() res: Response) {
    await this.reply(res, () => this.stripePayments.status(body));
  }

  @Post("stripe-refund")
  async stripeRefund(@Body() body: { payment_id?: string; amount?: number; reason?: string; description?: string; establishment_id?: string }, @Res() res: Response) {
    await this.reply(res, () => this.stripePayments.refund(body));
  }

  @Post("send-email-resend")
  async emailResend(@Body() body: Record<string, unknown>, @Res() res: Response) {
    await this.reply(res, () => this.email.resend(body as never));
  }

  @Post("send-email-sendgrid")
  async emailSendgrid(@Body() body: Record<string, unknown>, @Res() res: Response) {
    await this.reply(res, () => this.email.sendgrid(body as never));
  }

  @Post("send-email-smtp")
  async emailSmtp(@Headers("authorization") authorization: string | undefined, @Body() body: Record<string, unknown>, @Res() res: Response) {
    await this.reply(res, () => this.email.smtp(authorization, body as never));
  }

  @Post("apply-dynamic-pricing-rules")
  async applyDynamicPricingRules(@Headers("authorization") authorization: string | undefined, @Body() body: unknown, @Res() res: Response) {
    await this.reply(res, () => this.applyDynamicPricing.run(authorization, body));
  }

  @Get("recalc-rates")
  @Post("recalc-rates")
  async recalc(@Headers("authorization") authorization: string | undefined, @Query("establishment_id") establishmentId: string | undefined, @Query("days_ahead") daysAhead: string | undefined, @Res() res: Response) {
    await this.reply(res, () => this.ratesWorker.recalc(authorization, establishmentId, daysAhead));
  }

  @Get("rates-map")
  async ratesMap(@Headers("authorization") authorization: string | undefined, @Query("establishment_id") establishmentId: string | undefined, @Query("start_date") startDate: string | undefined, @Query("end_date") endDate: string | undefined, @Res() res: Response) {
    await this.reply(res, () => this.ratesWorker.map(authorization, establishmentId, startDate, endDate));
  }

  @Get("render-html")
  async html(@Query("path") path: string | undefined, @Query("siteUrl") siteUrl: string | undefined, @Query("establishment_id") establishmentId: string | undefined, @Res() res: Response) {
    const html = await this.renderHtml.render({ path, siteUrl, establishmentId });
    res.status(200).type("text/html; charset=utf-8").setHeader("Cache-Control", "public, max-age=300").send(html);
  }

  @Post("list-channel-templates")
  async templates(@Body() body: { establishment_id?: string }, @Res() res: Response) {
    await this.reply(res, () => this.channelTemplates.list(body?.establishment_id));
  }

  @Post("send-daily-digest")
  async digest(@Body() body: { establishment_id?: string; date?: string }, @Res() res: Response) {
    await this.reply(res, () => this.dailyDigest.send(body || {}));
  }

  @Get("send-daily-digest-schedule")
  @Post("send-daily-digest-schedule")
  async digestSchedule(@Res() res: Response) {
    await this.reply(res, () => this.dailyDigest.schedule());
  }

  @Post("create-employee-auth")
  async createEmployee(@Headers("authorization") authorization: string | undefined, @Body() body: { email?: string; password?: string; full_name?: string; establishment_id?: string }, @Res() res: Response) {
    await this.reply(res, () => this.employeeAuth.create(authorization, body || {}));
  }

  @Post("employee-auth-admin")
  async employeeAdmin(@Headers("authorization") authorization: string | undefined, @Body() body: { action?: string; establishment_id?: string; user_ids?: string[]; user_id?: string }, @Res() res: Response) {
    await this.reply(res, () => this.employeeAuth.admin(authorization, body || {}));
  }

  @Post("bukly-sync")
  async buklySync(@Body() body: unknown, @Res() res: Response) {
    await this.reply(res, () => this.bukly.run(body));
  }

  @All("company-public-api")
  async publicApi(@Req() req: Request, @Res() res: Response) {
    const query: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.query)) query[key] = Array.isArray(value) ? String(value[0]) : value == null ? undefined : String(value);
    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) headers[key] = Array.isArray(value) ? value.join(",") : value;
    const result = await this.companyApi.run({ method: req.method, action: query.action, query, body: req.body, headers });
    if (typeof result.body === "string") res.status(result.status).send(result.body);
    else res.status(result.status).json(result.body);
  }

  @Post("fnrh-submit")
  async fnrhSubmit(@Headers("authorization") authorization: string | undefined, @Body() body: Record<string, unknown>, @Res() res: Response) {
    await this.reply(res, () => this.fnrh.submit(authorization, body || {}));
  }

  @Post("fnrh-lifecycle")
  async fnrhLifecycle(@Headers("authorization") authorization: string | undefined, @Body() body: Record<string, unknown>, @Res() res: Response) {
    await this.reply(res, () => this.fnrh.lifecycle(authorization, body || {}));
  }

  @Post("stripe-webhook")
  async stripeHook(@Req() req: Request & { rawBody?: Buffer }, @Headers("stripe-signature") signature: string | undefined, @Res() res: Response) {
    const raw = req.rawBody?.toString("utf8") || JSON.stringify(req.body ?? {});
    await this.reply(res, () => this.stripeWebhook.handle(raw, signature));
  }

  @Post("send-checkin-charge")
  async checkinChargeSend(@Body() body: unknown, @Res() res: Response) {
    await this.reply(res, () => this.checkinCharge.run(body));
  }

  @Get("send-checkin-charge-schedule")
  @Post("send-checkin-charge-schedule")
  async checkinChargeSchedule(@Query("establishment_id") establishmentId: string | undefined, @Res() res: Response) {
    await this.reply(res, () => this.checkinSchedule.run(establishmentId));
  }

  @Get("send-checkout-reminders")
  @Post("send-checkout-reminders")
  async checkoutReminder(@Req() req: Request, @Query("days") days: string | undefined, @Query("establishment_id") establishmentId: string | undefined, @Body() body: { days?: number | string; establishment_id?: string }, @Res() res: Response) {
    await this.reply(res, () => this.checkoutReminders.run({
      days: body?.days ?? days,
      establishmentId: body?.establishment_id || establishmentId,
      hints: { origin: req.header("origin") || undefined, referer: req.header("referer") || undefined, forwardedHost: req.header("x-forwarded-host") || undefined, forwardedProto: req.header("x-forwarded-proto") || undefined },
    }));
  }

  @Post("channex-ack-worker")
  async channexAck(@Headers("authorization") authorization: string | undefined, @Body() body: { channel_id?: string; establishment_id?: string }, @Res() res: Response) {
    await this.reply(res, () => this.channexOta.ack(authorization, body || {}));
  }

  @Post("channex-booking-crs-update")
  async channexBooking(@Body() body: { reservation_id?: string; category_id?: string; overbooking_context?: boolean }, @Res() res: Response) {
    await this.reply(res, () => this.channexOta.bookingCrsUpdate(body || {}));
  }

  @Post("channex-mapping-options")
  async channexMapping(@Headers("authorization") authorization: string | undefined, @Body() body: { channel_id?: string; establishment_id?: string }, @Res() res: Response) {
    await this.reply(res, () => this.channexOta.mappingOptions(authorization, body || {}));
  }

  @Post("channex-sync")
  async channexSyncRun(@Headers("authorization") authorization: string | undefined, @Body() body: unknown, @Res() res: Response) {
    await this.reply(res, () => this.channexSync.run(authorization, body));
  }

  @Post("channex-reservations-sync")
  async channexReservationsSync(@Headers("authorization") authorization: string | undefined, @Body() body: unknown, @Res() res: Response) {
    await this.reply(res, () => this.channexReservations.sync(authorization, body));
  }

  @Post("channex-reservation-webhook")
  async channexReservationWebhook(@Req() req: Request & { rawBody?: Buffer }, @Res() res: Response) {
    const raw = req.rawBody?.toString("utf8") || JSON.stringify(req.body ?? {});
    await this.reply(res, () => this.channexReservations.webhook(raw, headerMap(req)));
  }

  @Post("aiosell-sync")
  async aiosellSyncRun(@Headers("authorization") authorization: string | undefined, @Body() body: unknown, @Res() res: Response) {
    await this.reply(res, () => this.aiosellSync.run(authorization, body));
  }

  @Post("aiosell-reservations-sync")
  async aiosellReservationsSync(@Headers("authorization") authorization: string | undefined, @Body() body: unknown, @Res() res: Response) {
    await this.reply(res, () => this.aiosellReservations.sync(authorization, body));
  }

  @Post("aiosell-reservation-webhook")
  async aiosellReservationWebhook(@Req() req: Request & { rawBody?: Buffer }, @Res() res: Response) {
    const raw = req.rawBody?.toString("utf8") || JSON.stringify(req.body ?? {});
    const headers = headerMap(req);
    headers["x-request-url"] = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    await this.reply(res, () => this.aiosellReservations.webhook(raw, headers));
  }

  @Post("process-no-shows")
  async processNoShows(@Body() body: { establishment_id?: string | null }, @Res() res: Response) {
    const result = await this.noShows.run(body?.establishment_id ?? null);
    res.status(200).json(result);
  }

  private async reply(res: Response, work: () => Promise<{ status: number; body: unknown }>) {
    try {
      const result = await work();
      res.status(result.status).json(result.body);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Erro interno" });
    }
  }

  @All(":name")
  notMigrated(@Req() req: Request, @Res() res: Response) {
    const name = req.params.name;
    res.status(501).json({
      error: "Not migrated",
      function: name,
      message: "Esta Edge Function ainda não foi transferida para o NestJS.",
    });
  }
}

function headerMap(req: Request): Record<string, string | undefined> {
  const headers: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(req.headers)) headers[key] = Array.isArray(value) ? value.join(",") : value;
  return headers;
}
