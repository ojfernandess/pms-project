# 🔧 Corrigir Erros Deno e Stripe

## ⚠️ Erros Encontrados

### 1. Erro do Deno: `Deno.core.runMicrotasks()`

**Erro:**
```
Error: Deno.core.runMicrotasks() is not supported in this environment
```

**Causa:** Versão incompatível do Deno std library

**Solução:** ✅ Corrigido
- `stripe-payment-status`: Mudado de `0.177.0` para `0.168.0`
- `stripe-payment`: Mudado de `0.177.0` para `0.168.0`

### 2. Erro do Stripe: `This property cannot be expanded`

**Erro:**
```
Error: This property cannot be expanded (charges.data.payment_method)
```

**Causa:** Tentativa de expandir uma propriedade que não pode ser expandida

**Solução:** ✅ Corrigido
- Removido `charges.data.payment_method` do expand
- Mantido apenas `charges` no expand
- Melhorado tratamento de charges para lidar com diferentes formatos

## ✅ Correções Aplicadas

### 1. Versão do Deno

**Antes:**
```typescript
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
```

**Depois:**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
```

### 2. Expansão do Stripe

**Antes:**
```typescript
const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id, {
  expand: ['charges', 'charges.data.payment_method']
});
```

**Depois:**
```typescript
const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent_id, {
  expand: ['charges']
});
```

### 3. Tratamento de Charges

**Antes:**
```typescript
const hasCharges = paymentIntent.charges?.data && paymentIntent.charges.data.length > 0;
```

**Depois:**
```typescript
// Nota: charges pode ser um array ou um objeto com data
const chargesData = Array.isArray(paymentIntent.charges) 
  ? paymentIntent.charges 
  : paymentIntent.charges?.data || [];
const hasCharges = chargesData.length > 0;
```

## 🚀 Redeploy

Após as correções, faça o redeploy:

```bash
cd C:\Users\bonma\Downloads\pms-project-main

# Redeploy stripe-payment-status
supabase functions deploy stripe-payment-status --no-verify-jwt

# Redeploy stripe-payment (também foi corrigido)
supabase functions deploy stripe-payment --no-verify-jwt
```

## 🧪 Testar

Após o redeploy, teste:

1. **Acessar um link de pagamento**
2. **Verificar logs no Supabase** - Não deve mais aparecer erros do Deno
3. **Verificar logs do Stripe** - Não deve mais aparecer erro de expansão

## ✅ Resultado Esperado

Após o redeploy:
- ✅ Sem erros do Deno
- ✅ Sem erros do Stripe sobre expansão
- ✅ Função funcionando corretamente
- ✅ Logs mostrando informações corretas sobre charges

## 📝 Notas

- Os erros de lint do TypeScript são esperados (TypeScript não reconhece módulos Deno)
- O código está correto e funcionará no runtime do Supabase
- A versão `0.168.0` é compatível com o Deno v2.1.4 usado pelo Supabase

