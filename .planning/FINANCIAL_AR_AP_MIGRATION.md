# Migração AR legado (Fase 6)

## Onde aplicar (produção)

**Postgres via deploy do backend** — **não** use Supabase Dashboard nem `supabase db push`.

| O quê | Onde |
|-------|------|
| SQL das fases 1–6 | `backend/scripts/migration/financial_ar_ap/` |
| Script | `backend/scripts/migration/apply-financial-ar-ap.sh` |
| Documentação | `backend/scripts/migration/APLICAR_FINANCIAL_AR_AP.md` |
| Automático | `docker-entrypoint.sh` em cada restart do backend (`FINANCIAL_AR_AP_MIGRATION_ON_START`, default `true`) |

Origem canónica dos ficheiros: `supabase/migrations/202511181*.sql` (manter cópia em `financial_ar_ap/` alinhada).

## Ordem das migrations

1. `20251118150000_financial_receivable_reservation_sync_v2.sql`
2. `20251118160000_financial_title_settlements_phase2.sql`
3. `20251118170000_financial_suppliers_phase3.sql`
4. `20251118180000_financial_receivable_phase4.sql`
5. `20251118190000_financial_cash_flow_phase5.sql`
6. `20251118195000_financial_legacy_migration_phase6.sql`

## Fluxo recomendado (produção)

1. **Deploy** do backend (aplica SQL no Postgres).
2. Financeiro → **Fluxo de Caixa** → *Sincronizar quitações → caixa* (uma vez, se já existiam quitações).
3. Painel **Migração AR** → **Gerar prévia** → conferir → **Aplicar correção** por estabelecimento.
4. `npx vitest run src/lib/financial/`

## RPCs de validação

| Função | Uso |
|--------|-----|
| `preview_financial_ar_migration(establishment_id)` | Prévia JSON |
| `apply_financial_ar_migration(establishment_id, …)` | Correção controlada |

## Testes (spec §11)

`src/lib/financial/financialArApSpec.test.ts` — 18 cenários Vitest (domínio, sem Postgres).