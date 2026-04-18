# send-daily-digest-schedule

Dispara o envio automático do **resumo do dia** para estabelecimentos que têm a opção "Automatizar envio do resumo do dia" ativada e o horário configurado (horário de Brasília).

- A função usa o horário atual em **America/Sao_Paulo** e envia o resumo para todos os estabelecimentos cujo **hora** configurada (`daily_digest_time`, ex. `08:00`) coincide com a **hora atual** (ex.: 13:00, 13:30 ou 13:53 → hora 13). Ou seja: o matching é **por hora**, não por minuto. Se você configurou 08:00, qualquer execução do cron entre 08:00 e 08:59 (horário de Brasília) dispara o envio.
- A data do resumo é o dia atual no fuso de Brasília.

## Uso (cron)

Chame esta função via **GET** ou **POST** em um agendamento externo (ex.: cron-job.org):

- **Recomendado**: a cada **hora** (ex.: no minuto 0: `0 * * * *`). Assim, quando for 08:00 em Brasília, o envio será disparado para quem configurou 08:xx.
- Alternativa: a cada 15 minutos se quiser mais precisão no minuto.

Exemplo de URL:

```
GET https://<SUPABASE_URL>/functions/v1/send-daily-digest-schedule
```

Com autenticação (header `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` ou `apikey` do projeto).

## Exemplo cron-job.org

- **URL**: `https://seu-projeto.supabase.co/functions/v1/send-daily-digest-schedule`
- **Método**: GET (ou POST)
- **Agendamento**: a cada 15 minutos (`*/15 * * * *`) ou a cada hora (`0 * * * *`).
- **Headers**: adicione `Authorization: Bearer <sua-service-role-key>` se o endpoint exigir.

## Resposta

```json
{
  "success": true,
  "sent": 2,
  "total": 2,
  "current_time": "08:00",
  "date": "2025-02-19",
  "results": [
    { "establishment_id": "...", "ok": true },
    { "establishment_id": "...", "ok": true }
  ]
}
```

- `current_time`: hora em Brasília no momento da execução.
- `date`: data do resumo (hoje em Brasília).
- `sent` / `total`: quantos estabelecimentos receberam o resumo com sucesso e quantos foram processados.
