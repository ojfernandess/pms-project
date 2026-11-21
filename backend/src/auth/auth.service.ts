import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { canAccessCompany, canAccessEstablishment } from "./access-scope";
import { AUTH_DIRECTORY, SESSION_STORE } from "./auth.tokens";
import { AuthDirectory, AuthUserRecord, ScopeFacts, SessionStore } from "./auth.types";
import { hashPassword, hashToken, newToken, passwordsMatch } from "./password";
import { PasswordResetMailService } from "./password-reset-mail.service";

export interface SessionUser extends ScopeFacts {
  id: string;
  email: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

type MeCacheEntry = { user: SessionUser; expiresAt: number };

@Injectable()
export class AuthService {
  /** Evita 2–3 queries Prisma por request REST (esgota pool com rajadas do frontend). */
  private readonly meCache = new Map<string, MeCacheEntry>();
  private static readonly ME_CACHE_TTL_MS = Number(process.env.AUTH_ME_CACHE_TTL_MS ?? 45_000);
  private static readonly ME_CACHE_MAX_ENTRIES = Number(process.env.AUTH_ME_CACHE_MAX ?? 512);

  constructor(
    @Inject(AUTH_DIRECTORY) private readonly directory: AuthDirectory,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly resetMail?: PasswordResetMailService,
  ) {}

  async login(email: string, password: string): Promise<IssuedSession> {
    const user = await this.directory.findByEmail(email.trim());
    if (!user?.encryptedPassword) {
      throw new UnauthorizedException("Invalid login credentials");
    }
    if (user.bannedUntil && user.bannedUntil.getTime() > Date.now()) {
      throw new UnauthorizedException("Invalid login credentials");
    }
    if (!user.emailConfirmedAt) {
      throw new ForbiddenException("Email not confirmed");
    }
    const matches = await passwordsMatch(password, user.encryptedPassword);
    if (!matches) {
      throw new UnauthorizedException("Invalid login credentials");
    }
    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<IssuedSession> {
    const record = await this.sessions.findRefresh(hashToken(refreshToken));
    if (!record || record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    const user = await this.directory.findById(record.userId);
    if (!user) throw new UnauthorizedException("Invalid refresh token");
    await this.sessions.revokeRefresh(hashToken(refreshToken));
    return this.issueSession(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.sessions.revokeRefresh(hashToken(refreshToken));
  }

  async me(userId: string): Promise<SessionUser> {
    const now = Date.now();
    const cached = this.meCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.user;
    }

    const user = await this.directory.findById(userId);
    if (!user) throw new UnauthorizedException("Invalid login credentials");
    const scope = await this.directory.loadScope(user.id);
    const sessionUser: SessionUser = { id: user.id, email: user.email, ...scope };

    this.meCache.set(userId, {
      user: sessionUser,
      expiresAt: now + AuthService.ME_CACHE_TTL_MS,
    });
    if (this.meCache.size > AuthService.ME_CACHE_MAX_ENTRIES) {
      const firstKey = this.meCache.keys().next().value as string | undefined;
      if (firstKey) this.meCache.delete(firstKey);
    }

    return sessionUser;
  }

  invalidateMeCache(userId?: string): void {
    if (userId) {
      this.meCache.delete(userId);
      return;
    }
    this.meCache.clear();
  }

  async forgotPassword(email: string): Promise<{ status: "accepted"; resetToken?: string }> {
    const user = await this.directory.findByEmail(email.trim());
    if (!user) return { status: "accepted" };
    const resetToken = newToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.sessions.savePasswordReset(user.id, hashToken(resetToken), expiresAt);
    try {
      await this.resetMail?.sendStaffReset(user.email, resetToken);
    } catch {
      /* não revelar falha de e-mail */
    }
    if (this.config.get<boolean>("PASSWORD_RESET_DEBUG") === true) {
      return { status: "accepted", resetToken };
    }
    return { status: "accepted" };
  }

  /** Recuperação de senha do Web Check-in (hóspede) — gera token e envia e-mail no Nest. */
  async guestForgotPassword(email: string): Promise<{ status: "accepted" }> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !this.prisma) return { status: "accepted" };

    const account = await this.prisma.guest_accounts.findFirst({
      where: { email: { equals: normalized, mode: "insensitive" } },
      select: { id: true, email: true, full_name: true, is_active: true },
    });
    if (!account || account.is_active === false) return { status: "accepted" };

    const resetToken = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await this.prisma.guest_accounts.update({
      where: { id: account.id },
      data: {
        reset_token: resetToken,
        reset_token_expires_at: expiresAt,
        updated_at: new Date(),
      },
    });

    try {
      await this.resetMail?.sendGuestReset({
        email: account.email,
        fullName: account.full_name,
        resetToken,
      });
    } catch {
      /* não revelar falha de e-mail */
    }
    return { status: "accepted" };
  }

  async resetPassword(token: string, password: string): Promise<void> {
    if (password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }
    const userId = await this.sessions.consumePasswordReset(hashToken(token), new Date());
    if (!userId) throw new BadRequestException("Invalid or expired reset token");
    await this.directory.updatePassword(userId, await hashPassword(password));
    await this.sessions.revokeAllForUser(userId);
  }

  async assertEstablishment(user: SessionUser, establishmentId: string): Promise<{ establishmentId: string; companyId: string }> {
    const companyId = await this.directory.establishmentCompanyId(establishmentId);
    const allowed = canAccessEstablishment({
      isSuperAdmin: user.isSuperAdmin,
      companyIds: user.companyIds,
      establishmentCompanyId: companyId,
    });
    if (!allowed || !companyId) {
      throw new ForbiddenException("Establishment access denied");
    }
    return { establishmentId, companyId };
  }

  assertCompany(user: SessionUser, companyId: string): void {
    if (!canAccessCompany(user.isSuperAdmin, user.companyIds, companyId)) {
      throw new ForbiddenException("Company access denied");
    }
  }

  private async issueSession(user: AuthUserRecord): Promise<IssuedSession> {
    const scope = await this.directory.loadScope(user.id);
    const sessionUser: SessionUser = { id: user.id, email: user.email, ...scope };
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "15m" },
    );
    const refreshToken = newToken();
    const days = Number(this.config.get("JWT_REFRESH_TTL_DAYS") ?? 7);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await this.sessions.saveRefresh(user.id, hashToken(refreshToken), expiresAt);
    return { accessToken, refreshToken, user: sessionUser };
  }
}
