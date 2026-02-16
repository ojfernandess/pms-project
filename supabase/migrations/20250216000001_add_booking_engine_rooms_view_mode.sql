-- Adicionar modo de visualização da página de reservas no motor de reservas
-- by_category: grid 2x2 (2 em cima, 2 abaixo) - cada card mostra uma categoria com accordion de planos
-- by_plan: grid de 2 colunas - cada card mostra um plano tarifário da categoria
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_rooms_view_mode TEXT DEFAULT 'by_category'
  CHECK (booking_engine_rooms_view_mode IN ('by_category', 'by_plan'));

COMMENT ON COLUMN public.companies.booking_engine_rooms_view_mode IS 
  'Modo de visualização dos quartos no motor de reservas: by_category (grid 2x2 por categoria) ou by_plan (grid 2 colunas, cada card = 1 plano tarifário)';
