# Edge Function: send-email-smtp

Edge Function do Supabase para enviar e-mails via SMTP.

## 📋 Pré-requisitos

- Supabase CLI instalado
- Projeto Supabase configurado

## 🚀 Como Deployar

### Opção 1: Via Supabase Dashboard (Mais Fácil)

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Edge Functions** no menu lateral
4. Clique em **Create a new function**
5. Nome: `send-email-smtp`
6. Copie e cole o conteúdo do arquivo `index.ts`
7. Clique em **Deploy**

### Opção 2: Via Supabase CLI

```bash
# 1. Instalar Supabase CLI (se não tiver)
npm install -g supabase

# 2. Fazer login
supabase login

# 3. Linkar ao projeto
supabase link --project-ref seu-project-ref

# 4. Deploy da função
supabase functions deploy send-email-smtp
```

## ⚙️ Configuração

A função não requer variáveis de ambiente adicionais. As configurações SMTP são passadas no body da requisição.

## 🔒 Segurança

A função verifica:
- Header de autorização (Bearer token do Supabase)
- Validação de campos obrigatórios
- Validação de configuração SMTP

## 📝 Uso

A função é chamada automaticamente pelo sistema quando:
- Um e-mail é adicionado à fila com provider = "smtp"
- O sistema processa a fila de e-mails

## ⚠️ Limitações

- A implementação atual usa SMTP básico sem TLS completo
- Para TLS completo, recomenda-se usar porta 465 (SSL direto)
- Para produção, considere usar biblioteca SMTP mais robusta

## 🔄 Alternativa Recomendada

Para produção, recomenda-se usar **SendGrid**, **Mailgun** ou **Resend** que:
- Funcionam diretamente do frontend
- Não requerem Edge Functions
- São mais confiáveis e fáceis de configurar

