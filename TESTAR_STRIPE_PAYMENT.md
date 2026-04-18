# 🧪 Testar stripe-payment Function

## ⚠️ Problema Atual

Mesmo com JWT desativado, ainda está dando erro 401.

## ✅ Mudanças Aplicadas

1. **Código atualizado** para usar `fetch` direto em vez de `supabase.functions.invoke()`
2. **Versão do Deno atualizada** na função Edge
3. **Logs adicionados** para debug

## 🧪 Teste Manual

### 1. Teste via Console do Navegador

Abra o console do navegador (F12) e execute:

```javascript
const SUPABASE_URL = 'https://spccmzvizaobinccqpvn.supabase.co';

fetch(`${SUPABASE_URL}/functions/v1/stripe-payment`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    establishment_id: 'SEU_ESTABLISHMENT_ID',
    amount: 100,
    currency: 'BRL',
    payment_type: 'reservation_payment',
    reservation_id: 'TEST_RESERVATION',
    guest_id: 'TEST_GUEST',
    description: 'Test payment'
  })
})
.then(r => r.json())
.then(console.log)
.catch(console.error);
```

**Resultado esperado:**
- ✅ Se retornar erro sobre campos obrigatórios (400) = **FUNCIONOU!**
- ❌ Se retornar 401 = Ainda precisa configurar

### 2. Verificar Logs no Supabase Dashboard

1. Acesse: https://app.supabase.com/project/spccmzvizaobinccqpvn/functions/stripe-payment/logs
2. Verifique se há logs de chamadas
3. Procure por erros ou mensagens de debug

### 3. Redeploy da Função

Se ainda não funcionar, faça o redeploy:

```bash
cd C:\Users\bonma\Downloads\pms-project-main
supabase functions deploy stripe-payment --no-verify-jwt
```

## 🔍 Verificar Configuração

No Supabase Dashboard:

1. **Edge Functions** > **stripe-payment** > **Settings**
2. Verifique:
   - ❌ **"Verify JWT"** = DESATIVADO
   - ❌ **"Require Authorization"** = DESATIVADO
   - ✅ **"Allow Anonymous"** = ATIVADO (se houver)

## 📝 Nota Importante

O arquivo `.supabase-config.json` existe e está correto:
```json
{
  "verify_jwt": false,
  "allow_anonymous": true
}
```

Mas o Supabase pode não estar respeitando esse arquivo. Por isso, é importante:
1. Configurar manualmente no Dashboard
2. OU fazer redeploy com a flag `--no-verify-jwt`

## 🆘 Se Ainda Não Funcionar

1. **Aguarde 2-3 minutos** após fazer alterações
2. **Limpe o cache do navegador** (Ctrl+Shift+R)
3. **Verifique se a função foi deployada corretamente**
4. **Tente criar uma nova reserva** para testar o fluxo completo

