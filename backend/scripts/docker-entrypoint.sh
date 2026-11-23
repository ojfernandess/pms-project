#!/bin/sh
set -eu

# psql/pg_restore não aceitam ?connection_limit= nem valor colado como "DATABASE_URL=postgresql://..."
PSQL_DATABASE_URL="${DATABASE_URL:-}"
if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/print-database-url-libpq.mjs ]; then
  PSQL_DATABASE_URL="$(node ./scripts/print-database-url-libpq.mjs)"
fi

# Easypanel costuma manter o CMD da imagem; use PMS_RUN_MODE=worker no serviço worker.
if [ "${PMS_MIGRATION_COMPLETE:-false}" = "true" ]; then
  echo "PMS_MIGRATION_COMPLETE=true — imports Supabase/schema desativados neste arranque."
fi

if [ "${PMS_RUN_MODE:-api}" = "worker" ]; then
  echo "Starting PMS BullMQ worker (PMS_RUN_MODE=worker)..."
  exec node dist/worker.js
fi

# Diagnóstico storage (sem segredos) — se vazio, o compose não injetou o .env no backend
if [ -n "${STORAGE_PROVIDER:-}" ]; then
  echo "Storage env: STORAGE_PROVIDER=${STORAGE_PROVIDER} MINIO_ENDPOINT=${MINIO_ENDPOINT:-}(unset) MINIO_BUCKET=${MINIO_BUCKET:-}(unset)"
else
  echo "WARN: STORAGE_PROVIDER ausente no container — no Dokploy, defina vars no Environment do Compose PMS e use docker-compose.dokploy.yml com env_file/.env (ver deploy/dokploy/STORAGE-MINIO-ENV.md)"
fi

if [ "${PRISMA_MIGRATE_ON_START:-false}" = "true" ]; then
  echo "Running prisma migrate deploy..."
  npx prisma migrate deploy
else
  echo "Skipping prisma migrate deploy (set PRISMA_MIGRATE_ON_START=true for empty Postgres or after baseline)."
fi

if [ -f ./scripts/check-public-schema.mjs ]; then
  node ./scripts/check-public-schema.mjs || echo "WARN: check-public-schema falhou" >&2
fi

# auth.uid() / auth.role() para RLS e RPCs SECURITY DEFINER (Postgres sem stack Supabase)
if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/auth-compat.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=0 -f ./scripts/migration/auth-compat.sql >/dev/null 2>&1 \
    || echo "WARN: auth-compat.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/pgcrypto-bootstrap.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/pgcrypto-bootstrap.sql \
    || echo "WARN: pgcrypto-bootstrap.sql falhou (precisa superuser no Postgres para CREATE EXTENSION)" >&2
fi

# Funcao verify_guest_password legada (crypt sem schema extensions) → 42883 no login
if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/rpc/guest_verify_password_hotfix.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/rpc/guest_verify_password_hotfix.sql \
    || echo "WARN: guest_verify_password_hotfix.sql falhou" >&2
fi

if [ -f ./scripts/ensure-storage-buckets.mjs ]; then
  node ./scripts/ensure-storage-buckets.mjs || echo "WARN: ensure-storage-buckets falhou" >&2
fi

# Web Check-in: anon precisa DML (42501 permission denied for table web_checkin_*)
if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/grant-web-checkin-anon.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/grant-web-checkin-anon.sql \
    || echo "WARN: grant-web-checkin-anon.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/grant_reservation_extensions.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/grant_reservation_extensions.sql \
    || echo "WARN: grant_reservation_extensions.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/public_reservation_anon.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/public_reservation_anon.sql \
    || echo "WARN: public_reservation_anon.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/ensure_quote_code_trigger.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/ensure_quote_code_trigger.sql \
    || echo "WARN: ensure_quote_code_trigger.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/fix_reservation_overlap_same_client.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/fix_reservation_overlap_same_client.sql \
    || echo "WARN: fix_reservation_overlap_same_client.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/web-checkin-anon-rls.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=0 -f ./scripts/migration/web-checkin-anon-rls.sql \
    || echo "WARN: web-checkin-anon-rls.sql falhou" >&2
fi

# DDL incremental (colunas usadas pelo frontend / DataService)
if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/cleaning_fee_configuration.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/cleaning_fee_configuration.sql \
    || echo "WARN: cleaning_fee_configuration.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/checkin_guest_info_services.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/checkin_guest_info_services.sql \
    >/dev/null 2>&1 || echo "WARN: checkin_guest_info_services.sql"
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/parking_service.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/parking_service.sql \
    || echo "WARN: parking_service.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/public_reservation_service_fee_toggles.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/public_reservation_service_fee_toggles.sql \
    || echo "WARN: public_reservation_service_fee_toggles.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/maintenance_ticket_period.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/maintenance_ticket_period.sql \
    || echo "WARN: maintenance_ticket_period.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/ari_maintenance_period_inventory.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/ari_maintenance_period_inventory.sql \
    || echo "WARN: ari_maintenance_period_inventory.sql falhou" >&2
fi

# AR/AP reestruturado (fases 1–6): Postgres no deploy — não supabase db push
if [ "${FINANCIAL_AR_AP_MIGRATION_ON_START:-true}" = "true" ] \
  && [ -n "$PSQL_DATABASE_URL" ] \
  && [ -f ./scripts/migration/apply-financial-ar-ap.sh ]; then
  chmod +x ./scripts/migration/apply-financial-ar-ap.sh 2>/dev/null || true
  ./scripts/migration/apply-financial-ar-ap.sh "$PSQL_DATABASE_URL" \
    || echo "WARN: apply-financial-ar-ap.sh falhou" >&2
fi

# StayOS CRM (etapas 1–6): Postgres no deploy — não supabase db push
if [ "${CRM_MIGRATION_ON_START:-true}" = "true" ] \
  && [ -n "$PSQL_DATABASE_URL" ] \
  && [ -f ./scripts/migration/apply-crm.sh ]; then
  chmod +x ./scripts/migration/apply-crm.sh 2>/dev/null || true
  ./scripts/migration/apply-crm.sh "$PSQL_DATABASE_URL" \
    || echo "WARN: apply-crm.sh falhou" >&2
fi

# Import/Export reservas: external_pms_code + jobs
if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/reservation_import_export.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/reservation_import_export.sql \
    || echo "WARN: reservation_import_export.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/user_establishment_preferences.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/user_establishment_preferences.sql \
    || echo "WARN: user_establishment_preferences.sql falhou" >&2
fi

# Channel Manager: multi-Bukly por prédio (HotelCode / Basic Auth)
if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/ota_channels_building_multi.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/ota_channels_building_multi.sql \
    || echo "WARN: ota_channels_building_multi.sql falhou" >&2
fi

# Limpa {{/if}} órfão em templates de e-mail (legado)
if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/email_templates_strip_orphan_endif.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/email_templates_strip_orphan_endif.sql \
    || echo "WARN: email_templates_strip_orphan_endif.sql falhou" >&2
fi

# Remove "\n" literal gravado no HTML dos templates (aparece no e-mail)
if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/email_templates_strip_literal_newlines.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/email_templates_strip_literal_newlines.sql \
    || echo "WARN: email_templates_strip_literal_newlines.sql falhou" >&2
fi

# Colapsa {{#if logo_url}} + {{#if hotel_logo}} sequenciais (logo duplicada)
if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/email_templates_dedupe_logo_if.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/email_templates_dedupe_logo_if.sql \
    || echo "WARN: email_templates_dedupe_logo_if.sql falhou" >&2
fi

# Garante RPC de resolve com suporte a is_active=false no estabelecimento (CREATE OR REPLACE)
if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/rpc/get_resolved_email_template.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/rpc/get_resolved_email_template.sql \
    || echo "WARN: get_resolved_email_template.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/site_settings_storage_config.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/site_settings_storage_config.sql \
    || echo "WARN: site_settings_storage_config.sql falhou" >&2
fi

if [ -n "$PSQL_DATABASE_URL" ] && [ -f ./scripts/migration/rpc/rate_calendar_unique_constraint.sql ]; then
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -f ./scripts/migration/rpc/rate_calendar_unique_constraint.sql \
    || echo "WARN: rate_calendar_unique_constraint.sql falhou" >&2
fi

# Com migração estável, force em todo restart sobrecarrega o Postgres e causa "Engine is not yet connected"
if [ "${PMS_MIGRATION_COMPLETE:-false}" = "true" ] && [ "${APP_APPLY_BUNDLED_RPCS:-auto}" = "force" ]; then
  if [ "${PMS_ALLOW_BUNDLED_RPCS_FORCE:-false}" != "true" ]; then
    echo "PMS_MIGRATION_COMPLETE — APP_APPLY_BUNDLED_RPCS=force ignorado (use auto ou PMS_ALLOW_BUNDLED_RPCS_FORCE=true)." >&2
    export APP_APPLY_BUNDLED_RPCS=auto
  fi
fi

# Antes do import longo: calculate_rate_price (evita 42883 se a API subir durante force import)
if [ -f ./scripts/ensure-bundled-rpcs.mjs ]; then
  node ./scripts/ensure-bundled-rpcs.mjs || echo "WARN: ensure-bundled-rpcs falhou" >&2
else
  echo "WARN: ensure-bundled-rpcs.mjs ausente — faça rebuild da imagem (branch PMS-Backend >= 96ad39a)." >&2
fi

# DDL completo (tabelas + RPCs): APP_IMPORT_SUPABASE_SCHEMA=once|force (antes dos dados)
if [ -f ./scripts/import-supabase-schema.sh ]; then
  ./scripts/import-supabase-schema.sh
fi

# Dados: APP_IMPORT_SUPABASE_DATA=once|force (+ APP_IMPORT_DISCOVER_TABLES=public,auth após schema)
if [ -f ./scripts/import-supabase-data.sh ]; then
  if [ "${PMS_IMPORT_IN_BACKGROUND:-false}" = "true" ]; then
    echo "Import de dados em background (PMS_IMPORT_IN_BACKGROUND=true); API sobe em seguida."
    ./scripts/import-supabase-data.sh &
  else
    ./scripts/import-supabase-data.sh
  fi
fi

# Postgres próprio: GRANTs para roles authenticated/anon (correge 42501 permission denied)
if [ "${APP_RUN_DB_GRANTS:-false}" = "true" ] && [ -f ./scripts/apply-db-grants.mjs ]; then
  node ./scripts/apply-db-grants.mjs || echo "WARN: apply-db-grants falhou" >&2
fi

# FKs (embeds reservations->rooms): cópia a partir da origem se o schema veio sem constraints
if [ "${APP_IMPORT_SYNC_FKS:-false}" = "true" ] && [ -f ./scripts/sync-foreign-keys-from-supabase.mjs ]; then
  node ./scripts/sync-foreign-keys-from-supabase.mjs || echo "WARN: sync FKs falhou" >&2
fi

# Funções SQL/RPC (calculate_rate_price, cancel_expired_preregistrations, ...)
if [ "${APP_IMPORT_SYNC_FUNCTIONS:-false}" = "true" ] && [ -f ./scripts/sync-public-functions-from-supabase.mjs ]; then
  node ./scripts/sync-public-functions-from-supabase.mjs || echo "WARN: sync functions falhou" >&2
fi

# Reaplica RPC após import/TRUNCATE (import longo + réplicas Easypanel)
if [ -f ./scripts/ensure-bundled-rpcs.mjs ]; then
  bundled_mode="${APP_APPLY_BUNDLED_RPCS:-auto}"
  if [ "${PMS_MIGRATION_COMPLETE:-false}" = "true" ] && [ "$bundled_mode" = "force" ] \
    && [ "${PMS_ALLOW_BUNDLED_RPCS_FORCE:-false}" != "true" ]; then
    bundled_mode=auto
  fi
  APP_APPLY_BUNDLED_RPCS="$bundled_mode" node ./scripts/ensure-bundled-rpcs.mjs || echo "WARN: ensure-bundled-rpcs (pós-import) falhou" >&2
fi

exec node dist/main.js
