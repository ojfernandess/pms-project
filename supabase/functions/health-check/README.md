# Health Check Edge Function

Edge Function para verificar a saúde do sistema (database, storage, API).

## Deploy

Para fazer deploy desta função no Supabase:

### Via Supabase CLI:

```bash
# Certifique-se de estar logado
supabase login

# Link seu projeto (se ainda não estiver)
supabase link --project-ref seu-project-ref

# Faça deploy da função
supabase functions deploy health-check
```

### Via Dashboard do Supabase:

1. Vá para **Edge Functions** no dashboard
2. Clique em **Create a new function**
3. Selecione a pasta `supabase/functions/health-check`
4. Ou use o botão **Deploy** se a função já existir

## Visualizar Logs

### Via Dashboard:

1. Vá para **Edge Functions** → **health-check**
2. Clique na aba **Logs**
3. Os logs aparecerão em tempo real quando a função for executada

### Via CLI:

```bash
# Ver logs em tempo real
supabase functions logs health-check --follow

# Ver últimas 100 linhas
supabase functions logs health-check --limit 100
```

## Testar a Função

### Via cURL:

```bash
curl -X GET "https://seu-project.supabase.co/functions/v1/health-check" \
  -H "apikey: YOUR_SUPABASE_ANON_KEY"
```

### Via Dashboard:

1. Vá para **Edge Functions** → **health-check**
2. Clique em **Invoke function**
3. Clique em **Invoke** para executar

## Logs Esperados

Quando a função for executada, você deve ver nos logs:

```
=== HEALTH CHECK FUNCTION CALLED ===
Method: GET
URL: https://...
Timestamp: 2024-01-15T10:00:00.000Z
Health check started at: 1234567890
Health check iniciado: { timestamp: "...", hasUrl: true, hasKey: true }
Verificando conexão com database...
Database check OK: { responseTime: 45 }
Verificando conexão com storage...
Storage check OK
Health check concluído: { status: "healthy", totalResponseTime: 120, checks: {...} }
```

## Troubleshooting

### Logs não aparecem:

1. **Verifique se a função foi deployada:**
   - No dashboard, verifique se a função aparece na lista
   - Verifique a data de "Last updated"

2. **Execute a função novamente:**
   - Os logs só aparecem quando a função é executada
   - Use o botão "Invoke" no dashboard ou faça uma requisição HTTP

3. **Verifique os filtros de log:**
   - No dashboard, certifique-se de que não há filtros aplicados
   - Verifique se está olhando para os logs corretos (não logs antigos)

4. **Verifique variáveis de ambiente:**
   - `SUPABASE_URL` deve estar configurada
   - `SUPABASE_SERVICE_ROLE_KEY` deve estar configurada
   - Essas variáveis são configuradas automaticamente pelo Supabase

5. **Use o CLI para ver logs:**
   ```bash
   supabase functions logs health-check --follow
   ```

## Resposta da Função

A função retorna um JSON com:

```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "ok" | "error",
      "responseTime": 45,
      "error": "mensagem de erro (se houver)"
    },
    "storage": {
      "status": "ok" | "error",
      "error": "mensagem de erro (se houver)"
    }
  },
  "metrics": {
    "database_response_time": 45
  }
}
```

## Status HTTP

- `200`: Sistema saudável ou degradado
- `503`: Sistema não saudável

