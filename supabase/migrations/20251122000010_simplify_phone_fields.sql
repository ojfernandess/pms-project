-- Migration: Simplificar campos de telefone e WhatsApp
-- Adiciona campos únicos 'phone' e 'whatsapp' mantendo compatibilidade com campos antigos

-- Adicionar novos campos se não existirem
ALTER TABLE public.hotel_settings 
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- Migrar dados existentes dos campos antigos para os novos campos
-- Se os novos campos estiverem vazios e os antigos tiverem dados, migrar
UPDATE public.hotel_settings
SET 
  phone = CASE 
    WHEN phone IS NULL OR phone = '' THEN
      CASE 
        WHEN phone_ddi IS NOT NULL AND phone_number IS NOT NULL THEN
          TRIM(phone_ddi || ' ' || phone_number)
        WHEN phone_number IS NOT NULL THEN phone_number
        ELSE NULL
      END
    ELSE phone
  END,
  whatsapp = CASE 
    WHEN whatsapp IS NULL OR whatsapp = '' THEN
      CASE 
        WHEN whatsapp_ddi IS NOT NULL AND whatsapp_number IS NOT NULL THEN
          TRIM(whatsapp_ddi || ' ' || whatsapp_number)
        WHEN whatsapp_number IS NOT NULL THEN whatsapp_number
        ELSE NULL
      END
    ELSE whatsapp
  END
WHERE (phone IS NULL OR phone = '') OR (whatsapp IS NULL OR whatsapp = '');

