# send-daily-digest

Edge Function para envio do **resumo do dia** no fluxo de Mensagens & Cobranças: envia para um grupo no Chatwoot (ou para números no WhatsApp Cloud API) um resumo com:

- **Checkouts do dia**: reservas com data de checkout na data informada (quartos, hóspedes, localizador).
- **Manutenções abertas no dia**: tickets de manutenção com `opened_at` na data.
- **Bloqueios de quarto criados no dia**: reservas com status `blocked` e `created_at` na data.

## Uso

- **Chatwoot**: em Configuração → Resumo do dia, informe o **ID da conversa (grupo)** no Chatwoot. O resumo será enviado como mensagem nessa conversa.
- **WhatsApp Cloud API**: em Configuração → Resumo do dia, informe **um ou mais números** (um por linha, com DDI). O resumo será enviado para cada número via WhatsApp Cloud API.

Na aba **Resumo do dia** da tela Mensagens & Cobranças, escolha a data e clique em **Enviar resumo do dia**.

### Automação

Em **Configuração → Resumo do dia** é possível ativar **Automatizar envio do resumo do dia** e definir o **Horário de envio** (horário de Brasília). O envio automático depende da execução periódica da Edge Function **send-daily-digest-schedule** (por exemplo via cron-job.org a cada 15 minutos). Veja o README de `send-daily-digest-schedule`.

## Request

```json
POST /
{
  "establishment_id": "uuid-do-estabelecimento",
  "date": "2025-02-19"
}
```

- `date` é opcional; padrão é a data atual (YYYY-MM-DD).

## Response

```json
{
  "ok": true,
  "sent_chatwoot": true,
  "sent_whatsapp": 2,
  "errors": []
}
```

- `sent_chatwoot`: `true` se a mensagem foi enviada para a conversa no Chatwoot.
- `sent_whatsapp`: quantidade de números que receberam o resumo no WhatsApp.
- `errors`: lista de mensagens de erro, se houver.

## Configuração (channel_config)

- **Chatwoot**: `daily_digest_conversation_id` (número) – ID da conversa/grupo no Chatwoot.
- **WhatsApp Cloud**: `daily_digest_phones` – string (um número por linha) ou array de strings.

A função usa a mesma `checkin_charge_config` e `channel_config` já utilizadas pelo envio de cobrança/lembretes (base_url, account_id, api_key para Chatwoot; phone_id, access_token para WhatsApp Cloud).
