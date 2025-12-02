# Correção do Erro 406 - Stripe Global Config

## Problema
Erro 406 (Not Acceptable) ao acessar `stripe_global_config` e erro de DNS para `m.stripe.com`.

## Causas Identificadas

1. **Erro 406 no Supabase**: A política RLS estava bloqueando acesso não autenticado, mas a query estava sendo feita antes da autenticação estar completa.

2. **Erro DNS do Stripe**: O Stripe.js pode estar tentando carregar antes de verificar se está habilitado.

## Soluções Implementadas

### 1. Migration: `20251123000003_fix_stripe_global_config_rls_406.sql`

- Permite acesso público para leitura da configuração global (necessário para verificar se Stripe está habilitado)
- Mantém acesso completo apenas para usuários autenticados
- Mantém políticas de gerenciamento apenas para super admin

### 2. Melhorias no Hook `useStripe.ts`

- Tratamento de erro 406 com fallback para configuração padrão
- Uso de `maybeSingle()` ao invés de `single()` para evitar erros quando não há dados
- Retry limitado e cache de 5 minutos
- Retorna configuração padrão desabilitada em caso de erro

## Como Aplicar

1. **Aplicar a migration no Supabase**:
   ```sql
   -- Execute a migration 20251123000003_fix_stripe_global_config_rls_406.sql
   ```

2. **Verificar se a tabela existe**:
   ```sql
   SELECT * FROM stripe_global_config;
   ```

3. **Verificar políticas RLS**:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'stripe_global_config';
   ```

## Verificação

Após aplicar a migration, verifique:

- ✅ Não há mais erro 406 no console
- ✅ A configuração do Stripe carrega corretamente
- ✅ O Stripe.js só carrega quando `is_enabled = true`

## Notas de Segurança

- A política pública permite leitura, mas não expõe chaves secretas (elas não devem ser retornadas em queries públicas)
- Apenas super admin pode modificar a configuração
- Usuários autenticados têm acesso completo para leitura

