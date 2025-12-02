-- ============================================
-- SISTEMA DE E-MAILS - PMS
-- Criação das tabelas e tipos para sistema de e-mails
-- ============================================

-- Criar tipos ENUM
-- Remover tabelas e tipos existentes se houver (com cuidado)
DROP TABLE IF EXISTS public.email_logs CASCADE;
DROP TABLE IF EXISTS public.email_queue CASCADE;
DROP TABLE IF EXISTS public.email_templates CASCADE;
DROP TABLE IF EXISTS public.email_settings CASCADE;

DROP TYPE IF EXISTS email_event_type CASCADE;
DROP TYPE IF EXISTS email_status CASCADE;
DROP TYPE IF EXISTS email_provider CASCADE;

-- Criar tipos ENUM
CREATE TYPE email_event_type AS ENUM ('reservation.created', 'reservation.imported', 'reservation.cancelled', 'payment.confirmed', 'payment.pending', 'checkin.confirmed', 'checkout.completed');

CREATE TYPE email_status AS ENUM ('pending', 'queued', 'sending', 'sent', 'failed', 'cancelled');

CREATE TYPE email_provider AS ENUM ('smtp', 'sendgrid', 'mailgun', 'ses', 'resend');

-- Tabela de configurações de e-mail (global, apenas super admin)
CREATE TABLE public.email_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider email_provider NOT NULL DEFAULT 'smtp',
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_username TEXT,
  smtp_password TEXT,
  smtp_secure BOOLEAN DEFAULT true,
  api_key TEXT, -- Para SendGrid, Mailgun, SES, etc
  sender_name TEXT NOT NULL DEFAULT 'PMS System',
  sender_email TEXT NOT NULL,
  reply_to_email TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_email_settings CHECK (id IS NOT NULL) -- Garantir apenas uma configuração
);

-- Tabela de templates de e-mail
CREATE TABLE public.email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  event_type email_event_type NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT, -- Versão texto plano (opcional)
  is_active BOOLEAN DEFAULT true,
  variables JSONB DEFAULT '[]'::jsonb, -- Lista de variáveis disponíveis no template
  logo_url TEXT, -- URL do logo do hotel
  primary_color TEXT DEFAULT '#000000', -- Cor primária do template
  footer_text TEXT, -- Texto do rodapé
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Índice único para garantir apenas um template ativo por evento
-- Usando índice parcial para permitir múltiplos templates inativos
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_active_event 
ON public.email_templates(event_type) 
WHERE is_active = true;

-- Tabela de fila de e-mails
CREATE TABLE public.email_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  event_type email_event_type NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  variables JSONB DEFAULT '{}'::jsonb, -- Variáveis preenchidas para este e-mail
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE CASCADE,
  status email_status DEFAULT 'pending',
  priority INTEGER DEFAULT 0, -- 0 = normal, 1 = high, 2 = urgent
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  scheduled_at TIMESTAMPTZ DEFAULT NOW(), -- Quando deve ser enviado
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de logs de e-mails (histórico completo)
CREATE TABLE public.email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  queue_id UUID REFERENCES public.email_queue(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  event_type email_event_type NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  status email_status NOT NULL,
  reservation_id UUID REFERENCES public.reservations(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  error_message TEXT,
  provider_response JSONB, -- Resposta do provedor de e-mail
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ, -- Tracking de abertura (se disponível)
  clicked_at TIMESTAMPTZ, -- Tracking de cliques (se disponível)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_email_queue_status ON public.email_queue(status, scheduled_at);
CREATE INDEX idx_email_queue_reservation ON public.email_queue(reservation_id);
CREATE INDEX idx_email_logs_reservation ON public.email_logs(reservation_id);
CREATE INDEX idx_email_logs_recipient ON public.email_logs(recipient_email);
CREATE INDEX idx_email_logs_status ON public.email_logs(status);
CREATE INDEX idx_email_logs_created ON public.email_logs(created_at DESC);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_email_settings_updated_at BEFORE UPDATE ON public.email_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_queue_updated_at BEFORE UPDATE ON public.email_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Função para mover e-mail da fila para logs quando enviado
CREATE OR REPLACE FUNCTION move_email_to_logs()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status != 'sent' THEN
    INSERT INTO public.email_logs (
      queue_id,
      template_id,
      event_type,
      recipient_email,
      recipient_name,
      subject,
      body_html,
      body_text,
      status,
      reservation_id,
      sent_at,
      created_at
    )
    SELECT 
      NEW.id,
      NEW.template_id,
      NEW.event_type,
      NEW.recipient_email,
      NEW.recipient_name,
      NEW.subject,
      NEW.body_html,
      NEW.body_text,
      NEW.status,
      NEW.reservation_id,
      NEW.sent_at,
      NOW()
    FROM public.email_queue
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER email_queue_to_logs AFTER UPDATE ON public.email_queue
  FOR EACH ROW
  WHEN (NEW.status = 'sent' AND OLD.status != 'sent')
  EXECUTE FUNCTION move_email_to_logs();

-- Habilitar RLS
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS básicas (ajustar conforme necessário)
-- Super admin pode gerenciar tudo
-- Usuários podem ver logs de suas reservas

-- Verificar se a função is_super_admin existe, se não, criar
-- Usar CREATE OR REPLACE para garantir que a função existe
CREATE OR REPLACE FUNCTION public.is_super_admin(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    SELECT is_super_admin 
    FROM public.admin_users 
    WHERE user_id = user_uuid
    LIMIT 1
  ) = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Remover políticas existentes se houver
DROP POLICY IF EXISTS "Super admin can manage email settings" ON public.email_settings;
DROP POLICY IF EXISTS "Super admin can manage email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Authenticated users can view active email templates" ON public.email_templates;
DROP POLICY IF EXISTS "Super admin can manage email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Authenticated users can insert into email queue" ON public.email_queue;
DROP POLICY IF EXISTS "Super admin can view all email logs" ON public.email_logs;
DROP POLICY IF EXISTS "Users can view email logs for their reservations" ON public.email_logs;

-- Email Settings: super admin pode gerenciar tudo
CREATE POLICY "Super admin can manage email settings"
  ON public.email_settings
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Usuários autenticados podem ler configurações ativas (para verificar se envio está habilitado)
CREATE POLICY "Authenticated users can view active email settings"
  ON public.email_settings
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_active = true
  );

-- Email Templates: super admin pode gerenciar tudo
CREATE POLICY "Super admin can manage email templates"
  ON public.email_templates
  FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Usuários autenticados podem ver templates ativos
CREATE POLICY "Authenticated users can view active email templates"
  ON public.email_templates
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_active = true
  );

-- Email Queue: Permitir inserção por usuários autenticados
-- Esta política deve ser a primeira e mais permissiva para INSERT
CREATE POLICY "Authenticated users can insert into email queue"
  ON public.email_queue
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Email Queue: super admin pode ver tudo
CREATE POLICY "Super admin can view email queue"
  ON public.email_queue
  FOR SELECT
  USING (
    public.is_super_admin(auth.uid()) = true
  );

-- Email Queue: super admin pode atualizar
CREATE POLICY "Super admin can update email queue"
  ON public.email_queue
  FOR UPDATE
  USING (public.is_super_admin(auth.uid()) = true)
  WITH CHECK (public.is_super_admin(auth.uid()) = true);

-- Email Queue: super admin pode deletar
CREATE POLICY "Super admin can delete email queue"
  ON public.email_queue
  FOR DELETE
  USING (public.is_super_admin(auth.uid()) = true);

-- Email Queue: usuários podem ver e-mails relacionados às suas reservas
CREATE POLICY "Users can view emails for their reservations"
  ON public.email_queue
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND reservation_id IN (
      SELECT id FROM public.reservations
      WHERE created_by = auth.uid()
    )
  );

-- Email Logs: super admin pode ver tudo, usuários podem ver relacionados às suas reservas
CREATE POLICY "Super admin can view all email logs"
  ON public.email_logs
  FOR SELECT
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Users can view email logs for their reservations"
  ON public.email_logs
  FOR SELECT
  USING (
    reservation_id IN (
      SELECT id FROM public.reservations
      WHERE created_by = auth.uid()
    )
  );

-- Inserir configuração padrão de e-mail (pode ser editada depois)
INSERT INTO public.email_settings (id, sender_name, sender_email, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'PMS System',
  'noreply@pms.local',
  false -- Inativo até ser configurado
)
ON CONFLICT DO NOTHING;

-- Inserir templates padrão
INSERT INTO public.email_templates (name, event_type, subject, body_html, is_active, variables)
VALUES 
  (
    'Pagamento Pendente',
    'reservation.created',
    'Confirmação de Reserva - Pagamento Pendente',
    '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9fafb; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      {{#if hotel_logo}}
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="{{hotel_logo}}" alt="{{hotel_name}}" style="max-width: 200px; max-height: 80px; height: auto; display: inline-block;" />
      </div>
      {{/if}}
      <h1>Reserva Confirmada</h1>
    </div>
    <div class="content">
      <p>Olá {{guest_name}},</p>
      <p>Sua reserva foi recebida com sucesso!</p>
      <h3>Detalhes da Reserva:</h3>
      <ul>
        <li><strong>Código:</strong> {{reservation_code}}</li>
        <li><strong>Check-in:</strong> {{checkin_date}} às {{checkin_time}}</li>
        <li><strong>Check-out:</strong> {{checkout_date}} às {{checkout_time}}</li>
        <li><strong>Valor Total:</strong> R$ {{total_amount}}</li>
        <li><strong>Status do Pagamento:</strong> Pendente</li>
      </ul>
      <p>Por favor, realize o pagamento para confirmar sua estadia.</p>
    </div>
    <div class="footer">
      <p>{{hotel_name}}</p>
      <p>{{hotel_address}}</p>
      <p>{{hotel_contact}}</p>
    </div>
  </div>
</body>
</html>',
    true,
    '["guest_name", "reservation_code", "checkin_date", "checkout_date", "checkin_time", "checkout_time", "total_amount", "hotel_name", "hotel_address", "hotel_contact", "hotel_logo", "logo_url"]'::jsonb
  ),
  (
    'Check-in Confirmado',
    'payment.confirmed',
    'Check-in Confirmado - Instruções da sua Estadia',
    '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #10B981; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; background-color: #f9fafb; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .info-box { background-color: white; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #10B981; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      {{#if hotel_logo}}
      <div style="text-align: center; margin-bottom: 20px;">
        <img src="{{hotel_logo}}" alt="{{hotel_name}}" style="max-width: 200px; max-height: 80px; height: auto; display: inline-block;" />
      </div>
      {{/if}}
      <h1>Check-in Confirmado!</h1>
    </div>
    <div class="content">
      <p>Olá {{guest_name}},</p>
      <p>Seu pagamento foi confirmado e sua estadia está garantida!</p>
      <div class="info-box">
        <h3>Localizador: {{reservation_code}}</h3>
        <p><strong>Check-in:</strong> {{checkin_date}} às {{checkin_time}}</p>
        <p><strong>Check-out:</strong> {{checkout_date}} às {{checkout_time}}</p>
        <p><strong>Endereço:</strong> {{hotel_address}}</p>
        {{#if room_number}}
        <p><strong>Quarto:</strong> {{room_number}}</p>
        {{/if}}
      </div>
      {{#if web_checkin_link}}
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{web_checkin_link}}" style="display: inline-block; padding: 15px 30px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
          Realizar Check-in Online
        </a>
        <p style="margin-top: 15px; font-size: 14px; color: #666;">
          Clique no botão acima para realizar seu check-in online e agilizar sua chegada!
        </p>
      </div>
      {{/if}}
      <h3>Políticas do Hotel:</h3>
      <p>{{hotel_policies}}</p>
      <p>Estamos ansiosos para recebê-lo!</p>
    </div>
    <div class="footer">
      <p>{{hotel_name}}</p>
      <p>{{hotel_address}}</p>
      <p>{{hotel_contact}}</p>
    </div>
  </div>
</body>
</html>',
    true,
    '["guest_name", "reservation_code", "checkin_date", "checkout_date", "checkin_time", "checkout_time", "hotel_address", "room_number", "hotel_policies", "hotel_name", "hotel_contact", "hotel_logo", "logo_url", "web_checkin_link"]'::jsonb
  )
ON CONFLICT DO NOTHING;

