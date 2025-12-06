-- Execute este script no Supabase Dashboard > SQL Editor
-- Adicionar campo custom_permissions na tabela employees

-- Verificar se a coluna já existe antes de adicionar
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'employees' 
    AND column_name = 'custom_permissions'
  ) THEN
    ALTER TABLE public.employees
    ADD COLUMN custom_permissions JSONB DEFAULT NULL;
    
    COMMENT ON COLUMN public.employees.custom_permissions IS 'Permissões customizadas para o funcionário. Se NULL, usa as permissões padrão do role. Formato: {"feature": {"read": true, "create": false, "update": false, "delete": false}} ou {"feature": true}';
    
    -- Índice para melhorar performance em consultas
    CREATE INDEX IF NOT EXISTS idx_employees_custom_permissions ON public.employees USING GIN (custom_permissions);
    
    RAISE NOTICE 'Coluna custom_permissions adicionada com sucesso!';
  ELSE
    RAISE NOTICE 'Coluna custom_permissions já existe.';
  END IF;
END $$;

