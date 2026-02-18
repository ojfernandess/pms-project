# send-checkin-charge-schedule

Dispara o envio automático de **Mensagens & Cobranças** para reservas elegíveis conforme a configuração de cada estabelecimento (`send_timing`).

## Quando é usado

- **`send_timing = 'days_before_checkin'`**: reservas com check-in em exatamente **N dias** (valor de `days_before_checkin`), status `pending`, `unpaid` ou `confirmed`, que ainda não tiveram cobrança enviada.
- **`send_timing = 'after_ota'`**: reservas criadas nas **últimas 48 horas** com `channel` em `booking`, `expedia` ou `ota`, que ainda não tiveram cobrança enviada.

## Uso (cron)

Chame esta função via **GET** em um agendamento (ex.: cron-job.org, diário às 9h):

```
GET https://<SUPABASE_URL>/functions/v1/send-checkin-charge-schedule
Header: Authorization: Bearer <SUPABASE_ANON_KEY ou SERVICE_ROLE_KEY>
```

Parâmetros opcionais (query string):

- `establishment_id`: UUID do estabelecimento — se informado, processa só esse estabelecimento.

## Exemplo de configuração no cron-job.org

- **URL**: `https://seu-projeto.supabase.co/functions/v1/send-checkin-charge-schedule`
- **Método**: GET
- **Header**: `Authorization: Bearer <sua_service_role_key>`
- **Agendamento**: Diário, horário desejado (ex.: 09:00).

Sem essa função agendada, as opções **X dias antes do check-in** e **Após reserva OTA** não disparam envio automático.
