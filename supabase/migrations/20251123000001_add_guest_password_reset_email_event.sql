-- Migration: Adicionar evento de e-mail para reset de senha do hóspede
-- Este evento será disparado quando um hóspede solicitar recuperação de senha

-- Adicionar 'guest.password_reset' ao tipo email_event_type se não existir
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'guest.password_reset' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'email_event_type')
  ) THEN
    ALTER TYPE email_event_type ADD VALUE 'guest.password_reset';
  END IF;
END $$;

