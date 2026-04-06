-- Ocupação do tarifário ARI cujo preço é enviado ao CM Aiosell (rates[].rate), alinhado a ARIGrid (x1–x4).

ALTER TABLE public.ota_channels
  ADD COLUMN IF NOT EXISTS aiosell_list_rate_occupancy SMALLINT NOT NULL DEFAULT 2
  CHECK (aiosell_list_rate_occupancy >= 1 AND aiosell_list_rate_occupancy <= 4);

COMMENT ON COLUMN public.ota_channels.aiosell_list_rate_occupancy IS
  'Ocupação 1–4 (colunas x1–x4 do ARI): qual preço por noite do rate_calendar é enviado em rates[].rate à Aiosell. Padrão 2 (preço padrão / duplo).';
