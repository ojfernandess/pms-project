-- Tabela de logs de atividades do sistema
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL, -- 'reservation', 'room', 'client', 'room_category', etc.
  entity_id UUID, -- ID da entidade afetada (reservation_id, room_id, etc.)
  entity_code TEXT, -- Código legível da entidade (reservation_code, room_number, etc.)
  description TEXT NOT NULL,
  old_values JSONB, -- Valores anteriores (para comparação)
  new_values JSONB, -- Valores novos (para comparação)
  metadata JSONB, -- Informações adicionais (IP, user agent, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comentários
COMMENT ON TABLE public.activity_logs IS 'Registro de todas as atividades e alterações realizadas pelos usuários no sistema';
COMMENT ON COLUMN public.activity_logs.action_type IS 'Tipo de ação: created, updated, deleted, moved, swapped, blocked, unblocked, checked_in, checked_out, cancelled, payment_added, etc.';
COMMENT ON COLUMN public.activity_logs.entity_type IS 'Tipo de entidade afetada: reservation, room, client, room_category, etc.';
COMMENT ON COLUMN public.activity_logs.entity_id IS 'ID da entidade afetada';
COMMENT ON COLUMN public.activity_logs.entity_code IS 'Código legível da entidade (ex: reservation_code, room_number)';
COMMENT ON COLUMN public.activity_logs.description IS 'Descrição legível da ação realizada';
COMMENT ON COLUMN public.activity_logs.old_values IS 'Valores anteriores em formato JSON para comparação';
COMMENT ON COLUMN public.activity_logs.new_values IS 'Valores novos em formato JSON para comparação';
COMMENT ON COLUMN public.activity_logs.metadata IS 'Metadados adicionais (IP, user agent, etc.)';

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_establishment_id ON public.activity_logs(establishment_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type ON public.activity_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_id ON public.activity_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON public.activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity_type_id ON public.activity_logs(entity_type, entity_id);

-- Função para registrar logs automaticamente
-- Parâmetros obrigatórios primeiro, depois os opcionais com DEFAULT
CREATE OR REPLACE FUNCTION public.log_activity(
  p_establishment_id UUID,
  p_user_id UUID,
  p_action_type TEXT,
  p_entity_type TEXT,
  p_description TEXT,
  p_entity_id UUID DEFAULT NULL,
  p_entity_code TEXT DEFAULT NULL,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.activity_logs (
    establishment_id,
    user_id,
    action_type,
    entity_type,
    entity_id,
    entity_code,
    description,
    old_values,
    new_values,
    metadata
  ) VALUES (
    p_establishment_id,
    p_user_id,
    p_action_type,
    p_entity_type,
    p_entity_id,
    p_entity_code,
    p_description,
    p_old_values,
    p_new_values,
    p_metadata
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- Remover todas as policies existentes primeiro
DROP POLICY IF EXISTS "Super admin can view all activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Managers can view their establishment activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can view their establishment activity logs" ON public.activity_logs;

-- Policy única que permite acesso se:
-- 1. É super admin OU
-- 2. É funcionário do estabelecimento OU
-- 3. É dono da empresa que possui o estabelecimento
CREATE POLICY "Allow users to view activity logs"
  ON public.activity_logs
  FOR SELECT
  USING (
    -- Super admin pode ver tudo
    public.is_super_admin(auth.uid())
    OR
    (
      auth.uid() IS NOT NULL
      AND (
        -- Verifica se é funcionário do estabelecimento (qualquer role)
        EXISTS (
          SELECT 1 FROM public.employees emp
          WHERE emp.user_id = auth.uid()
          AND emp.establishment_id = activity_logs.establishment_id
          AND emp.is_active = true
        )
        OR
        -- Verifica se é dono da empresa que possui o estabelecimento
        EXISTS (
          SELECT 1 FROM public.establishments e
          INNER JOIN public.companies c ON c.id = e.company_id
          INNER JOIN public.user_companies uc ON uc.company_id = c.id
          WHERE e.id = activity_logs.establishment_id
          AND uc.user_id = auth.uid()
          AND uc.is_active = true
        )
      )
    )
  );

-- Apenas o sistema pode inserir logs (via função SECURITY DEFINER)
DROP POLICY IF EXISTS "System can insert activity logs" ON public.activity_logs;
CREATE POLICY "System can insert activity logs"
  ON public.activity_logs
  FOR INSERT
  WITH CHECK (false); -- Bloquear inserção direta, apenas via função

-- Super admin pode deletar logs antigos (manutenção)
DROP POLICY IF EXISTS "Super admin can delete activity logs" ON public.activity_logs;
CREATE POLICY "Super admin can delete activity logs"
  ON public.activity_logs
  FOR DELETE
  USING (public.is_super_admin(auth.uid()));

