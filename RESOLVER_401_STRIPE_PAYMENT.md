# 🔧 Resolver Erro 401: stripe-payment

## ⚠️ Problema

Você está recebendo erro **401 (Unauthorized)** ao tentar criar um Payment Intent via Stripe.

Isso significa que a Edge Function `stripe-payment` está exigindo autenticação, mas ela precisa permitir acesso anônimo.

## ✅ Solução Rápida

### Opção 1: Via Supabase Dashboard (Mais Fácil)

1. Acesse [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto: `spccmzvizaobinccqpvn`
3. Vá em **Edge Functions** (menu lateral)
4. Clique na função **`stripe-payment`**
5. Vá em **Settings** (ou **Configuration**)
6. Procure por **"Require Authorization"** ou **"Verify JWT"**
7. **DESATIVE** essa opção (deixe desmarcado)
8. Clique em **"Save"** ou **"Update"**

**Pronto!** A função agora aceita requisições anônimas.

### Opção 2: Redeploy via CLI

Se você tem acesso ao Supabase CLI:

```bash
# 1. Linkar ao projeto (se ainda não fez)
supabase link --project-ref spccmzvizaobinccqpvn

# 2. Redeploy com flag para desabilitar JWT verification
supabase functions deploy stripe-payment --no-verify-jwt
```

## 🧪 Testar se Funcionou

Após aplicar a solução, teste:

```bash
curl -X POST https://spccmzvizaobinccqpvn.supabase.co/functions/v1/stripe-payment \
  -H "Content-Type: application/json" \
  -d '{"test": "test"}'
```

**Resultado esperado:**
- ✅ Se retornar erro sobre campos obrigatórios (400) = **FUNCIONOU!**
- ❌ Se retornar 401 = Ainda precisa configurar

## 📝 Por Que Isso é Seguro?

A função `stripe-payment` usa **Service Role Key** internamente para acessar o banco de dados. Isso significa que:

- ✅ A função tem acesso total ao banco (bypass RLS)
- ✅ A autenticação é feita **dentro** da função
- ✅ É seguro permitir acesso anônimo à função
- ✅ A validação de dados é feita pela própria função

## 🔍 Verificar Configuração Atual

No Dashboard, verifique se a função `stripe-payment` tem:

- ❌ **"Require Authorization"** = DESATIVADO
- ❌ **"Verify JWT"** = DESATIVADO
- ✅ **"Allow Anonymous"** = ATIVADO (se houver essa opção)

## 🆘 Ainda Não Funciona?

1. **Aguarde 1-2 minutos** após fazer as alterações
2. **Limpe o cache do navegador** (Ctrl+Shift+R)
3. **Verifique os logs** da função no Dashboard
4. **Tente fazer o deploy novamente** com a flag `--no-verify-jwt`

