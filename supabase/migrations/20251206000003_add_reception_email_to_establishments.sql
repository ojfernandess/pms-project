-- Migration: Adicionar campo reception_email à tabela establishments
-- Este campo será usado para armazenar o email da portaria que receberá notificações de check-in

-- Verificar se a coluna já existe antes de adicionar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'establishments' 
    AND column_name = 'reception_email'
  ) THEN
    ALTER TABLE public.establishments
    ADD COLUMN reception_email TEXT;

    COMMENT ON COLUMN public.establishments.reception_email IS 'Email da portaria que receberá notificações de check-in confirmado com informações do hóspede, foto selfie e documentos';
  END IF;
END $$;

