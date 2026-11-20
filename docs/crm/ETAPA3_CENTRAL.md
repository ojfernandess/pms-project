# StayOS CRM — Etapa 3 (Central)

## Entrega

- Rota `/:establishmentId/crm/central`
- **Embute** a UI existente de Mensagens & Cobranças (`CheckinChargeSettings`)
- Painel lateral **Contexto 360** do contato CRM ao selecionar uma reserva
- **Não** cria segundo WhatsApp/inbox — reusa `send-checkin-charge` e canais já configurados
- Deep-links: Contato 360 / Pipeline → Central (`?contactId=` / `?reservationId=`)

## Flags

- CRM (`features_enabled.crm`) — gate da Central
- Mensagens & Cobranças (`checkin_charge_enabled`) — bloco de envio; se off, Central mostra aviso

## Próxima etapa

**4** — Segmentos + campanhas + recipients + consentimento; filas BullMQ. Ver `ETAPA4_CAMPAIGNS.md`.
