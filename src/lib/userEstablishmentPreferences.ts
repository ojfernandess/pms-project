import { supabase } from "@/integrations/supabase/client";

export type UserEstablishmentPreference = {
  id: string;
  user_id: string;
  establishment_id: string;
  is_favorite: boolean;
  last_accessed_at: string | null;
};

export async function fetchUserEstablishmentPreferences(userId: string) {
  const { data, error } = await (supabase as any)
    .from("user_establishment_preferences")
    .select("*")
    .eq("user_id", userId);

  if (error) {
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return [] as UserEstablishmentPreference[];
    }
    throw error;
  }
  return (data || []) as UserEstablishmentPreference[];
}

export async function recordEstablishmentAccess(userId: string, establishmentId: string) {
  const now = new Date().toISOString();
  const { error } = await (supabase as any).from("user_establishment_preferences").upsert(
    {
      user_id: userId,
      establishment_id: establishmentId,
      last_accessed_at: now,
      updated_at: now,
    },
    { onConflict: "user_id,establishment_id" },
  );
  if (error) {
    console.warn("recordEstablishmentAccess:", error.message);
  }
}

export async function setEstablishmentFavorite(
  userId: string,
  establishmentId: string,
  isFavorite: boolean,
) {
  const now = new Date().toISOString();
  const { error } = await (supabase as any).from("user_establishment_preferences").upsert(
    {
      user_id: userId,
      establishment_id: establishmentId,
      is_favorite: isFavorite,
      updated_at: now,
    },
    { onConflict: "user_id,establishment_id" },
  );
  if (error) throw error;
}