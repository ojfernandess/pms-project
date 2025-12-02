# Correção de Erro 406 - Acesso a Rooms, Room Categories, Establishments e Clients

## Problema

Os hóspedes estão recebendo erro 406 (Not Acceptable) ao tentar visualizar informações de:
- `rooms` (quartos)
- `room_categories` (categorias de quartos)
- `establishments` (estabelecimentos)
- `clients` (clientes/hóspedes e responsáveis financeiros)

Isso acontece porque as políticas RLS (Row Level Security) dessas tabelas bloqueiam o acesso público, mas os hóspedes precisam ver essas informações quando visualizam suas reservas.

## Solução

Foi criada uma migration que adiciona políticas RLS permitindo acesso público **apenas** para dados relacionados a reservas que estão vinculadas ao `guest_stay_history`.

### Arquivo da Migration
`supabase/migrations/20251123000005_fix_guest_related_tables_rls.sql`

## Como Aplicar

### Opção 1: Via Supabase Dashboard (Recomendado)

1. Acesse o [Supabase Dashboard](https://app.supabase.com)
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Clique em **New Query**
5. Abra o arquivo `supabase/migrations/20251123000005_fix_guest_related_tables_rls.sql`
6. Copie e cole todo o conteúdo no editor SQL
7. Clique em **Run** ou pressione `Ctrl+Enter`

### Opção 2: Via Supabase CLI

```bash
# No diretório raiz do projeto
supabase db push
```

## O que a Migration Faz

1. **Cria políticas RLS para `rooms`**:
   - Permite acesso público para quartos relacionados a reservas do `guest_stay_history`
   - Apenas SELECT (leitura), não permite modificações

2. **Cria políticas RLS para `room_categories`**:
   - Permite acesso público para categorias relacionadas a reservas do `guest_stay_history`
   - Apenas SELECT (leitura), não permite modificações

3. **Cria políticas RLS para `establishments`**:
   - Permite acesso público para estabelecimentos relacionados a reservas do `guest_stay_history`
   - Apenas SELECT (leitura), não permite modificações

4. **Cria políticas RLS para `clients`**:
   - Permite acesso público para clientes relacionados a reservas do `guest_stay_history`
   - Inclui tanto hóspedes principais (`guest_id`) quanto responsáveis financeiros (`client_id`)
   - Apenas SELECT (leitura), não permite modificações

## Segurança

Estas políticas são seguras porque:
- ✅ Apenas permitem SELECT (leitura), não permitem INSERT, UPDATE ou DELETE
- ✅ Apenas dados relacionados a reservas vinculadas ao `guest_stay_history` são acessíveis
- ✅ O código do frontend já filtra `guest_stay_history` por `guest_account_id`
- ✅ O `guest_stay_history` só é criado quando o hóspede vincula uma reserva à sua conta

## Verificação

Após aplicar a migration, verifique se as políticas foram criadas:

```sql
-- Verificar políticas de rooms
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'rooms' 
AND policyname LIKE '%Guests%';

-- Verificar políticas de room_categories
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'room_categories' 
AND policyname LIKE '%Guests%';

-- Verificar políticas de establishments
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'establishments' 
AND policyname LIKE '%Guests%';

-- Verificar políticas de clients
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'clients' 
AND policyname LIKE '%Guests%';
```

## Após Aplicar

- ✅ Os erros 406 devem desaparecer
- ✅ Hóspedes poderão ver informações de quartos, categorias e estabelecimentos relacionados às suas reservas
- ✅ O GuestDashboard deve funcionar corretamente sem erros de acesso

