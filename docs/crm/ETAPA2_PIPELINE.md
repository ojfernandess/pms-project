# StayOS CRM — Etapa 2 (Pipeline / Deals)

## Entrega

- `crm_pipelines`, `crm_pipeline_stages`, `crm_deals`
- Pipeline padrão **Vendas**: Lead → Qualificado → Proposta → Ganho → Perdido
- Kanban em `/:establishmentId/crm/pipeline`
- Leads a partir de **quotes** (staff + motor)
- Abandono do motor (`pagehide` com e-mail/telefone) → deal `source=motor_abandon`
- **Conversão** = vincular `reservation_id` existente (não cria reserva)

## APIs Nest

- `GET /crm/pipelines?companyId=`
- `GET /crm/board?companyId=&pipelineId=`
- `POST /crm/deals`
- `POST /crm/deals/from-quote`
- `POST /crm/deals/:id/move`
- `POST /crm/deals/:id/convert` `{ reservationId }`

## RPCs

- `crm_ensure_default_pipeline`
- `crm_upsert_deal_from_quote`
- `crm_upsert_abandoned_lead`

## Próxima etapa

**3** — Central: embutir Mensagens & Cobranças + contexto 360 (sem segundo WhatsApp). Ver `ETAPA3_CENTRAL.md`.
