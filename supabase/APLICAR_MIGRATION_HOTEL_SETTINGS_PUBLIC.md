# Aplicar Migration: Permitir Leitura Pública de hotel_settings

Esta migration adiciona uma política RLS (Row Level Security) para permitir que usuários não autenticados (anon) possam ler informações básicas da tabela `hotel_settings`, necessárias para o web check-in.

## Como Aplicar

### Opção 1: Via Supabase Dashboard (Recomendado)

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Clique em **New Query**
5. Cole o seguinte SQL:

```sql
-- Permitir leitura pública (anon) da tabela hotel_settings para web check-in
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'hotel_settings' 
    AND policyname = 'Allow public read access to hotel settings'
  ) THEN
    CREATE POLICY "Allow public read access to hotel settings"
      ON public.hotel_settings FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
```

6. Clique em **Run** para executar

### Opção 2: Via Supabase CLI

Se você estiver usando o Supabase CLI localmente:

```bash
supabase db push
```

Ou execute a migration diretamente:

```bash
supabase migration up
```

## Verificação

Após aplicar a migration, você pode verificar se a política foi criada corretamente:

1. No Supabase Dashboard, vá em **Authentication** > **Policies**
2. Selecione a tabela `hotel_settings`
3. Verifique se existe a política "Allow public read access to hotel settings" com:
   - **Operation**: SELECT
   - **Target roles**: anon, authenticated
   - **USING expression**: true

## Nota de Segurança

Esta política permite apenas **leitura (SELECT)** de dados públicos do estabelecimento (endereço, cidade, etc.). As operações de INSERT, UPDATE e DELETE continuam restritas apenas a usuários autenticados.

