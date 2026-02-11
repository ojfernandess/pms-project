-- Adiciona subtítulo configurável para o cabeçalho do motor de reservas

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS booking_engine_subtitle TEXT;

COMMENT ON COLUMN public.companies.booking_engine_subtitle IS
  'Subtítulo exibido no header do motor de reservas, abaixo do título principal';


