-- Novos canais Aiosell: por defeito aceitar webhook só com hotelCode (payload típico sem Basic Auth).
ALTER TABLE public.ota_channels
  ALTER COLUMN aiosell_webhook_trust_hotel_only SET DEFAULT true;
