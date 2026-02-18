# list-channel-templates

Edge Function para **listar templates disponíveis** por canal, usada na tela de configuração da Cobrança de Check-in.

## Uso

**POST** com body:

```json
{
  "establishment_id": "uuid-do-estabelecimento"
}
```

A função carrega a `checkin_charge_config` do estabelecimento e, conforme o canal configurado, retorna:

- **internal:** sempre preenchido com os templates da tabela `checkin_charge_templates` do estabelecimento.
- **meta:** (apenas canal `whatsapp_cloud`) lista de templates aprovados na Meta, via Graph API `GET /{waba_id}/message_templates`. Exige `channel_config.waba_id` e `channel_config.access_token`.
- **chatwoot:** (apenas canal `chatwoot`) Canned Responses da conta, via `GET /api/v1/accounts/{account_id}/canned_responses`.

## Resposta

```json
{
  "channel": "whatsapp_cloud",
  "internal": [
    { "id": "uuid", "name": "Cobrança padrão", "body": "Olá {{guest_name}}..." }
  ],
  "meta": [
    { "name": "hello_world", "language": "pt_BR", "status": "APPROVED" }
  ],
  "chatwoot": [
    { "id": 1, "short_code": "checkin", "content": "Olá, segue link..." }
  ]
}
```

Os campos `meta` e `chatwoot` só aparecem quando o canal é WhatsApp Cloud ou Chatwoot respectivamente.
