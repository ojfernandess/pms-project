# 🧪 Testar endpoint Stripe (API Node)

## ⚠️ Problema Atual

Erros 401/404 ao chamar endpoint antigo de Edge Function.

## ✅ Mudanças Aplicadas

1. **Frontend atualizado** para chamar a API Node
2. **Endpoints Stripe migrados** para `/api/pagamentos/stripe/*`
3. **Webhook migrado** para `/api/webhooks/stripe`

## 🧪 Teste Manual

### 1. Teste via Console do Navegador

Abra o console do navegador (F12) e execute:

```javascript
const PMS_API_URL = 'https://api.seudominio.com';

fetch(`${PMS_API_URL}/api/pagamentos/stripe/intent`, {
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

1. Acesse o painel do backend (EasyPanel/Docker logs)
2. Verifique se há logs de chamadas
3. Procure por erros ou mensagens de debug

### 3. Redeploy do Backend API

Se ainda não funcionar, faça o redeploy:

```bash
cd C:\Users\bonma\Downloads\pms-project-main
npm run build
```

## 🔍 Verificar Configuração

No backend API:

1. Rota pública `POST /api/pagamentos/stripe/intent` ativa
2. Variáveis `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` definidas

## 📝 Nota Importante

A autenticação pública/privada agora é controlada no backend Node, não por flags de Edge Function.

## 🆘 Se Ainda Não Funcionar

1. **Aguarde 2-3 minutos** após fazer alterações
2. **Limpe o cache do navegador** (Ctrl+Shift+R)
3. **Verifique se a API foi deployada corretamente**
4. **Tente criar uma nova reserva** para testar o fluxo completo

