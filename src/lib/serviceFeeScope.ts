import { CLEANING_FEE_KIND } from "@/lib/cleaningFeeConfig";
import { PARKING_FEE_KIND } from "@/lib/parkingFeeConfig";

const SCOPED_BY_BUILDING_KINDS = new Set([CLEANING_FEE_KIND, PARKING_FEE_KIND]);

export type ServiceFeeRow = {
  id: string;
  name: string;
  is_active?: boolean | null;
  service_kind?: string | null;
  building_id?: string | null;
};

/** Mesmo escopo: estabelecimento (buildingId null) vs prédio específico. */
export function serviceFeeScopeMatches(
  configBuildingId: string | null | undefined,
  targetBuildingId: string | null | undefined,
): boolean {
  return (configBuildingId ?? null) === (targetBuildingId ?? null);
}

/** Não reutiliza id de config de outro escopo (ex. estabelecimento ao salvar prédio). */
export function existingServiceRowIdForScope(
  config: { id?: string; buildingId?: string | null } | null | undefined,
  targetBuildingId?: string | null,
): string | null {
  if (!config?.id) return null;
  if (!serviceFeeScopeMatches(config.buildingId, targetBuildingId)) return null;
  return config.id;
}

/** Taxas automáticas (limpeza/estacionamento): só a do hotel ou a do prédio da categoria da reserva. */
export function filterServiceFeesForReservation(
  fees: ServiceFeeRow[],
  reservationBuildingId?: string | null,
): ServiceFeeRow[] {
  const buildingId = reservationBuildingId?.trim() ? reservationBuildingId : null;
  return fees.filter((fee) => {
    if (fee.is_active === false) return false;
    const kind = fee.service_kind ?? "custom";
    if (!SCOPED_BY_BUILDING_KINDS.has(kind)) return true;
    const feeBuilding = fee.building_id ?? null;
    if (buildingId) return feeBuilding === buildingId;
    return feeBuilding == null;
  });
}

/** Corrige rótulo legado "… (prédio)" quando building_id está vazio. */
export function displayServiceFeeName(fee: Pick<ServiceFeeRow, "name" | "building_id">): string {
  const name = String(fee.name ?? "").trim();
  if (!fee.building_id && /\s*\(pr[eé]dio\)\s*$/i.test(name)) {
    return name.replace(/\s*\(pr[eé]dio\)\s*$/i, "").trim();
  }
  return name;
}