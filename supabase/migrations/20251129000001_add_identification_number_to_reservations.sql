-- Adicionar campo identification_number à tabela reservations
-- Este número será único e sequencial para cada reserva

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS identification_number BIGSERIAL;

-- Criar índice único para garantir unicidade
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_identification_number 
  ON public.reservations(identification_number);

-- Comentário explicativo
COMMENT ON COLUMN public.reservations.identification_number IS 'Número de identificação único e sequencial da reserva. Gerado automaticamente.';

-- Função para gerar número de identificação sequencial único por estabelecimento
-- Se não houver establishment_id, gera um número global único
CREATE OR REPLACE FUNCTION public.generate_identification_number()
RETURNS BIGINT 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_number BIGINT;
  max_number BIGINT;
BEGIN
  -- Buscar o maior número existente
  SELECT COALESCE(MAX(identification_number), 0) INTO max_number
  FROM public.reservations;
  
  -- Gerar próximo número sequencial
  new_number := max_number + 1;
  
  RETURN new_number;
END;
$$;

-- Função para definir número de identificação automaticamente
CREATE OR REPLACE FUNCTION public.set_reservation_identification_number()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se identification_number não foi definido, gerar automaticamente
  IF NEW.identification_number IS NULL THEN
    NEW.identification_number := public.generate_identification_number();
  END IF;
  RETURN NEW;
END;
$$;

-- Criar trigger para definir número de identificação automaticamente
DROP TRIGGER IF EXISTS trigger_set_reservation_identification_number ON public.reservations;
CREATE TRIGGER trigger_set_reservation_identification_number
  BEFORE INSERT ON public.reservations
  FOR EACH ROW
  WHEN (NEW.identification_number IS NULL)
  EXECUTE FUNCTION public.set_reservation_identification_number();

-- Atualizar reservas existentes que não têm identification_number
-- Usar uma sequência para garantir números únicos
DO $$
DECLARE
  rec RECORD;
  current_number BIGINT := 0;
BEGIN
  -- Buscar o maior número existente
  SELECT COALESCE(MAX(identification_number), 0) INTO current_number
  FROM public.reservations;
  
  -- Atualizar reservas sem número de identificação
  FOR rec IN 
    SELECT id 
    FROM public.reservations 
    WHERE identification_number IS NULL 
    ORDER BY created_at ASC
  LOOP
    current_number := current_number + 1;
    UPDATE public.reservations
    SET identification_number = current_number
    WHERE id = rec.id;
  END LOOP;
END $$;

