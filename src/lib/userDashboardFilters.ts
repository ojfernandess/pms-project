import type { DashboardEstablishment } from "@/hooks/useAccessibleEstablishments";

export type EstablishmentTypeFilter = "all" | "hotel" | "apartment";
export type StatusFilter = "all" | "active" | "inactive";

export function normalizeEstablishmentType(type: string | null | undefined): string {
  return String(type || "hotel").toLowerCase();
}

export function filterEstablishmentsForSearch(
  establishments: DashboardEstablishment[],
  companyById: Map<string, { name?: string; cnpj?: string | null }>,
  search: string,
  typeFilter: EstablishmentTypeFilter,
  statusFilter: StatusFilter,
): DashboardEstablishment[] {
  const q = search.trim().toLowerCase();

  return establishments.filter((est) => {
    if (statusFilter === "active" && est.is_active === false) return false;
    if (statusFilter === "inactive" && est.is_active !== false) return false;

    const t = normalizeEstablishmentType(est.type);
    if (typeFilter === "hotel" && t !== "hotel") return false;
    if (typeFilter === "apartment" && t !== "apartment") return false;

    if (!q) return true;

    const company = companyById.get(est.company_id);
    const haystack = [
      est.name,
      company?.name,
      company?.cnpj,
      est.city,
      est.slug,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(q) || est.name.toLowerCase().includes(q);
  });
}

export function establishmentTypeLabel(type: string | null | undefined): string {
  const t = normalizeEstablishmentType(type);
  if (t === "hotel") return "Hotel";
  if (t === "apartment") return "Apartamento";
  return "Outro";
}