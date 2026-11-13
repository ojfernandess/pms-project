# Inventário: pg_cron / tarefas agendadas (migrações)

Este documento resume o que as migrações **definem ou comentam** em torno de [pg_cron](https://supabase.com/docs/guides/database/extensions/pg_cron) e [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net) (HTTP a partir do Postgres). Para o estado real na sua instância, execute as queries em [cloud-validation.md](./cloud-validation.md).

## Jobs `cron.schedule` activos no SQL das migrações

Definidos em `supabase/migrations/20260410120000_cron_jobs_digest_checkout.sql`:

| Nome do job | Expressão cron | Destino (Edge Function) | Notas |
| --- | --- | --- | --- |
| `send-daily-digest-schedule` | `0 * * * *` (UTC, início de cada hora) | `POST …/functions/v1/send-daily-digest-schedule` | URL no ficheiro usa host fixo `spccmzvizaobinccqpvn.supabase.co` — **substituir pelo project ref correcto** antes de confiar no deploy. Header `Authorization: Bearer YOUR_SERVICE_ROLE_KEY` (placeholder). |
| `send-checkout-reminders-daily` | `0 12 * * *` (UTC) | `POST …/functions/v1/send-checkout-reminders` com body `{"days": 1}` | Mesma ressalva de URL e service role. |

Extensões criadas no mesmo ficheiro: `pg_cron`, `pg_net`.

## Comentado / instrucções (não activa até descomentar ou aplicar manualmente)

| Ficheiro | Conteúdo |
| --- | --- |
| `20251204000004_schedule_checkout_reminders_cron.sql` | `DO $$` que remove `checkout-reminders-daily` se existir; função auxiliar `send_checkout_reminders()`; bloco `/* … cron.schedule … */` comentado com placeholders `YOUR_PROJECT_REF` e `YOUR_SERVICE_ROLE_KEY`. |
| `20251120000031_cancel_expired_preregistrations.sql` | Bloco comentado `cron.schedule('cancel-expired-preregistrations', '0 * * * *', …)` que chama `public.cancel_expired_preregistrations()`. |

## Outras referências a agendamento

- Vários ficheiros mencionam execução periódica «via pg_cron ou job externo» sem `cron.schedule` definitivo; a lista completa de Edge Functions com lógica de agendamento está em [edge-functions-inventory.md](./edge-functions-inventory.md) (ex.: `*-schedule`, `process-no-shows`).

## Checklist operacional

- [ ] Confirmar `SELECT * FROM cron.job` na cloud coincide com o pretendido (nomes sem duplicados).
- [ ] URLs `https://<project-ref>.supabase.co/functions/v1/...` alinhadas com o project actual.
- [ ] Service role **não** versionada: usar secrets do dashboard ou variáveis injectadas em deploy controlado.
- [ ] Extensões `pg_cron` e `pg_net` activas no projecto.
