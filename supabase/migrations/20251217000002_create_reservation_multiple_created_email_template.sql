-- Migration: Template padrão para envio de email de múltiplas reservas criadas
-- Este template será enviado quando múltiplas reservas forem criadas em uma única transação

-- Criar template se não existir
INSERT INTO public.email_templates (name, event_type, subject, body_html, is_active, variables)
SELECT 
  'Múltiplas Reservas Criadas',
  'reservation.multiple.created'::email_event_type,
  '{{reservation_count}} Reserva(s) Confirmada(s) - {{hotel_name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Múltiplas Reservas Confirmadas</title>
</head>
<body style="margin:0; padding:0; background-color:#f5f5f5; font-family: Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:30px 0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:0; overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:35px 30px; text-align:center; background-color:#1f2937;">
              {{#if logo_url}}
              <img src="{{logo_url}}" alt="Logo" style="max-width:150px; height:auto; margin-bottom:15px; display:block; margin-left:auto; margin-right:auto;">
              {{else}}
              {{#if hotel_logo}}
              <img src="{{hotel_logo}}" alt="Logo" style="max-width:150px; height:auto; margin-bottom:15px; display:block; margin-left:auto; margin-right:auto;">
              {{/if}}
              {{/if}}
              <h1 style="color:#ffffff; margin:0; font-size:26px; font-weight:bold;">
                ✅ {{reservation_count}} Reserva(s) Confirmada(s)
              </h1>
              <p style="color:#d1d5db; margin-top:8px; font-size:14px;">
                Suas reservas foram recebidas com sucesso!
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 15px 0;">Olá <strong>{{guest_name}}</strong>,</p>
              <p style="margin:0 0 30px 0;">Recebemos com sucesso {{reservation_count}} reserva(s) para sua estadia. Confira os detalhes abaixo:</p>
              
              <!-- Resumo Geral -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#eff6ff; border-left:4px solid #3b82f6; padding:22px; border-radius:0;">
                    <h2 style="color:#1e40af; margin-top:0; margin-bottom:15px; font-size:18px;">📋 Resumo Geral</h2>
                    <p style="margin:8px 0;"><strong>Total de Reservas:</strong> {{reservation_count}}</p>
                    <p style="margin:8px 0;"><strong>Códigos das Reservas:</strong> {{reservation_code}}</p>
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}}</p>
                    <p style="margin:8px 0;"><strong>Valor Total:</strong> <span style="color:#1e40af; font-weight:bold; font-size:18px;">{{total_amount}}</span></p>
                  </td>
                </tr>
              </table>

              <!-- Lista de Reservas -->
              <h2 style="color:#1f2937; margin-top:0; margin-bottom:20px; font-size:18px;">📝 Detalhes das Reservas</h2>
              
              {{#reservations_list}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:25px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #4f46e5; padding:22px; border-radius:0;">
                    <h3 style="color:#4f46e5; margin-top:0; margin-bottom:15px; font-size:16px;">Reserva {{number}}: {{code}}</h3>
                    <p style="margin:8px 0;"><strong>Localizador:</strong> {{locator}}</p>
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}}</p>
                    {{#if room_number}}
                    <p style="margin:8px 0;"><strong>Quarto:</strong> {{room_number}}</p>
                    {{/if}}
                    {{#if room_name}}
                    <p style="margin:8px 0;"><strong>Nome do Quarto:</strong> {{room_name}}</p>
                    {{/if}}
                    {{#if category_name}}
                    <p style="margin:8px 0;"><strong>Categoria:</strong> {{category_name}}</p>
                    {{/if}}
                    <p style="margin:8px 0;"><strong>Valor Total:</strong> <span style="color:#1f2937; font-weight:bold;">{{total_amount}}</span></p>
                    {{#if paid_amount}}
                    <p style="margin:8px 0;"><strong>Valor Pago:</strong> <span style="color:#059669; font-weight:bold;">{{paid_amount}}</span></p>
                    {{/if}}
                    {{#if web_checkin_link}}
                    <p style="margin:15px 0 0 0;">
                      <a href="{{web_checkin_link}}" style="display:inline-block; background:#4f46e5; color:#fff; padding:10px 20px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:14px;">
                        🚪 Realizar Check-in Online
                      </a>
                    </p>
                    {{/if}}
                  </td>
                </tr>
              </table>
              {{/reservations_list}}

              <!-- Informações Importantes -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fef3c7; border-left:4px solid #f59e0b; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#92400e; font-size:14px;"><strong>💡 Informações Importantes:</strong></p>
                    <ul style="margin:10px 0 0 0; padding-left:20px; color:#92400e; font-size:14px;">
                      <li>Guarde os códigos das reservas ({{reservation_code}}) para referência</li>
                      <li>Você pode realizar o check-in online através dos links acima</li>
                      <li>Em caso de dúvidas, entre em contato conosco através dos canais disponíveis</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Contato -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color:#eff6ff; border-left:4px solid #3b82f6; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#1e40af; font-size:14px;"><strong>📞 Precisa de Ajuda?</strong></p>
                    <p style="margin:10px 0 0 0; color:#1e40af; font-size:14px;">Nossa equipe está à disposição para ajudar. Entre em contato através dos canais disponíveis no rodapé deste e-mail.</p>
                    {{#if hotel_website}}
                    <p style="margin:15px 0 0 0; color:#1e40af; font-size:14px;"><strong>Website:</strong> <a href="{{hotel_website}}" style="color:#3b82f6; text-decoration:none;">{{hotel_website}}</a></p>
                    {{/if}}
                  </td>
                </tr>
              </table>
              
              <p style="margin-top:20px; color:#6b7280;">Esperamos recebê-lo em breve!</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:25px; text-align:center; background-color:#fafafa; border-top:1px solid #e8e8e8;">
              <p style="font-size:13px; color:#555; margin:0;"><strong>{{hotel_name}}</strong></p>
              {{#if hotel_address}}
              <p style="font-size:12px; color:#999; margin:5px 0 0 0;">{{hotel_address}}</p>
              {{/if}}
              {{#if hotel_phone}}
              <p style="font-size:12px; color:#999; margin:5px 0 0 0;">📞 <a href="tel:{{hotel_phone}}" style="color:#667eea; text-decoration:none;">{{hotel_phone}}</a></p>
              {{/if}}
              {{#if hotel_whatsapp}}
              <p style="font-size:12px; color:#999; margin:5px 0 0 0;">💬 <a href="https://wa.me/{{hotel_whatsapp}}" style="color:#667eea; text-decoration:none;">WhatsApp: {{hotel_whatsapp}}</a></p>
              {{/if}}
              {{#if hotel_email}}
              <p style="font-size:12px; color:#999; margin:5px 0 0 0;">✉️ <a href="mailto:{{hotel_email}}" style="color:#667eea; text-decoration:none;">{{hotel_email}}</a></p>
              {{/if}}
              <p style="font-size:12px; color:#999; margin:15px 0 0 0;">
                Este é um e-mail automático. Por favor, não responda diretamente a este e-mail.
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
  '["guest_name", "reservation_code", "reservation_count", "reservations_list", "#reservations_list", "/reservations_list", "checkin_date", "checkout_date", "total_amount", "hotel_name", "hotel_address", "hotel_phone", "hotel_email", "hotel_website", "hotel_logo", "logo_url", "number", "code", "locator", "room_number", "room_name", "category_name", "paid_amount", "web_checkin_link"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates 
  WHERE event_type = 'reservation.multiple.created'::email_event_type
);

-- Se o template já existir, atualizar apenas o conteúdo
UPDATE public.email_templates
SET 
  name = 'Múltiplas Reservas Criadas',
  subject = '{{reservation_count}} Reserva(s) Confirmada(s) - {{hotel_name}}',
  body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Múltiplas Reservas Confirmadas</title>
</head>
<body style="margin:0; padding:0; background-color:#f5f5f5; font-family: Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:30px 0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:0; overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:35px 30px; text-align:center; background-color:#1f2937;">
              {{#if logo_url}}
              <img src="{{logo_url}}" alt="Logo" style="max-width:150px; height:auto; margin-bottom:15px; display:block; margin-left:auto; margin-right:auto;">
              {{else}}
              {{#if hotel_logo}}
              <img src="{{hotel_logo}}" alt="Logo" style="max-width:150px; height:auto; margin-bottom:15px; display:block; margin-left:auto; margin-right:auto;">
              {{/if}}
              {{/if}}
              <h1 style="color:#ffffff; margin:0; font-size:26px; font-weight:bold;">
                ✅ {{reservation_count}} Reserva(s) Confirmada(s)
              </h1>
              <p style="color:#d1d5db; margin-top:8px; font-size:14px;">
                Suas reservas foram recebidas com sucesso!
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 15px 0;">Olá <strong>{{guest_name}}</strong>,</p>
              <p style="margin:0 0 30px 0;">Recebemos com sucesso {{reservation_count}} reserva(s) para sua estadia. Confira os detalhes abaixo:</p>
              
              <!-- Resumo Geral -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#eff6ff; border-left:4px solid #3b82f6; padding:22px; border-radius:0;">
                    <h2 style="color:#1e40af; margin-top:0; margin-bottom:15px; font-size:18px;">📋 Resumo Geral</h2>
                    <p style="margin:8px 0;"><strong>Total de Reservas:</strong> {{reservation_count}}</p>
                    <p style="margin:8px 0;"><strong>Códigos das Reservas:</strong> {{reservation_code}}</p>
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}}</p>
                    <p style="margin:8px 0;"><strong>Valor Total:</strong> <span style="color:#1e40af; font-weight:bold; font-size:18px;">{{total_amount}}</span></p>
                  </td>
                </tr>
              </table>

              <!-- Lista de Reservas -->
              <h2 style="color:#1f2937; margin-top:0; margin-bottom:20px; font-size:18px;">📝 Detalhes das Reservas</h2>
              
              {{#reservations_list}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:25px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #4f46e5; padding:22px; border-radius:0;">
                    <h3 style="color:#4f46e5; margin-top:0; margin-bottom:15px; font-size:16px;">Reserva {{number}}: {{code}}</h3>
                    <p style="margin:8px 0;"><strong>Localizador:</strong> {{locator}}</p>
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}}</p>
                    {{#if room_number}}
                    <p style="margin:8px 0;"><strong>Quarto:</strong> {{room_number}}</p>
                    {{/if}}
                    {{#if room_name}}
                    <p style="margin:8px 0;"><strong>Nome do Quarto:</strong> {{room_name}}</p>
                    {{/if}}
                    {{#if category_name}}
                    <p style="margin:8px 0;"><strong>Categoria:</strong> {{category_name}}</p>
                    {{/if}}
                    <p style="margin:8px 0;"><strong>Valor Total:</strong> <span style="color:#1f2937; font-weight:bold;">{{total_amount}}</span></p>
                    {{#if paid_amount}}
                    <p style="margin:8px 0;"><strong>Valor Pago:</strong> <span style="color:#059669; font-weight:bold;">{{paid_amount}}</span></p>
                    {{/if}}
                    {{#if web_checkin_link}}
                    <p style="margin:15px 0 0 0;">
                      <a href="{{web_checkin_link}}" style="display:inline-block; background:#4f46e5; color:#fff; padding:10px 20px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:14px;">
                        🚪 Realizar Check-in Online
                      </a>
                    </p>
                    {{/if}}
                  </td>
                </tr>
              </table>
              {{/reservations_list}}

              <!-- Informações Importantes -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fef3c7; border-left:4px solid #f59e0b; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#92400e; font-size:14px;"><strong>💡 Informações Importantes:</strong></p>
                    <ul style="margin:10px 0 0 0; padding-left:20px; color:#92400e; font-size:14px;">
                      <li>Guarde os códigos das reservas ({{reservation_code}}) para referência</li>
                      <li>Você pode realizar o check-in online através dos links acima</li>
                      <li>Em caso de dúvidas, entre em contato conosco através dos canais disponíveis</li>
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Contato -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color:#eff6ff; border-left:4px solid #3b82f6; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#1e40af; font-size:14px;"><strong>📞 Precisa de Ajuda?</strong></p>
                    <p style="margin:10px 0 0 0; color:#1e40af; font-size:14px;">Nossa equipe está à disposição para ajudar. Entre em contato através dos canais disponíveis no rodapé deste e-mail.</p>
                    {{#if hotel_website}}
                    <p style="margin:15px 0 0 0; color:#1e40af; font-size:14px;"><strong>Website:</strong> <a href="{{hotel_website}}" style="color:#3b82f6; text-decoration:none;">{{hotel_website}}</a></p>
                    {{/if}}
                  </td>
                </tr>
              </table>
              
              <p style="margin-top:20px; color:#6b7280;">Esperamos recebê-lo em breve!</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:25px; text-align:center; background-color:#fafafa; border-top:1px solid #e8e8e8;">
              <p style="font-size:13px; color:#555; margin:0;"><strong>{{hotel_name}}</strong></p>
              {{#if hotel_address}}
              <p style="font-size:12px; color:#999; margin:5px 0 0 0;">{{hotel_address}}</p>
              {{/if}}
              {{#if hotel_phone}}
              <p style="font-size:12px; color:#999; margin:5px 0 0 0;">📞 <a href="tel:{{hotel_phone}}" style="color:#667eea; text-decoration:none;">{{hotel_phone}}</a></p>
              {{/if}}
              {{#if hotel_whatsapp}}
              <p style="font-size:12px; color:#999; margin:5px 0 0 0;">💬 <a href="https://wa.me/{{hotel_whatsapp}}" style="color:#667eea; text-decoration:none;">WhatsApp: {{hotel_whatsapp}}</a></p>
              {{/if}}
              {{#if hotel_email}}
              <p style="font-size:12px; color:#999; margin:5px 0 0 0;">✉️ <a href="mailto:{{hotel_email}}" style="color:#667eea; text-decoration:none;">{{hotel_email}}</a></p>
              {{/if}}
              <p style="font-size:12px; color:#999; margin:15px 0 0 0;">
                Este é um e-mail automático. Por favor, não responda diretamente a este e-mail.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>',
  variables = '["guest_name", "reservation_code", "reservation_count", "reservations_list", "#reservations_list", "/reservations_list", "checkin_date", "checkout_date", "total_amount", "hotel_name", "hotel_address", "hotel_phone", "hotel_email", "hotel_website", "hotel_logo", "logo_url", "number", "code", "locator", "room_number", "room_name", "category_name", "paid_amount", "web_checkin_link"]'::jsonb
WHERE event_type = 'reservation.multiple.created'::email_event_type;

-- Comentário
COMMENT ON TABLE public.email_templates IS 'Templates de e-mail para diferentes eventos do sistema. O template reservation.multiple.created é usado para enviar email quando múltiplas reservas são criadas em uma única transação (ex: reservas públicas com múltiplas categorias).';

