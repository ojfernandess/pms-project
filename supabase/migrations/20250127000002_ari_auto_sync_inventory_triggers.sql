-- =====================================================
-- TRIGGERS PARA SINCRONIZAÇÃO AUTOMÁTICA DE INVENTÁRIO
-- =====================================================
-- Atualiza inventário automaticamente quando reservas são criadas/atualizadas/deletadas

-- Função para atualizar inventário quando reserva muda
CREATE OR REPLACE FUNCTION public.auto_sync_inventory_on_reservation_change()
RETURNS TRIGGER AS $$
DECLARE
  v_old_date DATE;
  v_new_date DATE;
  v_date DATE;
BEGIN
  -- Se é INSERT ou UPDATE, processar novas datas (apenas se não cancelada)
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Verificar se a reserva não está cancelada
    IF (TG_OP = 'INSERT' AND NEW.status != 'cancelled') OR
       (TG_OP = 'UPDATE' AND NEW.status != 'cancelled') THEN
      -- Processar todas as datas da reserva (checkin até checkout-1)
      FOR v_date IN
        SELECT generate_series(
          NEW.checkin_date::date,
          (NEW.checkout_date::date - INTERVAL '1 day')::date,
          INTERVAL '1 day'
        )::date
      LOOP
        -- Sincronizar inventário para esta data
        PERFORM public.sync_rate_inventory_from_reservations(
          NEW.establishment_id,
          NEW.category_id,
          v_date
        );
      END LOOP;
    END IF;
  END IF;

  -- Se é UPDATE ou DELETE, processar datas antigas (se mudaram)
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    -- Se mudou categoria ou datas, atualizar datas antigas
    IF TG_OP = 'UPDATE' AND (
      OLD.category_id IS DISTINCT FROM NEW.category_id OR
      OLD.checkin_date IS DISTINCT FROM NEW.checkin_date OR
      OLD.checkout_date IS DISTINCT FROM NEW.checkout_date OR
      OLD.status IS DISTINCT FROM NEW.status
    ) THEN
      -- Processar todas as datas antigas (apenas se não estava cancelada)
      IF OLD.status != 'cancelled' THEN
        FOR v_date IN
          SELECT generate_series(
            OLD.checkin_date::date,
            (OLD.checkout_date::date - INTERVAL '1 day')::date,
            INTERVAL '1 day'
          )::date
        LOOP
          -- Sincronizar inventário para esta data (remover reserva antiga)
          PERFORM public.sync_rate_inventory_from_reservations(
            OLD.establishment_id,
            OLD.category_id,
            v_date
          );
        END LOOP;
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      -- Processar todas as datas da reserva deletada (apenas se não estava cancelada)
      IF OLD.status != 'cancelled' THEN
        FOR v_date IN
          SELECT generate_series(
            OLD.checkin_date::date,
            (OLD.checkout_date::date - INTERVAL '1 day')::date,
            INTERVAL '1 day'
          )::date
        LOOP
          -- Sincronizar inventário para esta data (remover reserva)
          PERFORM public.sync_rate_inventory_from_reservations(
            OLD.establishment_id,
            OLD.category_id,
            v_date
          );
        END LOOP;
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para reservas
DROP TRIGGER IF EXISTS trigger_auto_sync_inventory_on_reservation ON public.reservations;
CREATE TRIGGER trigger_auto_sync_inventory_on_reservation
  AFTER INSERT OR UPDATE OR DELETE ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_sync_inventory_on_reservation_change();

-- Função para atualizar inventário quando quarto muda de status
CREATE OR REPLACE FUNCTION public.auto_sync_inventory_on_room_change()
RETURNS TRIGGER AS $$
DECLARE
  v_date DATE;
  v_start_date DATE := CURRENT_DATE;
  v_end_date DATE := CURRENT_DATE + INTERVAL '90 days'; -- Sincronizar próximos 90 dias
BEGIN
  -- Se mudou status ou bloqueio, atualizar inventário para próximos dias
  IF TG_OP = 'UPDATE' AND (
    OLD.status IS DISTINCT FROM NEW.status OR
    OLD.is_blocked IS DISTINCT FROM NEW.is_blocked OR
    OLD.category_id IS DISTINCT FROM NEW.category_id
  ) THEN
    -- Se mudou categoria, atualizar ambas
    IF OLD.category_id IS DISTINCT FROM NEW.category_id THEN
      -- Atualizar categoria antiga
      FOR v_date IN
        SELECT generate_series(v_start_date, v_end_date, INTERVAL '1 day')::date
      LOOP
        PERFORM public.sync_rate_inventory_from_reservations(
          OLD.establishment_id,
          OLD.category_id,
          v_date
        );
      END LOOP;
    END IF;

    -- Atualizar categoria nova (ou mesma se não mudou)
    FOR v_date IN
      SELECT generate_series(v_start_date, v_end_date, INTERVAL '1 day')::date
    LOOP
      PERFORM public.sync_rate_inventory_from_reservations(
        NEW.establishment_id,
        NEW.category_id,
        v_date
      );
    END LOOP;
  ELSIF TG_OP = 'INSERT' THEN
    -- Nova categoria, sincronizar próximos dias
    FOR v_date IN
      SELECT generate_series(v_start_date, v_end_date, INTERVAL '1 day')::date
    LOOP
      PERFORM public.sync_rate_inventory_from_reservations(
        NEW.establishment_id,
        NEW.category_id,
        v_date
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para quartos
DROP TRIGGER IF EXISTS trigger_auto_sync_inventory_on_room ON public.rooms;
CREATE TRIGGER trigger_auto_sync_inventory_on_room
  AFTER INSERT OR UPDATE ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_sync_inventory_on_room_change();

-- Comentários
COMMENT ON FUNCTION public.auto_sync_inventory_on_reservation_change IS 'Atualiza inventário automaticamente quando reservas são criadas/atualizadas/deletadas';
COMMENT ON FUNCTION public.auto_sync_inventory_on_room_change IS 'Atualiza inventário automaticamente quando quartos mudam de status ou categoria';

