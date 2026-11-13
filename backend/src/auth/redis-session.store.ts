import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { RefreshRecord, SessionStore } from "./auth.types";

type StoredRefresh = { userId: string; expiresAt: string; revokedAt: string | null };

@Injectable()
export class RedisSessionStore implements SessionStore {
  constructor(private readonly redis: RedisService) {}

  async saveRefresh(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const ttl = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    const value: StoredRefresh = { userId, expiresAt: expiresAt.toISOString(), revokedAt: null };
    await this.redis.client.set(refreshKey(tokenHash), JSON.stringify(value), "EX", ttl);
    await this.redis.client.sadd(userKey(userId), tokenHash);
    await this.redis.client.expire(userKey(userId), ttl);
  }

  async findRefresh(tokenHash: string): Promise<RefreshRecord | null> {
    const raw = await this.redis.client.get(refreshKey(tokenHash));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredRefresh;
    return {
      userId: stored.userId,
      expiresAt: new Date(stored.expiresAt),
      revokedAt: stored.revokedAt ? new Date(stored.revokedAt) : null,
    };
  }

  async revokeRefresh(tokenHash: string): Promise<void> {
    const current = await this.findRefresh(tokenHash);
    await this.redis.client.del(refreshKey(tokenHash));
    if (current) await this.redis.client.srem(userKey(current.userId), tokenHash);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    const hashes = await this.redis.client.smembers(userKey(userId));
    if (hashes.length > 0) await this.redis.client.del(...hashes.map(refreshKey));
    await this.redis.client.del(userKey(userId));
  }

  async savePasswordReset(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    const ttl = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
    await this.redis.client.set(resetKey(tokenHash), userId, "EX", ttl);
  }

  async consumePasswordReset(tokenHash: string, now: Date): Promise<string | null> {
    const key = resetKey(tokenHash);
    const userId = await this.redis.client.get(key);
    if (!userId) return null;
    const ttl = await this.redis.client.ttl(key);
    await this.redis.client.del(key);
    if (ttl === 0) return null;
    void now;
    return userId;
  }
}

function refreshKey(hash: string): string {
  return `auth:refresh:${hash}`;
}

function userKey(userId: string): string {
  return `auth:user:${userId}`;
}

function resetKey(hash: string): string {
  return `auth:reset:${hash}`;
}
