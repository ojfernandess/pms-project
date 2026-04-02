-- Permite que a Edge Function aiosell-sync chame user_can_access_establishment com o JWT do utilizador.
GRANT EXECUTE ON FUNCTION public.user_can_access_establishment(UUID, UUID) TO authenticated;
