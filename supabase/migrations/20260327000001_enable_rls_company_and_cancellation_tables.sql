-- Habilita RLS em tabelas expostas ao PostgREST e alinha políticas ao uso atual:
-- - Motor de reservas / páginas públicas: leitura anon de linhas ativas (e leitura ampla onde já era necessário para precificação).
-- - Equipe autenticada: acesso por estabelecimento via user_can_access_establishment.

-- =============================================================================
-- company_booking_engine_establishments
-- =============================================================================
DROP POLICY IF EXISTS "Public can view company booking engine establishments" ON public.company_booking_engine_establishments;

ALTER TABLE public.company_booking_engine_establishments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_public_read_active_booking_engine_establishments"
  ON public.company_booking_engine_establishments
  FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "authenticated_manage_booking_engine_establishments"
  ON public.company_booking_engine_establishments
  FOR ALL
  TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id))
  WITH CHECK (public.user_can_access_establishment(auth.uid(), establishment_id));

-- =============================================================================
-- company_public_reservation_establishments
-- =============================================================================
ALTER TABLE public.company_public_reservation_establishments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_public_read_active_public_reservation_establishments"
  ON public.company_public_reservation_establishments
  FOR SELECT
  TO anon
  USING (is_active = true);

CREATE POLICY "authenticated_manage_public_reservation_establishments"
  ON public.company_public_reservation_establishments
  FOR ALL
  TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id))
  WITH CHECK (public.user_can_access_establishment(auth.uid(), establishment_id));

-- =============================================================================
-- cancellation_policies
-- =============================================================================
ALTER TABLE public.cancellation_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_authenticated_read_cancellation_policies"
  ON public.cancellation_policies
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "authenticated_insert_cancellation_policies"
  ON public.cancellation_policies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    establishment_id IS NOT NULL
    AND public.user_can_access_establishment(auth.uid(), establishment_id)
  );

CREATE POLICY "authenticated_update_cancellation_policies"
  ON public.cancellation_policies
  FOR UPDATE
  TO authenticated
  USING (
    establishment_id IS NOT NULL
    AND public.user_can_access_establishment(auth.uid(), establishment_id)
  )
  WITH CHECK (
    establishment_id IS NOT NULL
    AND public.user_can_access_establishment(auth.uid(), establishment_id)
  );

CREATE POLICY "authenticated_delete_cancellation_policies"
  ON public.cancellation_policies
  FOR DELETE
  TO authenticated
  USING (
    establishment_id IS NOT NULL
    AND public.user_can_access_establishment(auth.uid(), establishment_id)
  );

-- =============================================================================
-- pricing_plan_categories
-- =============================================================================
ALTER TABLE public.pricing_plan_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_authenticated_read_pricing_plan_categories"
  ON public.pricing_plan_categories
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "authenticated_insert_pricing_plan_categories"
  ON public.pricing_plan_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pricing_plans pp
      WHERE pp.id = pricing_plan_categories.pricing_plan_id
        AND public.user_can_access_establishment(auth.uid(), pp.establishment_id)
    )
  );

CREATE POLICY "authenticated_update_pricing_plan_categories"
  ON public.pricing_plan_categories
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pricing_plans pp
      WHERE pp.id = pricing_plan_categories.pricing_plan_id
        AND public.user_can_access_establishment(auth.uid(), pp.establishment_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pricing_plans pp
      WHERE pp.id = pricing_plan_categories.pricing_plan_id
        AND public.user_can_access_establishment(auth.uid(), pp.establishment_id)
    )
  );

CREATE POLICY "authenticated_delete_pricing_plan_categories"
  ON public.pricing_plan_categories
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pricing_plans pp
      WHERE pp.id = pricing_plan_categories.pricing_plan_id
        AND public.user_can_access_establishment(auth.uid(), pp.establishment_id)
    )
  );

-- =============================================================================
-- cancellation_logs
-- =============================================================================
ALTER TABLE public.cancellation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_cancellation_logs"
  ON public.cancellation_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = cancellation_logs.reservation_id
        AND public.user_can_access_establishment(auth.uid(), r.establishment_id)
    )
  );

CREATE POLICY "authenticated_insert_cancellation_logs"
  ON public.cancellation_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = cancellation_logs.reservation_id
        AND public.user_can_access_establishment(auth.uid(), r.establishment_id)
    )
  );

CREATE POLICY "authenticated_update_cancellation_logs"
  ON public.cancellation_logs
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = cancellation_logs.reservation_id
        AND public.user_can_access_establishment(auth.uid(), r.establishment_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = cancellation_logs.reservation_id
        AND public.user_can_access_establishment(auth.uid(), r.establishment_id)
    )
  );

CREATE POLICY "authenticated_delete_cancellation_logs"
  ON public.cancellation_logs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = cancellation_logs.reservation_id
        AND public.user_can_access_establishment(auth.uid(), r.establishment_id)
    )
  );

-- =============================================================================
-- cancellation_policy_acceptances
-- =============================================================================
ALTER TABLE public.cancellation_policy_acceptances ENABLE ROW LEVEL SECURITY;

-- Registro de aceite (motor de reservas sem login) e verificação por reserva
CREATE POLICY "anon_policy_acceptances_insert"
  ON public.cancellation_policy_acceptances
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "authenticated_policy_acceptances_insert"
  ON public.cancellation_policy_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "anon_policy_acceptances_select"
  ON public.cancellation_policy_acceptances
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "authenticated_policy_acceptances_select"
  ON public.cancellation_policy_acceptances
  FOR SELECT
  TO authenticated
  USING (
    reservation_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = cancellation_policy_acceptances.reservation_id
        AND public.user_can_access_establishment(auth.uid(), r.establishment_id)
    )
  );

CREATE POLICY "authenticated_policy_acceptances_update"
  ON public.cancellation_policy_acceptances
  FOR UPDATE
  TO authenticated
  USING (
    reservation_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = cancellation_policy_acceptances.reservation_id
        AND public.user_can_access_establishment(auth.uid(), r.establishment_id)
    )
  )
  WITH CHECK (
    reservation_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = cancellation_policy_acceptances.reservation_id
        AND public.user_can_access_establishment(auth.uid(), r.establishment_id)
    )
  );

CREATE POLICY "authenticated_policy_acceptances_delete"
  ON public.cancellation_policy_acceptances
  FOR DELETE
  TO authenticated
  USING (
    reservation_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.reservations r
      WHERE r.id = cancellation_policy_acceptances.reservation_id
        AND public.user_can_access_establishment(auth.uid(), r.establishment_id)
    )
  );

-- =============================================================================
-- no_show_schedule_config
-- =============================================================================
ALTER TABLE public.no_show_schedule_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_no_show_schedule_config"
  ON public.no_show_schedule_config
  FOR SELECT
  TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id));

CREATE POLICY "authenticated_insert_no_show_schedule_config"
  ON public.no_show_schedule_config
  FOR INSERT
  TO authenticated
  WITH CHECK (public.user_can_access_establishment(auth.uid(), establishment_id));

CREATE POLICY "authenticated_update_no_show_schedule_config"
  ON public.no_show_schedule_config
  FOR UPDATE
  TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id))
  WITH CHECK (public.user_can_access_establishment(auth.uid(), establishment_id));

CREATE POLICY "authenticated_delete_no_show_schedule_config"
  ON public.no_show_schedule_config
  FOR DELETE
  TO authenticated
  USING (public.user_can_access_establishment(auth.uid(), establishment_id));
