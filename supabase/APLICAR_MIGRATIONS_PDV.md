# Aplicar Migrations: PDV - Taxas e Serviços

Estas migrations criam as tabelas necessárias para o sistema de PDV (Ponto de Venda) que permite adicionar taxas e serviços às reservas.

## Arquivos
1. `supabase/migrations/20251115000008_create_service_fees.sql` - Cria tabela de tipos de taxas/serviços
2. `supabase/migrations/20251115000009_create_reservation_service_fees.sql` - Cria tabela de taxas adicionadas às reservas

## O que fazem

### Migration 1: service_fees
- Cria tabela para tipos de taxas/serviços (ex: Taxa extra, Late Checkout, Upgrade)
- Campos: `id`, `establishment_id`, `name`, `description`, `is_active`
- Permite ativar/desativar taxas
- RLS habilitado

### Migration 2: reservation_service_fees
- Cria tabela para taxas adicionadas às reservas
- Campos: `id`, `reservation_id`, `service_fee_id`, `amount`, `quantity`, `notes`
- Permite adicionar múltiplas taxas a uma reserva
- RLS habilitado

## Como aplicar

### Via Supabase Dashboard
1. Acesse o Supabase Dashboard
2. Vá em "SQL Editor"
3. Execute primeiro o arquivo `20251115000008_create_service_fees.sql`
4. Depois execute o arquivo `20251115000009_create_reservation_service_fees.sql`

### Via CLI
```bash
supabase migration up
```

## Após aplicar
- A aba "Taxas" estará disponível em Financeiro para gerenciar tipos de taxas
- As reservas poderão ter taxas adicionadas através do PDV
- O total da reserva será calculado incluindo as taxas


