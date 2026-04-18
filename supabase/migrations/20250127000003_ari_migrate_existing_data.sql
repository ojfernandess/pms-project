-- =====================================================
-- MIGRAÇÃO DE DADOS EXISTENTES PARA ESTRUTURA ARI
-- =====================================================
-- Migra dados do rate_calendar existente para nova estrutura ARI
-- Cria inventário inicial baseado em reservas e quartos existentes

-- Função para inicializar inventário para um período
CREATE OR REPLACE FUNCTION public.initialize_ari_inventory(
  p_establishment_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE,
  p_end_date DATE DEFAULT CURRENT_DATE + INTERVAL '365 days'
) RETURNS JSONB AS $$
DECLARE
  v_category RECORD;
  v_date DATE;
  v_synced_count INTEGER := 0;
BEGIN
  -- Para cada categoria do estabelecimento
  FOR v_category IN
    SELECT DISTINCT id
    FROM public.room_categories
    WHERE establishment_id = p_establishment_id
  LOOP
    -- Para cada data no período
    FOR v_date IN
      SELECT generate_series(p_start_date, p_end_date, INTERVAL '1 day')::date
    LOOP
      -- Sincronizar inventário
      PERFORM public.sync_rate_inventory_from_reservations(
        p_establishment_id,
        v_category.id,
        v_date
      );
      v_synced_count := v_synced_count + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'synced_entries', v_synced_count,
    'start_date', p_start_date,
    'end_date', p_end_date
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para migrar status de fechamento do rate_restrictions para rate_sales_status
CREATE OR REPLACE FUNCTION public.migrate_restrictions_to_sales_status(
  p_establishment_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_restriction RECORD;
  v_migrated_count INTEGER := 0;
  v_date DATE;
BEGIN
  -- Para cada restrição do tipo 'stop_sell'
  FOR v_restriction IN
    SELECT *
    FROM public.rate_restrictions
    WHERE establishment_id = p_establishment_id
      AND restriction_type = 'stop_sell'
      AND is_active = true
  LOOP
    -- Se tem categoria específica, aplicar apenas a ela
    IF v_restriction.category_id IS NOT NULL THEN
      -- Para cada data no período da restrição
      FOR v_date IN
        SELECT generate_series(
          v_restriction.start_date,
          v_restriction.end_date,
          INTERVAL '1 day'
        )::date
      LOOP
        -- Criar ou atualizar status de venda
        INSERT INTO public.rate_sales_status (
          establishment_id,
          category_id,
          date,
          status,
          reason
        ) VALUES (
          p_establishment_id,
          v_restriction.category_id,
          v_date,
          'closed',
          'Migrado de rate_restrictions (stop_sell)'
        )
        ON CONFLICT (establishment_id, category_id, date)
        DO UPDATE SET
          status = 'closed',
          reason = 'Migrado de rate_restrictions (stop_sell)',
          updated_at = NOW();
        
        v_migrated_count := v_migrated_count + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'migrated_entries', v_migrated_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários
COMMENT ON FUNCTION public.initialize_ari_inventory IS 'Inicializa inventário ARI para um período baseado em reservas e quartos existentes';
COMMENT ON FUNCTION public.migrate_restrictions_to_sales_status IS 'Migra restrições stop_sell para status de venda';

