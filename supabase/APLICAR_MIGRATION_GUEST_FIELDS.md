# Aplicar Migration para Campos de Hóspede

## ⚠️ IMPORTANTE: Execute esta migration no Supabase

A nova funcionalidade de **Responsável Financeiro diferente do Hóspede** requer dois novos campos na tabela `reservations`.

## Como Aplicar

### Opção 1: Via Interface do Supabase (Recomendado)

1. Acesse o dashboard do Supabase: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Clique em **New Query**
5. Cole o conteúdo do arquivo: `supabase/migrations/20251115000001_add_guest_fields_to_reservations.sql`
6. Clique em **Run** ou pressione `Ctrl+Enter`

### Opção 2: Via Supabase CLI

```bash
# No diretório raiz do projeto
supabase db push
```

## O que esta migration faz

1. **Adiciona campo `guest_id`**: 
   - Referência para o cliente que é o hóspede
   - Permite ter um responsável financeiro diferente

2. **Adiciona campo `guest_name`**: 
   - Nome do hóspede (desnormalizado)
   - Melhora performance das queries

3. **Atualiza registros existentes**:
   - Define `guest_id = client_id` para reservas antigas
   - Mantém compatibilidade com reservas existentes

4. **Cria índice**:
   - Melhora performance ao buscar reservas por hóspede

## Verificação

Após executar, verifique se os campos foram criados:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'reservations' 
  AND column_name IN ('guest_id', 'guest_name');
```

## Reversão (se necessário)

Se precisar reverter a migration:

```sql
ALTER TABLE public.reservations 
DROP COLUMN IF EXISTS guest_id,
DROP COLUMN IF EXISTS guest_name;

DROP INDEX IF EXISTS idx_reservations_guest_id;
```


