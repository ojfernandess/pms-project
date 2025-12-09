-- Criar template de email para Notificação de Check-in para Portaria
-- Este template será usado para enviar informações do check-in (incluindo foto selfie e documento) para a portaria

-- Primeiro, desativar qualquer template existente para checkin.reception.notification
UPDATE public.email_templates
SET is_active = false
WHERE event_type = 'checkin.reception.notification'::email_event_type;

-- Inserir novo template
INSERT INTO public.email_templates (
  name,
  event_type,
  subject,
  body_html,
  is_active,
  variables,
  created_at,
  updated_at
) VALUES (
  'Notificação de Check-in para Portaria',
  'checkin.reception.notification'::email_event_type,
  'Novo Check-in Confirmado - {{reservation_code}} - {{hotel_name}}',
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
      max-width: 700px;
      margin: 20px auto;
      background-color: #ffffff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px 20px;
      text-align: center;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 30px 20px;
    }
    .info-section {
      background-color: #f8f9fa;
      border-left: 4px solid #667eea;
      padding: 20px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      font-weight: 600;
      color: #555;
      min-width: 150px;
    }
    .info-value {
      color: #333;
      text-align: right;
      flex: 1;
    }
    .guest-section {
      margin: 30px 0;
      padding: 20px;
      background-color: #f8f9fa;
      border-radius: 8px;
    }
    .guest-header {
      font-size: 18px;
      font-weight: 600;
      color: #667eea;
      margin-bottom: 15px;
      padding-bottom: 10px;
      border-bottom: 2px solid #667eea;
    }
    .document-section {
      margin: 20px 0;
      padding: 20px;
      background-color: #ffffff;
      border: 2px solid #e0e0e0;
      border-radius: 8px;
    }
    .document-item {
      margin: 15px 0;
      padding: 15px;
      background-color: #f8f9fa;
      border-radius: 6px;
    }
    .document-label {
      font-weight: 600;
      color: #555;
      margin-bottom: 10px;
      display: block;
    }
    .image-container {
      margin: 10px 0;
      text-align: center;
    }
    .image-container img {
      max-width: 100%;
      height: auto;
      border: 2px solid #ddd;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin: 5px;
    }
    .selfie-container {
      display: inline-block;
      margin: 10px;
      text-align: center;
    }
    .selfie-container img {
      max-width: 300px;
      height: auto;
      border: 3px solid #667eea;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .document-image {
      max-width: 400px;
      height: auto;
      border: 2px solid #ddd;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .footer {
      background-color: #f8f9fa;
      padding: 20px;
      text-align: center;
      color: #666;
      font-size: 12px;
      border-top: 1px solid #e0e0e0;
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 10px;
    }
    .badge-success {
      background-color: #10b981;
      color: white;
    }
    .alert {
      background-color: #fff3cd;
      border-left: 4px solid #ffc107;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
      color: #856404;
    }
    .no-data {
      color: #999;
      font-style: italic;
      text-align: center;
      padding: 20px;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>🔔 Novo Check-in Confirmado</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Notificação para Portaria</p>
    </div>
    
    <div class="content">
      <div class="alert">
        <strong>⚠️ Atenção:</strong> Um hóspede completou o check-in online. Verifique as informações abaixo e prepare a recepção.
      </div>

      <div class="info-section">
        <h2 style="margin-top: 0; color: #667eea;">Informações da Reserva</h2>
        <div class="info-row">
          <span class="info-label">Código da Reserva:</span>
          <span class="info-value"><strong>{{reservation_code}}</strong></span>
        </div>
        <div class="info-row">
          <span class="info-label">Hotel:</span>
          <span class="info-value">{{hotel_name}}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Data de Check-in:</span>
          <span class="info-value">{{checkin_date}}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Data de Check-out:</span>
          <span class="info-value">{{checkout_date}}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Quarto:</span>
          <span class="info-value">{{room_number}} - {{room_name}}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Status:</span>
          <span class="info-value"><span class="badge badge-success">Check-in Confirmado</span></span>
        </div>
      </div>

      {{#if main_guest}}
      <div class="guest-section">
        <div class="guest-header">👤 Hóspede Principal</div>
        <div class="info-row">
          <span class="info-label">Nome:</span>
          <span class="info-value"><strong>{{main_guest.name}}</strong></span>
        </div>
        <div class="info-row">
          <span class="info-label">Email:</span>
          <span class="info-value">{{main_guest.email}}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Telefone:</span>
          <span class="info-value">{{main_guest.phone}}</span>
        </div>
        {{#if main_guest.birth_date}}
        <div class="info-row">
          <span class="info-label">Data de Nascimento:</span>
          <span class="info-value">{{main_guest.birth_date}}</span>
        </div>
        {{/if}}
        {{#if main_guest.document_number}}
        <div class="info-row">
          <span class="info-label">Documento:</span>
          <span class="info-value">{{main_guest.document_type}}: {{main_guest.document_number}}</span>
        </div>
        {{/if}}
      </div>
      {{/if}}

      {{#if selfie_url}}
      <div class="document-section">
        <div class="document-label">📸 Foto Selfie do Hóspede</div>
        <div class="selfie-container">
          <img src="{{selfie_url}}" alt="Selfie do hóspede" />
        </div>
      </div>
      {{/if}}

      {{#if documents}}
      <div class="document-section">
        <div class="document-label" style="font-size: 16px; margin-bottom: 15px;">📄 Documentos Enviados</div>
        {{#each documents}}
        <div class="document-item">
          <div class="document-label">{{this.guest_name}}</div>
          {{#if this.document_type}}
          <div class="info-row">
            <span class="info-label">Tipo de Documento:</span>
            <span class="info-value">{{this.document_type}}</span>
          </div>
          {{/if}}
          {{#if this.document_number}}
          <div class="info-row">
            <span class="info-label">Número:</span>
            <span class="info-value">{{this.document_number}}</span>
          </div>
          {{/if}}
          
          {{#if this.selfie_url}}
          <div class="image-container">
            <div class="document-label" style="margin-bottom: 10px;">Selfie:</div>
            <img src="{{this.selfie_url}}" alt="Selfie de {{this.guest_name}}" class="document-image" />
          </div>
          {{/if}}
          
          {{#if this.document_front_url}}
          <div class="image-container">
            <div class="document-label" style="margin-bottom: 10px;">Frente do Documento:</div>
            <img src="{{this.document_front_url}}" alt="Frente do documento de {{this.guest_name}}" class="document-image" />
          </div>
          {{/if}}
          
          {{#if this.document_back_url}}
          <div class="image-container">
            <div class="document-label" style="margin-bottom: 10px;">Verso do Documento:</div>
            <img src="{{this.document_back_url}}" alt="Verso do documento de {{this.guest_name}}" class="document-image" />
          </div>
          {{/if}}
        </div>
        {{/each}}
      </div>
      {{else}}
      <div class="document-section">
        <div class="no-data">Nenhum documento foi enviado durante o check-in online.</div>
      </div>
      {{/if}}

      {{#if additional_guests}}
      <div class="guest-section">
        <div class="guest-header">👥 Hóspedes Adicionais</div>
        {{#each additional_guests}}
        <div class="info-row">
          <span class="info-label">{{this.name}}:</span>
          <span class="info-value">{{this.document_type}}: {{this.document_number}}</span>
        </div>
        {{/each}}
      </div>
      {{/if}}

      <div class="info-section">
        <h3 style="margin-top: 0; color: #667eea;">Informações Adicionais</h3>
        <div class="info-row">
          <span class="info-label">Adultos:</span>
          <span class="info-value">{{adults}}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Crianças:</span>
          <span class="info-value">{{children}}</span>
        </div>
        {{#if notes}}
        <div class="info-row">
          <span class="info-label">Observações:</span>
          <span class="info-value">{{notes}}</span>
        </div>
        {{/if}}
        <div class="info-row">
          <span class="info-label">Check-in Realizado em:</span>
          <span class="info-value">{{checkin_completed_at}}</span>
        </div>
      </div>
    </div>

    <div class="footer">
      <p>Este é um email automático do sistema de gestão hoteleira.</p>
      <p>Por favor, não responda a este email.</p>
      <p style="margin-top: 10px; color: #999;">© {{hotel_name}} - Todos os direitos reservados</p>
    </div>
  </div>
</body>
</html>',
  true,
  '{
    "reservation_code": "Código da reserva",
    "hotel_name": "Nome do hotel",
    "checkin_date": "Data de check-in formatada",
    "checkout_date": "Data de check-out formatada",
    "room_number": "Número do quarto",
    "room_name": "Nome do quarto",
    "main_guest": {
      "name": "Nome do hóspede principal",
      "email": "Email do hóspede",
      "phone": "Telefone do hóspede",
      "birth_date": "Data de nascimento",
      "document_type": "Tipo de documento (CPF, RG, etc)",
      "document_number": "Número do documento"
    },
    "selfie_url": "URL da foto selfie do hóspede principal",
    "documents": [
      {
        "guest_name": "Nome do hóspede",
        "document_type": "Tipo de documento",
        "document_number": "Número do documento",
        "selfie_url": "URL da selfie",
        "document_front_url": "URL da frente do documento",
        "document_back_url": "URL do verso do documento"
      }
    ],
    "additional_guests": [
      {
        "name": "Nome do hóspede adicional",
        "document_type": "Tipo de documento",
        "document_number": "Número do documento"
      }
    ],
    "adults": "Número de adultos",
    "children": "Número de crianças",
    "notes": "Observações da reserva",
    "checkin_completed_at": "Data e hora do check-in completado"
  }'::jsonb,
  NOW(),
  NOW()
)
ON CONFLICT (event_type) 
WHERE is_active = true
DO UPDATE SET
  name = EXCLUDED.name,
  subject = EXCLUDED.subject,
  body_html = EXCLUDED.body_html,
  variables = EXCLUDED.variables,
  updated_at = NOW();

-- Comentário na tabela
COMMENT ON TABLE public.email_templates IS 'Templates de e-mail para diferentes eventos do sistema. O template checkin.reception.notification é usado para enviar notificações de check-in confirmado para a portaria, incluindo foto selfie e documentos.';

