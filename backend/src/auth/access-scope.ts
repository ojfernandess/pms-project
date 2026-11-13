/**
 * Espelha public.user_can_access_establishment depois de
 * supabase/migrations/20251219000005_fix_employees_rls_recursion_final.sql.
 *
 * Super admin, ou vínculo em user_companies com a empresa do estabelecimento.
 * A versão anterior exigia user_companies.is_active e foi substituída.
 * Funcionário só em public.employees não passa nesta função.
 */
export interface EstablishmentAccessFacts {
  isSuperAdmin: boolean;
  companyIds: string[];
  establishmentCompanyId: string | null;
}

export function canAccessEstablishment(facts: EstablishmentAccessFacts): boolean {
  if (facts.isSuperAdmin) return true;
  if (!facts.establishmentCompanyId) return false;
  return facts.companyIds.includes(facts.establishmentCompanyId);
}

export function canAccessCompany(isSuperAdmin: boolean, companyIds: string[], companyId: string): boolean {
  if (isSuperAdmin) return true;
  return companyIds.includes(companyId);
}
