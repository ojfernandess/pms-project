-- Período de manutenção por chamado (sem bloquear o quarto inteiro quando for chamado do hóspede)
ALTER TABLE public.maintenance_tickets
  ADD COLUMN IF NOT EXISTS maintenance_start_date date,
  ADD COLUMN IF NOT EXISTS maintenance_end_date date,
  ADD COLUMN IF NOT EXISTS blocks_entire_room boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lock_room_on_transfer boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.maintenance_tickets.blocks_entire_room IS
  'Quando true, o quarto recebe status maintenance (bloqueio integral). Chamados do hóspede usam false.';
COMMENT ON COLUMN public.maintenance_tickets.maintenance_start_date IS
  'Primeiro dia (inclusivo) em que o quarto permanece em tratativa de manutenção.';
COMMENT ON COLUMN public.maintenance_tickets.maintenance_end_date IS
  'Último dia (inclusivo) da tratativa até conclusão; editável enquanto o chamado estiver aberto.';
COMMENT ON COLUMN public.maintenance_tickets.lock_room_on_transfer IS
  'Mantém o vínculo do chamado ao quarto original após transferência da reserva.';

-- Chamados do hóspede: período pela estadia, sem bloqueio integral do quarto
UPDATE public.maintenance_tickets mt
SET
  maintenance_start_date = COALESCE(mt.maintenance_start_date, r.checkin_date, mt.opened_at::date),
  maintenance_end_date = COALESCE(
    mt.maintenance_end_date,
    r.checkout_date,
    (COALESCE(mt.opened_at::date, CURRENT_DATE) + 30)
  ),
  blocks_entire_room = false,
  lock_room_on_transfer = true
FROM public.reservations r
WHERE mt.reservation_id = r.id
  AND mt.guest_account_id IS NOT NULL;

UPDATE public.maintenance_tickets
SET
  maintenance_start_date = COALESCE(maintenance_start_date, opened_at::date),
  maintenance_end_date = COALESCE(
    maintenance_end_date,
  CASE
    WHEN completed_at IS NOT NULL THEN completed_at::date
    ELSE (opened_at::date + 90)
  END
  )
WHERE maintenance_start_date IS NULL;

-- Chamados internos abertos: mantêm bloqueio integral do quarto (comportamento legado)
UPDATE public.maintenance_tickets
SET blocks_entire_room = true
WHERE guest_account_id IS NULL
  AND status IN ('open', 'in_progress');