-- ============================================================
-- Cron Jobs: send-daily-digest-schedule + send-checkout-reminders
-- ============================================================
-- Requisitos:
--   • pg_cron  (Supabase Dashboard → Database → Extensions → pg_cron)
--   • pg_net   (Supabase Dashboard → Database → Extensions → pg_net)
--
-- Como executar:
--   Supabase Dashboard → SQL Editor → cole e execute.
--   OU via CLI: supabase db push
--
-- ATENÇÃO: substitua YOUR_SERVICE_ROLE_KEY pela chave real antes de executar.
--   Encontre em: Project Settings → API → service_role (secret)
-- ============================================================

-- 1. Garantir que as extensões necessárias existem
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- 2. send-daily-digest-schedule
--    • Executa a cada hora, no minuto 0 (horário UTC).
--    • A função verifica internamente qual hora (BRT) coincide
--      com o horário configurado por cada estabelecimento em
--      Mensagens & Cobranças → Configuração → Resumo do dia.
-- ============================================================

-- Remove job anterior para evitar duplicatas
SELECT cron.unschedule('send-daily-digest-schedule')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-daily-digest-schedule'
);

SELECT cron.schedule(
  'send-daily-digest-schedule',
  '0 * * * *',   -- todo início de hora (UTC)
  $$
  SELECT net.http_post(
    url     := 'https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-daily-digest-schedule',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================
-- 3. send-checkout-reminders
--    • Executa uma vez por dia às 12:00 UTC (09:00 BRT).
--    • Envia lembretes de check-out para reservas do dia
--      seguinte (parâmetro days=1).
-- ============================================================

-- Remove job anterior para evitar duplicatas
SELECT cron.unschedule('send-checkout-reminders-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-checkout-reminders-daily'
);

SELECT cron.schedule(
  'send-checkout-reminders-daily',
  '0 12 * * *',  -- diariamente às 12:00 UTC = 09:00 BRT
  $$
  SELECT net.http_post(
    url     := 'https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
    ),
    body    := '{"days": 1}'::jsonb
  ) AS request_id;
  $$
);

-- ============================================================
-- 4. Verificação: confirma os jobs criados
-- ============================================================
SELECT
  jobid,
  jobname,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname IN (
  'send-daily-digest-schedule',
  'send-checkout-reminders-daily'
)
ORDER BY jobname;
