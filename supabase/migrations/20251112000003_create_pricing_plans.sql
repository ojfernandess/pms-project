    -- Tabela de Planos de Tarifa
    CREATE TABLE IF NOT EXISTS public.pricing_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Adicionar pricing_plan_id às tabelas existentes
    ALTER TABLE public.pricing_seasons 
    ADD COLUMN IF NOT EXISTS pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE CASCADE;

    ALTER TABLE public.pricing_rules 
    ADD COLUMN IF NOT EXISTS pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE CASCADE;

    ALTER TABLE public.promotions 
    ADD COLUMN IF NOT EXISTS pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE CASCADE;

    -- Adicionar pricing_plan_id ao channel_pricing (opcional, para associar planos a canais)
    ALTER TABLE public.channel_pricing 
    ADD COLUMN IF NOT EXISTS pricing_plan_id UUID REFERENCES public.pricing_plans(id) ON DELETE SET NULL;

    -- Enable Row Level Security
    ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

    -- RLS Policies
    CREATE POLICY "Allow authenticated users to read pricing plans"
    ON public.pricing_plans FOR SELECT
    TO authenticated
    USING (true);

    CREATE POLICY "Allow authenticated users to manage pricing plans"
    ON public.pricing_plans FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);

    -- Trigger para updated_at
    CREATE TRIGGER update_pricing_plans_updated_at
    BEFORE UPDATE ON public.pricing_plans
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

    -- Índices
    CREATE INDEX IF NOT EXISTS idx_pricing_seasons_plan_id ON public.pricing_seasons(pricing_plan_id);
    CREATE INDEX IF NOT EXISTS idx_pricing_rules_plan_id ON public.pricing_rules(pricing_plan_id);
    CREATE INDEX IF NOT EXISTS idx_promotions_plan_id ON public.promotions(pricing_plan_id);
    CREATE INDEX IF NOT EXISTS idx_channel_pricing_plan_id ON public.channel_pricing(pricing_plan_id);

