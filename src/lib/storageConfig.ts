export type StorageProvider = "local" | "minio";

export type MinioStorageConfig = {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  region: string;
  bucket: string;
};

export type StorageConfig = {
  provider: StorageProvider;
  minio?: MinioStorageConfig;
};

export const defaultStorageConfig = (): StorageConfig => ({
  provider: "local",
  minio: {
    endPoint: "",
    port: 9000,
    useSSL: false,
    accessKey: "",
    secretKey: "",
    region: "us-east-1",
    bucket: "pms",
  },
});

export function parseStorageConfigFromSite(raw: unknown): StorageConfig {
  const base = defaultStorageConfig();
  if (!raw || typeof raw !== "object") return { provider: "local" };
  const obj = raw as Record<string, unknown>;
  if (obj.provider !== "minio") return { provider: "local" };
  const m = (obj.minio ?? {}) as Record<string, unknown>;
  return {
    provider: "minio",
    minio: {
      endPoint: String(m.endPoint ?? ""),
      port: Number(m.port ?? 9000),
      useSSL: m.useSSL === true,
      accessKey: String(m.accessKey ?? ""),
      secretKey: String(m.secretKey ?? ""),
      region: String(m.region ?? "us-east-1"),
      bucket: String(m.bucket ?? "pms"),
    },
  };
}