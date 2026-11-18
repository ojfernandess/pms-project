import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DataModule } from "../data/data.module";
import { BuklyReservationsService } from "./bukly-reservations.service";
import { BuklySyncService } from "./bukly-sync.service";
import { ChannelTemplatesService } from "./channel-templates.service";
import { CheckinChargeScheduleService } from "./checkin-charge-schedule.service";
import { CheckinChargeService } from "./checkin-charge.service";
import { ApplyDynamicPricingRulesService } from "./apply-dynamic-pricing-rules.service";
import { AiosellReservationsService } from "./aiosell-reservations.service";
import { AiosellSyncService } from "./aiosell-sync.service";
import { CheckoutRemindersService } from "./checkout-reminders.service";
import { ChannexOtaService } from "./channex-ota.service";
import { ChannexReservationsService } from "./channex-reservations.service";
import { ChannexSyncService } from "./channex-sync.service";
import { CompanyPublicApiService } from "./company-public-api.service";
import { CompanyWebhookService } from "./company-webhook.service";
import { DailyDigestService } from "./daily-digest.service";
import { EmailDispatchService } from "./email-dispatch.service";
import { EmployeeAuthService } from "./employee-auth.service";
import { FunctionsCompatController } from "./functions-compat.controller";
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
import { PlatformDomainsService } from "./platform-domains.service";

@Module({
  imports: [AuthModule, DataModule],
  controllers: [FunctionsCompatController],
  providers: [
    HealthCheckService,
    RobotsService,
    SiteSettingsService,
    GetReservationService,
    NoShowService,
    SitemapService,
    RatesDashboardService,
    CompanyWebhookService,
    StripePaymentsService,
    EmailDispatchService,
    RatesWorkerService,
    RenderHtmlService,
    ChannelTemplatesService,
    DailyDigestService,
    EmployeeAuthService,
    BuklySyncService,
    BuklyReservationsService,
    CompanyPublicApiService,
    FnrhService,
    StripeWebhookService,
    CheckinChargeService,
    CheckinChargeScheduleService,
    CheckoutRemindersService,
    ChannexOtaService,
    ChannexSyncService,
    ChannexReservationsService,
    AiosellSyncService,
    AiosellReservationsService,
    ApplyDynamicPricingRulesService,
    PlatformDomainsService,
  ],
  exports: [DailyDigestService, CheckoutRemindersService, PlatformDomainsService],
})
export class EdgeModule {}
