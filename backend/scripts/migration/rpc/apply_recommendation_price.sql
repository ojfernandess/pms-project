-- Melhorar função apply_recommendation_price para retornar mensagens de erro detalhadas
-- Primeiro, remover a função antiga (com retorno BOOLEAN)
DROP FUNCTION IF EXISTS apply_recommendation_price(UUID, UUID, UUID, DATE, NUMERIC);

-- Criar a nova função com retorno JSONB
CREATE FUNCTION apply_recommendation_price(
  p_establishment_id UUID,
  p_category_id UUID,
  p_pricing_plan_id UUID,
  p_date DATE,
  p_suggested_price NUMERIC
)
RETURNS JSONB AS $$
DECLARE
  v_existing_entry RECORD;
  v_error_message TEXT;
BEGIN
  -- Validar parâmetros
  IF p_establishment_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Estabelecimento não fornecido');
  END IF;

  IF p_category_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Categoria não fornecida');
  END IF;

  IF p_pricing_plan_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Plano tarifário não fornecido');
  END IF;

  IF p_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Data não fornecida');
  END IF;

  IF p_suggested_price IS NULL OR p_suggested_price < 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Preço sugerido inválido');
  END IF;

  -- Usar INSERT ... ON CONFLICT para fazer upsert (inserir ou atualizar atomicamente)
  -- Isso evita condições de corrida e é mais eficiente
  INSERT INTO rate_calendar (
    establishment_id,
    category_id,
    pricing_plan_id,
    date,
    base_price,
    created_at,
    updated_at
  ) VALUES (
    p_establishment_id,
    p_category_id,
    p_pricing_plan_id,
    p_date,
    p_suggested_price,
    NOW(),
    NOW()
  )
  ON CONFLICT ON CONSTRAINT unique_rate_calendar_entry
  DO UPDATE SET
    base_price = EXCLUDED.base_price,
    updated_at = NOW();

  -- Se chegou aqui, foi sucesso (inserção ou atualização)
  RETURN jsonb_build_object('success', true, 'action', 'applied');

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Já existe uma entrada para esta combinação de estabelecimento, categoria, plano e data');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referência inválida: estabelecimento, categoria ou plano tarifário não encontrado');
  WHEN check_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'Violação de constraint: verifique os valores fornecidos');
  WHEN OTHERS THEN
    v_error_message := SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', 'Erro ao aplicar preço sugerido: ' || v_error_message);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION apply_recommendation_price IS 
  'Aplica o preço sugerido de uma recomendação ao tarifário (rate_calendar) para a categoria, plano e data especificados. Retorna JSONB com success (boolean) e error (text) ou action (text).';

GRANT EXECUTE ON FUNCTION public.apply_recommendation_price(uuid, uuid, uuid, date, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_recommendation_price(uuid, uuid, uuid, date, numeric) TO service_role;

