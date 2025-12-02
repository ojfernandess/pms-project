# Aplicar Migration: Adicionar Horários de Check-in e Check-out

## Arquivo
`supabase/migrations/20251115000005_add_checkin_checkout_times_to_reservations.sql`

## Descrição
Esta migration adiciona os campos `checkin_time` e `checkout_time` à tabela `reservations` para permitir que cada reserva tenha horários específicos de check-in e check-out.

## Como Aplicar

### Via Supabase Dashboard:
1. Acesse o Supabase Dashboard
2. Vá em **SQL Editor**
3. Copie e cole o conteúdo do arquivo `20251115000005_add_checkin_checkout_times_to_reservations.sql`
4. Execute a query

### Via CLI:
```bash
supabase migration up
```

## Campos Adicionados
- `checkin_time` (TIME): Horário de check-in da reserva (opcional, usa padrão do hotel se NULL)
- `checkout_time` (TIME): Horário de check-out da reserva (opcional, usa padrão do hotel se NULL)

## Observações
- Os campos são opcionais (NULL permitido)
- Se NULL, o sistema deve usar os horários padrão das configurações do hotel
- Índices foram criados para melhorar performance em queries que filtram por horário


