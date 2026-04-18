-- ============================================
-- CORRIGIR POLÍTICA RLS DE INSERÇÃO PARA WEB_CHECKIN
-- ============================================
-- O problema: A política atual só permite inserção para usuários autenticados,
-- mas o web check-in pode ser criado quando o usuário insere o localizador,
-- antes de estar autenticado.

-- Criar função helper para validar se a reserva existe
-- Usa SECURITY DEFINER para evitar problemas com políticas RLS
CREATE OR REPLACE FUNCTION public.validate_reservation_exists(
  p_reservation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN := FALSE;
BEGIN
  -- Verificar se a reserva existe (bypassando RLS com SECURITY DEFINER)
  SELECT EXISTS (
    SELECT 1 FROM public.reservations r
    WHERE r.id = p_reservation_id
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$;

-- Remover política antiga de inserção
DROP POLICY IF EXISTS "web_checkin_insert" ON public.web_checkin;
DROP POLICY IF EXISTS "Web check-in is insertable by authenticated users" ON public.web_checkin;

-- Criar nova política que permite inserção para usuários autenticados E anônimos
-- Mas com validação: só permite criar se a reserva existir
CREATE POLICY "web_checkin_insert"
  ON public.web_checkin
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Validar que a reserva existe usando função helper
    public.validate_reservation_exists(reservation_id)
  );

-- Comentários explicativos
COMMENT ON FUNCTION public.validate_reservation_exists(UUID) IS 
'Valida se uma reserva existe, bypassando políticas RLS. Usado na política de inserção do web_checkin.';

COMMENT ON POLICY "web_checkin_insert" ON public.web_checkin IS 
'Permite inserção de web_checkin para usuários anônimos e autenticados, mas apenas se a reserva existir. Usa função helper para validar sem problemas de RLS.';

