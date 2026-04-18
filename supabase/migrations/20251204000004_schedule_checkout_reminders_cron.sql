-- Migration: Configurar pg_cron para executar a Edge Function de lembretes de check-out diariamente
-- Esta migration cria uma função auxiliar e fornece instruções para configurar o cron job

-- Verificar se a extensão pg_cron está disponível (apenas verificação, não cria)
DO $$ 
BEGIN
  -- Verificar se pg_cron está disponível
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '✅ pg_cron está disponível';
  ELSE
    RAISE NOTICE '⚠️ pg_cron não está disponível. Use um serviço externo como cron-job.org';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Não foi possível verificar pg_cron. Use um serviço externo como cron-job.org';
END $$;

-- Remover job existente se houver (para evitar duplicatas)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'checkout-reminders-daily') THEN
    PERFORM cron.unschedule('checkout-reminders-daily');
    RAISE NOTICE '✅ Job existente removido';
  END IF;
EXCEPTION
  WHEN undefined_function THEN
    -- pg_cron não está disponível, ignorar
    NULL;
  WHEN OTHERS THEN
    RAISE NOTICE '⚠️ Não foi possível remover job existente';
END $$;

-- Criar função auxiliar que pode ser chamada manualmente
CREATE OR REPLACE FUNCTION public.send_checkout_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Esta função retorna instruções para usar a Edge Function
  -- A Edge Function deve ser chamada via HTTP externamente
  RETURN jsonb_build_object(
    'message', 'Use a Edge Function send-checkout-reminders para enviar lembretes',
    'edge_function_url', '/functions/v1/send-checkout-reminders',
    'method', 'POST',
    'parameters', jsonb_build_object(
      'days', 'Número de dias antes do check-out (padrão: 1)',
      'establishment_id', 'ID do estabelecimento (opcional)'
    ),
    'note', 'Esta função não executa o envio. Use a Edge Function via HTTP ou configure um cron job externo.'
  );
END;
$$;

COMMENT ON FUNCTION public.send_checkout_reminders() IS 
'Função auxiliar para enviar lembretes de check-out. Use a Edge Function send-checkout-reminders para execução real via HTTP.';

-- Instruções para configurar o cron job manualmente
-- Descomente e ajuste o código abaixo se pg_cron estiver disponível e você quiser configurar automaticamente
/*
-- IMPORTANTE: Substitua os valores abaixo antes de executar:
-- 1. YOUR_PROJECT_REF: Referência do seu projeto Supabase (ex: abcdefghijklmnop)
-- 2. YOUR_SERVICE_ROLE_KEY: Service Role Key do Supabase (encontre em Settings > API)

SELECT cron.schedule(
  'checkout-reminders-daily',
  '0 9 * * *', -- Executar diariamente às 09:00 UTC (ajuste conforme necessário)
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-checkout-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := jsonb_build_object('days', 1)
    ) AS request_id;
  $$
);
*/

-- Nota: Se net.http_post não estiver disponível, use um serviço externo como:
-- - cron-job.org (https://cron-job.org)
-- - EasyCron (https://www.easycron.com)
-- - GitHub Actions (se o projeto estiver no GitHub)
-- 
-- Veja o arquivo supabase/functions/send-checkout-reminders/DEPLOY.md para mais detalhes
