export interface AuthUserRecord {
  id: string;
  email: string;
  encryptedPassword: string | null;
  emailConfirmedAt: Date | null;
  bannedUntil: Date | null;
}

export interface ScopeFacts {
  isSuperAdmin: boolean;
  companyIds: string[];
}

export interface AuthDirectory {
  findByEmail(email: string): Promise<AuthUserRecord | null>;
  findById(id: string): Promise<AuthUserRecord | null>;
  loadScope(userId: string): Promise<ScopeFacts>;
  establishmentCompanyId(establishmentId: string): Promise<string | null>;
  updatePassword(userId: string, bcryptHash: string): Promise<void>;
}

export interface RefreshRecord {
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface SessionStore {
  saveRefresh(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  findRefresh(tokenHash: string): Promise<RefreshRecord | null>;
  revokeRefresh(tokenHash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
  savePasswordReset(userId: string, tokenHash: string, expiresAt: Date): Promise<void>;
  consumePasswordReset(tokenHash: string, now: Date): Promise<string | null>;
}
