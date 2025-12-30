-- Adicionar ou atualizar template de e-mail para solicitar avaliação após check-out
-- Evento: checkout.completed

-- Primeiro, deletar template existente se houver (para garantir atualização)
DELETE FROM public.email_templates WHERE event_type = 'checkout.completed'::email_event_type;

INSERT INTO public.email_templates (
  name,
  event_type,
  subject,
  body_html,
  is_active,
  variables
)
SELECT 
  'Solicitação de Avaliação da Estadia',
  'checkout.completed'::email_event_type,
  'Como foi sua estadia no {{hotel_name}}?',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Avaliação da Estadia</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
    <tr>
      <td style="padding: 20px 0;">
        <table role="presentation" style="width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
              {{#if logo_url}}
              <img src="{{logo_url}}" alt="Logo" style="max-width: 150px; height: auto; margin-bottom: 10px;">
              {{/if}}
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Como foi sua estadia?</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Olá <strong>{{guest_name}}</strong>,
              </p>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Esperamos que tenha tido uma excelente estadia no <strong>{{hotel_name}}</strong>!
              </p>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Sua opinião é muito importante para nós. Gostaríamos de saber como foi sua experiência conosco.
              </p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <h2 style="color: #667eea; margin: 0 0 15px 0; font-size: 18px;">Detalhes da Reserva</h2>
                {{#if identification_number}}
                <p style="color: #555555; font-size: 14px; margin: 5px 0;"><strong>Localizador:</strong> {{identification_number}}</p>
                {{/if}}
                {{#if reservation_code}}
                <p style="color: #555555; font-size: 14px; margin: 5px 0;"><strong>Identificador da Reserva:</strong> {{reservation_code}}</p>
                {{/if}}
                <p style="color: #555555; font-size: 14px; margin: 5px 0;"><strong>Check-in:</strong> {{checkin_date}}</p>
                <p style="color: #555555; font-size: 14px; margin: 5px 0;"><strong>Check-out:</strong> {{checkout_date}}</p>
                {{#if room_number}}
                <p style="color: #555555; font-size: 14px; margin: 5px 0;"><strong>Quarto:</strong> {{room_number}}</p>
                {{/if}}
              </div>
              
              <div style="background-color: #fff7ed; border-left: 4px solid #f59e0b; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <h2 style="color: #f59e0b; margin: 0 0 15px 0; font-size: 18px;">⭐ Avalie sua estadia</h2>
                <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0 0 15px 0;">
                  Sua avaliação nos ajuda a melhorar nossos serviços e proporcionar uma experiência ainda melhor para nossos hóspedes.
                </p>
                <div style="text-align: center; margin: 20px 0;">
                  <a href="{{review_link}}" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                    Avaliar Estadia
                  </a>
                </div>
                <p style="color: #666666; font-size: 12px; margin: 15px 0 0 0; text-align: center;">
                  Ou copie e cole este link no seu navegador:<br>
                  <span style="color: #667eea; word-break: break-all;">{{review_link}}</span>
                </p>
              </div>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 30px 0 20px 0;">
                Obrigado por escolher o <strong>{{hotel_name}}</strong>. Esperamos recebê-lo novamente em breve!
              </p>
              
              {{#if hotel_email}}
              <p style="color: #666666; font-size: 14px; margin: 10px 0;">
                <strong>E-mail:</strong> <a href="mailto:{{hotel_email}}" style="color: #667eea; text-decoration: none;">{{hotel_email}}</a>
              </p>
              {{/if}}
              {{#if hotel_phone}}
              <p style="color: #666666; font-size: 14px; margin: 10px 0;">
                <strong>Telefone:</strong> <a href="tel:{{hotel_phone}}" style="color: #667eea; text-decoration: none;">{{hotel_phone}}</a>
              </p>
              {{/if}}
              {{#if hotel_whatsapp}}
              <p style="color: #666666; font-size: 14px; margin: 10px 0;">
                <strong>WhatsApp:</strong> <a href="https://wa.me/{{hotel_whatsapp}}" style="color: #667eea; text-decoration: none;">{{hotel_whatsapp}}</a>
              </p>
              {{/if}}
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
  '["guest_name", "guest_email", "reservation_code", "identification_number", "checkin_date", "checkout_date", "room_number", "room_name", "category_name", "hotel_name", "hotel_email", "hotel_phone", "hotel_whatsapp", "hotel_address", "hotel_website", "logo_url", "review_link"]'::jsonb;

