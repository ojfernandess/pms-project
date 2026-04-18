# Aplicar Migration: Campo de Interdição de Quartos

## ⚠️ IMPORTANTE: Execute esta migration no Supabase

A nova funcionalidade de **Interdição de Quartos** requer um novo campo na tabela `rooms`.

## Como Aplicar

### Opção 1: Via Interface do Supabase (Recomendado)

1. Acesse o dashboard do Supabase: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Clique em **New Query**
5. Cole o conteúdo do arquivo: `supabase/migrations/20251120000035_add_room_blocked_field.sql`
6. Clique em **Run** ou pressione `Ctrl+Enter`

### Opção 2: Via Supabase CLI

```bash
# No diretório raiz do projeto
supabase db push
```

## O que esta migration faz

1. **Adiciona campo `is_blocked`**: 
   - Tipo: BOOLEAN
   - Valor padrão: `false`
   - Indica se o quarto está interditado

2. **Cria índice**:
   - Melhora performance em consultas que filtram quartos interditados
   - Índice parcial (apenas para `is_blocked = true`)

## Verificação

Após executar, verifique se o campo foi criado:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'rooms' 
  AND column_name = 'is_blocked';
```

Você deve ver:
- `column_name`: `is_blocked`
- `data_type`: `boolean`
- `column_default`: `false`

## Reversão (se necessário)

Se precisar reverter a migration:

```sql
DROP INDEX IF EXISTS idx_rooms_is_blocked;
ALTER TABLE public.rooms 
DROP COLUMN IF EXISTS is_blocked;
```

## Após aplicar

- O campo "Interditar Quarto" estará disponível no formulário de edição de quartos
- Quartos interditados aparecerão com ícone de cadeado no mapa de reservas
- Não será possível criar reservas em quartos interditados

