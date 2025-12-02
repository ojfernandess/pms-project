

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
