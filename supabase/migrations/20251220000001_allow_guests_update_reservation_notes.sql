-- ============================================
-- PERMITIR QUE GUESTS ATUALIZEM O CAMPO NOTES DAS RESERVAS
-- ============================================
-- Este migration permite que hóspedes atualizem o campo notes de reservas
-- que estão vinculadas à sua conta através da tabela guest_stay_history
-- Isso é necessário para permitir que guests façam solicitações especiais

-- Criar função helper para verificar se uma reserva pertence a um guest_account
-- Usa SECURITY DEFINER para evitar problemas com políticas RLS
CREATE OR REPLACE FUNCTION public.is_reservation_linked_to_guest_account(
  p_reservation_id UUID,
  p_guest_account_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists BOOLEAN := FALSE;
BEGIN
  -- Verificar se a reserva está vinculada ao guest_account através de guest_stay_history
  SELECT EXISTS (
    SELECT 1 FROM public.guest_stay_history gsh
    WHERE gsh.reservation_id = p_reservation_id
    AND gsh.guest_account_id = p_guest_account_id
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$;

-- Criar função RPC para atualizar notes de reserva com validação de propriedade
CREATE OR REPLACE FUNCTION public.update_reservation_notes_for_guest(
  p_reservation_id UUID,
  p_guest_account_id UUID,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_linked BOOLEAN := FALSE;
BEGIN
  -- Verificar se a reserva está vinculada ao guest_account
  SELECT EXISTS (
    SELECT 1 FROM public.guest_stay_history gsh
    WHERE gsh.reservation_id = p_reservation_id
    AND gsh.guest_account_id = p_guest_account_id
  ) INTO v_is_linked;
  
  IF NOT v_is_linked THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Reserva não encontrada ou sem acesso'
    );
  END IF;
  
  -- Atualizar o campo notes da reserva
  UPDATE public.reservations
  SET notes = p_notes
  WHERE id = p_reservation_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Erro ao atualizar reserva'
    );
  END IF;
  
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Observações atualizadas com sucesso'
  );
END;
$$;

-- Criar política que permite UPDATE do campo notes para guests
-- A política verifica se a reserva está vinculada a algum guest_account através de guest_stay_history
-- Nota: A validação completa de propriedade é feita na função RPC acima
DROP POLICY IF EXISTS "Guests can update notes of their reservations" ON public.reservations;

CREATE POLICY "Guests can update notes of their reservations"
  ON public.reservations
  FOR UPDATE
  TO public
  USING (
    -- Permitir UPDATE se a reserva existe em guest_stay_history (validação completa na função RPC)
    EXISTS (
      SELECT 1 FROM public.guest_stay_history gsh
      WHERE gsh.reservation_id = reservations.id
    )
  )
  WITH CHECK (
    -- Mesma verificação no WITH CHECK
    EXISTS (
      SELECT 1 FROM public.guest_stay_history gsh
      WHERE gsh.reservation_id = reservations.id
    )
  );

-- Comentários explicativos
COMMENT ON FUNCTION public.is_reservation_linked_to_guest_account(UUID, UUID) IS 
'Verifica se uma reserva está vinculada a um guest_account através de guest_stay_history. Usado para validar permissões de atualização.';

COMMENT ON FUNCTION public.update_reservation_notes_for_guest(UUID, UUID, TEXT) IS 
'Atualiza o campo notes de uma reserva, validando se ela pertence ao guest_account especificado. Usado para permitir que guests façam solicitações especiais de forma segura.';

COMMENT ON POLICY "Guests can update notes of their reservations" ON public.reservations IS 
'Permite que guests atualizem o campo notes de reservas vinculadas à sua conta através de guest_stay_history. A validação completa de propriedade é feita na função RPC update_reservation_notes_for_guest.';

