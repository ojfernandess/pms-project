-- Migration: Criar template padrão para extensão de reserva
-- Este template será enviado quando o hóspede realizar uma extensão e pagar

INSERT INTO public.email_templates (name, event_type, subject, body_html, is_active, variables)
SELECT 
  'Extensão de Reserva Confirmada',
  'reservation.extended'::email_event_type,
  'Extensão de Reserva Confirmada - Nova Data de Check-out',
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
    .highlight { background-color: #FEF3C7; padding: 10px; border-radius: 4px; margin: 15px 0; }
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
      <h1>✅ Extensão de Reserva Confirmada!</h1>
    </div>
    <div class="content">
      <p>Olá {{guest_name}},</p>
      <p>Sua solicitação de extensão de reserva foi confirmada e o pagamento foi processado com sucesso!</p>
      
      <div class="highlight">
        <h3 style="margin-top: 0;">📅 Nova Data de Check-out</h3>
        <p style="font-size: 18px; font-weight: bold; color: #10B981;">{{new_checkout_date}} às {{checkout_time}}</p>
      </div>

      <div class="info-box">
        <h3 style="margin-top: 0;">Detalhes da Reserva:</h3>
        <ul style="list-style: none; padding: 0;">
          <li><strong>Localizador:</strong> {{reservation_code}}</li>
          <li><strong>Check-in:</strong> {{checkin_date}} às {{checkin_time}}</li>
          <li><strong>Check-out:</strong> {{new_checkout_date}} às {{checkout_time}}</li>
          {{#if room_number}}
          <li><strong>Quarto:</strong> {{room_number}}</li>
          {{/if}}
          {{#if category_name}}
          <li><strong>Categoria:</strong> {{category_name}}</li>
          {{/if}}
          <li><strong>Valor Total:</strong> R$ {{total_amount}}</li>
          <li><strong>Valor Pago:</strong> R$ {{paid_amount}}</li>
        </ul>
      </div>

      <p>Estamos felizes em poder estender sua estadia conosco!</p>
      
      {{#if web_checkin_link}}
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{web_checkin_link}}" style="display: inline-block; padding: 15px 30px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px;">
          Acessar Portal do Hóspede
        </a>
      </div>
      {{/if}}

      <p>Se tiver alguma dúvida ou precisar de mais informações, não hesite em nos contatar.</p>
    </div>
    <div class="footer">
      <p><strong>{{hotel_name}}</strong></p>
      <p>{{hotel_address}}</p>
      <p>{{hotel_phone}}</p>
      {{#if hotel_email}}
      <p>{{hotel_email}}</p>
      {{/if}}
    </div>
  </div>
</body>
</html>',
  true,
  '["guest_name", "reservation_code", "checkin_date", "checkout_date", "new_checkout_date", "checkin_time", "checkout_time", "room_number", "category_name", "total_amount", "paid_amount", "hotel_name", "hotel_address", "hotel_phone", "hotel_email", "hotel_logo", "logo_url", "web_checkin_link"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates
  WHERE event_type = 'reservation.extended'::email_event_type
);

