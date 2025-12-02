# Aplicar Migration: Campos de Cancelamento de Reservas

Esta migration adiciona campos para rastrear informações de cancelamento de reservas.

## Arquivo
`supabase/migrations/20251115000006_add_cancellation_fields_to_reservations.sql`

## O que faz
- Adiciona o campo `cancelled_at` (TIMESTAMPTZ) para armazenar a data e horário do cancelamento
- Adiciona o campo `cancelled_by` (UUID) para armazenar o ID do usuário que cancelou a reserva
- Cria índices para melhorar a performance em consultas de cancelamentos

## Como aplicar

### Via Supabase Dashboard
1. Acesse o Supabase Dashboard
2. Vá em "SQL Editor"
3. Cole o conteúdo do arquivo `20251115000006_add_cancellation_fields_to_reservations.sql`
4. Execute a query

### Via CLI
```bash
supabase migration up
```

## Após aplicar
- O sistema passará a registrar automaticamente quem cancelou e quando ao cancelar uma reserva
- As informações de cancelamento serão exibidas na página de Detalhes da Reserva


