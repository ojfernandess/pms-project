# 🔍 Verificar Status do Pagamento

## ⚠️ Problema

Ao acessar um link de pagamento que já foi pago, o status continua mostrando "Aguardando Pagamento" ao invés de "Pago".

## ✅ Solução Implementada

1. **Função `stripe-payment-status` criada** - Verifica o status no Stripe e atualiza o banco
2. **Verificação automática** - Ao carregar a página de pagamento, verifica o status no Stripe
3. **Atualização em tempo real** - Se o pagamento foi bem-sucedido, atualiza o status e redireciona

## 🧪 Como Testar

### 1. Verificar se a função foi deployada

```bash
# Verificar se a função existe
curl -X POST https://spccmzvizaobinccqpvn.supabase.co/functions/v1/stripe-payment-status \
  -H "Content-Type: application/json" \
  -d '{"payment_intent_id": "pi_xxxxx"}'
```

**Resultado esperado:**
- ✅ Se retornar JSON com `status` e `updated` = **FUNCIONOU!**
- ❌ Se retornar 404 = Função não foi deployada

### 2. Verificar no Console do Navegador

1. Abra o console do navegador (F12)
2. Acesse um link de pagamento que já foi pago
3. Procure por logs:
   ```
   [PaymentPage] Verificando status do pagamento: pi_xxxxx
   [PaymentPage] Status verificado: {status: "succeeded", updated: true}
   [PaymentPage] Dados do pagamento: {statusNoBanco: "...", statusVerificado: "succeeded", ...}
   ```

### 3. Verificar se o Status foi Atualizado

Após acessar o link, verifique:
- ✅ Se o status mudou de "Aguardando Pagamento" para "Pago"
- ✅ Se redirecionou para `/payment/success/{paymentIntentId}`
- ✅ Se os logs mostram `statusVerificado: "succeeded"`

## 🚀 Deploy da Função (se necessário)

Se a função não foi deployada ainda:

```bash
cd C:\Users\bonma\Downloads\pms-project-main
supabase functions deploy stripe-payment-status --no-verify-jwt
```

Ou siga as instruções em `DEPLOY_PAYMENT_STATUS.md`.

## 🔧 Troubleshooting

### Problema: Status continua "Aguardando Pagamento"

**Possíveis causas:**
1. Função não foi deployada
2. Função está retornando erro
3. Status no Stripe não é "succeeded"

**Solução:**
1. Verificar logs no console do navegador
2. Verificar se a função foi deployada
3. Verificar o status do pagamento no Stripe Dashboard

### Problema: Erro 401 ao chamar a função

**Solução:**
- Verificar se a função foi deployada com `--no-verify-jwt`
- Verificar configuração no Supabase Dashboard

### Problema: Erro 404 ao chamar a função

**Solução:**
- A função não foi deployada
- Fazer deploy seguindo instruções em `DEPLOY_PAYMENT_STATUS.md`

## 📝 Logs Importantes

Os logs no console devem mostrar:
```
[PaymentPage] Verificando status do pagamento: pi_xxxxx
[PaymentPage] Status verificado: {status: "succeeded", updated: true, payment_intent_id: "pi_xxxxx"}
[PaymentPage] Status atualizado para succeeded, aguardando atualização do banco...
[PaymentPage] Dados do pagamento: {
  statusNoBanco: "requires_payment_method",
  statusVerificado: "succeeded",
  statusFinal: "succeeded",
  foiAtualizado: true
}
```

Se esses logs aparecerem, a verificação está funcionando corretamente!

