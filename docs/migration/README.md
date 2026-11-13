# Migração (documentação auxiliar)

Documentos gerados automaticamente para apoiar saída do Supabase ou mudança de backend.

**Visão geral e ordem de trabalho:** [overview.md](./overview.md)

| Documento | Descrição | Regenerar |
| --- | --- | --- |
| [edge-functions-inventory.md](./edge-functions-inventory.md) | 39 Edge Functions: `verify_jwt`, env, tabelas, RPCs, chamadas internas | `python scripts/migration_edge_inventory.py` |
| [frontend-rpc-inventory.md](./frontend-rpc-inventory.md) | RPCs `supabase.rpc(...)` usados em `src/` (exclui exemplos em `Documentation.tsx`) | `python scripts/migration_frontend_rpc_inventory.py` |
| [sql-rpc-inventory.md](./sql-rpc-inventory.md) | Funções `CREATE FUNCTION` nas migrações + `GRANT EXECUTE` (quando existe no SQL), cruzamento com o frontend | `python scripts/migration_sql_rpc_inventory.py` |
| [rls-policies-inventory.md](./rls-policies-inventory.md) | `CREATE POLICY`, `DROP POLICY`, `ALTER TABLE … ROW LEVEL SECURITY` (simulação por ordem das migrações) | `python scripts/migration_rls_inventory.py` |
| [triggers-inventory.md](./triggers-inventory.md) | `CREATE TRIGGER` / `DROP TRIGGER` (simulação por ordem das migrações) | `python scripts/migration_triggers_inventory.py` |
| [critical-flows-e2e.md](./critical-flows-e2e.md) | Fluxos E2E críticos (manual; referência) | _(editar à mão)_ |
| [cloud-validation.md](./cloud-validation.md) | Checklist validação na instância (dump + SQL) | _(sem script)_ |
| [pg-cron-inventory.md](./pg-cron-inventory.md) | Jobs pg_cron referidos nas migrações | _(manual)_ |
| [drift-log.template.md](./drift-log.template.md) | Template de registo de drift (copiar e preencher) | _(manual)_ |
| [implementation-progress.md](./implementation-progress.md) | Estado da implementação do backend NestJS | _(manual)_ |

Os scripts escrevem UTF-8 diretamente nos ficheiros (evitar redirecionar stdout no PowerShell sem `utf8`).

## `verify_jwt` em `supabase/config.toml`

O ficheiro inclui blocos `[functions.<nome>]` para **todas** as Edge Functions. Valores escolhidos por tipo de endpoint:

- **`false`**: webhooks (ex.: `stripe-webhook` com `Stripe-Signature`); tarefas agendadas/cron invocadas com service role; endpoints que o frontend ou e-mails chamam **sem** sessão de utilizador (ex.: `stripe-payment`, `stripe-payment-status` — ver comentários no código e em `emailTemplateEngine.ts`); leituras públicas de SEO (`robots`, `sitemap`) e health check.
- **`stripe-refund`**: `true` — reembolso só com sessão de staff (`supabase.functions.invoke` com utilizador autenticado); a função usa service role e não deve ser pública.
- **`true`**: fluxos que esperam JWT de utilizador no gateway (ex.: `get-reservation` valida `Authorization` + `guest_account_id`); proxies de e-mail onde o comentário no código indica uso via `invoke` autenticado; funções de backoffice que não devem ser anónimas.

Se uma invocação falhar com 401, confirme se a função deve ser anónima (pagamentos públicos, webhooks) e mantenha `verify_jwt = false`; caso contrário use sessão ou anon key nos headers.
