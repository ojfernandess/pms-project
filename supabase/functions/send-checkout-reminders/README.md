# Edge Function: send-checkout-reminders

Esta Edge Function envia e-mails de lembrete de check-out para hóspedes com check-out próximo.

## Como usar

### Chamada manual via HTTP

```bash
# Enviar lembretes para check-out em 1 dia (padrão)
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-checkout-reminders \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"days": 1}'

# Enviar lembretes para um estabelecimento específico
curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-checkout-reminders \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"days": 1, "establishment_id": "uuid-do-estabelecimento"}'
```

### Parâmetros

- `days` (opcional, padrão: 1): Número de dias antes do check-out para enviar o lembrete
- `establishment_id` (opcional): ID do estabelecimento específico. Se não fornecido, verifica todos.

### Resposta

```json
{
  "success": true,
  "sent": 5,
  "errors": 0,
  "total": 5
}
```

## Configurar execução automática

### Opção 1: Usando pg_cron (se disponível)

Execute a migration `20251204000004_schedule_checkout_reminders_cron.sql` e ajuste:
- URL da Edge Function
- Service Role Key
- Horário de execução

### Opção 2: Usando serviço externo (recomendado)

Use um serviço como [cron-job.org](https://cron-job.org) ou [EasyCron](https://www.easycron.com):

1. Crie uma conta no serviço
2. Configure um job HTTP que chama a Edge Function diariamente
3. Use a URL: `https://YOUR_PROJECT.supabase.co/functions/v1/send-checkout-reminders`
4. Adicione o header: `Authorization: Bearer YOUR_ANON_KEY`
5. Configure para executar diariamente às 09:00 (ou horário desejado)

### Opção 3: Usando GitHub Actions (se o projeto estiver no GitHub)

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
          curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/send-checkout-reminders \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{"days": 1}'
```

## Variáveis de ambiente necessárias

A Edge Function usa as seguintes variáveis de ambiente (configuradas automaticamente pelo Supabase):
- `SUPABASE_URL`: URL do projeto Supabase
- `SUPABASE_SERVICE_ROLE_KEY`: Service Role Key para bypass RLS

## Requisitos

- Template de e-mail `checkout.reminder` deve estar ativo
- Configurações de e-mail devem estar ativas
- Reservas devem ter status `confirmed`
- Reservas devem ter e-mail do hóspede cadastrado


