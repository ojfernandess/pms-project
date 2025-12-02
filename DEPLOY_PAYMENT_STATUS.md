# 🚀 Deploy da Função stripe-payment-status

## 📋 Descrição

Esta função Edge Function verifica o status do pagamento no Stripe e atualiza o banco de dados se necessário. É usada quando o hóspede acessa o link de pagamento novamente após ter realizado o pagamento.

## ✅ Deploy

### Opção 1: Via Supabase CLI (Recomendado)

```bash
# 1. Navegar até a pasta do projeto
cd C:\Users\bonma\Downloads\pms-project-main

# 2. Linkar ao projeto (se ainda não fez)
supabase link --project-ref spccmzvizaobinccqpvn

# 3. Deploy da função com acesso anônimo
supabase functions deploy stripe-payment-status --no-verify-jwt
```

### Opção 2: Via Supabase Dashboard

1. Acesse: https://app.supabase.com/project/spccmzvizaobinccqpvn/functions
2. Clique em **"New Function"** ou **"Create Function"**
3. Nome: `stripe-payment-status`
4. Cole o conteúdo de `supabase/functions/stripe-payment-status/index.ts`
5. Em **Settings**, desative **"Verify JWT"** ou **"Require Authorization"**
6. Salve e faça o deploy

## 🔧 Configuração

A função já está configurada para aceitar acesso anônimo através do arquivo `.supabase-config.json`:

```json
{
  "verify_jwt": false,
  "allow_anonymous": true
}
```

## 🧪 Testar

Após o deploy, teste a função:

```bash
curl -X POST https://spccmzvizaobinccqpvn.supabase.co/functions/v1/stripe-payment-status \
  -H "Content-Type: application/json" \
  -d '{"payment_intent_id": "pi_xxxxx"}'
```

**Resultado esperado:**
```json
{
  "status": "succeeded",
  "updated": true,
  "payment_intent_id": "pi_xxxxx"
}
```

## 📝 Funcionalidade

A função:
1. ✅ Busca o pagamento no banco de dados pelo `payment_intent_id`
2. ✅ Verifica o status atual no Stripe
3. ✅ Atualiza o banco de dados se o status mudou
4. ✅ Atualiza a reserva para "confirmed" e `paid_amount` se o pagamento foi bem-sucedido
5. ✅ Retorna o status atual e se houve atualização

## 🔄 Fluxo

1. Hóspede acessa o link de pagamento: `/payment/{paymentIntentId}`
2. A página chama `stripe-payment-status` para verificar o status
3. Se o pagamento foi bem-sucedido no Stripe mas ainda não está atualizado no banco, a função atualiza
4. A página redireciona para `/payment/success/{paymentIntentId}` se o status for "succeeded"

