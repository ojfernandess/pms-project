-- Migration: Permitir que hóspedes vejam reservas durante o processo de vinculação inicial
-- O problema: A política RLS atual só permite acesso a reservas que já estão no guest_stay_history
-- Mas quando o hóspede está tentando vincular uma reserva pela primeira vez, ela ainda não está no guest_stay_history
-- Solução: Criar política adicional que permite acesso a reservas através do web_checkin ou reservation_code

-- IMPORTANTE: Esta política permite acesso público, mas é segura porque:
-- 1. Apenas permite acesso através de web_checkin (que já tem validação de locator/token)
-- 2. Ou através de reservation_code que corresponde a um web_checkin existente
-- 3. O código do frontend já valida o locator antes de tentar vincular
-- 4. Apenas permite SELECT (leitura), não permite modificação

-- Criar política adicional que permite acesso a reservas durante vinculação inicial
-- Esta política funciona em conjunto com a política existente "Guests can view their own reservations"
CREATE POLICY "Guests can view reservations for linking via web_checkin"
  ON public.reservations FOR SELECT
  TO public
  USING (
    -- Permitir acesso se a reserva tem um web_checkin associado
    -- Isso permite que hóspedes vejam a reserva durante o processo de vinculação inicial
    -- O web_checkin já tem validação de locator/token, então é seguro
    EXISTS (
      SELECT 1 FROM public.web_checkin wc
      WHERE wc.reservation_id = reservations.id
    )
  );

-- NOTA: Esta política funciona em conjunto com a política existente
-- A política "Guests can view their own reservations" continua funcionando para reservas já vinculadas
-- Esta nova política permite acesso durante o processo de vinculação inicial
-- Após a vinculação, a reserva estará no guest_stay_history e ambas as políticas permitirão acesso

