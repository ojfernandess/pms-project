-- Função para atualizar senha de hóspede
CREATE OR REPLACE FUNCTION update_guest_password(
  p_account_id UUID,
  p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_password_hash TEXT;
BEGIN
  -- Verificar se conta existe
  IF NOT EXISTS (SELECT 1 FROM public.guest_accounts ga WHERE ga.id = p_account_id) THEN
    RAISE EXCEPTION 'Conta não encontrada';
  END IF;

  -- Hash da nova senha usando pgcrypto
  v_password_hash := crypt(p_new_password, gen_salt('bf', 10));

  -- Atualizar senha
  UPDATE public.guest_accounts ga
  SET
    password_hash = v_password_hash,
    updated_at = NOW()
  WHERE ga.id = p_account_id;

  RETURN TRUE;
END;
$$;


