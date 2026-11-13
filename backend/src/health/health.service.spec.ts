import { ServiceUnavailableException } from "@nestjs/common";
import { HealthService } from "./health.service";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

describe("HealthService", () => {
  it("reports ok when postgres and redis answer", async () => {
    const prisma = { ping: jest.fn().mockResolvedValue(undefined) } as unknown as PrismaService;
    const redis = { ping: jest.fn().mockResolvedValue(undefined) } as unknown as RedisService;
    const service = new HealthService(prisma, redis);

    await expect(service.check()).resolves.toEqual(
      expect.objectContaining({ status: "ok", postgres: "ok", redis: "ok" }),
    );
  });

  it("returns 503 when a dependency fails", async () => {
    const prisma = { ping: jest.fn().mockRejectedValue(new Error("db down")) } as unknown as PrismaService;
    const redis = { ping: jest.fn() } as unknown as RedisService;
    const service = new HealthService(prisma, redis);

    await expect(service.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
