# 🚀 Como Criar a Edge Function para Resend - Passo a Passo Visual

## ⚠️ IMPORTANTE: Você PRECISA criar esta função no Supabase!

O erro que você está vendo significa que a Edge Function `send-email-resend` **não existe ainda** no seu projeto Supabase.

## 📋 Passo a Passo Detalhado

### Passo 1: Acessar o Supabase Dashboard

1. Abra seu navegador
2. Vá para: **https://app.supabase.com**
3. Faça login na sua conta
4. **Selecione seu projeto** (o mesmo que você usa no PMS)

### Passo 2: Encontrar Edge Functions

1. No **menu lateral esquerdo**, procure por uma das opções:
   - **"Edge Functions"** ⭐ (mais comum)
   - **"Functions"**
   - **"Serverless Functions"**
   - **"Functions"** (dentro de "Develop")

2. **Clique** para abrir

### Passo 3: Criar Nova Função

1. Você verá uma lista de funções (pode estar vazia)
2. Procure por um dos botões:
   - **"Create a new function"** ⭐
   - **"+ New Function"**
   - **"New Function"**
   - **"Create Function"**
   - Um botão **"+"** ou **"Add"**

3. **Clique** no botão

### Passo 4: Configurar a Função

1. Uma janela ou página abrirá pedindo:
   - **Nome da função:** Digite exatamente: `send-email-resend`
     - ⚠️ **IMPORTANTE:** Tudo minúsculo, sem espaços, sem maiúsculas
     - ✅ Correto: `send-email-resend`
     - ❌ Errado: `Send-Email-Resend`, `send_email_resend`, `send-email-resend ` (com espaço)

2. Clique em **"Create"** ou **"Deploy"**

### Passo 5: Adicionar o Código

1. Um **editor de código** abrirá (pode ter código padrão)
2. **DELETE TODO o conteúdo** que estiver lá (Ctrl+A, Delete)
3. Abra o arquivo neste projeto: `supabase/functions/send-email-resend/index.ts`
4. **Selecione TODO o conteúdo** (Ctrl+A)
5. **Copie** (Ctrl+C)
6. **Cole no editor do Supabase** (Ctrl+V)
7. **Verifique** se o código foi colado (deve ter ~176 linhas)

### Passo 6: Fazer Deploy

1. Procure por um botão:
   - **"Deploy"** ⭐ (mais comum)
   - **"Save"**
   - **"Save and Deploy"**
   - **"Publish"**

2. **Clique** no botão
3. **Aguarde** o deploy (pode levar 30-60 segundos)
4. Você verá uma mensagem de sucesso ou a função aparecerá como **"Active"**

### Passo 7: Verificar

1. A função `send-email-resend` deve aparecer na **lista de Edge Functions**
2. O status deve estar como:
   - **"Active"** ✅
   - **"Deployed"** ✅
   - **"Running"** ✅

3. Se aparecer erro, **clique na função** para ver os logs

## 🎯 Depois de Criar a Função

1. **Aguarde 1-2 minutos** para a função ficar totalmente ativa
2. **Configure o Resend no PMS:**
   - Acesse: **SuperAdmin > E-mails > Configurações**
   - Selecione: **Resend** como provedor
   - Cole sua **API Key** do Resend
   - Configure **E-mail do Remetente**
   - Ative **"Ativar Envio de E-mails"**
   - Clique em **Salvar**

3. **Teste:**
   - Clique em **"Testar Configuração"**
   - Deve funcionar! ✅

## ❓ Problemas Comuns

### "Não encontro Edge Functions no menu"

- Procure em **"Develop"** ou **"Development"**
- Alguns projetos têm em **"Functions"** ou **"Serverless"**
- Use a busca do dashboard (lupa) e digite "edge"

### "O botão Create não aparece"

- Verifique se você tem permissão de administrador no projeto
- Tente atualizar a página (F5)
- Verifique se está no projeto correto

### "Erro ao fazer deploy"

- Verifique se o código foi colado corretamente
- Certifique-se de que não há erros de sintaxe
- Tente fazer deploy novamente
- Verifique os logs de erro

### "Função criada mas ainda dá erro"

- Aguarde 1-2 minutos após o deploy
- Verifique se o nome é exatamente `send-email-resend`
- Tente recarregar a página do PMS (F5)
- Verifique os logs da função no Supabase

## 📸 Onde Está no Dashboard?

A localização exata pode variar, mas geralmente está em:

```
Supabase Dashboard
├── Menu Lateral
    ├── [Ícone de ⚡ ou 🔧] Edge Functions
    └── [Lista de funções]
        └── [+ New Function] ou [Create Function]
```

## ✅ Checklist Final

Antes de testar, verifique:

- [ ] Função `send-email-resend` criada no Supabase
- [ ] Status da função está como "Active" ou "Deployed"
- [ ] Código foi colado corretamente (sem erros)
- [ ] Aguardou 1-2 minutos após o deploy
- [ ] Configurou Resend no PMS com API Key válida
- [ ] E-mail do remetente está configurado

## 🆘 Ainda Não Funciona?

1. **Verifique os logs:**
   - No Supabase Dashboard > Edge Functions > send-email-resend
   - Clique em **"Logs"** ou **"Invocations"**
   - Veja se há erros

2. **Teste a função manualmente:**
   - No Supabase Dashboard, clique na função
   - Procure por **"Invoke"** ou **"Test"**
   - Tente invocar com dados de teste

3. **Verifique a API Key do Resend:**
   - Certifique-se de que a chave está correta
   - Verifique se a chave está ativa no Resend

---

**Lembre-se:** A Edge Function **DEVE** ser criada no Supabase para o Resend funcionar!

