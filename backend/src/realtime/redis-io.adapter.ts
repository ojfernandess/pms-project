import { INestApplication } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { ServerOptions } from "socket.io";

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pub: Redis | null = null;
  private sub: Redis | null = null;

  constructor(app: INestApplication) {
    super(app);
  }

  async connectToRedis(redisUrl: string): Promise<void> {
    this.pub = new Redis(redisUrl, { maxRetriesPerRequest: null });
    this.sub = this.pub.duplicate();
    await Promise.all([this.pub.ping(), this.sub.ping()]);
    this.adapterConstructor = createAdapter(this.pub, this.sub);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  async close(): Promise<void> {
    await this.pub?.quit();
    await this.sub?.quit();
  }
}
