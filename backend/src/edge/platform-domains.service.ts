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
import { SITE_SETTINGS_ID } from "./robots.service";
import type { HostnameResolution, PlatformDomainStatus } from "./platform-domains.types";

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
    const pmsHost = hostnameFromUrlOrHost(publicApp);
    const cnameTarget =
      this.config.get<string>("PLATFORM_DNS_CNAME_TARGET")?.trim() ||
      pmsHost ||
      null;
    const aTarget = this.config.get<string>("PLATFORM_DNS_A_TARGET")?.trim() || null;
    return { cnameTarget, aTarget, pmsPublicUrl: publicApp?.trim() || null };
  }

  async resolveFromRequest(req: Request): Promise<HostnameResolution> {
    const hostname = resolveRequestHostname(req);
    return this.resolveHostname(hostname);
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

    const pmsHost =
      hostnameFromUrlOrHost(settings?.pms_base_url) ||
      hostnameFromUrlOrHost(this.config.get<string>("PUBLIC_APP_URL")) ||
      hostnameFromUrlOrHost(this.config.get<string>("SITE_URL"));

    const legacyCheckinHost = hostnameFromUrlOrHost(settings?.web_checkin_public_base_url);

    if (pmsHost && hostname === pmsHost) {
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
      }
    }

    if (pmsHost && hostname !== pmsHost) {
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

    if (!checks.sslOk && checks.txtOk && checks.dnsPointsOk) {
      sslStatus = "pending";
      lastError =
        lastError ||
        "DNS válido, mas HTTPS ainda indisponível (adicione o domínio no Dokploy/Traefik e aguarde Let's Encrypt)";
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

    if (hints.cnameTarget) {
      try {
        const cnames = await dns.resolveCname(hostname);
        const normalizedTarget = hints.cnameTarget.toLowerCase();
        dnsPointsOk = cnames.some((c) => normalizeHostname(c) === normalizedTarget);
        if (!dnsPointsOk) {
          const cname = cnames[0];
          details.push(
            cname
              ? `CNAME aponta para ${cname}, esperado ${hints.cnameTarget}`
              : `Sem CNAME; esperado apontar para ${hints.cnameTarget}`,
          );
        }
      } catch {
        try {
          const ips = await dns.resolve4(hostname);
          dnsPointsOk = ips.length > 0;
          if (hints.aTarget) {
            dnsPointsOk = ips.includes(hints.aTarget);
          }
          if (!dnsPointsOk) {
            details.push("Registro A/AAAA não coincide com o IP esperado da infraestrutura");
          }
        } catch {
          details.push("Hostname não resolve (A/CNAME)");
        }
      }
    }

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

    return { txtOk, dnsPointsOk, sslOk, details };
  }
}