# Inventário: Row Level Security (migrações)

Gerado por `scripts/migration_rls_inventory.py` a partir de `supabase/migrations/*.sql`.

## Resumo

- Ficheiros SQL: **327**
- `CREATE POLICY`: **306**
- `DROP POLICY`: **139**
- Políticas ativas estimadas (último `CREATE`/`DROP` por política, ordem dos ficheiros de migração): **237**
- `ALTER TABLE ... ENABLE/DISABLE ROW LEVEL SECURITY`: **117**

## Tabelas com RLS ativado (último `ALTER TABLE` por tabela nas migrações)

| Tabela | RLS | Última migração |
| --- | --- | --- |
| `public.accounts_payable` | **ativado** | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `public.accounts_receivable` | **ativado** | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `public.activity_logs` | **ativado** | `supabase/migrations/20251120000008_create_activity_logs.sql` |
| `public.admin_users` | **ativado** | `supabase/migrations/20251112000010_create_admin_users.sql` |
| `public.api_settings` | **ativado** | `supabase/migrations/20251112000006_create_hotel_settings.sql` |
| `public.bank_accounts` | **ativado** | `supabase/migrations/20250126000003_create_bank_accounts.sql` |
| `public.bank_reconciliation` | **ativado** | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `public.buildings` | **ativado** | `supabase/migrations/20251112000005_create_buildings.sql` |
| `public.bukly_sync_logs` | **ativado** | `supabase/migrations/20251120000025_add_bukly_integration.sql` |
| `public.bukly_webhooks` | **ativado** | `supabase/migrations/20251120000025_add_bukly_integration.sql` |
| `public.cancellation_logs` | **ativado** | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `public.cancellation_policies` | **ativado** | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `public.cancellation_policy_acceptances` | **ativado** | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `public.cash_flow_transactions` | **ativado** | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `public.channel_pricing` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.channex_ack_queue` | **ativado** | `supabase/migrations/20260407000700_channex_channel_manager_base.sql` |
| `public.channex_booking_revisions` | **ativado** | `supabase/migrations/20260407000700_channex_channel_manager_base.sql` |
| `public.channex_sync_logs` | **ativado** | `supabase/migrations/20260407000700_channex_channel_manager_base.sql` |
| `public.checkin_charge_config` | **ativado** | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `public.checkin_charge_logs` | **ativado** | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `public.checkin_charge_templates` | **ativado** | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `public.checkin_charges` | **ativado** | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `public.clients` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.companies` | **ativado** | `supabase/migrations/20251112000007_create_multi_tenant.sql` |
| `public.company_api_credentials` | **ativado** | `supabase/migrations/20260407000100_create_company_api_credentials_and_helpers.sql` |
| `public.company_api_request_logs` | **ativado** | `supabase/migrations/20260407000200_company_api_request_logs_and_toggle.sql` |
| `public.company_booking_engine_establishments` | **ativado** | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `public.company_public_reservation_establishments` | **ativado** | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `public.competitor_prices` | **ativado** | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |
| `public.daily_cash_flow` | **ativado** | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `public.discount_coupons` | **ativado** | `supabase/migrations/20251218000001_create_discount_coupons_table.sql` |
| `public.dynamic_pricing_queue` | **ativado** | `supabase/migrations/20250215000001_dynamic_pricing_persistence.sql` |
| `public.dynamic_pricing_results` | **ativado** | `supabase/migrations/20250215000001_dynamic_pricing_persistence.sql` |
| `public.dynamic_pricing_rules` | **ativado** | `supabase/migrations/20251120000019_create_new_rate_system.sql` |
| `public.email_logs` | **ativado** | `supabase/migrations/20251120000001_create_email_system.sql` |
| `public.email_queue` | **ativado** | `supabase/migrations/20251120000001_create_email_system.sql` |
| `public.email_settings` | **ativado** | `supabase/migrations/20251120000001_create_email_system.sql` |
| `public.email_templates` | **ativado** | `supabase/migrations/20251120000001_create_email_system.sql` |
| `public.employee_roles` | **ativado** | `supabase/migrations/20251112000018_create_employee_roles.sql` |
| `public.employees` | **ativado** | `supabase/migrations/20251112000018_create_employee_roles.sql` |
| `public.error_logs` | **ativado** | `supabase/migrations/20251205000001_create_error_logs_table.sql` |
| `public.establishment_email_templates` | **ativado** | `supabase/migrations/20260824140000_establishment_email_templates.sql` |
| `public.establishment_fnrh_secrets` | **ativado** | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |
| `public.establishment_fnrh_settings` | **ativado** | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |
| `public.establishment_review_settings` | **ativado** | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.establishment_services` | **ativado** | `supabase/migrations/20251120000011_create_establishment_services.sql` |
| `public.establishments` | **ativado** | `supabase/migrations/20251112000007_create_multi_tenant.sql` |
| `public.financial_audit_logs` | **ativado** | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `public.financial_daily_result_lines` | **ativado** | `supabase/migrations/20260824120000_financial_daily_result_lines.sql` |
| `public.financial_refunds` | **ativado** | `supabase/migrations/20250126000004_create_refunds_table.sql` |
| `public.fiscal_document_requests` | **ativado** | `supabase/migrations/20251124000004_create_fiscal_document_requests.sql` |
| `public.fnrh_domain_cache` | **ativado** | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |
| `public.fnrh_submission_log` | **ativado** | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |
| `public.guest_accounts` | **ativado** | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `public.guest_stay_history` | **ativado** | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `public.hotel_settings` | **ativado** | `supabase/migrations/20251112000006_create_hotel_settings.sql` |
| `public.invoices` | **ativado** | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `public.local_events` | **ativado** | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |
| `public.maintenance_ticket_attachments` | **ativado** | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `public.maintenance_ticket_comments` | **ativado** | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `public.maintenance_tickets` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.no_show_schedule_config` | **ativado** | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `public.notifications` | **ativado** | `supabase/migrations/20251120000030_create_notifications.sql` |
| `public.ota_channels` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.ota_reservations` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.payment_carriers` | **ativado** | `supabase/migrations/20251112000004_create_payment_carriers.sql` |
| `public.payment_types` | **ativado** | `supabase/migrations/20251112000004_create_payment_carriers.sql` |
| `public.payments` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.pricing_plan_categories` | **ativado** | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `public.pricing_plan_types` | **ativado** | `supabase/migrations/20251120000036_create_pricing_plan_types.sql` |
| `public.pricing_plans` | **ativado** | `supabase/migrations/20251112000003_create_pricing_plans.sql` |
| `public.pricing_rules` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.pricing_seasons` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.promotions` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.quotes` | **ativado** | `supabase/migrations/20251216000001_create_quotes_table.sql` |
| `public.rate_analytics` | **ativado** | `supabase/migrations/20251120000019_create_new_rate_system.sql` |
| `public.rate_calendar` | **ativado** | `supabase/migrations/20251120000019_create_new_rate_system.sql` |
| `public.rate_inventory` | **ativado** | `supabase/migrations/20250127000005_fix_rate_inventory_public_access.sql` |
| `public.rate_restrictions` | **ativado** | `supabase/migrations/20251120000019_create_new_rate_system.sql` |
| `public.rate_sales_status` | **ativado** | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |
| `public.reservation_extensions` | **ativado** | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `public.reservation_service_fees` | **ativado** | `supabase/migrations/20251115000009_create_reservation_service_fees.sql` |
| `public.reservations` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.room_categories` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.rooms` | **ativado** | `supabase/migrations/20251112000002_complete_schema.sql` |
| `public.service_fees` | **ativado** | `supabase/migrations/20251115000008_create_service_fees.sql` |
| `public.simplified_pricing` | **ativado** | `supabase/migrations/20251113000003_create_simplified_pricing_table.sql` |
| `public.site_settings` | **ativado** | `supabase/migrations/20251120000012_create_site_settings.sql` |
| `public.stay_reviews` | **ativado** | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.stripe_establishment_config` | **ativado** | `supabase/migrations/20251120000038_fix_stripe_rls_policies.sql` |
| `public.stripe_global_config` | **ativado** | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_payment_methods` | **ativado** | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_payments` | **ativado** | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_refunds` | **ativado** | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_webhooks` | **ativado** | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.user_companies` | **ativado** | `supabase/migrations/20251112000007_create_multi_tenant.sql` |
| `public.user_limits` | **ativado** | `supabase/migrations/20251112000020_create_user_limits.sql` |
| `public.users` | **ativado** | `supabase/migrations/20251112000012_create_users_table.sql` |
| `public.web_checkin` | **ativado** | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_documents` | **ativado** | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_guests` | **ativado** | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |

## Políticas ativas estimadas (por tabela)

_Simulação: percorre as migrações em ordem de nome de ficheiro; cada `DROP POLICY` remove a política; cada `CREATE POLICY` substitui/recria._

### `public.activity_logs`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow users to view activity logs` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251120000008_create_activity_logs.sql` |
| `Super admin can delete activity logs` | `DELETE` | `(default: all roles)` | `supabase/migrations/20251120000008_create_activity_logs.sql` |
| `System can insert activity logs` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251120000008_create_activity_logs.sql` |

### `public.api_settings`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Users can delete api settings from their establishments` | `DELETE` | `(default: all roles)` | `supabase/migrations/20251205000003_fix_api_settings_constraints_and_rls.sql` |
| `Users can insert api settings for their establishments` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251205000003_fix_api_settings_constraints_and_rls.sql` |
| `Users can update api settings from their establishments` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251205000003_fix_api_settings_constraints_and_rls.sql` |
| `Users can view api settings from their establishments` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251205000003_fix_api_settings_constraints_and_rls.sql` |

### `public.bukly_sync_logs`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to insert bukly sync logs` | `INSERT` | `authenticated` | `supabase/migrations/20251120000025_add_bukly_integration.sql` |
| `Allow authenticated users to read bukly sync logs` | `SELECT` | `authenticated` | `supabase/migrations/20251120000025_add_bukly_integration.sql` |

### `public.bukly_webhooks`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to insert bukly webhooks` | `INSERT` | `authenticated` | `supabase/migrations/20251120000025_add_bukly_integration.sql` |
| `Allow authenticated users to read bukly webhooks` | `SELECT` | `authenticated` | `supabase/migrations/20251120000025_add_bukly_integration.sql` |
| `Allow authenticated users to update bukly webhooks` | `UPDATE` | `authenticated` | `supabase/migrations/20251120000025_add_bukly_integration.sql` |

### `public.cancellation_logs`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `authenticated_delete_cancellation_logs` | `DELETE` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_insert_cancellation_logs` | `INSERT` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_select_cancellation_logs` | `SELECT` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_update_cancellation_logs` | `UPDATE` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |

### `public.cancellation_policies`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `anon_authenticated_read_cancellation_policies` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_delete_cancellation_policies` | `DELETE` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_insert_cancellation_policies` | `INSERT` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_update_cancellation_policies` | `UPDATE` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |

### `public.cancellation_policy_acceptances`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `anon_policy_acceptances_insert` | `INSERT` | `anon` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `anon_policy_acceptances_select` | `SELECT` | `anon` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_policy_acceptances_delete` | `DELETE` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_policy_acceptances_insert` | `INSERT` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_policy_acceptances_select` | `SELECT` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_policy_acceptances_update` | `UPDATE` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |

### `public.channel_pricing`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage channel pricing` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read channel pricing` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.checkin_charge_config`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `checkin_charge_config_all_service` | `ALL` | `service_role` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charge_config_insert` | `INSERT` | `authenticated` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charge_config_select` | `SELECT` | `authenticated` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charge_config_update` | `UPDATE` | `authenticated` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |

### `public.checkin_charge_logs`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `checkin_charge_logs_all_service` | `ALL` | `service_role` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charge_logs_insert` | `INSERT` | `authenticated`, `service_role` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charge_logs_select` | `SELECT` | `authenticated` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |

### `public.checkin_charge_templates`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `checkin_charge_templates_all_service` | `ALL` | `service_role` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charge_templates_delete` | `DELETE` | `authenticated` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charge_templates_insert` | `INSERT` | `authenticated` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charge_templates_select` | `SELECT` | `authenticated` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charge_templates_update` | `UPDATE` | `authenticated` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |

### `public.checkin_charges`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `checkin_charges_all_service` | `ALL` | `service_role` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charges_insert` | `INSERT` | `authenticated`, `service_role` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charges_select` | `SELECT` | `authenticated` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charges_update` | `UPDATE` | `authenticated`, `service_role` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |

### `public.clients`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage clients` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read clients` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Guests can view clients from their reservations` | `SELECT` | `public` | `supabase/migrations/20251123000005_fix_guest_related_tables_rls.sql` |
| `Public can create clients for reservations` | `INSERT` | `anon`, `authenticated` | `supabase/migrations/20251219000002_fix_clients_rls_for_public_reservations.sql` |
| `Public can read own clients` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20251219000002_fix_clients_rls_for_public_reservations.sql` |

### `public.company_booking_engine_establishments`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `anon_public_read_active_booking_engine_establishments` | `SELECT` | `anon` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_manage_booking_engine_establishments` | `ALL` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |

### `public.company_public_reservation_establishments`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `anon_public_read_active_public_reservation_establishments` | `SELECT` | `anon` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_manage_public_reservation_establishments` | `ALL` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |

### `public.competitor_prices`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage competitor prices` | `ALL` | `authenticated` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |
| `Allow authenticated users to read competitor prices` | `SELECT` | `authenticated` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |

### `public.discount_coupons`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Public can validate active coupons` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251218000001_create_discount_coupons_table.sql` |
| `Users can create coupons for their establishments` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251218000001_create_discount_coupons_table.sql` |
| `Users can delete coupons from their establishments` | `DELETE` | `(default: all roles)` | `supabase/migrations/20251218000001_create_discount_coupons_table.sql` |
| `Users can update coupons from their establishments` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251218000001_create_discount_coupons_table.sql` |
| `Users can view coupons from their establishments` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251218000001_create_discount_coupons_table.sql` |

### `public.dynamic_pricing_queue`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `dynamic_pricing_queue_insert` | `INSERT` | `(default: all roles)` | `supabase/migrations/20250215000001_dynamic_pricing_persistence.sql` |
| `dynamic_pricing_queue_select` | `SELECT` | `(default: all roles)` | `supabase/migrations/20250215000001_dynamic_pricing_persistence.sql` |
| `dynamic_pricing_queue_update` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20250215000001_dynamic_pricing_persistence.sql` |

### `public.dynamic_pricing_results`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `dynamic_pricing_results_delete` | `DELETE` | `(default: all roles)` | `supabase/migrations/20250215000001_dynamic_pricing_persistence.sql` |
| `dynamic_pricing_results_insert` | `INSERT` | `(default: all roles)` | `supabase/migrations/20250215000001_dynamic_pricing_persistence.sql` |
| `dynamic_pricing_results_select` | `SELECT` | `(default: all roles)` | `supabase/migrations/20250215000001_dynamic_pricing_persistence.sql` |
| `dynamic_pricing_results_update` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20250215000001_dynamic_pricing_persistence.sql` |

### `public.dynamic_pricing_rules`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage dynamic rules` | `ALL` | `authenticated` | `supabase/migrations/20251120000019_create_new_rate_system.sql` |
| `Allow authenticated users to read dynamic rules` | `SELECT` | `authenticated` | `supabase/migrations/20251120000019_create_new_rate_system.sql` |
| `Public can read dynamic pricing rules` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20251220000002_allow_public_access_to_pricing_data.sql` |

### `public.email_logs`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to insert email logs` | `INSERT` | `authenticated` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Allow service role to insert email logs` | `INSERT` | `service_role` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Guests can view email logs for their linked reservations` | `SELECT` | `public` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Super admin can view all email logs` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Users can view email logs for their reservations` | `SELECT` | `authenticated` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |

### `public.email_queue`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow anon to insert emails` | `INSERT` | `anon` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Allow authenticated to insert emails` | `INSERT` | `authenticated` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Allow authenticated users to update their emails` | `UPDATE` | `authenticated` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Allow public to insert emails` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Allow public to update emails` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Allow service role to update email queue` | `UPDATE` | `service_role` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Guests can view emails for their linked reservations` | `SELECT` | `public` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Super admin can view email queue` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Users can view emails for their reservations` | `SELECT` | `authenticated` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Users can view their own inserted emails` | `SELECT` | `public` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |

### `public.email_settings`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Public can view active email settings` | `SELECT` | `public` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Super admin can manage email settings` | `ALL` | `(default: all roles)` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |

### `public.email_templates`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Public can view active email templates` | `SELECT` | `public` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |
| `Super admin can manage email templates` | `ALL` | `(default: all roles)` | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` |

### `public.employees`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow users to read employees from their establishments` | `SELECT` | `authenticated` | `supabase/migrations/20251219000005_fix_employees_rls_recursion_final.sql` |
| `Employees can read their own records` | `SELECT` | `authenticated` | `supabase/migrations/20251219000005_fix_employees_rls_recursion_final.sql` |

### `public.error_logs`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Super admins can update error logs` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251205000001_create_error_logs_table.sql` |
| `Users can insert error logs for their establishments` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251205000001_create_error_logs_table.sql` |
| `Users can view error logs from their establishments` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251205000001_create_error_logs_table.sql` |

### `public.establishment_email_templates`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `establishment_email_templates_manage` | `ALL` | `authenticated` | `supabase/migrations/20260824140000_establishment_email_templates.sql` |
| `establishment_email_templates_select` | `SELECT` | `authenticated` | `supabase/migrations/20260824140000_establishment_email_templates.sql` |

### `public.establishment_fnrh_settings`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `establishment_fnrh_settings_delete` | `DELETE` | `authenticated` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |
| `establishment_fnrh_settings_insert` | `INSERT` | `authenticated` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |
| `establishment_fnrh_settings_select` | `SELECT` | `authenticated` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |
| `establishment_fnrh_settings_update` | `UPDATE` | `authenticated` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |

### `public.establishment_review_settings`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Authenticated users can view review settings` | `SELECT` | `authenticated` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `Managers can update review settings` | `UPDATE` | `authenticated` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `Super admins can manage all review settings` | `ALL` | `authenticated` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `Super admins can view all review settings` | `SELECT` | `authenticated` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |

### `public.establishment_services`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage establishment services` | `ALL` | `authenticated` | `supabase/migrations/20251120000029_add_building_services.sql` |
| `Allow authenticated users to read establishment services` | `SELECT` | `authenticated` | `supabase/migrations/20251120000029_add_building_services.sql` |

### `public.establishments`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Public can view establishments for reservations` | `SELECT` | `anon`, `authenticated`, `public` | `supabase/migrations/20251222000002_ensure_public_establishment_access.sql` |

### `public.financial_daily_result_lines`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `financial_daily_result_lines_select` | `SELECT` | `authenticated` | `supabase/migrations/20260824120000_financial_daily_result_lines.sql` |
| `financial_daily_result_lines_write` | `ALL` | `authenticated` | `supabase/migrations/20260824120000_financial_daily_result_lines.sql` |

### `public.fnrh_domain_cache`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `fnrh_domain_cache_all_establishment` | `ALL` | `authenticated` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |
| `fnrh_domain_cache_select_establishment` | `SELECT` | `authenticated` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |

### `public.fnrh_submission_log`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `fnrh_submission_log_select_establishment` | `SELECT` | `authenticated` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |

### `public.guest_accounts`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Guests can create their own account` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `Guests can update their own account` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `Guests can view their own account` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |

### `public.guest_stay_history`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Guests can view their own stay history` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `System can insert stay history` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |

### `public.hotel_settings`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Public can read hotel settings for pricing` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20251220000002_allow_public_access_to_pricing_data.sql` |
| `Public can view hotel settings for payments` | `SELECT` | `public` | `supabase/migrations/20251123000007_allow_public_payment_access.sql` |
| `Public can view hotel settings from quotes` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20251216000006_fix_quotes_rls_recursion.sql` |

### `public.local_events`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage local events` | `ALL` | `authenticated` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |
| `Allow authenticated users to read local events` | `SELECT` | `authenticated` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |

### `public.maintenance_ticket_attachments`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Guests can create ticket attachments` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `Guests can view ticket attachments` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |

### `public.maintenance_ticket_comments`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Authenticated users can create comments` | `INSERT` | `authenticated` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `Authenticated users can update own comments` | `UPDATE` | `authenticated` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `Authenticated users can view comments` | `SELECT` | `authenticated` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `Guests can create comments on their tickets` | `INSERT` | `public` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `Guests can update own comments` | `UPDATE` | `public` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `Guests can view comments of their tickets` | `SELECT` | `public` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |

### `public.maintenance_tickets`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage maintenance tickets` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read maintenance tickets` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.no_show_schedule_config`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `authenticated_delete_no_show_schedule_config` | `DELETE` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_insert_no_show_schedule_config` | `INSERT` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_select_no_show_schedule_config` | `SELECT` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_update_no_show_schedule_config` | `UPDATE` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |

### `public.notifications`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Service role can insert notifications` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251120000030_create_notifications.sql` |
| `Users can delete their own notifications` | `DELETE` | `(default: all roles)` | `supabase/migrations/20251120000030_create_notifications.sql` |
| `Users can update their own notifications` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251120000030_create_notifications.sql` |
| `Users can view their own notifications` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251120000030_create_notifications.sql` |

### `public.ota_channels`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage ota channels` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read ota channels` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.ota_reservations`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage ota reservations` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read ota reservations` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.payments`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage payments` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read payments` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.pricing_plan_categories`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `anon_authenticated_read_pricing_plan_categories` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_delete_pricing_plan_categories` | `DELETE` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_insert_pricing_plan_categories` | `INSERT` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `authenticated_update_pricing_plan_categories` | `UPDATE` | `authenticated` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |

### `public.pricing_plan_types`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage pricing plan types` | `ALL` | `authenticated` | `supabase/migrations/20251120000036_create_pricing_plan_types.sql` |
| `Allow authenticated users to read pricing plan types` | `SELECT` | `authenticated` | `supabase/migrations/20251120000036_create_pricing_plan_types.sql` |

### `public.pricing_plans`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage pricing plans` | `ALL` | `authenticated` | `supabase/migrations/20251112000003_create_pricing_plans.sql` |
| `Allow authenticated users to read pricing plans` | `SELECT` | `authenticated` | `supabase/migrations/20251112000003_create_pricing_plans.sql` |
| `Public can read pricing plans` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20251220000002_allow_public_access_to_pricing_data.sql` |

### `public.pricing_rules`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage pricing rules` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read pricing rules` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.pricing_seasons`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage pricing seasons` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read pricing seasons` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.promotions`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage promotions` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read promotions` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.quotes`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Public can create quotes for reservations` | `INSERT` | `anon`, `authenticated` | `supabase/migrations/20251219000002_fix_clients_rls_for_public_reservations.sql` |
| `Public can read own quotes` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20251219000002_fix_clients_rls_for_public_reservations.sql` |
| `Public can update own quotes` | `UPDATE` | `anon`, `authenticated` | `supabase/migrations/20251219000002_fix_clients_rls_for_public_reservations.sql` |
| `Users can create quotes for their establishments` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251216000001_create_quotes_table.sql` |
| `Users can delete quotes from their establishments` | `DELETE` | `(default: all roles)` | `supabase/migrations/20251216000001_create_quotes_table.sql` |
| `Users can update quotes from their establishments` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251216000001_create_quotes_table.sql` |
| `Users can view quotes from their establishments` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251216000001_create_quotes_table.sql` |

### `public.rate_analytics`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage rate analytics` | `ALL` | `authenticated` | `supabase/migrations/20251120000019_create_new_rate_system.sql` |
| `Allow authenticated users to read rate analytics` | `SELECT` | `authenticated` | `supabase/migrations/20251120000019_create_new_rate_system.sql` |

### `public.rate_calendar`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage rate calendar` | `ALL` | `authenticated` | `supabase/migrations/20251120000019_create_new_rate_system.sql` |
| `Allow authenticated users to read rate calendar` | `SELECT` | `authenticated` | `supabase/migrations/20251120000019_create_new_rate_system.sql` |
| `Public can read rate calendar` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20251220000002_allow_public_access_to_pricing_data.sql` |

### `public.rate_inventory`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage rate inventory` | `ALL` | `authenticated` | `supabase/migrations/20250127000005_fix_rate_inventory_public_access.sql` |
| `Allow authenticated users to read rate inventory` | `SELECT` | `authenticated` | `supabase/migrations/20250127000005_fix_rate_inventory_public_access.sql` |
| `Public can read rate inventory` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20250127000005_fix_rate_inventory_public_access.sql` |

### `public.rate_restrictions`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage rate restrictions` | `ALL` | `authenticated` | `supabase/migrations/20251120000019_create_new_rate_system.sql` |
| `Allow authenticated users to read rate restrictions` | `SELECT` | `authenticated` | `supabase/migrations/20251120000019_create_new_rate_system.sql` |
| `Public can read rate restrictions` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20251220000002_allow_public_access_to_pricing_data.sql` |

### `public.rate_sales_status`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage rate sales status` | `ALL` | `authenticated` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |
| `Allow authenticated users to read rate sales status` | `SELECT` | `authenticated` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |
| `Public can read rate sales status` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |

### `public.reservation_extensions`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Guests can create reservation extensions` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `Guests can update their own reservation extensions` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `Guests can view their own reservation extensions` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |

### `public.reservation_service_fees`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage reservation service fees` | `ALL` | `authenticated` | `supabase/migrations/20251115000009_create_reservation_service_fees.sql` |
| `Allow authenticated users to read reservation service fees` | `SELECT` | `authenticated` | `supabase/migrations/20251115000009_create_reservation_service_fees.sql` |

### `public.reservations`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage reservations` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read reservations` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Guests can update notes of their reservations` | `UPDATE` | `public` | `supabase/migrations/20251220000001_allow_guests_update_reservation_notes.sql` |
| `Guests can view reservations for linking via web_checkin` | `SELECT` | `public` | `supabase/migrations/20251123000006_fix_reservation_linking_rls.sql` |
| `Guests can view their own reservations` | `SELECT` | `public` | `supabase/migrations/20251123000004_fix_guest_reservations_rls.sql` |
| `Public can read reservations from their quotes` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20251219000004_fix_reservations_rls_for_public_quotes.sql` |

### `public.room_categories`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage room categories` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read room categories` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Guests can view room categories from their reservations` | `SELECT` | `public` | `supabase/migrations/20251123000005_fix_guest_related_tables_rls.sql` |
| `Public can view room categories from quotes` | `SELECT` | `anon`, `authenticated` | `supabase/migrations/20251216000006_fix_quotes_rls_recursion.sql` |

### `public.rooms`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage rooms` | `ALL` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Allow authenticated users to read rooms` | `SELECT` | `authenticated` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `Guests can view rooms from their reservations` | `SELECT` | `public` | `supabase/migrations/20251123000005_fix_guest_related_tables_rls.sql` |

### `public.service_fees`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage service fees` | `ALL` | `authenticated` | `supabase/migrations/20251115000008_create_service_fees.sql` |
| `Allow authenticated users to read service fees` | `SELECT` | `authenticated` | `supabase/migrations/20251115000008_create_service_fees.sql` |

### `public.simplified_pricing`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Allow authenticated users to manage simplified pricing` | `ALL` | `authenticated` | `supabase/migrations/20251113000003_create_simplified_pricing_table.sql` |
| `Allow authenticated users to read simplified pricing` | `SELECT` | `authenticated` | `supabase/migrations/20251113000003_create_simplified_pricing_table.sql` |

### `public.site_settings`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Site settings are publicly readable` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251120000012_create_site_settings.sql` |
| `Super admins can insert site settings` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251120000012_create_site_settings.sql` |
| `Super admins can update site settings` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251120000012_create_site_settings.sql` |

### `public.stay_reviews`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Authenticated users can update reviews` | `UPDATE` | `authenticated` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `Authenticated users can view reviews` | `SELECT` | `authenticated` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `Guests can insert their own reviews` | `INSERT` | `public` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `Guests can update their own reviews` | `UPDATE` | `public` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `Guests can view their own reviews` | `SELECT` | `public` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `Super admins can view all reviews` | `SELECT` | `authenticated` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |

### `public.stripe_establishment_config`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Public can view stripe config for payments` | `SELECT` | `public` | `supabase/migrations/20251123000007_allow_public_payment_access.sql` |
| `Users can manage their establishment stripe config` | `ALL` | `authenticated` | `supabase/migrations/20251120000038_fix_stripe_rls_policies.sql` |
| `Users can read their establishment stripe config` | `SELECT` | `authenticated` | `supabase/migrations/20251120000038_fix_stripe_rls_policies.sql` |

### `public.stripe_global_config`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Authenticated users can read stripe global config` | `SELECT` | `authenticated` | `supabase/migrations/20251123000003_fix_stripe_global_config_rls_406.sql` |
| `Only super admin can manage stripe global config` | `ALL` | `authenticated` | `supabase/migrations/20251123000003_fix_stripe_global_config_rls_406.sql` |
| `Public can read stripe enabled status` | `SELECT` | `public` | `supabase/migrations/20251123000003_fix_stripe_global_config_rls_406.sql` |

### `public.stripe_payment_methods`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Users can manage payment methods` | `ALL` | `authenticated` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `Users can read payment methods` | `SELECT` | `authenticated` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |

### `public.stripe_payments`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Public can view payments by payment intent id` | `SELECT` | `public` | `supabase/migrations/20251123000007_allow_public_payment_access.sql` |
| `Users can manage payments` | `ALL` | `authenticated` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `Users can read payments` | `SELECT` | `authenticated` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |

### `public.stripe_refunds`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Users can manage refunds` | `ALL` | `authenticated` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `Users can read refunds` | `SELECT` | `authenticated` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |

### `public.stripe_webhooks`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `Users can read webhooks` | `SELECT` | `authenticated` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |

### `public.web_checkin`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `web_checkin_insert` | `INSERT` | `anon`, `authenticated` | `supabase/migrations/20251219000006_fix_web_checkin_insert_rls.sql` |
| `web_checkin_select` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251115000011_fix_web_checkin_rls.sql` |
| `web_checkin_update` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251115000011_fix_web_checkin_rls.sql` |

### `public.web_checkin_documents`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `web_checkin_documents_insert` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251115000011_fix_web_checkin_rls.sql` |
| `web_checkin_documents_select` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251115000011_fix_web_checkin_rls.sql` |
| `web_checkin_documents_update` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251115000011_fix_web_checkin_rls.sql` |

### `public.web_checkin_guests`

| Nome da política | Comando | Roles | Migração |
| --- | --- | --- | --- |
| `web_checkin_guests_delete` | `DELETE` | `(default: all roles)` | `supabase/migrations/20251115000011_fix_web_checkin_rls.sql` |
| `web_checkin_guests_insert` | `INSERT` | `(default: all roles)` | `supabase/migrations/20251115000011_fix_web_checkin_rls.sql` |
| `web_checkin_guests_select` | `SELECT` | `(default: all roles)` | `supabase/migrations/20251115000011_fix_web_checkin_rls.sql` |
| `web_checkin_guests_update` | `UPDATE` | `(default: all roles)` | `supabase/migrations/20251115000011_fix_web_checkin_rls.sql` |

## `DROP POLICY` explícitos (referência)

| Tabela | Política | Migração |
| --- | --- | --- |
| `public.activity_logs` | `Managers can view their establishment activity logs` | `supabase/migrations/20251120000008_create_activity_logs.sql` |
| `public.activity_logs` | `Super admin can delete activity logs` | `supabase/migrations/20251120000008_create_activity_logs.sql` |
| `public.activity_logs` | `Super admin can view all activity logs` | `supabase/migrations/20251120000008_create_activity_logs.sql` |
| `public.activity_logs` | `System can insert activity logs` | `supabase/migrations/20251120000008_create_activity_logs.sql` |
| `public.activity_logs` | `Users can view their establishment activity logs` | `supabase/migrations/20251120000008_create_activity_logs.sql` |
| `public.admin_users` | `Allow authenticated users to read admin users` | `supabase/migrations/20251112000011_fix_admin_users_rls.sql` |
| `public.admin_users` | `Allow authenticated users to read admin users` | `supabase/migrations/20251112000014_fix_admin_users_rls_final.sql` |
| `public.admin_users` | `Allow super admins to manage admin users` | `supabase/migrations/20251112000011_fix_admin_users_rls.sql` |
| `public.admin_users` | `Allow super admins to manage admin users` | `supabase/migrations/20251112000014_fix_admin_users_rls_final.sql` |
| `public.admin_users` | `Allow super admins to read all admin users` | `supabase/migrations/20251112000014_fix_admin_users_rls_final.sql` |
| `public.admin_users` | `Allow users to read their own admin status` | `supabase/migrations/20251112000014_fix_admin_users_rls_final.sql` |
| `public.api_settings` | `Allow authenticated users to manage api settings` | `supabase/migrations/20251205000003_fix_api_settings_constraints_and_rls.sql` |
| `public.api_settings` | `Allow authenticated users to read api settings` | `supabase/migrations/20251205000003_fix_api_settings_constraints_and_rls.sql` |
| `public.clients` | `Guests can view clients from their reservations` | `supabase/migrations/20251123000005_fix_guest_related_tables_rls.sql` |
| `public.clients` | `Public can create clients for reservations` | `supabase/migrations/20251219000002_fix_clients_rls_for_public_reservations.sql` |
| `public.clients` | `Public can read own clients` | `supabase/migrations/20251219000002_fix_clients_rls_for_public_reservations.sql` |
| `public.company_booking_engine_establishments` | `Public can view company booking engine establishments` | `supabase/migrations/20260327000001_enable_rls_company_and_cancellation_tables.sql` |
| `public.competitor_prices` | `Allow authenticated users to manage competitor prices` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |
| `public.competitor_prices` | `Allow authenticated users to read competitor prices` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |
| `public.dynamic_pricing_rules` | `Public can read dynamic pricing rules` | `supabase/migrations/20251220000002_allow_public_access_to_pricing_data.sql` |
| `public.email_logs` | `Email logs are insertable by authenticated users` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.email_logs` | `Email logs are insertable by service role` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.email_logs` | `Email logs are viewable by authenticated users` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.email_logs` | `Super admin can view all email logs` | `supabase/migrations/20251120000001_create_email_system.sql` |
| `public.email_logs` | `Users can view email logs for their reservations` | `supabase/migrations/20251120000001_create_email_system.sql` |
| `public.email_queue` | `Authenticated users can insert into email queue` | `supabase/migrations/20251120000001_create_email_system.sql` |
| `public.email_queue` | `Authenticated users can insert into email queue` | `supabase/migrations/20251120000002_fix_email_queue_rls.sql` |
| `public.email_queue` | `Super admin can delete email queue` | `supabase/migrations/20251120000002_fix_email_queue_rls.sql` |
| `public.email_queue` | `Super admin can manage email queue` | `supabase/migrations/20251120000001_create_email_system.sql` |
| `public.email_queue` | `Super admin can manage email queue` | `supabase/migrations/20251120000002_fix_email_queue_rls.sql` |
| `public.email_queue` | `Super admin can update email queue` | `supabase/migrations/20251120000002_fix_email_queue_rls.sql` |
| `public.email_queue` | `Super admin can view and update email queue` | `supabase/migrations/20251120000002_fix_email_queue_rls.sql` |
| `public.email_settings` | `Authenticated users can view active email settings` | `supabase/migrations/20251120000004_fix_email_settings_rls.sql` |
| `public.email_settings` | `Super admin can manage email settings` | `supabase/migrations/20251120000001_create_email_system.sql` |
| `public.email_templates` | `Authenticated users can view active email templates` | `supabase/migrations/20251120000001_create_email_system.sql` |
| `public.email_templates` | `Super admin can manage email templates` | `supabase/migrations/20251120000001_create_email_system.sql` |
| `public.employees` | `Allow managers to manage employees` | `supabase/migrations/20251112000023_fix_employees_rls_recursion.sql` |
| `public.employees` | `Allow users to read employees from their establishments` | `supabase/migrations/20251219000005_fix_employees_rls_recursion_final.sql` |
| `public.employees` | `Employees can read their own records` | `supabase/migrations/20251219000005_fix_employees_rls_recursion_final.sql` |
| `public.establishment_email_templates` | `establishment_email_templates_manage` | `supabase/migrations/20260824140000_establishment_email_templates.sql` |
| `public.establishment_email_templates` | `establishment_email_templates_select` | `supabase/migrations/20260824140000_establishment_email_templates.sql` |
| `public.establishment_review_settings` | `Authenticated users can view review settings` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.establishment_review_settings` | `Managers can update review settings` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.establishment_review_settings` | `Super admins can manage all review settings` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.establishment_review_settings` | `Super admins can view all review settings` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.establishment_services` | `Allow authenticated users to manage establishment services` | `supabase/migrations/20251120000029_add_building_services.sql` |
| `public.establishment_services` | `Allow authenticated users to read establishment services` | `supabase/migrations/20251120000029_add_building_services.sql` |
| `public.establishments` | `Allow authenticated users to manage establishments` | `supabase/migrations/20251222000002_ensure_public_establishment_access.sql` |
| `public.establishments` | `Allow authenticated users to read establishments` | `supabase/migrations/20251222000002_ensure_public_establishment_access.sql` |
| `public.establishments` | `Guests can view establishments from their reservations` | `supabase/migrations/20251123000005_fix_guest_related_tables_rls.sql` |
| `public.establishments` | `Guests can view establishments from their reservations` | `supabase/migrations/20251222000002_ensure_public_establishment_access.sql` |
| `public.establishments` | `Public can view establishments for reservations` | `supabase/migrations/20251222000002_ensure_public_establishment_access.sql` |
| `public.establishments` | `Public can view establishments from quotes` | `supabase/migrations/20251216000006_fix_quotes_rls_recursion.sql` |
| `public.establishments` | `Public can view establishments from quotes` | `supabase/migrations/20251222000002_ensure_public_establishment_access.sql` |
| `public.financial_daily_result_lines` | `financial_daily_result_lines_select` | `supabase/migrations/20260824120000_financial_daily_result_lines.sql` |
| `public.financial_daily_result_lines` | `financial_daily_result_lines_write` | `supabase/migrations/20260824120000_financial_daily_result_lines.sql` |
| `public.hotel_settings` | `Public can read hotel settings for pricing` | `supabase/migrations/20251220000002_allow_public_access_to_pricing_data.sql` |
| `public.hotel_settings` | `Public can view hotel settings from quotes` | `supabase/migrations/20251216000006_fix_quotes_rls_recursion.sql` |
| `public.local_events` | `Allow authenticated users to manage local events` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |
| `public.local_events` | `Allow authenticated users to read local events` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |
| `public.maintenance_ticket_comments` | `Authenticated users can create comments` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `public.maintenance_ticket_comments` | `Authenticated users can update own comments` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `public.maintenance_ticket_comments` | `Authenticated users can view comments` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `public.maintenance_ticket_comments` | `Guests can create comments on their tickets` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `public.maintenance_ticket_comments` | `Guests can update own comments` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `public.maintenance_ticket_comments` | `Guests can view comments of their tickets` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |
| `public.maintenance_tickets` | `Guests can create maintenance tickets` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `public.maintenance_tickets` | `Guests can update their own maintenance tickets` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `public.maintenance_tickets` | `Guests can view their own maintenance tickets` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |
| `public.notifications` | `Service role can insert notifications` | `supabase/migrations/20251120000030_create_notifications.sql` |
| `public.notifications` | `Users can delete their own notifications` | `supabase/migrations/20251120000030_create_notifications.sql` |
| `public.notifications` | `Users can update their own notifications` | `supabase/migrations/20251120000030_create_notifications.sql` |
| `public.notifications` | `Users can view their own notifications` | `supabase/migrations/20251120000030_create_notifications.sql` |
| `public.pricing_plan_types` | `Allow authenticated users to manage pricing plan types` | `supabase/migrations/20251120000036_create_pricing_plan_types.sql` |
| `public.pricing_plan_types` | `Allow authenticated users to read pricing plan types` | `supabase/migrations/20251120000036_create_pricing_plan_types.sql` |
| `public.pricing_plans` | `Public can read pricing plans` | `supabase/migrations/20251220000002_allow_public_access_to_pricing_data.sql` |
| `public.quotes` | `Public can create quotes for reservations` | `supabase/migrations/20251219000002_fix_clients_rls_for_public_reservations.sql` |
| `public.quotes` | `Public can read own quotes` | `supabase/migrations/20251219000002_fix_clients_rls_for_public_reservations.sql` |
| `public.quotes` | `Public can update own quotes` | `supabase/migrations/20251219000002_fix_clients_rls_for_public_reservations.sql` |
| `public.rate_calendar` | `Public can read rate calendar` | `supabase/migrations/20251220000002_allow_public_access_to_pricing_data.sql` |
| `public.rate_inventory` | `Allow authenticated users to manage rate inventory` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |
| `public.rate_inventory` | `Allow authenticated users to manage rate inventory` | `supabase/migrations/20250127000005_fix_rate_inventory_public_access.sql` |
| `public.rate_inventory` | `Allow authenticated users to read rate inventory` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |
| `public.rate_inventory` | `Allow authenticated users to read rate inventory` | `supabase/migrations/20250127000005_fix_rate_inventory_public_access.sql` |
| `public.rate_inventory` | `Public can read rate inventory` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |
| `public.rate_inventory` | `Public can read rate inventory` | `supabase/migrations/20250127000005_fix_rate_inventory_public_access.sql` |
| `public.rate_restrictions` | `Public can read rate restrictions` | `supabase/migrations/20251220000002_allow_public_access_to_pricing_data.sql` |
| `public.rate_sales_status` | `Allow authenticated users to manage rate sales status` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |
| `public.rate_sales_status` | `Allow authenticated users to read rate sales status` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |
| `public.rate_sales_status` | `Public can read rate sales status` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |
| `public.reservations` | `Guests can update notes of their reservations` | `supabase/migrations/20251220000001_allow_guests_update_reservation_notes.sql` |
| `public.reservations` | `Guests can view their own reservations` | `supabase/migrations/20251123000004_fix_guest_reservations_rls.sql` |
| `public.reservations` | `Public can read reservations from their quotes` | `supabase/migrations/20251219000004_fix_reservations_rls_for_public_quotes.sql` |
| `public.room_categories` | `Guests can view room categories from their reservations` | `supabase/migrations/20251123000005_fix_guest_related_tables_rls.sql` |
| `public.room_categories` | `Public can view room categories from quotes` | `supabase/migrations/20251216000006_fix_quotes_rls_recursion.sql` |
| `public.rooms` | `Guests can view rooms from their reservations` | `supabase/migrations/20251123000005_fix_guest_related_tables_rls.sql` |
| `public.site_settings` | `Site settings are publicly readable` | `supabase/migrations/20251120000012_create_site_settings.sql` |
| `public.site_settings` | `Super admins can insert site settings` | `supabase/migrations/20251120000012_create_site_settings.sql` |
| `public.site_settings` | `Super admins can read site settings` | `supabase/migrations/20251120000012_create_site_settings.sql` |
| `public.site_settings` | `Super admins can update site settings` | `supabase/migrations/20251120000012_create_site_settings.sql` |
| `public.stay_reviews` | `Authenticated users can update reviews` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.stay_reviews` | `Authenticated users can view reviews` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.stay_reviews` | `Guests can insert their own reviews` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.stay_reviews` | `Guests can update their own reviews` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.stay_reviews` | `Guests can view their own reviews` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.stay_reviews` | `Super admins can view all reviews` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |
| `public.stripe_global_config` | `Authenticated users can read stripe global config` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_global_config` | `Authenticated users can read stripe global config` | `supabase/migrations/20251123000003_fix_stripe_global_config_rls_406.sql` |
| `public.stripe_global_config` | `Only super admin can manage stripe global config` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_global_config` | `Only super admin can manage stripe global config` | `supabase/migrations/20251123000003_fix_stripe_global_config_rls_406.sql` |
| `public.stripe_global_config` | `Public can read stripe enabled status` | `supabase/migrations/20251123000003_fix_stripe_global_config_rls_406.sql` |
| `public.stripe_payment_methods` | `Users can manage payment methods` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_payment_methods` | `Users can read payment methods` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_payments` | `Users can manage payments` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_payments` | `Users can read payments` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_refunds` | `Users can manage refunds` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_refunds` | `Users can read refunds` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.stripe_webhooks` | `Users can read webhooks` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `public.users` | `Allow super admins to manage users` | `supabase/migrations/20251112000013_fix_users_rls_recursion.sql` |
| `public.web_checkin` | `Web check-in is insertable by authenticated users` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin` | `Web check-in is insertable by authenticated users` | `supabase/migrations/20251219000006_fix_web_checkin_insert_rls.sql` |
| `public.web_checkin` | `Web check-in is insertable by service role` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin` | `Web check-in is updatable by anyone during process` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin` | `Web check-in is updatable by authenticated users` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin` | `Web check-in is updatable by service role` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin` | `Web check-in is viewable by anyone` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin` | `Web check-in is viewable by token or locator` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin` | `web_checkin_insert` | `supabase/migrations/20251219000006_fix_web_checkin_insert_rls.sql` |
| `public.web_checkin_documents` | `Web check-in documents are insertable by anyone` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_documents` | `Web check-in documents are insertable by service role` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_documents` | `Web check-in documents are updatable by authenticated users` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_documents` | `Web check-in documents are viewable by anyone` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_documents` | `Web check-in documents are viewable by web check-in` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_guests` | `Web check-in guests are deletable by authenticated users` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_guests` | `Web check-in guests are insertable by anyone` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_guests` | `Web check-in guests are insertable by service role` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_guests` | `Web check-in guests are updatable by authenticated users` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_guests` | `Web check-in guests are viewable by anyone` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |
| `public.web_checkin_guests` | `Web check-in guests are viewable by web check-in` | `supabase/migrations/20251115000010_create_web_checkin_tables.sql` |

## Limitações

- Políticas criadas ou alteradas **fora** destas migrações (SQL manual no dashboard) não aparecem.
- Blocos `DO $$ ... FOR r IN (SELECT policyname FROM pg_policies ...)` são **aproximados** como «remove todas as políticas desta tabela» antes dos `CREATE POLICY` seguintes **no mesmo ficheiro** (não expande nomes reais de `pg_policies` noutros ambientes).
- Ficheiros que também contêm padrões dinâmicos além do loop simples acima (rever manualmente):
  - `supabase/migrations/20251120000003_fix_email_queue_rls_final.sql`
  - `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql`
- Expressões `USING` / `WITH CHECK` não são extraídas; ver o ficheiro de migração citado.
