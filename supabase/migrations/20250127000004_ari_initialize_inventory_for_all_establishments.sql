-- =====================================================
-- INICIALIZAR INVENTÁRIO ARI PARA TODOS OS ESTABELECIMENTOS
-- =====================================================
-- Executa a inicialização do inventário para todos os estabelecimentos
-- Pode ser executado manualmente ou via função

-- Função para inicializar inventário de um estabelecimento específico
CREATE OR REPLACE FUNCTION public.initialize_ari_for_establishment(
  p_establishment_id UUID,
  p_days_ahead INTEGER DEFAULT 365
) RETURNS JSONB AS $$
DECLARE
  v_category RECORD;
  v_date DATE;
  v_start_date DATE := CURRENT_DATE;
  v_end_date DATE := CURRENT_DATE + (p_days_ahead || ' days')::INTERVAL;
  v_synced_count INTEGER := 0;
  v_total_categories INTEGER := 0;
BEGIN
  -- Para cada categoria do estabelecimento
  FOR v_category IN
    SELECT DISTINCT id
    FROM public.room_categories
    WHERE establishment_id = p_establishment_id
  LOOP
    v_total_categories := v_total_categories + 1;
    
    -- Para cada data no período
    FOR v_date IN
      SELECT generate_series(v_start_date, v_end_date, INTERVAL '1 day')::date
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
    'establishment_id', p_establishment_id,
    'categories_processed', v_total_categories,
    'synced_entries', v_synced_count,
    'start_date', v_start_date,
    'end_date', v_end_date,
    'days_ahead', p_days_ahead
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para migrar restrições stop_sell para status de venda
CREATE OR REPLACE FUNCTION public.migrate_stop_sell_to_sales_status(
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
      AND category_id IS NOT NULL
  LOOP
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
        COALESCE(v_restriction.notes, 'Migrado de rate_restrictions (stop_sell)')
      )
      ON CONFLICT (establishment_id, category_id, date)
      DO UPDATE SET
        status = 'closed',
        reason = COALESCE(v_restriction.notes, 'Migrado de rate_restrictions (stop_sell)'),
        updated_at = NOW();
      
      v_migrated_count := v_migrated_count + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'establishment_id', p_establishment_id,
    'migrated_entries', v_migrated_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários
COMMENT ON FUNCTION public.initialize_ari_for_establishment IS 'Inicializa inventário ARI para um estabelecimento específico para um período de dias';
COMMENT ON FUNCTION public.migrate_stop_sell_to_sales_status IS 'Migra restrições stop_sell para status de venda (fechado)';

-- NOTA: Para executar a migração para todos os estabelecimentos, use:
-- SELECT public.initialize_ari_for_establishment(id, 365) FROM public.establishments;
-- SELECT public.migrate_stop_sell_to_sales_status(id) FROM public.establishments;

