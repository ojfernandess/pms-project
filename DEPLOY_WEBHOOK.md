# 🚀 Deploy Rápido: Edge Function stripe-webhook

## ⚠️ Problemas Comuns

### Erro 404: Função não encontrada
Se você está recebendo erro **404 ERR**, significa que a Edge Function `stripe-webhook` **não está deployada**.

### Erro 401: Missing authorization header
Se você está recebendo erro **401 "Missing authorization header"**, significa que a função está configurada para exigir autenticação, mas webhooks do Stripe **não enviam** o header `Authorization`. A solução é configurar a função para **permitir acesso anônimo**.

## ✅ Solução: Deploy da Função

### Opção 1: Via Supabase CLI (Recomendado)

```bash
# 1. Instalar Supabase CLI (se ainda não tiver)
npm install -g supabase

# 2. Fazer login
supabase login

# 3. Linkar ao seu projeto
supabase link --project-ref SEU_PROJETO_ID
# Exemplo: supabase link --project-ref spccmzvizaobinccqpvn

# 4. Deploy da função
supabase functions deploy stripe-webhook
```

**Onde encontrar o Project ID:**
- Supabase Dashboard > Settings > General > Reference ID
- Ou na URL: `https://app.supabase.com/project/SEU_PROJETO_ID`

### Opção 2: Via Supabase Dashboard

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **Edge Functions** (menu lateral)
4. Clique em **"Deploy a new function"** ou **"Create function"**
5. Selecione a pasta `supabase/functions/stripe-webhook`
6. Clique em **"Deploy"**

### Opção 3: Verificar se já está deployada

Teste a URL diretamente:

```bash
curl https://SEU_PROJETO.supabase.co/functions/v1/stripe-webhook
```

Se retornar algo diferente de 404, a função está deployada.

## 🔧 Após o Deploy

1. **Verifique a URL do webhook no Stripe:**
   ```
   https://SEU_PROJETO.supabase.co/functions/v1/stripe-webhook
   ```

2. **Configure o Webhook Secret:**
   - No Stripe Dashboard > Webhooks > Seu endpoint
   - Copie o "Signing secret" (começa com `whsec_`)
   - Cole no PMS: Super Admin > Stripe > Webhook Secret

3. **Teste o webhook:**
   - No Stripe Dashboard, clique em "Send test webhook"
   - Escolha o evento `payment_intent.succeeded`
   - Verifique se retorna 200 OK

## 🐛 Troubleshooting

### Erro 404 continua após deploy
- Verifique se a URL está correta (deve terminar com `/stripe-webhook`)
- Verifique se o Project ID está correto
- Aguarde alguns minutos após o deploy

### Erro 401 "Missing authorization header" ⚠️ IMPORTANTE

Este erro ocorre porque o Supabase está exigindo autenticação, mas webhooks do Stripe **não enviam** o header `Authorization`. A solução é configurar a função para **permitir acesso anônimo**.

#### Solução 1: Via Supabase Dashboard (Recomendado)

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Vá em **Edge Functions**
3. Clique na função `stripe-webhook`
4. Vá em **Settings** ou **Configuration**
5. Desative a opção **"Require Authorization"** ou **"Verify JWT"**
6. Salve as alterações
7. Faça o deploy novamente (se necessário)

#### Solução 2: Via Supabase CLI

Ao fazer o deploy, use a flag `--no-verify-jwt`:

```bash
supabase functions deploy stripe-webhook --no-verify-jwt
```

#### Solução 3: Configuração no código

O arquivo `.supabase-config.json` já foi criado na pasta da função com:
```json
{
  "verify_jwt": false,
  "allow_anonymous": true
}
```

Se ainda não funcionar, você pode precisar configurar manualmente no Dashboard.

**Nota:** A autenticação do webhook é feita via assinatura do Stripe (`stripe-signature`), não via JWT. Por isso, é seguro permitir acesso anônimo.

### Erro 400 "Webhook secret not configured"
- Configure o Webhook Secret no PMS (Super Admin > Stripe)
- Certifique-se de copiar o secret completo (começa com `whsec_`)

### Erro 500 "Internal Server Error"
- Verifique os logs da Edge Function no Supabase Dashboard
- Verifique se as migrations foram aplicadas
- Verifique se as tabelas `stripe_*` existem

## 📝 Checklist

- [ ] Edge Function `stripe-webhook` deployada
- [ ] URL do webhook configurada no Stripe Dashboard
- [ ] Webhook Secret copiado e configurado no PMS
- [ ] Eventos selecionados no Stripe:
  - [ ] `payment_intent.succeeded`
  - [ ] `payment_intent.payment_failed`
  - [ ] `charge.refunded`
  - [ ] `payment_method.attached`
- [ ] Teste de webhook retorna 200 OK

