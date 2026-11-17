import { createHmac, timingSafeEqual } from "crypto";
import { access, constants, mkdir, readFile, readdir, stat, writeFile } from "fs/promises";
import { join, normalize, resolve, sep } from "path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type BucketMeta = { public: boolean };

const PUBLIC_BY_DEFAULT = new Set([
  "documents",
  "hotel-assets",
  "site-assets",
  "public",
  "logos",
  "avatars",
]);

@Injectable()
export class StorageService {
  private readonly root: string;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(config.get<string>("STORAGE_DIR") || join(process.cwd(), "storage"));
  }

  async ping(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root, constants.W_OK);
  }

  async upload(bucket: string, path: string, body: Buffer, upsert: boolean): Promise<{ path: string }> {
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
    return readFile(this.locate(bucket, path));
  }

  async sign(bucket: string, path: string, expiresIn: number, origin: string): Promise<string> {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    if (await this.isPublic(bucket)) {
      return `${origin}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encoded}`;
    }
    await stat(this.locate(bucket, path));
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
    const meta = await this.meta();
    return meta[bucket]?.public === true;
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
    return createHmac("sha256", this.config.getOrThrow<string>("JWT_SECRET")).update(`${bucket}\n${path}\n${exp}`).digest("base64url");
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
