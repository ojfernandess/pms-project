-- Migration: Corrigir template de Pagamento Confirmado para garantir que logos apareçam corretamente
-- O template deve ter a estrutura correta com {{#if logo_url}} e {{#if hotel_logo}}

UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pagamento Confirmado</title>
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
                ✅ Pagamento Confirmado!
              </h1>
              <p style="color:#d1d5db; margin-top:8px; font-size:14px;">
                Sua reserva está confirmada e garantida
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 15px 0;">Olá <strong>{{guest_name}}</strong>,</p>
              <p style="margin:0 0 30px 0;">Seu pagamento foi confirmado com sucesso e sua estadia está garantida!</p>
              <!-- Detalhes da Reserva -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #10b981; padding:22px; border-radius:0;">
                    <h2 style="color:#10b981; margin-top:0; margin-bottom:15px; font-size:18px;">Detalhes da Reserva</h2>
                    <p style="margin:8px 0;"><strong>Localizador:</strong> {{reservation_code}}</p>
                    {{#if identification_number}}
                    <p style="margin:8px 0;"><strong>Número de Identificação:</strong> {{identification_number}}</p>
                    {{/if}}
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}} às {{checkin_time}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}} às {{checkout_time}}</p>
                    {{#if hotel_address}}
                    <p style="margin:8px 0;"><strong>Endereço:</strong> {{hotel_address}}</p>
                    {{/if}}
                    {{#if room_number}}
                    <p style="margin:8px 0;"><strong>Quarto:</strong> {{room_number}}</p>
                    {{/if}}
                    {{#if category_name}}
                    <p style="margin:8px 0;"><strong>Categoria:</strong> {{category_name}}</p>
                    {{/if}}
                    <p style="margin:8px 0;"><strong>Valor Total:</strong> R$ {{total_amount}}</p>
                    <p style="margin:8px 0;"><strong>Status do Pagamento:</strong> <span style="background:#10b981; color:#fff; padding:4px 10px; border-radius:12px; font-size:12px; display:inline-block; margin-left:8px;">{{payment_status}}</span></p>
                  </td>
                </tr>
              </table>
              {{#if web_checkin_link}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="{{web_checkin_link}}" style="display:inline-block; padding:15px 30px; background-color:#4f46e5; color:#fff; text-decoration:none; border-radius:6px; font-weight:bold; font-size:16px;">
                      Realizar Check-in Online
                    </a>
                    <p style="margin-top:15px; font-size:14px; color:#666;">Clique no botão acima para realizar seu check-in online e agilizar sua chegada!</p>
                  </td>
                </tr>
              </table>
              {{/if}}
              {{#if policies_link}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#f8fafc; border-left:4px solid #6b7280; padding:22px; border-radius:0;">
                    <h3 style="color:#1f2937; margin-top:0; margin-bottom:12px; font-size:16px;">Políticas do Hotel</h3>
                    <p style="margin:0 0 15px 0; font-size:14px; color:#6b7280;">
                      Consulte as políticas completas do hotel clicando no botão abaixo ou copiando o link.
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:12px;">
                      <tr>
                        <td style="text-align:center;">
                          <a href="{{policies_link}}" style="display:inline-block; padding:12px 24px; background-color:#6b7280; color:#fff; text-decoration:none; border-radius:6px; font-weight:bold; font-size:14px;">
                            📄 Ver Políticas do Hotel
                          </a>
                        </td>
                      </tr>
                    </table>
                    <div style="background-color:#ffffff; border:1px solid #e5e7eb; border-radius:6px; padding:12px; margin-top:12px;">
                      <p style="margin:0 0 6px 0; font-size:12px; color:#6b7280; font-weight:600;">📋 Não consegue clicar? Copie o link abaixo:</p>
                      <p style="margin:0; font-size:12px; color:#374151; word-break:break-all; font-family:monospace; background-color:#f9fafb; padding:10px; border-radius:4px; border:1px solid #e5e7eb; user-select:all; -webkit-user-select:all; -moz-user-select:all; -ms-user-select:all;">{{policies_link}}</p>
                      <p style="margin:8px 0 0 0; font-size:11px; color:#9ca3af; text-align:center;">Selecione o texto acima e pressione Ctrl+C (ou Cmd+C no Mac) para copiar</p>
                    </div>
                  </td>
                </tr>
              </table>
              {{else}}
              {{#if hotel_policies}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#f8fafc; border-left:4px solid #6b7280; padding:22px; border-radius:0;">
                    <h3 style="color:#1f2937; margin-top:0; margin-bottom:12px; font-size:16px;">Políticas do Hotel</h3>
                    <p style="margin:0; font-size:14px; color:#374151; line-height:1.6;">{{{hotel_policies}}}</p>
                  </td>
                </tr>
              </table>
              {{/if}}
              {{/if}}
              <p style="margin:0;">Estamos ansiosos para recebê-lo!</p>
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
              {{#if hotel_contact}}
              <p style="font-size:12px; color:#999; margin:5px 0 0 0;">{{hotel_contact}}</p>
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
updated_at = NOW()
WHERE event_type = 'payment.confirmed'::email_event_type;

-- Comentário
COMMENT ON COLUMN public.email_templates.body_html IS 'Template HTML do e-mail. Suporta variáveis {{variable}} e condicionais {{#if variable}}...{{else}}...{{/if}}. Logos devem usar {{logo_url}} ou {{hotel_logo}}';

