import { Logger, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";

@WebSocketGateway({
  namespace: "/realtime",
  cors: { origin: true, credentials: true },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly config: ConfigService,
    @Optional() private readonly jwt?: JwtService,
    @Optional() private readonly auth?: AuthService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  handleConnection(client: Socket): void {
    const expected = this.config.get<string>("SOCKET_AUTH_TOKEN") ?? "";
    const provided = this.readToken(client);
    if (expected && provided === expected) {
      client.emit("system.connected", { ok: true });
      return;
    }
    if (!provided || provided.split(".").length !== 3 || !this.jwt) {
      this.logger.warn(`Rejected socket ${client.id}`);
      client.disconnect(true);
      return;
    }
    void this.acceptUser(client, provided);
  }

  publish(change: { table: string; event: "INSERT" | "UPDATE" | "DELETE"; row: Record<string, unknown> | null }): void {
    if (!this.server) return;
    const row = change.row ?? {};
    const payload = {
      eventType: change.event,
      schema: "public",
      table: change.table,
      new: change.event === "DELETE" ? null : row,
      old: change.event === "INSERT" ? null : row,
    };
    if (typeof row.establishment_id === "string") this.server.to(`est:${row.establishment_id}`).emit("postgres_changes", payload);
    if (typeof row.user_id === "string") this.server.to(`user:${row.user_id}`).emit("postgres_changes", payload);
    if (typeof row.id === "string") this.server.to(`row:${change.table}:${row.id}`).emit("postgres_changes", payload);
    if (typeof row.reservation_id === "string") this.server.to(`reservation:${row.reservation_id}`).emit("postgres_changes", payload);
  }

  @SubscribeMessage("listen")
  async listen(@ConnectedSocket() client: Socket, @MessageBody() body: { table?: string; filter?: string }) {
    const userId = client.data?.userId as string | undefined;
    const table = body?.table ?? "";
    const filter = body?.filter ?? "";
    if (!userId || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) return { ok: false };
    const room = await this.roomFor(userId, table, filter);
    if (!room) return { ok: false };
    await client.join(room);
    return { ok: true };
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`Socket disconnected ${client.id}`);
  }

  private async acceptUser(client: Socket, token: string): Promise<void> {
    try {
      const payload = await this.jwt?.verifyAsync<{ sub?: string }>(token);
      if (!payload?.sub) throw new Error("missing subject");
      client.data = { ...(client.data ?? {}), userId: payload.sub };
      client.emit("system.connected", { ok: true });
    } catch {
      this.logger.warn(`Rejected socket ${client.id}`);
      client.disconnect(true);
    }
  }

  private async roomFor(userId: string, table: string, filter: string): Promise<string | null> {
    const match = filter.match(/^([A-Za-z_][A-Za-z0-9_]*)=eq\.([0-9a-f-]{36})$/i);
    if (!match || !this.auth) return null;
    const [, column, id] = match;
    try {
      return await this.roomForChecked(userId, table, column, id);
    } catch {
      return null;
    }
  }

  private async roomForChecked(userId: string, table: string, column: string, id: string): Promise<string | null> {
    if (!this.auth) return null;
    if (column === "establishment_id") {
      const user = await this.auth.me(userId);
      await this.auth.assertEstablishment(user, id);
      return `est:${id}`;
    }
    if (column === "user_id") {
      const user = await this.auth.me(userId);
      if (id !== userId && !user.isSuperAdmin) return null;
      return `user:${id}`;
    }
    if (!this.prisma) return null;
    if (column === "reservation_id") {
      const establishmentId = await this.establishmentOf("reservations", id);
      if (!establishmentId) return null;
      const user = await this.auth.me(userId);
      await this.auth.assertEstablishment(user, establishmentId);
      return `reservation:${id}`;
    }
    if (column === "id") {
      const establishmentId = await this.establishmentOf(table, id);
      if (!establishmentId) return null;
      const user = await this.auth.me(userId);
      await this.auth.assertEstablishment(user, establishmentId);
      return `row:${table}:${id}`;
    }
    return null;
  }

  private async establishmentOf(table: string, id: string): Promise<string | null> {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || !this.prisma) return null;
    try {
      const rows = await this.prisma.$queryRawUnsafe<{ establishment_id: string | null }[]>(
        `SELECT establishment_id::text AS establishment_id FROM "${table}" WHERE id = $1::uuid LIMIT 1`,
        id,
      );
      return rows[0]?.establishment_id ?? null;
    } catch {
      return null;
    }
  }

  private readToken(client: Socket): string {
    const auth = client.handshake.auth?.token;
    if (typeof auth === "string" && auth.length > 0) return auth;
    const header = client.handshake.headers["x-socket-token"];
    if (typeof header === "string") return header;
    if (Array.isArray(header) && typeof header[0] === "string") return header[0];
    return "";
  }
}
