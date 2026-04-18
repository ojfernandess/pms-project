-- Migration: Template padrão para envio de link de pagamento de orçamento
-- Este template será enviado quando um orçamento for criado com a opção de enviar link de pagamento

-- Criar template se não existir
INSERT INTO public.email_templates (name, event_type, subject, body_html, is_active, variables)
SELECT 
  'Orçamento - Link de Pagamento',
  'quote.payment_link'::email_event_type,
  'Orçamento {{quote_code}} - Link para Pagamento',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #1f2937 0%, #374151 100%); color: white; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .content { padding: 30px 20px; }
    .greeting { font-size: 16px; margin-bottom: 20px; }
    .quote-box { background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .quote-box h2 { margin-top: 0; color: #1f2937; font-size: 18px; }
    .info-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .info-table td { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .info-table td:first-child { font-weight: 600; color: #6b7280; width: 40%; }
    .info-table td:last-child { color: #1f2937; }
    .amount-box { background-color: #eff6ff; border: 2px solid #3b82f6; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center; }
    .amount-label { font-size: 14px; color: #6b7280; margin-bottom: 5px; }
    .amount-value { font-size: 32px; font-weight: 700; color: #1e40af; margin: 0; }
    .payment-button { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3); }
    .payment-button:hover { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); }
    .payment-link-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .payment-link-box p { margin: 5px 0; font-size: 14px; color: #92400e; }
    .payment-link-box a { color: #1e40af; word-break: break-all; text-decoration: none; }
    .payment-link-box a:hover { text-decoration: underline; }
    .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
    .logo-container { text-align: center; margin-bottom: 20px; }
    .logo-container img { max-width: 200px; max-height: 80px; height: auto; }
    .expiration-notice { background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .expiration-notice p { margin: 5px 0; font-size: 14px; color: #991b1b; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      {{#if hotel_logo}}
      <div class="logo-container">
        <img src="{{hotel_logo}}" alt="{{hotel_name}}" />
      </div>
      {{/if}}
      <h1>📋 Orçamento de Reserva</h1>
    </div>
    
    <div class="content">
      <div class="greeting">
        <p>Olá <strong>{{guest_name}}</strong>,</p>
        <p>Preparamos um orçamento especial para sua estadia. Confira os detalhes abaixo:</p>
      </div>
      
      <div class="quote-box">
        <h2>Detalhes do Orçamento</h2>
        <table class="info-table">
          <tr>
            <td>Código do Orçamento:</td>
            <td><strong>{{quote_code}}</strong></td>
          </tr>
          <tr>
            <td>Estabelecimento:</td>
            <td>{{hotel_name}}</td>
          </tr>
          {{#if category_name}}
          <tr>
            <td>Acomodação:</td>
            <td>{{category_name}}</td>
          </tr>
          {{/if}}
          {{#if room_number}}
          <tr>
            <td>Quarto:</td>
            <td>{{room_number}}</td>
          </tr>
          {{/if}}
          <tr>
            <td>Check-in:</td>
            <td>{{checkin_date}}</td>
          </tr>
          <tr>
            <td>Check-out:</td>
            <td>{{checkout_date}}</td>
          </tr>
          <tr>
            <td>Hóspedes:</td>
            <td>{{adults}} adulto(s){{#if children}}, {{children}} criança(s){{/if}}</td>
          </tr>
          {{#if expiration_date}}
          <tr>
            <td>Válido até:</td>
            <td>{{expiration_date}}</td>
          </tr>
          {{/if}}
        </table>
      </div>
      
      <div class="amount-box">
        <div class="amount-label">Valor Total</div>
        <div class="amount-value">R$ {{total_amount}}</div>
      </div>
      
      {{#if expiration_date}}
      <div class="expiration-notice">
        <p><strong>⏰ Atenção:</strong> Este orçamento é válido até <strong>{{expiration_date}}</strong>.</p>
        <p>Após esta data, o orçamento expirará e será necessário solicitar um novo.</p>
      </div>
      {{/if}}
      
      {{#if payment_link}}
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{payment_link}}" class="payment-button">💳 Realizar Pagamento</a>
      </div>
      
      <div class="payment-link-box">
        <p><strong>🔗 Link de Pagamento:</strong></p>
        <p>Se preferir, você também pode acessar o link diretamente:</p>
        <p><a href="{{payment_link}}">{{payment_link}}</a></p>
      </div>
      {{/if}}
      
      {{#if notes}}
      <div style="background-color: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 4px; border-left: 4px solid #6b7280;">
        <p style="margin: 0; font-size: 14px; color: #374151;"><strong>Observações:</strong></p>
        <p style="margin: 10px 0 0 0; color: #4b5563; white-space: pre-wrap;">{{notes}}</p>
      </div>
      {{/if}}
      
      <div style="margin-top: 30px; padding: 20px; background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; color: #1e40af; font-size: 14px;">
          <strong>💡 Como funciona:</strong>
        </p>
        <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e40af; font-size: 14px;">
          <li>Clique no botão acima ou acesse o link de pagamento</li>
          <li>Complete o pagamento de forma segura</li>
          <li>Após o pagamento confirmado, sua reserva será criada automaticamente</li>
          <li>Você receberá um e-mail de confirmação com todos os detalhes</li>
        </ul>
      </div>
      
      {{#if hotel_email}}
      <div style="margin-top: 20px; padding: 15px; background-color: #f0fdf4; border-radius: 4px; border-left: 4px solid #22c55e;">
        <p style="margin: 0; color: #166534; font-size: 14px;">
          <strong>📧 Dúvidas?</strong> Entre em contato conosco:
        </p>
        <p style="margin: 10px 0 5px 0; color: #166534;">
          <strong>E-mail:</strong> <a href="mailto:{{hotel_email}}" style="color: #16a34a; text-decoration: none;">{{hotel_email}}</a>
        </p>
        {{#if hotel_phone}}
        <p style="margin: 5px 0; color: #166534;">
          <strong>Telefone:</strong> <a href="tel:{{hotel_phone}}" style="color: #16a34a; text-decoration: none;">{{hotel_phone}}</a>
        </p>
        {{/if}}
      </div>
      {{/if}}
    </div>
    
    <div class="footer">
      <p style="margin: 0;"><strong>{{hotel_name}}</strong></p>
      {{#if hotel_address}}
      <p style="margin: 5px 0 0 0;">{{hotel_address}}</p>
      {{/if}}
      {{#if hotel_website}}
      <p style="margin: 10px 0 0 0;">
        <a href="{{hotel_website}}" style="color: #3b82f6; text-decoration: none;">{{hotel_website}}</a>
      </p>
      {{/if}}
      <p style="margin: 15px 0 0 0; font-size: 11px; color: #9ca3af;">
        Este é um e-mail automático. Por favor, não responda diretamente a este e-mail.
      </p>
    </div>
  </div>
</body>
</html>',
  true,
  '["quote_code", "guest_name", "hotel_name", "hotel_logo", "logo_url", "category_name", "room_number", "checkin_date", "checkout_date", "adults", "children", "total_amount", "payment_link", "expiration_date", "notes", "hotel_email", "hotel_phone", "hotel_address", "hotel_website"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates 
  WHERE event_type = 'quote.payment_link'::email_event_type
);

-- Se o template já existir, atualizar apenas o conteúdo
UPDATE public.email_templates
SET 
  name = 'Orçamento - Link de Pagamento',
  subject = 'Orçamento {{quote_code}} - Link para Pagamento',
  body_html = '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
    .email-container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #1f2937 0%, #374151 100%); color: white; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .content { padding: 30px 20px; }
    .greeting { font-size: 16px; margin-bottom: 20px; }
    .quote-box { background-color: #f9fafb; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; border-radius: 4px; }
    .quote-box h2 { margin-top: 0; color: #1f2937; font-size: 18px; }
    .info-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .info-table td { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .info-table td:first-child { font-weight: 600; color: #6b7280; width: 40%; }
    .info-table td:last-child { color: #1f2937; }
    .amount-box { background-color: #eff6ff; border: 2px solid #3b82f6; padding: 20px; margin: 20px 0; border-radius: 8px; text-align: center; }
    .amount-label { font-size: 14px; color: #6b7280; margin-bottom: 5px; }
    .amount-value { font-size: 32px; font-weight: 700; color: #1e40af; margin: 0; }
    .payment-button { display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px 0; box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3); }
    .payment-button:hover { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); }
    .payment-link-box { background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .payment-link-box p { margin: 5px 0; font-size: 14px; color: #92400e; }
    .payment-link-box a { color: #1e40af; word-break: break-all; text-decoration: none; }
    .payment-link-box a:hover { text-decoration: underline; }
    .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
    .logo-container { text-align: center; margin-bottom: 20px; }
    .logo-container img { max-width: 200px; max-height: 80px; height: auto; }
    .expiration-notice { background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .expiration-notice p { margin: 5px 0; font-size: 14px; color: #991b1b; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      {{#if hotel_logo}}
      <div class="logo-container">
        <img src="{{hotel_logo}}" alt="{{hotel_name}}" />
      </div>
      {{/if}}
      <h1>📋 Orçamento de Reserva</h1>
    </div>
    
    <div class="content">
      <div class="greeting">
        <p>Olá <strong>{{guest_name}}</strong>,</p>
        <p>Preparamos um orçamento especial para sua estadia. Confira os detalhes abaixo:</p>
      </div>
      
      <div class="quote-box">
        <h2>Detalhes do Orçamento</h2>
        <table class="info-table">
          <tr>
            <td>Código do Orçamento:</td>
            <td><strong>{{quote_code}}</strong></td>
          </tr>
          <tr>
            <td>Estabelecimento:</td>
            <td>{{hotel_name}}</td>
          </tr>
          {{#if category_name}}
          <tr>
            <td>Acomodação:</td>
            <td>{{category_name}}</td>
          </tr>
          {{/if}}
          {{#if room_number}}
          <tr>
            <td>Quarto:</td>
            <td>{{room_number}}</td>
          </tr>
          {{/if}}
          <tr>
            <td>Check-in:</td>
            <td>{{checkin_date}}</td>
          </tr>
          <tr>
            <td>Check-out:</td>
            <td>{{checkout_date}}</td>
          </tr>
          <tr>
            <td>Hóspedes:</td>
            <td>{{adults}} adulto(s){{#if children}}, {{children}} criança(s){{/if}}</td>
          </tr>
          {{#if expiration_date}}
          <tr>
            <td>Válido até:</td>
            <td>{{expiration_date}}</td>
          </tr>
          {{/if}}
        </table>
      </div>
      
      <div class="amount-box">
        <div class="amount-label">Valor Total</div>
        <div class="amount-value">R$ {{total_amount}}</div>
      </div>
      
      {{#if expiration_date}}
      <div class="expiration-notice">
        <p><strong>⏰ Atenção:</strong> Este orçamento é válido até <strong>{{expiration_date}}</strong>.</p>
        <p>Após esta data, o orçamento expirará e será necessário solicitar um novo.</p>
      </div>
      {{/if}}
      
      {{#if payment_link}}
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{payment_link}}" class="payment-button">💳 Realizar Pagamento</a>
      </div>
      
      <div class="payment-link-box">
        <p><strong>🔗 Link de Pagamento:</strong></p>
        <p>Se preferir, você também pode acessar o link diretamente:</p>
        <p><a href="{{payment_link}}">{{payment_link}}</a></p>
      </div>
      {{/if}}
      
      {{#if notes}}
      <div style="background-color: #f3f4f6; padding: 15px; margin: 20px 0; border-radius: 4px; border-left: 4px solid #6b7280;">
        <p style="margin: 0; font-size: 14px; color: #374151;"><strong>Observações:</strong></p>
        <p style="margin: 10px 0 0 0; color: #4b5563; white-space: pre-wrap;">{{notes}}</p>
      </div>
      {{/if}}
      
      <div style="margin-top: 30px; padding: 20px; background-color: #eff6ff; border-radius: 8px; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; color: #1e40af; font-size: 14px;">
          <strong>💡 Como funciona:</strong>
        </p>
        <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #1e40af; font-size: 14px;">
          <li>Clique no botão acima ou acesse o link de pagamento</li>
          <li>Complete o pagamento de forma segura</li>
          <li>Após o pagamento confirmado, sua reserva será criada automaticamente</li>
          <li>Você receberá um e-mail de confirmação com todos os detalhes</li>
        </ul>
      </div>
      
      {{#if hotel_email}}
      <div style="margin-top: 20px; padding: 15px; background-color: #f0fdf4; border-radius: 4px; border-left: 4px solid #22c55e;">
        <p style="margin: 0; color: #166534; font-size: 14px;">
          <strong>📧 Dúvidas?</strong> Entre em contato conosco:
        </p>
        <p style="margin: 10px 0 5px 0; color: #166534;">
          <strong>E-mail:</strong> <a href="mailto:{{hotel_email}}" style="color: #16a34a; text-decoration: none;">{{hotel_email}}</a>
        </p>
        {{#if hotel_phone}}
        <p style="margin: 5px 0; color: #166534;">
          <strong>Telefone:</strong> <a href="tel:{{hotel_phone}}" style="color: #16a34a; text-decoration: none;">{{hotel_phone}}</a>
        </p>
        {{/if}}
      </div>
      {{/if}}
    </div>
    
    <div class="footer">
      <p style="margin: 0;"><strong>{{hotel_name}}</strong></p>
      {{#if hotel_address}}
      <p style="margin: 5px 0 0 0;">{{hotel_address}}</p>
      {{/if}}
      {{#if hotel_website}}
      <p style="margin: 10px 0 0 0;">
        <a href="{{hotel_website}}" style="color: #3b82f6; text-decoration: none;">{{hotel_website}}</a>
      </p>
      {{/if}}
      <p style="margin: 15px 0 0 0; font-size: 11px; color: #9ca3af;">
        Este é um e-mail automático. Por favor, não responda diretamente a este e-mail.
      </p>
    </div>
  </div>
</body>
</html>',
  variables = '["quote_code", "guest_name", "hotel_name", "hotel_logo", "logo_url", "category_name", "room_number", "checkin_date", "checkout_date", "adults", "children", "total_amount", "payment_link", "expiration_date", "notes", "hotel_email", "hotel_phone", "hotel_address", "hotel_website"]'::jsonb
WHERE event_type = 'quote.payment_link'::email_event_type;

-- Comentário
COMMENT ON TABLE public.email_templates IS 'Templates de e-mail para diferentes eventos do sistema. O template quote.payment_link é usado para enviar o link de pagamento quando um orçamento é criado com a opção de enviar por email.';

