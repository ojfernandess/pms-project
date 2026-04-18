-- ============================================
-- CORRIGIR POLÍTICAS RLS PARA RESERVATIONS (acesso público via quotes)
-- ============================================
-- Este migration permite que usuários anônimos leiam reservas que foram criadas
-- através de quotes que eles criaram na página pública de reservas

-- ============================================
-- POLÍTICAS PARA TABELA RESERVATIONS
-- ============================================

-- Remover política existente se houver
DROP POLICY IF EXISTS "Public can read reservations from their quotes" ON public.reservations;

-- Criar política que permite leitura pública de reservas vinculadas a quotes públicos
-- Uma reserva é considerada "pública" se:
-- 1. Está vinculada a um quote que tem payment_intent_id ou payment_link (indica que é público)
-- 2. OU foi criada recentemente (últimos 60 minutos) e está vinculada a um quote
-- 3. OU está listada no campo notes de um quote público (formato JSON com reservation_ids)
CREATE POLICY "Public can read reservations from their quotes"
  ON public.reservations FOR SELECT
  TO anon, authenticated
  USING (
    -- Permitir acesso se a reserva está vinculada a um quote público
    EXISTS (
      SELECT 1 FROM public.quotes q
      WHERE (
        -- Reserva está diretamente vinculada ao quote
        q.reservation_id = reservations.id
        -- OU reserva está listada no campo notes do quote (formato JSON)
        OR (
          q.notes IS NOT NULL
          AND (
            q.notes LIKE '%' || reservations.id::text || '%'
            OR q.notes LIKE '%<!--RESERVATION_IDS_START%'
          )
        )
      )
      AND (
        -- Quote tem payment_intent_id ou payment_link (indica que é público)
        q.payment_intent_id IS NOT NULL
        OR q.payment_link IS NOT NULL
        -- OU foi criado recentemente (últimos 60 minutos)
        OR q.created_at > NOW() - INTERVAL '60 minutes'
      )
    )
    -- OU se foi criada recentemente (últimos 60 minutos) e está vinculada a um quote
    OR (
      reservations.created_at > NOW() - INTERVAL '60 minutes'
      AND EXISTS (
        SELECT 1 FROM public.quotes q
        WHERE (
          q.reservation_id = reservations.id
          OR (
            q.notes IS NOT NULL
            AND q.notes LIKE '%' || reservations.id::text || '%'
          )
        )
      )
    )
  );

-- Comentários
COMMENT ON POLICY "Public can read reservations from their quotes" ON public.reservations IS 
'Permite leitura pública (anon) de reservas vinculadas a quotes públicos. Necessário para página pública de reservas onde hóspedes precisam visualizar suas reservas após criação e pagamento.';

