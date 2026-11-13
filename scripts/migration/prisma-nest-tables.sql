-- Tabelas do Nest (auth Redis + healthcheck). Correr uma vez no Supabase/Postgres existente
-- antes de subir a API com PRISMA_MIGRATE_ON_START=false.

CREATE TABLE IF NOT EXISTS public.backend_healthchecks (
    id UUID NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT backend_healthchecks_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS public.backend_refresh_tokens (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ(6) NOT NULL,
    revoked_at TIMESTAMPTZ(6),
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT backend_refresh_tokens_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS backend_refresh_tokens_token_hash_key
    ON public.backend_refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS backend_refresh_tokens_user_id_idx
    ON public.backend_refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS public.backend_password_resets (
    id UUID NOT NULL,
    user_id UUID NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ(6) NOT NULL,
    used_at TIMESTAMPTZ(6),
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT backend_password_resets_pkey PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS backend_password_resets_token_hash_key
    ON public.backend_password_resets (token_hash);
CREATE INDEX IF NOT EXISTS backend_password_resets_user_id_idx
    ON public.backend_password_resets (user_id);
