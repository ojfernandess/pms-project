# Guia de Deploy e Configuração - send-checkout-reminders

## 1. Deploy da Edge Function

### Usando Supabase CLI

```bash
# Certifique-se de estar na raiz do projeto
cd pms-project-main

# Fazer deploy da função
supabase functions deploy send-checkout-reminders
```

### Usando Supabase Dashboard

1. Acesse o Supabase Dashboard
2. Vá em **Edge Functions** > **Create a new function**
3. Nome: `send-checkout-reminders`
4. Cole o conteúdo de `supabase/functions/send-checkout-reminders/index.ts`
5. Clique em **Deploy**

## 2. Testar a Edge Function

### Via cURL

```bash
# Substitua YOUR_PROJECT_REF e YOUR_ANON_KEY pelos valores corretos
curl -X POST https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-checkout-reminders \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"days": 1}'
```

### Via Supabase Dashboard

1. Vá em **Edge Functions** > **send-checkout-reminders**
2. Clique em **Invoke function**
3. Use o body:
```json
{
  "days": 1
}
```

## 3. Configurar Execução Automática

### Opção 1: Usando pg_cron (Recomendado se disponível)

1. Execute a migration `20251204000004_schedule_checkout_reminders_cron.sql`
2. **IMPORTANTE**: Edite a migration e substitua:
   - `YOUR_EDGE_FUNCTION_URL` pela URL completa da sua Edge Function
   - `YOUR_SERVICE_ROLE_KEY` pela sua Service Role Key

3. Ajuste o horário de execução (padrão: 09:00 UTC):
   ```sql
   '0 9 * * *'  -- 09:00 UTC (06:00 BRT)
   '0 6 * * *'  -- 06:00 UTC (03:00 BRT)
   ```

### Opção 2: Usando cron-job.org (Recomendado para produção)

1. Acesse [cron-job.org](https://cron-job.org) e crie uma conta
2. Clique em **Create cronjob**
3. Configure:
   - **Title**: Checkout Reminders
   - **Address**: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-checkout-reminders`
   - **Method**: POST
   - **Request body**: `{"days": 1}`
   - **Headers**: 
     - `Authorization: Bearer YOUR_ANON_KEY`
     - `Content-Type: application/json`
   - **Schedule**: Diariamente às 09:00 (ou horário desejado)
4. Salve o cron job

### Opção 3: Usando GitHub Actions

Crie `.github/workflows/checkout-reminders.yml`:

```yaml
name: Send Checkout Reminders

on:
  schedule:
    - cron: '0 9 * * *' # Diariamente às 09:00 UTC
  workflow_dispatch: # Permite execução manual

jobs:
  send-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Call Edge Function
        run: |
          curl -X POST https://${{ secrets.SUPABASE_PROJECT_REF }}.supabase.co/functions/v1/send-checkout-reminders \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"days": 1}'
```

Configure os secrets no GitHub:
- `SUPABASE_PROJECT_REF`: Referência do seu projeto (ex: `abcdefghijklmnop`)
- `SUPABASE_ANON_KEY`: Anon Key do Supabase

## 4. Verificar Logs

### Via Supabase Dashboard

1. Vá em **Edge Functions** > **send-checkout-reminders** > **Logs**
2. Verifique os logs de execução

### Via CLI

```bash
supabase functions logs send-checkout-reminders
```

## 5. Monitoramento

A função retorna estatísticas:
```json
{
  "success": true,
  "sent": 5,
  "errors": 0,
  "total": 5
}
```

Monitore regularmente para garantir que os e-mails estão sendo enviados corretamente.

## Troubleshooting

### Erro: "Template não encontrado"
- Verifique se a migration `20251204000003_create_checkout_reminder_email_template.sql` foi executada
- Verifique se o template está ativo: `is_active = true`

### Erro: "Configurações de e-mail não encontradas"
- Configure as configurações de e-mail em **Configurações** > **E-mails**
- Certifique-se de que `is_active = true`

### E-mails não estão sendo enviados
- Verifique os logs da Edge Function
- Verifique a fila de e-mails em **Configurações** > **Fila de E-mails**
- Verifique se o provedor de e-mail está configurado corretamente



