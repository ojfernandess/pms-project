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
  const allowlist = [...new Set([...explicit, publicApp, siteUrl].filter(Boolean))];

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
