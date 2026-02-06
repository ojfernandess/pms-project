-- ============================================
-- TABELA DE CUPONS DE DESCONTO
-- ============================================

-- Criar enum para tipo de desconto
CREATE TYPE discount_type AS ENUM ('fixed', 'percentage');

-- Criar enum para aplicar desconto em
CREATE TYPE discount_apply_to AS ENUM ('total', 'nights');

-- Criar enum para status do cupom
CREATE TYPE coupon_status AS ENUM ('active', 'inactive', 'expired');

-- Criar tabela de cupons de desconto
CREATE TABLE IF NOT EXISTS public.discount_coupons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT NOT NULL UNIQUE,
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  discount_type discount_type NOT NULL DEFAULT 'percentage',
  discount_value DECIMAL(10,2) NOT NULL,
  apply_to discount_apply_to NOT NULL DEFAULT 'total',
  max_uses INTEGER, -- NULL = ilimitado
  current_uses INTEGER NOT NULL DEFAULT 0,
  min_stay_nights INTEGER DEFAULT 1, -- Mínimo de noites para aplicar o cupom
  min_amount DECIMAL(10,2), -- Valor mínimo da reserva para aplicar o cupom
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  status coupon_status NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_discount_value CHECK (
    (discount_type = 'fixed' AND discount_value > 0) OR
    (discount_type = 'percentage' AND discount_value > 0 AND discount_value <= 100)
  ),
  CONSTRAINT valid_dates CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT valid_uses CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT valid_min_amount CHECK (min_amount IS NULL OR min_amount >= 0)
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_discount_coupons_establishment_id ON public.discount_coupons(establishment_id);
CREATE INDEX IF NOT EXISTS idx_discount_coupons_code ON public.discount_coupons(code);
CREATE INDEX IF NOT EXISTS idx_discount_coupons_status ON public.discount_coupons(status);
CREATE INDEX IF NOT EXISTS idx_discount_coupons_is_active ON public.discount_coupons(is_active);
CREATE INDEX IF NOT EXISTS idx_discount_coupons_valid_dates ON public.discount_coupons(valid_from, valid_until);

-- Trigger para atualizar updated_at
CREATE TRIGGER trigger_update_discount_coupons_updated_at
  BEFORE UPDATE ON public.discount_coupons
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.discount_coupons ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view coupons from their establishments"
  ON public.discount_coupons
  FOR SELECT
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can create coupons for their establishments"
  ON public.discount_coupons
  FOR INSERT
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can update coupons from their establishments"
  ON public.discount_coupons
  FOR UPDATE
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can delete coupons from their establishments"
  ON public.discount_coupons
  FOR DELETE
  USING (
    establishment_id IN (
      SELECT establishment_id FROM public.employees WHERE user_id = auth.uid()
    )
    OR public.is_super_admin(auth.uid())
  );

-- Política pública para validar cupons (apenas leitura)
CREATE POLICY "Public can validate active coupons"
  ON public.discount_coupons
  FOR SELECT
  USING (
    is_active = true
    AND status = 'active'
    AND (valid_until IS NULL OR valid_until > NOW())
    AND (max_uses IS NULL OR current_uses < max_uses)
  );

-- Função para validar e aplicar desconto
CREATE OR REPLACE FUNCTION public.validate_and_apply_discount(
  p_code TEXT,
  p_establishment_id UUID,
  p_total_amount DECIMAL,
  p_nights INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coupon public.discount_coupons%ROWTYPE;
  v_discount_amount DECIMAL(10,2) := 0;
  v_final_amount DECIMAL(10,2);
  v_applies_to DECIMAL(10,2);
BEGIN
  -- Buscar cupom
  SELECT * INTO v_coupon
  FROM public.discount_coupons
  WHERE code = UPPER(TRIM(p_code))
    AND establishment_id = p_establishment_id
    AND is_active = true
    AND status = 'active'
    AND (valid_until IS NULL OR valid_until > NOW())
    AND (max_uses IS NULL OR current_uses < max_uses);

  -- Se não encontrou cupom
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Cupom inválido ou expirado'
    );
  END IF;

  -- Validar mínimo de noites
  IF v_coupon.min_stay_nights > 0 AND p_nights < v_coupon.min_stay_nights THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', format('Este cupom requer no mínimo %s noite(s)', v_coupon.min_stay_nights)
    );
  END IF;

  -- Validar valor mínimo
  IF v_coupon.min_amount IS NOT NULL AND p_total_amount < v_coupon.min_amount THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', format('Este cupom requer valor mínimo de R$ %s', v_coupon.min_amount)
    );
  END IF;

  -- Calcular desconto
  IF v_coupon.apply_to = 'nights' THEN
    -- Aplicar desconto nas diárias
    v_applies_to := p_total_amount / NULLIF(p_nights, 0);
  ELSE
    -- Aplicar desconto no valor total
    v_applies_to := p_total_amount;
  END IF;

  IF v_coupon.discount_type = 'percentage' THEN
    v_discount_amount := (v_applies_to * v_coupon.discount_value) / 100;
  ELSE
    v_discount_amount := v_coupon.discount_value;
  END IF;

  -- Garantir que o desconto não seja maior que o valor aplicável
  IF v_discount_amount > v_applies_to THEN
    v_discount_amount := v_applies_to;
  END IF;

  -- Calcular valor final
  IF v_coupon.apply_to = 'nights' THEN
    v_final_amount := p_total_amount - v_discount_amount;
  ELSE
    v_final_amount := p_total_amount - v_discount_amount;
  END IF;

  -- Garantir que o valor final não seja negativo
  IF v_final_amount < 0 THEN
    v_final_amount := 0;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'coupon_id', v_coupon.id,
    'coupon_code', v_coupon.code,
    'coupon_name', v_coupon.name,
    'discount_type', v_coupon.discount_type,
    'discount_value', v_coupon.discount_value,
    'apply_to', v_coupon.apply_to,
    'discount_amount', v_discount_amount,
    'original_amount', p_total_amount,
    'final_amount', v_final_amount
  );
END;
$$;

-- Comentários para documentação
COMMENT ON TABLE public.discount_coupons IS 'Tabela de cupons de desconto para reservas';
COMMENT ON COLUMN public.discount_coupons.code IS 'Código único do cupom (ex: DESCONTO10)';
COMMENT ON COLUMN public.discount_coupons.discount_type IS 'Tipo de desconto: fixed (valor fixo) ou percentage (porcentagem)';
COMMENT ON COLUMN public.discount_coupons.discount_value IS 'Valor do desconto (em reais se fixed, ou porcentagem se percentage)';
COMMENT ON COLUMN public.discount_coupons.apply_to IS 'Onde aplicar o desconto: total (valor total) ou nights (diárias)';
COMMENT ON COLUMN public.discount_coupons.max_uses IS 'Número máximo de usos (NULL = ilimitado)';
COMMENT ON COLUMN public.discount_coupons.current_uses IS 'Número atual de usos do cupom';
COMMENT ON COLUMN public.discount_coupons.min_stay_nights IS 'Mínimo de noites necessárias para aplicar o cupom';
COMMENT ON COLUMN public.discount_coupons.min_amount IS 'Valor mínimo da reserva para aplicar o cupom';

