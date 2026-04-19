export type FnrhCategoryScopeSettings = {
  enabled?: boolean | null;
  fnrh_category_scope?: string | null;
  fnrh_category_ids?: string[] | null;
};

/**
 * Se `scope` é `selected` e há IDs, a reserva precisa ter `category_id` na lista.
 * Caso contrário, FNRH não é obrigatório para aquela categoria.
 */
export function isFnrhApplicableForCategory(
  reservationCategoryId: string | null | undefined,
  settings: FnrhCategoryScopeSettings | null | undefined,
): boolean {
  if (!settings) return true;
  const scope = settings.fnrh_category_scope ?? "all";
  if (scope !== "selected") return true;
  const ids = settings.fnrh_category_ids;
  if (!ids || ids.length === 0) return false;
  const cid = reservationCategoryId ? String(reservationCategoryId) : "";
  if (!cid) return false;
  return ids.some((x) => String(x) === cid);
}

/** UI / validação no check-in: integração ligada e categoria no escopo (nunca assumir “todas” sem settings). */
export function shouldShowFnrhGuestFields(
  settings: FnrhCategoryScopeSettings | null | undefined,
  reservationCategoryId: string | null | undefined,
): boolean {
  if (!settings?.enabled) return false;
  return isFnrhApplicableForCategory(reservationCategoryId, settings);
}
