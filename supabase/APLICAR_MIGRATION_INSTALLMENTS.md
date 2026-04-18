# Aplicar Migration: Adicionar coluna installments à tabela payments

## Instruções

1. Acesse o Supabase Dashboard
2. Vá para **SQL Editor**
3. Execute o seguinte SQL:

```sql
-- Adicionar coluna installments à tabela payments
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS installments INTEGER DEFAULT 1 NOT NULL;

-- Comentário na coluna
COMMENT ON COLUMN public.payments.installments IS 'Número de parcelas do pagamento. Padrão: 1 (à vista)';

-- Atualizar registros existentes para ter 1 parcela (à vista)
UPDATE public.payments 
SET installments = 1 
WHERE installments IS NULL;
```

## O que esta migration faz?

- Adiciona a coluna `installments` (INTEGER) à tabela `payments`
- Define o valor padrão como `1` (pagamento à vista)
- Atualiza registros existentes para ter `1` parcela
- Adiciona um comentário descritivo na coluna

## Arquivo da migration

`supabase/migrations/20251115000002_add_installments_to_payments.sql`


