# StayOS CRM — Etapa 6 (Recursos avançados)

## Entrega

- **B2B:** `crm_companies`, `crm_company_contacts` — UI `/crm/empresas`
- **Fidelidade:** `crm_loyalty_programs` / `accounts` / `transactions` — UI `/crm/fidelidade`
- **Relatórios:** dashboard agregado + export CSV — UI `/crm/relatorios`
- Permissões: `crm_b2b`, `crm_loyalty`, `crm_reports`
- Dashboard CRM com KPIs reais (`GET /crm/reports/dashboard`)

## APIs

| Método | Path | Uso |
|--------|------|-----|
| GET/POST | `/crm/companies` | Listar / upsert empresa parceira |
| POST | `/crm/companies/:id/contacts` | Vincular contato CRM |
| GET | `/crm/loyalty/program` | Programa (cria default se necessário) |
| GET | `/crm/loyalty/accounts` | Saldos / tiers |
| POST | `/crm/loyalty/earn` | Creditar pontos (idempotente por reserva) |
| GET | `/crm/reports/dashboard` | KPIs filtráveis |
| GET | `/crm/reports/export` | CSV `leads_by_source` \| `campaigns` |

## Fidelidade — regras

- Pontos = `amount * points_per_currency` (sem desconto automático em reserva/PMS)
- Tiers default: Bronze → Prata → Ouro → Platinum
- Idempotência: `loyalty:earn:{contactId}:{reservationId}`

## Fora de escopo (explícito)

- Descontos/tarifas negociadas aplicadas no motor (estrutura B2B preparada via `commercial_terms`)
- Resgate automático de pontos no checkout
- Excel nativo (CSV cobre exportação)

## Roadmap CRM completo

Etapas 1–6 entregues. Evoluções futuras: resgate de pontos integrado ao tarifário, contratos B2B ↔ rate plans, inteligência preditiva.

## Migrations (Postgres)

Aplicar no **Postgres do PMS** (`DATABASE_URL` Easypanel/Dokploy), nunca via Supabase CLI.

- Script deploy: `backend/scripts/migration/apply-crm.sh` (entrypoint do backend)
- Guia: `backend/scripts/migration/APLICAR_CRM.md`
