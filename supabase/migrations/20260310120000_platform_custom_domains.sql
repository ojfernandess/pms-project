-- Domínios personalizados por serviço (Web Check-in, motores futuros, etc.)
CREATE TABLE IF NOT EXISTS public.platform_custom_domains (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hostname TEXT NOT NULL,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL DEFAULT 'web_checkin',
  status TEXT NOT NULL DEFAULT 'pending_dns',
  verification_token TEXT NOT NULL,
  ownership_verified_at TIMESTAMPTZ,
  dns_last_checked_at TIMESTAMPTZ,
  dns_status TEXT,
  ssl_status TEXT,
  ssl_expires_at TIMESTAMPTZ,
  last_error TEXT,
  infra_cname_target TEXT,
  infra_a_target TEXT,
  verification_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_custom_domains_hostname_unique UNIQUE (hostname),
  CONSTRAINT platform_custom_domains_service_type_chk CHECK (
    service_type IN ('web_checkin', 'booking_engine')
  ),
  CONSTRAINT platform_custom_domains_status_chk CHECK (
    status IN (
      'pending_dns',
      'pending_verification',
      'active',
      'suspended',
      'error'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_platform_custom_domains_hostname
  ON public.platform_custom_domains (LOWER(hostname));

CREATE INDEX IF NOT EXISTS idx_platform_custom_domains_service_status
  ON public.platform_custom_domains (service_type, status);

COMMENT ON TABLE public.platform_custom_domains IS
  'Domínios personalizados validados (TXT) vinculados a serviço e organização.';