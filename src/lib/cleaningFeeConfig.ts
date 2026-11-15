import { supabase } from "@/integrations/supabase/client";

export const CLEANING_FEE_KIND = "cleaning_fee";
export const CLEANING_FEE_NAME = "Taxa de limpeza";

export type CleaningFeeConfig = {
  id: string;
  establishmentId: string | null;
  buildingId: string | null;
  amount: number;
  isActive: boolean;
  serviceFeeId: string | null;
};

export function isCleaningFeeConfigured(config: CleaningFeeConfig | null | undefined): boolean {
  return Boolean(config?.isActive && Number(config?.amount) > 0);
}

/** Resolve taxa de limpeza: prédio da categoria tem prioridade sobre estabelecimento. */
export async function fetchCleaningFeeConfig(params: {
  establishmentId: string;
  buildingId?: string | null;
}): Promise<CleaningFeeConfig | null> {
  const { establishmentId, buildingId } = params;

  if (buildingId) {
    const { data: buildingRow } = await supabase
      .from("establishment_services")
      .select("id, establishment_id, building_id, default_amount, is_active")
      .eq("building_id", buildingId)
      .eq("service_kind", CLEANING_FEE_KIND)
      .maybeSingle();

    if (buildingRow) {
      const serviceFeeId = await findLinkedServiceFeeId(establishmentId, buildingRow.id);
      return mapRow(buildingRow, serviceFeeId);
    }
  }

  const { data: estRow } = await supabase
    .from("establishment_services")
    .select("id, establishment_id, building_id, default_amount, is_active")
    .eq("establishment_id", establishmentId)
    .is("building_id", null)
    .eq("service_kind", CLEANING_FEE_KIND)
    .maybeSingle();

  if (!estRow) return null;
  const serviceFeeId = await findLinkedServiceFeeId(establishmentId, estRow.id);
  return mapRow(estRow, serviceFeeId);
}

function mapRow(
  row: {
    id: string;
    establishment_id: string | null;
    building_id: string | null;
    default_amount: number | null;
    is_active: boolean;
  },
  serviceFeeId: string | null,
): CleaningFeeConfig {
  return {
    id: row.id,
    establishmentId: row.establishment_id,
    buildingId: row.building_id,
    amount: Number(row.default_amount || 0),
    isActive: Boolean(row.is_active),
    serviceFeeId,
  };
}

async function findLinkedServiceFeeId(establishmentId: string, sourceServiceId: string): Promise<string | null> {
  const { data } = await supabase
    .from("service_fees")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("source_service_id", sourceServiceId)
    .maybeSingle();
  return data?.id ?? null;
}

/** Persiste configuração e espelha em service_fees (Financeiro → Taxas). */
export async function upsertCleaningFeeConfig(params: {
  establishmentId: string;
  buildingId?: string | null;
  amount: number;
  isActive: boolean;
  existingServiceRowId?: string | null;
}): Promise<CleaningFeeConfig> {
  const { establishmentId, buildingId, amount, isActive, existingServiceRowId } = params;
  const payload = {
    name: CLEANING_FEE_NAME,
    description: "Taxa única de limpeza (configurada em Serviços)",
    service_kind: CLEANING_FEE_KIND,
    default_amount: amount,
    is_active: isActive,
    establishment_id: buildingId ? null : establishmentId,
    building_id: buildingId ?? null,
  };

  let serviceRowId = existingServiceRowId;

  if (serviceRowId) {
    const { error } = await supabase.from("establishment_services").update(payload).eq("id", serviceRowId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("establishment_services").insert(payload).select("id").single();
    if (error) throw error;
    serviceRowId = data.id;
  }

  let feeQuery = supabase
    .from("service_fees")
    .select("id")
    .eq("establishment_id", establishmentId)
    .eq("service_kind", CLEANING_FEE_KIND);
  feeQuery = buildingId ? feeQuery.eq("building_id", buildingId) : feeQuery.is("building_id", null);
  const { data: existingFee } = await feeQuery.maybeSingle();

  const feeName = buildingId ? `${CLEANING_FEE_NAME} (prédio)` : CLEANING_FEE_NAME;

  const feePayload = {
    establishment_id: establishmentId,
    name: feeName,
    description: buildingId ? "Taxa de limpeza do prédio" : "Taxa de limpeza do estabelecimento",
    service_kind: CLEANING_FEE_KIND,
    default_amount: amount,
    is_active: isActive && amount > 0,
    source_service_id: serviceRowId,
    building_id: buildingId ?? null,
  };

  let serviceFeeId: string;
  if (existingFee?.id) {
    const { error } = await supabase.from("service_fees").update(feePayload).eq("id", existingFee.id);
    if (error) throw error;
    serviceFeeId = existingFee.id;
  } else {
    const { data, error } = await supabase.from("service_fees").insert(feePayload).select("id").single();
    if (error) throw error;
    serviceFeeId = data.id;
  }

  return {
    id: serviceRowId!,
    establishmentId: buildingId ? null : establishmentId,
    buildingId: buildingId ?? null,
    amount,
    isActive: isActive && amount > 0,
    serviceFeeId,
  };
}

/** Rateia taxa única de limpeza entre as diárias (última diária absorve centavos). */
export async function attachCleaningFeeToReservation(params: {
  reservationId: string;
  serviceFeeId: string;
  amount: number;
}): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("reservation_service_fees").insert({
    reservation_id: params.reservationId,
    service_fee_id: params.serviceFeeId,
    amount: params.amount,
    quantity: 1,
    notes: "Taxa de limpeza (cotação)",
    created_by: user?.id ?? null,
  });
  if (error) throw error;
}

/** Rateia taxa única de limpeza entre as diárias (última diária absorve centavos). */
export function allocateCleaningFeePerNight(cleaningFee: number, nights: number): number[] {
  if (nights <= 0 || cleaningFee <= 0) return [];
  const base = Math.floor((cleaningFee / nights) * 100) / 100;
  const amounts = Array.from({ length: nights }, () => base);
  const sum = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
  const diff = Math.round((cleaningFee - sum) * 100) / 100;
  amounts[nights - 1] = Math.round((amounts[nights - 1] + diff) * 100) / 100;
  return amounts;
}