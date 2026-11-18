import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CheckinGuestConfig, CheckinGuestInfoType } from "@/lib/checkinCompleteVariables";

export interface CheckinGuestInfoServiceRow {
  id: string;
  establishment_id: string | null;
  building_id: string | null;
  name: string;
  description?: string | null;
  is_active: boolean;
  checkin_guest_info_type: CheckinGuestInfoType;
  checkin_guest_config: CheckinGuestConfig;
  checkin_display_order: number;
}

export type CheckinGuestInfoServiceInput = {
  id?: string;
  name: string;
  is_active?: boolean;
  checkin_guest_info_type: CheckinGuestInfoType;
  checkin_guest_config: CheckinGuestConfig;
  checkin_display_order?: number;
};

type Scope =
  | { kind: "establishment"; establishmentId: string }
  | { kind: "building"; buildingId: string };

export function useCheckinGuestInfoServices(scope: Scope | null) {
  const queryClient = useQueryClient();
  const queryKey =
    scope?.kind === "establishment"
      ? ["checkin_guest_info_services", "establishment", scope.establishmentId]
      : scope?.kind === "building"
        ? ["checkin_guest_info_services", "building", scope.buildingId]
        : ["checkin_guest_info_services", "none"];

  const { data: items = [], isLoading, refetch } = useQuery({
    queryKey,
    enabled: !!scope,
    queryFn: async (): Promise<CheckinGuestInfoServiceRow[]> => {
      if (!scope) return [];
      let query = supabase
        .from("establishment_services")
        .select(
          "id, establishment_id, building_id, name, description, is_active, checkin_guest_info_type, checkin_guest_config, checkin_display_order",
        )
        .not("checkin_guest_info_type", "is", null)
        .order("checkin_display_order", { ascending: true })
        .order("name", { ascending: true });

      if (scope.kind === "establishment") {
        query = query.eq("establishment_id", scope.establishmentId).is("building_id", null);
      } else {
        query = query.eq("building_id", scope.buildingId).is("establishment_id", null);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Erro ao buscar informações do check-in:", error);
        return [];
      }
      return (data || []) as CheckinGuestInfoServiceRow[];
    },
  });

  const upsert = useMutation({
    mutationFn: async (input: CheckinGuestInfoServiceInput) => {
      if (!scope) throw new Error("Escopo não definido");
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        name: input.name.trim(),
        is_active: input.is_active ?? true,
        service_kind: "amenity" as const,
        checkin_guest_info_type: input.checkin_guest_info_type,
        checkin_guest_config: input.checkin_guest_config ?? {},
        checkin_display_order: input.checkin_display_order ?? items.length,
        description: null,
      };

      if (input.id) {
        const { data, error } = await supabase
          .from("establishment_services")
          .update(payload)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data;
      }

      const insertBody =
        scope.kind === "establishment"
          ? {
              ...payload,
              establishment_id: scope.establishmentId,
              building_id: null,
              created_by: user?.id ?? null,
            }
          : {
              ...payload,
              building_id: scope.buildingId,
              establishment_id: null,
              created_by: user?.id ?? null,
            };

      const { data, error } = await supabase
        .from("establishment_services")
        .insert(insertBody)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ["establishment_services"] });
      queryClient.invalidateQueries({ queryKey: ["building_services"] });
      toast.success("Informação salva para o check-in concluído");
    },
    onError: (error: { code?: string; message?: string }) => {
      if (error.code === "23505") toast.error("Já existe um item com este nome");
      else toast.error(error.message || "Erro ao salvar");
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("establishment_services").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Item removido");
    },
    onError: (error: { message?: string }) => {
      toast.error(error.message || "Erro ao remover");
    },
  });

  return {
    items,
    isLoading,
    refetch,
    upsert: upsert.mutateAsync,
    remove: remove.mutateAsync,
    isSaving: upsert.isPending,
    isRemoving: remove.isPending,
  };
}

export async function fetchCheckinGuestInfoForReservation(
  establishmentId: string | null | undefined,
  buildingId: string | null | undefined,
): Promise<CheckinGuestInfoServiceRow[]> {
  const rows: CheckinGuestInfoServiceRow[] = [];

  if (buildingId) {
    const { data } = await supabase
      .from("establishment_services")
      .select(
        "id, establishment_id, building_id, name, description, is_active, checkin_guest_info_type, checkin_guest_config, checkin_display_order",
      )
      .eq("building_id", buildingId)
      .is("establishment_id", null)
      .eq("is_active", true)
      .not("checkin_guest_info_type", "is", null)
      .order("checkin_display_order", { ascending: true });
    if (data?.length) rows.push(...(data as CheckinGuestInfoServiceRow[]));
  }

  if (establishmentId) {
    const { data } = await supabase
      .from("establishment_services")
      .select(
        "id, establishment_id, building_id, name, description, is_active, checkin_guest_info_type, checkin_guest_config, checkin_display_order",
      )
      .eq("establishment_id", establishmentId)
      .is("building_id", null)
      .eq("is_active", true)
      .not("checkin_guest_info_type", "is", null)
      .order("checkin_display_order", { ascending: true });
    if (data?.length) rows.push(...(data as CheckinGuestInfoServiceRow[]));
  }

  return rows.sort((a, b) => a.checkin_display_order - b.checkin_display_order);
}