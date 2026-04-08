# Channex PMS Certification Checklist

## Setup
- [ ] Criar propriedade de teste no Channex.
- [ ] Configurar canal `Channex` no PMS (base URL, API key, property ID).
- [ ] Mapear quartos e planos (`channel_room_code`/`channel_rate_plan_code`) com UUIDs do Channex.

## ARI
- [ ] Full sync 500 dias em 2 chamadas (availability + restrictions).
- [ ] Update unitário de tarifa (1 data, 1 plano).
- [ ] Update em lote de múltiplos planos/datas.
- [ ] Atualizações de restrições (min_stay, CTA, CTD, stop_sell).
- [ ] Atualizações de disponibilidade (single e range).
- [ ] Confirmar controle de rate limit e retry em 429.

## Bookings
- [ ] Receber booking `new` via feed/webhook trigger.
- [ ] Receber booking `modified` e refletir no PMS.
- [ ] Receber booking `cancelled` e refletir no PMS.
- [ ] Confirmar idempotência por `revision_id`.
- [ ] Confirmar ACK em `booking_revisions/:id/ack` após persistência.

## Operação
- [ ] Verificar logs em `channex_sync_logs`.
- [ ] Verificar fila de ACK em `channex_ack_queue`.
- [ ] Verificar revisões em `channex_booking_revisions`.
- [ ] Validar exibição da origem como `Channex / <OTA>`.
