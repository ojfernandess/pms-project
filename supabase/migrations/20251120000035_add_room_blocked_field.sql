-- Adicionar campo para interditar quartos
-- Quando um quarto está interditado, não é possível criar reservas ou realizar ações

ALTER TABLE public.rooms
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.rooms.is_blocked IS 'Indica se o quarto está interditado. Quartos interditados não podem receber reservas e aparecem com ícone de cadeado no mapa.';

-- Criar índice para melhorar performance em consultas
CREATE INDEX IF NOT EXISTS idx_rooms_is_blocked ON public.rooms(is_blocked) WHERE is_blocked = true;

