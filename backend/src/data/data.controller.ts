import { All, Controller, Get, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { AuthService, SessionUser } from "../auth/auth.service";
import { StaffIdentityService } from "../auth/staff-identity.service";
import { DataService } from "./data.service";
import { QueryRequest } from "./query-compiler";
import { StorageService } from "./storage.service";
import { parseStorageConfig } from "./storage.types";

@Controller()
export class DataController {
  constructor(
    private readonly data: DataService,
    private readonly storage: StorageService,
    private readonly identity: StaffIdentityService,
    private readonly auth: AuthService,
  ) {}

  @All("rest/v1/query")
  async query(@Req() req: Request, @Res() res: Response) {
    const user = await this.authenticatedUser(req, res);
    if (user === undefined) return;
    const body = (req.body ?? {}) as QueryRequest;
    if (!body.table || !body.action) {
      res.status(400).json({ data: null, error: { message: "table e action são obrigatórios" }, count: null });
      return;
    }
    const result = await this.data.query(body, user);
    res.status(result.error ? 400 : 200).json(result);
  }

  @All("rest/v1/rpc/:name")
  async rpc(@Req() req: Request, @Res() res: Response) {
    const user = await this.authenticatedUser(req, res);
    if (user === undefined) return;
    const name = String(req.params.name || "");
    const result = await this.data.rpc(name, (req.body ?? {}) as Record<string, unknown>, user);
    res.status(result.error ? 400 : 200).json(result);
  }

  @Get("storage/v1/bucket")
  async buckets(@Res() res: Response) {
    res.json({ data: await this.storage.list(), error: null });
  }

  @Post("storage/v1/admin/connection-test")
  async storageConnectionTest(@Req() req: Request, @Res() res: Response) {
    const user = await this.authenticatedUser(req, res);
    if (user === undefined) return;
    if (!user) {
      res.status(401).json({ ok: false, message: "Não autenticado" });
      return;
    }
    if (!user.isSuperAdmin) {
      res.status(403).json({ ok: false, message: "Apenas super admin" });
      return;
    }
    const body = (req.body ?? {}) as { storage_config?: unknown };
    const override = body.storage_config ? parseStorageConfig(body.storage_config) : undefined;
    const result = await this.storage.testConnection(override);
    res.status(result.ok ? 200 : 400).json(result);
  }

  @All("storage/v1/object/*")
  async object(@Req() req: Request, @Res() res: Response) {
    const parts = req.path.replace(/^\/storage\/v1\/object\//, "").split("/").filter(Boolean);
    const head = decodeURIComponent(parts[0] || "");
    if (head === "public" || head === "sign-get") {
      const bucket = decodeURIComponent(parts[1] || "");
      const path = parts.slice(2).map(decodeURIComponent).join("/");
      if (head === "public" && !(await this.storage.isPublic(bucket))) {
        res.status(400).json({ error: { message: "Bucket privado" } });
        return;
      }
      if (head === "sign-get") {
        const exp = Number(req.query.exp);
        const token = String(req.query.token || "");
        if (!this.storage.verify(bucket, path, exp, token)) {
          res.status(400).json({ error: { message: "URL assinada inválida" } });
          return;
        }
      }
      try {
        const file = await this.storage.read(bucket, path);
        res.status(200).send(file);
      } catch {
        res.status(404).json({ error: { message: "Object not found" } });
      }
      return;
    }
    if (head === "sign" && req.method === "POST") {
      const bucket = decodeURIComponent(parts[1] || "");
      const path = parts.slice(2).map(decodeURIComponent).join("/");
      const expiresIn = Number((req.body as { expiresIn?: number } | undefined)?.expiresIn ?? 3600);
      try {
        const signedUrl = await this.storage.sign(bucket, path, expiresIn, originOf(req));
        res.json({ signedUrl });
      } catch (error) {
        res.status(400).json({ error: { message: error instanceof Error ? error.message : "Object not found" } });
      }
      return;
    }
    const bucket = head;
    const path = parts.slice(1).map(decodeURIComponent).join("/");
    if (req.method === "POST" || req.method === "PUT") {
      const body = await readBody(req);
      if (body.length > 20 * 1024 * 1024) {
        res.status(400).json({ error: { message: "Ficheiro acima de 20MB" } });
        return;
      }
      try {
        const upsert = String(req.headers["x-upsert"] || "") === "true";
        const saved = await this.storage.upload(bucket, path, body, upsert);
        res.json({ data: saved, error: null });
      } catch (error) {
        res.status(400).json({ data: null, error: { message: error instanceof Error ? error.message : "Erro no upload" } });
      }
      return;
    }
    res.status(404).json({ error: { message: "Object not found" } });
  }

  private async authenticatedUser(req: Request, res: Response): Promise<SessionUser | null | undefined> {
    const header = req.headers.authorization;
    if (!header) return null;
    const userId = await this.identity.resolve(header);
    if (!userId) {
      // JWT expirado/inválido no check-in público: seguir como anon (evita falha de rede/CORS no hóspede).
      return null;
    }
    return this.auth.me(userId);
  }
}

function originOf(req: Request): string {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0];
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost");
  return `${proto}://${host}`;
}

function readBody(req: Request): Promise<Buffer> {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;
  if (Buffer.isBuffer(raw) && raw.length > 0) return Promise.resolve(raw);
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (!req.readable || req.readableEnded) return Promise.resolve(Buffer.alloc(0));
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
