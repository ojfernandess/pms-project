import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  Route, 
  Code, 
  Database, 
  Mail, 
  CreditCard, 
  Users,
  User,
  Calendar,
  Settings,
  FileText,
  Shield,
  Zap,
  Globe,
  Lock,
  Key,
  DollarSign
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";

// Constantes para blocos de código (fora do componente para evitar problemas de parsing)
const AUTH_CODE_EXAMPLE = String.raw`// No frontend (React)
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// Headers para requisições
const headers = {
  "Authorization": "Bearer " + token,
  "apikey": "VITE_SUPABASE_PUBLISHABLE_KEY",
  "Content-Type": "application/json"
}`;

const SMTP_BODY_EXAMPLE = String.raw`{
  "to": "destinatario@email.com",
  "subject": "Assunto",
  "html": "<h1>Conteúdo</h1>",
  "smtpConfig": {
    "host": "smtp.exemplo.com",
    "port": 587,
    "secure": false,
    "auth": {
      "user": "usuario",
      "pass": "senha"
    }
  }
}`;

const STRIPE_PAYMENT_BODY = String.raw`{
  "establishment_id": "uuid-do-estabelecimento",
  "amount": 50000,
  "currency": "brl",
  "reservation_id": "uuid-da-reserva",
  "guest_id": "uuid-do-hospede",
  "description": "Pagamento da reserva RSV123456"
}`;

const STRIPE_PAYMENT_RESPONSE = String.raw`{
  "payment_intent_id": "pi_xxx",
  "client_secret": "pi_xxx_secret_xxx",
  "status": "requires_payment_method"
}`;

const STRIPE_STATUS_BODY = String.raw`{
  "payment_intent_id": "pi_xxx"
}`;

const STRIPE_STATUS_RESPONSE = String.raw`{
  "status": "succeeded",
  "amount": 50000,
  "currency": "brl",
  "charges": [...]
}`;

const STRIPE_REFUND_BODY = String.raw`{
  "payment_intent_id": "pi_xxx",
  "amount": 50000,
  "reason": "requested_by_customer"
}`;

const STRIPE_REFUND_RESPONSE = String.raw`{
  "refund_id": "re_xxx",
  "status": "succeeded",
  "amount": 50000
}`;

const GET_RESERVATION_BODY = String.raw`{
  "identifier": "123456",
  "locator": "RSV742516",
  "reservation_code": "RSV742516",
  "guest_account_id": "uuid"
}`;

const GET_RESERVATION_RESPONSE = String.raw`{
  "success": true,
  "reservation": {
    "id": "uuid",
    "reservation_code": "RSV742516",
    "identification_number": "123456",
    "checkin_date": "2024-01-15",
    "checkout_date": "2024-01-20",
    "total_amount": 1000.00,
    "paid_amount": 500.00,
    "payment_status": "partial",
    "status": "confirmed",
    "guest": {
      "id": "uuid",
      "full_name": "João Silva",
      "email": "joao@example.com",
      "phone": "+5511999999999"
    },
    "room": {
      "id": "uuid",
      "room_number": "101",
      "name": "Quarto 101"
    },
    "payments": [...],
    "web_checkin": {...}
  }
}`;

const RESERVATION_BODY_EXAMPLE = String.raw`{
  "reservation_code": "RSV123456",
  "checkin_date": "2024-12-01",
  "checkout_date": "2024-12-05",
  "status": "pending",
  "total_amount": 500.00,
  "establishment_id": "uuid-here"
}`;

const COMPLEX_QUERY_1 = String.raw`GET /rest/v1/reservations?select=*,
  guest:clients!guest_id(*),
  financial_responsible:clients!client_id(*),
  rooms(*,room_categories(*)),
  payments(*)
&establishment_id=eq.[uuid]
&status=in.(pending,confirmed)
&order=checkin_date.desc
&limit=20`;

const COMPLEX_QUERY_2 = String.raw`GET /rest/v1/clients?select=*,
  reservations!guest_id(
    id,
    reservation_code,
    checkin_date,
    checkout_date,
    status,
    total_amount
  )
&email=eq.cliente@email.com`;

const COMPLEX_QUERY_3 = String.raw`GET /rest/v1/rooms?select=*,
  room_categories(*)
&establishment_id=eq.[uuid]
&status=eq.available
&not.exists(
  reservations(
    checkin_date.lte.[date],
    checkout_date.gt.[date],
    status.in.(pending,confirmed,checkedin)
  )
)`;

const RLS_POLICY_EXAMPLE = String.raw`CREATE POLICY "Users can only see their establishment's reservations"
ON reservations
FOR SELECT
USING (
  establishment_id = (
    SELECT establishment_id 
    FROM user_establishments 
    WHERE user_id = auth.uid()
  )
);`;

const JWT_TOKEN_EXAMPLE = String.raw`// O token JWT contém:
{
  "sub": "user-uuid",
  "email": "user@email.com",
  "user_metadata": {
    "establishment_id": "establishment-uuid"
  }
}

// As políticas RLS usam auth.uid() para obter o user_id`;

const RLS_QUERY_EXAMPLE = String.raw`// Query sem filtro de establishment_id
GET /rest/v1/reservations

// RLS automaticamente adiciona:
WHERE establishment_id = (establishment do usuário autenticado)

// Resultado: Apenas reservas do estabelecimento do usuário`;

const HEADERS_EXAMPLE = String.raw`Authorization: Bearer [jwt_token]
apikey: [supabase_anon_key]
Content-Type: application/json
Prefer: return=representation`;

const GET_REQUEST_EXAMPLE = String.raw`GET /rest/v1/reservations?select=id,reservation_code,checkin_date&status=eq.confirmed&order=checkin_date.asc&limit=10

Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  Content-Type: application/json`;

const PATCH_REQUEST_EXAMPLE = String.raw`PATCH /rest/v1/reservations?id=eq.[uuid]
Content-Type: application/json

{
  "status": "confirmed",
  "paid_amount": 500.00
}`;

const DELETE_REQUEST_EXAMPLE = String.raw`DELETE /rest/v1/reservations?id=eq.[uuid]`;

const RESEND_EMAIL_BODY = String.raw`{
  "to": "destinatario@email.com",
  "subject": "Assunto do e-mail",
  "html": "<h1>Conteúdo HTML</h1>",
  "from": "remetente@dominio-verificado.com"
}`;

const RESEND_EMAIL_RESPONSE = String.raw`{
  "success": true,
  "messageId": "resend-message-id"
}`;

const EDGE_FUNCTION_HEADERS = String.raw`Authorization: Bearer {jwt_token}
Content-Type: application/json`;

const RELATIONSHIP_SIMPLE_EXAMPLE = String.raw`GET /rest/v1/reservations?select=*,guest:clients!guest_id(*)

// Retorna reservas com dados do hóspede (clients)`;

const RELATIONSHIP_NESTED_EXAMPLE = String.raw`GET /rest/v1/reservations?select=*,rooms(*,room_categories(*))

// Retorna reservas com quartos e categorias dos quartos`;

const RELATIONSHIP_REVERSE_EXAMPLE = String.raw`GET /rest/v1/clients?select=*,reservations!guest_id(*)

// Retorna clientes com todas as suas reservas`;

const STRIPE_INTEGRATION_DETAILS = String.raw`// Fluxo de Pagamento Stripe

1. Frontend chama Edge Function: stripe-payment
   POST /functions/v1/stripe-payment
   Body: {
     "establishment_id": "uuid",
     "amount": 50000, // em centavos
     "currency": "brl",
     "reservation_id": "uuid",
     "guest_id": "uuid"
   }

2. Edge Function cria Payment Intent no Stripe
   - Usa chave secreta armazenada em secrets
   - Retorna client_secret para frontend

3. Frontend usa Stripe.js para processar pagamento
   - Coleta dados do cartão (PCI compliant)
   - Confirma pagamento com client_secret

4. Webhook do Stripe atualiza status
   POST /functions/v1/stripe-webhook
   - Atualiza payment_status na reserva
   - Registra pagamento na tabela payments`;

const API_SETTINGS_DETAILS = String.raw`// Sistema de Configurações de API

1. Armazenamento Centralizado
   - Tabela: api_settings
   - Multi-tenant: cada estabelecimento tem suas próprias configurações
   - Campos: api_name, api_url, api_key, api_secret, config (JSON), is_active

2. Interface de Configuração
   - Local: Configurações > Integrações > Configurações de API
   - Funcionalidades:
     * Criar/editar configurações
     * Ativar/desativar integrações
     * Visualizar/ocultar secrets
     * Configurações adicionais em JSON

3. Uso no Código
   - Hook React: useApiSettings()
   - Função utilitária: getApiConfig(apiName)
   - Cliente HTTP: apiRequest(apiName, endpoint, options)

4. Exemplo de Uso
   import { apiRequest } from "@/lib/apiClient";
   
   // Sincronizar reservas com Booking Engine
   const reservations = await apiRequest("booking_engine", "/reservations", {
     method: "GET"
   });
   
   // Atualizar preços no Channel Manager
   await apiRequest("channel_manager", "/prices/update", {
     method: "POST",
     body: JSON.stringify({ room_id: "uuid", price: 150.00 })
   });`;

const API_SETTINGS_CODE_EXAMPLES = String.raw`// Exemplo 1: Buscar configuração
import { getApiConfig } from "@/lib/apiClient";

const config = await getApiConfig("booking_engine");
if (config?.is_active) {
  console.log("API configurada:", config.api_url);
}

// Exemplo 2: Fazer requisição HTTP
import { apiRequest } from "@/lib/apiClient";

try {
  const data = await apiRequest("channel_manager", "/sync", {
    method: "POST",
    body: JSON.stringify({ establishment_id: "uuid" })
  });
  console.log("Sincronização concluída:", data);
} catch (error) {
  console.error("Erro na sincronização:", error);
}

// Exemplo 3: Hook React
import { useApiSettings } from "@/hooks/useApiSettings";

function MyComponent() {
  const { apiSettings, isLoading } = useApiSettings();
  const bookingEngine = apiSettings.find(s => s.api_name === "booking_engine");
  
  if (bookingEngine?.is_active) {
    // Renderizar interface de sincronização
  }
}

// Exemplo 4: Edge Function
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  // Buscar configuração
  const { data: config } = await supabase
    .from("api_settings")
    .select("*")
    .eq("api_name", "booking_engine")
    .eq("establishment_id", establishmentId)
    .eq("is_active", true)
    .single();
  
  if (!config) {
    return new Response("API não configurada", { status: 400 });
  }
  
  // Fazer requisição usando configuração
  const url = config.api_url + "/reservations";
  const response = await fetch(url, {
    headers: {
      "Authorization": "Bearer " + config.api_key,
      "X-API-Secret": config.api_secret || ""
    }
  });
  
  return new Response(JSON.stringify(await response.json()));
});`;

const EMAIL_PROVIDER_DETAILS = String.raw`// Arquitetura de Envio de E-mail

1. Frontend/Backend prepara e-mail
   - Processa template com variáveis
   - Monta HTML final

2. Escolhe provedor configurado
   - Verifica email_settings.provider
   - Carrega credenciais do provedor

3. Chama Edge Function apropriada:
   
   SMTP: /functions/v1/send-email-smtp
   - Usa biblioteca Deno SMTP
   - Envia via servidor SMTP configurado
   
   Resend: /functions/v1/send-email-resend
   - Usa Resend API
   - Requer domínio verificado
   
   SendGrid/Mailgun/SES: Similar ao Resend
   - Cada um usa sua própria API
   - Credenciais armazenadas em secrets

4. Edge Function retorna resultado
   - Sucesso: messageId
   - Erro: detalhes do erro`;

const GUEST_DASHBOARD_QUERY_1 = String.raw`Query Key: ["current_guest_reservation", accountId]
Query Function:
  - Busca guest_stay_history por guest_account_id
  - Filtra reservas não canceladas e com checkout >= hoje
  - Ordena por checkin_date (mais próxima primeiro)
  - Busca dados completos: rooms, room_categories, clients, buildings
  - Retorna reserva mais próxima do check-in

Endpoint: GET /rest/v1/guest_stay_history?guest_account_id=eq.{accountId}
         GET /rest/v1/reservations?id=eq.{reservation_id}`;

const GUEST_DASHBOARD_QUERY_2 = String.raw`Query Key: ["all_guest_reservations", accountId]
Query Function:
  - Busca todas as reservation_ids do histórico
  - Busca dados completos de cada reserva
  - Inclui relacionamentos: rooms, room_categories, establishments

Endpoint: GET /rest/v1/guest_stay_history?guest_account_id=eq.{accountId}
         GET /rest/v1/reservations?id=in.(id1,id2,...)`;

const GUEST_DASHBOARD_QUERY_3 = String.raw`Query Key: ["cancelled_guest_reservations", accountId]
Query Function:
  - Busca histórico do hóspede
  - Filtra apenas reservas com status "cancelled"
  - Busca informações de contato do hotel_settings
  - Ordena por data (mais recente primeiro)

Endpoint: GET /rest/v1/guest_stay_history?guest_account_id=eq.{accountId}
         GET /rest/v1/reservations?status=eq.cancelled
         GET /rest/v1/hotel_settings?establishment_id=eq.{id}`;

const GUEST_DASHBOARD_QUERY_4 = String.raw`Query Key: ["current_web_checkin", reservationId]
Query Function:
  - Busca web_checkin mais recente da reserva
  - Inclui dados da reserva e estabelecimento
  - Retorna token e locator para ações

Endpoint: GET /rest/v1/web_checkin?reservation_id=eq.{id}&order=created_at.desc&limit=1`;

const WEBHOOK_DETAILS = String.raw`// Sistema de Webhooks

1. Stripe Webhook
   Endpoint: /functions/v1/stripe-webhook
   Eventos processados:
   - payment_intent.succeeded
   - payment_intent.payment_failed
   - charge.refunded
   
   Fluxo:
   a) Stripe envia evento para webhook
   b) Edge Function valida assinatura
   c) Atualiza status na reserva
   d) Registra na tabela payments

2. Bukly Webhook (OTAs)
   Endpoint: /functions/v1/bukly-webhook
   Eventos processados:
   - reservation.created
   - reservation.modified
   - reservation.cancelled
   
   Fluxo:
   a) Bukly envia dados da reserva
   b) Edge Function valida autenticação
   c) Cria/atualiza reserva no sistema
   d) Atribui categoria e quarto`;

const EMAIL_TEMPLATE_ENGINE = String.raw`// Processamento de Templates

1. Sistema busca template por event_type
   SELECT * FROM email_templates 
   WHERE event_type = 'reservation_created'

2. Substitui variáveis no template
   {{guest_name}} → "João Silva"
   {{reservation_code}} → "RSV123456"
   {{checkin_date}} → "15/12/2024"
   
3. Processa condicionais Handlebars
   {{#if room_number}}
     <p>Quarto: {{room_number}}</p>
   {{/if}}

4. Gera HTML final
   - Aplica estilos inline
   - Inclui logo do estabelecimento
   - Adiciona links dinâmicos`;

const STRIPE_CONFIGURATION_GUIDE = String.raw`// CONFIGURAÇÃO NO STRIPE DASHBOARD

1. Acesse https://dashboard.stripe.com
2. Faça login ou crie uma conta
3. Vá em Developers > API keys
4. Copie a "Secret key" (sk_test_... ou sk_live_...)
   - Test mode: para desenvolvimento
   - Live mode: para produção

5. Configure Webhooks:
   a) Vá em Developers > Webhooks
   b) Clique em "Add endpoint"
   c) URL: https://[seu-projeto].supabase.co/functions/v1/stripe-webhook
   d) Selecione eventos:
      - payment_intent.succeeded
      - payment_intent.payment_failed
      - charge.refunded
   e) Copie o "Signing secret" (whsec_...)

// CONFIGURAÇÃO NO SUPABASE (Edge Function)

1. Acesse Supabase Dashboard
2. Vá em Project Settings > Edge Functions
3. Crie/edite a função stripe-payment
4. Adicione Secrets:
   - STRIPE_SECRET_KEY: Cole a Secret key do Stripe
   - STRIPE_WEBHOOK_SECRET: Cole o Signing secret do webhook

// CONFIGURAÇÃO NO PMS

1. Acesse Configurações > Integrações > Stripe
2. Preencha:
   - Public Key (pk_test_... ou pk_live_...)
   - Secret Key: NÃO preencha (já está em Supabase Secrets)
   - Webhook Secret: NÃO preencha (já está em Supabase Secrets)
   - Modo: Test ou Live
3. Salve configurações

// VERIFICAÇÃO

1. Teste criação de Payment Intent
2. Verifique logs no Stripe Dashboard
3. Teste webhook usando Stripe CLI ou Dashboard
4. Confirme que pagamentos aparecem no PMS`;

const Documentation = () => {
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight text-slate-900">
              Documentação do Sistema
            </h1>
          </div>
          <p className="text-lg text-slate-600">
            Documentação completa de APIs, endpoints, rotas e funcionalidades do PMS
          </p>
        </div>

        <Tabs value={activeSection} onValueChange={setActiveSection} className="w-full">
          <TabsList className="grid w-full grid-cols-2 md:grid-cols-4 lg:grid-cols-8 mb-6">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="routes">Rotas</TabsTrigger>
            <TabsTrigger value="apis">APIs</TabsTrigger>
            <TabsTrigger value="swagger">Swagger/Postman</TabsTrigger>
            <TabsTrigger value="stability">Estabilidade</TabsTrigger>
            <TabsTrigger value="features">Funcionalidades</TabsTrigger>
            <TabsTrigger value="database">Banco de Dados</TabsTrigger>
            <TabsTrigger value="integrations">Integrações</TabsTrigger>
          </TabsList>

          {/* Visão Geral */}
          <TabsContent value="overview" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Globe className="h-6 w-6 text-primary" />
                Sobre o Sistema
              </h2>
              <div className="space-y-4 text-slate-700">
                <p>
                  O PMS (Property Management System) é uma solução completa para gestão de propriedades hoteleiras,
                  desenvolvida com tecnologias modernas e escaláveis.
                </p>
                <div className="grid md:grid-cols-2 gap-4 mt-6">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h3 className="font-semibold mb-2">Tecnologias</h3>
                    <ul className="space-y-1 text-sm">
                      <li>• React + TypeScript</li>
                      <li>• Vite</li>
                      <li>• Supabase (PostgreSQL)</li>
                      <li>• Tailwind CSS</li>
                      <li>• shadcn/ui</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h3 className="font-semibold mb-2">Arquitetura</h3>
                    <ul className="space-y-1 text-sm">
                      <li>• Frontend: React SPA</li>
                      <li>• Backend: Supabase Edge Functions</li>
                      <li>• Banco: PostgreSQL</li>
                      <li>• Autenticação: Supabase Auth</li>
                    </ul>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Code className="h-6 w-6 text-primary" />
                APIs Disponíveis
              </h2>
              <div className="space-y-3 text-slate-700">
                <p>
                  O sistema oferece diversas APIs através de Edge Functions do Supabase:
                </p>
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Route className="h-4 w-4 text-indigo-600" />
                      Get Reservation API
                    </h3>
                    <p className="text-sm text-slate-600 mb-2">
                      Buscar informações completas de reserva por identificador, localizador ou reservation_code.
                    </p>
                    <ul className="space-y-1 text-xs text-slate-600">
                      <li>• Suporta GET e POST</li>
                      <li>• Autenticação obrigatória</li>
                      <li>• Busca flexível por múltiplos identificadores</li>
                      <li>• Retorna dados completos da reserva</li>
                    </ul>
                    <code className="text-xs mt-2 block">/functions/v1/get-reservation</code>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-blue-600" />
                      Email APIs
                    </h3>
                    <p className="text-sm text-slate-600 mb-2">
                      Envio de emails via SMTP ou Resend API.
                    </p>
                    <ul className="space-y-1 text-xs text-slate-600">
                      <li>• SMTP configurável</li>
                      <li>• Integração com Resend</li>
                      <li>• Templates personalizáveis</li>
                    </ul>
                    <code className="text-xs mt-2 block">/functions/v1/send-email-*</code>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-green-600" />
                      Stripe Integration
                    </h3>
                    <p className="text-sm text-slate-600 mb-2">
                      Processamento de pagamentos, webhooks e reembolsos.
                    </p>
                    <ul className="space-y-1 text-xs text-slate-600">
                      <li>• Payment Intents</li>
                      <li>• Webhooks automáticos</li>
                      <li>• Reembolsos</li>
                    </ul>
                    <code className="text-xs mt-2 block">/functions/v1/stripe-*</code>
                  </div>
                </div>
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    <strong>💡 Dica:</strong> Consulte a aba "APIs" para documentação detalhada de cada endpoint,
                    incluindo exemplos de uso, parâmetros e respostas.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                Segurança
              </h2>
              <div className="space-y-3 text-slate-700">
                <p>
                  O sistema implementa múltiplas camadas de segurança para proteger dados sensíveis:
                </p>
                <ul className="space-y-2 list-disc list-inside">
                  <li><strong>Autenticação:</strong> Supabase Auth com JWT tokens</li>
                  <li><strong>Autorização:</strong> Row Level Security (RLS) no banco de dados</li>
                  <li><strong>Proteção de Rotas:</strong> Middleware de autenticação e autorização</li>
                  <li><strong>Chaves Sensíveis:</strong> Armazenadas apenas no servidor (Edge Functions)</li>
                  <li><strong>HTTPS:</strong> Todas as comunicações são criptografadas</li>
                  <li><strong>Controle de Acesso:</strong> Hóspedes só acessam suas próprias reservas</li>
                </ul>
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">
                    <strong>⚠️ Importante:</strong> Esta documentação não expõe chaves de API, tokens de acesso,
                    senhas ou outras informações sensíveis. Essas informações devem ser configuradas apenas
                    através da interface administrativa do sistema.
                  </p>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Rotas */}
          <TabsContent value="routes" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Route className="h-6 w-6 text-primary" />
                Rotas da Aplicação
              </h2>
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>📋 Sobre o Sistema de Rotas:</strong> A aplicação utiliza React Router v6 com roteamento baseado em componentes.
                  Todas as rotas são definidas em <code className="bg-blue-100 px-1 rounded">src/App.tsx</code> e utilizam componentes de proteção
                  (<code>ProtectedRoute</code>, <code>EstablishmentRoute</code>, <code>SuperAdminRoute</code>) para controle de acesso.
                </p>
              </div>
              <div className="h-[600px] overflow-y-auto pr-4">
                <div className="space-y-6">
                  {/* Rotas Públicas */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Rotas Públicas
                    </h3>
                    <p className="text-sm text-slate-600 mb-3">
                      Rotas acessíveis sem autenticação. Não utilizam componentes de proteção.
                    </p>
                    <div className="space-y-3">
                      <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/login</code>
                          <Badge variant="outline" className="text-xs">Pública</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Página de Login</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Auth</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Login e registro de usuários admin/user via Supabase Auth.</p>
                          <p><strong>Redirecionamentos:</strong> <code>/auth</code> e <code>/logout</code> redirecionam para esta rota (mantém compatibilidade com links antigos).</p>
                          <p><strong>Após login:</strong> Redireciona para <code>/user-dashboard</code> ou <code>/super-admin</code> baseado no role do usuário.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/login/reset-password</code>
                          <Badge variant="outline" className="text-xs">Pública</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Redefinição de Senha (Admin/User)</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>ResetPassword</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Permite redefinir senha de usuários admin/user usando token de recuperação.</p>
                          <p><strong>Redirecionamento:</strong> <code>/auth/reset-password</code> redireciona para esta rota (mantém compatibilidade).</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/web-checkin</code>
                          <Badge variant="outline" className="text-xs">Pública</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Web Check-in (Inicial)</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>WebCheckin</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Tela inicial do web check-in. Redireciona para autenticação de hóspede se necessário.</p>
                          <p><strong>Estado:</strong> Se hóspede não autenticado, exibe <code>GuestAuthStep</code> para login/cadastro.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/web-checkin/:locator</code>
                          <Badge variant="outline" className="text-xs">Pública</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Web Check-in com Localizador</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>WebCheckin</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Parâmetros:</strong> <code>:locator</code> (string) - Código do localizador da reserva (ex: RSV742516)</p>
                          <p><strong>Funcionalidade:</strong> Inicia processo de web check-in com localizador pré-definido na URL.</p>
                          <p><strong>Fluxo:</strong> Se não autenticado, passa o localizador para <code>GuestAuthStep</code> para vincular após login.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/web-checkin/reset-password</code>
                          <Badge variant="outline" className="text-xs">Pública</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Redefinição de Senha (Hóspede)</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>GuestResetPassword</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Permite hóspedes redefinirem senha usando token de recuperação.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/guest-dashboard</code>
                          <Badge variant="outline" className="text-xs">Pública (Auth Interna)</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Dashboard do Hóspede</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>GuestDashboard</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Painel do hóspede autenticado. Exibe reservas vinculadas, histórico e permite iniciar web check-in.</p>
                          <p><strong>Autenticação:</strong> Verifica <code>guest_account_id</code> no localStorage. Se não autenticado, redireciona para <code>/web-checkin</code>.</p>
                          <p><strong>Dados:</strong> Busca reservas vinculadas via <code>guest_stay_history</code> usando <code>guest_account_id</code>.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/payment/:paymentIntentId</code>
                          <Badge variant="outline" className="text-xs">Pública</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Página de Pagamento (Stripe)</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>PaymentPage</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Parâmetros:</strong> <code>:paymentIntentId</code> (string) - ID do Payment Intent do Stripe (ex: pi_xxx)</p>
                          <p><strong>Funcionalidade:</strong> Página pública para processar pagamentos via Stripe. Integra com Stripe Elements.</p>
                          <p><strong>Segurança:</strong> Payment Intent é validado no backend antes de exibir formulário de pagamento.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/payment/success/:paymentIntentId</code>
                          <Badge variant="outline" className="text-xs">Pública</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Página de Sucesso do Pagamento</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>PaymentSuccess</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Parâmetros:</strong> <code>:paymentIntentId</code> (string) - ID do Payment Intent confirmado</p>
                          <p><strong>Funcionalidade:</strong> Exibe confirmação de pagamento bem-sucedido e atualiza status da reserva.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/payment/return</code>
                          <Badge variant="outline" className="text-xs">Pública</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Retorno de Pagamento (Alternativo)</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>PaymentSuccess</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Rota alternativa para retorno de pagamento quando paymentIntentId não está na URL.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/policies/:token</code>
                          <Badge variant="outline" className="text-xs">Pública</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Políticas Públicas</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>PublicPolicies</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Parâmetros:</strong> <code>:token</code> (string) - Token de acesso às políticas (gerado pelo sistema)</p>
                          <p><strong>Funcionalidade:</strong> Exibe políticas do estabelecimento (termos, regras, etc.) de forma pública.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Rotas Protegidas - Estabelecimento */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Rotas Protegidas (Estabelecimento)
                    </h3>
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-xs text-amber-800">
                        <strong>🔒 Proteção:</strong> Todas estas rotas utilizam <code>ProtectedRoute</code> (verifica autenticação) e 
                        <code>EstablishmentRoute</code> (valida acesso ao estabelecimento). O <code>:establishmentId</code> deve ser o 
                        <code>numeric_id</code> do estabelecimento (número inteiro).
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Dashboard Principal</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Dashboard</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Parâmetros:</strong> <code>:establishmentId</code> (number) - ID numérico do estabelecimento</p>
                          <p><strong>Funcionalidade:</strong> Dashboard principal com visão geral: reservas recentes, ocupação, receitas, estatísticas.</p>
                          <p><strong>Dados:</strong> Busca dados via React Query com cache de 5 minutos. Atualiza em tempo real.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/ocupacao</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Mapa de Ocupação</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>OccupancyMap</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Alias:</strong> <code>/occupancy-map</code> também funciona (redireciona internamente)</p>
                          <p><strong>Funcionalidade:</strong> Visualização gráfica da ocupação por quarto, drag & drop de reservas, filtros por data.</p>
                          <p><strong>Tecnologia:</strong> Utiliza React DnD para drag & drop, atualizações otimistas com React Query.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/reservas</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Lista de Reservas</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Reservations</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Listagem completa de reservas com filtros, busca, ordenação e paginação.</p>
                          <p><strong>Filtros:</strong> Status, datas, hóspede, código, quarto. Suporta múltiplos filtros simultâneos.</p>
                          <p><strong>Performance:</strong> Paginação server-side, busca debounced, cache inteligente.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/reservas/pendencias</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Reservas Pendentes</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>PendingReservations</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Lista reservas com status "pending" ou "preregistration" que requerem atenção.</p>
                          <p><strong>Filtros:</strong> Apenas reservas pendentes do estabelecimento atual.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/reservas/:reservationCode</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Detalhes da Reserva</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>ReservationDetails</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Parâmetros:</strong> <code>:reservationCode</code> (string) - Código da reserva (ex: RSV742516)</p>
                          <p><strong>Funcionalidade:</strong> Visualização completa da reserva: dados do hóspede, pagamentos, web check-in, logs de atividade.</p>
                          <p><strong>Dados:</strong> Busca dados completos incluindo relacionamentos (guest, room, category, payments, web_checkin).</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/logs</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Logs de Atividade</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>ActivityLogs</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Histórico completo de atividades do sistema: criações, atualizações, check-ins, pagamentos.</p>
                          <p><strong>Filtros:</strong> Por tipo de ação, entidade, usuário, data. Suporta busca textual.</p>
                          <p><strong>Permissões:</strong> Requer role "manager" ou superior para acessar.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/clientes</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Gestão de Clientes</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Clients</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> CRUD completo de clientes/hóspedes: criar, editar, buscar, visualizar histórico.</p>
                          <p><strong>Busca:</strong> Por nome, email, CPF, telefone. Suporta busca fuzzy e deduplicação.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/clientes/centralizacao</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Centralização de Clientes</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>ClientDeduplication</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Ferramenta para identificar e mesclar clientes duplicados baseado em CPF, email ou telefone.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/unidades</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Gestão de Unidades/Quartos</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Units</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Gerenciamento de quartos: criar, editar, categorias, status (disponível, ocupado, manutenção).</p>
                          <p><strong>Recursos:</strong> Gestão de categorias, prédios, senhas de WiFi, tipos de autenticação.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/financeiro</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Relatórios Financeiros</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Financial</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Relatórios financeiros: receitas, despesas, fechamento de caixa, histórico de pagamentos.</p>
                          <p><strong>Filtros:</strong> Por período, método de pagamento, status. Exportação para CSV/PDF.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/tarifario</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Sistema de Tarifas (Novo)</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>PMSRateSystem</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Sistema moderno de gestão de tarifas com planos de preços, períodos, regras dinâmicas.</p>
                          <p><strong>Recursos:</strong> Múltiplos planos, períodos sazonais, regras de precificação baseadas em ocupação, integração com OTAs.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/tarifario-legado</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Sistema de Tarifas (Legado)</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Pricing</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Sistema legado de precificação. Mantido para compatibilidade.</p>
                          <p><strong>Nota:</strong> Recomenda-se migrar para o novo sistema em <code>/tarifario</code>.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/manutencao</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Gestão de Manutenção</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Maintenance</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Gestão de tickets de manutenção: criar, atribuir, acompanhar, fechar.</p>
                          <p><strong>Recursos:</strong> Prioridades, status, histórico, notificações.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/channel-manager</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Channel Manager</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>ChannelManager</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Integração com OTAs (Booking.com, Airbnb, etc.): sincronização de disponibilidade e tarifas.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/configuracoes</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Configurações do Estabelecimento</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Settings</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Configurações gerais: dados do hotel, políticas, integrações, emails, Stripe.</p>
                          <p><strong>Seções:</strong> Informações básicas, políticas, integrações, emails, pagamentos, personalização.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/perfil</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Perfil do Usuário</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Profile</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Gerenciamento do perfil do usuário logado: dados pessoais, senha, preferências.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/:establishmentId/funcionarios</code>
                          <Badge variant="outline" className="text-xs bg-green-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Gestão de Funcionários</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Employees</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> CRUD de funcionários: criar, editar, atribuir roles, gerenciar permissões.</p>
                          <p><strong>Roles:</strong> owner, manager, employee. Cada role tem permissões específicas.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Rotas Administrativas */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Shield className="h-5 w-5" />
                      Rotas Administrativas
                    </h3>
                    <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <p className="text-xs text-purple-800">
                        <strong>🔐 Proteção:</strong> Estas rotas utilizam <code>ProtectedRoute</code> e componentes específicos 
                        (<code>SuperAdminRoute</code>) para validação de permissões.
                      </p>
                    </div>
                    <div className="space-y-3">
                      <div className="p-4 bg-slate-50 rounded border-l-4 border-purple-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/super-admin</code>
                          <Badge variant="outline" className="text-xs bg-purple-100">Super Admin</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Painel do Super Administrador</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>SuperAdmin</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Alias:</strong> <code>/admin-dashboard</code> também funciona (redireciona internamente)</p>
                          <p><strong>Proteção:</strong> <code>SuperAdminRoute</code> verifica <code>is_super_admin = true</code> na tabela <code>admin_users</code>.</p>
                          <p><strong>Funcionalidade:</strong> Gestão completa do sistema: empresas, estabelecimentos, usuários, configurações globais.</p>
                          <p><strong>Permissões:</strong> Acesso total ao sistema, sem restrições de estabelecimento.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-purple-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/user-dashboard</code>
                          <Badge variant="outline" className="text-xs bg-purple-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Dashboard do Usuário</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>UserDashboard</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Hub central para usuários autenticados. Lista estabelecimentos disponíveis e permite seleção.</p>
                          <p><strong>Fluxo:</strong> Após selecionar estabelecimento, redireciona para <code>/:establishmentId</code>.</p>
                          <p><strong>Dados:</strong> Busca estabelecimentos vinculados via <code>user_companies</code> e <code>establishments</code>.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-purple-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/establishments</code>
                          <Badge variant="outline" className="text-xs bg-purple-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Gestão de Estabelecimentos</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>EstablishmentDashboard</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Gerenciamento de estabelecimentos para usuários com múltiplos estabelecimentos.</p>
                          <p><strong>Permissões:</strong> Usuários podem ver apenas estabelecimentos vinculados às suas empresas.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-purple-500">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-sm font-mono">/documentation</code>
                          <Badge variant="outline" className="text-xs bg-purple-100">Protegida</Badge>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 mb-1">Documentação do Sistema</p>
                        <p className="text-xs text-slate-600 mb-2">Componente: <code>Documentation</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Esta página! Documentação técnica completa de APIs, rotas, funcionalidades e integrações.</p>
                          <p><strong>Acesso:</strong> Requer autenticação de usuário admin/user.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Rotas Legadas e Redirecionamentos */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Route className="h-5 w-5" />
                      Rotas Legadas e Redirecionamentos
                    </h3>
                    <div className="mb-4 p-3 bg-slate-100 border border-slate-300 rounded-lg">
                      <p className="text-xs text-slate-700">
                        <strong>🔄 Redirecionamentos:</strong> Rotas legadas sem <code>:establishmentId</code> redirecionam automaticamente 
                        para <code>/user-dashboard</code> para manter compatibilidade com links antigos.
                      </p>
                    </div>
                    <div className="space-y-2 text-xs text-slate-600">
                      <p><code>/</code> → <code>/user-dashboard</code></p>
                      <p><code>/ocupacao</code> → <code>/user-dashboard</code></p>
                      <p><code>/occupancy-map</code> → <code>/user-dashboard</code></p>
                      <p><code>/reservas</code> → <code>/user-dashboard</code></p>
                      <p><code>/clientes</code> → <code>/user-dashboard</code></p>
                      <p><code>/unidades</code> → <code>/user-dashboard</code></p>
                      <p><code>/financeiro</code> → <code>/user-dashboard</code></p>
                      <p><code>/tarifario</code> → <code>/user-dashboard</code></p>
                      <p><code>/manutencao</code> → <code>/user-dashboard</code></p>
                      <p><code>/channel-manager</code> → <code>/user-dashboard</code></p>
                      <p><code>/configuracoes</code> → <code>/user-dashboard</code></p>
                      <p><code>/perfil</code> → <code>/user-dashboard</code></p>
                      <p><code>/funcionarios</code> → <code>/user-dashboard</code></p>
                    </div>
                    <div className="mt-4 p-3 bg-slate-50 rounded">
                      <p className="text-xs text-slate-700">
                        <strong>Nota Técnica:</strong> Redirecionamentos utilizam <code>Navigate</code> com <code>replace: true</code> 
                        para não adicionar entrada no histórico do navegador.
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Componentes de Proteção */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Componentes de Proteção de Rotas
                    </h3>
                    <div className="space-y-3">
                      <div className="p-4 bg-slate-50 rounded border-l-4 border-indigo-500">
                        <code className="text-sm font-mono">ProtectedRoute</code>
                        <p className="text-xs text-slate-600 mt-1 mb-2">Localização: <code>src/components/layout/ProtectedRoute.tsx</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Verifica se o usuário está autenticado via <code>useAuth()</code> hook.</p>
                          <p><strong>Comportamento:</strong> Se não autenticado, redireciona para <code>/login</code> salvando a rota original em <code>state.from</code>.</p>
                          <p><strong>Loading:</strong> Exibe spinner durante verificação de autenticação.</p>
                          <p><strong>Validação:</strong> Verifica sessão do Supabase Auth via <code>supabase.auth.getSession()</code>.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-indigo-500">
                        <code className="text-sm font-mono">EstablishmentRoute</code>
                        <p className="text-xs text-slate-600 mt-1 mb-2">Localização: <code>src/components/layout/EstablishmentRoute.tsx</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Valida acesso ao estabelecimento específico via <code>EstablishmentContext</code>.</p>
                          <p><strong>Parâmetros:</strong> Extrai <code>:establishmentId</code> da URL e converte para <code>numeric_id</code>.</p>
                          <p><strong>Validação:</strong> Verifica se o estabelecimento existe e está na lista de estabelecimentos do usuário.</p>
                          <p><strong>Comportamento:</strong> Se inválido, redireciona para <code>/user-dashboard</code>. Atualiza contexto global.</p>
                          <p><strong>Loading:</strong> Exibe spinner durante carregamento de estabelecimentos.</p>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-indigo-500">
                        <code className="text-sm font-mono">SuperAdminRoute</code>
                        <p className="text-xs text-slate-600 mt-1 mb-2">Localização: <code>src/components/layout/SuperAdminRoute.tsx</code></p>
                        <div className="text-xs text-slate-700 space-y-1">
                          <p><strong>Funcionalidade:</strong> Verifica se o usuário tem permissão de Super Admin.</p>
                          <p><strong>Validação:</strong> Consulta tabela <code>admin_users</code> verificando <code>is_super_admin = true</code>.</p>
                          <p><strong>Comportamento:</strong> Se não for Super Admin, redireciona para <code>/user-dashboard</code>.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* APIs */}
          <TabsContent value="apis" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Code className="h-6 w-6 text-primary" />
                APIs e Endpoints Técnicos
              </h2>
              
              {/* Documentação Técnica Online */}
              <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                <h3 className="font-semibold mb-2 text-blue-900 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Documentação Técnica Online
                </h3>
                <p className="text-sm text-blue-800 mb-3">
                  Acesse a documentação técnica completa em formato Swagger/OpenAPI e Postman Collection:
                </p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="p-3 bg-white rounded border">
                    <h4 className="font-semibold text-sm mb-1">OpenAPI/Swagger</h4>
                    <p className="text-xs text-slate-600 mb-2">
                      Especificação OpenAPI 3.0 completa com todos os endpoints, schemas e exemplos.
                    </p>
                    <code className="text-xs block bg-slate-100 p-1 rounded">docs/openapi.yaml</code>
                    <p className="text-xs text-slate-500 mt-1">
                      Importe no Swagger UI, Postman ou qualquer ferramenta compatível com OpenAPI.
                    </p>
                  </div>
                  <div className="p-3 bg-white rounded border">
                    <h4 className="font-semibold text-sm mb-1">Postman Collection</h4>
                    <p className="text-xs text-slate-600 mb-2">
                      Collection completa do Postman com todas as requisições pré-configuradas.
                    </p>
                    <code className="text-xs block bg-slate-100 p-1 rounded">docs/PMS_API.postman_collection.json</code>
                    <p className="text-xs text-slate-500 mt-1">
                      Importe diretamente no Postman para testar todos os endpoints.
                    </p>
                  </div>
                </div>
                <div className="mt-3 p-2 bg-blue-100 rounded text-xs text-blue-900">
                  <strong>💡 Dica:</strong> Consulte a aba "Swagger/Postman" para instruções detalhadas de uso.
                </div>
              </div>

              <div className="h-[600px] overflow-y-auto pr-4">
                <div className="space-y-6">
                  {/* Autenticação */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Autenticação
                    </h3>
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500 mb-4">
                      <h4 className="font-semibold mb-2">JWT Token (Supabase Auth)</h4>
                      <p className="text-sm text-slate-700 mb-3">
                        Todas as requisições à API REST do Supabase requerem um JWT token obtido através do Supabase Auth.
                      </p>
                      <div className="space-y-2 text-sm">
                        <div>
                          <strong>Como obter o token:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{AUTH_CODE_EXAMPLE}
                          </pre>
                        </div>
                        <div className="mt-3">
                          <strong>Validação:</strong>
                          <ul className="list-disc list-inside mt-1 text-xs text-slate-600">
                            <li>Token expira após 1 hora (padrão Supabase)</li>
                            <li>Token é automaticamente renovado pelo cliente Supabase</li>
                            <li>Token contém informações do usuário (user_id, email, etc.)</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Supabase REST API */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800">Supabase REST API</h3>
                    <p className="text-sm text-slate-600 mb-3">
                      API RESTful baseada em PostgREST. Suporta filtros, ordenação, paginação e relacionamentos.
                      Base URL: <code className="bg-slate-200 px-1 rounded">{"{SUPABASE_URL}/rest/v1"}</code>
                    </p>
                    
                    {/* GET */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-green-100">GET</Badge>
                        <code className="text-sm font-mono">{`/rest/v1/{table}`}</code>
                      </div>
                      <p className="text-sm text-slate-700 mb-2"><strong>Descrição:</strong> Buscar registros de uma tabela</p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Headers obrigatórios:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{HEADERS_EXAMPLE}
                          </pre>
                        </div>
                        <div>
                          <strong>Query Parameters (PostgREST):</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600">
                            <li><code>select</code>: Campos a retornar (ex: <code>select=id,name,email</code>)</li>
                            <li><code>filter</code>: Filtros (ex: <code>{`id=eq.{uuid}`}</code>, <code>status=in.(pending,confirmed)</code>)</li>
                            <li><code>order</code>: Ordenação (ex: <code>order=created_at.desc</code>)</li>
                            <li><code>limit</code>: Limite de registros (ex: <code>limit=10</code>)</li>
                            <li><code>offset</code>: Paginação (ex: <code>offset=20</code>)</li>
                          </ul>
                        </div>
                        <div>
                          <strong>Exemplo de requisição:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{GET_REQUEST_EXAMPLE}
                          </pre>
                        </div>
                        <div>
                          <strong>Códigos de resposta:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600">
                            <li><code>200 OK</code>: Sucesso</li>
                            <li><code>401 Unauthorized</code>: Token inválido ou expirado</li>
                            <li><code>403 Forbidden</code>: Sem permissão (RLS)</li>
                            <li><code>406 Not Acceptable</code>: Header Prefer não suportado</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* POST */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-blue-100">POST</Badge>
                        <code className="text-sm font-mono">{`/rest/v1/{table}`}</code>
                      </div>
                      <p className="text-sm text-slate-700 mb-2"><strong>Descrição:</strong> Criar novo registro</p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Headers obrigatórios:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{HEADERS_EXAMPLE}
                          </pre>
                        </div>
                        <div>
                          <strong>Body (JSON):</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{RESERVATION_BODY_EXAMPLE}
                          </pre>
                        </div>
                        <div>
                          <strong>Códigos de resposta:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600">
                            <li><code>201 Created</code>: Registro criado com sucesso</li>
                            <li><code>400 Bad Request</code>: Dados inválidos</li>
                            <li><code>401 Unauthorized</code>: Token inválido</li>
                            <li><code>409 Conflict</code>: Violação de constraint (ex: duplicata)</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* PATCH */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-yellow-500 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-yellow-100">PATCH</Badge>
                        <code className="text-sm font-mono">{`/rest/v1/{table}?{filter}`}</code>
                      </div>
                      <p className="text-sm text-slate-700 mb-2"><strong>Descrição:</strong> Atualizar registro(s)</p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Query Parameters:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600">
                            <li>Filtro obrigatório (ex: <code>{`id=eq.{uuid}`}</code>)</li>
                            <li>Pode atualizar múltiplos registros se o filtro corresponder</li>
                          </ul>
                        </div>
                        <div>
                          <strong>Exemplo:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{PATCH_REQUEST_EXAMPLE}
                          </pre>
                        </div>
                        <div>
                          <strong>Códigos de resposta:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600">
                            <li><code>200 OK</code>: Atualizado com sucesso</li>
                            <li><code>204 No Content</code>: Atualizado (sem retorno)</li>
                            <li><code>400 Bad Request</code>: Dados inválidos</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* DELETE */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-red-500 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-red-100">DELETE</Badge>
                        <code className="text-sm font-mono">{`/rest/v1/{table}?{filter}`}</code>
                      </div>
                      <p className="text-sm text-slate-700 mb-2"><strong>Descrição:</strong> Deletar registro(s)</p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Query Parameters:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600">
                            <li>Filtro obrigatório (ex: <code>{`id=eq.{uuid}`}</code>)</li>
                            <li>⚠️ Pode deletar múltiplos registros se o filtro corresponder</li>
                          </ul>
                        </div>
                        <div>
                          <strong>Exemplo:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{DELETE_REQUEST_EXAMPLE}
                          </pre>
                        </div>
                        <div>
                          <strong>Códigos de resposta:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600">
                            <li><code>200 OK</code>: Deletado com sucesso</li>
                            <li><code>204 No Content</code>: Deletado (sem retorno)</li>
                            <li><code>403 Forbidden</code>: Sem permissão (RLS ou constraint)</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Edge Functions */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800">Edge Functions (Supabase)</h3>
                    <p className="text-sm text-slate-600 mb-3">
                      Funções serverless Deno executadas no Supabase. Base URL: <code className="bg-slate-200 px-1 rounded">{`{SUPABASE_URL}/functions/v1`}</code>
                    </p>
                    
                    {/* send-email-resend */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-blue-100">POST</Badge>
                        <code className="text-sm font-mono">/functions/v1/send-email-resend</code>
                      </div>
                      <p className="text-sm text-slate-700 mb-2"><strong>Descrição:</strong> Enviar e-mail via Resend API</p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Autenticação:</strong>
                          <p className="text-slate-600 mt-1">
                            Requer JWT token no header <code>Authorization</code>. A API Key do Resend é armazenada
                            no servidor (Edge Function) e não é exposta ao cliente.
                          </p>
                        </div>
                        <div>
                          <strong>Headers:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{EDGE_FUNCTION_HEADERS}
                          </pre>
                        </div>
                        <div>
                          <strong>Request Body:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{RESEND_EMAIL_BODY}
                          </pre>
                        </div>
                        <div>
                          <strong>Response (200 OK):</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{RESEND_EMAIL_RESPONSE}
                          </pre>
                        </div>
                        <div>
                          <strong>Erros comuns:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600">
                            <li><code>400</code>: Dados inválidos ou domínio não verificado</li>
                            <li><code>401</code>: Token inválido</li>
                            <li><code>500</code>: Erro na API do Resend ou configuração incorreta</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* send-email-smtp */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-blue-100">POST</Badge>
                        <code className="text-sm font-mono">/functions/v1/send-email-smtp</code>
                      </div>
                      <p className="text-sm text-slate-700 mb-2"><strong>Descrição:</strong> Enviar e-mail via SMTP</p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Request Body:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{SMTP_BODY_EXAMPLE}
                          </pre>
                        </div>
                        <p className="text-slate-600">
                          <strong>Nota:</strong> As credenciais SMTP são enviadas no body, mas em produção devem
                          ser armazenadas no servidor (Edge Function) para segurança.
                        </p>
                      </div>
                    </div>

                    {/* stripe-payment */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-green-100">POST</Badge>
                        <code className="text-sm font-mono">/functions/v1/stripe-payment</code>
                      </div>
                      <p className="text-sm text-slate-700 mb-2"><strong>Descrição:</strong> Criar Payment Intent do Stripe</p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Autenticação:</strong>
                          <p className="text-slate-600 mt-1">
                            Pode ser chamada sem autenticação (anônima) ou com JWT. A chave secreta do Stripe
                            é armazenada no servidor e nunca exposta.
                          </p>
                        </div>
                        <div>
                          <strong>Request Body:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{STRIPE_PAYMENT_BODY}
                          </pre>
                        </div>
                        <div>
                          <strong>Response (200 OK):</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{STRIPE_PAYMENT_RESPONSE}
                          </pre>
                        </div>
                        <div>
                          <strong>Status do Payment Intent:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600">
                            <li><code>requires_payment_method</code>: Aguardando método de pagamento</li>
                            <li><code>requires_confirmation</code>: Requer confirmação</li>
                            <li><code>requires_action</code>: Requer ação do cliente (3D Secure)</li>
                            <li><code>processing</code>: Processando</li>
                            <li><code>succeeded</code>: Pagamento confirmado</li>
                            <li><code>canceled</code>: Cancelado</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    {/* stripe-payment-status */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-green-100">POST</Badge>
                        <code className="text-sm font-mono">/functions/v1/stripe-payment-status</code>
                      </div>
                      <p className="text-sm text-slate-700 mb-2"><strong>Descrição:</strong> Verificar status de um Payment Intent</p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Request Body:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{STRIPE_STATUS_BODY}
                          </pre>
                        </div>
                        <div>
                          <strong>Response:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{STRIPE_STATUS_RESPONSE}
                          </pre>
                        </div>
                      </div>
                    </div>

                    {/* stripe-refund */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-green-100">POST</Badge>
                        <code className="text-sm font-mono">/functions/v1/stripe-refund</code>
                      </div>
                      <p className="text-sm text-slate-700 mb-2"><strong>Descrição:</strong> Processar reembolso de um pagamento</p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Request Body:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{STRIPE_REFUND_BODY}
                          </pre>
                        </div>
                        <div>
                          <strong>Response:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{STRIPE_REFUND_RESPONSE}
                          </pre>
                        </div>
                      </div>
                    </div>

                    {/* stripe-webhook */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-purple-500 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-purple-100">POST</Badge>
                        <code className="text-sm font-mono">/functions/v1/stripe-webhook</code>
                      </div>
                      <p className="text-sm text-slate-700 mb-2"><strong>Descrição:</strong> Endpoint para receber webhooks do Stripe</p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Autenticação:</strong>
                          <p className="text-slate-600 mt-1">
                            Verifica assinatura do Stripe usando <code>stripe-signature</code> header.
                            Apenas requisições autenticadas pelo Stripe são processadas.
                          </p>
                        </div>
                        <div>
                          <strong>Headers (do Stripe):</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{`stripe-signature: t=timestamp,v1=signature
content-type: application/json`}
                          </pre>
                        </div>
                        <div>
                          <strong>Eventos processados:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600">
                            <li><code>payment_intent.succeeded</code>: Pagamento confirmado</li>
                            <li><code>payment_intent.payment_failed</code>: Falha no pagamento</li>
                            <li><code>charge.refunded</code>: Reembolso processado</li>
                          </ul>
                        </div>
                        <div>
                          <strong>Configuração no Stripe:</strong>
                          <p className="text-slate-600 mt-1">
                            Configure a URL do webhook no Stripe Dashboard: <code>{`{SUPABASE_URL}/functions/v1/stripe-webhook`}</code>
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* get-reservation */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-indigo-500 mb-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="bg-indigo-100">GET/POST</Badge>
                        <code className="text-sm font-mono">/functions/v1/get-reservation</code>
                      </div>
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Descrição:</strong> Buscar informações completas de reserva por identificador, localizador ou reservation_code
                      </p>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Autenticação:</strong>
                          <p className="text-slate-600 mt-1">
                            <strong>Obrigatória.</strong> Aceita:
                          </p>
                          <ul className="list-disc list-inside mt-1 text-slate-600 ml-2">
                            <li>Token de usuário admin/user (Bearer token no header Authorization)</li>
                            <li><code>guest_account_id</code> para hóspedes autenticados (no body ou query params)</li>
                          </ul>
                        </div>
                        <div>
                          <strong>Parâmetros de busca (pelo menos um obrigatório):</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600 ml-2">
                            <li><code>identifier</code>: identification_number da reserva</li>
                            <li><code>locator</code>: reservation_code ou locator do web_checkin</li>
                            <li><code>reservation_code</code>: reservation_code da reserva</li>
                          </ul>
                        </div>
                        <div>
                          <strong>Request Body (POST):</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{GET_RESERVATION_BODY}
                          </pre>
                        </div>
                        <div>
                          <strong>Query Parameters (GET):</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{`?identifier=123456&locator=RSV742516&guest_account_id=uuid`}
                          </pre>
                        </div>
                        <div>
                          <strong>Response (200 OK):</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{GET_RESERVATION_RESPONSE}
                          </pre>
                        </div>
                        <div>
                          <strong>Dados retornados:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600 ml-2">
                            <li>Informações básicas da reserva (código, datas, valores, status)</li>
                            <li>Dados do hóspede e responsável financeiro</li>
                            <li>Informações do quarto e categoria</li>
                            <li>Dados do estabelecimento</li>
                            <li>Histórico de pagamentos</li>
                            <li>Status do web check-in</li>
                          </ul>
                        </div>
                        <div>
                          <strong>Controle de acesso:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600 ml-2">
                            <li><strong>Usuários admin/user:</strong> Podem acessar todas as reservas</li>
                            <li><strong>Hóspedes:</strong> Podem acessar apenas reservas vinculadas à sua conta (guest_stay_history)</li>
                          </ul>
                        </div>
                        <div>
                          <strong>Erros comuns:</strong>
                          <ul className="list-disc list-inside mt-1 text-slate-600">
                            <li><code>400</code>: Identificador não fornecido</li>
                            <li><code>401</code>: Autenticação necessária</li>
                            <li><code>403</code>: Acesso negado (reserva não vinculada à conta do hóspede)</li>
                            <li><code>404</code>: Reserva não encontrada</li>
                            <li><code>500</code>: Erro interno do servidor</li>
                          </ul>
                        </div>
                        <div>
                          <strong>Exemplo de uso no frontend:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{`import { useReservationApi } from "@/hooks/useReservationApi";

const { useGetReservationByLocator } = useReservationApi();
const { data, isLoading, error } = useGetReservationByLocator("RSV742516");`}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Tabelas Principais */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800">Tabelas Principais e Relacionamentos</h3>
                    <p className="text-sm text-slate-600 mb-3">
                      O sistema utiliza relacionamentos (foreign keys) para conectar dados. Use a sintaxe PostgREST
                      para incluir dados relacionados nas queries.
                    </p>
                    
                    {/* Exemplo de relacionamento */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-indigo-500 mb-4">
                      <h4 className="font-semibold mb-2">Sintaxe de Relacionamentos (PostgREST)</h4>
                      <div className="space-y-2 text-xs">
                        <div>
                          <strong>Relacionamento simples:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{RELATIONSHIP_SIMPLE_EXAMPLE}
                          </pre>
                        </div>
                        <div>
                          <strong>Relacionamento aninhado:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{RELATIONSHIP_NESTED_EXAMPLE}
                          </pre>
                        </div>
                        <div>
                          <strong>Relacionamento reverso:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{RELATIONSHIP_REVERSE_EXAMPLE}
                          </pre>
                        </div>
                      </div>
                    </div>

                    {/* Tabelas com detalhes */}
                    <div className="space-y-3">
                      {[
                        {
                          name: "reservations",
                          description: "Armazena todas as reservas do sistema",
                          keyFields: ["id", "reservation_code", "identification_number", "establishment_id", "guest_id", "client_id", "room_id"],
                          relationships: [
                            "guest:clients!guest_id(*) - Dados do hóspede",
                            "financial_responsible:clients!client_id(*) - Responsável financeiro",
                            "rooms(*) - Quarto atribuído",
                            "room_categories(*) - Categoria do quarto",
                            "payments(*) - Pagamentos da reserva"
                          ]
                        },
                        {
                          name: "clients",
                          description: "Cadastro de clientes/hóspedes",
                          keyFields: ["id", "full_name", "email", "phone", "document_number", "document_type"],
                          relationships: [
                            "reservations!guest_id(*) - Reservas como hóspede",
                            "reservations!client_id(*) - Reservas como responsável financeiro"
                          ]
                        },
                        {
                          name: "rooms",
                          description: "Quartos/unidades disponíveis",
                          keyFields: ["id", "room_number", "name", "category_id", "establishment_id", "status"],
                          relationships: [
                            "room_categories(*) - Categoria do quarto",
                            "reservations(*) - Reservas do quarto",
                            "maintenance_tickets(*) - Chamados de manutenção"
                          ]
                        },
                        {
                          name: "payments",
                          description: "Registros de pagamentos",
                          keyFields: ["id", "reservation_id", "amount", "payment_method", "payment_date", "status"],
                          relationships: [
                            "reservations(*) - Reserva relacionada"
                          ]
                        }
                      ].map((table) => (
                        <div key={table.name} className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                          <div className="flex items-center gap-2 mb-2">
                            <code className="font-mono font-semibold">{table.name}</code>
                            <Badge variant="outline">Tabela</Badge>
                          </div>
                          <p className="text-sm text-slate-700 mb-2">{table.description}</p>
                          <div className="space-y-2 text-xs">
                            <div>
                              <strong>Campos principais:</strong>
                              <code className="ml-2 text-slate-600">{table.keyFields.join(", ")}</code>
                            </div>
                            <div>
                              <strong>Relacionamentos disponíveis:</strong>
                              <ul className="list-disc list-inside mt-1 text-slate-600">
                                {table.relationships.map((rel, idx) => (
                                  <li key={idx}><code className="text-xs">{rel}</code></li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Exemplos de queries complexas */}
                    <div className="p-4 bg-slate-50 rounded border-l-4 border-purple-500 mt-4">
                      <h4 className="font-semibold mb-2">Exemplos de Queries Complexas</h4>
                      <div className="space-y-3 text-xs">
                        <div>
                          <strong>1. Reservas com todos os dados relacionados:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{COMPLEX_QUERY_1}
                          </pre>
                        </div>
                        <div>
                          <strong>2. Clientes com histórico de reservas:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{COMPLEX_QUERY_2}
                          </pre>
                        </div>
                        <div>
                          <strong>3. Quartos disponíveis em uma data:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{COMPLEX_QUERY_3}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Swagger/Postman */}
          <TabsContent value="swagger" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                Documentação Técnica Online - Swagger e Postman
              </h2>
              <div className="h-[600px] overflow-y-auto pr-4">
                <div className="space-y-6">
                  {/* Introdução */}
                  <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                    <h3 className="font-semibold mb-2 text-blue-900">📚 Documentação Técnica Completa</h3>
                    <p className="text-sm text-blue-800 mb-3">
                      O sistema fornece documentação técnica completa em formatos padrão da indústria para facilitar
                      a integração e testes da API.
                    </p>
                    <div className="grid md:grid-cols-2 gap-3 mt-3">
                      <div className="p-3 bg-white rounded">
                        <h4 className="font-semibold text-sm mb-1 flex items-center gap-2">
                          <Code className="h-4 w-4" />
                          OpenAPI/Swagger
                        </h4>
                        <p className="text-xs text-slate-600">
                          Especificação OpenAPI 3.0.3 completa com todos os endpoints, schemas, exemplos de requests/responses
                          e documentação de autenticação.
                        </p>
                      </div>
                      <div className="p-3 bg-white rounded">
                        <h4 className="font-semibold text-sm mb-1 flex items-center gap-2">
                          <Globe className="h-4 w-4" />
                          Postman Collection
                        </h4>
                        <p className="text-xs text-slate-600">
                          Collection completa do Postman com todas as requisições pré-configuradas, variáveis de ambiente
                          e exemplos prontos para uso.
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* OpenAPI/Swagger */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Code className="h-5 w-5" />
                      OpenAPI/Swagger Specification
                    </h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <h4 className="font-semibold mb-2">Arquivo</h4>
                        <code className="text-sm bg-slate-200 px-2 py-1 rounded block mb-2">docs/openapi.yaml</code>
                        <p className="text-sm text-slate-700 mb-3">
                          Especificação OpenAPI 3.0.3 completa seguindo os padrões da indústria.
                        </p>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Como usar</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <strong>1. Swagger UI (Online):</strong>
                            <ul className="list-disc list-inside mt-1 text-slate-600 ml-4">
                              <li>Acesse <a href="https://editor.swagger.io" target="_blank" rel="noopener noreferrer" className="underline text-blue-600">editor.swagger.io</a></li>
                              <li>Clique em "File" → "Import file"</li>
                              <li>Selecione o arquivo <code>docs/openapi.yaml</code></li>
                              <li>Visualize e teste todos os endpoints interativamente</li>
                            </ul>
                          </div>
                          <div>
                            <strong>2. Swagger UI (Local):</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`# Instalar Swagger UI
npm install -g swagger-ui-serve

# Executar
swagger-ui-serve docs/openapi.yaml`}
                            </pre>
                          </div>
                          <div>
                            <strong>3. Postman:</strong>
                            <ul className="list-disc list-inside mt-1 text-slate-600 ml-4">
                              <li>Abra o Postman</li>
                              <li>Clique em "Import"</li>
                              <li>Selecione "File" e escolha <code>docs/openapi.yaml</code></li>
                              <li>Postman criará automaticamente uma collection baseada na especificação</li>
                            </ul>
                          </div>
                          <div>
                            <strong>4. Outras ferramentas:</strong>
                            <ul className="list-disc list-inside mt-1 text-slate-600 ml-4">
                              <li>Insomnia: Import → OpenAPI</li>
                              <li>VS Code: Extensão "OpenAPI (Swagger) Editor"</li>
                              <li>Redoc: Gera documentação HTML a partir do YAML</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Conteúdo da especificação</h4>
                        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                          <li>✅ Todos os endpoints documentados (GET, POST, PATCH, DELETE)</li>
                          <li>✅ Schemas completos de request e response</li>
                          <li>✅ Exemplos de requests e responses para cada endpoint</li>
                          <li>✅ Documentação completa de autenticação (JWT e Guest Account)</li>
                          <li>✅ Códigos de status HTTP e mensagens de erro</li>
                          <li>✅ Parâmetros de query, path e body documentados</li>
                          <li>✅ Tags organizadas por categoria (Reservations, Email, Payments, etc.)</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Postman Collection */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Postman Collection
                    </h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded border-l-4 border-orange-500">
                        <h4 className="font-semibold mb-2">Arquivo</h4>
                        <code className="text-sm bg-slate-200 px-2 py-1 rounded block mb-2">docs/PMS_API.postman_collection.json</code>
                        <p className="text-sm text-slate-700 mb-3">
                          Collection completa do Postman com todas as requisições pré-configuradas e prontas para uso.
                        </p>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Como importar</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <strong>1. Importar Collection:</strong>
                            <ul className="list-disc list-inside mt-1 text-slate-600 ml-4">
                              <li>Abra o Postman</li>
                              <li>Clique em "Import" no canto superior esquerdo</li>
                              <li>Selecione "File" e escolha <code>docs/PMS_API.postman_collection.json</code></li>
                              <li>A collection será importada com todas as requisições organizadas</li>
                            </ul>
                          </div>
                          <div>
                            <strong>2. Configurar variáveis de ambiente:</strong>
                            <p className="text-slate-600 mt-1 mb-2">
                              A collection inclui variáveis que precisam ser configuradas:
                            </p>
                            <ul className="list-disc list-inside text-slate-600 ml-4 space-y-1">
                              <li><code>supabase_url</code>: URL do seu projeto Supabase</li>
                              <li><code>supabase_anon_key</code>: Chave anônima do Supabase</li>
                              <li><code>jwt_token</code>: Token JWT (preenchido automaticamente após login)</li>
                              <li><code>guest_account_id</code>: ID da conta do hóspede (opcional)</li>
                            </ul>
                            <p className="text-slate-600 mt-2">
                              Para configurar, clique com botão direito na collection → "Edit" → aba "Variables"
                            </p>
                          </div>
                          <div>
                            <strong>3. Obter JWT Token:</strong>
                            <p className="text-slate-600 mt-1 mb-2">
                              Use a requisição "Get JWT Token (Login)" na pasta "Authentication". O token será
                              automaticamente salvo na variável <code>jwt_token</code>.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Estrutura da Collection</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <strong>📁 Authentication</strong>
                            <ul className="list-disc list-inside text-slate-600 ml-4">
                              <li>Get JWT Token (Login) - Obtém token JWT via Supabase Auth</li>
                            </ul>
                          </div>
                          <div>
                            <strong>📁 Reservations</strong>
                            <ul className="list-disc list-inside text-slate-600 ml-4">
                              <li>Get Reservation (GET) - Busca reserva via GET</li>
                              <li>Get Reservation (POST) - Busca reserva via POST</li>
                              <li>List Reservations (REST API) - Lista reservas via REST API</li>
                            </ul>
                          </div>
                          <div>
                            <strong>📁 Email</strong>
                            <ul className="list-disc list-inside text-slate-600 ml-4">
                              <li>Send Email (Resend) - Envia email via Resend API</li>
                              <li>Send Email (SMTP) - Envia email via SMTP</li>
                            </ul>
                          </div>
                          <div>
                            <strong>📁 Payments (Stripe)</strong>
                            <ul className="list-disc list-inside text-slate-600 ml-4">
                              <li>Create Payment Intent - Cria intenção de pagamento</li>
                              <li>Get Payment Status - Verifica status de pagamento</li>
                              <li>Process Refund - Processa reembolso</li>
                              <li>Stripe Webhook - Endpoint para webhooks</li>
                            </ul>
                          </div>
                          <div>
                            <strong>📁 Web Check-in</strong>
                            <ul className="list-disc list-inside text-slate-600 ml-4">
                              <li>Get Web Check-in by Locator - Busca web check-in por localizador</li>
                              <li>Create Web Check-in - Cria novo web check-in</li>
                              <li>Update Web Check-in Status - Atualiza status do web check-in</li>
                              <li>List Web Check-in Guests - Lista hóspedes do web check-in</li>
                              <li>Add Web Check-in Guests - Adiciona hóspedes ao web check-in</li>
                              <li>List Web Check-in Documents - Lista documentos do web check-in</li>
                              <li>Add Web Check-in Documents - Adiciona documentos ao web check-in</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Web Check-in */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Web Check-in - Documentação Completa
                    </h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Visão Geral</h4>
                        <p className="text-sm text-slate-700 mb-3">
                          O sistema de Web Check-in permite que hóspedes realizem o check-in online antes da chegada,
                          preenchendo dados pessoais, documentos e preferências através de uma interface web.
                        </p>
                        <div className="space-y-2 text-sm">
                          <div>
                            <strong>Fluxo do Web Check-in:</strong>
                            <ol className="list-decimal list-inside text-slate-600 ml-4 mt-1 space-y-1">
                              <li>Hóspede recebe link ou localizador do web check-in</li>
                              <li>Acessa a página de web check-in com o localizador</li>
                              <li>Verifica dados da reserva</li>
                              <li>Preenche dados dos hóspedes (nome, CPF, documentos, etc.)</li>
                              <li>Faz upload de documentos (RG, CPF, selfie)</li>
                              <li>Confirma e completa o check-in</li>
                            </ol>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Endpoints Disponíveis</h4>
                        <div className="space-y-3 text-sm">
                          <div className="p-3 bg-white rounded border-l-4 border-blue-500">
                            <h5 className="font-semibold text-sm mb-1">GET /rest/v1/web_checkin</h5>
                            <p className="text-xs text-slate-600 mb-2">
                              Busca informações de web check-in por locator, token ou reservation_id.
                            </p>
                            <div className="text-xs">
                              <strong>Parâmetros:</strong>
                              <ul className="list-disc list-inside text-slate-600 ml-4 mt-1">
                                <li><code>locator</code> - Localizador do web check-in</li>
                                <li><code>token</code> - Token do web check-in</li>
                                <li><code>reservation_id</code> - ID da reserva</li>
                              </ul>
                            </div>
                          </div>

                          <div className="p-3 bg-white rounded border-l-4 border-green-500">
                            <h5 className="font-semibold text-sm mb-1">POST /rest/v1/web_checkin</h5>
                            <p className="text-xs text-slate-600 mb-2">
                              Cria um novo web check-in para uma reserva.
                            </p>
                            <div className="text-xs">
                              <strong>Body:</strong>
                              <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{`{
  "reservation_id": "uuid",
  "establishment_id": "uuid",
  "locator": "RSV742516",
  "expires_at": "2024-01-20T12:00:00Z"
}`}
                              </pre>
                            </div>
                          </div>

                          <div className="p-3 bg-white rounded border-l-4 border-yellow-500">
                            <h5 className="font-semibold text-sm mb-1">PATCH /rest/v1/web_checkin</h5>
                            <p className="text-xs text-slate-600 mb-2">
                              Atualiza informações do web check-in (status, dados dos hóspedes, etc.).
                            </p>
                            <div className="text-xs">
                              <strong>Status possíveis:</strong>
                              <ul className="list-disc list-inside text-slate-600 ml-4 mt-1">
                                <li><code>pending</code> - Aguardando início</li>
                                <li><code>in_progress</code> - Em andamento</li>
                                <li><code>completed</code> - Concluído</li>
                                <li><code>expired</code> - Expirado</li>
                                <li><code>cancelled</code> - Cancelado</li>
                              </ul>
                            </div>
                          </div>

                          <div className="p-3 bg-white rounded border-l-4 border-purple-500">
                            <h5 className="font-semibold text-sm mb-1">GET /rest/v1/web_checkin_guests</h5>
                            <p className="text-xs text-slate-600 mb-2">
                              Lista hóspedes associados a um web check-in.
                            </p>
                            <div className="text-xs">
                              <strong>Parâmetros:</strong>
                              <ul className="list-disc list-inside text-slate-600 ml-4 mt-1">
                                <li><code>web_checkin_id</code> - ID do web check-in (obrigatório)</li>
                              </ul>
                            </div>
                          </div>

                          <div className="p-3 bg-white rounded border-l-4 border-indigo-500">
                            <h5 className="font-semibold text-sm mb-1">POST /rest/v1/web_checkin_guests</h5>
                            <p className="text-xs text-slate-600 mb-2">
                              Adiciona ou atualiza hóspedes de um web check-in.
                            </p>
                            <div className="text-xs">
                              <strong>Body (array):</strong>
                              <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{`[
  {
    "web_checkin_id": "uuid",
    "name": "João Silva",
    "email": "joao@example.com",
    "phone": "+5511999999999",
    "cpf": "12345678900",
    "birth_date": "1990-01-01",
    "is_main_guest": true,
    "order": 0
  }
]`}
                              </pre>
                            </div>
                          </div>

                          <div className="p-3 bg-white rounded border-l-4 border-pink-500">
                            <h5 className="font-semibold text-sm mb-1">GET /rest/v1/web_checkin_documents</h5>
                            <p className="text-xs text-slate-600 mb-2">
                              Lista documentos associados a um web check-in.
                            </p>
                          </div>

                          <div className="p-3 bg-white rounded border-l-4 border-red-500">
                            <h5 className="font-semibold text-sm mb-1">POST /rest/v1/web_checkin_documents</h5>
                            <p className="text-xs text-slate-600 mb-2">
                              Adiciona ou atualiza documentos de um web check-in.
                            </p>
                            <div className="text-xs">
                              <strong>Body (array):</strong>
                              <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{`[
  {
    "web_checkin_id": "uuid",
    "guest_name": "João Silva",
    "document_type": "cpf",
    "document_number": "12345678900",
    "document_front_url": "https://example.com/doc-front.jpg",
    "document_back_url": "https://example.com/doc-back.jpg",
    "selfie_url": "https://example.com/selfie.jpg",
    "is_main_guest": true,
    "order": 0
  }
]`}
                              </pre>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Autenticação para Web Check-in</h4>
                        <div className="space-y-2 text-sm">
                          <p className="text-slate-700">
                            O web check-in pode ser acessado de duas formas:
                          </p>
                          <div className="p-2 bg-white rounded">
                            <strong>1. Sem autenticação (público):</strong>
                            <p className="text-xs text-slate-600 mt-1">
                              Hóspede acessa com localizador. Pode visualizar dados básicos da reserva.
                            </p>
                          </div>
                          <div className="p-2 bg-white rounded">
                            <strong>2. Com autenticação (guest_account_id):</strong>
                            <p className="text-xs text-slate-600 mt-1">
                              Hóspede autenticado pode acessar dados completos e realizar operações de atualização.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Exemplos de Uso</h4>
                        <div className="space-y-3 text-sm">
                          <div>
                            <strong>Buscar web check-in por localizador:</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`GET /rest/v1/web_checkin?locator=RSV742516&select=*
Headers:
  apikey: {supabase_anon_key}`}
                            </pre>
                          </div>
                          <div>
                            <strong>Atualizar status para "in_progress":</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`PATCH /rest/v1/web_checkin?id=eq.{uuid}
Headers:
  Authorization: Bearer {jwt_token}
  apikey: {supabase_anon_key}
  Content-Type: application/json

Body:
{
  "status": "in_progress",
  "started_at": "2024-01-15T14:00:00Z"
}`}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Autenticação Detalhada */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Processo de Autenticação - Guia Completo
                    </h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Tipos de Autenticação</h4>
                        <div className="space-y-3">
                          <div className="p-3 bg-white rounded border-l-4 border-blue-500">
                            <h5 className="font-semibold text-sm mb-1">1. JWT Token (Supabase Auth)</h5>
                            <p className="text-xs text-slate-600 mb-2">
                              Para usuários admin/user. Token obtido via Supabase Auth.
                            </p>
                            <div className="text-xs">
                              <strong>Como obter:</strong>
                              <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{`// No frontend (React/TypeScript)
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;

// Headers para requisições
const headers = {
  "Authorization": "Bearer " + token,
  "apikey": "VITE_SUPABASE_PUBLISHABLE_KEY",
  "Content-Type": "application/json"
}`}
                              </pre>
                            </div>
                            <div className="text-xs mt-2">
                              <strong>Validação:</strong>
                              <ul className="list-disc list-inside text-slate-600 ml-4">
                                <li>Token expira após 1 hora (padrão Supabase)</li>
                                <li>Token é automaticamente renovado pelo cliente Supabase</li>
                                <li>Token contém informações do usuário (user_id, email, role)</li>
                              </ul>
                            </div>
                          </div>

                          <div className="p-3 bg-white rounded border-l-4 border-green-500">
                            <h5 className="font-semibold text-sm mb-1">2. Guest Account ID</h5>
                            <p className="text-xs text-slate-600 mb-2">
                              Para hóspedes autenticados. ID da conta do hóspede armazenado no localStorage.
                            </p>
                            <div className="text-xs">
                              <strong>Como obter:</strong>
                              <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{`// No frontend
const guestAccountId = localStorage.getItem("guest_account_id");

// Enviar no body (POST) ou query params (GET)
{
  "guest_account_id": guestAccountId,
  "locator": "RSV742516"
}`}
                              </pre>
                            </div>
                            <div className="text-xs mt-2">
                              <strong>Permissões:</strong>
                              <ul className="list-disc list-inside text-slate-600 ml-4">
                                <li>Acesso apenas a reservas vinculadas à conta (guest_stay_history)</li>
                                <li>Operações limitadas ao próprio perfil</li>
                                <li>Web check-in para suas reservas</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Fluxo de Autenticação Completo</h4>
                        <div className="space-y-2 text-sm">
                          <div className="p-2 bg-white rounded">
                            <strong>Para Usuários Admin/User:</strong>
                            <ol className="list-decimal list-inside text-slate-600 ml-4 mt-1 space-y-1">
                              <li>Usuário faz login via Supabase Auth (email/senha, OAuth, etc.)</li>
                              <li>Supabase retorna JWT token no campo <code>access_token</code></li>
                              <li>Token é armazenado automaticamente pelo cliente Supabase</li>
                              <li>Token é incluído no header <code>Authorization: Bearer {"{token}"}</code> em todas as requisições</li>
                              <li>Edge Functions validam o token e extraem informações do usuário</li>
                              <li>RLS (Row Level Security) no banco valida permissões baseadas no user_id</li>
                            </ol>
                          </div>
                          <div className="p-2 bg-white rounded">
                            <strong>Para Hóspedes:</strong>
                            <ol className="list-decimal list-inside text-slate-600 ml-4 mt-1 space-y-1">
                              <li>Hóspede acessa web check-in com localizador</li>
                              <li>Sistema cria ou recupera guest_account vinculado ao localizador</li>
                              <li>guest_account_id é armazenado no localStorage</li>
                              <li>guest_account_id é enviado nas requisições (body ou query params)</li>
                              <li>Edge Functions validam se a reserva está vinculada ao guest_account</li>
                              <li>RLS no banco garante que hóspede só acessa suas próprias reservas</li>
                            </ol>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Exemplos de Requisições com Autenticação</h4>
                        <div className="space-y-3 text-sm">
                          <div>
                            <strong>Com JWT Token (cURL):</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`curl -X GET "https://your-project.supabase.co/functions/v1/get-reservation?locator=RSV742516" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\
  -H "apikey: YOUR_SUPABASE_ANON_KEY"`}
                            </pre>
                          </div>
                          <div>
                            <strong>Com Guest Account ID (cURL):</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`curl -X POST "https://your-project.supabase.co/functions/v1/get-reservation" \\
  -H "Content-Type: application/json" \\
  -H "apikey: YOUR_SUPABASE_ANON_KEY" \\
  -d '{
    "locator": "RSV742516",
    "guest_account_id": "550e8400-e29b-41d4-a716-446655440000"
  }'`}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Exemplos de Requests e Responses */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Code className="h-5 w-5" />
                      Exemplos de Requests e Responses
                    </h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Get Reservation - Request</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <strong>GET:</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`GET /functions/v1/get-reservation?locator=RSV742516
Headers:
  Authorization: Bearer {jwt_token}
  apikey: {supabase_anon_key}`}
                            </pre>
                          </div>
                          <div>
                            <strong>POST:</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`POST /functions/v1/get-reservation
Headers:
  Authorization: Bearer {jwt_token}
  apikey: {supabase_anon_key}
  Content-Type: application/json

Body:
{
  "locator": "RSV742516"
}`}
                            </pre>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Get Reservation - Response (200 OK)</h4>
                        <pre className="p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`{
  "success": true,
  "reservation": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "reservation_code": "RSV742516",
    "identification_number": "123456",
    "checkin_date": "2024-01-15",
    "checkout_date": "2024-01-20",
    "status": "confirmed",
    "total_amount": 1000.00,
    "paid_amount": 500.00,
    "payment_status": "partial",
    "guest": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "full_name": "João Silva",
      "email": "joao@example.com",
      "phone": "+5511999999999",
      "document_number": "12345678900"
    },
    "room": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "room_number": "101",
      "name": "Quarto 101"
    },
    "payments": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "amount": 500.00,
        "payment_date": "2024-01-10",
        "payment_method": "credit_card"
      }
    ]
  }
}`}
                        </pre>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Erros Comuns</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <strong>401 Unauthorized:</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`{
  "error": "Authentication required",
  "message": "Autenticação necessária. Forneça um token de usuário ou guest_account_id"
}`}
                            </pre>
                          </div>
                          <div>
                            <strong>403 Forbidden:</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`{
  "error": "Access denied",
  "message": "Você não tem permissão para acessar esta reserva"
}`}
                            </pre>
                          </div>
                          <div>
                            <strong>404 Not Found:</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`{
  "error": "Reservation not found",
  "message": "Reserva não encontrada com os identificadores fornecidos"
}`}
                            </pre>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Estabilidade e Monitoramento */}
          <TabsContent value="stability" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                Estabilidade e Monitoramento
              </h2>
              <div className="h-[600px] overflow-y-auto pr-4">
                <div className="space-y-6">
                  {/* Introdução */}
                  <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                    <h3 className="font-semibold mb-2 text-blue-900">🎯 Objetivos de Estabilidade</h3>
                    <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
                      <li><strong>Uptime de 99%</strong>: Sistema disponível 99% do tempo</li>
                      <li><strong>Log de Erros</strong>: Todos os erros registrados de forma estruturada</li>
                      <li><strong>Observabilidade</strong>: Monitoramento contínuo do sistema</li>
                      <li><strong>Proteção contra Overbooking</strong>: Locks garantem disponibilidade correta</li>
                    </ul>
                  </div>

                  <Separator />

                  {/* Sistema de Logging */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Sistema de Logging de Erros
                    </h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Funcionalidades</h4>
                        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                          <li>✅ Logging estruturado com severidade (low, medium, high, critical)</li>
                          <li>✅ Armazenamento no banco de dados (tabela <code>error_logs</code>)</li>
                          <li>✅ Metadata contextual para debugging</li>
                          <li>✅ Stack traces para erros críticos</li>
                          <li>✅ Integração automática com ErrorBoundary</li>
                        </ul>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Uso</h4>
                        <pre className="p-2 bg-slate-100 rounded text-xs overflow-x-auto">
{`import { logError } from "@/lib/errorLogger";

await logError({
  error: new Error("Mensagem de erro"),
  context: "nome-do-contexto",
  severity: "high",
  metadata: { dados_adicionais: "valor" },
});`}
                        </pre>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Sistema de Monitoramento */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      Sistema de Monitoramento
                    </h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Health Check</h4>
                        <p className="text-sm text-slate-700 mb-2">
                          Verifica a saúde do sistema (database, storage, API).
                        </p>
                        <div className="space-y-2 text-sm">
                          <div>
                            <strong>Endpoint:</strong>
                            <code className="ml-2 text-xs bg-slate-200 px-1 rounded">/functions/v1/health-check</code>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Monitoramento Periódico</h4>
                        <p className="text-sm text-slate-700 mb-2">
                          O sistema inicia monitoramento automático ao carregar a aplicação.
                        </p>
                        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                          <li>Verifica saúde do sistema a cada 5 minutos</li>
                          <li>Gera alertas automáticos para problemas críticos</li>
                          <li>Coleta métricas de performance</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Proteção contra Overbooking */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800 flex items-center gap-2">
                      <Lock className="h-5 w-5" />
                      Proteção contra Overbooking
                    </h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Solução: Validação em Duas Camadas</h4>
                        <div className="space-y-3 text-sm">
                          <div className="p-3 bg-white rounded border-l-4 border-green-500">
                            <strong>1. Validação Inicial (Frontend)</strong>
                            <p className="text-xs text-slate-600 mt-1">
                              Validação rápida antes de tentar criar a reserva.
                            </p>
                          </div>

                          <div className="p-3 bg-white rounded border-l-4 border-blue-500">
                            <strong>2. Criação com Lock (Backend)</strong>
                            <p className="text-xs text-slate-600 mt-1">
                              Validação atômica com lock exclusivo.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded">
                        <h4 className="font-semibold mb-2">Garantias</h4>
                        <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                          <li>✅ <strong>Não há overbooking</strong>: Lock garante que apenas uma reserva é criada por vez</li>
                          <li>✅ <strong>Disponibilidade correta</strong>: Validação atômica garante disponibilidade sempre correta</li>
                          <li>✅ <strong>Retry automático</strong>: Sistema sugere retry quando lock não está disponível</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Documentação Completa */}
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold mb-2 text-blue-900">📚 Documentação Completa</h4>
                    <p className="text-sm text-blue-800 mb-2">
                      Para mais detalhes, consulte:
                    </p>
                    <code className="text-xs block bg-blue-100 p-2 rounded">docs/STABILITY_AND_MONITORING.md</code>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Funcionalidades */}
          <TabsContent value="features" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Zap className="h-6 w-6 text-primary" />
                Funcionalidades do Sistema
              </h2>
              <div className="h-[600px] overflow-y-auto pr-4">
                <div className="space-y-4">
                  {/* Gestão de Reservas */}
                  <Collapsible 
                    className="border rounded-lg"
                    open={openSections.reservations}
                    onOpenChange={(open) => setOpenSections(prev => ({ ...prev, reservations: open }))}
                  >
                    <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold text-slate-800">Gestão de Reservas</h3>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${openSections.reservations ? 'rotate-90' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4">
                      <div className="space-y-4 text-sm text-slate-700">
                        <div>
                          <h4 className="font-semibold mb-2 text-slate-800">Funcionalidades Principais:</h4>
                          <ul className="space-y-1 list-disc list-inside">
                            <li><strong>Criar Reservas:</strong> Criação manual ou importação de OTAs, com validação de disponibilidade em tempo real</li>
                            <li><strong>Editar Reservas:</strong> Atualização de datas, hóspedes, valores e informações adicionais</li>
                            <li><strong>Cancelar Reservas:</strong> Cancelamento com registro de motivo e impacto financeiro</li>
                            <li><strong>Trocar Reservas:</strong> Transferência de reserva entre quartos/categorias mantendo dados do hóspede</li>
                            <li><strong>Check-in e Check-out:</strong> Processo completo com atualização de status e registro de horários</li>
                            <li><strong>Extensão de Reservas:</strong> Prolongamento de estadia com recálculo automático de valores</li>
                            <li><strong>Mapa de Ocupação:</strong> Visualização gráfica de ocupação por data e quarto</li>
                            <li><strong>Filtros Avançados:</strong> Busca por data, status, hóspede, código, identificação, quarto, categoria</li>
                            <li><strong>Histórico de Atividades:</strong> Log completo de todas as ações realizadas na reserva</li>
                            <li><strong>Número de Identificação:</strong> Identificador único sequencial (#123456) para cada reserva</li>
                            <li><strong>Pré-registros:</strong> Gestão de reservas pendentes de confirmação</li>
                            <li><strong>Overbooking:</strong> Detecção e alertas de sobre-reservas</li>
                          </ul>
                        </div>
                        <div className="p-3 bg-blue-50 rounded border border-blue-200">
                          <h4 className="font-semibold mb-2 text-blue-900">Trocar Reservas - Detalhes Técnicos:</h4>
                          <ul className="space-y-1 text-xs text-blue-800">
                            <li><strong>Endpoint:</strong> <code>PATCH /rest/v1/reservations?id=eq.{`{uuid}`}</code></li>
                            <li><strong>Campos alteráveis:</strong> <code>room_id</code>, <code>category_id</code></li>
                            <li><strong>Validação:</strong> Verifica disponibilidade do novo quarto/categoria nas datas da reserva</li>
                            <li><strong>Impacto:</strong> Recalcula valores se a categoria tiver tarifa diferente</li>
                            <li><strong>Registro:</strong> Cria log de atividade com tipo "reservation.swapped"</li>
                            <li><strong>Notificação:</strong> Envia email ao hóspede se configurado</li>
                          </ul>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                          <h4 className="font-semibold mb-2 text-slate-800">Status de Reservas:</h4>
                          <div className="grid md:grid-cols-2 gap-2 text-xs">
                            <div><code className="bg-slate-200 px-1 rounded">pending</code> - Pendente</div>
                            <div><code className="bg-slate-200 px-1 rounded">preregistration</code> - Pré-registro</div>
                            <div><code className="bg-slate-200 px-1 rounded">confirmed</code> - Confirmada</div>
                            <div><code className="bg-slate-200 px-1 rounded">checked_in</code> - Check-in realizado</div>
                            <div><code className="bg-slate-200 px-1 rounded">checked_out</code> - Check-out realizado</div>
                            <div><code className="bg-slate-200 px-1 rounded">cancelled</code> - Cancelada</div>
                            <div><code className="bg-slate-200 px-1 rounded">blocked</code> - Bloqueada</div>
                            <div><code className="bg-slate-200 px-1 rounded">unpaid</code> - Não paga</div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Gestão de Clientes */}
                  <Collapsible 
                    className="border rounded-lg"
                    open={openSections.clients}
                    onOpenChange={(open) => setOpenSections(prev => ({ ...prev, clients: open }))}
                  >
                    <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold text-slate-800">Gestão de Clientes</h3>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${openSections.clients ? 'rotate-90' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4">
                      <div className="space-y-4 text-sm text-slate-700">
                        <div>
                          <h4 className="font-semibold mb-2 text-slate-800">Funcionalidades Principais:</h4>
                          <ul className="space-y-1 list-disc list-inside">
                            <li><strong>Cadastro Completo:</strong> Dados pessoais, contato, documentos, endereço completo</li>
                            <li><strong>Pessoa Física:</strong> CPF, nome completo, data de nascimento, RG</li>
                            <li><strong>Pessoa Jurídica:</strong> CNPJ, razão social, nome fantasia, inscrição estadual</li>
                            <li><strong>Histórico de Hospedagens:</strong> Visualização de todas as reservas do cliente</li>
                            <li><strong>Centralização de Dados:</strong> Detecção e merge de registros duplicados</li>
                            <li><strong>Informações de Contato:</strong> Email, telefone, WhatsApp, endereço completo</li>
                            <li><strong>Documentos:</strong> Upload e armazenamento de documentos (RG, CPF, CNH, etc.)</li>
                            <li><strong>Preferências:</strong> Registro de preferências do cliente (quarto, andar, etc.)</li>
                            <li><strong>Observações:</strong> Campo livre para anotações sobre o cliente</li>
                            <li><strong>Busca Avançada:</strong> Filtro por nome, email, CPF/CNPJ, telefone</li>
                          </ul>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                          <h4 className="font-semibold mb-2 text-slate-800">Estrutura de Dados:</h4>
                          <div className="text-xs space-y-1">
                            <div><strong>Tabela:</strong> <code>clients</code></div>
                            <div><strong>Campos principais:</strong> <code>id, full_name, email, phone, document_number, document_type, address, city, state, zip_code</code></div>
                            <div><strong>Relacionamentos:</strong> <code>reservations!guest_id(*)</code> - Reservas como hóspede</div>
                            <div><strong>Relacionamentos:</strong> <code>reservations!client_id(*)</code> - Reservas como responsável financeiro</div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Gestão Financeira */}
                  <Collapsible 
                    className="border rounded-lg"
                    open={openSections.financial}
                    onOpenChange={(open) => setOpenSections(prev => ({ ...prev, financial: open }))}
                  >
                    <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold text-slate-800">Gestão Financeira</h3>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${openSections.financial ? 'rotate-90' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4">
                      <div className="space-y-4 text-sm text-slate-700">
                        <div>
                          <h4 className="font-semibold mb-2 text-slate-800">Funcionalidades Principais:</h4>
                          <ul className="space-y-1 list-disc list-inside">
                            <li><strong>Registro de Pagamentos:</strong> Criação manual ou automática via Stripe</li>
                            <li><strong>Múltiplos Métodos:</strong> Dinheiro, cartão (crédito/débito), PIX, transferência, cheque</li>
                            <li><strong>Parcelamento:</strong> Pagamento parcelado com registro de número de parcelas, taxas e datas</li>
                            <li><strong>Taxas de Serviço:</strong> Gestão de taxas extras (limpeza, estacionamento, etc.)</li>
                            <li><strong>Relatórios Financeiros:</strong> Receitas, despesas, pendências, histórico completo</li>
                            <li><strong>Relatório de Fechamento:</strong> Consolidação mensal com métricas (ADR, RevPAR, ocupação)</li>
                            <li><strong>Exportação:</strong> Export para CSV e XLSX com todos os detalhes</li>
                            <li><strong>Integração Stripe:</strong> Pagamentos online seguros via cartão</li>
                            <li><strong>Status de Pagamento:</strong> Pendente, Parcial, Pago, Reembolsado</li>
                            <li><strong>Rastreamento:</strong> Histórico completo de todos os pagamentos e alterações</li>
                          </ul>
                        </div>
                        <div className="p-3 bg-green-50 rounded border border-green-200">
                          <h4 className="font-semibold mb-2 text-green-900">Parcelamento - Detalhes Técnicos:</h4>
                          <ul className="space-y-1 text-xs text-green-800">
                            <li><strong>Campo:</strong> <code>payments.installments</code> - Número total de parcelas</li>
                            <li><strong>Notas:</strong> <code>payments.notes</code> - Detalhes completos (valor por parcela, taxas, datas)</li>
                            <li><strong>Registro:</strong> Um único registro de pagamento com informações consolidadas</li>
                            <li><strong>Export:</strong> Inclui <code>quantidade_parcelas</code> com breakdown completo</li>
                            <li><strong>Cálculo:</strong> Taxas e valores líquidos calculados automaticamente</li>
                          </ul>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                          <h4 className="font-semibold mb-2 text-slate-800">Métricas Financeiras:</h4>
                          <div className="text-xs space-y-1">
                            <div><strong>ADR (Average Daily Rate):</strong> Receita total / Número de noites vendidas</div>
                            <div><strong>RevPAR (Revenue per Available Room):</strong> Receita total / Quartos disponíveis</div>
                            <div><strong>Taxa de Ocupação:</strong> (Quartos ocupados / Quartos disponíveis) × 100</div>
                            <div><strong>Receita Total:</strong> Soma de todos os pagamentos confirmados</div>
                            <div><strong>Pendências:</strong> Valor total - Valor pago</div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Sistema de E-mails */}
                  <Collapsible 
                    className="border rounded-lg"
                    open={openSections.emails}
                    onOpenChange={(open) => setOpenSections(prev => ({ ...prev, emails: open }))}
                  >
                    <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold text-slate-800">Sistema de E-mails</h3>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${openSections.emails ? 'rotate-90' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4">
                      <div className="space-y-4 text-sm text-slate-700">
                        <div>
                          <h4 className="font-semibold mb-2 text-slate-800">Funcionalidades Principais:</h4>
                          <ul className="space-y-1 list-disc list-inside">
                            <li><strong>Templates Personalizáveis:</strong> Criação e edição de templates HTML para cada evento</li>
                            <li><strong>Variáveis Dinâmicas:</strong> Substituição automática de variáveis ({`{{guest_name}}`}, {`{{reservation_code}}`}, etc.)</li>
                            <li><strong>Múltiplos Provedores:</strong> SMTP, Resend, SendGrid, Mailgun, AWS SES</li>
                            <li><strong>Fila de E-mails:</strong> Sistema de fila para processamento assíncrono</li>
                            <li><strong>Logs de Envio:</strong> Histórico completo de todos os e-mails enviados</li>
                            <li><strong>E-mails Automáticos:</strong> Disparo automático em eventos (reserva criada, check-in, pagamento, etc.)</li>
                            <li><strong>Condicionais Handlebars:</strong> Suporte a {`{{#if}}`} para conteúdo condicional</li>
                            <li><strong>Prioridade:</strong> Sistema de prioridade para e-mails urgentes</li>
                            <li><strong>Retry Automático:</strong> Tentativas automáticas em caso de falha</li>
                            <li><strong>Preview:</strong> Visualização do template antes de enviar</li>
                          </ul>
                        </div>
                        <div className="p-3 bg-blue-50 rounded border border-blue-200">
                          <h4 className="font-semibold mb-2 text-blue-900">Eventos de E-mail Disponíveis:</h4>
                          <div className="grid md:grid-cols-2 gap-2 text-xs text-blue-800">
                            <div><code>reservation.created</code> - Reserva criada</div>
                            <div><code>reservation.imported</code> - Reserva importada</div>
                            <div><code>reservation.cancelled</code> - Reserva cancelada</div>
                            <div><code>reservation.extended</code> - Reserva estendida</div>
                            <div><code>checkin.confirmed</code> - Check-in confirmado</div>
                            <div><code>checkout.completed</code> - Check-out concluído</div>
                            <div><code>payment.confirmed</code> - Pagamento confirmado</div>
                            <div><code>payment.pending</code> - Pagamento pendente</div>
                            <div><code>fiscal_document.request</code> - Solicitação de documento fiscal</div>
                            <div><code>reservation.overbooking</code> - Overbooking detectado</div>
                            <div><code>guest.password_reset</code> - Redefinição de senha</div>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                          <h4 className="font-semibold mb-2 text-slate-800">Variáveis de Template Principais:</h4>
                          <div className="text-xs space-y-1">
                            <div><code>{`{{guest_name}}`}</code> - Nome do hóspede</div>
                            <div><code>{`{{reservation_code}}`}</code> - Código da reserva</div>
                            <div><code>{`{{identification_number}}`}</code> - Número de identificação (#123456)</div>
                            <div><code>{`{{checkin_date}}`}</code> - Data de check-in</div>
                            <div><code>{`{{checkout_date}}`}</code> - Data de check-out</div>
                            <div><code>{`{{hotel_name}}`}</code> - Nome do estabelecimento</div>
                            <div><code>{`{{hotel_logo}}`}</code> - URL do logo</div>
                            <div><code>{`{{room_number}}`}</code> - Número do quarto</div>
                            <div><code>{`{{room_password}}`}</code> - Senha do quarto</div>
                            <div><code>{`{{web_checkin_link}}`}</code> - Link para web check-in</div>
                            <div><code>{`{{payment_link}}`}</code> - Link para pagamento</div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Web Check-in */}
                  <Collapsible 
                    className="border rounded-lg"
                    open={openSections.webcheckin}
                    onOpenChange={(open) => setOpenSections(prev => ({ ...prev, webcheckin: open }))}
                  >
                    <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold text-slate-800">Web Check-in</h3>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${openSections.webcheckin ? 'rotate-90' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4">
                      <div className="space-y-4 text-sm text-slate-700">
                        <div>
                          <h4 className="font-semibold mb-2 text-slate-800">Funcionalidades Principais:</h4>
                          <ul className="space-y-1 list-disc list-inside">
                            <li><strong>Check-in Online:</strong> Processo completo de check-in via web para hóspedes</li>
                            <li><strong>Autenticação:</strong> Login via localizador ou conta de hóspede</li>
                            <li><strong>Upload de Documentos:</strong> Envio de RG, CPF, CNH, selfie para verificação</li>
                            <li><strong>Cadastro de Hóspedes:</strong> Registro de hóspedes adicionais com dados completos</li>
                            <li><strong>Preferências:</strong> Solicitação de check-in antecipado, check-out tardio, solicitações especiais</li>
                            <li><strong>Políticas:</strong> Aceite de termos e condições do estabelecimento</li>
                            <li><strong>Solicitação de Documentos Fiscais:</strong> Pedido de recibo ou nota fiscal</li>
                            <li><strong>Dashboard do Hóspede:</strong> Visualização de reservas ativas e histórico</li>
                            <li><strong>Reutilização de Dados:</strong> Preenchimento automático com dados de check-ins anteriores</li>
                            <li><strong>Status Tracking:</strong> Acompanhamento do status do check-in (pending, in_progress, completed)</li>
                            <li><strong>Email Automático:</strong> Envio automático de confirmação ao concluir check-in</li>
                          </ul>
                        </div>
                        <div className="p-3 bg-purple-50 rounded border border-purple-200">
                          <h4 className="font-semibold mb-2 text-purple-900">Fluxo do Web Check-in:</h4>
                          <ol className="list-decimal list-inside space-y-1 text-xs text-purple-800">
                            <li><strong>Autenticação:</strong> Hóspede informa localizador ou faz login</li>
                            <li><strong>Verificação:</strong> Sistema valida reserva e datas</li>
                            <li><strong>Políticas:</strong> Hóspede aceita termos e condições</li>
                            <li><strong>Dados dos Hóspedes:</strong> Cadastro/atualização de informações</li>
                            <li><strong>Documentos:</strong> Upload de documentos de identificação</li>
                            <li><strong>Preferências:</strong> Solicitação de serviços e preferências</li>
                            <li><strong>Revisão:</strong> Confirmação de todas as informações</li>
                            <li><strong>Conclusão:</strong> Check-in finalizado e email enviado</li>
                          </ol>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                          <h4 className="font-semibold mb-2 text-slate-800">Estrutura Técnica:</h4>
                          <div className="text-xs space-y-1">
                            <div><strong>Tabelas:</strong> <code>web_checkin</code>, <code>web_checkin_guests</code>, <code>web_checkin_documents</code></div>
                            <div><strong>Rota:</strong> <code>/web-checkin/:locator</code></div>
                            <div><strong>Status:</strong> <code>pending</code>, <code>in_progress</code>, <code>completed</code>, <code>expired</code></div>
                            <div><strong>Token:</strong> Token único gerado para cada sessão de check-in</div>
                            <div><strong>Expiração:</strong> Link expira 7 dias antes do check-in ou na data do check-in</div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Dashboard do Hóspede */}
                  <Collapsible 
                    className="border rounded-lg"
                    open={openSections.guestDashboard}
                    onOpenChange={(open) => setOpenSections(prev => ({ ...prev, guestDashboard: open }))}
                  >
                    <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold text-slate-800">Dashboard do Hóspede</h3>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${openSections.guestDashboard ? 'rotate-90' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4">
                      <div className="space-y-4 text-sm text-slate-700">
                        <div>
                          <h4 className="font-semibold mb-2 text-slate-800">Funcionalidades Principais:</h4>
                          <ul className="space-y-1 list-disc list-inside">
                            <li><strong>Visualização de Reserva Atual:</strong> Exibe a reserva com check-in mais próximo, incluindo código, identificação, datas, quarto, senha e status</li>
                            <li><strong>Histórico de Estadas:</strong> Visualização completa de todas as reservas do hóspede com filtros por status</li>
                            <li><strong>Reservas Canceladas:</strong> Lista separada de reservas canceladas com informações de contato do estabelecimento</li>
                            <li><strong>Novo Check-in:</strong> Acesso rápido ao processo de web check-in para novas reservas</li>
                            <li><strong>Estender Reserva:</strong> Prolongamento de estadia com validação de disponibilidade, cálculo automático de preço e pagamento online via Stripe</li>
                            <li><strong>Pagar Reserva:</strong> Pagamento seguro de reservas via Stripe com processamento de cartão de crédito (PCI compliant)</li>
                            <li><strong>Perfil do Hóspede:</strong> Edição de dados pessoais, contato, documentos e preferências</li>
                            <li><strong>Chamados de Manutenção:</strong> Criação e acompanhamento de solicitações de manutenção</li>
                            <li><strong>Solicitação de Documentos Fiscais:</strong> Pedido de recibo ou nota fiscal para reservas</li>
                            <li><strong>Informações do Estabelecimento:</strong> Visualização de endereço, contato e políticas</li>
                            <li><strong>Solicitações Especiais:</strong> Gerenciamento de preferências e solicitações especiais</li>
                            <li><strong>Atualização Automática:</strong> Refresh automático a cada 30 segundos para status atualizados</li>
                            <li><strong>Multi-idioma:</strong> Suporte completo a internacionalização (i18n)</li>
                            <li><strong>Responsivo:</strong> Interface adaptada para desktop, tablet e mobile</li>
                          </ul>
                        </div>
                        <div className="p-3 bg-blue-50 rounded border border-blue-200">
                          <h4 className="font-semibold mb-2 text-blue-900">Estrutura Técnica - Queries e Endpoints:</h4>
                          <div className="space-y-2 text-xs text-blue-800">
                            <div>
                              <strong>1. Buscar Reserva Atual:</strong>
                              <pre className="mt-1 p-2 bg-blue-100 rounded overflow-x-auto text-xs">
{GUEST_DASHBOARD_QUERY_1}
                              </pre>
                            </div>
                            <div>
                              <strong>2. Buscar Todas as Reservas:</strong>
                              <pre className="mt-1 p-2 bg-blue-100 rounded overflow-x-auto text-xs">
{GUEST_DASHBOARD_QUERY_2}
                              </pre>
                            </div>
                            <div>
                              <strong>3. Buscar Reservas Canceladas:</strong>
                              <pre className="mt-1 p-2 bg-blue-100 rounded overflow-x-auto text-xs">
{GUEST_DASHBOARD_QUERY_3}
                              </pre>
                            </div>
                            <div>
                              <strong>4. Buscar Web Check-in:</strong>
                              <pre className="mt-1 p-2 bg-blue-100 rounded overflow-x-auto text-xs">
{GUEST_DASHBOARD_QUERY_4}
                              </pre>
                            </div>
                          </div>
                        </div>
                        <div className="p-3 bg-purple-50 rounded border border-purple-200">
                          <h4 className="font-semibold mb-2 text-purple-900">Componentes e Diálogos:</h4>
                          <div className="space-y-2 text-xs text-purple-800">
                            <div>
                              <strong>GuestStayHistoryDialog:</strong>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>Exibe histórico completo de todas as estadas</li>
                                <li>Filtros por status (pending, confirmed, checked_in, checked_out, cancelled)</li>
                                <li>Detalhes de cada reserva com datas, quarto, valores</li>
                                <li>Navegação para detalhes da reserva</li>
                              </ul>
                            </div>
                            <div>
                              <strong>GuestProfileDialog:</strong>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>Edição de perfil do hóspede</li>
                                <li>Atualização de dados pessoais, contato, documentos</li>
                                <li>Alteração de senha da conta</li>
                                <li>Validação de dados antes de salvar</li>
                              </ul>
                            </div>
                            <div>
                              <strong>MaintenanceTicketDialog:</strong>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>Criação de chamados de manutenção</li>
                                <li>Seleção de reserva relacionada</li>
                                <li>Descrição do problema e prioridade</li>
                                <li>Acompanhamento de status do chamado</li>
                              </ul>
                            </div>
                            <div>
                              <strong>FiscalDocumentRequest:</strong>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>Solicitação de recibo ou nota fiscal</li>
                                <li>Seleção de reserva para documento</li>
                                <li>Geração de PDF do recibo</li>
                                <li>Envio de email para solicitação de NF</li>
                              </ul>
                            </div>
                            <div>
                              <strong>PoliciesViewDialog:</strong>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>Visualização de políticas do estabelecimento</li>
                                <li>Políticas do prédio (se aplicável) ou estabelecimento</li>
                                <li>Formatação HTML das políticas</li>
                              </ul>
                            </div>
                            <div>
                              <strong>ExtendReservationDialog:</strong>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>Extensão de reserva com validação de disponibilidade</li>
                                <li>Calendário interativo com datas ocupadas marcadas em vermelho</li>
                                <li>Cálculo automático de preço usando sistema de tarifas dinâmico</li>
                                <li>Integração com Stripe para pagamento online</li>
                                <li>Atualização automática de checkout_date e total_amount</li>
                              </ul>
                            </div>
                            <div>
                              <strong>PaymentDialog:</strong>
                              <ul className="list-disc list-inside mt-1 space-y-1">
                                <li>Pagamento de reserva via Stripe</li>
                                <li>Processamento seguro de cartão de crédito (PCI compliant)</li>
                                <li>Atualização automática de payment_status e paid_amount</li>
                                <li>Confirmação em tempo real do status do pagamento</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded border border-emerald-200">
                          <h4 className="font-semibold mb-2 text-emerald-900">Estender Reserva - Detalhes Técnicos:</h4>
                          <ul className="space-y-1 text-xs text-emerald-800">
                            <li><strong>Componente:</strong> <code>ExtendReservationDialog</code> - Diálogo para extensão de reserva</li>
                            <li><strong>Endpoint:</strong> <code>PATCH /rest/v1/reservations?id=eq.{`{uuid}`}</code></li>
                            <li><strong>Campo alterado:</strong> <code>checkout_date</code> - Nova data de check-out</li>
                            <li><strong>Validação de Disponibilidade:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Busca todas as reservas conflitantes na categoria/quarto</li>
                                <li>Verifica ocupação por data considerando checkout (data de checkout é disponível)</li>
                                <li>Marca datas ocupadas no calendário (exibidas em vermelho)</li>
                                <li>Desabilita datas indisponíveis para seleção</li>
                              </ul>
                            </li>
                            <li><strong>Cálculo de Preço:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Usa sistema de tarifas dinâmico (RPC <code>calculate_dynamic_price</code>)</li>
                                <li>Considera o <code>pricing_plan_id</code> da reserva original</li>
                                <li>Calcula apenas para o período adicional (do checkout original até novo checkout)</li>
                                <li>Atualiza <code>total_amount</code> da reserva com valor adicional</li>
                              </ul>
                            </li>
                            <li><strong>Processo de Pagamento:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Se Stripe estiver habilitado, oferece pagamento online</li>
                                <li>Cria Payment Intent via Edge Function <code>stripe-payment</code></li>
                                <li>Processa pagamento via Stripe.js (PCI compliant)</li>
                                <li>Atualiza <code>paid_amount</code> após confirmação</li>
                                <li>Se Stripe não estiver disponível, permite extensão sem pagamento imediato</li>
                              </ul>
                            </li>
                            <li><strong>Registro de Atividade:</strong> Cria log com tipo <code>"reservation.extended"</code> incluindo:
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Data de checkout original</li>
                                <li>Nova data de checkout</li>
                                <li>Valor adicional calculado</li>
                                <li>Número de noites adicionais</li>
                              </ul>
                            </li>
                            <li><strong>Notificação:</strong> Envia email automático com evento <code>"reservation.extended"</code></li>
                            <li><strong>Variável de Template:</strong> <code>{`{{new_checkout_date}}`}</code> disponível no email</li>
                          </ul>
                        </div>
                        <div className="p-3 bg-green-50 rounded border border-green-200">
                          <h4 className="font-semibold mb-2 text-green-900">Pagar Reserva com Stripe - Detalhes Técnicos:</h4>
                          <ul className="space-y-1 text-xs text-green-800">
                            <li><strong>Componente:</strong> <code>PaymentDialog</code> - Diálogo de pagamento Stripe</li>
                            <li><strong>Hook:</strong> <code>useStripe</code> - Gerencia configuração e estado do Stripe</li>
                            <li><strong>Fluxo de Pagamento:</strong>
                              <ol className="list-decimal list-inside mt-1 ml-4 space-y-1">
                                <li><strong>Criação do Payment Intent:</strong>
                                  <ul className="list-disc list-inside mt-1 ml-4">
                                    <li>Chama Edge Function: <code>POST /functions/v1/stripe-payment</code></li>
                                    <li>Body: <code>{`{establishment_id, amount, currency, reservation_id, guest_id, description}`}</code></li>
                                    <li>Retorna: <code>{`{payment_intent_id, client_secret, status}`}</code></li>
                                  </ul>
                                </li>
                                <li><strong>Processamento no Frontend:</strong>
                                  <ul className="list-disc list-inside mt-1 ml-4">
                                    <li>Usa Stripe.js para coletar dados do cartão (PCI compliant)</li>
                                    <li>Confirma pagamento com <code>client_secret</code></li>
                                    <li>Exibe status em tempo real (requires_payment_method, processing, succeeded)</li>
                                  </ul>
                                </li>
                                <li><strong>Webhook do Stripe:</strong>
                                  <ul className="list-disc list-inside mt-1 ml-4">
                                    <li>Endpoint: <code>POST /functions/v1/stripe-webhook</code></li>
                                    <li>Eventos: <code>payment_intent.succeeded</code>, <code>payment_intent.payment_failed</code></li>
                                    <li>Atualiza <code>payment_status</code> e <code>paid_amount</code> na reserva</li>
                                    <li>Cria registro na tabela <code>payments</code></li>
                                  </ul>
                                </li>
                                <li><strong>Validação de Status:</strong>
                                  <ul className="list-disc list-inside mt-1 ml-4">
                                    <li>Verifica status via: <code>POST /functions/v1/stripe-payment-status</code></li>
                                    <li>Atualiza UI com status atualizado</li>
                                    <li>Redireciona para confirmação em caso de sucesso</li>
                                  </ul>
                                </li>
                              </ol>
                            </li>
                            <li><strong>Configuração Necessária:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Stripe habilitado globalmente (<code>stripe_global_config.is_enabled = true</code>)</li>
                                <li>Stripe habilitado para o estabelecimento (<code>stripe_establishment_config.is_enabled = true</code>)</li>
                                <li>Chaves configuradas: <code>STRIPE_SECRET_KEY</code> e <code>STRIPE_WEBHOOK_SECRET</code> em Supabase Secrets</li>
                                <li>Publishable Key configurada no PMS (Configurações &gt; Integrações &gt; Stripe)</li>
                              </ul>
                            </li>
                            <li><strong>Segurança:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Chaves secretas nunca expostas ao frontend</li>
                                <li>Dados de cartão processados diretamente pelo Stripe.js</li>
                                <li>Validação de webhook via assinatura Stripe-Signature</li>
                                <li>PCI-DSS compliant (não armazena dados de cartão)</li>
                              </ul>
                            </li>
                            <li><strong>Integração com Reservas:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Atualiza <code>reservations.paid_amount</code> após pagamento confirmado</li>
                                <li>Atualiza <code>reservations.payment_status</code> (pending, partial, paid)</li>
                                <li>Cria registro em <code>payments</code> com método "stripe"</li>
                                <li>Registra atividade com tipo "payment.confirmed"</li>
                              </ul>
                            </li>
                          </ul>
                        </div>
                        <div className="p-3 bg-green-50 rounded border border-green-200">
                          <h4 className="font-semibold mb-2 text-green-900">Status de Reservas e Badges:</h4>
                          <div className="space-y-2 text-xs text-green-800">
                            <div><strong>pending:</strong> Amarelo - Reserva pendente de confirmação</div>
                            <div><strong>unpaid:</strong> Laranja - Reserva não paga</div>
                            <div><strong>confirmed:</strong> Azul - Reserva confirmada</div>
                            <div><strong>checked_in:</strong> Verde - Check-in realizado</div>
                            <div><strong>checked_out:</strong> Cinza - Check-out realizado</div>
                            <div><strong>cancelled:</strong> Vermelho - Reserva cancelada</div>
                            <div><strong>blocked:</strong> Vermelho escuro - Reserva bloqueada</div>
                            <div><strong>preregistration:</strong> Azul claro - Pré-registro</div>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                          <h4 className="font-semibold mb-2 text-slate-800">Autenticação e Segurança:</h4>
                          <div className="text-xs space-y-1">
                            <div><strong>Autenticação:</strong> Baseada em <code>guest_account_id</code> armazenado em localStorage</div>
                            <div><strong>Validação:</strong> Redireciona para /web-checkin se não autenticado</div>
                            <div><strong>Isolamento:</strong> Hóspede só vê suas próprias reservas via RLS</div>
                            <div><strong>Logout:</strong> Limpa localStorage e redireciona para web-checkin</div>
                            <div><strong>RLS:</strong> Políticas garantem acesso apenas aos próprios dados</div>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                          <h4 className="font-semibold mb-2 text-slate-800">Atualização Automática:</h4>
                          <div className="text-xs space-y-1">
                            <div><strong>Intervalo:</strong> Refresh automático a cada 30 segundos</div>
                            <div><strong>Queries:</strong> current_guest_reservation, all_guest_reservations, cancelled_guest_reservations</div>
                            <div><strong>Window Focus:</strong> Refetch quando a janela recebe foco</div>
                            <div><strong>Invalidation:</strong> Invalidação manual via queryClient quando necessário</div>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                          <h4 className="font-semibold mb-2 text-slate-800">Rota e Acesso:</h4>
                          <div className="text-xs space-y-1">
                            <div><strong>Rota:</strong> <code>/guest-dashboard</code> (pública, requer autenticação de hóspede)</div>
                            <div><strong>Acesso:</strong> Após login via web-checkin ou conta de hóspede</div>
                            <div><strong>Redirecionamento:</strong> Se não autenticado, redireciona para /web-checkin</div>
                            <div><strong>Persistência:</strong> Sessão mantida via localStorage até logout</div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Outras Funcionalidades */}
                  <Collapsible 
                    className="border rounded-lg"
                    open={openSections.others}
                    onOpenChange={(open) => setOpenSections(prev => ({ ...prev, others: open }))}
                  >
                    <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold text-slate-800">Outras Funcionalidades</h3>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${openSections.others ? 'rotate-90' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4">
                      <div className="space-y-4 text-sm text-slate-700">
                        <div>
                          <h4 className="font-semibold mb-2 text-slate-800">Funcionalidades Principais:</h4>
                          <ul className="space-y-1 list-disc list-inside">
                            <li><strong>Gestão de Unidades/Quartos:</strong> Cadastro, status, bloqueios, manutenção</li>
                            <li><strong>Sistema de Tarifas:</strong> Tarifas dinâmicas por data, categoria, período, eventos</li>
                            <li><strong>Gestão de Manutenção:</strong> Chamados, agendamentos, histórico de manutenções</li>
                            <li><strong>Channel Manager:</strong> Integração com OTAs (Booking.com, Expedia, etc.)</li>
                            <li><strong>Gestão de Funcionários:</strong> Cadastro, permissões, roles (Manager, Employee)</li>
                            <li><strong>Logs de Atividade:</strong> Auditoria completa de todas as ações do sistema</li>
                            <li><strong>Geração de Documentos:</strong> Recibos e notas fiscais em PDF</li>
                            <li><strong>Relatórios e Estatísticas:</strong> Dashboards, métricas, análises de desempenho</li>
                            <li><strong>Multi-tenant:</strong> Suporte a múltiplos estabelecimentos isolados</li>
                            <li><strong>Configurações:</strong> Personalização completa do estabelecimento</li>
                          </ul>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                          <h4 className="font-semibold mb-2 text-slate-800">Sistema de Tarifas:</h4>
                          <div className="text-xs space-y-1">
                            <div><strong>Tipos:</strong> Tarifa base, tarifa por período, tarifa por evento, tarifa sazonal</div>
                            <div><strong>Cálculo:</strong> Sistema RPC que calcula preço considerando todas as regras</div>
                            <div><strong>Prioridade:</strong> Tarifas com maior prioridade sobrescrevem as de menor prioridade</div>
                            <div><strong>Validação:</strong> Verifica disponibilidade antes de aplicar tarifa</div>
                          </div>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                          <h4 className="font-semibold mb-2 text-slate-800">Geração de Documentos Fiscais:</h4>
                          <div className="text-xs space-y-1">
                            <div><strong>Recibo:</strong> PDF gerado com jsPDF incluindo logo, assinatura, dados do hóspede e estabelecimento</div>
                            <div><strong>Nota Fiscal:</strong> Solicitação enviada por email com template personalizável</div>
                            <div><strong>Variáveis:</strong> Suporte a variáveis dinâmicas no template de solicitação</div>
                            <div><strong>Armazenamento:</strong> Documentos salvos em Supabase Storage</div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {/* Sistema Tarifário */}
                  <Collapsible 
                    className="border rounded-lg"
                    open={openSections.rateSystem}
                    onOpenChange={(open) => setOpenSections(prev => ({ ...prev, rateSystem: open }))}
                  >
                    <CollapsibleTrigger className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold text-slate-800">Sistema Tarifário</h3>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-slate-500 transition-transform ${openSections.rateSystem ? 'rotate-90' : ''}`} />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="px-4 pb-4">
                      <div className="space-y-4 text-sm text-slate-700">
                        <div>
                          <h4 className="font-semibold mb-2 text-slate-800">Funcionalidades Principais:</h4>
                          <ul className="space-y-1 list-disc list-inside">
                            <li><strong>Planos Tarifários:</strong> Criação e gestão de múltiplos planos (BAR, Promocional, Corporativo, etc.)</li>
                            <li><strong>Calendário de Tarifas:</strong> Visualização e edição de preços por data, categoria e plano</li>
                            <li><strong>Edição em Lote:</strong> Aplicação de ajustes de preço para múltiplas categorias, planos e períodos</li>
                            <li><strong>Regras de Precificação Dinâmica:</strong> Ajuste automático de preços baseado em ocupação, demanda e histórico</li>
                            <li><strong>Recomendações de Preços:</strong> Sugestões automáticas de ajuste baseadas em ocupação e métricas</li>
                            <li><strong>Aplicação de Recomendações:</strong> Aplicar preços sugeridos diretamente ao tarifário com um clique</li>
                            <li><strong>Análise e Métricas:</strong> Dashboard com ADR, RevPAR, ocupação e receita por categoria/plano</li>
                            <li><strong>Restrições de Tarifa:</strong> Limites de estoque, fechamento de vendas e restrições por canal</li>
                            <li><strong>Histórico de Demanda:</strong> Consideração de preços históricos do mesmo período do ano anterior</li>
                            <li><strong>Ajustes Proporcionais:</strong> Ajuste automático proporcional ao número de quartos por categoria</li>
                            <li><strong>Controle de Funcionalidades:</strong> Ativação/desativação por empresa via Super Admin</li>
                            <li><strong>Logs de Atividades:</strong> Registro automático de todas as alterações de preço com usuário "Sistema"</li>
                          </ul>
                        </div>
                        <div className="p-3 bg-blue-50 rounded border border-blue-200">
                          <h4 className="font-semibold mb-2 text-blue-900">Regras de Precificação Dinâmica - Detalhes:</h4>
                          <ul className="space-y-1 text-xs text-blue-800">
                            <li><strong>Tipos de Gatilho:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li><strong>Ocupação:</strong> Ajustes baseados em faixas de ocupação (Baixa, Média, Alta)</li>
                                <li><strong>Velocidade de Reservas:</strong> Ajustes baseados na velocidade de novas reservas</li>
                                <li><strong>Dia da Semana:</strong> Ajustes específicos para diferentes dias da semana</li>
                                <li><strong>Antecedência:</strong> Ajustes baseados na antecedência da reserva</li>
                                <li><strong>Personalizado:</strong> Regras customizadas com condições específicas</li>
                              </ul>
                            </li>
                            <li><strong>Faixas de Ocupação Personalizáveis:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Baixa Ocupação: Min/Max % configurável com ajuste e valor base opcional</li>
                                <li>Média Ocupação: Min/Max % configurável com ajuste e valor base opcional</li>
                                <li>Alta Ocupação: Min/Max % configurável com ajuste e valor base opcional</li>
                              </ul>
                            </li>
                            <li><strong>Ajustes Proporcionais Automáticos:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li><strong>1 quarto:</strong> 50% do ajuste aplicado</li>
                                <li><strong>2-4 quartos:</strong> 60-75% do ajuste aplicado (escala linear: 2 quartos = 60%, 4 quartos = 75%)</li>
                                <li><strong>5-9 quartos:</strong> 75-100% do ajuste aplicado (escala linear: 5 quartos = 75%, 9 quartos = 100%)</li>
                                <li><strong>10+ quartos:</strong> 100% do ajuste aplicado</li>
                                <li><strong>Fórmula:</strong> O sistema calcula automaticamente o fator de escala baseado no número exato de quartos na categoria</li>
                              </ul>
                            </li>
                            <li><strong>Considerar Histórico de Demanda:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Busca preços do mesmo mês do ano anterior</li>
                                <li>Usa como base para cálculos quando ativado</li>
                                <li>Fallback para média do mês se data específica não encontrada</li>
                              </ul>
                            </li>
                            <li><strong>Aplicação Automática:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Pode ser ativada/desativada nas configurações</li>
                                <li>Aplica apenas quando há mudança significativa na ocupação</li>
                                <li>Salva automaticamente no rate_calendar quando aplicada</li>
                                <li>Registra todas as alterações nos logs de atividade</li>
                              </ul>
                            </li>
                          </ul>
                        </div>
                        <div className="p-3 bg-green-50 rounded border border-green-200">
                          <h4 className="font-semibold mb-2 text-green-900">Recomendações de Preços - Detalhes:</h4>
                          <ul className="space-y-1 text-xs text-green-800">
                            <li><strong>Geração Automática:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Baseada em ocupação atual vs. ocupação alvo</li>
                                <li>Considera configurações de threshold (alta/baixa ocupação)</li>
                                <li>Calcula impacto estimado na receita</li>
                                <li>Prioriza recomendações (alta/média) baseado no impacto</li>
                              </ul>
                            </li>
                            <li><strong>Filtros:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Filtro por categoria</li>
                                <li>Filtro por período (data inicial e final)</li>
                                <li>Oculta datas passadas por padrão (opção para mostrar)</li>
                                <li>Badge indicando quantas recomendações estão ocultas</li>
                              </ul>
                            </li>
                            <li><strong>Aplicação de Recomendações:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Botão "Aplicar Preço Sugerido" em cada recomendação</li>
                                <li>Aplica ao plano padrão (BAR) ou primeiro plano ativo</li>
                                <li>Atualiza rate_calendar automaticamente</li>
                                <li>Recarrega recomendações após aplicação</li>
                                <li>Feedback visual durante o processo</li>
                              </ul>
                            </li>
                            <li><strong>Configurações:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Habilitar/desabilitar recomendações</li>
                                <li>Threshold de ocupação para recomendações</li>
                                <li>Threshold de baixa ocupação</li>
                                <li>Percentual de aumento de preço</li>
                                <li>Percentual de redução de preço</li>
                              </ul>
                            </li>
                          </ul>
                        </div>
                        <div className="p-3 bg-purple-50 rounded border border-purple-200">
                          <h4 className="font-semibold mb-2 text-purple-900">Edição em Lote - Detalhes:</h4>
                          <ul className="space-y-1 text-xs text-purple-800">
                            <li><strong>Processo Multi-Etapas:</strong>
                              <ol className="list-decimal list-inside mt-1 ml-4">
                                <li>Seleção de categorias e planos tarifários</li>
                                <li>Definição do período (data inicial e final)</li>
                                <li>Configuração individual de ajustes por categoria/plano</li>
                              </ol>
                            </li>
                            <li><strong>Tipos de Ajuste:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li><strong>Percentual:</strong> Aumento/redução percentual do preço atual</li>
                                <li><strong>Valor Fixo:</strong> Adição/subtração de valor fixo</li>
                                <li><strong>Multiplicador:</strong> Multiplicação do preço por um fator</li>
                                <li><strong>Valor Absoluto:</strong> Definir preço exato</li>
                              </ul>
                            </li>
                            <li><strong>Validações:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4">
                                <li>Validação de período (data inicial &lt; data final)</li>
                                <li>Validação de valores (não negativos, dentro de limites)</li>
                                <li>Confirmação antes de aplicar em lote</li>
                              </ul>
                            </li>
                          </ul>
                        </div>
                        <div className="p-3 bg-slate-50 rounded">
                          <h4 className="font-semibold mb-2 text-slate-800">Estrutura Técnica Detalhada:</h4>
                          <div className="text-xs space-y-4">
                            <div><strong>Tabelas Principais - Estrutura e Propósito:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4 space-y-2">
                                <li><code>pricing_plans</code> - Planos tarifários (BAR, Promocional, Corporativo, etc.)
                                  <ul className="list-disc list-inside ml-4 mt-1 text-xs text-slate-600">
                                    <li><strong>Campos:</strong> id, establishment_id, name, code, description, is_default, is_active, created_at, updated_at</li>
                                    <li><strong>Uso:</strong> Define diferentes estratégias de precificação para o mesmo estabelecimento</li>
                                    <li><strong>Relacionamento:</strong> Um plano pode ter múltiplas entradas em rate_calendar</li>
                                  </ul>
                                </li>
                                <li><code>rate_calendar</code> - Calendário de preços por data, categoria e plano
                                  <ul className="list-disc list-inside ml-4 mt-1 text-xs text-slate-600">
                                    <li><strong>Campos principais:</strong> establishment_id, category_id, pricing_plan_id, date, base_price, adult_price, child_price, occupancy_percentage, projected_occupancy, pickup_rate</li>
                                    <li><strong>Chave única:</strong> (establishment_id, category_id, pricing_plan_id, date)</li>
                                    <li><strong>Uso:</strong> Armazena preços específicos por data. Se não existir entrada, usa base_price da categoria</li>
                                    <li><strong>Atualização:</strong> Pode ser atualizado manualmente ou via regras dinâmicas/recomendações</li>
                                  </ul>
                                </li>
                                <li><code>dynamic_pricing_rules</code> - Regras de precificação dinâmica
                                  <ul className="list-disc list-inside ml-4 mt-1 text-xs text-slate-600">
                                    <li><strong>Campos principais:</strong> id, establishment_id, name, trigger_type, trigger_condition (JSONB), adjustment_type, adjustment_value, consider_demand_history, is_active, priority</li>
                                    <li><strong>trigger_type:</strong> 'occupancy', 'booking_velocity', 'day_of_week', 'advance_booking', 'custom'</li>
                                      <li><strong>trigger_condition:</strong> JSONB com condições específicas do tipo de gatilho (ex: {`{"min": 0, "max": 30, "adjustment": 10, "base_value": null}`} para ocupação)</li>
                                    <li><strong>adjustment_type:</strong> 'percentage', 'fixed', 'multiplier'</li>
                                    <li><strong>Uso:</strong> Define quando e como ajustar preços automaticamente</li>
                                  </ul>
                                </li>
                                <li><code>hotel_settings.rate_system_settings</code> - Configurações do sistema tarifário (JSONB)
                                  <ul className="list-disc list-inside ml-4 mt-1 text-xs text-slate-600">
                                    <li><strong>Estrutura JSONB:</strong>
                                      <pre className="bg-slate-100 p-1 rounded mt-1 text-xs overflow-x-auto">{`{
  "auto_apply_dynamic_rules": boolean,
  "enable_recommendations": boolean,
  "high_occupancy_threshold": number (default: 90),
  "low_occupancy_threshold": number (default: 30),
  "price_increase_percentage": number (default: 15),
  "price_decrease_percentage": number (default: 10)
}`}</pre>
                                    </li>
                                    <li><strong>Uso:</strong> Controla comportamento global do sistema tarifário por estabelecimento</li>
                                    <li><strong>Acesso:</strong> Via interface "Configurações do Sistema Tarifário"</li>
                                  </ul>
                                </li>
                                <li><code>site_settings.features_enabled</code> - Controle de funcionalidades globais (JSONB)
                                  <ul className="list-disc list-inside ml-4 mt-1 text-xs text-slate-600">
                                      <li><strong>Estrutura:</strong> Pode ser boolean (global) ou objeto {`{enabled: boolean, company_ids: string[]}`}</li>
                                      <li><strong>Exemplo:</strong> <code>{`{"dynamic_pricing_automation": {"enabled": true, "company_ids": ["uuid1", "uuid2"]}}`}</code></li>
                                    <li><strong>Uso:</strong> Controla quais empresas podem usar automação de regras dinâmicas</li>
                                    <li><strong>Acesso:</strong> Via Super Admin → Controle de Funcionalidades</li>
                                  </ul>
                                </li>
                                <li><code>room_categories</code> - Categorias de quartos
                                  <ul className="list-disc list-inside ml-4 mt-1 text-xs text-slate-600">
                                    <li><strong>Campos:</strong> id, establishment_id, name, base_price, description</li>
                                    <li><strong>Uso:</strong> Define categorias e preço base (fallback quando não há entrada em rate_calendar)</li>
                                  </ul>
                                </li>
                                <li><code>rooms</code> - Quartos físicos
                                  <ul className="list-disc list-inside ml-4 mt-1 text-xs text-slate-600">
                                    <li><strong>Relacionamento:</strong> Cada quarto pertence a uma category_id</li>
                                    <li><strong>Uso:</strong> Usado para calcular ocupação por categoria (occupied_rooms / total_rooms)</li>
                                  </ul>
                                </li>
                                <li><code>reservations</code> - Reservas
                                  <ul className="list-disc list-inside ml-4 mt-1 text-xs text-slate-600">
                                    <li><strong>Uso:</strong> Usado para calcular ocupação atual e projetada</li>
                                    <li><strong>Campos relevantes:</strong> category_id, checkin_date, checkout_date, status</li>
                                  </ul>
                                </li>
                              </ul>
                            </div>
                            <div><strong>Funções SQL - Detalhamento:</strong>
                              <div className="mt-2 space-y-3 ml-4">
                                <div className="border-l-2 border-blue-300 pl-3">
                                  <div className="font-semibold text-blue-900">calculate_rate_price</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Parâmetros:</strong></div>
                                    <ul className="list-disc list-inside ml-4 mt-1">
                                      <li><code>p_establishment_id UUID</code> - ID do estabelecimento</li>
                                      <li><code>p_category_id UUID</code> - ID da categoria de quarto</li>
                                      <li><code>p_pricing_plan_id UUID</code> - ID do plano tarifário</li>
                                      <li><code>p_date DATE</code> - Data para calcular o preço</li>
                                      <li><code>p_adults INTEGER DEFAULT 1</code> - Número de adultos</li>
                                      <li><code>p_children INTEGER DEFAULT 0</code> - Número de crianças</li>
                                    </ul>
                                    <div className="mt-2"><strong>Retorno:</strong> <code>DECIMAL(10,2)</code> - Preço final calculado</div>
                                    <div className="mt-2"><strong>Fluxo de Execução Detalhado:</strong></div>
                                    <ol className="list-decimal list-inside ml-4 mt-1 space-y-1">
                                      <li><strong>Busca Preço Base:</strong> Procura em <code>rate_calendar</code> para a data/categoria/plano. Se não encontrar, usa <code>base_price</code> de <code>room_categories</code></li>
                                      <li><strong>Cálculo de Ocupação:</strong> Calcula ocupação específica da categoria:
                                        <pre className="bg-slate-100 p-1 rounded mt-1 text-xs overflow-x-auto">ocupação = (quartos_ocupados_na_data / total_quartos_categoria) * 100</pre>
                                      </li>
                                      <li><strong>Verificação de Feature Flag:</strong> Chama <code>company_has_feature_access('dynamic_pricing_automation', company_id)</code>. Se retornar false, pula regras dinâmicas</li>
                                      <li><strong>Aplicação de Regras Dinâmicas:</strong> Para cada regra ativa do estabelecimento:
                                        <ul className="list-disc list-inside ml-4 mt-1">
                                          <li>Verifica <code>trigger_type</code> e avalia <code>trigger_condition</code></li>
                                          <li><strong>occupancy:</strong> Verifica se ocupação está entre min/max das faixas (baixa/média/alta)</li>
                                          <li><strong>booking_velocity:</strong> Conta reservas criadas nas últimas 24h e compara com min_bookings</li>
                                          <li><strong>day_of_week:</strong> Verifica se dia da semana está em days_of_week array</li>
                                          <li><strong>advance_booking:</strong> Calcula dias até a data e verifica se está entre min_days e max_days</li>
                                          <li><strong>custom:</strong> Avalia condições customizadas do JSONB</li>
                                        </ul>
                                      </li>
                                      <li><strong>Ajuste Proporcional:</strong> Aplica fator de escala baseado no número de quartos:
                                        <ul className="list-disc list-inside ml-4 mt-1">
                                          <li>1 quarto: 50% do ajuste</li>
                                          <li>2-4 quartos: 60-75% (linear: 2=60%, 4=75%)</li>
                                          <li>5-9 quartos: 75-100% (linear: 5=75%, 9=100%)</li>
                                          <li>10+ quartos: 100% do ajuste</li>
                                        </ul>
                                      </li>
                                      <li><strong>Histórico de Demanda:</strong> Se <code>consider_demand_history = true</code>:
                                        <ul className="list-disc list-inside ml-4 mt-1">
                                          <li>Busca preço do mesmo dia/mês do ano anterior em <code>rate_calendar</code></li>
                                          <li>Se não encontrar, busca média do mês anterior</li>
                                          <li>Usa como base para cálculo se disponível</li>
                                        </ul>
                                      </li>
                                      <li><strong>Cálculo Final:</strong> Aplica <code>adult_price</code> e <code>child_price</code> ao preço base ajustado</li>
                                    </ol>
                                    <div className="mt-2"><strong>Como Configurar para Funcionar:</strong></div>
                                    <ol className="list-decimal list-inside ml-4 mt-1 space-y-1">
                                      <li>Super Admin deve habilitar <code>dynamic_pricing_automation</code> em Controle de Funcionalidades</li>
                                      <li>Selecionar empresas que podem usar a funcionalidade</li>
                                      <li>Criar regras dinâmicas em Regras de Precificação Dinâmica</li>
                                      <li>Configurar <code>auto_apply_dynamic_rules</code> em Configurações do Sistema Tarifário (opcional)</li>
                                    </ol>
                                    <div className="mt-2"><strong>Exemplo de Uso (RPC):</strong></div>
                                    <pre className="bg-slate-100 p-2 rounded mt-1 text-xs overflow-x-auto">{`const { data, error } = await supabase.rpc('calculate_rate_price', {
  p_establishment_id: '123e4567-e89b-12d3-a456-426614174000',
  p_category_id: '789e0123-e45b-67c8-d901-234567890abc',
  p_pricing_plan_id: '456e7890-e12b-34c5-d678-901234567def',
  p_date: '2024-12-25',
  p_adults: 2,
  p_children: 0
});

// Retorna: 250.50 (preço final calculado)
console.log(data);`}</pre>
                                  </div>
                                </div>
                                <div className="border-l-2 border-green-300 pl-3">
                                  <div className="font-semibold text-green-900">generate_rate_recommendations</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Parâmetros:</strong></div>
                                    <ul className="list-disc list-inside ml-4 mt-1">
                                      <li><code>p_establishment_id UUID</code> - ID do estabelecimento</li>
                                      <li><code>p_start_date DATE</code> - Data inicial do período</li>
                                      <li><code>p_end_date DATE</code> - Data final do período</li>
                                      <li><code>p_category_id UUID DEFAULT NULL</code> - ID da categoria (opcional, NULL para todas)</li>
                                    </ul>
                                    <div className="mt-2"><strong>Retorno:</strong> <code>TABLE</code> com colunas:</div>
                                    <ul className="list-disc list-inside ml-4 mt-1">
                                      <li><code>type TEXT</code> - Tipo de recomendação (increase/decrease)</li>
                                      <li><code>priority TEXT</code> - Prioridade (high/medium)</li>
                                      <li><code>message TEXT</code> - Mensagem descritiva</li>
                                      <li><code>affected_dates DATE[]</code> - Array de datas afetadas</li>
                                      <li><code>current_price NUMERIC</code> - Preço atual</li>
                                      <li><code>suggested_price NUMERIC</code> - Preço sugerido</li>
                                      <li><code>estimated_revenue_impact NUMERIC</code> - Impacto estimado na receita</li>
                                      <li><code>auto_apply BOOLEAN</code> - Se pode ser aplicado automaticamente</li>
                                      <li><code>category_id UUID</code> - ID da categoria</li>
                                      <li><code>category_name TEXT</code> - Nome da categoria</li>
                                      <li><code>date DATE</code> - Data específica da recomendação</li>
                                    </ul>
                                    <div className="mt-2"><strong>Fluxo de Execução Detalhado:</strong></div>
                                    <ol className="list-decimal list-inside ml-4 mt-1 space-y-1">
                                      <li><strong>Verificação de Habilitado:</strong> Busca <code>rate_system_settings</code> de <code>hotel_settings</code> e verifica se <code>enable_recommendations = true</code>. Se false, retorna vazio</li>
                                      <li><strong>Carrega Configurações:</strong> Extrai thresholds e percentages:
                                        <ul className="list-disc list-inside ml-4 mt-1">
                                          <li><code>high_occupancy_threshold</code> (padrão: 90%)</li>
                                          <li><code>low_occupancy_threshold</code> (padrão: 30%)</li>
                                          <li><code>price_increase_percentage</code> (padrão: 15%)</li>
                                          <li><code>price_decrease_percentage</code> (padrão: 10%)</li>
                                        </ul>
                                      </li>
                                      <li><strong>Itera sobre Categorias:</strong> Para cada categoria (ou categoria específica se <code>p_category_id</code> fornecido):
                                        <ul className="list-disc list-inside ml-4 mt-1">
                                          <li>Conta total de quartos na categoria</li>
                                          <li>Para cada data no período (p_start_date até p_end_date):</li>
                                        </ul>
                                      </li>
                                      <li><strong>Cálculo de Ocupação por Data:</strong>
                                        <pre className="bg-slate-100 p-1 rounded mt-1 text-xs overflow-x-auto">ocupação = (quartos_ocupados_na_data / total_quartos) * 100</pre>
                                      </li>
                                      <li><strong>Geração de Recomendações:</strong>
                                        <ul className="list-disc list-inside ml-4 mt-1">
                                          <li><strong>Alta Ocupação:</strong> Se ocupação &gt; high_occupancy_threshold:
                                            <ul className="list-disc list-inside ml-4 mt-1">
                                              <li>type = 'increase'</li>
                                              <li>suggested_price = current_price * (1 + price_increase_percentage / 100)</li>
                                              <li>priority = 'high' se impacto &gt; 1000, senão 'medium'</li>
                                            </ul>
                                          </li>
                                          <li><strong>Baixa Ocupação:</strong> Se ocupação &lt; low_occupancy_threshold:
                                            <ul className="list-disc list-inside ml-4 mt-1">
                                              <li>type = 'decrease'</li>
                                              <li>suggested_price = current_price * (1 - price_decrease_percentage / 100)</li>
                                              <li>priority = 'high' se impacto &gt; 1000, senão 'medium'</li>
                                            </ul>
                                          </li>
                                        </ul>
                                      </li>
                                      <li><strong>Cálculo de Impacto na Receita:</strong>
                                        <pre className="bg-slate-100 p-1 rounded mt-1 text-xs overflow-x-auto">impacto = (suggested_price - current_price) * quartos_disponíveis</pre>
                                      </li>
                                    </ol>
                                    <div className="mt-2"><strong>Como Configurar para Funcionar:</strong></div>
                                    <ol className="list-decimal list-inside ml-4 mt-1 space-y-1">
                                      <li>Acessar "Configurações do Sistema Tarifário" no menu</li>
                                      <li>Ativar "Habilitar Recomendações"</li>
                                      <li>Configurar thresholds e percentages conforme necessário</li>
                                      <li>Salvar configurações</li>
                                      <li>Acessar aba "Recomendações" em Análise e Métricas</li>
                                    </ol>
                                    <div className="mt-2"><strong>Exemplo de Uso (RPC):</strong></div>
                                    <pre className="bg-slate-100 p-2 rounded mt-1 text-xs overflow-x-auto">{`const { data, error } = await supabase.rpc('generate_rate_recommendations', {
  p_establishment_id: '123e4567-e89b-12d3-a456-426614174000',
  p_start_date: '2024-12-01',
  p_end_date: '2024-12-31',
  p_category_id: null // null para todas as categorias
});

// Retorna array de recomendações:
// [
//   {
//     type: 'increase',
//     priority: 'high',
//     message: 'Ocupação alta detectada...',
//     current_price: 200.00,
//     suggested_price: 230.00,
//     estimated_revenue_impact: 1500.00,
//     category_id: '...',
//     category_name: 'Standard',
//     date: '2024-12-25'
//   },
//   ...
// ]
console.log(data);`}</pre>
                                  </div>
                                </div>
                                <div className="border-l-2 border-purple-300 pl-3">
                                  <div className="font-semibold text-purple-900">apply_recommendation_price</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Parâmetros:</strong></div>
                                    <ul className="list-disc list-inside ml-4 mt-1">
                                      <li><code>p_establishment_id UUID</code> - ID do estabelecimento</li>
                                      <li><code>p_category_id UUID</code> - ID da categoria</li>
                                      <li><code>p_pricing_plan_id UUID</code> - ID do plano tarifário</li>
                                      <li><code>p_date DATE</code> - Data para aplicar o preço</li>
                                      <li><code>p_suggested_price NUMERIC</code> - Preço sugerido a aplicar</li>
                                    </ul>
                                    <div className="mt-2"><strong>Retorno:</strong> <code>BOOLEAN</code> - true se sucesso, false se erro (exceção capturada)</div>
                                    <div className="mt-2"><strong>Fluxo de Execução Detalhado:</strong></div>
                                    <ol className="list-decimal list-inside ml-4 mt-1 space-y-1">
                                      <li><strong>Verificação de Entrada Existente:</strong> Busca em <code>rate_calendar</code> usando chave única (establishment_id, category_id, pricing_plan_id, date)</li>
                                      <li><strong>Atualização ou Inserção:</strong>
                                        <ul className="list-disc list-inside ml-4 mt-1">
                                          <li><strong>Se existe:</strong> Executa UPDATE em <code>base_price</code> e <code>updated_at = NOW()</code></li>
                                          <li><strong>Se não existe:</strong> Executa INSERT com todos os campos obrigatórios e timestamps</li>
                                        </ul>
                                      </li>
                                      <li><strong>Tratamento de Erros:</strong> Captura exceções e retorna false em caso de erro (ex: violação de constraint, dados inválidos)</li>
                                    </ol>
                                    <div className="mt-2"><strong>Como Configurar para Funcionar:</strong></div>
                                    <ol className="list-decimal list-inside ml-4 mt-1 space-y-1">
                                      <li>Gerar recomendações usando <code>generate_rate_recommendations</code></li>
                                      <li>Exibir recomendações na interface (aba Recomendações)</li>
                                      <li>Ao clicar em "Aplicar Preço Sugerido", chamar esta função</li>
                                      <li>Recarregar recomendações após aplicação para atualizar lista</li>
                                    </ol>
                                    <div className="mt-2"><strong>Exemplo de Uso (RPC):</strong></div>
                                    <pre className="bg-slate-100 p-2 rounded mt-1 text-xs overflow-x-auto">{`const { data, error } = await supabase.rpc('apply_recommendation_price', {
  p_establishment_id: '123e4567-e89b-12d3-a456-426614174000',
  p_category_id: '789e0123-e45b-67c8-d901-234567890abc',
  p_pricing_plan_id: '456e7890-e12b-34c5-d678-901234567def', // ID do plano BAR
  p_date: '2024-12-25',
  p_suggested_price: 230.00
});

// Retorna: true (sucesso) ou false (erro)
if (data) {
  console.log('Preço aplicado com sucesso!');
  // Recarregar recomendações e calendário
} else {
  console.error('Erro ao aplicar preço:', error);
}`}</pre>
                                  </div>
                                </div>
                                <div className="border-l-2 border-amber-300 pl-3">
                                  <div className="font-semibold text-amber-900">company_has_feature_access</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Parâmetros:</strong></div>
                                    <ul className="list-disc list-inside ml-4 mt-1">
                                      <li><code>p_feature_key TEXT</code> - Chave da funcionalidade (ex: 'dynamic_pricing_automation')</li>
                                      <li><code>p_company_id UUID</code> - ID da empresa</li>
                                    </ul>
                                    <div className="mt-2"><strong>Retorno:</strong> <code>BOOLEAN</code> - true se a empresa tem acesso, false caso contrário</div>
                                    <div className="mt-2"><strong>Fluxo de Execução Detalhado:</strong></div>
                                    <ol className="list-decimal list-inside ml-4 mt-1 space-y-1">
                                      <li><strong>Busca Configuração Global:</strong> Busca <code>features_enabled</code> de <code>site_settings</code> (id fixo: '00000000-0000-0000-0000-000000000001')</li>
                                      <li><strong>Verificação de Existência:</strong> Se <code>features_enabled</code> é NULL ou não contém a chave, retorna false</li>
                                      <li><strong>Avaliação do Tipo:</strong>
                                        <ul className="list-disc list-inside ml-4 mt-1">
                                          <li><strong>Se boolean:</strong> Retorna o valor diretamente (funcionalidade global)</li>
                                          <li><strong>Se objeto:</strong> Verifica estrutura {`{enabled: boolean, company_ids: string[]}`}
                                            <ul className="list-disc list-inside ml-4 mt-1">
                                              <li>Se <code>enabled = false</code>, retorna false</li>
                                              <li>Se <code>company_ids</code> existe e não está vazio, verifica se <code>p_company_id</code> está na lista</li>
                                              <li>Se <code>company_ids</code> não existe ou está vazio, retorna true (habilitado para todas)</li>
                                            </ul>
                                          </li>
                                        </ul>
                                      </li>
                                    </ol>
                                    <div className="mt-2"><strong>Como Configurar para Funcionar:</strong></div>
                                    <ol className="list-decimal list-inside ml-4 mt-1 space-y-1">
                                      <li>Acessar Super Admin → Controle de Funcionalidades</li>
                                      <li>Ativar "Automação de Regras de Precificação Dinâmica"</li>
                                      <li>Selecionar empresas que podem usar a funcionalidade</li>
                                      <li>Salvar configurações (atualiza <code>site_settings.features_enabled</code>)</li>
                                    </ol>
                                    <div className="mt-2"><strong>Exemplo de Uso (RPC):</strong></div>
                                    <pre className="bg-slate-100 p-2 rounded mt-1 text-xs overflow-x-auto">{`const { data, error } = await supabase.rpc('company_has_feature_access', {
  p_feature_key: 'dynamic_pricing_automation',
  p_company_id: '123e4567-e89b-12d3-a456-426614174000'
});

// Retorna: true (tem acesso) ou false (não tem acesso)
if (data) {
  console.log('Empresa tem acesso à funcionalidade');
  // Permitir uso de regras dinâmicas
} else {
  console.log('Empresa não tem acesso');
  // Ocultar/desabilitar funcionalidade
}`}</pre>
                                    <div className="mt-2"><strong>Estrutura de features_enabled:</strong></div>
                                    <pre className="bg-slate-100 p-2 rounded mt-1 text-xs overflow-x-auto">{`{
  "api_integrations": true,  // Boolean: global
  "stripe": true,           // Boolean: global
  "dynamic_pricing_automation": {  // Objeto: por empresa
    "enabled": true,
    "company_ids": [
      "uuid-empresa-1",
      "uuid-empresa-2"
    ]
  }
}`}</pre>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div><strong>Rota Frontend:</strong> <code>/:establishmentId/tarifario</code></div>
                            <div><strong>Componentes React - Detalhamento:</strong>
                              <div className="mt-2 space-y-2 ml-4">
                                <div className="border-l-2 border-indigo-300 pl-3">
                                  <div className="font-semibold text-indigo-900">RateCalendarGrid</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Localização:</strong> <code>src/components/rate-system/RateCalendarGrid.tsx</code></div>
                                    <div className="mt-1"><strong>Funcionalidade:</strong> Grid interativo de calendário de tarifas com edição inline, aplicação de regras dinâmicas, e logs de atividade</div>
                                    <div className="mt-1"><strong>Props:</strong> categories, ratePlans, selectedDate, onDateChange</div>
                                  </div>
                                </div>
                                <div className="border-l-2 border-indigo-300 pl-3">
                                  <div className="font-semibold text-indigo-900">DynamicRuleDialog</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Localização:</strong> <code>src/components/rate-system/DynamicRuleDialog.tsx</code></div>
                                    <div className="mt-1"><strong>Funcionalidade:</strong> Dialog para criar/editar regras dinâmicas com seleção de trigger_type e configuração de condições específicas</div>
                                    <div className="mt-1"><strong>Props:</strong> open, onOpenChange, rule, onSave</div>
                                  </div>
                                </div>
                                <div className="border-l-2 border-indigo-300 pl-3">
                                  <div className="font-semibold text-indigo-900">BulkEditDialog</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Localização:</strong> <code>src/components/rate-system/BulkEditDialog.tsx</code></div>
                                    <div className="mt-1"><strong>Funcionalidade:</strong> Dialog multi-etapas para edição em lote: seleção de categorias/planos, período, e ajustes individuais por combinação</div>
                                    <div className="mt-1"><strong>Props:</strong> open, onOpenChange, categories, ratePlans, onSave</div>
                                  </div>
                                </div>
                                <div className="border-l-2 border-indigo-300 pl-3">
                                  <div className="font-semibold text-indigo-900">RateSystemSettingsDialog</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Localização:</strong> <code>src/components/rate-system/RateSystemSettingsDialog.tsx</code></div>
                                    <div className="mt-1"><strong>Funcionalidade:</strong> Configurações do sistema tarifário: auto_apply_dynamic_rules, enable_recommendations, thresholds, percentages. Verifica acesso a funcionalidades.</div>
                                    <div className="mt-1"><strong>Props:</strong> open, onOpenChange, establishmentId</div>
                                  </div>
                                </div>
                                <div className="border-l-2 border-indigo-300 pl-3">
                                  <div className="font-semibold text-indigo-900">RateAnalyticsView</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Localização:</strong> <code>src/components/rate-system/RateAnalyticsView.tsx</code></div>
                                    <div className="mt-1"><strong>Funcionalidade:</strong> Visualização de analytics (ADR, RevPAR, ocupação) e aba de recomendações com filtros e aplicação de preços sugeridos</div>
                                    <div className="mt-1"><strong>Props:</strong> categories, ratePlans</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div><strong>Hooks Customizados - Detalhamento:</strong>
                              <div className="mt-2 space-y-2 ml-4">
                                <div className="border-l-2 border-cyan-300 pl-3">
                                  <div className="font-semibold text-cyan-900">useRateSystem</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Localização:</strong> <code>src/hooks/useRateSystem.ts</code></div>
                                    <div className="mt-1"><strong>Funcionalidade:</strong> Hook principal para gestão de dados do sistema tarifário. Fornece queries e mutations para:</div>
                                    <ul className="list-disc list-inside ml-4 mt-1">
                                      <li>Buscar planos tarifários (<code>usePricingPlans</code>)</li>
                                      <li>Buscar calendário de tarifas (<code>useRateCalendar</code>)</li>
                                      <li>Buscar regras dinâmicas (<code>useDynamicPricingRules</code>)</li>
                                      <li>Salvar tarifas (<code>useSaveRate</code>)</li>
                                      <li>Buscar configurações (<code>useRateSystemSettings</code>)</li>
                                      <li>Salvar configurações (<code>useSaveRateSystemSettings</code>)</li>
                                    </ul>
                                  </div>
                                </div>
                                <div className="border-l-2 border-cyan-300 pl-3">
                                  <div className="font-semibold text-cyan-900">useRateRecommendations</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Localização:</strong> <code>src/hooks/useRateSystem.ts</code></div>
                                    <div className="mt-1"><strong>Funcionalidade:</strong> Hook para buscar recomendações de preços usando <code>generate_rate_recommendations</code>. Retorna dados, loading, error, e função refetch.</div>
                                    <div className="mt-1"><strong>Uso:</strong> <code>{`const { data, isLoading, error, refetch } = useRateRecommendations(establishmentId, startDate, endDate, categoryId)`}</code></div>
                                  </div>
                                </div>
                                <div className="border-l-2 border-cyan-300 pl-3">
                                  <div className="font-semibold text-cyan-900">applyRecommendationPrice</div>
                                  <div className="text-xs text-slate-600 mt-1">
                                    <div><strong>Localização:</strong> <code>src/hooks/useRateSystem.ts</code></div>
                                    <div className="mt-1"><strong>Funcionalidade:</strong> Função assíncrona para aplicar preço sugerido usando <code>apply_recommendation_price</code>. Retorna Promise&lt;boolean&gt;.</div>
                                    <div className="mt-1"><strong>Uso:</strong> <code>await applyRecommendationPrice(establishmentId, categoryId, planId, date, price)</code></div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div><strong>Pré-requisitos e Dependências:</strong>
                              <ul className="list-disc list-inside mt-1 ml-4 space-y-1">
                                <li><strong>Feature Flag:</strong> <code>dynamic_pricing_automation</code> deve estar habilitado em <code>site_settings.features_enabled</code> e na empresa específica (se aplicável)</li>
                                <li><strong>Configurações:</strong> <code>hotel_settings.rate_system_settings</code> deve existir com estrutura JSONB válida</li>
                                <li><strong>Tabelas:</strong> Todas as tabelas mencionadas devem existir e ter estrutura correta</li>
                                <li><strong>Permissões RLS:</strong> Usuário deve ter permissões SELECT/INSERT/UPDATE nas tabelas relevantes</li>
                                <li><strong>Dados:</strong> Categorias, planos tarifários e quartos devem estar cadastrados</li>
                              </ul>
                            </div>
                          </div>
                        </div>
                        <div className="p-3 bg-amber-50 rounded border border-amber-200">
                          <h4 className="font-semibold mb-2 text-amber-900">Controle de Funcionalidades:</h4>
                          <ul className="space-y-1 text-xs text-amber-800">
                            <li><strong>Super Admin:</strong> Pode ativar/desativar "Automação de Regras de Precificação Dinâmica"</li>
                            <li><strong>Seleção por Empresa:</strong> Permite escolher quais empresas podem usar a funcionalidade</li>
                            <li><strong>Verificação Automática:</strong> Sistema verifica acesso antes de aplicar regras dinâmicas</li>
                            <li><strong>Mensagem Informativa:</strong> Exibe mensagem quando funcionalidade não está disponível</li>
                            <li><strong>Armazenamento:</strong> Configuração salva em <code>companies.features_enabled</code> (JSONB)</li>
                          </ul>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Banco de Dados */}
          <TabsContent value="database" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Database className="h-6 w-6 text-primary" />
                Estrutura do Banco de Dados
              </h2>
              <div className="h-[600px] overflow-y-auto pr-4">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800">Tabelas Principais</h3>
                    <div className="space-y-4">
                      {[
                        {
                          name: "reservations",
                          description: "Armazena todas as reservas do sistema",
                          fields: "id, reservation_code, identification_number, checkin_date, checkout_date, status, total_amount, etc."
                        },
                        {
                          name: "clients",
                          description: "Cadastro de clientes/hóspedes",
                          fields: "id, full_name, email, phone, document_number, address, etc."
                        },
                        {
                          name: "rooms",
                          description: "Quartos/unidades disponíveis",
                          fields: "id, room_number, name, category_id, status, is_blocked, etc."
                        },
                        {
                          name: "payments",
                          description: "Registros de pagamentos",
                          fields: "id, reservation_id, amount, payment_method, payment_date, status, etc."
                        },
                        {
                          name: "hotel_settings",
                          description: "Configurações do estabelecimento",
                          fields: "establishment_id, name, address, phone, email, logo_url, signature_url, etc."
                        },
                        {
                          name: "email_templates",
                          description: "Templates de e-mail personalizáveis",
                          fields: "id, event_type, subject, body_html, is_active, etc."
                        },
                        {
                          name: "activity_logs",
                          description: "Logs de todas as atividades do sistema",
                          fields: "id, action_type, entity_type, entity_id, description, created_at, etc."
                        }
                      ].map((table) => (
                        <div key={table.name} className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                          <div className="flex items-center gap-2 mb-2">
                            <code className="font-mono font-semibold">{table.name}</code>
                            <Badge variant="outline">Tabela</Badge>
                          </div>
                          <p className="text-sm text-slate-600 mb-2">{table.description}</p>
                          <p className="text-xs text-slate-500">
                            <strong>Campos principais:</strong> {table.fields}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-lg font-semibold mb-3 text-slate-800">Segurança e Row Level Security (RLS)</h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded border-l-4 border-red-500">
                        <h4 className="font-semibold mb-2">Row Level Security (RLS)</h4>
                        <p className="text-sm text-slate-700 mb-3">
                          O sistema utiliza RLS do PostgreSQL para garantir que usuários só acessem dados
                          do seu estabelecimento. As políticas são aplicadas automaticamente em todas as queries.
                        </p>
                        <div className="space-y-2 text-xs">
                          <div>
                            <strong>Como funciona:</strong>
                            <ul className="list-disc list-inside mt-1 text-slate-600">
                              <li>Políticas RLS são definidas no banco de dados</li>
                              <li>Verificam o <code>establishment_id</code> do token JWT</li>
                              <li>Filtram automaticamente os resultados</li>
                              <li>Impedem acesso não autorizado mesmo se a query não filtrar</li>
                            </ul>
                          </div>
                          <div>
                            <strong>Exemplo de política RLS:</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{RLS_POLICY_EXAMPLE}
                            </pre>
                          </div>
                          <div>
                            <strong>Verificando RLS no token JWT:</strong>
                            <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{JWT_TOKEN_EXAMPLE}
                            </pre>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                        <h4 className="font-semibold mb-2">Autenticação e Autorização</h4>
                        <div className="space-y-2 text-xs">
                          <div>
                            <strong>Fluxo de autenticação:</strong>
                            <ol className="list-decimal list-inside mt-1 text-slate-600 space-y-1">
                              <li>Usuário faz login via Supabase Auth</li>
                              <li>Recebe JWT token com informações do usuário</li>
                              <li>Token é incluído em todas as requisições</li>
                              <li>Supabase valida o token e aplica políticas RLS</li>
                              <li>Dados são filtrados automaticamente por estabelecimento</li>
                            </ol>
                          </div>
                          <div>
                            <strong>Níveis de acesso:</strong>
                            <ul className="list-disc list-inside mt-1 text-slate-600">
                              <li><strong>Super Admin:</strong> Acesso a todos os estabelecimentos</li>
                              <li><strong>Manager:</strong> Acesso completo ao estabelecimento</li>
                              <li><strong>Employee:</strong> Acesso limitado (definido por permissões)</li>
                              <li><strong>Guest:</strong> Acesso apenas aos próprios dados</li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                        <h4 className="font-semibold mb-2">Isolamento de Dados</h4>
                        <p className="text-sm text-slate-700 mb-2">
                          Todos os dados são isolados por <code>establishment_id</code>. Mesmo que uma query
                          não especifique o filtro, o RLS garante que apenas dados do estabelecimento do usuário
                          sejam retornados.
                        </p>
                        <div className="text-xs">
                          <strong>Exemplo:</strong>
                          <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto">
{RLS_QUERY_EXAMPLE}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Integrações */}
          <TabsContent value="integrations" className="space-y-6">
            <Card className="p-6">
              <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
                <Zap className="h-6 w-6 text-primary" />
                Integrações Externas
              </h2>
              <div className="h-[600px] overflow-y-auto pr-4">
                <div className="space-y-6">
                  {/* Stripe */}
                  <div className="p-4 bg-slate-50 rounded border-l-4 border-green-500">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Stripe - Processamento de Pagamentos
                    </h3>
                    <p className="text-sm text-slate-700 mb-3">
                      Integração completa com Stripe para processamento seguro de pagamentos online via cartão de crédito, débito e outros métodos.
                    </p>
                    
                    <div className="space-y-3 text-xs">
                      <div>
                        <strong className="text-slate-800">Arquitetura:</strong>
                        <p className="text-slate-600 mt-1">
                          O sistema utiliza Edge Functions do Supabase para comunicação segura com a API do Stripe. 
                          As chaves secretas nunca são expostas ao frontend, garantindo segurança PCI-DSS compliant.
                        </p>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Fluxo de Pagamento:</strong>
                        <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto text-xs">
{STRIPE_INTEGRATION_DETAILS}
                        </pre>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Edge Functions Utilizadas:</strong>
                        <ul className="list-disc list-inside mt-1 text-slate-600 space-y-1">
                          <li><code>stripe-payment</code>: Cria Payment Intent e retorna client_secret</li>
                          <li><code>stripe-payment-status</code>: Verifica status atual do pagamento</li>
                          <li><code>stripe-refund</code>: Processa reembolsos parciais ou totais</li>
                          <li><code>stripe-webhook</code>: Recebe eventos do Stripe (succeeded, failed, refunded)</li>
                        </ul>
                      </div>
                      
                      <div className="mt-4">
                        <strong className="text-slate-800">Outras Edge Functions:</strong>
                        <ul className="list-disc list-inside mt-1 text-slate-600 space-y-1">
                          <li><code>get-reservation</code>: Busca informações completas de reserva por identificador/localizador</li>
                          <li><code>send-email-smtp</code>: Envio de emails via SMTP</li>
                          <li><code>send-email-resend</code>: Envio de emails via Resend API</li>
                        </ul>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Segurança:</strong>
                        <ul className="list-disc list-inside mt-1 text-slate-600 space-y-1">
                          <li>Chaves secretas armazenadas em Supabase Secrets (nunca expostas)</li>
                          <li>Validação de webhooks usando assinatura Stripe-Signature</li>
                          <li>Dados de cartão processados via Stripe.js (PCI compliant)</li>
                          <li>Nenhum dado sensível trafega pelo servidor da aplicação</li>
                        </ul>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Guia Completo de Configuração:</strong>
                        <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto text-xs">
{STRIPE_CONFIGURATION_GUIDE}
                        </pre>
                      </div>
                      
                      <div className="mt-3 space-y-2">
                        <div className="p-3 bg-blue-50 rounded border border-blue-200">
                          <strong className="text-blue-900 text-xs block mb-2">📋 Passo a Passo Detalhado:</strong>
                          <div className="space-y-2 text-xs text-blue-800">
                            <div>
                              <strong>1. No Stripe Dashboard:</strong>
                              <ol className="list-decimal list-inside ml-2 mt-1 space-y-1">
                                <li>Acesse <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="underline">dashboard.stripe.com</a> e faça login</li>
                                <li>Vá em <strong>Developers</strong> &gt; <strong>API keys</strong></li>
                                <li>Copie a <strong>Secret key</strong> (começa com <code>sk_test_</code> ou <code>sk_live_</code>)</li>
                                <li>Copie a <strong>Publishable key</strong> (começa com <code>pk_test_</code> ou <code>pk_live_</code>)</li>
                                <li>Vá em <strong>Developers</strong> &gt; <strong>Webhooks</strong></li>
                                <li>Clique em <strong>Add endpoint</strong></li>
                                <li>URL: <code>https://[seu-projeto].supabase.co/functions/v1/stripe-webhook</code></li>
                                <li>Selecione eventos: <code>payment_intent.succeeded</code>, <code>payment_intent.payment_failed</code>, <code>charge.refunded</code></li>
                                <li>Copie o <strong>Signing secret</strong> (começa com <code>whsec_</code>)</li>
                              </ol>
                            </div>
                            
                            <div>
                              <strong>2. No Supabase Dashboard:</strong>
                              <ol className="list-decimal list-inside ml-2 mt-1 space-y-1">
                                <li>Acesse seu projeto no <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="underline">Supabase Dashboard</a></li>
                                <li>Vá em <strong>Project Settings</strong> &gt; <strong>Edge Functions</strong></li>
                                <li>Certifique-se de que a função <code>stripe-payment</code> está criada e deployada</li>
                                <li>Vá em <strong>Project Settings</strong> &gt; <strong>Secrets</strong></li>
                                <li>Adicione os seguintes secrets:
                                  <ul className="list-disc list-inside ml-4 mt-1">
                                    <li><code>STRIPE_SECRET_KEY</code> = Cole a Secret key do Stripe</li>
                                    <li><code>STRIPE_WEBHOOK_SECRET</code> = Cole o Signing secret do webhook</li>
                                  </ul>
                                </li>
                                <li>Salve os secrets</li>
                              </ol>
                            </div>
                            
                            <div>
                              <strong>3. No PMS (Sistema):</strong>
                              <ol className="list-decimal list-inside ml-2 mt-1 space-y-1">
                                <li>Acesse <strong>Configurações</strong> &gt; <strong>Integrações</strong> &gt; <strong>Stripe</strong></li>
                                <li>Preencha os campos:
                                  <ul className="list-disc list-inside ml-4 mt-1">
                                    <li><strong>Public Key:</strong> Cole a Publishable key do Stripe (pk_test_... ou pk_live_...)</li>
                                    <li><strong>Modo:</strong> Selecione "Test" para desenvolvimento ou "Live" para produção</li>
                                  </ul>
                                </li>
                                <li><strong>Importante:</strong> NÃO preencha Secret Key ou Webhook Secret no PMS - eles já estão configurados em Supabase Secrets</li>
                                <li>Clique em <strong>Salvar</strong></li>
                              </ol>
                            </div>
                            
                            <div>
                              <strong>4. Teste a Configuração:</strong>
                              <ol className="list-decimal list-inside ml-2 mt-1 space-y-1">
                                <li>Crie uma reserva e tente processar um pagamento</li>
                                <li>Use cartão de teste do Stripe: <code>4242 4242 4242 4242</code></li>
                                <li>Verifique os logs no Stripe Dashboard em <strong>Developers</strong> &gt; <strong>Logs</strong></li>
                                <li>Confirme que o webhook foi recebido em <strong>Developers</strong> &gt; <strong>Webhooks</strong></li>
                                <li>Verifique se o pagamento aparece no PMS em <strong>Financeiro</strong> &gt; <strong>Pagamentos</strong></li>
                              </ol>
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-2 bg-amber-50 rounded text-xs text-amber-800">
                          <strong>⚠️ Importante:</strong> Use chaves de teste (sk_test_, pk_test_) durante desenvolvimento. 
                          Só mude para produção (sk_live_, pk_live_) quando estiver pronto para receber pagamentos reais.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Configurações de API */}
                  <div className="p-4 bg-slate-50 rounded border-l-4 border-purple-500">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <Key className="h-5 w-5" />
                      Configurações de API - Gerenciamento de Integrações
                    </h3>
                    <p className="text-sm text-slate-700 mb-3">
                      Sistema centralizado para gerenciar configurações de APIs externas (Booking Engine, Channel Manager, 
                      Payment Gateways, etc.). Permite armazenar credenciais de forma segura e usar em qualquer parte do sistema.
                    </p>
                    
                    <div className="space-y-3 text-xs">
                      <div>
                        <strong className="text-slate-800">Arquitetura:</strong>
                        <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto text-xs">
{API_SETTINGS_DETAILS}
                        </pre>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Funcionalidades:</strong>
                        <ul className="list-disc list-inside mt-1 text-slate-600 space-y-1">
                          <li><strong>Multi-tenant:</strong> Cada estabelecimento gerencia suas próprias configurações</li>
                          <li><strong>Segurança:</strong> Credenciais protegidas por RLS (Row Level Security)</li>
                          <li><strong>Flexibilidade:</strong> Campo JSON para configurações personalizadas por API</li>
                          <li><strong>Ativação/Desativação:</strong> Controle de quais integrações estão ativas</li>
                          <li><strong>Mascaramento:</strong> Secrets nunca expostos no frontend</li>
                          <li><strong>Observabilidade:</strong> Erros são logados automaticamente</li>
                        </ul>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">APIs Suportadas:</strong>
                        <div className="grid md:grid-cols-2 gap-3 mt-2">
                          {[
                            { 
                              name: "Booking Engine", 
                              desc: "Sincronização de reservas, disponibilidade e preços com motores de reserva externos",
                              apiName: "booking_engine"
                            },
                            { 
                              name: "Channel Manager", 
                              desc: "Gerenciamento de canais de distribuição, sincronização de inventário e tarifas",
                              apiName: "channel_manager"
                            },
                            { 
                              name: "Payment Gateway", 
                              desc: "Integração com gateways de pagamento alternativos ao Stripe",
                              apiName: "payment_gateway"
                            },
                            { 
                              name: "Amplifique", 
                              desc: "Integração específica com a plataforma Amplifique",
                              apiName: "amplifique"
                            },
                            { 
                              name: "Outras APIs", 
                              desc: "Configuração personalizada para qualquer API externa que o sistema precise integrar",
                              apiName: "other"
                            }
                          ].map((api) => (
                            <div key={api.name} className="p-3 bg-white rounded border border-slate-200">
                              <div className="font-semibold text-slate-800 mb-1">{api.name}</div>
                              <p className="text-xs text-slate-600 mb-2">{api.desc}</p>
                              <code className="text-xs bg-slate-100 px-1 rounded">{api.apiName}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Exemplos de Código:</strong>
                        <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto text-xs">
{API_SETTINGS_CODE_EXAMPLES}
                        </pre>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Estrutura da Tabela:</strong>
                        <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto text-xs">
{`api_settings {
  id: UUID (PK)
  establishment_id: UUID (FK)
  api_name: TEXT (booking_engine, channel_manager, etc.)
  api_url: TEXT (URL base da API)
  api_key: TEXT (Chave de API)
  api_secret: TEXT (Secret da API - mascarado)
  config: JSONB (Configurações adicionais)
  is_active: BOOLEAN (Ativo/Inativo)
  created_at: TIMESTAMPTZ
  updated_at: TIMESTAMPTZ
}`}
                        </pre>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Segurança:</strong>
                        <ul className="list-disc list-inside mt-1 text-slate-600 space-y-1">
                          <li><strong>RLS (Row Level Security):</strong> Usuários só veem configurações do seu estabelecimento</li>
                          <li><strong>Secrets Protegidos:</strong> API Secret nunca exposto no frontend</li>
                          <li><strong>Validação:</strong> Verificação de configuração antes de usar</li>
                          <li><strong>Logging:</strong> Erros são logados automaticamente com contexto</li>
                          <li><strong>Timeout e Retry:</strong> Configurável via campo JSON para resiliência</li>
                        </ul>
                      </div>
                      
                      <div className="mt-3 space-y-2">
                        <div className="p-3 bg-blue-50 rounded border border-blue-200">
                          <strong className="text-blue-900 text-xs block mb-2">📋 Como Configurar:</strong>
                          <div className="space-y-2 text-xs text-blue-800">
                            <div>
                              <strong>1. Acesse a Interface:</strong>
                              <ol className="list-decimal list-inside ml-2 mt-1 space-y-1">
                                <li>Vá em <strong>Configurações</strong> &gt; <strong>Integrações</strong></li>
                                <li>Clique na aba <strong>Configurações de API</strong></li>
                                <li>Clique em <strong>Nova Configuração</strong></li>
                              </ol>
                            </div>
                            
                            <div>
                              <strong>2. Preencha os Campos:</strong>
                              <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                                <li><strong>Nome da API:</strong> Selecione o tipo (Booking Engine, Channel Manager, etc.)</li>
                                <li><strong>URL:</strong> URL base da API (ex: https://api.bookingengine.com)</li>
                                <li><strong>API Key:</strong> Chave de autenticação fornecida pela API externa</li>
                                <li><strong>API Secret:</strong> Secret da API (será mascarado na interface)</li>
                                <li><strong>Config (JSON):</strong> Configurações adicionais (opcional):
                                  <pre className="mt-1 p-1 bg-blue-100 rounded text-xs">
{`{
  "timeout": 30000,
  "retry": 3,
  "retry_delay": 1000,
  "customHeader": "valor"
}`}
                                  </pre>
                                </li>
                                <li><strong>Ativo:</strong> Marque para ativar a integração</li>
                              </ul>
                            </div>
                            
                            <div>
                              <strong>3. Use no Código:</strong>
                              <pre className="mt-1 p-1 bg-blue-100 rounded text-xs">
{`// Em qualquer componente ou função
import { apiRequest } from "@/lib/apiClient";

// Fazer requisição
const data = await apiRequest("booking_engine", "/reservations", {
  method: "GET"
});`}
                              </pre>
                            </div>
                          </div>
                        </div>
                        
                        <div className="p-2 bg-green-50 rounded text-xs text-green-800">
                          <strong>✅ Benefícios:</strong>
                          <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                            <li>Centralização de todas as configurações de API em um só lugar</li>
                            <li>Facilita a manutenção e atualização de credenciais</li>
                            <li>Permite múltiplas integrações do mesmo tipo por estabelecimento</li>
                            <li>Reduz código duplicado com funções utilitárias reutilizáveis</li>
                            <li>Melhora a segurança com proteção por RLS</li>
                          </ul>
                        </div>
                        
                        <div className="p-2 bg-amber-50 rounded text-xs text-amber-800">
                          <strong>⚠️ Importante:</strong>
                          <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
                            <li>Nunca exponha API Secrets no frontend - use apenas em Edge Functions</li>
                            <li>Mantenha as credenciais atualizadas quando expirarem</li>
                            <li>Use o campo JSON para configurações específicas de cada API</li>
                            <li>Desative integrações que não estão mais em uso</li>
                            <li>Consulte <code className="bg-amber-100 px-1 rounded">docs/API_SETTINGS_USAGE.md</code> para exemplos completos</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* E-mail Providers */}
                  <div className="p-4 bg-slate-50 rounded border-l-4 border-blue-500">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Provedores de E-mail - Sistema de Envio
                    </h3>
                    <p className="text-sm text-slate-700 mb-3">
                      Sistema flexível de envio de e-mails com suporte a múltiplos provedores. Cada provedor 
                      utiliza Edge Functions específicas para garantir segurança e confiabilidade.
                    </p>
                    
                    <div className="space-y-3 text-xs">
                      <div>
                        <strong className="text-slate-800">Arquitetura de Envio:</strong>
                        <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto text-xs">
{EMAIL_PROVIDER_DETAILS}
                        </pre>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Provedores Suportados:</strong>
                        <div className="grid md:grid-cols-2 gap-3 mt-2">
                          {[
                            { 
                              name: "SMTP", 
                              desc: "Protocolo padrão. Requer Edge Function send-email-smtp. Suporta qualquer servidor SMTP (Gmail, Outlook, etc.)",
                              edgeFunction: "send-email-smtp"
                            },
                            { 
                              name: "Resend", 
                              desc: "API moderna e confiável. Requer Edge Function send-email-resend. Domínio verificado necessário para produção.",
                              edgeFunction: "send-email-resend"
                            },
                            { 
                              name: "SendGrid", 
                              desc: "Plataforma enterprise. API Key armazenada em secrets. Alta taxa de entrega.",
                              edgeFunction: "send-email-sendgrid"
                            },
                            { 
                              name: "Mailgun", 
                              desc: "Focado em transacional. API Key em secrets. Excelente para volumes altos.",
                              edgeFunction: "send-email-mailgun"
                            },
                            { 
                              name: "AWS SES", 
                              desc: "Serviço da Amazon. Credenciais AWS em secrets. Custo-benefício para grandes volumes.",
                              edgeFunction: "send-email-ses"
                            }
                          ].map((provider) => (
                            <div key={provider.name} className="p-3 bg-white rounded border border-slate-200">
                              <div className="font-semibold text-slate-800 mb-1">{provider.name}</div>
                              <p className="text-xs text-slate-600 mb-2">{provider.desc}</p>
                              <code className="text-xs bg-slate-100 px-1 rounded">{provider.edgeFunction}</code>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Sistema de Templates:</strong>
                        <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto text-xs">
{EMAIL_TEMPLATE_ENGINE}
                        </pre>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Fila de E-mails:</strong>
                        <ul className="list-disc list-inside mt-1 text-slate-600 space-y-1">
                          <li>E-mails são enfileirados na tabela <code>email_queue</code></li>
                          <li>Processamento assíncrono via Edge Functions</li>
                          <li>Retry automático em caso de falha</li>
                          <li>Logs detalhados em <code>email_logs</code></li>
                        </ul>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Variáveis de Template:</strong>
                        <p className="text-slate-600 mt-1">
                          Templates suportam variáveis dinâmicas como <code>{`{{guest_name}}`}</code>, <code>{`{{reservation_code}}`}</code>, 
                          <code>{`{{identification_number}}`}</code>, <code>{`{{checkin_date}}`}</code>, etc. 
                          Veja a lista completa em Configurações de E-mail &gt; Variáveis dos Templates.
                        </p>
                      </div>
                      
                      <div className="mt-3 p-2 bg-amber-50 rounded text-xs text-amber-800">
                        <strong>Configuração:</strong> Acesse Super Admin &gt; E-mails &gt; Configurações
                      </div>
                    </div>
                  </div>

                  {/* Webhooks */}
                  <div className="p-4 bg-slate-50 rounded border-l-4 border-purple-500">
                    <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      Webhooks - Integração com Serviços Externos
                    </h3>
                    <p className="text-sm text-slate-700 mb-3">
                      Sistema de webhooks para receber eventos de serviços externos e atualizar o sistema automaticamente.
                    </p>
                    
                    <div className="space-y-3 text-xs">
                      <div>
                        <strong className="text-slate-800">Arquitetura de Webhooks:</strong>
                        <pre className="mt-1 p-2 bg-slate-100 rounded overflow-x-auto text-xs">
{WEBHOOK_DETAILS}
                        </pre>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Webhooks Implementados:</strong>
                        <div className="space-y-3 mt-2">
                          <div className="p-3 bg-white rounded border border-slate-200">
                            <div className="font-semibold text-slate-800 mb-2">Stripe Webhook</div>
                            <ul className="list-disc list-inside text-slate-600 space-y-1 text-xs">
                              <li><strong>Endpoint:</strong> <code>/functions/v1/stripe-webhook</code></li>
                              <li><strong>Método:</strong> POST</li>
                              <li><strong>Autenticação:</strong> Validação de assinatura Stripe-Signature</li>
                              <li><strong>Eventos:</strong> payment_intent.succeeded, payment_intent.payment_failed, charge.refunded</li>
                              <li><strong>Ação:</strong> Atualiza status do pagamento na reserva e registra na tabela payments</li>
                            </ul>
                          </div>
                          
                          <div className="p-3 bg-white rounded border border-slate-200">
                            <div className="font-semibold text-slate-800 mb-2">Bukly Webhook (OTAs)</div>
                            <ul className="list-disc list-inside text-slate-600 space-y-1 text-xs">
                              <li><strong>Endpoint:</strong> <code>/functions/v1/bukly-webhook</code></li>
                              <li><strong>Método:</strong> POST</li>
                              <li><strong>Autenticação:</strong> API Key ou token específico</li>
                              <li><strong>Eventos:</strong> reservation.created, reservation.modified, reservation.cancelled</li>
                              <li><strong>Ação:</strong> Sincroniza reservas de OTAs (Booking.com, Expedia, etc.) com o sistema</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Segurança de Webhooks:</strong>
                        <ul className="list-disc list-inside mt-1 text-slate-600 space-y-1">
                          <li>Validação de assinatura para garantir autenticidade</li>
                          <li>Idempotência: eventos duplicados são ignorados</li>
                          <li>Rate limiting para prevenir abuso</li>
                          <li>Logs detalhados de todos os eventos recebidos</li>
                        </ul>
                      </div>
                      
                      <div>
                        <strong className="text-slate-800">Configuração:</strong>
                        <ul className="list-disc list-inside mt-1 text-slate-600 space-y-1">
                          <li>Configure URL do webhook no serviço externo (Stripe Dashboard, Bukly, etc.)</li>
                          <li>Adicione secrets de validação em Supabase Secrets</li>
                          <li>Teste webhook usando ferramentas de teste do provedor</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default Documentation;

