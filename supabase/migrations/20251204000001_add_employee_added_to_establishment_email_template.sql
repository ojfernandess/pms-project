-- Adicionar template de e-mail para quando um funcionário é adicionado a um estabelecimento
-- Evento: employee.added_to_establishment

INSERT INTO public.email_templates (
  name,
  event_type,
  subject,
  body_html,
  is_active,
  variables
)
SELECT 
  'Funcionário Adicionado ao Estabelecimento',
  'employee.added_to_establishment'::email_event_type,
  'Você foi adicionado ao estabelecimento {{establishment_name}}'::text,
  '<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Novo Estabelecimento Adicionado</title>
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
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Novo Estabelecimento Adicionado</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Olá <strong>{{employee_name}}</strong>,
              </p>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                Temos o prazer de informar que você foi adicionado como <strong>{{role_name}}</strong> ao estabelecimento <strong>{{establishment_name}}</strong> da empresa <strong>{{company_name}}</strong>.
              </p>
              
              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <h2 style="color: #667eea; margin: 0 0 15px 0; font-size: 18px;">Informações do Estabelecimento</h2>
                <p style="color: #555555; font-size: 14px; margin: 5px 0;"><strong>Estabelecimento:</strong> {{establishment_name}}</p>
                <p style="color: #555555; font-size: 14px; margin: 5px 0;"><strong>Empresa:</strong> {{company_name}}</p>
                <p style="color: #555555; font-size: 14px; margin: 5px 0;"><strong>Cargo:</strong> {{role_name}}</p>
              </div>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 30px 0 20px 0;">
                Agora você pode acessar o sistema e começar a trabalhar neste estabelecimento. Faça login com suas credenciais para começar.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="{{#if hotel_website}}{{hotel_website}}{{else}}#{{/if}}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 12px 30px; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  Acessar Sistema
                </a>
              </div>
              
              <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                Se você tiver alguma dúvida ou precisar de ajuda, entre em contato conosco.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px; text-align: center; background-color: #f8f9fa; border-radius: 0 0 8px 8px; border-top: 1px solid #e0e0e0;">
              <p style="color: #666666; font-size: 12px; margin: 0 0 10px 0;">
                {{#if hotel_name}}{{hotel_name}}{{else}}Sistema PMS{{/if}}
              </p>
              {{#if hotel_email}}
              <p style="color: #666666; font-size: 12px; margin: 5px 0;">
                E-mail: <a href="mailto:{{hotel_email}}" style="color: #667eea; text-decoration: none;">{{hotel_email}}</a>
              </p>
              {{/if}}
              {{#if hotel_phone}}
              <p style="color: #666666; font-size: 12px; margin: 5px 0;">
                Telefone: {{hotel_phone}}
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
  '["employee_name", "employee_email", "establishment_name", "company_name", "role_name", "hotel_name", "hotel_email", "hotel_phone", "logo_url", "hotel_website"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.email_templates 
  WHERE event_type = 'employee.added_to_establishment'::email_event_type
);

