-- Criar template de email para Check-in Confirmado
-- Este template será usado quando o hóspede concluir o check-in online

-- Garantir que o tipo email_event_type inclui 'checkin.confirmed'
-- (Se já existe, não fará nada)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'checkin.confirmed' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'email_event_type')
  ) THEN
    ALTER TYPE email_event_type ADD VALUE 'checkin.confirmed';
  END IF;
END $$;

-- Primeiro, desativar qualquer template existente para checkin.confirmed
UPDATE public.email_templates
SET is_active = false
WHERE event_type = 'checkin.confirmed';

-- Inserir novo template
INSERT INTO public.email_templates (
  name,
  event_type,
  subject,
  body_html,
  is_active,
  created_at,
  updated_at
) VALUES (
  'Check-in Confirmado',
  'checkin.confirmed',
  'Check-in Concluído - {{reservation_code}} - {{hotel_name}}',
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      padding: 40px 20px;
      text-align: center;
      color: white;
    }
    .success-icon {
      font-size: 64px;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      font-size: 32px;
      font-weight: bold;
    }
    .header p {
      margin: 10px 0 0 0;
      font-size: 18px;
      opacity: 0.95;
    }
    .content {
      padding: 30px 20px;
    }
    .hotel-info {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    .hotel-info h2 {
      font-size: 24px;
      color: #1f2937;
      margin: 0 0 10px 0;
    }
    {{#if hotel_address}}
    .hotel-info p {
      color: #6b7280;
      font-size: 14px;
      margin: 5px 0;
    }
    {{/if}}
    .card {
      background: #f0fdf4;
      border: 2px solid #86efac;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 25px;
      text-align: center;
    }
    .card-label {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .card-value {
      font-size: 36px;
      font-weight: bold;
      color: #059669;
      margin: 10px 0;
    }
    .card-value-small {
      font-size: 20px;
      font-weight: 600;
      color: #047857;
      margin-top: 15px;
    }
    .info-section {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 25px;
    }
    .section-title {
      font-size: 20px;
      font-weight: bold;
      color: #1f2937;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #e5e7eb;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .info-item {
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #3b82f6;
    }
    .info-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      margin-bottom: 8px;
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    .info-value {
      font-size: 20px;
      font-weight: bold;
      color: #1f2937;
    }
    .info-value-time {
      font-size: 16px;
      color: #4b5563;
      margin-top: 5px;
    }
    .room-card {
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
    }
    .room-number {
      font-size: 42px;
      font-weight: 300;
      color: #1f2937;
      margin: 15px 0;
    }
    .category-name {
      font-size: 16px;
      color: #6b7280;
      margin-top: 15px;
      padding-top: 15px;
      border-top: 1px solid #e5e7eb;
    }
    .password-box {
      background: #f9fafb;
      border: 3px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
      margin: 20px 0;
    }
    .password-value {
      font-size: 32px;
      font-family: monospace;
      font-weight: 300;
      letter-spacing: 6px;
      color: #1f2937;
    }
    .address-section {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 25px;
    }
    .address-line {
      font-size: 16px;
      color: #374151;
      margin-bottom: 8px;
      line-height: 1.8;
    }
    .address-line strong {
      color: #1f2937;
    }
    .google-maps-link {
      display: inline-block;
      margin-top: 15px;
      padding: 10px 20px;
      background: #2563eb;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
    }
    .google-maps-link:hover {
      background: #1d4ed8;
    }
    .next-steps {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 25px;
    }
    .tip-box {
      background: #dbeafe;
      border: 1px solid #93c5fd;
      border-radius: 12px;
      padding: 20px;
      margin-top: 25px;
    }
    .tip-text {
      color: #1e40af;
      font-size: 14px;
      margin: 0;
      line-height: 1.6;
    }
    .footer {
      background: #f9fafb;
      padding: 20px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
      color: #6b7280;
      font-size: 12px;
    }
    @media only screen and (max-width: 600px) {
      .info-grid {
        grid-template-columns: 1fr;
      }
      .header h1 {
        font-size: 24px;
      }
      .card-value {
        font-size: 28px;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    <!-- Header -->
    <div class="header">
      <div class="success-icon">✓</div>
      <h1>Check-in Concluído!</h1>
      <p>Seu check-in online foi realizado com sucesso</p>
    </div>

    <div class="content">
      <!-- Informações do Estabelecimento -->
      <div class="hotel-info">
        {{#if hotel_logo}}
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="{{hotel_logo}}" alt="{{hotel_name}}" style="max-width: 200px; max-height: 80px; height: auto; display: inline-block;" />
        </div>
        {{/if}}
        {{#if logo_url}}
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="{{logo_url}}" alt="{{hotel_name}}" style="max-width: 200px; max-height: 80px; height: auto; display: inline-block;" />
        </div>
        {{/if}}
        <h2>{{hotel_name}}</h2>
        {{#if hotel_address}}
        <p>{{hotel_address}}</p>
        {{/if}}
        {{#if hotel_phone}}
        <p>📞 {{hotel_phone}}</p>
        {{/if}}
        {{#if hotel_email}}
        <p>✉️ {{hotel_email}}</p>
        {{/if}}
      </div>

      <!-- Localizador e Identificação -->
      <div class="card">
        <div class="card-label">Localizador da Reserva</div>
        <div class="card-value">{{reservation_code}}</div>
        {{#if identification_number}}
        <div style="margin-top: 25px; padding-top: 25px; border-top: 2px solid #86efac;">
          <div class="card-label">Número de Identificação</div>
          <div class="card-value-small">{{identification_number}}</div>
        </div>
        {{/if}}
      </div>

      <!-- Datas da Reserva -->
      <div class="info-section">
        <h2 class="section-title">Datas da Reserva</h2>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Check-in</div>
            <div class="info-value">{{checkin_date}}</div>
            {{#if checkin_time}}
            <div class="info-value-time">às {{checkin_time}}</div>
            {{/if}}
          </div>
          <div class="info-item">
            <div class="info-label">Check-out</div>
            <div class="info-value">{{checkout_date}}</div>
            {{#if checkout_time}}
            <div class="info-value-time">às {{checkout_time}}</div>
            {{/if}}
          </div>
        </div>
      </div>

      <!-- Acomodação -->
      {{#if room_number}}
      <div class="room-card">
        <div class="info-label">Acomodação</div>
        <div class="room-number">{{room_number}}</div>
        {{#if category_name}}
        <div class="category-name">{{category_name}}</div>
        {{/if}}
      </div>
      {{/if}}

      <!-- Senha do Quarto -->
      {{#if room_password}}
      <div class="room-card">
        <div class="info-label">Senha do Quarto</div>
        <div class="password-box">
          <div class="password-value">{{room_password}}</div>
        </div>
        <p style="text-align: center; color: #6b7280; font-size: 12px; margin-top: 10px;">
          Senha do quarto do hóspede
        </p>
      </div>
      {{/if}}

      <!-- Endereço -->
      {{#if hotel_address}}
      <div class="address-section">
        <h2 class="section-title">Como Chegar</h2>
        <div class="address-line">
          <strong>{{hotel_address}}</strong>
        </div>
        <p style="margin-top: 15px;">
          <a href="https://www.google.com/maps/search/?api=1&query={{hotel_address}}" 
             class="google-maps-link" 
             target="_blank" 
             rel="noopener noreferrer">
            📍 Abrir no Google Maps
          </a>
        </p>
      </div>
      {{/if}}

      <!-- Próximos Passos -->
      <div class="next-steps">
        <h2 class="section-title">Próximos Passos</h2>
        <div style="margin-top: 15px;">
          <p style="margin-bottom: 15px;">
            <strong>📧 Email de Confirmação</strong>
          </p>
          <p style="color: #1e40af; font-size: 14px; margin-bottom: 20px;">
            Você receberá um email de confirmação em breve com todos os detalhes da sua reserva.
          </p>
          
          <p style="margin-bottom: 15px;">
            <strong>📅 No Dia do Check-in</strong>
          </p>
          <p style="color: #1e40af; font-size: 14px;">
            Apresente-se na recepção em <strong>{{checkin_date}}{{#if checkin_time}} às {{checkin_time}}{{/if}}</strong> 
            com um documento de identificação válido.
          </p>
        </div>
      </div>

      <!-- Dica -->
      <div class="tip-box">
        <p class="tip-text">
          <strong>💡 Dica:</strong> Guarde este localizador (<strong>{{reservation_code}}</strong>) para facilitar 
          sua identificação na recepção. Você também pode apresentar este email de confirmação.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>Este é um email automático de confirmação de check-in.</p>
      <p>Por favor, não responda a este email.</p>
      {{#if hotel_contact}}
      <p style="margin-top: 10px;">
        Para mais informações, entre em contato: {{hotel_contact}}
      </p>
      {{/if}}
    </div>
  </div>
</body>
</html>',
  true,
  NOW(),
  NOW()
);

COMMENT ON TABLE public.email_templates IS 'Templates de e-mail para diferentes eventos do sistema. O template checkin.confirmed é usado quando o hóspede conclui o check-in online.';

