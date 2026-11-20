# StayOS CRM — Etapa 5 (Automações)

## Entrega

- Tabelas `crm_automation_templates`, `crm_automations`, `crm_automation_runs`
- Engine: trigger → conditions (AND) → actions → run na fila BullMQ `crm` / job `automation.run`
- Nest: CRUD + dispatch a partir do outbox CRM e `deal.won`
- UI: `/crm/automacoes` (templates, ativar/pausar, runs)
- Permissão `crm_automations` nos roles

## Templates iniciais

| key | trigger |
|-----|---------|
| `welcome_after_booking` | `booking.created` |
| `note_on_motor_abandon` | `lead.abandoned` |
| `tag_deal_won` | `deal.won` |
| `checkout_followup_note` | `booking.checked_out` |

## Actions suportadas

- `create_activity` — nota no contato (resolve por `crm_contact_id` / `client_id` / email)
- `set_contact_classification`
- `add_contact_tag`
- `enqueue_outbox` — evento CRM adicional (idempotente)

## Fluxo

1. Outbox processado (`CrmService`) ou deal convertido → `CrmAutomationsService.onOutboxEvent` / `dispatchTrigger`
2. Match por `company_id` + `trigger_type` + conditions
3. Cria `crm_automation_runs` (`queued`) → worker `automation.run`
4. Executa actions e grava `result` / `status`

## Próxima etapa

**6** — B2B, fidelidade, relatórios → ver `ETAPA6_ADVANCED.md`
