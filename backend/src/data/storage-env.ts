import type { ConfigService } from "@nestjs/config";

const STORAGE_KEYS = [
  "STORAGE_PROVIDER",
  "STORAGE_DIR",
  "MINIO_ENDPOINT",
  "MINIO_PORT",
  "MINIO_USE_SSL",
  "MINIO_ACCESS_KEY",
  "MINIO_SECRET_KEY",
  "MINIO_BUCKET",
  "MINIO_REGION",
] as const;

export type StorageEnvDiagnostics = {
  process: Record<string, boolean>;
  configService: Record<string, boolean>;
};

/** Lê env do container: process.env tem prioridade sobre ConfigService (Nest validate). */
export function readStorageEnv(config: ConfigService, key: string): string {
  const direct = process.env[key];
  if (typeof direct === "string" && direct.trim() !== "") {
    return direct.trim();
  }
  const viaConfig = config.get<string>(key);
  if (typeof viaConfig === "string" && viaConfig.trim() !== "") {
    return viaConfig.trim();
  }
  return "";
}

export function storageEnvDiagnostics(config: ConfigService): StorageEnvDiagnostics {
  const process: Record<string, boolean> = {};
  const configService: Record<string, boolean> = {};
  for (const key of STORAGE_KEYS) {
    const p = process.env[key];
    process[key] = typeof p === "string" && p.trim() !== "";
    const c = config.get<string>(key);
    configService[key] = typeof c === "string" && c.trim() !== "";
  }
  return { process, configService };
}