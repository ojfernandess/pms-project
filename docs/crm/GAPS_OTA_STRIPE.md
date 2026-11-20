# Gaps CRM — OTA / Stripe (Etapa 1)

Documentação mínima do plano: hooks futuros sem alterar RPCs de lock/tarifas.

## OTA (Channex / Aiosell / Bukly)

- Reservas entram via webhooks Nest (`channex-reservations`, `aiosell`, `bukly-reservations`).
- **Gap:** pós-insert OTA ainda não grava `crm_outbox_events`.
- **Hook mínimo sugerido (etapa seguinte):** após create/update bem-sucedido da reserva local, chamar `CrmService.enqueueOutbox` com `booking.created` / `contact.upserted` (mesmo contrato do PMS/motor).

## Stripe

- Pagamentos e payment links não criam contato CRM sozinhos.
- Contato/reserva já devem existir via PMS/motor; eventos financeiros ficam fora do escopo da Etapa 1.

## Regra

Não alterar `create_reservation_with_lock`, regras de cancelamento, channel manager sync ou check-in rules para fechar estes gaps.
