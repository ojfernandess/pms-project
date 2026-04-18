import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SlugEntityType = "company" | "establishment" | "room_category";

type SlugValidationOptions = {
  entityType: SlugEntityType;
  slug: string;
  excludeId?: string | null;
  establishmentId?: string | null; // para room_category: unicidade é por establishment
};

export function useSlugValidation({
  entityType,
  slug,
  excludeId,
  establishmentId,
}: SlugValidationOptions) {
  const normalizedSlug = slug?.trim().toLowerCase() || "";
  const enabled =
    normalizedSlug.length > 0 &&
    (entityType !== "room_category" || !!establishmentId);

  const { data: existing, isLoading } = useQuery({
    queryKey: ["slug_validation", entityType, normalizedSlug, excludeId, establishmentId],
    queryFn: async () => {
      if (entityType === "company") {
        const q = supabase
          .from("companies")
          .select("id")
          .eq("booking_engine_slug", normalizedSlug);
        if (excludeId) q.neq("id", excludeId);
        const { data } = await q.maybeSingle();
        return data;
      }
      if (entityType === "establishment") {
        const q = supabase
          .from("establishments")
          .select("id")
          .eq("slug", normalizedSlug);
        if (excludeId) q.neq("id", excludeId);
        const { data } = await q.maybeSingle();
        return data;
      }
      if (entityType === "room_category" && establishmentId) {
        const q = supabase
          .from("room_categories")
          .select("id")
          .eq("establishment_id", establishmentId)
          .eq("slug", normalizedSlug);
        if (excludeId) q.neq("id", excludeId);
        const { data } = await q.maybeSingle();
        return data;
      }
      return null;
    },
    enabled,
  });

  return {
    isUnique: enabled ? !existing : true,
    isLoading: enabled && isLoading,
    isDuplicate: !!existing,
  };
}
