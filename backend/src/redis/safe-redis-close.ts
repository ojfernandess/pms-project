import Redis from "ioredis";

/** Fecha cliente ioredis sem lançar "Connection is closed" durante SIGTERM/redeploy. */
export async function safeRedisClose(client: Redis | null | undefined): Promise<void> {
  if (!client) return;
  const status = client.status;
  if (status === "end" || status === "close" || status === "wait") {
    client.disconnect(false);
    return;
  }
  try {
    await client.quit();
  } catch {
    client.disconnect(false);
  }
}
