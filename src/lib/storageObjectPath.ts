/**
 * Normaliza referências a objetos no storage (path relativo ou URL pública/assinada da API).
 */
export function normalizeStorageObjectPath(path: string): string {
  let p = (path || "").trim();
  if (!p) return p;
  const storageIdx = p.indexOf("/storage/v1/object/");
  if (storageIdx >= 0) {
    const rest = p.slice(storageIdx + "/storage/v1/object/".length);
    const segments = rest.split("/").filter(Boolean);
    const head = segments[0] ? decodeURIComponent(segments[0]) : "";
    if (head === "public" || head === "sign" || head === "sign-get") {
      p = segments.slice(2).map(decodeURIComponent).join("/");
    } else {
      p = segments.slice(1).map(decodeURIComponent).join("/");
    }
  } else if (p.includes("/documents/")) {
    const match = p.match(/\/documents\/(.+?)(?:\?|#|$)/);
    if (match?.[1]) {
      p = decodeURIComponent(match[1]);
    }
  } else if (!p.startsWith("web-checkin/") && p.includes("%2F")) {
    try {
      p = decodeURIComponent(p);
    } catch {
      /* manter valor original */
    }
  }
  const q = p.indexOf("?");
  if (q >= 0) p = p.slice(0, q);
  const hash = p.indexOf("#");
  if (hash >= 0) p = p.slice(0, hash);
  return p;
}