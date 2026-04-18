-- Criar tabela de comentários para tickets de manutenção
CREATE TABLE IF NOT EXISTS public.maintenance_ticket_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL,
  comment TEXT NOT NULL,
  -- Pode ser criado por um usuário do sistema (opened_by, assigned_to) ou por um hóspede (guest_account_id)
  created_by_user_id UUID,
  created_by_guest_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT maintenance_ticket_comments_ticket_id_fkey 
    FOREIGN KEY (ticket_id) REFERENCES public.maintenance_tickets(id) ON DELETE CASCADE,
  CONSTRAINT maintenance_ticket_comments_created_by_user_id_fkey 
    FOREIGN KEY (created_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT maintenance_ticket_comments_created_by_guest_id_fkey 
    FOREIGN KEY (created_by_guest_id) REFERENCES public.guest_accounts(id) ON DELETE SET NULL
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_maintenance_ticket_comments_ticket_id ON public.maintenance_ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_ticket_comments_created_by_user_id ON public.maintenance_ticket_comments(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_ticket_comments_created_by_guest_id ON public.maintenance_ticket_comments(created_by_guest_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_ticket_comments_created_at ON public.maintenance_ticket_comments(created_at);

-- Criar trigger para atualizar updated_at
CREATE TRIGGER update_maintenance_ticket_comments_updated_at
  BEFORE UPDATE ON public.maintenance_ticket_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.maintenance_ticket_comments ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para maintenance_ticket_comments

-- Usuários autenticados podem ver todos os comentários de tickets do seu estabelecimento
DROP POLICY IF EXISTS "Authenticated users can view comments" ON public.maintenance_ticket_comments;
CREATE POLICY "Authenticated users can view comments"
  ON public.maintenance_ticket_comments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.maintenance_tickets mt
      WHERE mt.id = maintenance_ticket_comments.ticket_id
      AND (
        -- Usuário pertence ao mesmo estabelecimento do ticket (via employees)
        EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.user_id = auth.uid()
          AND e.establishment_id = mt.establishment_id
          AND e.is_active = true
        )
        OR
        -- Usuário é proprietário (via user_companies -> establishments)
        EXISTS (
          SELECT 1 FROM public.user_companies uc
          INNER JOIN public.establishments est ON est.company_id = uc.company_id
          WHERE uc.user_id = auth.uid()
          AND est.id = mt.establishment_id
        )
        OR
        -- Usuário criou o ticket ou está atribuído a ele
        mt.opened_by = auth.uid() OR mt.assigned_to = auth.uid()
      )
    )
  );

-- Usuários autenticados podem criar comentários em tickets do seu estabelecimento
DROP POLICY IF EXISTS "Authenticated users can create comments" ON public.maintenance_ticket_comments;
CREATE POLICY "Authenticated users can create comments"
  ON public.maintenance_ticket_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.maintenance_tickets mt
      WHERE mt.id = maintenance_ticket_comments.ticket_id
      AND (
        -- Usuário pertence ao mesmo estabelecimento do ticket (via employees)
        EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.user_id = auth.uid()
          AND e.establishment_id = mt.establishment_id
          AND e.is_active = true
        )
        OR
        -- Usuário é proprietário (via user_companies -> establishments)
        EXISTS (
          SELECT 1 FROM public.user_companies uc
          INNER JOIN public.establishments est ON est.company_id = uc.company_id
          WHERE uc.user_id = auth.uid()
          AND est.id = mt.establishment_id
        )
        OR
        -- Usuário criou o ticket ou está atribuído a ele
        mt.opened_by = auth.uid() OR mt.assigned_to = auth.uid()
      )
    )
    AND created_by_user_id = auth.uid()
  );

-- Usuários autenticados podem atualizar seus próprios comentários
DROP POLICY IF EXISTS "Authenticated users can update own comments" ON public.maintenance_ticket_comments;
CREATE POLICY "Authenticated users can update own comments"
  ON public.maintenance_ticket_comments FOR UPDATE
  TO authenticated
  USING (created_by_user_id = auth.uid())
  WITH CHECK (created_by_user_id = auth.uid());

-- Hóspedes podem ver comentários de seus próprios tickets
DROP POLICY IF EXISTS "Guests can view comments of their tickets" ON public.maintenance_ticket_comments;
CREATE POLICY "Guests can view comments of their tickets"
  ON public.maintenance_ticket_comments FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.maintenance_tickets mt
      WHERE mt.id = maintenance_ticket_comments.ticket_id
      AND mt.guest_account_id IS NOT NULL
      -- Verificar se o guest_account_id corresponde ao hóspede autenticado via localStorage
      -- Como não podemos acessar localStorage no SQL, vamos permitir acesso público
      -- e filtrar no frontend
    )
  );

-- Hóspedes podem criar comentários em seus próprios tickets
-- Nota: Como não temos autenticação Supabase para hóspedes, vamos usar uma política mais permissiva
-- e validar no frontend que o guest_account_id corresponde ao hóspede autenticado
DROP POLICY IF EXISTS "Guests can create comments on their tickets" ON public.maintenance_ticket_comments;
CREATE POLICY "Guests can create comments on their tickets"
  ON public.maintenance_ticket_comments FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.maintenance_tickets mt
      WHERE mt.id = maintenance_ticket_comments.ticket_id
      AND mt.guest_account_id IS NOT NULL
      -- Validação completa será feita no frontend
    )
    AND created_by_guest_id IS NOT NULL
  );

-- Hóspedes podem atualizar seus próprios comentários
DROP POLICY IF EXISTS "Guests can update own comments" ON public.maintenance_ticket_comments;
CREATE POLICY "Guests can update own comments"
  ON public.maintenance_ticket_comments FOR UPDATE
  TO public
  USING (created_by_guest_id IS NOT NULL)
  WITH CHECK (created_by_guest_id IS NOT NULL);

-- Comentário na tabela
COMMENT ON TABLE public.maintenance_ticket_comments IS 'Comentários em tickets de manutenção. Permite comunicação entre hóspedes e equipe de manutenção.';

