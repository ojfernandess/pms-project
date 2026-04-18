# 📧 Guia: Configurar Edge Function para Resend

## 🎯 Por que precisa de Edge Function?

O Resend bloqueia requisições diretas do navegador (CORS) por segurança. A Edge Function funciona como um **proxy seguro** que:
- Mantém sua API Key segura no servidor
- Evita problemas de CORS
- Permite envio de e-mails do frontend

## 🚀 Como Criar a Edge Function

### Método 1: Via Supabase Dashboard (Recomendado) ⭐

1. **Acesse o Supabase Dashboard**
   - Vá em [https://app.supabase.com](https://app.supabase.com)
   - Faça login e selecione seu projeto

2. **Navegar para Edge Functions**
   - No menu lateral esquerdo, procure **"Edge Functions"**
   - Se não encontrar, pode estar em **"Functions"** ou **"Serverless Functions"**
   - Clique para abrir

3. **Criar Nova Função**
   - Clique no botão **"Create a new function"** ou **"+ New Function"** ou **"New Function"**
   - **Nome da função:** `send-email-resend` (exatamente assim, sem espaços, tudo minúsculo)
   - Clique em **"Create"** ou **"Deploy"**

4. **Adicionar o Código**
   - No editor de código que abrir, **DELETE TODO o conteúdo padrão** (se houver)
   - Abra o arquivo `supabase/functions/send-email-resend/index.ts` deste projeto
   - Selecione TODO o conteúdo (Ctrl+A)
   - Copie (Ctrl+C)
   - Cole no editor do Supabase (Ctrl+V)
   - **Verifique** se o código foi colado corretamente

5. **Deploy**
   - Clique no botão **"Deploy"** ou **"Save"** (geralmente no canto superior direito)
   - Aguarde o deploy (pode levar 30-60 segundos)
   - Você verá uma mensagem de sucesso ou a função aparecerá como **"Active"** ou **"Deployed"**

6. **Verificar**
   - A função `send-email-resend` deve aparecer na lista de Edge Functions
   - Status deve estar como **"Active"** ou **"Deployed"**
   - Se aparecer erro, verifique os logs clicando na função

### Método 2: Via Supabase CLI

```bash
# 1. Navegar para a raiz do projeto
cd c:\Users\suporte.tecnico\Downloads\pms-project-main

# 2. Deploy da função
supabase functions deploy send-email-resend
```

## ✅ Testar

1. **Configure o Resend no PMS:**
   - Acesse **SuperAdmin > E-mails > Configurações**
   - Selecione **Resend** como provedor
   - Cole sua **API Key** do Resend
   - Configure **E-mail do Remetente** (deve ser de domínio verificado)
   - Ative **"Ativar Envio de E-mails"**
   - Clique em **Salvar**

2. **Teste:**
   - Clique em **"Testar Configuração"**
   - Informe um e-mail de teste
   - Deve funcionar! ✅

## 🔑 Obter API Key do Resend

1. Acesse [https://resend.com](https://resend.com)
2. Faça login ou crie uma conta
3. Vá em **API Keys**
4. Clique em **Create API Key**
5. Dê um nome (ex: "PMS Production")
6. Copie a chave gerada
7. **Importante:** Guarde a chave, ela só aparece uma vez!

## 📧 Verificar Domínio no Resend

Para usar seu próprio domínio:

1. No Resend, vá em **Domains**
2. Clique em **Add Domain**
3. Digite seu domínio (ex: `seudominio.com`)
4. Configure os registros DNS conforme instruções
5. Aguarde a verificação (pode levar algumas horas)

**Ou use o domínio de teste:**
- O Resend fornece um domínio de teste temporário
- Funciona para testes, mas e-mails podem ir para spam
- Para produção, use seu próprio domínio verificado

## ⚠️ Problemas Comuns

### Erro: "Function not found"

- Verifique se a função foi deployada corretamente
- Verifique o nome: deve ser exatamente `send-email-resend`
- Aguarde alguns minutos após o deploy

### Erro: "API Key inválida"

- Verifique se copiou a API Key corretamente
- Certifique-se de que a chave está ativa no Resend
- Gere uma nova chave se necessário

### Erro: "Dados inválidos" ou "domínio não verificado"

- O e-mail do remetente deve ser de um domínio verificado no Resend
- Use o domínio de teste do Resend para testes
- Para produção, verifique seu domínio no Resend

### Erro: "CORS policy" ou "preflight request doesn't pass"

- **Causa:** A Edge Function não está respondendo corretamente ao preflight (OPTIONS)
- **Solução:**
  1. Verifique se a Edge Function foi deployada corretamente
  2. Certifique-se de que o código inclui o tratamento de OPTIONS (já está no código)
  3. Verifique os logs da Edge Function no Supabase Dashboard
  4. Tente fazer o deploy novamente
  5. Aguarde 1-2 minutos após o deploy e tente novamente

### Erro: "Function not found" ou "404"

- Verifique se o nome da função é exatamente `send-email-resend` (sem espaços, tudo minúsculo)
- Certifique-se de que a função foi deployada (aparece na lista)
- Aguarde alguns minutos após criar a função

## 🎉 Pronto!

Depois de criar a Edge Function, o Resend funcionará perfeitamente no PMS!

---

**Arquivo:** `supabase/functions/send-email-resend/index.ts`
**Status:** Pronto para deploy

