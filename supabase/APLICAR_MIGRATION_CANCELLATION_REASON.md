# Aplicar Migration: Motivo do Cancelamento

Esta migration adiciona um campo para armazenar o motivo do cancelamento de reservas.

## Arquivo
`supabase/migrations/20251115000007_add_cancellation_reason_to_reservations.sql`

## O que faz
- Adiciona o campo `cancellation_reason` (TEXT) para armazenar o motivo do cancelamento informado pelo usuário

## Como aplicar

### Via Supabase Dashboard
1. Acesse o Supabase Dashboard
2. Vá em "SQL Editor"
3. Cole o conteúdo do arquivo `20251115000007_add_cancellation_reason_to_reservations.sql`
4. Execute a query

### Via CLI
```bash
supabase migration up
```

## Após aplicar
- O sistema passará a solicitar o motivo do cancelamento ao cancelar uma reserva
- O motivo será armazenado no banco de dados para controle e análise


