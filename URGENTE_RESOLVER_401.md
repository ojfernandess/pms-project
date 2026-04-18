# 🚨 URGENTE: Resolver Erro 401 - stripe-payment

## ⚠️ Problema Atual

Você está recebendo **401 (Unauthorized)** ao tentar criar Payment Intent via Stripe.

**Isso está bloqueando:**
- ❌ Criação de links de pagamento nos emails
- ❌ Página de pagamento pública
- ❌ Geração de Payment Intents

## ✅ SOLUÇÃO IMEDIATA (5 minutos)

### Passo a Passo no Supabase Dashboard

1. **Acesse o Dashboard:**
   - URL: https://app.supabase.com/project/spccmzvizaobinccqpvn/functions

2. **Encontre a função:**
   - Procure por `stripe-payment` na lista de Edge Functions
   - Clique nela

3. **Vá em Settings:**
   - Clique na aba **"Settings"** ou **"Configuration"**
   - Procure por uma opção chamada:
     - **"Require Authorization"** OU
     - **"Verify JWT"** OU
     - **"Enforce JWT Verification"**

4. **DESATIVE a opção:**
   - Deixe **DESMARCADO** / **OFF** / **FALSE**
   - Isso permite acesso anônimo à função

5. **Salve:**
   - Clique em **"Save"** ou **"Update"**
   - Aguarde alguns segundos

6. **Teste:**
   - Tente criar uma reserva novamente
   - O erro 401 deve desaparecer

## 🔄 Alternativa: Redeploy via CLI

Se você tem Supabase CLI instalado:

```bash
# 1. Navegar até a pasta do projeto
cd C:\Users\bonma\Downloads\pms-project-main

# 2. Linkar ao projeto (se ainda não fez)
supabase link --project-ref spccmzvizaobinccqpvn

# 3. Redeploy com flag para desabilitar JWT
supabase functions deploy stripe-payment --no-verify-jwt
```

## 🧪 Como Verificar se Funcionou

Após aplicar a solução, teste no console do navegador:

```javascript
// Abra o console do navegador (F12)
// E execute:
fetch('https://spccmzvizaobinccqpvn.supabase.co/functions/v1/stripe-payment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ test: 'test' })
})
.then(r => r.json())
.then(console.log)
```

**Resultado esperado:**
- ✅ Erro 400 sobre campos obrigatórios = **FUNCIONOU!**
- ❌ Erro 401 = Ainda precisa configurar

## 📸 Onde Encontrar no Dashboard

1. **Menu lateral:** Edge Functions
2. **Lista de funções:** Clique em `stripe-payment`
3. **Aba Settings:** Geralmente no topo ou no menu lateral
4. **Opção "Require Authorization":** Desmarque

## ⏱️ Tempo Estimado

- **Via Dashboard:** 2-5 minutos
- **Via CLI:** 3-5 minutos (se já tem CLI instalado)

## 🆘 Se Não Encontrar a Opção

Algumas versões do Supabase podem ter a opção em lugares diferentes:

1. **Tente em:** Settings > Security
2. **Ou em:** Configuration > Authentication
3. **Ou procure por:** "JWT" ou "Authorization"

Se ainda não encontrar, tente fazer o redeploy via CLI com a flag `--no-verify-jwt`.

## ✅ Após Resolver

Você deve conseguir:
- ✅ Criar reservas com link de pagamento
- ✅ Acessar página de pagamento pública
- ✅ Receber emails com links de pagamento funcionando

