import { supabase } from "@/integrations/supabase/client";
import { normalizeStorageObjectPath } from "@/lib/storageObjectPath";

/** URL exibível para imagens do bucket `documents`. */
export async function resolveDocumentStorageUrl(
  stored: string | null | undefined
): Promise<string | null> {
  if (!stored?.trim()) return null;

  const trimmed = stored.trim();
  const objectPath = normalizeStorageObjectPath(trimmed);
  if (!objectPath) return null;

  const { data: pub } = supabase.storage.from("documents").getPublicUrl(objectPath);
  return pub.publicUrl;
}

export async function resolveDocumentFields<T extends Record<string, unknown>>(
  doc: T,
  keys: (keyof T)[]
): Promise<T> {
  const out = { ...doc };
  await Promise.all(
    keys.map(async (key) => {
      const raw = doc[key];
      if (typeof raw !== "string" || !raw.trim()) return;
      out[key] = (await resolveDocumentStorageUrl(raw)) as T[keyof T];
    })
  );
  return out;
}