# Aplicar Migration: Notificações de Limpeza

## ⚠️ IMPORTANTE: Execute esta migration no Supabase

A nova funcionalidade de **Notificações de Limpeza** requer um novo campo na tabela `hotel_settings`.

## Como Aplicar

### Opção 1: Via Interface do Supabase (Recomendado)

1. Acesse o dashboard do Supabase: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor**
4. Clique em **New Query**
5. Cole o conteúdo do arquivo: `supabase/migrations/20251210000004_add_enable_cleaning_notifications_to_hotel_settings.sql`
6. Clique em **Run** ou pressione `Ctrl+Enter`

### Opção 2: Via Supabase CLI

```bash
# No diretório raiz do projeto
supabase db push
```

## O que esta migration faz

1. **Adiciona campo `enable_cleaning_notifications`**: 
   - Tipo: BOOLEAN
   - Valor padrão: `true`
   - Controla se as notificações de limpeza devem ser geradas automaticamente

## Verificação

Após executar, verifique se o campo foi criado:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'hotel_settings' 
  AND column_name = 'enable_cleaning_notifications';
```

Você deve ver:
- `column_name`: `enable_cleaning_notifications`
- `data_type`: `boolean`
- `column_default`: `true`

## Reversão (se necessário)

Se precisar reverter a migration:

```sql
ALTER TABLE public.hotel_settings 
DROP COLUMN IF EXISTS enable_cleaning_notifications;
```

## Após aplicar

- A configuração "Notificações de Limpeza" estará disponível em Configurações > Horário e Pagamento > Notificações
- As notificações de limpeza serão criadas automaticamente apenas se a configuração estiver ativa
- O sistema funcionará normalmente mesmo se a migration não for aplicada (usando padrão: ativado)

