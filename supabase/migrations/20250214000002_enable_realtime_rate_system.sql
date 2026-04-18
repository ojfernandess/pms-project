-- Habilita Supabase Realtime para o Sistema Tarifário
-- Permite atualização em tempo real em:
-- - Dashboard de Preços
-- - Mapa de Tarifas
-- - Grade ARI
-- - Regras Dinâmicas e Restrições
--
-- O hook useRateSystemRealtime escuta alterações e invalida queries automaticamente.
-- Adiciona tabelas à publicação apenas se ainda não estiverem.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'rate_calendar'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rate_calendar;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'dynamic_pricing_rules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.dynamic_pricing_rules;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'rate_restrictions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rate_restrictions;
  END IF;
END $$;
