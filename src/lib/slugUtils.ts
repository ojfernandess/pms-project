/**
 * Utilitários para geração e normalização de slugs SEO (URLs amigáveis).
 * Usado em: hotel/empresa, estabelecimento, categoria de quarto, destino, promoção.
 */

/**
 * Converte texto para slug URL-friendly:
 * - minúsculo
 * - sem acentos (NFD + remove combining marks)
 * - caracteres especiais substituídos por hífen
 * - hífens múltiplos colapsados
 * - trim de hífens no início e fim
 */
export function generateSlug(name: string): string {
  if (!name || typeof name !== "string") return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Melhora um slug já existente (ex.: digitado pelo usuário):
 * aplica a mesma normalização para garantir formato válido.
 */
export function improveSlug(slug: string): string {
  if (!slug || typeof slug !== "string") return "";
  const improved = generateSlug(slug);
  return improved || slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Gera slug a partir do nome; se o nome já for um slug válido, apenas melhora.
 */
export function slugFromName(name: string): string {
  if (!name) return "";
  const trimmed = name.trim();
  const looksLikeSlug = /^[a-z0-9-]+$/.test(trimmed) && !/\s/.test(trimmed);
  return looksLikeSlug ? improveSlug(trimmed) : generateSlug(trimmed);
}
