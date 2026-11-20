-- ARI: reservas efetivas e ocupação usam a categoria do quarto (não só reservations.category_id)
-- e incluem status pending, alinhado ao cálculo de indisponibilidade.

CREATE OR REPLACE FUNCTION public.calculate_category_availability(
  p_establishment_id UUID,
  p_category_id UUID,
  p_date DATE
) RETURNS JSONB AS $$
DECLARE
  v_total_rooms INTEGER;
  v_unavailable_rooms INTEGER;
  v_unassigned_reservations INTEGER;
  v_available_rooms INTEGER;
  v_occupancy_percentage DECIMAL(5,2);
  v_confirmed_reservations INTEGER;
  v_blocked_rooms INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_rooms
  FROM public.rooms
  WHERE establishment_id = p_establishment_id
    AND category_id = p_category_id
    AND is_blocked = false;

  WITH unavailable_room AS (
    SELECT DISTINCT res.room_id
    FROM public.reservations res
    WHERE res.establishment_id = p_establishment_id
      AND res.checkin_date <= p_date
      AND res.checkout_date > p_date
      AND res.status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
      AND res.room_id IS NOT NULL
      AND res.room_id IN (
        SELECT id FROM public.rooms
        WHERE establishment_id = p_establishment_id AND category_id = p_category_id
      )

    UNION

    SELECT mt.room_id
    FROM public.maintenance_tickets mt
    INNER JOIN public.rooms rm ON rm.id = mt.room_id
    WHERE mt.establishment_id = p_establishment_id
      AND rm.category_id = p_category_id
      AND mt.status IN ('open', 'in_progress')
      AND p_date >= COALESCE(mt.maintenance_start_date::date, mt.opened_at::date)
      AND (
        mt.maintenance_end_date IS NULL
        OR p_date <= mt.maintenance_end_date::date
      )
  )
  SELECT COUNT(DISTINCT room_id) INTO v_unavailable_rooms
  FROM unavailable_room;

  SELECT COUNT(*) INTO v_unassigned_reservations
  FROM public.reservations res
  WHERE res.establishment_id = p_establishment_id
    AND res.category_id = p_category_id
    AND res.checkin_date <= p_date
    AND res.checkout_date > p_date
    AND res.status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration')
    AND res.room_id IS NULL;

  v_available_rooms := GREATEST(0, v_total_rooms - v_unavailable_rooms - v_unassigned_reservations);

  SELECT COUNT(DISTINCT res.room_id) INTO v_confirmed_reservations
  FROM public.reservations res
  INNER JOIN public.rooms rm ON rm.id = res.room_id
  WHERE res.establishment_id = p_establishment_id
    AND rm.category_id = p_category_id
    AND res.checkin_date <= p_date
    AND res.checkout_date > p_date
    AND res.status IN ('pending', 'confirmed', 'checkedin', 'blocked', 'preregistration');

  v_blocked_rooms := GREATEST(0, v_unavailable_rooms - COALESCE(v_confirmed_reservations, 0));

  IF v_total_rooms > 0 THEN
    v_occupancy_percentage :=
      ((v_unavailable_rooms + v_unassigned_reservations)::DECIMAL / v_total_rooms::DECIMAL) * 100;
  ELSE
    v_occupancy_percentage := 0;
  END IF;

  RETURN jsonb_build_object(
    'total_rooms', v_total_rooms,
    'available_rooms', v_available_rooms,
    'confirmed_reservations', COALESCE(v_confirmed_reservations, 0) + v_unassigned_reservations,
    'blocked_rooms', v_blocked_rooms,
    'occupancy_percentage', ROUND(v_occupancy_percentage, 2)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.calculate_category_availability IS
  'Calcula disponibilidade: reservas/bloqueios por quarto da categoria, manutenção por período e interdição (is_blocked)';
