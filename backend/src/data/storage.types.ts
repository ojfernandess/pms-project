export type StorageProvider = "local" | "minio";

export type MinioStorageConfig = {
  endPoint: string;
  port?: number;
  useSSL?: boolean;
  accessKey: string;
  secretKey: string;
  region?: string;
  /** Bucket S3 no MinIO (objetos: `{logicalBucket}/{path}`). */
  bucket?: string;
};

export type StorageConfig = {
  provider: StorageProvider;
  minio?: MinioStorageConfig;
};

export const SITE_SETTINGS_ID = "00000000-0000-0000-0000-000000000001";

export const DEFAULT_STORAGE_CONFIG: StorageConfig = { provider: "local" };

export function parseStorageConfig(raw: unknown): StorageConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_STORAGE_CONFIG };
  const obj = raw as Record<string, unknown>;
  const provider = obj.provider === "minio" ? "minio" : "local";
  const minioRaw = obj.minio;
  if (provider !== "minio" || !minioRaw || typeof minioRaw !== "object") {
    return { provider: "local" };
  }
  const m = minioRaw as Record<string, unknown>;
  const endPoint = String(m.endPoint || "").trim();
  const accessKey = String(m.accessKey || "").trim();
  const secretKey = String(m.secretKey || "").trim();
  if (!endPoint || !accessKey || !secretKey) {
    return { provider: "local" };
  }
  return {
    provider: "minio",
    minio: {
      endPoint,
      port: m.port != null ? Number(m.port) : 9000,
      useSSL: m.useSSL === true,
      accessKey,
      secretKey,
      region: m.region ? String(m.region) : "us-east-1",
      bucket: m.bucket ? String(m.bucket) : "pms",
    },
  };
}