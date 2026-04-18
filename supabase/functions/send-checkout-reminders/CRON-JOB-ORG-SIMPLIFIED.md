# Configuração Simplificada para cron-job.org (Método GET)

Para evitar problemas com POST e JSON no cron-job.org, a Edge Function agora aceita **GET** com parâmetros na URL. Isso é muito mais simples de configurar!

## Configuração no cron-job.org

### Passo 1: Criar o Cron Job

1. Acesse [cron-job.org](https://cron-job.org) e faça login
2. Clique em **"Create cronjob"**

### Passo 2: Preencher os Campos

**Informações Básicas:**
- **Title**: `Checkout Reminders - PMS`
- **Address**: `https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders?days=1`
- **Method**: Selecione **GET** (não POST!)

**Headers:**
Clique em **"Add Header"** e adicione apenas:

- **Name**: `Authorization`
- **Value**: `Bearer SUA_ANON_KEY_AQUI` (cole sua Anon Key completa)

**Request Body:**
- Deixe **VAZIO** (não precisa de body com GET)

**Schedule:**
- Selecione **"Daily"**
- Horário: **09:00**
- Timezone: **UTC** (ou **America/Sao_Paulo**)

**Ativar:**
- Marque **"Activate cronjob"**

3. Clique em **"Create cronjob"** ou **"Save"**

## Exemplo Completo

```
Title: Checkout Reminders - PMS

Address: https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders?days=1

Method: GET

Headers:
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Request Body: (deixe vazio)

Schedule: Daily at 09:00 UTC
```

## Parâmetros Opcionais na URL

### Enviar para estabelecimento específico:
```
https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders?days=1&establishment_id=uuid-do-estabelecimento
```

### Enviar 2 dias antes:
```
https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders?days=2
```

## Vantagens do Método GET

✅ **Mais simples**: Não precisa de body JSON  
✅ **Menos erros**: Evita problemas de formatação JSON  
✅ **Mais compatível**: Funciona melhor com serviços de cron  
✅ **Fácil de testar**: Basta colar a URL no navegador (com header Authorization)

## Teste Rápido

Teste a URL diretamente (substitua SUA_ANON_KEY):

```bash
curl -X GET "https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders?days=1" \
  -H "Authorization: Bearer SUA_ANON_KEY"
```

Ou teste no navegador usando uma extensão como "ModHeader" para adicionar o header Authorization.

## Se Ainda Der Erro 422

1. **Verifique a URL**: Certifique-se de que não há espaços ou caracteres especiais
2. **Verifique o header**: O nome deve ser exatamente `Authorization` (sem espaços)
3. **Verifique a Anon Key**: Deve começar com `Bearer ` (com espaço) seguido da key
4. **Tente sem parâmetros primeiro**: Use apenas `?days=1` na URL
5. **Verifique se a Edge Function está deployada**: Teste a URL sem autenticação (deve retornar erro 401, não 404)

## Troubleshooting

### Erro 401 (Unauthorized)
- Verifique se o header `Authorization` está correto
- Verifique se a Anon Key está completa (não cortada)

### Erro 404 (Not Found)
- Verifique se a Edge Function foi deployada
- Verifique se a URL está correta (sem barra no final)

### Erro 422 (Unprocessable Content)
- Tente usar GET ao invés de POST
- Verifique se não há caracteres especiais na URL
- Tente sem parâmetros primeiro: `?days=1`

---

**Pronto!** Com GET, a configuração é muito mais simples e evita a maioria dos problemas comuns.

