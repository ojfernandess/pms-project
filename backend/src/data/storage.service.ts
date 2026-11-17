import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHmac, timingSafeEqual } from "crypto";
import { access, constants, mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { join, normalize, resolve, sep } from "path";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DEFAULT_STORAGE_CONFIG,
  envTruthy,
  normalizeMinioHost,
  parseStorageConfig,
  type StorageConfig,
} from "./storage.types";
import { readStorageEnv, storageEnvDiagnostics, type StorageEnvDiagnostics } from "./storage-env";

export type StorageConnectionTestResult = {
  ok: boolean;
  message: string;
  source: "env";
  provider?: StorageConfig["provider"];
  /** Valor bruto de STORAGE_PROVIDER no env (diagnóstico). */
  storageProviderEnv?: string;
  envDiagnostics?: StorageEnvDiagnostics;
  endpoint?: string;
  port?: number;
  useSSL?: boolean;
  bucket?: string;
};

type BucketMeta = { public: boolean };

const PUBLIC_BY_DEFAULT = new Set([
  "documents",
  "hotel-assets",
  "site-assets",
  "public",
  "logos",
  "avatars",
]);

const CONFIG_TTL_MS = 30_000;

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly root: string;
  private activeConfig: StorageConfig = { ...DEFAULT_STORAGE_CONFIG };
  private configLoadedAt = 0;
  private s3: S3Client | null = null;
  private s3Bucket: string = "pms";

  constructor(private readonly config: ConfigService) {
    this.root = resolve(readStorageEnv(config, "STORAGE_DIR") || join(process.cwd(), "storage"));
  }

  async onModuleInit(): Promise<void> {
    await this.refreshConfig(true);
  }

  async ping(): Promise<void> {
    await this.ensureConfig();
    if (this.activeConfig.provider === "minio") {
      await this.s3Ping();
      return;
    }
    await mkdir(this.root, { recursive: true });
    await access(this.root, constants.W_OK);
  }

  /** Testa somente variáveis de ambiente do container da API (ignora site_settings). */
  async testConnectionFromEnv(): Promise<StorageConnectionTestResult> {
    const diagnostics = storageEnvDiagnostics(this.config);
    const cfg = this.resolveConfigFromEnv();
    const rawProvider = readStorageEnv(this.config, "STORAGE_PROVIDER");
    const provider = (rawProvider || "local").trim().toLowerCase();
    const storageProviderEnv = rawProvider || "(vazio)";

    if (cfg.provider === "minio" && cfg.minio) {
      const m = cfg.minio;
      const base = await this.runMinioConnectionTest(cfg);
      return {
        ...base,
        source: "env",
        provider: "minio",
        storageProviderEnv,
        envDiagnostics: diagnostics,
        endpoint: m.endPoint,
        port: m.port ?? 9000,
        useSSL: m.useSSL === true,
        bucket: m.bucket || "pms",
      };
    }

    if (provider === "minio") {
      return {
        ok: false,
        source: "env",
        provider: "minio",
        storageProviderEnv,
        envDiagnostics: diagnostics,
        message:
          "STORAGE_PROVIDER=minio mas faltam MINIO_ENDPOINT, MINIO_ACCESS_KEY ou MINIO_SECRET_KEY no env do container da API.",
      };
    }

    try {
      await mkdir(this.root, { recursive: true });
      await access(this.root, constants.W_OK);
      const hint = diagnostics.process.STORAGE_PROVIDER
        ? "STORAGE_PROVIDER existe no process.env mas não foi reconhecido — verifique o valor."
        : "STORAGE_PROVIDER ausente no process.env do container myapi — configure no painel do backend e recrie o container.";
      return {
        ok: true,
        source: "env",
        provider: "local",
        storageProviderEnv,
        envDiagnostics: diagnostics,
        message: `Armazenamento local (STORAGE_PROVIDER=${storageProviderEnv}). ${hint}`,
      };
    } catch (error) {
      return {
        ok: false,
        source: "env",
        provider: "local",
        storageProviderEnv,
        envDiagnostics: diagnostics,
        message: error instanceof Error ? error.message : "Armazenamento local indisponível",
      };
    }
  }

  private async runMinioConnectionTest(cfg: StorageConfig): Promise<{ ok: boolean; message: string }> {
    if (!cfg.minio) return { ok: false, message: "MinIO não configurado" };
    const client = this.buildS3(cfg.minio);
    const bucket = cfg.minio.bucket || "pms";
    const target = `${cfg.minio.useSSL ? "https" : "http"}://${cfg.minio.endPoint}:${cfg.minio.port ?? 9000}`;
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { ok: true, message: `Conexão MinIO OK em ${target} (bucket "${bucket}")` };
    } catch (err: unknown) {
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        return { ok: true, message: `Bucket "${bucket}" criado no MinIO (${target})` };
      } catch {
        const msg = err instanceof Error ? err.message : "Falha ao conectar no MinIO";
        return {
          ok: false,
          message: `${msg} — alvo: ${target}. Confira env (MINIO_ENDPOINT, MINIO_PORT, MINIO_USE_SSL).`,
        };
      }
    }
  }

  async upload(bucket: string, path: string, body: Buffer, upsert: boolean): Promise<{ path: string }> {
    await this.ensureConfig();
    if (this.activeConfig.provider === "minio") {
      return this.uploadS3(bucket, path, body, upsert);
    }
    const target = this.locate(bucket, path);
    if (!upsert) {
      try {
        await stat(target);
        throw new Error("The resource already exists");
      } catch (error) {
        if (error instanceof Error && error.message === "The resource already exists") throw error;
      }
    }
    await mkdir(resolve(target, ".."), { recursive: true });
    await this.remember(bucket);
    await writeFile(target, body);
    return { path };
  }

  async read(bucket: string, path: string): Promise<Buffer> {
    await this.ensureConfig();
    if (this.activeConfig.provider === "minio") {
      return this.readS3(bucket, path);
    }
    return readFile(this.locate(bucket, path));
  }

  async sign(bucket: string, path: string, expiresIn: number, origin: string): Promise<string> {
    await this.ensureConfig();
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    if (await this.isPublic(bucket)) {
      return `${origin}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`;
    }
    if (this.activeConfig.provider === "minio") {
      await this.headS3(bucket, path);
    } else {
      await stat(this.locate(bucket, path));
    }
    const exp = Math.floor(Date.now() / 1000) + Math.min(Math.max(expiresIn, 1), 60 * 60 * 24 * 365);
    const token = this.mac(bucket, path, exp);
    return `${origin}/storage/v1/object/sign-get/${encodeURIComponent(bucket)}/${encoded}?exp=${exp}&token=${token}`;
  }

  verify(bucket: string, path: string, exp: number, token: string): boolean {
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = this.mac(bucket, path, exp);
    const left = Buffer.from(token);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  }

  async list(): Promise<{ id: string; name: string; public: boolean }[]> {
    await this.ensureConfig();
    if (this.activeConfig.provider === "minio") {
      const names = [...PUBLIC_BY_DEFAULT];
      return names.map((name) => ({
        id: name,
        name,
        public: PUBLIC_BY_DEFAULT.has(name),
      }));
    }
    const meta = await this.meta();
    let names: string[] = [];
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
      names = [];
    }
    const all = new Set([...names, ...Object.keys(meta)]);
    return [...all].filter((name) => name !== ".buckets.json").map((name) => ({
      id: name,
      name,
      public: PUBLIC_BY_DEFAULT.has(name) || meta[name]?.public === true,
    }));
  }

  async isPublic(bucket: string): Promise<boolean> {
    if (PUBLIC_BY_DEFAULT.has(bucket)) return true;
    if (this.activeConfig.provider === "minio") return false;
    const meta = await this.meta();
    return meta[bucket]?.public === true;
  }

  private async ensureConfig(): Promise<void> {
    if (Date.now() - this.configLoadedAt < CONFIG_TTL_MS) return;
    await this.refreshConfig(false);
  }

  private async refreshConfig(force: boolean): Promise<void> {
    if (!force && Date.now() - this.configLoadedAt < CONFIG_TTL_MS) return;
    this.activeConfig = await this.loadConfig();
    this.configLoadedAt = Date.now();
    if (this.activeConfig.provider === "minio" && this.activeConfig.minio) {
      this.s3 = this.buildS3(this.activeConfig.minio);
      this.s3Bucket = this.activeConfig.minio.bucket || "pms";
    } else {
      this.s3 = null;
    }
  }

  private async loadConfig(): Promise<StorageConfig> {
    return this.resolveConfigFromEnv();
  }

  /**
   * Provedor de storage só via env do backend (site_settings.storage_config não é mais usado).
   */
  private resolveConfigFromEnv(): StorageConfig {
    const provider = (readStorageEnv(this.config, "STORAGE_PROVIDER") || "local").trim().toLowerCase();
    if (provider !== "minio") {
      return { ...DEFAULT_STORAGE_CONFIG };
    }

    const endPoint = normalizeMinioHost(readStorageEnv(this.config, "MINIO_ENDPOINT"));
    const accessKey = readStorageEnv(this.config, "MINIO_ACCESS_KEY");
    const secretKey = readStorageEnv(this.config, "MINIO_SECRET_KEY");
    if (!endPoint || !accessKey || !secretKey) {
      return { ...DEFAULT_STORAGE_CONFIG };
    }

    const useSSL = envTruthy(readStorageEnv(this.config, "MINIO_USE_SSL"));
    const portRaw = readStorageEnv(this.config, "MINIO_PORT");
    const port =
      portRaw !== ""
        ? Number(portRaw)
        : useSSL
          ? 443
          : 9000;

    return parseStorageConfig({
      provider: "minio",
      minio: {
        endPoint,
        port,
        useSSL,
        accessKey,
        secretKey,
        region: readStorageEnv(this.config, "MINIO_REGION") || "us-east-1",
        bucket: readStorageEnv(this.config, "MINIO_BUCKET") || "pms",
      },
    });
  }

  private buildS3(minio: NonNullable<StorageConfig["minio"]>): S3Client {
    const protocol = minio.useSSL ? "https" : "http";
    const port = minio.port ?? 9000;
    const endpoint = `${protocol}://${minio.endPoint}:${port}`;
    return new S3Client({
      region: minio.region || "us-east-1",
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: minio.accessKey,
        secretAccessKey: minio.secretKey,
      },
    });
  }

  private s3Key(bucket: string, path: string): string {
    return `${bucket}/${path}`;
  }

  private async s3Ping(): Promise<void> {
    if (!this.s3) throw new Error("Cliente MinIO não configurado");
    await this.s3.send(new ListBucketsCommand({}));
  }

  private async uploadS3(
    bucket: string,
    path: string,
    body: Buffer,
    upsert: boolean,
  ): Promise<{ path: string }> {
    if (!this.s3) throw new Error("MinIO não configurado");
    const Key = this.s3Key(bucket, path);
    if (!upsert) {
      try {
        await this.headS3(bucket, path);
        throw new Error("The resource already exists");
      } catch (error) {
        if (error instanceof Error && error.message === "The resource already exists") throw error;
      }
    }
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.s3Bucket,
        Key,
        Body: body,
      }),
    );
    return { path };
  }

  private async readS3(bucket: string, path: string): Promise<Buffer> {
    if (!this.s3) throw new Error("MinIO não configurado");
    const Key = this.s3Key(bucket, path);
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.s3Bucket, Key }));
    const bytes = await out.Body?.transformToByteArray();
    if (!bytes) throw new Error("Object not found");
    return Buffer.from(bytes);
  }

  private async headS3(bucket: string, path: string): Promise<void> {
    if (!this.s3) throw new Error("MinIO não configurado");
    const Key = this.s3Key(bucket, path);
    await this.s3.send(new GetObjectCommand({ Bucket: this.s3Bucket, Key }));
  }

  private locate(bucket: string, path: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/.test(bucket)) throw new Error("Bucket inválido");
    const parts = path.split("/").filter((part) => part && part !== "." && part !== "..");
    if (parts.length === 0) throw new Error("Caminho inválido");
    const target = normalize(join(this.root, bucket, ...parts));
    const base = normalize(join(this.root, bucket)) + sep;
    if (!target.startsWith(base)) throw new Error("Caminho inválido");
    return target;
  }

  private mac(bucket: string, path: string, exp: number): string {
    return createHmac("sha256", this.config.getOrThrow<string>("JWT_SECRET"))
      .update(`${bucket}\n${path}\n${exp}`)
      .digest("base64url");
  }

  private async meta(): Promise<Record<string, BucketMeta>> {
    try {
      const raw = await readFile(join(this.root, ".buckets.json"), "utf8");
      return JSON.parse(raw) as Record<string, BucketMeta>;
    } catch {
      return {};
    }
  }

  private async remember(bucket: string): Promise<void> {
    const meta = await this.meta();
    if (!meta[bucket]) meta[bucket] = { public: PUBLIC_BY_DEFAULT.has(bucket) };
    await mkdir(this.root, { recursive: true });
    await writeFile(join(this.root, ".buckets.json"), JSON.stringify(meta));
  }
}