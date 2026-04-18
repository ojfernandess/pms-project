# Correção Rápida: Erro "non-wellformed job" no cron-job.org

## Problema Comum

O erro "non-wellformed job" geralmente ocorre por:
1. Headers mal formatados
2. Body JSON inválido
3. URL incorreta
4. Método HTTP incorreto

## Solução Passo a Passo

### 1. Verificar Headers

Certifique-se de que os headers estão EXATAMENTE assim:

**Header 1:**
- **Name**: `Authorization` (exatamente assim, sem espaços extras)
- **Value**: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (sua Anon Key completa)

**Header 2:**
- **Name**: `Content-Type` (exatamente assim)
- **Value**: `application/json` (exatamente assim, sem espaços)

### 2. Verificar Request Body

O body deve ser um JSON válido:

```json
{"days":1}
```

Ou formatado:

```json
{
  "days": 1
}
```

**IMPORTANTE**: Não use aspas simples, apenas aspas duplas.

### 3. Verificar URL

A URL deve estar completa e correta:

```
https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders
```

**Sem** barra no final!

### 4. Verificar Método

Deve ser **POST** (não GET, não PUT, não PATCH).

## Configuração Correta Completa

```
Title: Checkout Reminders - PMS

Address: https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders

Method: POST

Headers:
  Name: Authorization
  Value: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwY2NtenZpemFvYmluY2NxcHZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzNzYwMDAsImV4cCI6MjA0ODk1MjAwMH0.xxxxx

  Name: Content-Type
  Value: application/json

Request Body:
{"days":1}

Schedule: Daily at 09:00 UTC
```

## Checklist Antes de Salvar

- [ ] URL não tem barra no final
- [ ] Método é POST
- [ ] Header "Authorization" tem exatamente esse nome (sem espaços)
- [ ] Header "Authorization" tem "Bearer " (com espaço) antes da key
- [ ] Header "Content-Type" tem exatamente esse nome
- [ ] Body é JSON válido (aspas duplas)
- [ ] Não há caracteres especiais ou espaços extras

## Teste Rápido com cURL

Antes de configurar no cron-job.org, teste com cURL para garantir que funciona:

```bash
curl -X POST https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders \
  -H "Authorization: Bearer SUA_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"days":1}'
```

Se funcionar no cURL, copie exatamente os mesmos valores para o cron-job.org.

## Se Ainda Não Funcionar

1. **Tente sem o body primeiro**: Deixe o campo "Request body" vazio e veja se o erro muda
2. **Verifique se a Edge Function está deployada**: Teste a URL diretamente no navegador (deve retornar erro de método, não 404)
3. **Use a versão simplificada**: Tente apenas com o header Authorization primeiro, sem Content-Type
4. **Contate o suporte**: Se nada funcionar, o problema pode ser específico da sua conta

## Alternativa: Usar GET com Query Parameters

Se POST continuar dando erro, você pode modificar a Edge Function para aceitar GET também, ou usar query parameters:

```
Address: https://spccmzvizaobinccqpvn.supabase.co/functions/v1/send-checkout-reminders?days=1
Method: GET
Headers:
  Authorization: Bearer SUA_ANON_KEY
```

Mas isso requer modificar a Edge Function para aceitar GET.

