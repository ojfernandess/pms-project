import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RefreshRecord, SessionStore } from "./auth.types";

@Injectable()
export class PrismaSessionStore implements SessionStore {
  constructor(private readonly prisma: PrismaService) {}

  async saveRefresh(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.backendRefreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  async findRefresh(tokenHash: string): Promise<RefreshRecord | null> {
    const row = await this.prisma.backendRefreshToken.findUnique({ where: { tokenHash } });
    if (!row) return null;
    return { userId: row.userId, expiresAt: row.expiresAt, revokedAt: row.revokedAt };
  }

  async revokeRefresh(tokenHash: string): Promise<void> {
    await this.prisma.backendRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.backendRefreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async savePasswordReset(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.backendPasswordReset.create({
      data: { userId, tokenHash, expiresAt },
    });
  }

  async consumePasswordReset(tokenHash: string, now: Date): Promise<string | null> {
    const updated = await this.prisma.backendPasswordReset.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (updated.count !== 1) return null;
    const row = await this.prisma.backendPasswordReset.findUnique({ where: { tokenHash } });
    return row?.userId ?? null;
  }
}
