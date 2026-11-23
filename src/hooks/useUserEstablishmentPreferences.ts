import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchUserEstablishmentPreferences,
  recordEstablishmentAccess,
  setEstablishmentFavorite,
  type UserEstablishmentPreference,
} from "@/lib/userEstablishmentPreferences";

export function useUserEstablishmentPreferences(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["user_establishment_preferences", userId];

  const query = useQuery({
    queryKey,
    queryFn: () => (userId ? fetchUserEstablishmentPreferences(userId) : Promise.resolve([])),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const favoriteIds = new Set(
    (query.data || []).filter((p) => p.is_favorite).map((p) => p.establishment_id),
  );

  const lastAccessed =
    (query.data || [])
      .filter((p) => p.last_accessed_at)
      .sort(
        (a, b) =>
          new Date(b.last_accessed_at!).getTime() - new Date(a.last_accessed_at!).getTime(),
      )[0] || null;

  const recordAccess = useMutation({
    mutationFn: ({ establishmentId }: { establishmentId: string }) => {
      if (!userId) return Promise.resolve();
      return recordEstablishmentAccess(userId, establishmentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: ({
      establishmentId,
      isFavorite,
    }: {
      establishmentId: string;
      isFavorite: boolean;
    }) => {
      if (!userId) throw new Error("Usuário não autenticado");
      return setEstablishmentFavorite(userId, establishmentId, isFavorite);
    },
    onMutate: async ({ establishmentId, isFavorite }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<UserEstablishmentPreference[]>(queryKey);
      queryClient.setQueryData<UserEstablishmentPreference[]>(queryKey, (old = []) => {
        const idx = old.findIndex((p) => p.establishment_id === establishmentId);
        if (idx >= 0) {
          const next = [...old];
          next[idx] = { ...next[idx], is_favorite: isFavorite };
          return next;
        }
        return [
          ...old,
          {
            id: `temp-${establishmentId}`,
            user_id: userId!,
            establishment_id: establishmentId,
            is_favorite: isFavorite,
            last_accessed_at: null,
          },
        ];
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    preferences: query.data || [],
    favoriteIds,
    lastAccessedEstablishmentId: lastAccessed?.establishment_id ?? null,
    lastAccessedAt: lastAccessed?.last_accessed_at ?? null,
    isLoading: query.isLoading,
    recordAccess: recordAccess.mutateAsync,
    toggleFavorite: toggleFavorite.mutateAsync,
    isTogglingFavorite: toggleFavorite.isPending,
  };
}