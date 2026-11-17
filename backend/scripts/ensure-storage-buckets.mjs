/**
 * Marca bucket documents como público (Web Check-in sem signed URL).
 * STORAGE_DIR default: /app/storage
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.env.STORAGE_DIR || "/app/storage";
const metaPath = join(root, ".buckets.json");

const DEFAULTS = {
  documents: { public: true },
  "hotel-assets": { public: true },
  maintenance: { public: false },
};

async function main() {
  await mkdir(root, { recursive: true });
  let meta = {};
  try {
    meta = JSON.parse(await readFile(metaPath, "utf8"));
  } catch {
    meta = {};
  }
  let changed = false;
  for (const [name, cfg] of Object.entries(DEFAULTS)) {
    const prev = meta[name];
    if (!prev || prev.public !== cfg.public) {
      meta[name] = { ...cfg, ...prev, public: cfg.public };
      changed = true;
    }
  }
  if (changed || !Object.keys(meta).length) {
    await writeFile(metaPath, JSON.stringify(meta, null, 2));
    console.log("Storage buckets atualizados:", Object.keys(DEFAULTS).join(", "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(0);
});