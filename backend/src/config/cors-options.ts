import type { CorsOptions } from "@nestjs/common/interfaces/external/cors-options.interface";
import type { ConfigService } from "@nestjs/config";

const ALLOWED_METHODS = ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"] as const;

const ALLOWED_HEADERS = [
  "Authorization",
  "Content-Type",
  "Accept",
  "Origin",
  "X-Requested-With",
  "X-Upsert",
  "Apikey",
  "X-Client-Info",
  "Prefer",
  "Range",
  "X-PMS-Visitor-Host",
];

export type CorsOriginResolver = (origin: string) => boolean | Promise<boolean>;

export type CorsPolicy = {
  allowedOrigins: string[];
  trustedSuffixes: string[];
  isStaticOriginAllowed: (origin: string) => boolean;
  checkOrigin: (origin: string, extra?: CorsOriginResolver) => Promise<boolean>;
};

export function createCorsPolicy(config: ConfigService): CorsPolicy {
  const explicit = parseOriginList(config.get<string>("CORS_ORIGINS"));
  const publicApp = normalizeOrigin(config.get<string>("PUBLIC_APP_URL"));
  const siteUrl = normalizeOrigin(config.get<string>("SITE_URL"));
  const appUrl = normalizeOrigin(config.get<string>("VITE_APP_URL"));
  const webCheckin = normalizeOrigin(config.get<string>("WEB_CHECKIN_PUBLIC_URL"));
  const webCheckinHosts = originsFromHostnames(config.get<string>("WEB_CHECKIN_PUBLIC_HOST"));
  const extraWebCheckinHosts = originsFromHostnames(config.get<string>("WEB_CHECKIN_PUBLIC_HOSTS"));
  const bookingEngineHosts = originsFromHostnames(config.get<string>("BOOKING_ENGINE_PUBLIC_HOSTS"));
  const apiPublic = normalizeOrigin(config.get<string>("VITE_PMS_API_URL"));

  const allowedOrigins = [
    ...new Set(
      [
        ...explicit,
        publicApp,
        siteUrl,
        appUrl,
        webCheckin,
        apiPublic,
        ...webCheckinHosts,
        ...extraWebCheckinHosts,
        ...bookingEngineHosts,
      ].filter(Boolean) as string[],
    ),
  ];

  const suffixFromEnv = parseHostSuffixList(config.get<string>("CORS_TRUSTED_HOST_SUFFIXES"));
  const suffixFromOrigins = new Set<string>();
  for (const origin of allowedOrigins) {
    const host = hostnameFromOrigin(origin);
    const reg = registrableDomain(host);
    if (reg) suffixFromOrigins.add(reg);
  }
  for (const s of suffixFromEnv) suffixFromOrigins.add(s);

  const trustedSuffixes = [...suffixFromOrigins];

  const isStaticOriginAllowed = (origin: string): boolean => {
    if (!origin?.trim()) return true;
    const trimmed = origin.trim();
    if (allowedOrigins.length === 0 && trustedSuffixes.length === 0) return true;
    if (allowedOrigins.includes(trimmed)) return true;
    const host = hostnameFromOrigin(trimmed);
    if (!host) return false;
    return trustedSuffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
  };

  const checkOrigin = async (origin: string, extra?: CorsOriginResolver): Promise<boolean> => {
    if (!origin?.trim()) return true;
    if (isStaticOriginAllowed(origin)) return true;
    if (!extra) return false;
    try {
      return Boolean(await extra(origin));
    } catch {
      return false;
    }
  };

  return { allowedOrigins, trustedSuffixes, isStaticOriginAllowed, checkOrigin };
}

/** Reflete headers CORS em respostas de erro (502/500 sem cabeçalho quebram o browser). */
export function applyCorsHeadersIfAllowed(
  req: { headers: { origin?: string } },
  res: { setHeader: (name: string, value: string) => void },
  policy: CorsPolicy,
  extraSync?: (origin: string) => boolean,
): void {
  const origin = req.headers.origin;
  if (!origin || typeof origin !== "string") return;
  const allowed =
    policy.isStaticOriginAllowed(origin) || (extraSync ? extraSync(origin) : false);
  if (!allowed) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Vary", "Origin");
}

export function buildCorsOptions(
  config: ConfigService,
  extraOriginAllowed?: CorsOriginResolver,
): CorsOptions {
  const policy = createCorsPolicy(config);

  const base: CorsOptions = {
    credentials: true,
    methods: [...ALLOWED_METHODS],
    allowedHeaders: ALLOWED_HEADERS,
    optionsSuccessStatus: 204,
  };

  if (policy.allowedOrigins.length === 0 && policy.trustedSuffixes.length === 0) {
    return { ...base, origin: true };
  }

  return {
    ...base,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      void policy
        .checkOrigin(origin, extraOriginAllowed)
        .then((allowed) => {
          if (allowed) callback(null, origin);
          else callback(null, false);
        })
        .catch(() => callback(null, false));
    },
  };
}

function parseOriginList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((part) => normalizeOrigin(part))
    .filter(Boolean) as string[];
}

function parseHostSuffixList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((p) => p.trim().replace(/^\./, ""))
    .filter(Boolean);
}

function normalizeOrigin(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.origin;
  } catch {
    return null;
  }
}

function hostnameFromOrigin(origin: string): string | null {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Domínio registrável simples (ex.: pms.stayos.com.br → stayos.com.br). */
function registrableDomain(hostname: string | null): string | null {
  if (!hostname) return null;
  const parts = hostname.split(".").filter(Boolean);
  if (parts.length < 2) return null;
  return parts.slice(-2).join(".");
}

/** Hostnames sem esquema → https://origin (check-in dedicado no nginx). */
function originsFromHostnames(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((host) => normalizeOrigin(host.includes("://") ? host : `https://${host.replace(/^www\./i, "")}`))
    .filter((o): o is string => Boolean(o));
}