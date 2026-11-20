# StayOS CRM — Auditoria da fundação (ETAPA 1)

Documento de mapeamento: o que reutilizar vs. o que é novo. Não altera regras do PMS/motor.

## Reutilizar

| Área | Onde | Uso no CRM |
|------|------|------------|
| Contato operacional | `clients` (`backend/prisma/schema.prisma`) | Identidade PMS; FKs `reservations.client_id` / `guest_id` |
| Deduplicação | `src/components/clients/ClientDeduplication.tsx`, flag `client_deduplication` | Merge manual; CRM estende com `crm_audit_logs` |
| Orçamentos / motor | `quotes`, `src/pages/PublicReservation.tsx` | Seed comercial (etapa 2); captura contato na etapa 1 |
| Pós-reserva staff | `src/lib/reservationPostCommit.ts` | Webhook + outbox `booking.created` / `booking.cancelled` |
| WhatsApp outbound | `/cobranca-checkin`, Chatwoot/Evolution | Reuso na Central (etapa 3); **não** criar segundo inbox |
| Feature flags | `src/pages/SuperAdmin.tsx`, `src/lib/featureAccess.ts` | Gate `features_enabled.crm` por `company_ids` |
| Permissões | `src/lib/permissions.ts`, `employee_roles` | Chaves `crm`, `crm_contacts` |
| Filas | BullMQ `system`/`pms`, `email_queue` | Consumo futuro do outbox CRM |

## Migrations

DDL CRM vive em `backend/prisma/migrations/20261120*crm*` e é aplicado no **Postgres** via `backend/scripts/migration/apply-crm.sh` no restart do backend. Não usar `supabase db push`.

## Novo (ETAPA 1)

| Artefato | Descrição |
|----------|-----------|
| `crm_contacts` | Perfil unificado company-scoped |
| `crm_contact_client_links` | N:N contato ↔ `clients` |
| `crm_activities` | Timeline (note, call, email, system) |
| `crm_consent` | Marketing vs operacional por canal |
| `crm_outbox_events` | Eventos idempotentes para sync/filas |
| `crm_audit_logs` | Merges e alterações sensíveis |
| Flag `crm` | Super Admin `{ enabled, company_ids }` |
| Menu/rotas CRM | Dashboard, Contatos, Perfil 360 |
| `CrmModule` (Nest) | list/get/upsert, agregação 360, merge stub |
| Hooks PMS/motor | Outbox em post-commit e PublicReservation |

## Não existe (roadmap 2–6)

Leads/deals/pipelines, campanhas, fidelidade, inbox unificado, automações avançadas.

## Riscos e mitigações

1. **Motor público** cria `clients` + reserva sem `runAfterReservationCreated` → hook explícito de outbox em `PublicReservation` após lock.
2. **Dual `client_id` / `guest_id`** → agregação 360 usa `OR` nos links de clients.
3. **`types.ts` Supabase defasado** → FE tipa CRM localmente; Prisma é fonte de verdade do schema.
4. **Não copiar reservas** → 360 lê PMS via links → clients → reservations.

## Critérios de aceite (Etapa 1)

1. Flag `crm` desliga menu/rotas na empresa.
2. Contato listável com histórico real de reservas.
3. Cliente motor/PMS aparece/atualiza via outbox/sync.
4. Sem mudança em lock, tarifas, cancelamento, channel manager ou check-in rules.
5. Sem mock data nas rotas entregues.
