/** Mesmo formato de `public.generate_quote_code()` (QUO + 6 dígitos). */
export function generateQuoteCode(): string {
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `QUO${suffix}`;
}