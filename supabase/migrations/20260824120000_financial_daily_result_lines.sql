-- Linhas configuráveis do Relatório diário — Resultado do dia (módulo Financeiro operacional).
CREATE TABLE IF NOT EXISTS public.financial_daily_result_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  establishment_ids UUID[] NOT NULL DEFAULT '{}',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_unified BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_daily_result_lines_company
  ON public.financial_daily_result_lines(company_id);

COMMENT ON TABLE public.financial_daily_result_lines IS
  'Linhas do Resultado do dia: rótulo, estabelecimentos, ordem, linha unificada e ativo/inativo.';

ALTER TABLE public.financial_daily_result_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_daily_result_lines_select ON public.financial_daily_result_lines;
DROP POLICY IF EXISTS financial_daily_result_lines_write ON public.financial_daily_result_lines;

CREATE POLICY financial_daily_result_lines_select
  ON public.financial_daily_result_lines
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = financial_daily_result_lines.company_id
        AND uc.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.establishments est ON est.id = e.establishment_id
      WHERE est.company_id = financial_daily_result_lines.company_id
        AND e.user_id = auth.uid()
        AND e.is_active = true
    )
  );

CREATE POLICY financial_daily_result_lines_write
  ON public.financial_daily_result_lines
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = financial_daily_result_lines.company_id
        AND uc.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.establishments est ON est.id = e.establishment_id
      WHERE est.company_id = financial_daily_result_lines.company_id
        AND e.user_id = auth.uid()
        AND e.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_companies uc
      WHERE uc.company_id = financial_daily_result_lines.company_id
        AND uc.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.employees e
      JOIN public.establishments est ON est.id = e.establishment_id
      WHERE est.company_id = financial_daily_result_lines.company_id
        AND e.user_id = auth.uid()
        AND e.is_active = true
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_daily_result_lines TO authenticated;
