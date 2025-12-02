-- Migration: Criar template padrão para reset de senha do hóspede
-- Este template será enviado quando um hóspede solicitar recuperação de senha

INSERT INTO public.email_templates (name, event_type, subject, body_html, is_active, variables)
SELECT 
  'Recuperação de Senha - Hóspede',
  'guest.password_reset'::email_event_type,
  'Recuperação de Senha - {{hotel_name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 30px 20px; background-color: #ffffff; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; background-color: #f9fafb; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; padding: 14px 28px; background-color: #667eea; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .button:hover { background-color: #5568d3; }
    .info-box { background-color: #f0f4ff; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #667eea; }
    .warning-box { background-color: #fff7ed; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #f59e0b; }
    .divider { height: 1px; background-color: #e5e7eb; margin: 30px 0; }
    p { margin: 10px 0; }
    .highlight { color: #667eea; font-weight: bold; }
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
      <h1 style="margin: 0; font-size: 24px;">🔐 Recuperação de Senha</h1>
    </div>
    <div class="content">
      <p>Olá <strong>{{guest_name}}</strong>,</p>
      
      <p>Recebemos uma solicitação para redefinir a senha da sua conta no <strong>{{hotel_name}}</strong>.</p>
      
      <div class="info-box">
        <p style="margin: 0; color: #1e40af; font-size: 16px; font-weight: bold;">
          📧 Redefinir sua senha
        </p>
        <p style="margin: 10px 0 0 0; color: #1e40af;">
          Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong>1 hora</strong>.
        </p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="{{reset_url}}" class="button">Redefinir Minha Senha</a>
      </div>

      <p style="color: #6b7280; font-size: 14px;">
        Ou copie e cole o link abaixo no seu navegador:
      </p>
      <p style="color: #667eea; word-break: break-all; font-size: 12px; background-color: #f9fafb; padding: 10px; border-radius: 4px;">
        {{reset_url}}
      </p>

      <div class="warning-box">
        <p style="margin: 0; color: #92400e; font-size: 14px;">
          ⚠️ <strong>Importante:</strong>
        </p>
        <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #92400e;">
          <li>Este link expira em 1 hora por motivos de segurança</li>
          <li>Se você não solicitou esta recuperação, ignore este e-mail</li>
          <li>Sua senha atual permanecerá inalterada se você não usar este link</li>
        </ul>
      </div>

      <div class="divider"></div>

      <p style="color: #6b7280; font-size: 14px;">
        Se você não solicitou esta recuperação de senha, pode ignorar este e-mail com segurança. 
        Nenhuma alteração será feita na sua conta.
      </p>

      <p style="margin-top: 20px; color: #6b7280;">
        Se tiver alguma dúvida ou precisar de ajuda, entre em contato conosco:
      </p>
      
      {{#if hotel_email}}
      <p style="margin: 5px 0;">
        <strong>E-mail:</strong> <a href="mailto:{{hotel_email}}" style="color: #667eea; text-decoration: none;">{{hotel_email}}</a>
      </p>
      {{/if}}
      {{#if hotel_phone}}
      <p style="margin: 5px 0;">
        <strong>Telefone:</strong> <a href="tel:{{hotel_phone}}" style="color: #667eea; text-decoration: none;">{{hotel_phone}}</a>
      </p>
      {{/if}}
    </div>
    <div class="footer">
      <p style="margin: 0;"><strong>{{hotel_name}}</strong></p>
      {{#if hotel_address}}
      <p style="margin: 5px 0 0 0;">{{hotel_address}}</p>
      {{/if}}
      <p style="margin: 15px 0 0 0; font-size: 11px; color: #9ca3af;">
        Este é um e-mail automático. Por favor, não responda diretamente a este e-mail.
      </p>
    </div>
  </div>
</body>
</html>',
  true,
  '["guest_name", "guest_email", "reset_url", "hotel_name", "hotel_email", "hotel_phone", "hotel_address", "hotel_website", "hotel_logo", "logo_url"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates 
  WHERE event_type = 'guest.password_reset'::email_event_type
);

