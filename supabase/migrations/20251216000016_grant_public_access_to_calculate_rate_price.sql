-- Conceder permissão de execução pública à função calculate_rate_price
-- Necessário para que a página pública de reservas possa calcular preços

-- ============================================
-- CONCEDER PERMISSÃO DE EXECUÇÃO PÚBLICA
-- ============================================

-- Conceder permissão de execução para usuários anônimos e autenticados
-- A função aceita p_pricing_plan_id como NULL
GRANT EXECUTE ON FUNCTION public.calculate_rate_price(UUID, UUID, UUID, DATE, INTEGER, INTEGER) TO anon, authenticated;

-- Comentário
COMMENT ON FUNCTION public.calculate_rate_price(UUID, UUID, UUID, DATE, INTEGER, INTEGER) IS 
'Calcula o preço de uma tarifa considerando regras de precificação dinâmica, ocupação e histórico. Acessível publicamente para páginas públicas de reservas.';

