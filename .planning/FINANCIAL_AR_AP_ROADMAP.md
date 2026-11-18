# Roadmap — Reestruturação Contas a Pagar e Contas a Receber

## Estado atual (auditoria)

| Área | Situação |
|------|----------|
| `accounts_receivable` / `accounts_payable` | Tabelas base em `20250126000001`; fornecedor embutido em texto |
| Geração AR reserva | Trigger cria título mesmo com reserva quitada; `amount` = só `total_amount` (ignora taxas) |
| Frontend | `createReceivableFromReservation` força `paid_amount: 0` |
| Caixa | `cash_flow_transactions` ligado a `daily_cash_flow`; títulos em aberto podem confundir relatórios |
| Testes automatizados | Poucos unitários no domínio financeiro |

## Fases

### Fase 1 — Correção AR + status centralizado (concluída)

- Sincronização reserva → título apenas com saldo > 0
- `amount` = diárias + taxas; `paid_amount` = pago na reserva
- Reserva quitada: não criar título novo; encerrar existente
- Excluir vagas espelho (`lodging_reservation_id` + total zero)
- Migração de reconciliação dos títulos existentes
- `financialTitleStatus` + testes Vitest

### Fase 2 — Modelo de movimentações e alocação (concluída)

- Tabelas `financial_title_settlements` + `financial_settlement_batches`
- RPCs `register_receivable_settlement`, `register_payable_settlement`, lote AR
- Idempotência por `idempotency_key` + `financial_audit_logs` (action `settlement`)
- Recálculo de `paid_amount`: reserva + quitações financeiras (AR); soma de quitações (AP)
- Serviço `financialSettlementsService.ts` + `payAccounts*` via RPC
- Testes Vitest de idempotência

### Fase 3 — Contas a Pagar (concluída)

- Tabela `financial_suppliers` + vínculo `supplier_id` em AP
- RPCs `spawn_due_recurring_payables`, `approve_accounts_payable`, `reject_accounts_payable`
- `register_payable_settlement` exige aprovação
- Serviços: `suppliersService`, AP estendido (aprovação, recorrência, KPIs)
- UI: fornecedores, categorias, recorrência, aprovação, histórico de pagamentos, botão gerar recorrências
- Testes Vitest `expenseCategories.test.ts`

### Fase 4 — Contas a Receber completo (concluída)

- Colunas devedor, categoria, parcelas, origem `manual`; sync reserva com faturamento corporativo (`client_id` ≠ `guest_id`)
- Cadastro manual + parcelas + busca de clientes
- Recebimento em lote (`register_receivable_settlement_batch`) na UI
- KPIs, filtros devedor/categoria, histórico e forma de pagamento no recebimento
- Testes `receivableCategories.test.ts`

### Fase 5 — Fluxo de caixa (concluída)

- Trigger quitação → `cash_flow_transactions` (idempotente por `financial_settlement_id`)
- RPC `get_financial_cash_flow_report` (realizado vs projeção AR/AP)
- `backfill_settlement_cash_flow`, `FinancialCashFlowDashboard` + aba Financeiro
- Testes `cashFlowAggregation.test.ts`

### Fase 6 — Migração validada + E2E (concluída)

- RPCs `preview_financial_ar_migration` / `apply_financial_ar_migration`
- Painel `FinancialArMigrationPanel` + guia `.planning/FINANCIAL_AR_AP_MIGRATION.md`
- `financialArApSpec.test.ts` — 18 cenários spec §11 (Vitest)
- **Deploy Postgres:** `backend/scripts/migration/apply-financial-ar-ap.sh` + `docker-entrypoint.sh` (não Supabase)