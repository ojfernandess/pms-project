-- Configurar timezone do PostgreSQL para Brasil (America/Sao_Paulo)
-- Isso garante que NOW() e comparações de TIMESTAMPTZ usem o horário local do Brasil

-- Configurar timezone da sessão para America/Sao_Paulo
-- Isso afeta todas as funções que usam NOW() ou comparações de TIMESTAMPTZ
ALTER DATABASE postgres SET timezone TO 'America/Sao_Paulo';

-- Comentário explicativo
COMMENT ON DATABASE postgres IS 'Timezone configurado para America/Sao_Paulo (UTC-3) para garantir que comparações de data/hora usem o horário local do Brasil';

