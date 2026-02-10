-- Adiciona coluna para badge de destaque das categorias no motor de reservas

ALTER TABLE public.room_categories
  ADD COLUMN IF NOT EXISTS highlight_badge TEXT;

COMMENT ON COLUMN public.room_categories.highlight_badge IS
  'Texto curto de destaque para exibição no card da categoria (ex.: \"Mais reservado\", \"Mais recomendado\")';


