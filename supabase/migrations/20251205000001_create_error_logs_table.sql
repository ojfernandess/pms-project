-- Tabela para armazenar logs de erros estruturados
CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  context TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
  stack_trace TEXT,
  metadata JSONB,
  user_agent TEXT,
  url TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON public.error_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON public.error_logs(severity);
CREATE INDEX IF NOT EXISTS idx_error_logs_establishment ON public.error_logs(establishment_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_resolved ON public.error_logs(resolved) WHERE resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON public.error_logs(error_type);

-- RLS Policies
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

-- Usuários autenticados podem ver logs do seu estabelecimento
CREATE POLICY "Users can view error logs from their establishments"
  ON public.error_logs
  FOR SELECT
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

-- Apenas sistema pode inserir logs (via service role)
-- Para usuários autenticados, permitir inserção apenas para seu estabelecimento
CREATE POLICY "Users can insert error logs for their establishments"
  ON public.error_logs
  FOR INSERT
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR establishment_id IS NULL
  );

-- Super admins podem atualizar logs
CREATE POLICY "Super admins can update error logs"
  ON public.error_logs
  FOR UPDATE
  USING (public.is_super_admin(auth.uid()));

-- Comentários
COMMENT ON TABLE public.error_logs IS 'Armazena logs de erros estruturados para monitoramento e debugging';
COMMENT ON COLUMN public.error_logs.severity IS 'Severidade do erro: low, medium, high, critical';
COMMENT ON COLUMN public.error_logs.resolved IS 'Indica se o erro foi resolvido';
COMMENT ON COLUMN public.error_logs.metadata IS 'Metadados adicionais do erro (JSON)';

