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
  processEnv: Record<string, boolean>;
  configService: Record<string, boolean>;
  pmsStorageJson: boolean;
};

/** Dokploy: se MINIO_* não chegam ao container, use uma única env PMS_STORAGE_JSON (JSON). */
export function hydrateStorageEnvFromJson(): void {
  const raw = process.env.PMS_STORAGE_JSON;
  if (!raw?.trim()) return;
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const map: Record<string, string> = {
      provider: "STORAGE_PROVIDER",
      endpoint: "MINIO_ENDPOINT",
      port: "MINIO_PORT",
      useSSL: "MINIO_USE_SSL",
      accessKey: "MINIO_ACCESS_KEY",
      secretKey: "MINIO_SECRET_KEY",
      bucket: "MINIO_BUCKET",
      region: "MINIO_REGION",
    };
    for (const [jsonKey, envKey] of Object.entries(map)) {
      const cur = process.env[envKey];
      if (cur?.trim()) continue;
      const v = j[jsonKey];
      if (v === undefined || v === null) continue;
      process.env[envKey] =
        jsonKey === "useSSL" ? (v === true || v === "true" ? "true" : "false") : String(v);
    }
  } catch {
    console.error("[pms-boot] PMS_STORAGE_JSON inválido (JSON parse falhou)");
  }
}

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
  const processEnv: Record<string, boolean> = {};
  const configService: Record<string, boolean> = {};
  for (const key of STORAGE_KEYS) {
    const p = process.env[key];
    processEnv[key] = typeof p === "string" && p.trim() !== "";
    const c = config.get<string>(key);
    configService[key] = typeof c === "string" && c.trim() !== "";
  }
  return {
    processEnv,
    configService,
    pmsStorageJson: typeof process.env.PMS_STORAGE_JSON === "string" && process.env.PMS_STORAGE_JSON.trim() !== "",
  };
}

export function logStorageEnvBootHint(): void {
  const sp = !!process.env.STORAGE_PROVIDER?.trim();
  const ep = !!process.env.MINIO_ENDPOINT?.trim();
  const json = !!process.env.PMS_STORAGE_JSON?.trim();
  console.log(
    `[pms-boot] storage env in process: STORAGE_PROVIDER=${sp} MINIO_ENDPOINT=${ep} PMS_STORAGE_JSON=${json}`,
  );
  if (!sp && !json) {
    console.warn(
      "[pms-boot] Nenhuma config de storage no process.env — no Dokploy, use Environment do Compose PMS (não o stack MinIO) + compose com env_file ou PMS_STORAGE_JSON.",
    );
  }
}