import { normalizePooledDatabaseUrl, sanitizeDatabaseUrlValue } from "../prisma/database-url";

export interface AppEnv {
  DATABASE_URL: string;
  REDIS_URL: string;
  PORT: number;
  SOCKET_AUTH_TOKEN: string;
  INTERNAL_API_TOKEN: string;
  JWT_SECRET: string;
  JWT_ACCESS_TTL: string;
  JWT_REFRESH_TTL_DAYS: number;
  PASSWORD_RESET_DEBUG: boolean;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  PUBLIC_APP_URL: string;
}

export function validateEnv(config: Record<string, unknown>): AppEnv {
  const databaseUrl = normalizePooledDatabaseUrl(requiredString(config, "DATABASE_URL"));
  const redisUrl = requiredString(config, "REDIS_URL");
  const jwtSecret = requiredString(config, "JWT_SECRET");
  if (jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  const refreshDays = Number(config.JWT_REFRESH_TTL_DAYS ?? 7);
  if (!Number.isInteger(refreshDays) || refreshDays < 1 || refreshDays > 30) {
    throw new Error("JWT_REFRESH_TTL_DAYS must be an integer between 1 and 30");
  }
  const portRaw = config.PORT ?? "3000";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return {
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    PORT: port,
    SOCKET_AUTH_TOKEN: optionalString(config, "SOCKET_AUTH_TOKEN"),
    INTERNAL_API_TOKEN: optionalString(config, "INTERNAL_API_TOKEN"),
    JWT_SECRET: jwtSecret,
    JWT_ACCESS_TTL: optionalString(config, "JWT_ACCESS_TTL") || "15m",
    JWT_REFRESH_TTL_DAYS: refreshDays,
    PASSWORD_RESET_DEBUG: optionalString(config, "PASSWORD_RESET_DEBUG") === "true",
    SUPABASE_URL: optionalString(config, "SUPABASE_URL"),
    SUPABASE_ANON_KEY: optionalString(config, "SUPABASE_ANON_KEY"),
    PUBLIC_APP_URL: optionalString(config, "PUBLIC_APP_URL"),
  };
}

function requiredString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function optionalString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}
