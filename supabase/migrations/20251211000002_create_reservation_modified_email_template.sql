-- Adicionar ou atualizar template de e-mail para alteração de reserva
-- Evento: reservation.modified
-- Este template será enviado quando houver alteração nas datas de check-in/check-out, mudança de quarto ou categoria

-- Primeiro, deletar template existente se houver (para garantir atualização)
DELETE FROM public.email_templates WHERE event_type = 'reservation.modified'::email_event_type;

INSERT INTO public.email_templates (
  name,
  event_type,
  subject,
  body_html,
  is_active,
  variables
)
SELECT 
  'Alteração de Reserva',
  'reservation.modified'::email_event_type,
  'Alteração na sua reserva - {{hotel_name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alteração de Reserva</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px; text-align: center; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 8px 8px 0 0;">
              {{#if hotel_logo}}
              <img src="{{hotel_logo}}" alt="Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;">
              {{else}}
              {{#if logo_url}}
              <img src="{{logo_url}}" alt="Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;">
              {{/if}}
              {{/if}}
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Alteração na Reserva</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Olá <strong>{{guest_name}}</strong>,
              </p>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                Informamos que sua reserva no <strong>{{hotel_name}}</strong> foi alterada. Confira os detalhes abaixo:
              </p>
              
              <!-- Resumo das Alterações -->
              <div style="background-color: #fff7ed; border-left: 4px solid #f59e0b; padding: 20px; margin: 0 0 25px 0; border-radius: 4px;">
                <h2 style="color: #f59e0b; margin: 0 0 15px 0; font-size: 18px;">📋 O que mudou:</h2>
                
                {{#if checkin_date_changed}}
                <div style="margin-bottom: 12px;">
                  <p style="color: #555555; font-size: 14px; margin: 0; line-height: 1.5;">
                    <strong style="color: #333;">📅 Datas:</strong>
                    {{#if old_checkin_date}}<span style="text-decoration: line-through; color: #999;">{{old_checkin_date}}</span> → {{/if}}{{#if checkin_date}}<strong style="color: #059669;">{{checkin_date}}</strong>{{/if}}
                    {{#if old_checkout_date}} / <span style="text-decoration: line-through; color: #999;">{{old_checkout_date}}</span> → {{/if}}{{#if checkout_date}}<strong style="color: #059669;">{{checkout_date}}</strong>{{/if}}
                  </p>
                </div>
                {{/if}}
                
                {{#if room_changed}}
                <div style="margin-bottom: 12px;">
                  <p style="color: #555555; font-size: 14px; margin: 0; line-height: 1.5;">
                    <strong style="color: #333;">🛏️ Quarto:</strong>
                    {{#if old_room_number}}<span style="text-decoration: line-through; color: #999;">{{old_room_number}}</span> → {{/if}}{{#if room_number}}<strong style="color: #2563eb;">{{room_number}}</strong>{{/if}}
                    {{#if room_name}} <span style="color: #666;">({{room_name}})</span>{{/if}}
                  </p>
                </div>
                {{/if}}
                
                {{#if category_changed}}
                <div style="margin-bottom: 12px;">
                  <p style="color: #555555; font-size: 14px; margin: 0; line-height: 1.5;">
                    <strong style="color: #333;">🏷️ Categoria:</strong>
                    {{#if old_category_name}}<span style="text-decoration: line-through; color: #999;">{{old_category_name}}</span> → {{/if}}{{#if category_name}}<strong style="color: #7c3aed;">{{category_name}}</strong>{{/if}}
                  </p>
                </div>
                {{/if}}
              </div>
              
              <!-- Informações Atualizadas da Reserva -->
              <div style="background-color: #f8f9fa; border: 1px solid #e5e7eb; padding: 20px; margin: 0 0 25px 0; border-radius: 8px;">
                <h2 style="color: #1f2937; margin: 0 0 15px 0; font-size: 16px; font-weight: 600;">📌 Resumo da Reserva</h2>
                <table style="width: 100%; border-collapse: collapse;">
                  {{#if reservation_code}}
                  <tr>
                    <td style="padding: 6px 0; color: #6b7280; font-size: 14px; width: 140px;"><strong>Código:</strong></td>
                    <td style="padding: 6px 0; color: #1f2937; font-size: 14px; font-weight: 600;">{{reservation_code}}</td>
                  </tr>
                  {{/if}}
                  {{#if checkin_date}}
                  <tr>
                    <td style="padding: 6px 0; color: #6b7280; font-size: 14px;"><strong>Check-in:</strong></td>
                    <td style="padding: 6px 0; color: #1f2937; font-size: 14px;">{{checkin_date}}{{#if checkin_time}} às {{checkin_time}}{{/if}}</td>
                  </tr>
                  {{/if}}
                  {{#if checkout_date}}
                  <tr>
                    <td style="padding: 6px 0; color: #6b7280; font-size: 14px;"><strong>Check-out:</strong></td>
                    <td style="padding: 6px 0; color: #1f2937; font-size: 14px;">{{checkout_date}}{{#if checkout_time}} às {{checkout_time}}{{/if}}</td>
                  </tr>
                  {{/if}}
                  {{#if room_number}}
                  <tr>
                    <td style="padding: 6px 0; color: #6b7280; font-size: 14px;"><strong>Quarto:</strong></td>
                    <td style="padding: 6px 0; color: #1f2937; font-size: 14px;">{{room_number}}{{#if room_name}} - {{room_name}}{{/if}}</td>
                  </tr>
                  {{/if}}
                  {{#if category_name}}
                  <tr>
                    <td style="padding: 6px 0; color: #6b7280; font-size: 14px;"><strong>Categoria:</strong></td>
                    <td style="padding: 6px 0; color: #1f2937; font-size: 14px;">{{category_name}}</td>
                  </tr>
                  {{/if}}
                  {{#if total_amount}}
                  <tr>
                    <td style="padding: 6px 0; color: #6b7280; font-size: 14px;"><strong>Valor Total:</strong></td>
                    <td style="padding: 6px 0; color: #1f2937; font-size: 14px; font-weight: 600;">R$ {{total_amount}}</td>
                  </tr>
                  {{/if}}
                </table>
              </div>
              
              {{#if web_checkin_link}}
              <div style="text-align: center; margin: 25px 0;">
                <a href="{{web_checkin_link}}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: 600; font-size: 15px;">
                  Ver Detalhes da Reserva
                </a>
              </div>
              {{/if}}
              
              <div style="background-color: #eff6ff; border-left: 3px solid #3b82f6; padding: 15px; margin: 25px 0; border-radius: 4px;">
                <p style="color: #1e40af; font-size: 14px; margin: 0; line-height: 1.6;">
                  <strong>💡 Precisa de ajuda?</strong> Se você não solicitou esta alteração ou tem alguma dúvida, entre em contato conosco.
                </p>
              </div>
              
              <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="color: #6b7280; font-size: 13px; margin: 8px 0;">
                  {{#if hotel_email}}<strong>E-mail:</strong> <a href="mailto:{{hotel_email}}" style="color: #3b82f6; text-decoration: none;">{{hotel_email}}</a>{{#if hotel_phone}} | {{/if}}{{/if}}
                  {{#if hotel_phone}}<strong>Telefone:</strong> <a href="tel:{{hotel_phone}}" style="color: #3b82f6; text-decoration: none;">{{hotel_phone}}</a>{{#if hotel_whatsapp}} | {{/if}}{{/if}}
                  {{#if hotel_whatsapp}}<strong>WhatsApp:</strong> <a href="https://wa.me/{{hotel_whatsapp}}" style="color: #3b82f6; text-decoration: none;">{{hotel_whatsapp}}</a>{{/if}}
                </p>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; text-align: center; background-color: #f8f9fa; border-radius: 0 0 8px 8px; border-top: 1px solid #e0e0e0;">
              <p style="color: #666666; font-size: 12px; margin: 0 0 10px 0;">
                <strong>{{hotel_name}}</strong>
              </p>
              {{#if hotel_address}}
              <p style="color: #666666; font-size: 12px; margin: 5px 0;">
                {{hotel_address}}
              </p>
              {{/if}}
              <p style="color: #999999; font-size: 11px; margin: 20px 0 0 0;">
                Este é um e-mail automático, por favor não responda.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  true,
  '["guest_name", "guest_email", "reservation_code", "identification_number", "checkin_date", "checkout_date", "checkin_time", "checkout_time", "old_checkin_date", "old_checkout_date", "room_number", "room_name", "old_room_number", "old_room_name", "category_name", "old_category_name", "checkin_date_changed", "room_changed", "category_changed", "total_amount", "hotel_name", "hotel_email", "hotel_phone", "hotel_whatsapp", "hotel_address", "hotel_website", "logo_url", "hotel_logo", "web_checkin_link"]'::jsonb;

COMMENT ON TABLE public.email_templates IS 'Templates de e-mail para diferentes eventos do sistema. O template reservation.modified é usado quando há alteração na reserva (datas, quarto ou categoria).';

