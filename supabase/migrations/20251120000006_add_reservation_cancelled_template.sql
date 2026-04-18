-- Migration: Template padrão para cancelamento de reserva
-- Este template será enviado quando uma reserva for cancelada

-- Atualizar template existente ou criar novo se não existir
INSERT INTO public.email_templates (name, event_type, subject, body_html, is_active, variables)
SELECT 
  'Reserva Cancelada',
  'reservation.cancelled'::email_event_type,
  'Cancelamento de Reserva - {{reservation_code}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #DC2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background-color: #f9fafb; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .info-box { background-color: white; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #DC2626; }
    .warning-box { background-color: #FEF3C7; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #F59E0B; }
    .contact-box { background-color: #EFF6FF; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #3B82F6; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; }
    .label { font-weight: bold; width: 40%; }
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
      <h1 style="margin: 0;">❌ Reserva Cancelada</h1>
    </div>
    <div class="content">
      <p>Olá <strong>{{guest_name}}</strong>,</p>
      <p>Informamos que sua reserva foi cancelada conforme solicitado.</p>
      
      <div class="info-box">
        <h3 style="margin-top: 0; color: #DC2626;">Detalhes da Reserva Cancelada:</h3>
        <table>
          <tr>
            <td class="label">Localizador:</td>
            <td><strong>{{reservation_code}}</strong></td>
          </tr>
          <tr>
            <td class="label">Check-in:</td>
            <td>{{checkin_date}} às {{checkin_time}}</td>
          </tr>
          <tr>
            <td class="label">Check-out:</td>
            <td>{{checkout_date}} às {{checkout_time}}</td>
          </tr>
          {{#if room_number}}
          <tr>
            <td class="label">Quarto:</td>
            <td>{{room_number}}</td>
          </tr>
          {{/if}}
          {{#if category_name}}
          <tr>
            <td class="label">Categoria:</td>
            <td>{{category_name}}</td>
          </tr>
          {{/if}}
          <tr>
            <td class="label">Valor Total:</td>
            <td>R$ {{total_amount}}</td>
          </tr>
          {{#if paid_amount}}
          <tr>
            <td class="label">Valor Pago:</td>
            <td>R$ {{paid_amount}}</td>
          </tr>
          {{/if}}
        </table>
      </div>

      {{#if paid_amount}}
      <div class="warning-box">
        <p style="margin: 0; color: #92400E;">
          <strong>⚠️ Informação Importante sobre Reembolso:</strong>
        </p>
        <p style="margin: 10px 0 0 0; color: #92400E;">
          Detectamos que foi realizado um pagamento para esta reserva. Entre em contato conosco o quanto antes para processarmos o reembolso conforme nossa política de cancelamento.
        </p>
      </div>
      {{else}}
      <div class="warning-box">
        <p style="margin: 0; color: #92400E;">
          <strong>ℹ️ Informação:</strong> Esta reserva foi cancelada sem custos adicionais.
        </p>
      </div>
      {{/if}}

      <div class="contact-box">
        <p style="margin: 0; color: #1E40AF;">
          <strong>📞 Precisa de Ajuda?</strong>
        </p>
        <p style="margin: 10px 0 0 0; color: #1E40AF;">
          Se você tiver alguma dúvida sobre o cancelamento ou precisar de mais informações, nossa equipe está à disposição para ajudar.
        </p>
        {{#if hotel_email}}
        <p style="margin: 15px 0 5px 0;">
          <strong>E-mail:</strong> <a href="mailto:{{hotel_email}}" style="color: #3B82F6; text-decoration: none;">{{hotel_email}}</a>
        </p>
        {{/if}}
        {{#if hotel_phone}}
        <p style="margin: 5px 0;">
          <strong>Telefone:</strong> <a href="tel:{{hotel_phone}}" style="color: #3B82F6; text-decoration: none;">{{hotel_phone}}</a>
        </p>
        {{/if}}
        {{#if hotel_website}}
        <p style="margin: 5px 0;">
          <strong>Website:</strong> <a href="{{hotel_website}}" style="color: #3B82F6; text-decoration: none;">{{hotel_website}}</a>
        </p>
        {{/if}}
      </div>

      <p style="margin-top: 20px; color: #6B7280;">
        Esperamos poder recebê-lo em uma futura oportunidade!
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0;"><strong>{{hotel_name}}</strong></p>
      {{#if hotel_address}}
      <p style="margin: 5px 0 0 0;">{{hotel_address}}</p>
      {{/if}}
      <p style="margin: 15px 0 0 0; font-size: 11px; color: #9CA3AF;">
        Este é um e-mail automático. Por favor, não responda diretamente a este e-mail.
      </p>
    </div>
  </div>
</body>
</html>',
  true,
  '["guest_name", "reservation_code", "checkin_date", "checkout_date", "checkin_time", "checkout_time", "room_number", "category_name", "total_amount", "paid_amount", "hotel_name", "hotel_email", "hotel_phone", "hotel_address", "hotel_website", "hotel_logo", "logo_url"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates 
  WHERE event_type = 'reservation.cancelled'::email_event_type
);

-- Se o template já existir, atualizar apenas o conteúdo
UPDATE public.email_templates
SET 
  name = 'Reserva Cancelada',
  subject = 'Cancelamento de Reserva - {{reservation_code}}',
  body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #DC2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background-color: #f9fafb; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    .info-box { background-color: white; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #DC2626; }
    .warning-box { background-color: #FEF3C7; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #F59E0B; }
    .contact-box { background-color: #EFF6FF; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #3B82F6; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; }
    .label { font-weight: bold; width: 40%; }
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
      <h1 style="margin: 0;">❌ Reserva Cancelada</h1>
    </div>
    <div class="content">
      <p>Olá <strong>{{guest_name}}</strong>,</p>
      <p>Informamos que sua reserva foi cancelada conforme solicitado.</p>
      
      <div class="info-box">
        <h3 style="margin-top: 0; color: #DC2626;">Detalhes da Reserva Cancelada:</h3>
        <table>
          <tr>
            <td class="label">Localizador:</td>
            <td><strong>{{reservation_code}}</strong></td>
          </tr>
          <tr>
            <td class="label">Check-in:</td>
            <td>{{checkin_date}} às {{checkin_time}}</td>
          </tr>
          <tr>
            <td class="label">Check-out:</td>
            <td>{{checkout_date}} às {{checkout_time}}</td>
          </tr>
          {{#if room_number}}
          <tr>
            <td class="label">Quarto:</td>
            <td>{{room_number}}</td>
          </tr>
          {{/if}}
          {{#if category_name}}
          <tr>
            <td class="label">Categoria:</td>
            <td>{{category_name}}</td>
          </tr>
          {{/if}}
          <tr>
            <td class="label">Valor Total:</td>
            <td>R$ {{total_amount}}</td>
          </tr>
          {{#if paid_amount}}
          <tr>
            <td class="label">Valor Pago:</td>
            <td>R$ {{paid_amount}}</td>
          </tr>
          {{/if}}
        </table>
      </div>

      {{#if paid_amount}}
      <div class="warning-box">
        <p style="margin: 0; color: #92400E;">
          <strong>⚠️ Informação Importante sobre Reembolso:</strong>
        </p>
        <p style="margin: 10px 0 0 0; color: #92400E;">
          Detectamos que foi realizado um pagamento para esta reserva. Entre em contato conosco o quanto antes para processarmos o reembolso conforme nossa política de cancelamento.
        </p>
      </div>
      {{else}}
      <div class="warning-box">
        <p style="margin: 0; color: #92400E;">
          <strong>ℹ️ Informação:</strong> Esta reserva foi cancelada sem custos adicionais.
        </p>
      </div>
      {{/if}}

      <div class="contact-box">
        <p style="margin: 0; color: #1E40AF;">
          <strong>📞 Precisa de Ajuda?</strong>
        </p>
        <p style="margin: 10px 0 0 0; color: #1E40AF;">
          Se você tiver alguma dúvida sobre o cancelamento ou precisar de mais informações, nossa equipe está à disposição para ajudar.
        </p>
        {{#if hotel_email}}
        <p style="margin: 15px 0 5px 0;">
          <strong>E-mail:</strong> <a href="mailto:{{hotel_email}}" style="color: #3B82F6; text-decoration: none;">{{hotel_email}}</a>
        </p>
        {{/if}}
        {{#if hotel_phone}}
        <p style="margin: 5px 0;">
          <strong>Telefone:</strong> <a href="tel:{{hotel_phone}}" style="color: #3B82F6; text-decoration: none;">{{hotel_phone}}</a>
        </p>
        {{/if}}
        {{#if hotel_website}}
        <p style="margin: 5px 0;">
          <strong>Website:</strong> <a href="{{hotel_website}}" style="color: #3B82F6; text-decoration: none;">{{hotel_website}}</a>
        </p>
        {{/if}}
      </div>

      <p style="margin-top: 20px; color: #6B7280;">
        Esperamos poder recebê-lo em uma futura oportunidade!
      </p>
    </div>
    <div class="footer">
      <p style="margin: 0;"><strong>{{hotel_name}}</strong></p>
      {{#if hotel_address}}
      <p style="margin: 5px 0 0 0;">{{hotel_address}}</p>
      {{/if}}
      <p style="margin: 15px 0 0 0; font-size: 11px; color: #9CA3AF;">
        Este é um e-mail automático. Por favor, não responda diretamente a este e-mail.
      </p>
    </div>
  </div>
</body>
</html>',
  variables = '["guest_name", "reservation_code", "checkin_date", "checkout_date", "checkin_time", "checkout_time", "room_number", "category_name", "total_amount", "paid_amount", "hotel_name", "hotel_email", "hotel_phone", "hotel_address", "hotel_website", "hotel_logo", "logo_url"]'::jsonb,
  updated_at = NOW()
WHERE event_type = 'reservation.cancelled'::email_event_type
  AND EXISTS (
    SELECT 1 FROM public.email_templates 
    WHERE event_type = 'reservation.cancelled'::email_event_type
  );

