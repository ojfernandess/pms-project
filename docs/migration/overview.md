# Visão geral — pacote de migração Supabase

Estes documentos apoiam uma saída gradual do Supabase (Postgres + Auth + Edge Functions + Storage) ou um plano de paridade noutro ambiente.

## Artefactos gerados

| Documento | Conteúdo |
| --- | --- |
| [edge-functions-inventory.md](./edge-functions-inventory.md) | Edge Functions: JWT no gateway, env, tabelas/RPC usados, chamadas internas |
| [frontend-rpc-inventory.md](./frontend-rpc-inventory.md) | `supabase.rpc(...)` no `src/` (exclui exemplos em `Documentation.tsx`) |
| [sql-rpc-inventory.md](./sql-rpc-inventory.md) | `CREATE FUNCTION` nas migrações + `GRANT EXECUTE` explícitos |
| [rls-policies-inventory.md](./rls-policies-inventory.md) | RLS: políticas e `ALTER TABLE … ROW LEVEL SECURITY` (simulado por ordem das migrações) |
| [triggers-inventory.md](./triggers-inventory.md) | `CREATE TRIGGER` / `DROP TRIGGER` (simulado por ordem das migrações) |
| [critical-flows-e2e.md](./critical-flows-e2e.md) | Fluxos negócio (reserva, ARI, Stripe, OTA, e-mail) — liga inventários |
| [cloud-validation.md](./cloud-validation.md) | Checklist: dump schema, queries SQL, detecção de drift vs migrações |
| [pg-cron-inventory.md](./pg-cron-inventory.md) | Jobs `pg_cron` / referências nas migrações + checklist |
| [drift-log.template.md](./drift-log.template.md) | Template para registar divergências cloud vs repo |
| [implementation-progress.md](./implementation-progress.md) | Estado real da implementação NestJS (não é o plano) |

Configuração relacionada: `supabase/config.toml` (`verify_jwt` por função).

## Ordem sugerida de trabalho (paridade ou migração)

1. **Contratos de API** — RPCs do frontend + funções SQL com mesma assinatura; notar `anon` vs `authenticated` nos `GRANT`.
2. **Segurança** — RLS por tabela crítica (`reservations`, `payments`, `clients`, …); alinhar com quem pode chamar cada RPC.
3. **Efeitos colaterais** — triggers em tabelas mutadas pelo PMS (reservas, quartos, e-mail, Stripe, inventário ARI).
4. **Processamento assíncrono** — Edge Functions (webhooks OTA/Stripe, e-mail, cron); mapa de dependências e secrets.
5. **Estado fora do repo** — políticas/triggers criados só no dashboard; seguir [cloud-validation.md](./cloud-validation.md) e preencher [drift-log.template.md](./drift-log.template.md).
6. **Agendamento** — `pg_cron` / `pg_net`: [pg-cron-inventory.md](./pg-cron-inventory.md) e `SELECT * FROM cron.job` na cloud.
7. **Fluxos críticos** — mapear testes manuais ou automatizados com [critical-flows-e2e.md](./critical-flows-e2e.md).

## Regenerar tudo (a partir da raiz do repositório)

```bash
python scripts/migration_edge_inventory.py
python scripts/migration_frontend_rpc_inventory.py
python scripts/migration_sql_rpc_inventory.py
python scripts/migration_rls_inventory.py
python scripts/migration_triggers_inventory.py
```

Módulo partilhado: `scripts/migration_sql_scanner.py` (divisor de declarações SQL com suporte a dollar-quotes).

## Limitações comuns

- Inventários vêm **só** de `supabase/migrations/*.sql`; alterações manuais na cloud não entram até estarem em migração ou num dump.
- RLS com `DROP POLICY` dinâmico em `DO $$` é **aproximado** (ver secção «Limitações» em `rls-policies-inventory.md`).
- Triggers: cláusula `WHEN` não é extraída; ver o ficheiro de migração.
