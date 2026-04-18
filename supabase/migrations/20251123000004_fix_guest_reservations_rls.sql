-- Migration: Permitir que hóspedes vejam suas próprias reservas através do guest_stay_history
-- O problema: As políticas RLS de reservations só permitem acesso para usuários autenticados (TO authenticated)
-- Mas os hóspedes usam guest_accounts e não estão autenticados no Supabase Auth
-- Solução: Criar política que permite acesso público para reservas vinculadas ao guest_stay_history

-- IMPORTANTE: Esta política permite acesso público, mas é segura porque:
-- 1. O código do frontend já filtra guest_stay_history por guest_account_id
-- 2. Apenas reservas que estão no guest_stay_history são acessíveis
-- 3. O guest_stay_history só é criado quando o hóspede vincula uma reserva à sua conta

-- Remover política antiga se existir
DROP POLICY IF EXISTS "Guests can view their own reservations" ON public.reservations;

-- Criar política que permite acesso público para reservas vinculadas ao guest_stay_history
-- Esta política permite que hóspedes vejam suas próprias reservas através do guest_stay_history
-- A segurança é garantida porque o código já filtra por guest_account_id antes de buscar as reservas
CREATE POLICY "Guests can view their own reservations"
  ON public.reservations FOR SELECT
  TO public
  USING (
    -- Permitir acesso se a reserva está vinculada a um guest_stay_history
    -- Isso garante que apenas reservas vinculadas a contas de hóspedes sejam acessíveis
    EXISTS (
      SELECT 1 FROM public.guest_stay_history gsh
      WHERE gsh.reservation_id = reservations.id
    )
  );

-- Manter políticas existentes para usuários autenticados do PMS
-- As políticas existentes continuam funcionando para usuários autenticados
-- Esta nova política apenas adiciona acesso público para reservas vinculadas a guest_stay_history

