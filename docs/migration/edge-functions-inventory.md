# Inventário: Edge Functions (Supabase)

Gerado por `scripts/migration_edge_inventory.py`. Tabelas e RPCs vêm de heurísticas estáticas (`.from(...)` e `.rpc(...)` no `index.ts`). Chamadas internas listam destinos `/functions/v1/...` no código.

## Resumo (`verify_jwt` em `supabase/config.toml`)

| Função | verify_jwt (config) |
| --- | --- |
| `aiosell-reservation-webhook` | `false` |
| `aiosell-reservations-sync` | `true` |
| `aiosell-sync` | `true` |
| `bukly-sync` | `true` |
| `call-company-webhook` | `true` |
| `channex-ack-worker` | `true` |
| `channex-booking-crs-update` | `true` |
| `channex-mapping-options` | `true` |
| `channex-reservation-webhook` | `false` |
| `channex-reservations-sync` | `true` |
| `channex-sync` | `true` |
| `company-public-api` | `false` |
| `create-employee-auth` | `true` |
| `employee-auth-admin` | `true` |
| `fnrh-lifecycle` | `false` |
| `fnrh-submit` | `false` |
| `get-reservation` | `true` |
| `get-site-settings` | `true` |
| `health-check` | `false` |
| `list-channel-templates` | `true` |
| `process-no-shows` | `false` |
| `rates-dashboard` | `true` |
| `rates-map` | `true` |
| `recalc-rates` | `true` |
| `render-html` | `true` |
| `robots` | `false` |
| `send-checkin-charge` | `false` |
| `send-checkin-charge-schedule` | `false` |
| `send-checkout-reminders` | `false` |
| `send-daily-digest` | `false` |
| `send-daily-digest-schedule` | `false` |
| `send-email-resend` | `true` |
| `send-email-sendgrid` | `true` |
| `send-email-smtp` | `true` |
| `sitemap` | `false` |
| `stripe-payment` | `false` |
| `stripe-payment-status` | `false` |
| `stripe-refund` | `true` |
| `stripe-webhook` | `false` |

## Detalhe por função

### `aiosell-reservation-webhook`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** sim
- **Variáveis de ambiente (`Deno.env.get`):** 14 — `AIOSELL_WEBHOOK_GATE_KEY`, `AIOSELL_WEBHOOK_TRUST_HOTEL_CODES`, `DENO_ENV`, `ENVIRONMENT`, `NODE_ENV`, `RAILWAY_PUBLIC_DOMAIN`, `RENDER_EXTERNAL_URL`, `SB_PUBLISHABLE_KEY`, `SITE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `URL`, `VERCEL_URL`
- **RPCs Supabase:** `create_notification_for_establishment`, `create_reservation_with_lock`, `insert_email_queue`, `ota_link_reservation_after_sync`, `user_can_access_establishment`
- **Tabelas `.from(...)`:** 15 
  - `channel_pricing`, `channex_booking_revisions`, `checkin_charge_config`, `email_queue`, `email_settings`, `email_templates`, `hotel_settings`, `ota_channels`, `ota_reservations`, `payments`, `reservations`, `room_categories`, `rooms`, `site_settings`, `web_checkin`
- **Chama outras Edge Functions:** `aiosell-sync`, `send-checkin-charge`, `send-email-resend`, `send-email-sendgrid`, `send-email-smtp`

### `aiosell-reservations-sync`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** sim
- **Variáveis de ambiente (`Deno.env.get`):** 11 — `DENO_ENV`, `ENVIRONMENT`, `NODE_ENV`, `RAILWAY_PUBLIC_DOMAIN`, `RENDER_EXTERNAL_URL`, `SITE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `URL`, `VERCEL_URL`
- **RPCs Supabase:** `create_notification_for_establishment`, `create_reservation_with_lock`, `insert_email_queue`, `ota_link_reservation_after_sync`, `user_can_access_establishment`
- **Tabelas `.from(...)`:** 15 
  - `channel_pricing`, `channex_booking_revisions`, `checkin_charge_config`, `email_queue`, `email_settings`, `email_templates`, `hotel_settings`, `ota_channels`, `ota_reservations`, `payments`, `reservations`, `room_categories`, `rooms`, `site_settings`, `web_checkin`
- **Chama outras Edge Functions:** `aiosell-sync`, `send-checkin-charge`, `send-email-resend`, `send-email-sendgrid`, `send-email-smtp`

### `aiosell-sync`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 7 — `AIOSELL_DYNAMIC_RPC_MAX_KEYS`, `AIOSELL_INVENTORY_AVAIL_CHUNK_SIZE`, `AIOSELL_RATES_UPDATE_CHUNK_SIZE`, `AIOSELL_RATE_OCCUPANCY_MODE`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** `calculate_rate_price`, `user_can_access_establishment`
- **Tabelas `.from(...)`:** 8 
  - `channel_pricing`, `dynamic_pricing_results`, `hotel_settings`, `ota_channels`, `rate_calendar`, `rate_sales_status`, `reservations`, `rooms`

### `bukly-sync`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 4 — `BUKLY_REQUESTOR_ID`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 6 
  - `bukly_sync_logs`, `channel_pricing`, `ota_channels`, `rate_calendar`, `reservations`, `rooms`

### `call-company-webhook`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 2 
  - `companies`, `establishments`

### `channex-ack-worker`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 3 
  - `channex_ack_queue`, `channex_booking_revisions`, `ota_channels`

### `channex-booking-crs-update`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 6 
  - `channel_pricing`, `channex_booking_revisions`, `channex_sync_logs`, `ota_channels`, `ota_reservations`, `reservations`

### `channex-mapping-options`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 3 — `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** `user_can_access_establishment`
- **Tabelas `.from(...)`:** 1 
  - `ota_channels`

### `channex-reservation-webhook`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 2 
  - `channex_sync_logs`, `ota_channels`
- **Chama outras Edge Functions:** `channex-reservations-sync`

### `channex-reservations-sync`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 3 — `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** `create_notification_for_establishment`, `create_reservation_with_lock`, `insert_email_queue`, `ota_link_reservation_after_sync`, `user_can_access_establishment`
- **Tabelas `.from(...)`:** 16 (ver lista abaixo)
  - `cancellation_policies`, `channel_pricing`, `channex_ack_queue`, `channex_booking_revisions`, `channex_sync_logs`, `checkin_charge_config`, `clients`, `email_templates`, `hotel_settings`, `ota_channels`, `ota_reservations`, `payments`, `pricing_plans`, `reservations`, `room_categories`, `web_checkin`
- **Chama outras Edge Functions:** `channex-ack-worker`, `send-checkin-charge`

### `channex-sync`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 4 — `CHANNEX_DYNAMIC_RPC_MAX_KEYS`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** `calculate_rate_price`, `user_can_access_establishment`
- **Tabelas `.from(...)`:** 9 
  - `channel_pricing`, `channex_sync_logs`, `dynamic_pricing_results`, `hotel_settings`, `ota_channels`, `rate_calendar`, `reservations`, `room_categories`, `rooms`

### `company-public-api`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `GET`, `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 5 — `PUBLIC_APP_URL`, `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `VITE_APP_URL`
- **RPCs Supabase:** `company_has_feature_access`, `generate_reservation_code`
- **Tabelas `.from(...)`:** 17 (ver lista abaixo)
  - `buildings`, `clients`, `companies`, `company_api_credentials`, `company_api_request_logs`, `discount_coupons`, `establishments`, `maintenance_tickets`, `ota_reservations`, `payments`, `pricing_plans`, `reservation_service_fees`, `reservations`, `room_categories`, `rooms`, `stay_reviews`, `web_checkin`

### `create-employee-auth`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 4 — `AUTH_REDIRECT_URL`, `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 2 
  - `employees`, `users`

### `employee-auth-admin`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 4 — `AUTH_REDIRECT_URL`, `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 2 
  - `employees`, `users`

### `fnrh-lifecycle`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 3 — `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 6 
  - `establishment_fnrh_secrets`, `establishment_fnrh_settings`, `fnrh_submission_log`, `reservations`, `web_checkin`, `web_checkin_guests`

### `fnrh-submit`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 3 — `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 6 
  - `establishment_fnrh_secrets`, `establishment_fnrh_settings`, `fnrh_submission_log`, `reservations`, `web_checkin`, `web_checkin_guests`

### `get-reservation`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `GET`, `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 8 
  - `clients`, `establishments`, `guest_stay_history`, `payments`, `reservations`, `room_categories`, `rooms`, `web_checkin`

### `get-site-settings`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 1 
  - `site_settings`

### `health-check`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 1 
  - `establishments`

### `list-channel-templates`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 2 
  - `checkin_charge_config`, `checkin_charge_templates`

### `process-no-shows`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** `process_no_shows`
- **Tabelas `.from(...)`:** 1 
  - `reservations`

### `rates-dashboard`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 4 
  - `hotel_settings`, `pricing_plan_types`, `pricing_plans`, `room_categories`

### `rates-map`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 4 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_REST_URL`
- **RPCs Supabase:** `calculate_rate_price`
- **Tabelas `.from(...)`:** 6 
  - `dynamic_pricing_results`, `hotel_settings`, `pricing_plan_categories`, `pricing_plans`, `rate_calendar`, `room_categories`

### `recalc-rates`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** `calculate_rate_price`
- **Tabelas `.from(...)`:** 6 
  - `dynamic_pricing_results`, `establishments`, `hotel_settings`, `pricing_plans`, `rate_calendar`, `room_categories`

### `render-html`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 3 
  - `companies`, `establishments`, `site_settings`

### `robots`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 2 
  - `companies`, `site_settings`

### `send-checkin-charge`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** sim
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 10 
  - `checkin_charge_config`, `checkin_charge_logs`, `checkin_charge_templates`, `checkin_charges`, `clients`, `establishments`, `hotel_settings`, `reservations`, `site_settings`, `web_checkin`
- **Chama outras Edge Functions:** `stripe-payment`

### `send-checkin-charge-schedule`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 3 
  - `checkin_charge_config`, `checkin_charges`, `reservations`
- **Chama outras Edge Functions:** `send-checkin-charge`

### `send-checkout-reminders`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `GET`, `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 6 — `RENDER_EXTERNAL_URL`, `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `VERCEL_URL`, `VITE_APP_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 6 
  - `email_queue`, `email_settings`, `email_templates`, `hotel_settings`, `reservations`, `site_settings`

### `send-daily-digest`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`, `POST`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 5 
  - `checkin_charge_config`, `establishments`, `maintenance_tickets`, `reservations`, `site_settings`

### `send-daily-digest-schedule`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 1 
  - `checkin_charge_config`
- **Chama outras Edge Functions:** `send-daily-digest`

### `send-email-resend`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 0 — _(nenhuma detetada)_
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 0 

### `send-email-sendgrid`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 0 — _(nenhuma detetada)_
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 0 

### `send-email-smtp`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 0 — _(nenhuma detetada)_
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 0 

### `sitemap`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** não
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 3 
  - `companies`, `establishments`, `site_settings`

### `stripe-payment`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** sim
- **Variáveis de ambiente (`Deno.env.get`):** 3 — `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 6 
  - `clients`, `quotes`, `stripe_establishment_config`, `stripe_global_config`, `stripe_payment_methods`, `stripe_payments`

### `stripe-payment-status`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** sim
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 4 
  - `reservations`, `stripe_establishment_config`, `stripe_global_config`, `stripe_payments`

### `stripe-refund`

- **verify_jwt (toml):** `true`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** sim
- **Variáveis de ambiente (`Deno.env.get`):** 2 — `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`
- **RPCs Supabase:** _(nenhum `.rpc()` no ficheiro)_
- **Tabelas `.from(...)`:** 4 
  - `stripe_establishment_config`, `stripe_global_config`, `stripe_payments`, `stripe_refunds`

### `stripe-webhook`

- **verify_jwt (toml):** `false`
- **Métodos HTTP referenciados no código:** `OPTIONS`
- **Stripe / pagamentos (heurística):** sim
- **Variáveis de ambiente (`Deno.env.get`):** 10 — `DENO_ENV`, `ENVIRONMENT`, `NODE_ENV`, `RAILWAY_PUBLIC_DOMAIN`, `RENDER_EXTERNAL_URL`, `SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `URL`, `VERCEL_URL`
- **RPCs Supabase:** `insert_activity_log`, `insert_email_queue`
- **Tabelas `.from(...)`:** 20 (ver lista abaixo)
  - `checkin_charge_config`, `clients`, `email_queue`, `email_settings`, `email_templates`, `establishments`, `hotel_settings`, `payment_carriers`, `payment_types`, `payments`, `quotes`, `reservations`, `site_settings`, `stripe_establishment_config`, `stripe_global_config`, `stripe_payment_methods`, `stripe_payments`, `stripe_refunds`, `stripe_webhooks`, `web_checkin`
- **Chama outras Edge Functions:** `send-checkin-charge`, `send-email-resend`, `send-email-sendgrid`, `send-email-smtp`
