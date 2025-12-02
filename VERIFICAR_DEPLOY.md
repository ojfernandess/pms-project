# ✅ Verificar se Edge Functions estão Deployadas

## Como Verificar

### 1. Via Supabase Dashboard

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto: `spccmzvizaobinccqpvn`
3. Vá em **Edge Functions** (menu lateral)
4. Verifique se as seguintes funções aparecem na lista:
   - ✅ `stripe-payment`
   - ✅ `stripe-webhook`
   - ✅ `stripe-refund`

### 2. Se as Funções NÃO Estão na Lista

**Você precisa fazer o deploy!**

#### Opção A: Via Supabase CLI (Recomendado)

```bash
# 1. Instalar Supabase CLI
npm install -g supabase

# 2. Fazer login
supabase login

# 3. Linkar ao projeto
supabase link --project-ref spccmzvizaobinccqpvn

# 4. Deploy de TODAS as funções Stripe
supabase functions deploy stripe-payment
supabase functions deploy stripe-webhook
supabase functions deploy stripe-refund
```

#### Opção B: Via Supabase Dashboard

1. Vá em **Edge Functions**
2. Clique em **"Deploy a new function"** ou **"Create function"**
3. Para cada função:
   - Selecione a pasta correspondente:
     - `supabase/functions/stripe-payment`
     - `supabase/functions/stripe-webhook`
     - `supabase/functions/stripe-refund`
   - Clique em **"Deploy"**

### 3. Testar se Está Funcionando

Após o deploy, você pode testar:

1. **No Dashboard:**
   - Clique na função `stripe-payment`
   - Vá em **"Invoke"** ou **"Test"**
   - Envie uma requisição de teste

2. **Via Browser:**
   - Abra: `https://spccmzvizaobinccqpvn.supabase.co/functions/v1/stripe-payment`
   - Se retornar um erro sobre campos obrigatórios, a função está funcionando! ✅
   - Se retornar 404, a função não está deployada ❌

## ⚠️ Erro CORS

Se você está recebendo erro CORS mesmo após o deploy:

1. **Verifique se a função está deployada** (passo acima)
2. **Aguarde alguns minutos** após o deploy
3. **Limpe o cache do navegador** (Ctrl+Shift+R)
4. **Verifique os logs da função** no Dashboard

## ⚠️ Erro 401 "Missing authorization header"

Se você está recebendo erro 401, a função está deployada mas está exigindo autenticação.

**Solução:**

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Vá em **Edge Functions**
3. Clique na função `stripe-payment`
4. Vá em **Settings** ou **Configuration**
5. Desative **"Require Authorization"** ou **"Verify JWT"**
6. Salve e faça o deploy novamente

Ou use a flag ao fazer deploy:
```bash
supabase functions deploy stripe-payment --no-verify-jwt
```

## 📋 Checklist Completo

- [ ] Edge Function `stripe-payment` está na lista do Dashboard
- [ ] Edge Function `stripe-webhook` está na lista do Dashboard
- [ ] Edge Function `stripe-refund` está na lista do Dashboard
- [ ] Teste de requisição retorna resposta (mesmo que seja erro de validação)
- [ ] Não há mais erros CORS no console

## 🆘 Se Ainda Não Funcionar

1. Verifique os logs da função no Dashboard
2. Verifique se há erros de sintaxe na função
3. Tente fazer deploy novamente
4. Verifique se o Supabase CLI está atualizado: `supabase --version`

