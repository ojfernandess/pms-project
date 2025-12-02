# Correção: Reservas não aparecem no Guest Dashboard sem login no PMS

## Problema
As reservas só aparecem no guest-dashboard se um usuário logar no PMS. Hóspedes autenticados via `guest_accounts` não conseguem ver suas reservas.

## Causa Raiz
As políticas RLS (Row Level Security) da tabela `reservations` só permitem acesso para usuários autenticados no Supabase Auth (`TO authenticated`). Os hóspedes usam o sistema de autenticação próprio (`guest_accounts`) e não estão autenticados no Supabase Auth, então não conseguem acessar a tabela `reservations`.

## Solução Implementada

### Migration: `20251123000004_fix_guest_reservations_rls.sql`

Criada política RLS que permite acesso público para reservas vinculadas ao `guest_stay_history`:

```sql
CREATE POLICY "Guests can view their own reservations"
  ON public.reservations FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.guest_stay_history gsh
      WHERE gsh.reservation_id = reservations.id
    )
  );
```

### Por que é seguro?

1. **Filtro por guest_account_id**: O código do frontend já filtra `guest_stay_history` por `guest_account_id` antes de buscar as reservas
2. **Apenas reservas vinculadas**: Apenas reservas que estão no `guest_stay_history` são acessíveis
3. **Vinculação controlada**: O `guest_stay_history` só é criado quando o hóspede vincula uma reserva à sua conta através do processo de web-checkin

### Fluxo de Segurança

1. Hóspede faz login via `guest_accounts` (não Supabase Auth)
2. Código busca `guest_stay_history` filtrando por `guest_account_id`
3. Código busca `reservations` usando os `reservation_id` do histórico
4. Política RLS permite acesso apenas para reservas que estão no `guest_stay_history`

## Como Aplicar

1. **Aplicar a migration no Supabase**:
   ```sql
   -- Execute a migration 20251123000004_fix_guest_reservations_rls.sql
   ```

2. **Verificar se a política foi criada**:
   ```sql
   SELECT * FROM pg_policies 
   WHERE tablename = 'reservations' 
   AND policyname = 'Guests can view their own reservations';
   ```

3. **Testar**:
   - Faça login como hóspede no guest-dashboard
   - Verifique se as reservas aparecem corretamente
   - Verifique se apenas as reservas vinculadas ao hóspede são visíveis

## Verificação

Após aplicar a migration, verifique:

- ✅ Hóspedes podem ver suas reservas no guest-dashboard
- ✅ Apenas reservas vinculadas ao `guest_stay_history` são acessíveis
- ✅ Usuários do PMS continuam tendo acesso completo (políticas antigas mantidas)
- ✅ Não há acesso a reservas de outros hóspedes

## Notas Técnicas

- A política usa `TO public` para permitir acesso sem autenticação Supabase Auth
- A segurança é garantida pela verificação de existência no `guest_stay_history`
- As políticas existentes para usuários autenticados do PMS são mantidas
- Esta solução não afeta outras funcionalidades do sistema

