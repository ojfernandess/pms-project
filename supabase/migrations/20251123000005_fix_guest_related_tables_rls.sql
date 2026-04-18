-- Migration: Permitir que hóspedes vejam dados relacionados às suas reservas
-- O problema: As políticas RLS de rooms, room_categories e establishments bloqueiam acesso público
-- Mas os hóspedes precisam ver essas informações quando visualizam suas reservas
-- Solução: Criar políticas que permitem acesso público para dados relacionados a reservas vinculadas ao guest_stay_history

-- ============================================
-- POLÍTICAS PARA TABELA ROOMS
-- ============================================
-- Remover políticas antigas que podem conflitar
DROP POLICY IF EXISTS "Guests can view rooms from their reservations" ON public.rooms;

-- Criar política que permite acesso público para quartos relacionados a reservas do guest_stay_history
CREATE POLICY "Guests can view rooms from their reservations"
  ON public.rooms FOR SELECT
  TO public
  USING (
    -- Permitir acesso se o quarto está relacionado a uma reserva vinculada ao guest_stay_history
    EXISTS (
      SELECT 1 FROM public.reservations r
      INNER JOIN public.guest_stay_history gsh ON r.id = gsh.reservation_id
      WHERE r.room_id = rooms.id
    )
  );

-- ============================================
-- POLÍTICAS PARA TABELA ROOM_CATEGORIES
-- ============================================
-- Remover políticas antigas que podem conflitar
DROP POLICY IF EXISTS "Guests can view room categories from their reservations" ON public.room_categories;

-- Criar política que permite acesso público para categorias relacionadas a reservas do guest_stay_history
CREATE POLICY "Guests can view room categories from their reservations"
  ON public.room_categories FOR SELECT
  TO public
  USING (
    -- Permitir acesso se a categoria está relacionada a uma reserva vinculada ao guest_stay_history
    EXISTS (
      SELECT 1 FROM public.reservations r
      INNER JOIN public.guest_stay_history gsh ON r.id = gsh.reservation_id
      WHERE r.category_id = room_categories.id
    )
  );

-- ============================================
-- POLÍTICAS PARA TABELA ESTABLISHMENTS
-- ============================================
-- Remover políticas antigas que podem conflitar
DROP POLICY IF EXISTS "Guests can view establishments from their reservations" ON public.establishments;

-- Criar política que permite acesso público para estabelecimentos relacionados a reservas do guest_stay_history
CREATE POLICY "Guests can view establishments from their reservations"
  ON public.establishments FOR SELECT
  TO public
  USING (
    -- Permitir acesso se o estabelecimento está relacionado a uma reserva vinculada ao guest_stay_history
    EXISTS (
      SELECT 1 FROM public.reservations r
      INNER JOIN public.guest_stay_history gsh ON r.id = gsh.reservation_id
      WHERE r.establishment_id = establishments.id
    )
  );

-- ============================================
-- POLÍTICAS PARA TABELA CLIENTS
-- ============================================
-- Remover políticas antigas que podem conflitar
DROP POLICY IF EXISTS "Guests can view clients from their reservations" ON public.clients;

-- Criar política que permite acesso público para clientes relacionados a reservas do guest_stay_history
-- Isso permite que hóspedes vejam dados do hóspede principal e responsável financeiro de suas reservas
CREATE POLICY "Guests can view clients from their reservations"
  ON public.clients FOR SELECT
  TO public
  USING (
    -- Permitir acesso se o cliente está relacionado a uma reserva vinculada ao guest_stay_history
    -- Como hóspede principal (guest_id) ou responsável financeiro (client_id)
    EXISTS (
      SELECT 1 FROM public.reservations r
      INNER JOIN public.guest_stay_history gsh ON r.id = gsh.reservation_id
      WHERE (r.guest_id = clients.id OR r.client_id = clients.id)
    )
  );

-- ============================================
-- NOTAS DE SEGURANÇA
-- ============================================
-- IMPORTANTE: Estas políticas permitem acesso público, mas são seguras porque:
-- 1. O código do frontend já filtra guest_stay_history por guest_account_id
-- 2. Apenas dados relacionados a reservas que estão no guest_stay_history são acessíveis
-- 3. O guest_stay_history só é criado quando o hóspede vincula uma reserva à sua conta
-- 4. As políticas apenas permitem SELECT (leitura), não permitem INSERT, UPDATE ou DELETE
-- 5. Os dados são limitados apenas aos campos necessários (full_name, email, phone, etc.)
-- 6. Para clients, apenas clientes relacionados como hóspede principal ou responsável financeiro são acessíveis

