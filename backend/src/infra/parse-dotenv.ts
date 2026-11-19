/** Parseia bloco KEY=VALUE (formato Dokploy / .env), preservando linhas vazias e comentários. */
export function parseDotenvBlock(raw: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw?.trim()) return map;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1);
    if (key) map.set(key, value);
  }
  return map;
}

export function serializeDotenvBlock(map: Map<string, string>): string {
  return [...map.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

export function upsertDotenvVar(block: string | null | undefined, key: string, value: string): string {
  const map = parseDotenvBlock(block);
  map.set(key, value);
  return serializeDotenvBlock(map);
}