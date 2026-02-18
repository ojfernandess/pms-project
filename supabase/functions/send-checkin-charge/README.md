# send-checkin-charge

Edge Function para **envio de cobrança de check-in** integrada ao PMS: disparo de mensagens transacionais (WhatsApp, Chatwoot, Evolution API ou webhook) com link de pagamento e web check-in.

## Ativação

- **Super Admin:** em `site_settings.features_enabled` ative `checkin_charge_enabled` e inclua as `company_ids` desejadas.
- **Por estabelecimento:** em `checkin_charge_config` configure `enabled`, `send_timing`, `amount_type`/`amount_value`, `due_date_days`, `channel` e `channel_config`.

## Uso

**POST** com body:

```json
{
  "reservation_id": "uuid-da-reserva"
}
```

ou múltiplas reservas:

```json
{
  "reservation_ids": ["uuid1", "uuid2"]
}
```

A função:

1. Valida feature flag e config do estabelecimento.
2. Calcula valor (total, percentual ou fixo) e data de vencimento.
3. Gera token seguro para link de pagamento e usa locator do web check-in se existir.
4. Aplica template. Variáveis disponíveis: `guest_name`, `reservation_code`, `localizador` (alias de reservation_code), `checkin_date`, `checkout_date`, `amount`, `payment_link`, `web_checkin_link`.
5. Envia mensagem pelo canal configurado (WhatsApp Cloud, Chatwoot, Evolution API ou webhook).
6. Insere/atualiza `checkin_charges` e registra em `checkin_charge_logs`.

## Origem do template (template_source)

- **internal:** usa `checkin_charge_templates` (sistema) ou texto livre; Evolution API envia texto com variáveis substituídas.
- **meta:** templates oficiais aprovados na Meta (WhatsApp). Crie o template no Meta Business com as variáveis desejadas (ex.: {{1}} nome, {{2}} localizador, {{3}} link check-in; para cobrança inclua link de pagamento). Configure `meta_template_name`, `meta_template_language` e `meta_template_body_variables` na ordem em que os parâmetros aparecem no body do template (ex.: mensagem: `guest_name, reservation_code, web_checkin_link`; cobrança: `guest_name, reservation_code, amount, payment_link`).
- **chatwoot:** Canned Responses do Chatwoot. O conteúdo usa as mesmas variáveis (`{{guest_name}}`, `{{localizador}}`, `{{payment_link}}`, etc.). O Chatwoot pode usar um inbox conectado à **Evolution API** para enviar WhatsApp ao hóspede sem usar Meta API.

## Canais (channel_config)

- **whatsapp_cloud:** `phone_id`, `access_token`, `waba_id` (ID da WhatsApp Business Account, para listar templates Meta).
- **chatwoot:** `base_url`, `account_id`, `inbox_id`, `api_key`. O inbox deve ser do tipo **API**. Para enviar WhatsApp pelo Chatwoot sem usar Meta, conecte um inbox **Evolution API** no Chatwoot; o envio continua pela API do Chatwoot (cria contato, conversa e mensagem com variáveis substituídas).
- **evolution_api:** `base_url`, `instance`. Envia WhatsApp diretamente (sem Meta). Use templates internos do sistema; as variáveis são substituídas no texto.
- **webhook:** `url` (POST com `to`, `message`, `reservation_id`).

## Links gerados

- **Pagamento:** a função chama a Edge Function `stripe-payment` para criar um Payment Intent; o link enviado é `{baseUrl}/payment/{payment_intent_id}` (ex.: `https://seusite.com/payment/pi_3T2CfUG70nwUgqCa0ck1JdvX`). Se o Stripe não estiver configurado para o estabelecimento, é usado fallback: `{baseUrl}/payment/checkin/{token}` (a página de check-in cria o Payment Intent ao abrir o link).
- Web check-in: `{baseUrl}/web-checkin/{locator}` (quando já existir registro em `web_checkin`).

## Automação

Chame esta função:

- **Após confirmação da reserva:** a partir do seu fluxo (trigger, outro job ou API).
- **X dias antes do check-in:** via cron (ex.: diário) filtrando reservas com `checkin_date = hoje + X` e status confirmado.
- **Manual:** pela interface do PMS ou API.

Exemplo de cron (diário) para “3 dias antes do check-in”:

1. Buscar reservas com `checkin_date = CURRENT_DATE + 3` e `status = 'confirmed'`.
2. Para cada uma, chamar esta função com `reservation_id`.

## Resposta

```json
{
  "success": true,
  "results": [
    {
      "reservation_id": "uuid",
      "success": true,
      "checkin_charge_id": "uuid"
    }
  ]
}
```

Em falha por reserva, o item em `results` terá `success: false` e `error` com a mensagem.
