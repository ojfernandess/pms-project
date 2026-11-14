import { BeforeApplicationShutdown, Injectable } from "@nestjs/common";
import { RedisIoAdapter } from "./redis-io.adapter";

let socketRedisAdapter: RedisIoAdapter | null = null;

export function registerSocketRedisAdapter(adapter: RedisIoAdapter): void {
  socketRedisAdapter = adapter;
}

@Injectable()
export class SocketRedisAdapterShutdown implements BeforeApplicationShutdown {
  async beforeApplicationShutdown(): Promise<void> {
    if (!socketRedisAdapter) return;
    await socketRedisAdapter.close();
    socketRedisAdapter = null;
  }
}
