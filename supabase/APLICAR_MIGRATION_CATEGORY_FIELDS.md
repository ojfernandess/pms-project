# Aplicar Migration: Adicionar campos adicionais à tabela room_categories

## Instruções

1. Acesse o Supabase Dashboard
2. Vá para **SQL Editor**
3. Execute o seguinte SQL:

```sql
-- Adicionar campos adicionais à tabela room_categories para suportar funcionalidades completas de edição

-- Tipo de categoria
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'housing_unit';

-- Taxa de limpeza do proprietário
ALTER TABLE public.room_categories 
  ADD COLUMN IF NOT EXISTS owner_cleaning_fee DECIMAL(10,2) DEFAULT 0.00;

-- Comentários
COMMENT ON COLUMN public.room_categories.type IS 'Tipo de categoria: housing_unit, apartment, house, suite';
COMMENT ON COLUMN public.room_categories.owner_cleaning_fee IS 'Taxa de limpeza do proprietário em reais';

-- Criar constraint para type
ALTER TABLE public.room_categories 
  ADD CONSTRAINT valid_category_type 
  CHECK (type IN ('housing_unit', 'apartment', 'house', 'suite'));
```

## O que esta migration faz?

- Adiciona o campo `type` para tipo de categoria (padrão: 'housing_unit')
- Adiciona o campo `owner_cleaning_fee` para taxa de limpeza do proprietário
- Cria constraint para validar o tipo de categoria
- Adiciona comentários descritivos nas colunas

## Arquivo da migration

`supabase/migrations/20251115000004_add_category_fields.sql`

