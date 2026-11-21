-- Template de automação: pagamento confirmado (lead quitou a reserva)
INSERT INTO public.crm_automation_templates (template_key, name, description, trigger_type, conditions, actions)
VALUES
  (
    'note_on_booking_paid',
    'Nota após pagamento',
    'Quando booking.paid chega ao CRM (lead pagou a reserva), registra atividade',
    'booking.paid',
    '[]'::jsonb,
    '[{"type":"create_activity","activity_type":"system","subject":"Pagamento confirmado","body":"Lead quitou a reserva. Oportunidade pode ser marcada como ganha."}]'::jsonb
  )
ON CONFLICT (template_key) DO NOTHING;
