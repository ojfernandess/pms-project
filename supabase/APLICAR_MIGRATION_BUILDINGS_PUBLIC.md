# Aplicar Migration: Permitir Leitura Pública de Buildings

Esta migration permite que usuários não autenticados (anon) possam ler dados de prédios (buildings) para o web check-in funcionar corretamente.

## Arquivo da Migration

`supabase/migrations/20251115000016_allow_public_read_buildings.sql`

## Como Aplicar

### Opção 1: Via Supabase Dashboard

1. Acesse o Supabase Dashboard
2. Vá em **SQL Editor**
3. Cole o conteúdo do arquivo `20251115000016_allow_public_read_buildings.sql`
4. Execute a query

### Opção 2: Via CLI do Supabase

```bash
supabase db push
```

## O que a Migration Faz

- Cria uma política RLS que permite leitura pública (anon e authenticated) da tabela `buildings`
- Isso é necessário para que o web check-in possa buscar e exibir o endereço do prédio associado à categoria

## Verificação

Após aplicar a migration, você pode verificar se a política foi criada corretamente:

```sql
SELECT * FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename = 'buildings' 
AND policyname = 'Buildings are viewable by anyone for web check-in';
```

## Importante

⚠️ Esta política permite leitura pública de dados de prédios. Certifique-se de que não há informações sensíveis na tabela `buildings` que não devem ser expostas publicamente.


