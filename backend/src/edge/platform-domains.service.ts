import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { promises as dns } from "dns";
import type { Request } from "express";
import type { SessionUser } from "../auth/auth.service";
import {
  generateDomainVerificationToken,
  hostnameFromUrlOrHost,
  normalizeHostname,
  resolveRequestHostname,
  verificationTxtRecordName,
  verificationTxtValue,
} from "../lib/hostname.util";
import { PrismaService } from "../prisma/prisma.service";
import { canAccessCompany } from "../auth/access-scope";
import { SITE_SETTINGS_ID } from "./robots.service";
import type { HostnameResolution, PlatformDomainStatus } from "./platform-domains.types";
import { buildBookingEngineTraefikHostRule } from "../lib/booking-engine-traefik.util";
import { probeHttpsCertificate } from "../lib/https-probe";
import { BookingEngineHostsService } from "./booking-engine-hosts.service";
import { BookingEngineInfraSyncService } from "../infra/booking-engine-infra-sync.service";
import { InfraSyncQueueService } from "../queues/infra-sync-queue.service";

type DomainRow = {
  id: string;
  hostname: string;
  company_id: string | null;
  service_type: string;
  status: string;
  verification_token: string;
  ownership_verified_at: Date | null;
  dns_last_checked_at: Date | null;
  dns_status: string | null;
  ssl_status: string | null;
  ssl_expires_at: Date | null;
  last_error: string | null;
  infra_cname_target: string | null;
  infra_a_target: string | null;
  created_at: Date;
  updated_at: Date;
  companies?: { name: string | null } | null;
};

@Injectable()
export class PlatformDomainsService {
  private readonly logger = new Logger(PlatformDomainsService.name);
  private tableReady: boolean | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly bookingHosts: BookingEngineHostsService,
    private readonly infraSync: BookingEngineInfraSyncService,
    private readonly infraQueue: InfraSyncQueueService,
  ) {}

  private async assertTableReady(): Promise<boolean> {
    if (this.tableReady === true) return true;
    if (this.tableReady === false) return false;
    try {
      const rows = await this.prisma.$queryRaw<{ reg: string | null }[]>`
        SELECT to_regclass('public.platform_custom_domains')::text AS reg
      `;
      this.tableReady = Boolean(rows[0]?.reg);
    } catch {
      this.tableReady = false;
    }
    return this.tableReady;
  }

  assertSuperAdmin(user: SessionUser) {
    if (!user.isSuperAdmin) {
      throw new ForbiddenException("Apenas Super Admin pode gerenciar domínios personalizados");
    }
  }

  infrastructureHints() {
    const publicApp = this.config.get<string>("PUBLIC_APP_URL") || this.config.get<string>("SITE_URL");
    const pmsHosts = this.collectPmsHostnames(null);
    const fromEnv =
      this.config.get<string>("PLATFORM_DNS_CNAME_TARGET")?.trim() ||
      hostnameFromUrlOrHost(publicApp);
    const cnameTarget =
      fromEnv && pmsHosts.has(normalizeHostname(fromEnv))
        ? fromEnv
        : [...pmsHosts].find((h) => !h.startsWith("www.")) || fromEnv || null;
    const aTarget = this.config.get<string>("PLATFORM_DNS_A_TARGET")?.trim() || null;
    return { cnameTarget, aTarget, pmsPublicUrl: publicApp?.trim() || null, pmsHosts };
  }

  async resolveFromRequest(req: Request, visitorHostname?: string): Promise<HostnameResolution> {
    const fromQuery = visitorHostname?.trim();
    const fromHeader = req.header("x-pms-visitor-host")?.trim();
    const hostname =
      (fromQuery && this.isPlausibleHostname(fromQuery) ? fromQuery : null) ||
      (fromHeader && this.isPlausibleHostname(fromHeader) ? fromHeader : null) ||
      resolveRequestHostname(req);
    return this.resolveHostname(hostname);
  }

  private isPlausibleHostname(value: string): boolean {
    const h = normalizeHostname(value);
    return Boolean(h && h.length <= 253 && /^[a-z0-9.-]+$/.test(h) && h.includes("."));
  }

  /** Todos os hostnames do painel PMS (evita bloquear pms.* quando site_settings tem URL antiga). */
  private collectPmsHostnames(pmsBaseUrl?: string | null): Set<string> {
    const hosts = new Set<string>();
    const add = (raw?: string | null) => {
      const h = hostnameFromUrlOrHost(raw);
      if (h) hosts.add(h);
    };
    add(pmsBaseUrl);
    add(this.config.get<string>("PUBLIC_APP_URL"));
    add(this.config.get<string>("SITE_URL"));
    add(this.config.get<string>("VITE_APP_URL"));
    return hosts;
  }

  async resolveHostname(hostnameInput: string): Promise<HostnameResolution> {
    const hostname = normalizeHostname(hostnameInput);
    if (!hostname) {
      return {
        hostname: "",
        mode: "unconfigured",
        active: false,
        message: "Hostname inválido",
      };
    }

    const settings = await this.prisma.site_settings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { pms_base_url: true, web_checkin_public_base_url: true },
    });

    const pmsHosts = this.collectPmsHostnames(settings?.pms_base_url);
    const legacyCheckinHost = hostnameFromUrlOrHost(settings?.web_checkin_public_base_url);

    if (pmsHosts.has(hostname)) {
      return {
        hostname,
        mode: "pms",
        active: true,
        internal_path: "/",
      };
    }

    if (legacyCheckinHost && hostname === legacyCheckinHost) {
      return {
        hostname,
        mode: "web_checkin",
        service_type: "web_checkin",
        active: true,
        internal_path: "/",
      };
    }

    const booking = await this.prisma.companies.findFirst({
      where: {
        booking_engine_custom_domain: { equals: hostname, mode: "insensitive" },
        booking_engine_enabled: true,
      },
      select: { id: true, name: true },
    });
    if (booking) {
      return {
        hostname,
        mode: "booking_engine",
        service_type: "booking_engine",
        company_id: booking.id,
        company_name: booking.name,
        active: true,
        internal_path: "/",
      };
    }

    const tableOk = await this.assertTableReady();
    if (tableOk) {
      const domain = await this.prisma.platform_custom_domains.findUnique({
        where: { hostname },
        include: { companies: { select: { name: true } } },
      });

      if (domain) {
        if (domain.status === "suspended") {
          return {
            hostname,
            mode: "suspended",
            service_type: domain.service_type as "web_checkin" | "booking_engine",
            company_id: domain.company_id,
            company_name: domain.companies?.name ?? null,
            active: false,
            message: "Domínio suspenso",
          };
        }

        const verified = Boolean(domain.ownership_verified_at);
        const active = domain.status === "active" && verified;

        if (domain.service_type === "web_checkin" && active) {
          return {
            hostname,
            mode: "web_checkin",
            service_type: "web_checkin",
            company_id: domain.company_id,
            company_name: domain.companies?.name ?? null,
            active: true,
            internal_path: "/",
          };
        }

        if (domain.service_type === "web_checkin" && !active) {
          return {
            hostname,
            mode: "pending",
            service_type: "web_checkin",
            company_id: domain.company_id,
            company_name: domain.companies?.name ?? null,
            active: false,
            message: domain.last_error || "Domínio aguardando validação DNS/TXT",
            diagnosis: this.buildDiagnosisFromRow(domain),
          };
        }

        if (domain.service_type === "booking_engine" && active) {
          return {
            hostname,
            mode: "booking_engine",
            service_type: "booking_engine",
            company_id: domain.company_id,
            company_name: domain.companies?.name ?? null,
            active: true,
            internal_path: "/",
          };
        }

        if (domain.service_type === "booking_engine" && !active) {
          return {
            hostname,
            mode: "pending",
            service_type: "booking_engine",
            company_id: domain.company_id,
            company_name: domain.companies?.name ?? null,
            active: false,
            message: domain.last_error || "Domínio do motor aguardando DNS/SSL (Traefik)",
            diagnosis: this.buildDiagnosisFromRow(domain),
          };
        }
      }
    }

    // Host desconhecido que chegou ao mesmo frontend/nginx — não expor o PMS
    const hasDedicatedCheckin =
      Boolean(legacyCheckinHost) ||
      (tableOk &&
        (await this.prisma.platform_custom_domains.count({
          where: { service_type: "web_checkin" },
        })) > 0);

    if (pmsHosts.size > 0 && hasDedicatedCheckin) {
      return {
        hostname,
        mode: "unconfigured",
        active: false,
        message:
          "Este domínio aponta para a infraestrutura do PMS, mas não está cadastrado ou validado para nenhum serviço.",
        diagnosis: [
          "Cadastre o domínio em Super Admin → Domínios personalizados",
          "Configure o TXT de verificação e registros DNS indicados",
          "Adicione o host no Traefik/Dokploy (Domains → frontend:80)",
        ],
      };
    }

    return {
      hostname,
      mode: "pms",
      active: true,
      internal_path: "/",
    };
  }

  private buildDiagnosisFromRow(domain: DomainRow): string[] {
    const lines: string[] = [];
    if (!domain.ownership_verified_at) {
      lines.push("Propriedade do domínio (TXT) ainda não validada");
    }
    if (domain.status !== "active") {
      lines.push(`Status operacional: ${domain.status}`);
    }
    if (domain.dns_status === "failed") {
      lines.push("DNS não aponta para o destino esperado da infraestrutura");
    }
    if (domain.ssl_status === "failed") {
      lines.push("HTTPS/SSL indisponível ou inválido neste hostname");
    }
    if (domain.last_error) {
      lines.push(domain.last_error);
    }
    return lines;
  }

  async listAll(user: SessionUser) {
    this.assertSuperAdmin(user);
    if (!(await this.assertTableReady())) return [];
    const rows = await this.prisma.platform_custom_domains.findMany({
      orderBy: { created_at: "desc" },
      include: {
        companies: { select: { id: true, name: true } },
      },
    });
    const hints = this.infrastructureHints();
    return rows.map((row) => this.serializeDomain(row, hints));
  }

  async create(
    user: SessionUser,
    input: {
      hostname: string;
      company_id?: string | null;
      service_type?: "web_checkin" | "booking_engine";
    },
  ) {
    this.assertSuperAdmin(user);
    if (!(await this.assertTableReady())) {
      throw new BadRequestException(
        "Tabela platform_custom_domains indisponível. Aplique a migration ou aguarde o DDL no arranque do backend.",
      );
    }

    const hostname = normalizeHostname(input.hostname);
    if (!hostname || !/^[a-z0-9.-]+$/.test(hostname) || !hostname.includes(".")) {
      throw new BadRequestException("Informe um hostname válido (ex.: checkin.hotel.com.br)");
    }

    const settings = await this.prisma.site_settings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { pms_base_url: true },
    });
    if (this.collectPmsHostnames(settings?.pms_base_url).has(hostname)) {
      throw new BadRequestException(
        "Este hostname é do painel PMS. Cadastre apenas domínios do Web Check-in (ex.: checkin.seudominio.com).",
      );
    }

    const service_type = input.service_type ?? "web_checkin";
    const hints = this.infrastructureHints();
    const token = generateDomainVerificationToken();

    const row = await this.prisma.platform_custom_domains.create({
      data: {
        hostname,
        company_id: input.company_id ?? null,
        service_type,
        status: "pending_verification",
        verification_token: token,
        infra_cname_target: hints.cnameTarget,
        infra_a_target: hints.aTarget,
      },
      include: { companies: { select: { id: true, name: true } } },
    });

    if (service_type === "web_checkin" && !input.company_id) {
      await this.syncSiteSettingsWebCheckinUrl(`https://${hostname}`);
    }

    return this.serializeDomain(row, hints);
  }

  async verify(user: SessionUser, id: string) {
    this.assertSuperAdmin(user);
    const domain = await this.getDomainOrThrow(id);
    const hints = this.infrastructureHints();
    const checks = await this.runDnsChecks(domain.hostname, domain.verification_token, hints);
    const settings = await this.prisma.site_settings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { web_checkin_public_base_url: true },
    });
    const legacyCheckinHost = hostnameFromUrlOrHost(settings?.web_checkin_public_base_url);

    let status: PlatformDomainStatus = domain.status as PlatformDomainStatus;
    let ownershipVerified = domain.ownership_verified_at;
    let dnsStatus = checks.dnsPointsOk ? "ok" : checks.txtOk ? "partial" : "failed";
    let sslStatus = checks.sslOk ? "active" : "pending";
    let lastError: string | null = null;

    if (checks.txtOk) {
      ownershipVerified = ownershipVerified ?? new Date();
    } else {
      lastError = "Registro TXT de verificação não encontrado ou incorreto";
      status = "pending_verification";
    }

    if (checks.txtOk && checks.dnsPointsOk) {
      status = "active";
    } else if (checks.txtOk) {
      status = "pending_dns";
      lastError = lastError || "DNS ainda não aponta para a infraestrutura do PMS";
    }

    // Compatibilidade: URL já em site_settings e DNS/SSL ok — ativa sem bloquear operação
    if (!checks.txtOk && checks.dnsPointsOk && checks.sslOk && legacyCheckinHost === domain.hostname) {
      status = "active";
      ownershipVerified = ownershipVerified ?? new Date();
      dnsStatus = "ok";
      lastError = null;
    }

    if (domain.service_type === "booking_engine" && !checks.txtOk && checks.dnsPointsOk && checks.sslOk) {
      const linked = await this.prisma.companies.findFirst({
        where: {
          booking_engine_custom_domain: { equals: domain.hostname, mode: "insensitive" },
          booking_engine_enabled: true,
        },
        select: { id: true },
      });
      if (linked) {
        status = "active";
        ownershipVerified = ownershipVerified ?? new Date();
        dnsStatus = "ok";
        sslStatus = "active";
        lastError = null;
      }
    }

    if (!checks.sslOk && checks.dnsPointsOk) {
      sslStatus = "pending";
      const traefikHint =
        domain.service_type === "booking_engine"
          ? "DNS aponta para o PMS, mas o certificado ainda é o padrão do Traefik (DEFAULT CERT). Defina BOOKING_ENGINE_TRAEFIK_RULE no Environment do Dokploy, redeploy do frontend e aguarde o Let's Encrypt."
          : "DNS válido, mas HTTPS ainda indisponível (adicione o domínio no Dokploy/Traefik e aguarde Let's Encrypt)";
      lastError = lastError || traefikHint;
      if (checks.txtOk) {
        status = domain.service_type === "booking_engine" ? "pending_dns" : status;
      }
    }

    const updated = await this.prisma.platform_custom_domains.update({
      where: { id },
      data: {
        status,
        ownership_verified_at: ownershipVerified,
        dns_last_checked_at: new Date(),
        dns_status: dnsStatus,
        ssl_status: sslStatus,
        last_error: lastError,
      },
      include: { companies: { select: { id: true, name: true } } },
    });

    if (updated.service_type === "web_checkin" && updated.status === "active") {
      await this.syncSiteSettingsWebCheckinUrl(`https://${updated.hostname}`);
    }

    return {
      domain: this.serializeDomain(updated, hints),
      checks,
    };
  }

  async diagnose(user: SessionUser, id: string) {
    this.assertSuperAdmin(user);
    const domain = await this.getDomainOrThrow(id);
    const hints = this.infrastructureHints();
    const checks = await this.runDnsChecks(domain.hostname, domain.verification_token, hints);
    const resolution = await this.resolveHostname(domain.hostname);
    return {
      domain: this.serializeDomain(domain, hints),
      checks,
      routing: resolution,
      hints,
    };
  }

  async setStatus(user: SessionUser, id: string, status: "active" | "suspended" | "pending_verification") {
    this.assertSuperAdmin(user);
    const updated = await this.prisma.platform_custom_domains.update({
      where: { id },
      data: { status, updated_at: new Date() },
      include: { companies: { select: { id: true, name: true } } },
    });
    return this.serializeDomain(updated, this.infrastructureHints());
  }

  async remove(user: SessionUser, id: string) {
    this.assertSuperAdmin(user);
    await this.prisma.platform_custom_domains.delete({ where: { id } });
    return { ok: true };
  }

  async importLegacyFromSiteSettings(user: SessionUser) {
    this.assertSuperAdmin(user);
    const settings = await this.prisma.site_settings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { web_checkin_public_base_url: true },
    });
    const host = hostnameFromUrlOrHost(settings?.web_checkin_public_base_url);
    if (!host) {
      throw new BadRequestException("Nenhum domínio de Web Check-in em site_settings");
    }
    const existing = await this.prisma.platform_custom_domains.findUnique({ where: { hostname: host } });
    if (existing) return this.serializeDomain(existing, this.infrastructureHints());
    return this.create(user, { hostname: host, service_type: "web_checkin" });
  }

  private async syncSiteSettingsWebCheckinUrl(url: string) {
    try {
      await this.prisma.site_settings.update({
        where: { id: SITE_SETTINGS_ID },
        data: { web_checkin_public_base_url: url.replace(/\/+$/, "") },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Não foi possível sincronizar web_checkin_public_base_url: ${message}`);
    }
  }

  private async getDomainOrThrow(id: string) {
    if (!(await this.assertTableReady())) {
      throw new NotFoundException("Domínios personalizados indisponíveis");
    }
    const domain = await this.prisma.platform_custom_domains.findUnique({
      where: { id },
      include: { companies: { select: { id: true, name: true } } },
    });
    if (!domain) throw new NotFoundException("Domínio não encontrado");
    return domain;
  }

  private serializeDomain(row: DomainRow, hints: ReturnType<PlatformDomainsService["infrastructureHints"]>) {
    const txtName = verificationTxtRecordName(row.hostname);
    const txtValue = verificationTxtValue(row.verification_token);
    return {
      id: row.id,
      hostname: row.hostname,
      company_id: row.company_id,
      company_name: row.companies?.name ?? null,
      service_type: row.service_type,
      status: row.status,
      ownership_verified_at: row.ownership_verified_at,
      dns_last_checked_at: row.dns_last_checked_at,
      dns_status: row.dns_status,
      ssl_status: row.ssl_status,
      ssl_expires_at: row.ssl_expires_at,
      last_error: row.last_error,
      verification_txt: { name: txtName, value: txtValue },
      dns_instructions: {
        cname: hints.cnameTarget
          ? { type: "CNAME", name: row.hostname.split(".")[0], target: hints.cnameTarget }
          : null,
        a: hints.aTarget ? { type: "A", name: "@", target: hints.aTarget } : null,
        note: "CNAME de subdomínio deve apontar apenas para o hostname de destino (sem path).",
      },
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private async runDnsChecks(
    hostname: string,
    token: string,
    hints: ReturnType<PlatformDomainsService["infrastructureHints"]>,
    options?: { serviceType?: "web_checkin" | "booking_engine" },
  ) {
    const expectedTxt = verificationTxtValue(token);
    const txtName = verificationTxtRecordName(hostname);
    let txtOk = false;
    let dnsPointsOk = false;
    let sslOk = false;
    const details: string[] = [];

    try {
      const txts = await dns.resolveTxt(txtName);
      const flat = txts.map((parts) => parts.join("")).join(" ");
      txtOk = flat.includes(expectedTxt);
      if (!txtOk) details.push(`TXT em ${txtName} não contém o token esperado`);
    } catch {
      details.push(`TXT ${txtName} não resolvido (propagação DNS ou registro ausente)`);
    }

    const acceptableTargets = new Set<string>();
    const addTarget = (h: string | null | undefined) => {
      if (!h) return;
      const n = normalizeHostname(h);
      acceptableTargets.add(n);
      if (n.startsWith("www.")) acceptableTargets.add(n.slice(4));
      else acceptableTargets.add(`www.${n}`);
    };
    addTarget(hints.cnameTarget);
    for (const h of hints.pmsHosts ?? []) addTarget(h);

    dnsPointsOk = await this.hostResolvesToTargets(hostname, acceptableTargets, hints.aTarget);
    if (!dnsPointsOk) {
      details.push(
        hints.cnameTarget
          ? `DNS de ${hostname} não aponta para ${hints.cnameTarget} (ou hostname equivalente do PMS)`
          : `Hostname ${hostname} não resolve para a infraestrutura do PMS`,
      );
    }

    if (options?.serviceType === "booking_engine") {
      const probe = await probeHttpsCertificate(hostname);
      sslOk = probe.sslOk;
      if (!sslOk) {
        details.push(probe.detail ?? "Certificado HTTPS ainda inválido para o motor");
        if (probe.isTraefikDefault) details.push("Traefik ainda entrega DEFAULT CERT para este host");
      }
    } else {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(`https://${hostname}/health`, {
          method: "GET",
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timer);
        sslOk = res.ok;
        if (!sslOk) details.push(`HTTPS respondeu status ${res.status} em /health`);
      } catch {
        details.push("HTTPS indisponível ou certificado ainda não emitido para este hostname");
      }
    }

    return { txtOk, dnsPointsOk, sslOk, details };
  }

  /** CNAME (ou mesmo IP que o PMS) — compatível com Cloudflare proxy. */
  private async hostResolvesToTargets(
    hostname: string,
    targets: Set<string>,
    aTarget: string | null,
  ): Promise<boolean> {
    try {
      const cnames = await dns.resolveCname(hostname);
      if (cnames.some((c) => targets.has(normalizeHostname(c)))) return true;
    } catch {
      /* flatten / proxy — tentar A */
    }

    let hostIps: string[] = [];
    try {
      hostIps = await dns.resolve4(hostname);
    } catch {
      return false;
    }

    if (aTarget && hostIps.includes(aTarget)) return true;

    for (const targetHost of targets) {
      if (!targetHost || targetHost.includes(" ")) continue;
      try {
        const targetIps = await dns.resolve4(targetHost);
        if (targetIps.some((ip) => hostIps.includes(ip))) return true;
      } catch {
        continue;
      }
    }

    return hostIps.length > 0 && targets.size === 0;
  }

  async listBookingEngineHostnames(): Promise<string[]> {
    return this.bookingHosts.listHostnames();
  }

  buildBookingEngineTraefikEnvBlock(hosts?: string[]) {
    const list = hosts?.length ? hosts : [];
    const rule = buildBookingEngineTraefikHostRule(list);
    const autoSync = this.infraSync.isAutoSyncEnabled();
    const lines = autoSync
      ? [
          "# Sincronização automática ativa (Dokploy API) — Traefik/CORS atualizam ao salvar domínio.",
          `BOOKING_ENGINE_TRAEFIK_RULE=${rule}`,
        ]
      : [
          "# Cole no Environment do Docker Compose (Dokploy) e redeploy (pelo menos o frontend)",
          "# Ou configure DOKPLOY_API_URL + DOKPLOY_API_KEY + DOKPLOY_COMPOSE_ID para sync automático.",
          `BOOKING_ENGINE_TRAEFIK_RULE=${rule}`,
        ];
    if (list.length > 0) {
      lines.push(`BOOKING_ENGINE_PUBLIC_HOSTS=${list.join(",")}`);
      if (!autoSync) {
        lines.push("# Backend — CORS dinâmico (banco) dispensa lista manual quando BOOKING_ENGINE_CORS_FROM_DB=true.");
      }
    }
    return { hosts: list, rule, envBlock: lines.join("\n"), auto_sync_enabled: autoSync };
  }

  async getBookingEngineTraefikEnv(user: SessionUser) {
    this.assertSuperAdmin(user);
    const hosts = await this.listBookingEngineHostnames();
    return this.buildBookingEngineTraefikEnvBlock(hosts);
  }

  private async upsertBookingEngineDomainRow(
    companyId: string,
    hostname: string,
  ): Promise<DomainRow | null> {
    if (!(await this.assertTableReady())) return null;
    const hints = this.infrastructureHints();
    const existing = await this.prisma.platform_custom_domains.findUnique({ where: { hostname } });
    if (existing) {
      const updated = await this.prisma.platform_custom_domains.update({
        where: { id: existing.id },
        data: {
          company_id: companyId,
          service_type: "booking_engine",
          updated_at: new Date(),
        },
        include: { companies: { select: { name: true } } },
      });
      return updated;
    }
    const row = await this.prisma.platform_custom_domains.create({
      data: {
        hostname,
        company_id: companyId,
        service_type: "booking_engine",
        status: "pending_verification",
        verification_token: generateDomainVerificationToken(),
        infra_cname_target: hints.cnameTarget,
        infra_a_target: hints.aTarget,
      },
      include: { companies: { select: { name: true } } },
    });
    return row;
  }

  async verifyBookingEngineForCompany(user: SessionUser, companyId: string) {
    if (!canAccessCompany(user.isSuperAdmin, user.companyIds ?? [], companyId)) {
      throw new ForbiddenException("Sem permissão para esta empresa");
    }
    const company = await this.prisma.companies.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, booking_engine_custom_domain: true, booking_engine_enabled: true },
    });
    if (!company?.booking_engine_custom_domain?.trim()) {
      throw new BadRequestException("Empresa sem domínio personalizado do motor");
    }
    const hostname = normalizeHostname(company.booking_engine_custom_domain);
    if (!hostname) throw new BadRequestException("Domínio inválido");

    const settings = await this.prisma.site_settings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { pms_base_url: true },
    });
    if (this.collectPmsHostnames(settings?.pms_base_url).has(hostname)) {
      throw new BadRequestException("Este hostname é do painel PMS, não do motor de reservas");
    }

    const domainRow = await this.upsertBookingEngineDomainRow(companyId, hostname);
    const hints = this.infrastructureHints();
    if (!domainRow) {
      const checks = await this.runDnsChecks(hostname, generateDomainVerificationToken(), hints, {
        serviceType: "booking_engine",
      });
      const traefik = this.buildBookingEngineTraefikEnvBlock([hostname]);
      if (checks.dnsPointsOk && !checks.sslOk && (await this.infraSync.allowInfraSyncOnVerify())) {
        this.runInlineInfraSync("verify");
      }
      const infra_status = await this.infraSync.getLastSyncStatus();
      return {
        company_id: companyId,
        hostname,
        checks,
        domain: null,
        traefik,
        infra_status,
        ssl_issue: checks.dnsPointsOk && !checks.sslOk ? this.bookingEngineSslHint(infra_status) : null,
      };
    }

    const checks = await this.runDnsChecks(hostname, domainRow.verification_token, hints, {
      serviceType: "booking_engine",
    });
    const allHosts = await this.listBookingEngineHostnames();
    if (!allHosts.includes(hostname)) allHosts.push(hostname);
    const traefik = this.buildBookingEngineTraefikEnvBlock(allHosts);

    let status: PlatformDomainStatus = domainRow.status as PlatformDomainStatus;
    let ownershipVerified = domainRow.ownership_verified_at;
    let dnsStatus = checks.dnsPointsOk ? "ok" : checks.txtOk ? "partial" : "failed";
    let sslStatus = checks.sslOk ? "active" : "pending";
    let lastError: string | null = null;

    if (checks.txtOk) ownershipVerified = ownershipVerified ?? new Date();

    if (checks.dnsPointsOk && checks.sslOk) {
      status = "active";
      ownershipVerified = ownershipVerified ?? new Date();
      dnsStatus = "ok";
      sslStatus = "active";
    } else if (checks.dnsPointsOk && !checks.sslOk) {
      status = "pending_dns";
      lastError = this.bookingEngineSslHint(await this.infraSync.getLastSyncStatus());
    } else if (!checks.dnsPointsOk) {
      status = "pending_dns";
      lastError = "DNS ainda não aponta para a infraestrutura do PMS (CNAME)";
    }

    if (checks.dnsPointsOk && checks.sslOk) {
      status = "active";
      lastError = null;
    }

    const updated = await this.prisma.platform_custom_domains.update({
      where: { id: domainRow.id },
      data: {
        status,
        ownership_verified_at: ownershipVerified,
        dns_last_checked_at: new Date(),
        dns_status: dnsStatus,
        ssl_status: sslStatus,
        last_error: lastError,
      },
      include: { companies: { select: { id: true, name: true } } },
    });

    if (checks.dnsPointsOk && !checks.sslOk && (await this.infraSync.allowInfraSyncOnVerify())) {
      this.runInlineInfraSync("verify");
    }
    const infra_status = await this.infraSync.getLastSyncStatus();

    return {
      company_id: companyId,
      hostname,
      checks,
      domain: this.serializeDomain(updated, hints),
      traefik,
      infra_status,
      ssl_issue: checks.dnsPointsOk && !checks.sslOk ? this.bookingEngineSslHint(infra_status) : null,
    };
  }

  private bookingEngineSslHint(infra?: Awaited<ReturnType<BookingEngineInfraSyncService["getLastSyncStatus"]>>): string {
    if (this.infraSync.isAutoSyncEnabled()) {
      if (infra?.lastError) {
        return (
          "Certificado ainda não emitido (Traefik DEFAULT CERT). " +
          `Falha na API Dokploy: ${infra.lastError}. Confira DOKPLOY_* no backend/worker e a aba Deployments do compose.`
        );
      }
      if (!infra?.lastDeployAt) {
        return (
          "Certificado ainda não emitido (Traefik DEFAULT CERT). " +
          "Disparando deploy no Dokploy — veja a aba Deployments do compose em 1–3 minutos (backend + worker com as mesmas vars DOKPLOY_*)."
        );
      }
      return (
        "Certificado ainda não emitido (Traefik DEFAULT CERT). " +
        "Deploy solicitado; aguarde o Let's Encrypt após o compose terminar."
      );
    }
    return (
      "Certificado inválido (Traefik DEFAULT CERT / ERR_CERT_AUTHORITY_INVALID). " +
      "No Dokploy: defina BOOKING_ENGINE_TRAEFIK_RULE com Host(`seu-dominio`), redeploy do frontend e aguarde o Let's Encrypt."
    );
  }

  private async enqueueInfraSync(reason: string, companyId?: string) {
    const enabled = this.infraSync.isAutoSyncEnabled();
    if (!enabled) {
      return { enabled: false, queued: false, inline: false as const };
    }
    const queued = await this.infraQueue.enqueueBookingEngineSync({ reason, companyId });
    return { enabled: true, queued };
  }

  private runInlineInfraSync(reason: string) {
    if (!this.infraSync.isAutoSyncEnabled()) return;
    void this.infraSync
      .syncBookingEngineTraefik({ reason, forceRedeploy: true })
      .catch((error) => {
        this.logger.warn(
          `Sync inline Dokploy falhou: ${error instanceof Error ? error.message : error}`,
        );
      });
  }

  async getBookingEngineInfraStatusForCompany(user: SessionUser, companyId: string) {
    if (!canAccessCompany(user.isSuperAdmin, user.companyIds ?? [], companyId)) {
      throw new ForbiddenException("Sem permissão para esta empresa");
    }
    return this.infraSync.getLastSyncStatus();
  }

  async syncBookingEngineInfra(user: SessionUser) {
    this.assertSuperAdmin(user);
    const result = await this.infraSync.syncBookingEngineTraefik({ reason: "super_admin" });
    const status = await this.infraSync.getLastSyncStatus();
    return { result, status };
  }

  async getBookingEngineInfraStatus(user: SessionUser) {
    this.assertSuperAdmin(user);
    return this.infraSync.getLastSyncStatus();
  }

  async ensureBookingEngineForCompany(user: SessionUser, companyId: string) {
    if (!canAccessCompany(user.isSuperAdmin, user.companyIds ?? [], companyId)) {
      throw new ForbiddenException("Sem permissão para esta empresa");
    }
    const company = await this.prisma.companies.findUnique({
      where: { id: companyId },
      select: { booking_engine_custom_domain: true },
    });
    const hostname = normalizeHostname(company?.booking_engine_custom_domain ?? "");
    if (!hostname) {
      const infra_sync = await this.enqueueInfraSync("clear", companyId);
      return { ok: true, skipped: true as const, infra_sync };
    }
    await this.upsertBookingEngineDomainRow(companyId, hostname);
    const traefik = this.buildBookingEngineTraefikEnvBlock(
      await this.listBookingEngineHostnames(),
    );
    const infra_sync = await this.enqueueInfraSync("ensure", companyId);
    this.runInlineInfraSync("ensure");
    const infra_status = await this.infraSync.getLastSyncStatus();
    return { ok: true, hostname, traefik, infra_sync: { ...infra_sync, inline: true }, infra_status };
  }
}