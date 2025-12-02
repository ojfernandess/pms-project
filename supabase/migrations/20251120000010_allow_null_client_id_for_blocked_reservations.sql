-- Permitir client_id NULL para reservas bloqueadas
-- Isso permite bloquear unidades sem criar um cliente temporário

-- Remover constraint NOT NULL do client_id
ALTER TABLE public.reservations
  ALTER COLUMN client_id DROP NOT NULL;

-- A foreign key já permite NULL por padrão, então não precisamos alterá-la
-- A constraint CHECK poderia garantir que apenas reservas bloqueadas têm client_id NULL,
-- mas isso pode ser muito restritivo. Vamos confiar na lógica da aplicação.

COMMENT ON COLUMN public.reservations.client_id IS 'ID do cliente responsável pela reserva. Pode ser NULL apenas para reservas bloqueadas (status = blocked).';

