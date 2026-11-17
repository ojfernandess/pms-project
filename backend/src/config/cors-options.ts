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
];

export function buildCorsOptions(config: ConfigService): CorsOptions {
  const explicit = parseOriginList(config.get<string>("CORS_ORIGINS"));
  const publicApp = normalizeOrigin(config.get<string>("PUBLIC_APP_URL"));
  const siteUrl = normalizeOrigin(config.get<string>("SITE_URL"));
  const webCheckin = normalizeOrigin(config.get<string>("WEB_CHECKIN_PUBLIC_URL"));
  const webCheckinHosts = originsFromHostnames(config.get<string>("WEB_CHECKIN_PUBLIC_HOST"));
  const extraWebCheckinHosts = originsFromHostnames(config.get<string>("WEB_CHECKIN_PUBLIC_HOSTS"));
  const allowlist = [
    ...new Set(
      [...explicit, publicApp, siteUrl, webCheckin, ...webCheckinHosts, ...extraWebCheckinHosts].filter(
        Boolean,
      ),
    ),
  ];

  const base: CorsOptions = {
    credentials: true,
    methods: [...ALLOWED_METHODS],
    allowedHeaders: ALLOWED_HEADERS,
    optionsSuccessStatus: 204,
  };

  if (allowlist.length === 0) {
    return { ...base, origin: true };
  }

  return {
    ...base,
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowlist.includes(origin)) {
        callback(null, origin);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`), false);
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
