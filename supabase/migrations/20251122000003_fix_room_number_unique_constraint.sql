-- Corrigir constraint única de room_number para permitir mesmo número em categorias diferentes
-- A constraint atual impede que diferentes categorias tenham quartos com o mesmo número

-- Remover a constraint única atual de room_number
ALTER TABLE public.rooms
DROP CONSTRAINT IF EXISTS rooms_room_number_key;

-- Criar uma nova constraint única que combina room_number com category_id
-- Isso permite que diferentes categorias tenham quartos com o mesmo número
CREATE UNIQUE INDEX IF NOT EXISTS rooms_room_number_category_unique 
ON public.rooms(room_number, category_id) 
WHERE room_number IS NOT NULL AND category_id IS NOT NULL;

-- Comentário explicativo
COMMENT ON INDEX rooms_room_number_category_unique IS 'Garante que room_number seja único dentro de cada categoria, permitindo que diferentes categorias tenham quartos com o mesmo número';

