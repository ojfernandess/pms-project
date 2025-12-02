-- Migration 2: Criar template padrão para solicitação de Nota Fiscal
-- Esta migration cria o template usando o valor do enum que foi adicionado na migration anterior

-- Criar template padrão para solicitação de Nota Fiscal
-- Usar WHERE NOT EXISTS para evitar duplicatas e não apagar outros templates
INSERT INTO public.email_templates (
  name,
  event_type,
  subject,
  body_html,
  body_text,
  is_active,
  variables
)
SELECT 
  'Solicitação de Nota Fiscal',
  'fiscal_document.request'::email_event_type,
  'Solicitação de Nota Fiscal - Reserva {{reservation_code}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solicitação de Nota Fiscal</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h2 style="color: #2563eb; margin-top: 0;">Solicitação de Nota Fiscal</h2>
    <p>Uma nova solicitação de Nota Fiscal foi recebida através do sistema.</p>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
    <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-top: 0;">Dados da Reserva</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; font-weight: bold; width: 40%;">Código da Reserva:</td>
        <td style="padding: 8px 0;">{{reservation_code}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: bold;">Hóspede (quem se hospedou):</td>
        <td style="padding: 8px 0;">{{actual_guest_name}}</td>
      </tr>
      {{#if room_number}}
      <tr>
        <td style="padding: 8px 0; font-weight: bold;">Quarto:</td>
        <td style="padding: 8px 0;">{{room_number}}</td>
      </tr>
      {{/if}}
      <tr>
        <td style="padding: 8px 0; font-weight: bold;">Check-in:</td>
        <td style="padding: 8px 0;">{{checkin_date}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: bold;">Check-out:</td>
        <td style="padding: 8px 0;">{{checkout_date}}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: bold;">Valor Pago:</td>
        <td style="padding: 8px 0; font-size: 18px; color: #059669; font-weight: bold;">{{paid_amount}}</td>
      </tr>
    </table>
  </div>

  <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
    <h3 style="color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-top: 0;">Dados para Emissão</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 8px 0; font-weight: bold; width: 40%;">Tipo:</td>
        <td style="padding: 8px 0;">{{request_type_label}}</td>
      </tr>
      {{#if company_name}}
      <tr>
        <td style="padding: 8px 0; font-weight: bold;">Razão Social:</td>
        <td style="padding: 8px 0;">{{company_name}}</td>
      </tr>
      {{/if}}
      {{#if cnpj}}
      <tr>
        <td style="padding: 8px 0; font-weight: bold;">CNPJ:</td>
        <td style="padding: 8px 0;">{{cnpj}}</td>
      </tr>
      {{/if}}
      {{#if financial_email}}
      <tr>
        <td style="padding: 8px 0; font-weight: bold;">E-mail do Responsável:</td>
        <td style="padding: 8px 0;">{{financial_email}}</td>
      </tr>
      {{/if}}
    </table>
  </div>

  <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-bottom: 20px; border-radius: 4px;">
    <p style="margin: 0; font-weight: bold; color: #92400e;">ID da Solicitação:</p>
    <p style="margin: 5px 0 0 0; font-family: monospace; color: #78350f;">{{request_id}}</p>
  </div>

  <div style="background-color: #eff6ff; border: 1px solid #3b82f6; border-radius: 8px; padding: 15px; margin-top: 20px;">
    <p style="margin: 0; color: #1e40af;">
      <strong>⚠️ Ação Necessária:</strong> Acesse o sistema para processar esta solicitação e emitir a Nota Fiscal.
    </p>
  </div>

  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
    <p>Este é um e-mail automático do sistema PMS. Por favor, não responda.</p>
  </div>
</body>
</html>',
  'SOLICITAÇÃO DE NOTA FISCAL

Uma nova solicitação de Nota Fiscal foi recebida através do sistema.

DADOS DA RESERVA:
- Código da Reserva: {{reservation_code}}
- Hóspede (quem se hospedou): {{actual_guest_name}}
{{#if room_number}}
- Quarto: {{room_number}}
{{/if}}
- Check-in: {{checkin_date}}
- Check-out: {{checkout_date}}
- Valor Pago: {{paid_amount}}

DADOS PARA EMISSÃO:
- Tipo: {{request_type_label}}
{{#if company_name}}
- Razão Social: {{company_name}}
{{/if}}
{{#if cnpj}}
- CNPJ: {{cnpj}}
{{/if}}
{{#if financial_email}}
- E-mail do Responsável: {{financial_email}}
{{/if}}

ID DA SOLICITAÇÃO:
{{request_id}}

AÇÃO NECESSÁRIA: Acesse o sistema para processar esta solicitação e emitir a Nota Fiscal.

---
Este é um e-mail automático do sistema PMS. Por favor, não responda.',
  true,
  '["reservation_code", "guest_name", "actual_guest_name", "room_number", "checkin_date", "checkout_date", "paid_amount", "request_type_label", "company_name", "cnpj", "financial_email", "request_id"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates 
  WHERE event_type = 'fiscal_document.request'::email_event_type
  AND is_active = true
);

