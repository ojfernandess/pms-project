# Aplicar Migration: Adicionar campos adicionais à tabela rooms

## Instruções

1. Acesse o Supabase Dashboard
2. Vá para **SQL Editor**
3. Execute o seguinte SQL:

```sql
-- Adicionar campos adicionais à tabela rooms para suportar funcionalidades completas de edição

-- Nome do quarto (além do room_number)
ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS name TEXT;

-- Usuário proprietário e proprietário para recibo
ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_for_receipt_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Campos financeiros
ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS commission DECIMAL(5,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS maintenance_fee DECIMAL(10,2) DEFAULT 0.00;

-- Autenticação
ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS authentication_type TEXT DEFAULT 'fixed_password',
  ADD COLUMN IF NOT EXISTS fixed_password TEXT;

-- Opções de exibição
ALTER TABLE public.rooms 
  ADD COLUMN IF NOT EXISTS exclude_from_billing BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_from_map BOOLEAN DEFAULT false;

-- Comentários
COMMENT ON COLUMN public.rooms.name IS 'Nome do quarto (ex: "Quarto 01", "Suite Master")';
COMMENT ON COLUMN public.rooms.owner_user_id IS 'ID do usuário proprietário para painel';
COMMENT ON COLUMN public.rooms.owner_for_receipt_id IS 'ID do proprietário para recibo';
COMMENT ON COLUMN public.rooms.commission IS 'Comissão em porcentagem (ex: 10.50 para 10,50%)';
COMMENT ON COLUMN public.rooms.maintenance_fee IS 'Taxa de manutenção em reais';
COMMENT ON COLUMN public.rooms.authentication_type IS 'Tipo de autenticação: fixed_password, dynamic_password, key_card, none';
COMMENT ON COLUMN public.rooms.fixed_password IS 'Senha fixa para acesso';
COMMENT ON COLUMN public.rooms.exclude_from_billing IS 'Retirar dos cálculos de faturamento e taxa de ocupação';
COMMENT ON COLUMN public.rooms.hide_from_map IS 'Ocultar do mapa de reservas';

-- Atualizar registros existentes para usar room_number como name se name estiver vazio
UPDATE public.rooms 
SET name = room_number 
WHERE name IS NULL OR name = '';

-- Criar constraint para authentication_type
ALTER TABLE public.rooms 
  ADD CONSTRAINT valid_authentication_type 
  CHECK (authentication_type IN ('fixed_password', 'dynamic_password', 'key_card', 'none'));
```

## O que esta migration faz?

- Adiciona o campo `name` para nome do quarto
- Adiciona campos de proprietário (`owner_user_id`, `owner_for_receipt_id`)
- Adiciona campos financeiros (`commission`, `maintenance_fee`)
- Adiciona campos de autenticação (`authentication_type`, `fixed_password`)
- Adiciona opções de exibição (`exclude_from_billing`, `hide_from_map`)
- Atualiza registros existentes para preencher `name` com `room_number`
- Cria constraint para validar `authentication_type`

## Arquivo da migration

`supabase/migrations/20251115000003_add_room_fields.sql`


