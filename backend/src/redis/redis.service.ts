import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>("REDIS_URL"), {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log("Redis connected");
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.client.status === "ready" || this.client.status === "connect") {
        await this.client.quit();
      }
    } catch {
      this.client.disconnect();
    }
  }

  async ping(): Promise<void> {
    const result = await this.client.ping();
    if (result !== "PONG") {
      throw new Error(`Unexpected Redis ping response: ${result}`);
    }
  }
}
