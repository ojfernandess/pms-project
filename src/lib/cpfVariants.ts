/** Variantes de CPF para busca (dígitos, mascarado), alinhado ao check-in manual. */
export function cpfSearchVariants(cpf: string): string[] {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) {
    const trimmed = cpf.trim();
    return trimmed ? [trimmed] : [];
  }
  const masked = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  return [...new Set([cpf.trim(), digits, masked])];
}