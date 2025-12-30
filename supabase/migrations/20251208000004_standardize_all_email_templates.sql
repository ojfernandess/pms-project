-- Migration: Padronizar TODOS os templates de email com design unificado
-- Design padrão: Header escuro (#1f2937), logo condicional, cards com borda lateral, layout email-safe

-- 1. Template: checkin.reception.notification (Notificação de Check-in para Portaria)
UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Novo Check-in Confirmado</title>
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
                🔔 Novo Check-in Confirmado
              </h1>
              <p style="color:#d1d5db; margin-top:8px; font-size:14px;">
                Notificação para Portaria
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <!-- Alerta -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fff7ea; border-left:4px solid #f59e0b; padding:20px; border-radius:0;">
                    <p style="color:#7c4a03; font-size:14px; margin:0;"><strong>⚠️ Atenção:</strong> Um hóspede completou o check-in online. Verifique as informações abaixo.</p>
                  </td>
                </tr>
              </table>
              <!-- Reserva -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #f97316; padding:22px; border-radius:0;">
                    <h2 style="color:#f97316; margin-top:0; margin-bottom:15px; font-size:18px;">Informações da Reserva</h2>
                    <p style="margin:8px 0;"><strong>Código da Reserva:</strong> {{reservation_code}}</p>
                    <p style="margin:8px 0;"><strong>Hotel:</strong> {{hotel_name}}</p>
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}}</p>
                    <p style="margin:8px 0;"><strong>Quarto:</strong> {{room_number}} - {{room_name}}</p>
                    {{#if room_category_name}}
                    <p style="margin:8px 0;"><strong>Categoria:</strong> {{room_category_name}}</p>
                    {{/if}}
                    <p style="margin:8px 0;">
                      <strong>Status:</strong>
                      <span style="background:#10b981; color:#fff; padding:4px 10px; border-radius:12px; font-size:12px; display:inline-block; margin-left:8px;">
                        Check-in Confirmado
                      </span>
                    </p>
                  </td>
                </tr>
              </table>
              <!-- Hóspede Principal -->
              {{#if main_guest}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#f8fafc; border-left:4px solid #3b82f6; padding:22px; border-radius:0;">
                    <h3 style="color:#1f2937; margin-top:0; margin-bottom:15px; font-size:16px;">👤 Hóspede Principal</h3>
                    <p style="margin:8px 0;"><strong>Nome:</strong> {{main_guest.name}}</p>
                    <p style="margin:8px 0;"><strong>Email:</strong> {{main_guest.email}}</p>
                    <p style="margin:8px 0;"><strong>Telefone:</strong> {{main_guest.phone}}</p>
                    {{#if main_guest.birth_date}}
                    <p style="margin:8px 0;"><strong>Data de Nascimento:</strong> {{main_guest.birth_date}}</p>
                    {{/if}}
                    {{#if main_guest.document_number}}
                    <p style="margin:8px 0;"><strong>CPF/Documento:</strong> {{main_guest.document_type}} - {{main_guest.document_number}}</p>
                    {{else}}
                    {{#if main_guest.cpf}}
                    <p style="margin:8px 0;"><strong>CPF:</strong> {{main_guest.cpf}}</p>
                    {{/if}}
                    {{/if}}
                  </td>
                </tr>
              </table>
              {{/if}}
              <!-- Selfie -->
              {{#if selfie_url}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="text-align:center;">
                    <h3 style="margin-bottom:15px; font-size:16px;">📸 Selfie do Hóspede</h3>
                    <img src="{{selfie_url}}" alt="Selfie" style="max-width:300px; border-radius:8px; border:3px solid #f97316;">
                  </td>
                </tr>
              </table>
              {{/if}}
              <!-- Documentos -->
              {{#if documents}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td>
                    <h3 style="margin-bottom:15px; font-size:16px;">📄 Documentos Enviados</h3>
                    {{#each documents}}
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
                      <tr>
                        <td style="background:#fafafa; border-left:4px solid #6b7280; padding:20px; border-radius:0;">
                          <p style="margin:8px 0;"><strong>{{this.guest_name}}</strong></p>
                          {{#if this.document_type}}
                          <p style="margin:8px 0;"><strong>Tipo:</strong> {{this.document_type}}</p>
                          {{/if}}
                          {{#if this.document_number}}
                          <p style="margin:8px 0;"><strong>Número:</strong> {{this.document_number}}</p>
                          {{/if}}
                          {{#if this.selfie_url}}
                          <img src="{{this.selfie_url}}" style="max-width:200px; border-radius:6px; margin-top:10px; display:block;">
                          {{/if}}
                          {{#if this.document_front_url}}
                          <img src="{{this.document_front_url}}" style="max-width:200px; border-radius:6px; margin-top:10px; display:block;">
                          {{/if}}
                          {{#if this.document_back_url}}
                          <img src="{{this.document_back_url}}" style="max-width:200px; border-radius:6px; margin-top:10px; display:block;">
                          {{/if}}
                        </td>
                      </tr>
                    </table>
                    {{/each}}
                  </td>
                </tr>
              </table>
              {{else}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="text-align:center; padding:20px;">
                    <p style="color:#999; margin:0;">Nenhum documento foi enviado.</p>
                  </td>
                </tr>
              </table>
              {{/if}}
              <!-- Hóspedes adicionais -->
              {{#if additional_guests}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background:#f8fafc; border-left:4px solid #8b5cf6; padding:22px; border-radius:0;">
                    <h3 style="margin-top:0; margin-bottom:15px; font-size:16px;">👥 Hóspedes Adicionais</h3>
                    {{#each additional_guests}}
                    <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid #e5e7eb;">
                      <p style="margin:4px 0;"><strong>Nome:</strong> {{this.name}}</p>
                      {{#if this.document_number}}
                      <p style="margin:4px 0;"><strong>CPF/Documento:</strong> {{this.document_type}} - {{this.document_number}}</p>
                      {{else}}
                      {{#if this.cpf}}
                      <p style="margin:4px 0;"><strong>CPF:</strong> {{this.cpf}}</p>
                      {{/if}}
                      {{/if}}
                    </div>
                    {{/each}}
                  </td>
                </tr>
              </table>
              {{/if}}
              <!-- Infos extras -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background:#fafafa; border-left:4px solid #6b7280; padding:22px; border-radius:0;">
                    <h3 style="margin-top:0; margin-bottom:15px; font-size:16px;">ℹ️ Informações Adicionais</h3>
                    <p style="margin:8px 0;"><strong>Adultos:</strong> {{adults}}</p>
                    <p style="margin:8px 0;"><strong>Crianças:</strong> {{children}}</p>
                    {{#if notes}}
                    <p style="margin:8px 0;"><strong>Observações:</strong> {{notes}}</p>
                    {{/if}}
                    <p style="margin:8px 0;"><strong>Check-in realizado em:</strong> {{checkin_completed_at}}</p>
                  </td>
                </tr>
              </table>
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
                Este é um e-mail automático do sistema de gestão hoteleira.
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
WHERE event_type = 'checkin.reception.notification'::email_event_type;

-- 2. Template: reservation.cancelled (Reserva Cancelada)
UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reserva Cancelada</title>
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
                ❌ Reserva Cancelada
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 15px 0;">Olá <strong>{{guest_name}}</strong>,</p>
              <p style="margin:0 0 30px 0;">Informamos que sua reserva foi cancelada conforme solicitado.</p>
              <!-- Detalhes da Reserva -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #dc2626; padding:22px; border-radius:0;">
                    <h2 style="color:#dc2626; margin-top:0; margin-bottom:15px; font-size:18px;">Detalhes da Reserva Cancelada</h2>
                    <p style="margin:8px 0;"><strong>Localizador:</strong> {{reservation_code}}</p>
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}} às {{checkin_time}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}} às {{checkout_time}}</p>
                    {{#if room_number}}
                    <p style="margin:8px 0;"><strong>Quarto:</strong> {{room_number}}</p>
                    {{/if}}
                    {{#if category_name}}
                    <p style="margin:8px 0;"><strong>Categoria:</strong> {{category_name}}</p>
                    {{/if}}
                    <p style="margin:8px 0;"><strong>Valor Total:</strong> R$ {{total_amount}}</p>
                    {{#if paid_amount}}
                    <p style="margin:8px 0;"><strong>Valor Pago:</strong> <span style="color:#059669; font-weight:bold; font-size:16px;">R$ {{paid_amount}}</span></p>
                    {{/if}}
                  </td>
                </tr>
              </table>
              {{#if paid_amount}}
              <!-- Aviso de Reembolso -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fef3c7; border-left:4px solid #f59e0b; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#92400e; font-size:14px;"><strong>⚠️ Informação Importante sobre Reembolso:</strong></p>
                    <p style="margin:10px 0 0 0; color:#92400e; font-size:14px;">Detectamos que foi realizado um pagamento para esta reserva. Entre em contato conosco o quanto antes para processarmos o reembolso conforme nossa política de cancelamento.</p>
                  </td>
                </tr>
              </table>
              {{else}}
              <!-- Informação sem custos -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fef3c7; border-left:4px solid #f59e0b; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#92400e; font-size:14px;"><strong>ℹ️ Informação:</strong> Esta reserva foi cancelada sem custos adicionais.</p>
                  </td>
                </tr>
              </table>
              {{/if}}
              <!-- Contato -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color:#eff6ff; border-left:4px solid #3b82f6; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#1e40af; font-size:14px;"><strong>📞 Precisa de Ajuda?</strong></p>
                    <p style="margin:10px 0 0 0; color:#1e40af; font-size:14px;">Se você tiver alguma dúvida sobre o cancelamento ou precisar de mais informações, nossa equipe está à disposição para ajudar. Entre em contato através dos canais disponíveis no rodapé deste e-mail.</p>
                    {{#if hotel_website}}
                    <p style="margin:15px 0 0 0; color:#1e40af; font-size:14px;"><strong>Website:</strong> <a href="{{hotel_website}}" style="color:#3b82f6; text-decoration:none;">{{hotel_website}}</a></p>
                    {{/if}}
                  </td>
                </tr>
              </table>
              <p style="margin-top:20px; color:#6b7280;">Esperamos poder recebê-lo em uma futura oportunidade!</p>
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
updated_at = NOW()
WHERE event_type = 'reservation.cancelled'::email_event_type;

-- 3. Template: reservation.extended (Extensão de Reserva)
UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Extensão de Reserva Confirmada</title>
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
                ✅ Extensão de Reserva Confirmada!
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 15px 0;">Olá <strong>{{guest_name}}</strong>,</p>
              <p style="margin:0 0 30px 0;">Sua solicitação de extensão de reserva foi confirmada e o pagamento foi processado com sucesso!</p>
              <!-- Nova Data de Check-out -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fef3c7; border-left:4px solid #f59e0b; padding:20px; border-radius:0;">
                    <h3 style="margin-top:0; margin-bottom:10px; color:#92400e; font-size:16px;">📅 Nova Data de Check-out</h3>
                    <p style="font-size:18px; font-weight:bold; color:#10b981; margin:0;">{{new_checkout_date}} às {{checkout_time}}</p>
                  </td>
                </tr>
              </table>
              <!-- Detalhes da Reserva -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #10b981; padding:22px; border-radius:0;">
                    <h2 style="color:#10b981; margin-top:0; margin-bottom:15px; font-size:18px;">Detalhes da Reserva</h2>
                    <p style="margin:8px 0;"><strong>Localizador:</strong> {{reservation_code}}</p>
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}} às {{checkin_time}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{new_checkout_date}} às {{checkout_time}}</p>
                    {{#if room_number}}
                    <p style="margin:8px 0;"><strong>Quarto:</strong> {{room_number}}</p>
                    {{/if}}
                    {{#if category_name}}
                    <p style="margin:8px 0;"><strong>Categoria:</strong> {{category_name}}</p>
                    {{/if}}
                    <p style="margin:8px 0;"><strong>Valor Total:</strong> R$ {{total_amount}}</p>
                    <p style="margin:8px 0;"><strong>Valor Pago:</strong> <span style="color:#059669; font-weight:bold; font-size:16px;">R$ {{paid_amount}}</span></p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 30px 0;">Estamos felizes em poder estender sua estadia conosco!</p>
              {{#if web_checkin_link}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="{{web_checkin_link}}" style="display:inline-block; padding:15px 30px; background-color:#4f46e5; color:#fff; text-decoration:none; border-radius:6px; font-weight:bold; font-size:16px;">
                      Acessar Portal do Hóspede
                    </a>
                  </td>
                </tr>
              </table>
              {{/if}}
              <p style="margin:0;">Se tiver alguma dúvida ou precisar de mais informações, não hesite em nos contatar.</p>
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
updated_at = NOW()
WHERE event_type = 'reservation.extended'::email_event_type;

-- 4. Template: checkout.reminder (Lembrete de Check-out)
UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lembrete de Check-out</title>
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
                📅 Lembrete de Check-out
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 15px 0;">Olá <strong>{{guest_name}}</strong>,</p>
              <p style="margin:0 0 15px 0;">Esperamos que esteja aproveitando sua estadia no <strong>{{hotel_name}}</strong>!</p>
              <p style="margin:0 0 30px 0;">Gostaríamos de lembrá-lo que seu <strong>check-out está programado para {{checkout_date}}</strong>.</p>
              <!-- Detalhes da Reserva -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #667eea; padding:22px; border-radius:0;">
                    <h2 style="color:#667eea; margin-top:0; margin-bottom:15px; font-size:18px;">Detalhes da Reserva</h2>
                    {{#if identification_number}}
                    <p style="margin:8px 0;"><strong>Localizador:</strong> {{identification_number}}</p>
                    {{/if}}
                    {{#if reservation_code}}
                    <p style="margin:8px 0;"><strong>Identificador da Reserva:</strong> {{reservation_code}}</p>
                    {{/if}}
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}}</p>
                    {{#if room_number}}
                    <p style="margin:8px 0;"><strong>Quarto:</strong> {{room_number}}</p>
                    {{/if}}
                  </td>
                </tr>
              </table>
              <!-- Extensão -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fff7ed; border-left:4px solid #f59e0b; padding:20px; border-radius:0;">
                    <h3 style="color:#f59e0b; margin-top:0; margin-bottom:10px; font-size:16px;">💡 Deseja estender sua estadia?</h3>
                    <p style="margin:10px 0 0 0; color:#92400e; font-size:14px;">Se você gostaria de estender sua estadia, clique no botão abaixo para acessar sua reserva e solicitar uma extensão.</p>
                    {{#if web_checkin_link}}
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:20px;">
                      <tr>
                        <td style="text-align:center;">
                          <a href="{{web_checkin_link}}" style="display:inline-block; background:#f59e0b; color:#fff; text-decoration:none; padding:12px 30px; border-radius:5px; font-weight:bold; font-size:16px;">
                            Solicitar Extensão
                          </a>
                        </td>
                      </tr>
                    </table>
                    {{/if}}
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 20px 0;">Caso tenha alguma dúvida ou precise de assistência, não hesite em entrar em contato conosco através dos canais disponíveis no rodapé deste e-mail.</p>
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
updated_at = NOW()
WHERE event_type = 'checkout.reminder'::email_event_type;

-- 5. Template: fiscal_document.request (Solicitação de Nota Fiscal)
UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Solicitação de Nota Fiscal</title>
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
                📄 Solicitação de Nota Fiscal
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 30px 0;">Uma nova solicitação de Nota Fiscal foi recebida através do sistema.</p>
              <!-- Dados da Reserva -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #2563eb; padding:22px; border-radius:0;">
                    <h2 style="color:#2563eb; margin-top:0; margin-bottom:15px; font-size:18px;">Dados da Reserva</h2>
                    <p style="margin:8px 0;"><strong>Código da Reserva:</strong> {{reservation_code}}</p>
                    <p style="margin:8px 0;"><strong>Hóspede (quem se hospedou):</strong> {{actual_guest_name}}</p>
                    {{#if room_number}}
                    <p style="margin:8px 0;"><strong>Quarto:</strong> {{room_number}}</p>
                    {{/if}}
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}}</p>
                    <p style="margin:8px 0;"><strong>Valor Pago:</strong> <span style="color:#059669; font-weight:bold; font-size:16px;">{{paid_amount}}</span></p>
                  </td>
                </tr>
              </table>
              <!-- Dados para Emissão -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #2563eb; padding:22px; border-radius:0;">
                    <h2 style="color:#2563eb; margin-top:0; margin-bottom:15px; font-size:18px;">Dados para Emissão</h2>
                    <p style="margin:8px 0;"><strong>Tipo:</strong> {{request_type_label}}</p>
                    {{#if company_name}}
                    <p style="margin:8px 0;"><strong>Razão Social:</strong> {{company_name}}</p>
                    {{/if}}
                    {{#if cnpj}}
                    <p style="margin:8px 0;"><strong>CNPJ:</strong> {{cnpj}}</p>
                    {{/if}}
                    {{#if financial_email}}
                    <p style="margin:8px 0;"><strong>E-mail do Responsável:</strong> {{financial_email}}</p>
                    {{/if}}
                  </td>
                </tr>
              </table>
              <!-- ID da Solicitação -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fef3c7; border-left:4px solid #f59e0b; padding:20px; border-radius:0;">
                    <p style="margin:0; font-weight:bold; color:#92400e; font-size:14px;">ID da Solicitação:</p>
                    <p style="margin:5px 0 0 0; font-family:monospace; color:#78350f; font-size:16px; font-weight:bold;">{{request_id}}</p>
                  </td>
                </tr>
              </table>
              <!-- Ação Necessária -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color:#eff6ff; border-left:4px solid #3b82f6; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#1e40af; font-size:14px;"><strong>⚠️ Ação Necessária:</strong> Acesse o sistema para processar esta solicitação e emitir a Nota Fiscal.</p>
                  </td>
                </tr>
              </table>
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
updated_at = NOW()
WHERE event_type = 'fiscal_document.request'::email_event_type;

-- 6. Template: guest.password_reset (Recuperação de Senha - Hóspede)
UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Recuperação de Senha</title>
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
                🔐 Recuperação de Senha
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 15px 0;">Olá <strong>{{guest_name}}</strong>,</p>
              <p style="margin:0 0 30px 0;">Recebemos uma solicitação para redefinir a senha da sua conta no <strong>{{hotel_name}}</strong>.</p>
              <!-- Informação -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#eff6ff; border-left:4px solid #667eea; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#1e40af; font-size:16px; font-weight:bold;">📧 Redefinir sua senha</p>
                    <p style="margin:10px 0 0 0; color:#1e40af; font-size:14px;">Clique no botão abaixo para criar uma nova senha. Este link é válido por <strong>1 hora</strong>.</p>
                  </td>
                </tr>
              </table>
              <!-- Botão -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="{{reset_url}}" style="display:inline-block; background-color:#667eea; color:#fff; text-decoration:none; padding:14px 28px; border-radius:6px; font-weight:bold; font-size:16px;">
                      Redefinir Minha Senha
                    </a>
                  </td>
                </tr>
              </table>
              <p style="color:#6b7280; font-size:14px; margin:0 0 10px 0;">Ou copie e cole o link abaixo no seu navegador:</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#f9fafb; padding:10px; border-radius:4px;">
                    <p style="color:#667eea; word-break:break-all; font-size:12px; margin:0; font-family:monospace;">{{reset_url}}</p>
                  </td>
                </tr>
              </table>
              <!-- Aviso -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fff7ed; border-left:4px solid #f59e0b; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#92400e; font-size:14px;"><strong>⚠️ Importante:</strong></p>
                    <ul style="margin:10px 0 0 0; padding-left:20px; color:#92400e; font-size:14px;">
                      <li>Este link expira em 1 hora por motivos de segurança</li>
                      <li>Se você não solicitou esta recuperação, ignore este e-mail</li>
                      <li>Sua senha atual permanecerá inalterada se você não usar este link</li>
                    </ul>
                  </td>
                </tr>
              </table>
              <p style="color:#6b7280; font-size:14px; margin:0 0 20px 0;">Se você não solicitou esta recuperação de senha, pode ignorar este e-mail com segurança. Nenhuma alteração será feita na sua conta.</p>
              <p style="margin:0 0 15px 0; color:#6b7280;">Se tiver alguma dúvida ou precisar de ajuda, entre em contato conosco através dos canais disponíveis no rodapé deste e-mail.</p>
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
updated_at = NOW()
WHERE event_type = 'guest.password_reset'::email_event_type;

-- 7. Template: reservation.overbooking (Notificação de Overbooking)
UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atenção: Problema na sua Reserva</title>
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
                ⚠️ Atenção: Problema na sua Reserva
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 15px 0;">Olá <strong>{{guest_name}}</strong>,</p>
              <p style="margin:0 0 30px 0;">Identificamos um problema na sua reserva que requer sua atenção imediata.</p>
              <!-- Alerta Overbooking -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fef3c7; border-left:4px solid #f59e0b; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#92400e; font-size:16px; font-weight:bold;">⚠️ Overbooking Detectado</p>
                    <p style="margin:10px 0 0 0; color:#92400e; font-size:14px;">Sua reserva está em conflito com outra(s) reserva(s) no mesmo quarto para as mesmas datas. Nossa equipe está trabalhando para resolver esta situação o mais rápido possível.</p>
                  </td>
                </tr>
              </table>
              <!-- Detalhes da Reserva -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #dc2626; padding:22px; border-radius:0;">
                    <h2 style="color:#dc2626; margin-top:0; margin-bottom:15px; font-size:18px;">Detalhes da sua Reserva</h2>
                    <p style="margin:8px 0;"><strong>Localizador:</strong> {{reservation_code}}</p>
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}} às {{checkin_time}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}} às {{checkout_time}}</p>
                    {{#if room_number}}
                    <p style="margin:8px 0;"><strong>Quarto:</strong> {{room_number}}</p>
                    {{/if}}
                    {{#if category_name}}
                    <p style="margin:8px 0;"><strong>Categoria:</strong> {{category_name}}</p>
                    {{/if}}
                    <p style="margin:8px 0;"><strong>Valor Total:</strong> R$ {{total_amount}}</p>
                  </td>
                </tr>
              </table>
              <!-- Contato Urgente -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background-color:#eff6ff; border-left:4px solid #3b82f6; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#1e40af; font-size:16px; font-weight:bold;">📞 Entre em Contato Conosco Urgentemente</p>
                    <p style="margin:10px 0 0 0; color:#1e40af; font-size:14px;">Para resolvermos esta situação da melhor forma possível, é fundamental que você entre em contato conosco o quanto antes. Nossa equipe está pronta para oferecer soluções alternativas e garantir que sua estadia seja perfeita. Entre em contato através dos canais disponíveis no rodapé deste e-mail.</p>
                  </td>
                </tr>
              </table>
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
updated_at = NOW()
WHERE event_type = 'reservation.overbooking'::email_event_type;

-- 8. Template: employee.added_to_establishment (Funcionário Adicionado ao Estabelecimento)
UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Novo Estabelecimento Adicionado</title>
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
                🏢 Novo Estabelecimento Adicionado
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 15px 0;">Olá <strong>{{employee_name}}</strong>,</p>
              <p style="margin:0 0 30px 0;">Temos o prazer de informar que você foi adicionado como <strong>{{role_name}}</strong> ao estabelecimento <strong>{{establishment_name}}</strong> da empresa <strong>{{company_name}}</strong>.</p>
              <!-- Informações do Estabelecimento -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #667eea; padding:22px; border-radius:0;">
                    <h2 style="color:#667eea; margin-top:0; margin-bottom:15px; font-size:18px;">Informações do Estabelecimento</h2>
                    <p style="margin:8px 0;"><strong>Estabelecimento:</strong> {{establishment_name}}</p>
                    <p style="margin:8px 0;"><strong>Empresa:</strong> {{company_name}}</p>
                    <p style="margin:8px 0;"><strong>Cargo:</strong> {{role_name}}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 30px 0;">Agora você pode acessar o sistema e começar a trabalhar neste estabelecimento. Faça login com suas credenciais para começar.</p>
              {{#if hotel_website}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="{{hotel_website}}" style="display:inline-block; background-color:#667eea; color:#fff; text-decoration:none; padding:12px 30px; border-radius:5px; font-weight:bold; font-size:16px;">
                      Acessar Sistema
                    </a>
                  </td>
                </tr>
              </table>
              {{/if}}
              <p style="color:#666; font-size:14px; margin:0;">Se você tiver alguma dúvida ou precisar de ajuda, entre em contato conosco.</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:25px; text-align:center; background-color:#fafafa; border-top:1px solid #e8e8e8;">
              <p style="font-size:13px; color:#555; margin:0;"><strong>{{#if hotel_name}}{{hotel_name}}{{else}}Sistema PMS{{/if}}</strong></p>
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
updated_at = NOW()
WHERE event_type = 'employee.added_to_establishment'::email_event_type;

-- 9. Template: reservation.created (Reserva Criada - Pagamento Pendente)
UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reserva Confirmada</title>
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
                ✅ Reserva Confirmada
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 15px 0;">Olá <strong>{{guest_name}}</strong>,</p>
              <p style="margin:0 0 30px 0;">Sua reserva foi recebida com sucesso!</p>
              <!-- Detalhes da Reserva -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #4f46e5; padding:22px; border-radius:0;">
                    <h2 style="color:#4f46e5; margin-top:0; margin-bottom:15px; font-size:18px;">Detalhes da Reserva</h2>
                    <p style="margin:8px 0;"><strong>Código:</strong> {{reservation_code}}</p>
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}} às {{checkin_time}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}} às {{checkout_time}}</p>
                    <p style="margin:8px 0;"><strong>Valor Total:</strong> <span style="color:#1f2937; font-weight:bold; font-size:16px;">R$ {{total_amount}}</span></p>
                    <p style="margin:8px 0;">
                      <strong>Status do Pagamento:</strong>
                      <span style="background:#f59e0b; color:#fff; padding:4px 10px; border-radius:12px; font-size:12px; display:inline-block; margin-left:8px;">
                        Pendente
                      </span>
                    </p>
                  </td>
                </tr>
              </table>
              {{#if payment_link}}
              <!-- Stripe ativo - mostrar botão de pagamento -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fff7ed; border-left:4px solid #f59e0b; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#92400e; font-size:14px;"><strong>💳 Ação Necessária:</strong> Por favor, realize o pagamento para confirmar sua estadia.</p>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="text-align:center;">
                    <a href="{{payment_link}}" style="display:inline-block; padding:15px 30px; background-color:#4f46e5; color:#fff; text-decoration:none; border-radius:6px; font-weight:bold; font-size:16px;">
                      Realizar Pagamento
                    </a>
                  </td>
                </tr>
              </table>
              {{else}}
              <!-- Stripe desativado - mostrar mensagem de contato -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#eff6ff; border-left:4px solid #3b82f6; padding:20px; border-radius:0;">
                    <p style="margin:0; color:#1e40af; font-size:16px; font-weight:bold;">📞 Reserva Pendente de Pagamento</p>
                    <p style="margin:10px 0 0 0; color:#1e40af; font-size:14px;">
                      Sua reserva foi recebida com sucesso, porém o pagamento ainda está pendente. 
                      Para confirmar sua estadia, entre em contato com nosso atendimento para verificar as condições de pagamento através dos canais disponíveis no rodapé deste e-mail.
                    </p>
                  </td>
                </tr>
              </table>
              {{/if}}
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
WHERE event_type = 'reservation.created'::email_event_type;

-- 10. Template: payment.confirmed (Pagamento Confirmado)
UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Check-in Confirmado</title>
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
                ✅ Check-in Confirmado!
              </h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <p style="margin:0 0 15px 0;">Olá <strong>{{guest_name}}</strong>,</p>
              <p style="margin:0 0 30px 0;">Seu pagamento foi confirmado e sua estadia está garantida!</p>
              <!-- Detalhes da Reserva -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #10b981; padding:22px; border-radius:0;">
                    <h2 style="color:#10b981; margin-top:0; margin-bottom:15px; font-size:18px;">Detalhes da Reserva</h2>
                    <p style="margin:8px 0;"><strong>Localizador:</strong> {{reservation_code}}</p>
                    <p style="margin:8px 0;"><strong>Check-in:</strong> {{checkin_date}} às {{checkin_time}}</p>
                    <p style="margin:8px 0;"><strong>Check-out:</strong> {{checkout_date}} às {{checkout_time}}</p>
                    <p style="margin:8px 0;"><strong>Endereço:</strong> {{hotel_address}}</p>
                    {{#if room_number}}
                    <p style="margin:8px 0;"><strong>Quarto:</strong> {{room_number}}</p>
                    {{/if}}
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

-- 11. Template: checkin.confirmed (Check-in Confirmado) - Versão completa padronizada
UPDATE public.email_templates
SET body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Check-in Concluído</title>
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
                ✅ Check-in Concluído!
              </h1>
              <p style="color:#d1d5db; margin-top:8px; font-size:14px;">
                Seu check-in online foi realizado com sucesso
              </p>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding:40px 35px;">
              <!-- Informações do Estabelecimento -->
              {{#if hotel_name}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="text-align:center; padding-bottom:20px; border-bottom:1px solid #e8e8e8;">
                    <h2 style="color:#1f2937; margin:0 0 10px 0; font-size:20px;">{{hotel_name}}</h2>
                    {{#if hotel_address}}
                    <p style="margin:5px 0; color:#6b7280; font-size:14px;">{{hotel_address}}</p>
                    {{/if}}
                  </td>
                </tr>
              </table>
              {{/if}}
              <!-- Localizador -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#f0fdf4; border-left:4px solid #10b981; padding:22px; border-radius:0; text-align:center;">
                    <p style="margin:0 0 10px 0; color:#059669; font-size:14px; font-weight:bold;">Localizador da Reserva</p>
                    <p style="margin:0; color:#1f2937; font-size:24px; font-weight:bold; font-family:monospace;">{{reservation_code}}</p>
                    {{#if identification_number}}
                    <p style="margin:20px 0 0 0; padding-top:20px; border-top:2px solid #86efac; color:#059669; font-size:14px; font-weight:bold;">Número de Identificação</p>
                    <p style="margin:5px 0 0 0; color:#1f2937; font-size:20px; font-weight:bold; font-family:monospace;">{{identification_number}}</p>
                    {{/if}}
                  </td>
                </tr>
              </table>
              <!-- Datas da Reserva -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #3b82f6; padding:22px; border-radius:0;">
                    <h2 style="color:#3b82f6; margin-top:0; margin-bottom:15px; font-size:18px;">Datas da Reserva</h2>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="width:50%; padding-right:10px;">
                          <p style="margin:0 0 5px 0; color:#6b7280; font-size:12px;">Check-in</p>
                          <p style="margin:0; color:#1f2937; font-size:16px; font-weight:bold;">{{checkin_date}}</p>
                          {{#if checkin_time}}
                          <p style="margin:5px 0 0 0; color:#6b7280; font-size:12px;">às {{checkin_time}}</p>
                          {{/if}}
                        </td>
                        <td style="width:50%; padding-left:10px;">
                          <p style="margin:0 0 5px 0; color:#6b7280; font-size:12px;">Check-out</p>
                          <p style="margin:0; color:#1f2937; font-size:16px; font-weight:bold;">{{checkout_date}}</p>
                          {{#if checkout_time}}
                          <p style="margin:5px 0 0 0; color:#6b7280; font-size:12px;">às {{checkout_time}}</p>
                          {{/if}}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <!-- Acomodação -->
              {{#if room_number}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #8b5cf6; padding:22px; border-radius:0; text-align:center;">
                    <p style="margin:0 0 10px 0; color:#6b7280; font-size:12px;">Acomodação</p>
                    <p style="margin:0; color:#1f2937; font-size:24px; font-weight:bold;">{{room_number}}</p>
                    {{#if category_name}}
                    <p style="margin:10px 0 0 0; color:#6b7280; font-size:14px;">{{category_name}}</p>
                    {{/if}}
                  </td>
                </tr>
              </table>
              {{/if}}
              <!-- Senha do Quarto -->
              {{#if room_password}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #f59e0b; padding:22px; border-radius:0; text-align:center;">
                    <p style="margin:0 0 10px 0; color:#6b7280; font-size:12px;">Senha do Quarto</p>
                    <p style="margin:0; color:#1f2937; font-size:24px; font-weight:bold; font-family:monospace; letter-spacing:2px;">{{room_password}}</p>
                    <p style="margin:10px 0 0 0; color:#6b7280; font-size:12px;">Senha do quarto do hóspede</p>
                  </td>
                </tr>
              </table>
              {{/if}}
              <!-- Endereço -->
              {{#if hotel_address}}
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#fafafa; border-left:4px solid #6b7280; padding:22px; border-radius:0;">
                    <h3 style="color:#1f2937; margin-top:0; margin-bottom:15px; font-size:16px;">Como Chegar</h3>
                    <p style="margin:0 0 15px 0; color:#374151; font-size:16px; line-height:1.8;"><strong>{{hotel_address}}</strong></p>
                    <a href="https://www.google.com/maps/search/?api=1&query={{hotel_address}}" style="display:inline-block; padding:10px 20px; background:#2563eb; color:#fff; text-decoration:none; border-radius:6px; font-size:14px; font-weight:600;">
                      📍 Abrir no Google Maps
                    </a>
                  </td>
                </tr>
              </table>
              {{/if}}
              <!-- Próximos Passos -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:30px;">
                <tr>
                  <td style="background-color:#eff6ff; border-left:4px solid #3b82f6; padding:22px; border-radius:0;">
                    <h3 style="color:#1e40af; margin-top:0; margin-bottom:15px; font-size:16px;">Próximos Passos</h3>
                    <p style="margin:0 0 15px 0; color:#1e40af; font-size:14px;"><strong>📧 Email de Confirmação</strong></p>
                    <p style="margin:0 0 20px 0; color:#1e40af; font-size:14px;">Você receberá um email de confirmação em breve com todos os detalhes da sua reserva.</p>
                    <p style="margin:0 0 15px 0; color:#1e40af; font-size:14px;"><strong>📅 No Dia do Check-in</strong></p>
                    <p style="margin:0; color:#1e40af; font-size:14px;">Apresente-se na recepção em <strong>{{checkin_date}}{{#if checkin_time}} às {{checkin_time}}{{/if}}</strong> com um documento de identificação válido.</p>
                  </td>
                </tr>
              </table>
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
                Este é um e-mail automático do sistema de gestão hoteleira.
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
WHERE event_type = 'checkin.confirmed'::email_event_type;

COMMENT ON TABLE public.email_templates IS 'Templates de e-mail padronizados com design unificado: header escuro (#1f2937), logo condicional, layout email-safe com tabelas, cards com borda lateral colorida, e destaques claros para valores e ações.';

