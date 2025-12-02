    -- ============================================
    -- SISTEMA DE NOTIFICAÇÕES - PMS
    -- Criação da tabela de notificações
    -- ============================================

    -- Remover tabela e dependências se existirem (para recriar)
    DROP TABLE IF EXISTS public.notifications CASCADE;

    -- Criar tipo ENUM para tipos de notificação (se não existir)
    DO $$ BEGIN
        CREATE TYPE notification_type AS ENUM (
        'new_reservation',
        'pending_payment',
        'pending_service_fee',
        'maintenance_ticket',
        'reservation_cancelled',
        'checkin_today',
        'checkout_today',
        'other'
        );
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;

    -- Criar tipo ENUM para prioridade (se não existir)
    DO $$ BEGIN
        CREATE TYPE notification_priority AS ENUM ('low', 'medium', 'high', 'urgent');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;

    -- Tabela de notificações
    CREATE TABLE public.notifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        type notification_type NOT NULL,
        priority notification_priority DEFAULT 'medium',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        read_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}'::jsonb, -- Dados adicionais (reservation_id, ticket_id, etc.)
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- Índices para melhor performance
        CREATE INDEX IF NOT EXISTS idx_notifications_establishment_id ON public.notifications(establishment_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
        CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
        CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications(is_read);
        CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read) WHERE is_read = false;

        -- RLS (Row Level Security)
        ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

        -- Política: Usuários podem ver apenas suas próprias notificações
        DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
        CREATE POLICY "Users can view their own notifications"
        ON public.notifications
        FOR SELECT
        USING (auth.uid() = user_id);

        -- Política: Sistema pode criar notificações (via service_role)
        DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
        CREATE POLICY "Service role can insert notifications"
        ON public.notifications
        FOR INSERT
        WITH CHECK (true);

        -- Política: Usuários podem atualizar suas próprias notificações (marcar como lida)
        DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
        CREATE POLICY "Users can update their own notifications"
        ON public.notifications
        FOR UPDATE
        USING (auth.uid() = user_id)
        WITH CHECK (auth.uid() = user_id);

        -- Política: Usuários podem deletar suas próprias notificações
        DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
        CREATE POLICY "Users can delete their own notifications"
        ON public.notifications
        FOR DELETE
        USING (auth.uid() = user_id);

    -- Função para criar notificação
    CREATE OR REPLACE FUNCTION public.create_notification(
    p_establishment_id UUID,
    p_user_id UUID,
    p_type notification_type,
    p_title TEXT,
    p_message TEXT,
    p_priority notification_priority DEFAULT 'medium',
    p_metadata JSONB DEFAULT '{}'::jsonb
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
        DECLARE
        v_notification_id UUID;
        BEGIN
        INSERT INTO public.notifications (
            establishment_id,
            user_id,
            type,
            priority,
            title,
            message,
            metadata
        ) VALUES (
            p_establishment_id,
            p_user_id,
            p_type,
            p_priority,
            p_title,
            p_message,
            p_metadata
        )
        RETURNING id INTO v_notification_id;
        
        RETURN v_notification_id;
        END;
        $$;

    -- Função para criar notificação para todos os usuários de um estabelecimento
    CREATE OR REPLACE FUNCTION public.create_notification_for_establishment(
    p_establishment_id UUID,
    p_type notification_type,
    p_title TEXT,
    p_message TEXT,
    p_priority notification_priority DEFAULT 'medium',
    p_metadata JSONB DEFAULT '{}'::jsonb
    )
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
        DECLARE
        v_user RECORD;
        v_user_ids UUID[] := ARRAY[]::UUID[];
        v_user_id UUID;
        BEGIN
        -- Buscar usuários através de user_companies (proprietários/administradores da empresa)
        -- Usar apenas user_companies e establishments, sem acessar auth.users diretamente
        FOR v_user IN
            SELECT DISTINCT uc.user_id as id
            FROM public.user_companies uc
            INNER JOIN public.establishments e ON e.company_id = uc.company_id
            WHERE e.id = p_establishment_id
            AND uc.is_active = true
            AND uc.user_id IS NOT NULL
        LOOP
            IF v_user.id IS NOT NULL THEN
                v_user_ids := array_append(v_user_ids, v_user.id);
            END IF;
        END LOOP;
        
        -- Buscar funcionários (employees) do estabelecimento
        FOR v_user IN
            SELECT DISTINCT e.user_id
            FROM public.employees e
            WHERE e.establishment_id = p_establishment_id
            AND e.is_active = true
            AND e.user_id IS NOT NULL
        LOOP
            -- Adicionar apenas se ainda não estiver na lista
            IF NOT (v_user.user_id = ANY(v_user_ids)) THEN
                v_user_ids := array_append(v_user_ids, v_user.user_id);
            END IF;
        END LOOP;
        
        -- Criar notificações para todos os usuários encontrados
        FOREACH v_user_id IN ARRAY v_user_ids
        LOOP
            INSERT INTO public.notifications (
                establishment_id,
                user_id,
                type,
                priority,
                title,
                message,
                metadata
            ) VALUES (
                p_establishment_id,
                v_user_id,
                p_type,
                p_priority,
                p_title,
                p_message,
                p_metadata
            );
        END LOOP;
        END;
        $$;

        -- Trigger para atualizar updated_at
        CREATE OR REPLACE FUNCTION public.update_notifications_updated_at()
        RETURNS TRIGGER
        LANGUAGE plpgsql
        AS $$
        BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
        END;
        $$;

    DROP TRIGGER IF EXISTS update_notifications_updated_at ON public.notifications;
    CREATE TRIGGER update_notifications_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.update_notifications_updated_at();

        -- Comentários
        COMMENT ON TABLE public.notifications IS 'Sistema de notificações do PMS';
        COMMENT ON COLUMN public.notifications.type IS 'Tipo de notificação';
        COMMENT ON COLUMN public.notifications.priority IS 'Prioridade da notificação';
        COMMENT ON COLUMN public.notifications.metadata IS 'Dados adicionais em formato JSON (reservation_id, ticket_id, etc.)';

