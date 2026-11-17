import { ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HealthService } from "./health.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { SchemaReadinessService } from "../prisma/schema-readiness.service";

function mockSchema(ready = true): SchemaReadinessService {
  return { schemaReady: ready, publicTableCount: ready ? 120 : 0 } as SchemaReadinessService;
}

function mockConfig(): ConfigService {
  return { get: jest.fn().mockReturnValue("") } as unknown as ConfigService;
}

describe("HealthService", () => {
  it("reports ok when postgres and redis answer", async () => {
    const prisma = { ping: jest.fn().mockResolvedValue(undefined) } as unknown as PrismaService;
    const redis = { ping: jest.fn().mockResolvedValue(undefined) } as unknown as RedisService;
    const service = new HealthService(prisma, redis, mockSchema(true), mockConfig());

    await expect(service.check()).resolves.toEqual(
      expect.objectContaining({ status: "ok", postgres: "ok", redis: "ok" }),
    );
  });

  it("returns degraded when schema is missing", async () => {
    const prisma = { ping: jest.fn().mockResolvedValue(undefined) } as unknown as PrismaService;
    const redis = { ping: jest.fn().mockResolvedValue(undefined) } as unknown as RedisService;
    const service = new HealthService(prisma, redis, mockSchema(false), mockConfig());

    const report = await service.check();
    expect(report.status).toBe("degraded");
    expect(report.schema?.ready).toBe(false);
  });

  it("returns 503 when a dependency fails", async () => {
    const prisma = { ping: jest.fn().mockRejectedValue(new Error("db down")) } as unknown as PrismaService;
    const redis = { ping: jest.fn() } as unknown as RedisService;
    const service = new HealthService(prisma, redis, mockSchema(true), mockConfig());

  await expect(service.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
