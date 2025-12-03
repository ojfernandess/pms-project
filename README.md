

## 🚀 Configuração Inicial

### Pré-requisitos

- Node.js (versão 18 ou superior) - [instalar com nvm](https://github.com/nvm-sh/nvm#installing-and-updating)
- npm ou yarn
- Conta no Supabase (para banco de dados)

### Instalação

```sh
# 1. Instalar as dependências
npm install

# 2. Configurar variáveis de ambiente
# Crie um arquivo .env na raiz do projeto com as seguintes variáveis:

VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica-aqui
VITE_SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui  # Opcional
VITE_APP_URL=http://localhost:8080  # Opcional

# 3. Executar o servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:8080`

### Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

- `VITE_SUPABASE_URL`: URL do seu projeto Supabase
- `VITE_SUPABASE_PUBLISHABLE_KEY`: Chave pública (anon key) do Supabase
- `VITE_SUPABASE_SERVICE_ROLE_KEY`: Chave de serviço (opcional, necessária para operações administrativas)
- `VITE_APP_URL`: URL da aplicação (usado para links em emails)

⚠️ **Importante**: A Service Role Key nunca deve ser exposta no frontend em produção. Use apenas em Edge Functions ou APIs seguras.

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/4a6a91fc-f4c7-4731-a631-3f86bb404698) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Configure environment variables (see above)

# Step 5: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/4a6a91fc-f4c7-4731-a631-3f86bb404698) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## 📡 APIs e Endpoints

### Edge Functions do Supabase

O sistema utiliza Edge Functions do Supabase para operações serverless. As principais funções disponíveis são:

#### 1. Get Reservation API (`/functions/v1/get-reservation`)

Endpoint para buscar informações completas de reserva por identificador, localizador ou reservation_code.

**Características:**
- ✅ Suporta métodos GET e POST
- ✅ Autenticação obrigatória (usuário admin/user ou guest_account)
- ✅ Busca flexível por múltiplos identificadores
- ✅ Retorna dados completos da reserva

**Parâmetros de busca:**
- `identifier`: identification_number da reserva
- `locator`: reservation_code ou locator do web_checkin
- `reservation_code`: reservation_code da reserva

**Autenticação:**
- Token de usuário admin/user (Bearer token)
- `guest_account_id` para hóspedes autenticados

**Dados retornados:**
- Informações básicas da reserva
- Dados do hóspede e responsável financeiro
- Informações do quarto e categoria
- Dados do estabelecimento
- Histórico de pagamentos
- Status do web check-in

**Exemplo de uso no frontend:**
```typescript
import { useReservationApi } from "@/hooks/useReservationApi";

function MyComponent() {
  const { useGetReservationByLocator } = useReservationApi();
  
  const { data, isLoading, error } = useGetReservationByLocator("RSV742516");
  
  if (isLoading) return <p>Carregando...</p>;
  if (error) return <p>Erro: {error.message}</p>;
  
  return (
    <div>
      <h2>Reserva: {data?.reservation.reservation_code}</h2>
      <p>Hóspede: {data?.reservation.guest?.full_name}</p>
    </div>
  );
}
```

**Documentação completa:** Veja [supabase/functions/get-reservation/README.md](./supabase/functions/get-reservation/README.md)

#### 2. Email Functions

- **Send Email SMTP** (`/functions/v1/send-email-smtp`): Envio de emails via SMTP
- **Send Email Resend** (`/functions/v1/send-email-resend`): Envio de emails via Resend

#### 3. Stripe Integration

- **Stripe Payment** (`/functions/v1/stripe-payment`): Processamento de pagamentos
- **Stripe Webhook** (`/functions/v1/stripe-webhook`): Webhooks do Stripe
- **Stripe Payment Status** (`/functions/v1/stripe-payment-status`): Verificação de status de pagamento
- **Stripe Refund** (`/functions/v1/stripe-refund`): Processamento de reembolsos

### Hooks do Frontend

O sistema possui hooks React para facilitar o uso das APIs:

#### `useReservationApi`

Hook para buscar informações de reserva usando o endpoint API.

**Métodos disponíveis:**
- `useGetReservation(params, requireAuth)`: Busca genérica
- `useGetReservationByIdentifier(identifier, requireAuth)`: Busca por identification_number
- `useGetReservationByLocator(locator, requireAuth)`: Busca por localizador
- `useGetReservationByCode(reservationCode, requireAuth)`: Busca por reservation_code
- `fetchReservation`: Mutation para busca manual

**Localização:** `src/hooks/useReservationApi.ts`

#### `useWebCheckin`

Hook para gerenciar o processo de web check-in.

**Métodos disponíveis:**
- `getWebCheckinByLocator(locator, requireAuth)`: Busca web check-in por localizador
- `getWebCheckinByToken(token, requireAuth)`: Busca web check-in por token
- `startWebCheckin`: Inicia o processo de check-in
- `saveGuests`: Salva dados dos hóspedes
- `saveDocuments`: Salva documentos dos hóspedes
- `savePreferences`: Salva preferências
- `completeWebCheckin`: Completa o check-in

**Localização:** `src/hooks/useWebCheckin.ts`

## 🔐 Segurança e Autenticação

### Autenticação de Usuários

O sistema suporta dois tipos de autenticação:

1. **Usuários Admin/User**: Autenticação via Supabase Auth com tokens JWT
2. **Hóspedes (Guest Accounts)**: Autenticação via `guest_account_id` armazenado no localStorage

### Controle de Acesso

- **Usuários admin/user**: Podem acessar todas as reservas
- **Hóspedes**: Podem acessar apenas reservas vinculadas à sua conta (`guest_stay_history`)

### Row Level Security (RLS)

O banco de dados utiliza RLS do Supabase para garantir que:
- Hóspedes só vejam suas próprias reservas
- Dados sensíveis sejam protegidos
- Operações sejam validadas no nível do banco

## 📚 Documentação

### 📖 Índice Completo
- **[Índice de Documentação](./docs/INDEX.md)** - Navegue por toda a documentação do sistema

### 📡 Documentação de APIs
- **[Documentação Completa de APIs](./docs/API_DOCUMENTATION.md)** ⭐ - Guia completo de todas as APIs e endpoints disponíveis
- [Get Reservation API README](./supabase/functions/get-reservation/README.md) - Documentação detalhada do endpoint de reservas

### 💳 Integrações
- [Guia de Configuração do Stripe](./GUIA_CONFIGURACAO_STRIPE.md)
- [Sistema de Emails Implementado](./SISTEMA_EMAILS_IMPLEMENTADO.md)
- [Features do Web Check-in para Hóspedes](./GUEST_WEB_CHECKIN_FEATURES.md)

### 🗺️ Planejamento
- [Roadmap do Projeto](./ROADMAP.md)

### 📝 Outros Documentos
- [Guia de Edge Functions SMTP](./GUIA_EDGE_FUNCTION_SMTP.md)
- [Guia de Edge Functions Resend](./GUIA_RESEND_EDGE_FUNCTION.md)
