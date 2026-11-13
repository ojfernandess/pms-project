import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { hash } from "bcrypt";
import { AuthService } from "./auth.service";
import { AuthDirectory, AuthUserRecord, ScopeFacts, SessionStore } from "./auth.types";
import { hashToken } from "./password";

const userId = "11111111-1111-1111-1111-111111111111";
const companyA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const companyB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const establishmentA = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const establishmentB = "dddddddd-dddd-dddd-dddd-dddddddddddd";

class MemoryDirectory implements AuthDirectory {
  updatePassword = jest.fn(async (_userId: string, _hash: string) => undefined);
  constructor(readonly record: AuthUserRecord, private readonly scope: ScopeFacts) {}

  async findByEmail(email: string): Promise<AuthUserRecord | null> {
    return email.toLowerCase() === this.record.email.toLowerCase() ? this.record : null;
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    return id === this.record.id ? this.record : null;
  }

  async loadScope(): Promise<ScopeFacts> {
    return this.scope;
  }

  async establishmentCompanyId(establishmentId: string): Promise<string | null> {
    if (establishmentId === establishmentA) return companyA;
    if (establishmentId === establishmentB) return companyB;
    return null;
  }
}

class MemorySessions implements SessionStore {
  refresh = new Map<string, { userId: string; expiresAt: Date; revokedAt: Date | null }>();
  resets = new Map<string, { userId: string; expiresAt: Date; usedAt: Date | null }>();

  async saveRefresh(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    this.refresh.set(tokenHash, { userId, expiresAt, revokedAt: null });
  }

  async findRefresh(tokenHash: string) {
    return this.refresh.get(tokenHash) ?? null;
  }

  async revokeRefresh(tokenHash: string): Promise<void> {
    const row = this.refresh.get(tokenHash);
    if (row) row.revokedAt = new Date();
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const row of this.refresh.values()) {
      if (row.userId === userId) row.revokedAt = new Date();
    }
  }

  async savePasswordReset(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    this.resets.set(tokenHash, { userId, expiresAt, usedAt: null });
  }

  async consumePasswordReset(tokenHash: string, now: Date): Promise<string | null> {
    const row = this.resets.get(tokenHash);
    if (!row || row.usedAt || row.expiresAt <= now) return null;
    row.usedAt = now;
    return row.userId;
  }
}

function serviceFor(directory: MemoryDirectory, sessions = new MemorySessions(), debug = false) {
  const jwt = new JwtService({ secret: "test-secret-test-secret-test-secret" });
  const config = {
    get: (key: string) => {
      if (key === "JWT_ACCESS_TTL") return "15m";
      if (key === "JWT_REFRESH_TTL_DAYS") return 7;
      if (key === "PASSWORD_RESET_DEBUG") return debug;
      return undefined;
    },
  } as ConfigService;
  return new AuthService(directory, sessions, jwt, config);
}

describe("AuthService", () => {
  let encryptedPassword: string;
  let directory: MemoryDirectory;

  beforeAll(async () => {
    encryptedPassword = await hash("correct-password", 4);
  });

  beforeEach(() => {
    directory = new MemoryDirectory(
      {
        id: userId,
        email: "staff@hotel.test",
        encryptedPassword,
        emailConfirmedAt: new Date("2026-01-01T00:00:00.000Z"),
        bannedUntil: null,
      },
      { isSuperAdmin: false, companyIds: [companyA] },
    );
  });

  it("logs in with the existing bcrypt hash and does not rewrite it", async () => {
    const auth = serviceFor(directory);
    const session = await auth.login("staff@hotel.test", "correct-password");
    expect(session.user.companyIds).toEqual([companyA]);
    expect(session.accessToken).toEqual(expect.any(String));
    expect(directory.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects a wrong password", async () => {
    const auth = serviceFor(directory);
    await expect(auth.login("staff@hotel.test", "wrong-password")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects an unconfirmed email", async () => {
    directory = new MemoryDirectory(
      { ...directory.record, emailConfirmedAt: null },
      { isSuperAdmin: false, companyIds: [companyA] },
    );
    await expect(serviceFor(directory).login("staff@hotel.test", "correct-password")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("refuses another company's establishment and allows the member's own", async () => {
    const auth = serviceFor(directory);
    const session = await auth.login("staff@hotel.test", "correct-password");
    await expect(auth.assertEstablishment(session.user, establishmentB)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(auth.assertEstablishment(session.user, establishmentA)).resolves.toEqual({
      establishmentId: establishmentA,
      companyId: companyA,
    });
  });

  it("rotates refresh tokens and rejects a reused one", async () => {
    const sessions = new MemorySessions();
    const auth = serviceFor(directory, sessions);
    const first = await auth.login("staff@hotel.test", "correct-password");
    const second = await auth.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(auth.refresh(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("replaces the hash only when a reset token is consumed", async () => {
    const sessions = new MemorySessions();
    const auth = serviceFor(directory, sessions, true);
    const issued = await auth.forgotPassword("staff@hotel.test");
    expect(issued.resetToken).toEqual(expect.any(String));
    await auth.resetPassword(issued.resetToken!, "new-password");
    expect(directory.updatePassword).toHaveBeenCalledWith(userId, expect.stringMatching(/^\$2[aby]\$/));
    expect(sessions.refresh.size).toBe(0);
    const stored = sessions.resets.get(hashToken(issued.resetToken!));
    expect(stored?.usedAt).toBeInstanceOf(Date);
  });

  it("does not reveal whether the email exists", async () => {
    const auth = serviceFor(directory);
    await expect(auth.forgotPassword("missing@hotel.test")).resolves.toEqual({ status: "accepted" });
  });
});
