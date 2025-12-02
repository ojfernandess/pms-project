# 📧 Guia: Como Configurar Edge Function SMTP no Supabase

## 🎯 Objetivo

Criar uma Edge Function no Supabase para enviar e-mails via SMTP, permitindo usar servidores SMTP personalizados (Gmail, Outlook, etc.).

## 📋 Pré-requisitos

1. Conta no Supabase
2. Projeto Supabase criado
3. Supabase CLI instalado (opcional, mas recomendado)

## 🚀 Método 1: Via Supabase Dashboard (Mais Fácil) ⭐ RECOMENDADO

### Passo 1: Acessar o Dashboard

1. Acesse [https://app.supabase.com](https://app.supabase.com)
2. Faça login na sua conta
3. Selecione seu projeto (o mesmo do PMS)

### Passo 2: Criar a Edge Function

1. No menu lateral esquerdo, procure por **Edge Functions**
2. Se não encontrar, pode estar em **Functions** ou **Serverless Functions**
3. Clique no botão **Create a new function** ou **New Function** ou **+ New Function**
4. Nome da função: `send-email-smtp` (exatamente este nome)
5. Clique em **Create** ou **Deploy**

### Passo 3: Adicionar o Código

1. No editor de código que abrir, **delete todo o conteúdo padrão**
2. Abra o arquivo `supabase/functions/send-email-smtp/index.ts` deste projeto
3. **Copie TODO o conteúdo** do arquivo
4. **Cole no editor** do Supabase Dashboard
5. Clique em **Deploy** ou **Save**

### Passo 4: Verificar

1. A função deve aparecer na lista de Edge Functions
2. Status deve estar como "Active" ou "Deployed"
3. Você pode testar clicando em "Invoke" (opcional)

## 🛠️ Método 2: Via Supabase CLI (Avançado)

### Passo 1: Instalar Supabase CLI

```bash
# Windows (PowerShell)
npm install -g supabase

# Ou usando Scoop
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Passo 2: Fazer Login

```bash
supabase login
```

Isso abrirá o navegador para autenticação.

### Passo 3: Linkar ao Projeto

```bash
# Obter o project-ref do seu projeto
# Está na URL: https://app.supabase.com/project/[PROJECT-REF]
# Exemplo: spccmzvizaobinccqpvn (do seu .env)
supabase link --project-ref spccmzvizaobinccqpvn
```

### Passo 4: Deploy da Função

```bash
# Navegar para a raiz do projeto (onde está a pasta supabase/)
cd c:\Users\suporte.tecnico\Downloads\pms-project-main

# Deploy da função
supabase functions deploy send-email-smtp
```

**Nota:** O Método 1 (Dashboard) é mais fácil e recomendado!

## ✅ Verificar se Funcionou

### Teste Manual

1. **Aguarde 1-2 minutos** após o deploy para a função ficar ativa
2. Acesse **SuperAdmin > E-mails > Configurações** no PMS
3. Configure SMTP:
   - **Provedor:** SMTP
   - **Host:** smtp.gmail.com (exemplo)
   - **Porta:** 587 (TLS) ou 465 (SSL)
   - **Usuário:** seu-email@gmail.com
   - **Senha:** App Password (não a senha normal do Gmail)
   - **Ativar SSL/TLS:** Sim (marcar)
   - **E-mail do Remetente:** seu-email@gmail.com
   - **Nome do Remetente:** Seu Nome
   - **Ativar Envio de E-mails:** Sim (marcar)
4. Clique em **Salvar Configurações**
5. Clique em **Testar Configuração**
6. Informe um e-mail de teste
7. Se funcionar, você verá **"E-mail de teste enviado com sucesso!"**

### Verificar Logs

Se der erro, verifique:
1. **Supabase Dashboard > Edge Functions > send-email-smtp > Logs**
2. Veja os erros detalhados
3. **SuperAdmin > E-mails > Fila** - veja o status do e-mail
4. **SuperAdmin > E-mails > Logs** - veja o histórico completo

## 📝 Passo a Passo Detalhado (Dashboard)

### 1. Acessar Edge Functions

1. Abra [https://app.supabase.com](https://app.supabase.com)
2. Selecione seu projeto
3. No menu lateral, procure **"Edge Functions"** ou **"Functions"**
4. Clique para abrir

### 2. Criar Nova Função

1. Clique em **"Create a new function"** ou **"+ New Function"**
2. Nome: `send-email-smtp` (exatamente assim, sem espaços)
3. Clique em **"Create"** ou **"Deploy"**

### 3. Copiar o Código

1. Abra o arquivo `supabase/functions/send-email-smtp/index.ts` deste projeto
2. Selecione TODO o conteúdo (Ctrl+A)
3. Copie (Ctrl+C)
4. No editor do Supabase, delete tudo que estiver lá
5. Cole o código copiado (Ctrl+V)

### 4. Deploy

1. Clique em **"Deploy"** ou **"Save"**
2. Aguarde o deploy (pode levar 30-60 segundos)
3. Verifique se aparece "Deployed" ou "Active"

## 🔧 Configurações SMTP Comuns

### Gmail

```
Host: smtp.gmail.com
Porta: 587 (TLS) ou 465 (SSL)
Usuário: seu-email@gmail.com
Senha: App Password (não a senha normal)
Secure: Sim (marcar)
```

**Como criar App Password no Gmail:**
1. Acesse [Google Account](https://myaccount.google.com)
2. Vá em **Segurança**
3. Ative **Verificação em duas etapas** (se não estiver ativa)
4. Procure por **"Senhas de app"** ou **"App passwords"**
5. Selecione **"E-mail"** e **"Outro (nome personalizado)"**
6. Digite "PMS" como nome
7. Clique em **"Gerar"**
8. Copie a senha gerada (16 caracteres)
9. Use essa senha no campo "Senha" do PMS

### Outlook/Hotmail

```
Host: smtp-mail.outlook.com
Porta: 587
Usuário: seu-email@outlook.com
Senha: sua-senha
```

### Servidor SMTP Personalizado

```
Host: smtp.seudominio.com
Porta: 587 ou 465
Usuário: seu-usuario
Senha: sua-senha
```

## ⚠️ Problemas Comuns

### Erro: "Function not found"

- Verifique se a função foi deployada corretamente
- Verifique o nome da função (deve ser exatamente `send-email-smtp`)
- Aguarde alguns minutos após o deploy

### Erro: "CORS policy"

- A função deve ter os headers CORS configurados (já está no código)
- Verifique se a função está ativa no dashboard

### Erro: "SMTP Authentication failed" ou "535"

- Verifique usuário e senha
- Para Gmail, use **App Password**, não a senha normal
- Verifique se a autenticação de 2 fatores está ativada (Gmail)
- Gmail requer App Password quando 2FA está ativado

### Erro: "Connection timeout" ou "ECONNREFUSED"

- Verifique se o host e porta estão corretos
- Verifique firewall/proxy
- Tente porta 465 (SSL) em vez de 587 (TLS)
- Alguns provedores bloqueiam conexões de servidores não autorizados

### Erro: "bufio: caught error from readSlice()" ou "SmtpClient is not a constructor"

- Este erro indica problema de compatibilidade da biblioteca SMTP com Deno
- As bibliotecas SMTP para Deno ainda estão em desenvolvimento e podem ter problemas
- **Solução Recomendada:** Use **Resend, SendGrid ou Mailgun** que funcionam diretamente do frontend
- **Alternativa:** Se precisar usar SMTP, tente diferentes portas (465 ou 587) e verifique as configurações
- **Nota:** SMTP via Edge Function pode ser instável devido a incompatibilidades de bibliotecas

### Erro: "TLS/SSL certificate"

- Problema com certificado SSL do servidor SMTP
- Tente desabilitar verificação de certificado (não recomendado para produção)
- Use porta 465 (SSL) que geralmente funciona melhor

## 🔄 Alternativa: Usar SendGrid/Resend/Mailgun

Se tiver problemas com SMTP, recomenda-se usar provedores que funcionam diretamente do frontend:

1. **Resend** (Recomendado)
   - Grátis até 3.000 e-mails/mês
   - Fácil configuração
   - API Key direta

2. **SendGrid**
   - Grátis até 100 e-mails/dia
   - API robusta

3. **Mailgun**
   - Grátis até 5.000 e-mails/mês (primeiros 3 meses)
   - Depois pago

## 📝 Notas Importantes

- A Edge Function atual usa SMTP básico
- Para TLS completo, pode ser necessário ajustar o código
- Em produção, considere usar bibliotecas SMTP mais robustas
- A função roda no servidor do Supabase, não no navegador

## 🆘 Suporte

Se tiver problemas:
1. Verifique os logs da Edge Function no Supabase Dashboard
2. Verifique os logs do navegador (F12 > Console)
3. Teste com um provedor alternativo (Resend/SendGrid)

---

**Arquivo criado:** `supabase/functions/send-email-smtp/index.ts`
**Próximo passo:** Deploy da função via Dashboard ou CLI

