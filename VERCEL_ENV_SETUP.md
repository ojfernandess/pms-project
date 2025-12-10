# Configuração de Variáveis de Ambiente no Vercel

Este guia explica como configurar as variáveis de ambiente no Vercel para resolver o aviso sobre a URL do Supabase não encontrada.

## ⚠️ Aviso sobre Meta Tags Open Graph

Se você está vendo o aviso:
```
URL do Supabase não encontrada. Meta tags Open Graph não serão atualizadas via script inline.
```

Isso significa que a aplicação não conseguiu encontrar a URL do Supabase para atualizar as meta tags Open Graph dinamicamente. Isso não afeta a funcionalidade da aplicação, mas as meta tags podem não ser atualizadas corretamente para compartilhamento em redes sociais.

## 🔧 Solução: Configurar Variáveis de Ambiente no Vercel

### Passo 1: Acessar as Configurações do Projeto

1. Acesse o [Dashboard do Vercel](https://vercel.com/dashboard)
2. Selecione seu projeto
3. Vá em **Settings** → **Environment Variables**

### Passo 2: Adicionar Variáveis de Ambiente

Adicione as seguintes variáveis de ambiente:

#### Variável Obrigatória:
- **Nome**: `VITE_SUPABASE_URL`
- **Valor**: A URL do seu projeto Supabase (ex: `https://xxxxx.supabase.co`)
- **Ambientes**: Selecione todos (Production, Preview, Development)

#### Variáveis Opcionais (mas recomendadas):
- **Nome**: `VITE_SUPABASE_PUBLISHABLE_KEY`
- **Valor**: Sua chave pública (anon key) do Supabase
- **Ambientes**: Todos

- **Nome**: `VITE_APP_URL`
- **Valor**: A URL da sua aplicação em produção (ex: `https://seu-app.vercel.app`)
- **Ambientes**: Production

### Passo 3: Fazer Redeploy

Após adicionar as variáveis:

1. Vá para a aba **Deployments**
2. Clique nos três pontos (⋯) do deployment mais recente
3. Selecione **Redeploy**
4. Confirme o redeploy

**Nota**: As variáveis de ambiente são injetadas durante o build, então é necessário fazer um novo deploy para que as mudanças tenham efeito.

## 🔍 Verificação

Após o redeploy, o aviso não deve mais aparecer no console. Você pode verificar:

1. Abra o DevTools do navegador (F12)
2. Vá para a aba **Console**
3. O aviso não deve mais aparecer

## 📝 Alternativa: Usar API Route

Se você não quiser configurar a variável de ambiente, a aplicação tentará usar automaticamente a API route `/api/get-site-settings`, que já está configurada e usa as variáveis de ambiente do servidor.

A API route é a estratégia preferida e será tentada primeiro antes de usar a URL do Supabase diretamente no cliente.

## 🛠️ Desenvolvimento Local

Para desenvolvimento local, crie um arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sua-chave-publica-aqui
VITE_APP_URL=http://localhost:8080
```

O plugin do Vite injetará automaticamente essas variáveis no HTML durante o build.

## 📚 Referências

- [Documentação do Vercel sobre Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Documentação do Supabase](https://supabase.com/docs)


