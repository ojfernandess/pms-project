-- Smoke test após restore do pacote core (sem secrets).

SELECT 'auth.users' AS section, count(*)::text AS rows FROM auth.users
UNION ALL
SELECT 'admin_users', count(*)::text FROM public.admin_users
UNION ALL
SELECT 'user_companies', count(*)::text FROM public.user_companies
UNION ALL
SELECT 'companies', count(*)::text FROM public.companies
UNION ALL
SELECT 'establishments', count(*)::text FROM public.establishments
UNION ALL
SELECT 'hotel_settings', count(*)::text FROM public.hotel_settings
UNION ALL
SELECT 'site_settings', count(*)::text FROM public.site_settings;

SELECT au.user_id, au.is_super_admin, u.email
FROM public.admin_users au
JOIN auth.users u ON u.id = au.user_id
WHERE au.is_super_admin IS TRUE
LIMIT 20;
