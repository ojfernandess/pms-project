# Inventário: triggers (migrações)

Gerado por `scripts/migration_triggers_inventory.py` a partir de `supabase/migrations/*.sql`.

## Resumo

- Ficheiros SQL: **327**
- `CREATE TRIGGER`: **108**
- `DROP TRIGGER`: **68**
- Triggers ativos estimados (último `CREATE`/`DROP` por trigger, ordem dos ficheiros): **90**

## Triggers ativos estimados (por tabela)

_Simulação: percorrer migrações por nome de ficheiro; `DROP TRIGGER` remove; `CREATE TRIGGER` define._

### `auth.users`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `on_auth_user_created` | `AFTER` | `INSERT OR UPDATE` | `public.handle_new_user()` | `supabase/migrations/20251112000012_create_users_table.sql` |

### `public.accounts_payable`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_accounts_payable_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `update_payable_status_trigger` | `BEFORE` | `INSERT OR UPDATE` | `update_payable_status()` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |

### `public.accounts_receivable`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_accounts_receivable_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `update_receivable_status_trigger` | `BEFORE` | `INSERT OR UPDATE` | `update_receivable_status()` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |

### `public.admin_users`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_admin_users_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000010_create_admin_users.sql` |

### `public.api_settings`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_api_settings_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000006_create_hotel_settings.sql` |

### `public.bank_accounts`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_bank_accounts_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20250126000003_create_bank_accounts.sql` |

### `public.bank_reconciliation`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_bank_reconciliation_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |

### `public.buildings`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_buildings_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000005_create_buildings.sql` |

### `public.cancellation_policies`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_cancellation_policies_updated_at` | `BEFORE` | `UPDATE` | `update_cancellation_policies_updated_at()` | `supabase/migrations/20251225000012_add_cancellation_policies.sql` |

### `public.channel_pricing`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_channel_pricing_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.checkin_charge_config`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `checkin_charge_config_updated_at` | `BEFORE` | `UPDATE` | `update_checkin_charge_updated_at()` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |

### `public.checkin_charge_templates`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `checkin_charge_templates_updated_at` | `BEFORE` | `UPDATE` | `update_checkin_charge_updated_at()` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |

### `public.checkin_charges`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `checkin_charges_updated_at` | `BEFORE` | `UPDATE` | `update_checkin_charge_updated_at()` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |

### `public.clients`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_clients_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.companies`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_companies_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000007_create_multi_tenant.sql` |

### `public.company_api_credentials`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_company_api_credentials_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20260407000100_create_company_api_credentials_and_helpers.sql` |

### `public.competitor_prices`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_competitor_prices_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |

### `public.daily_cash_flow`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_daily_cash_flow_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |

### `public.discount_coupons`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `trigger_update_discount_coupons_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251218000001_create_discount_coupons_table.sql` |

### `public.dynamic_pricing_rules`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `trg_dynamic_rule_changed` | `AFTER` | `INSERT OR UPDATE OR DELETE` | `public.trg_dynamic_rule_changed()` | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` |
| `update_dynamic_rules_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000019_create_new_rate_system.sql` |

### `public.email_queue`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `email_queue_to_logs` | `AFTER` | `UPDATE` | `move_email_to_logs()` | `supabase/migrations/20251120000001_create_email_system.sql` |
| `update_email_queue_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20251120000001_create_email_system.sql` |

### `public.email_settings`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_email_settings_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20251120000001_create_email_system.sql` |

### `public.email_templates`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_email_templates_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20251120000001_create_email_system.sql` |

### `public.employee_roles`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_employee_roles_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000018_create_employee_roles.sql` |

### `public.employees`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_employees_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000018_create_employee_roles.sql` |

### `public.establishment_email_templates`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_establishment_email_templates_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20260824140000_establishment_email_templates.sql` |

### `public.establishment_fnrh_secrets`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_establishment_fnrh_secrets_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |

### `public.establishment_fnrh_settings`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_establishment_fnrh_settings_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |

### `public.establishment_review_settings`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_establishment_review_settings_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |

### `public.establishment_services`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_establishment_services_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000011_create_establishment_services.sql` |

### `public.establishments`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_establishments_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000007_create_multi_tenant.sql` |

### `public.financial_refunds`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_financial_refunds_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20250126000004_create_refunds_table.sql` |

### `public.fiscal_document_requests`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_fiscal_document_requests_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251124000004_create_fiscal_document_requests.sql` |

### `public.guest_accounts`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_guest_accounts_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |

### `public.guest_stay_history`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_guest_stay_history_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |

### `public.hotel_settings`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_hotel_settings_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000006_create_hotel_settings.sql` |

### `public.invoices`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_invoices_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |

### `public.local_events`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_local_events_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |

### `public.maintenance_ticket_comments`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_maintenance_ticket_comments_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20251208000005_create_maintenance_ticket_comments.sql` |

### `public.maintenance_tickets`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_maintenance_tickets_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.notifications`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_notifications_updated_at` | `BEFORE` | `UPDATE` | `public.update_notifications_updated_at()` | `supabase/migrations/20251120000030_create_notifications.sql` |

### `public.ota_channels`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_ota_channels_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.ota_reservations`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_ota_reservations_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.payment_carriers`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_payment_carriers_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000004_create_payment_carriers.sql` |

### `public.payment_types`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_payment_types_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000004_create_payment_carriers.sql` |

### `public.payments`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `trigger_mark_checkin_charge_paid` | `AFTER` | `INSERT OR UPDATE` | `public.mark_checkin_charge_paid_on_reservation_payment()` | `supabase/migrations/20250220000004_checkin_charge_on_payment_paid.sql` |
| `trigger_sync_receivable_on_payment` | `AFTER` | `INSERT OR UPDATE` | `sync_receivable_on_payment()` | `supabase/migrations/20250126000002_auto_create_receivables_from_reservations.sql` |

### `public.pricing_plan_types`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_pricing_plan_types_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000036_create_pricing_plan_types.sql` |

### `public.pricing_plans`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_pricing_plans_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000003_create_pricing_plans.sql` |

### `public.pricing_rules`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_pricing_rules_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.pricing_seasons`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_pricing_seasons_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.promotions`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_promotions_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.quotes`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `trigger_set_quote_code` | `BEFORE` | `INSERT` | `public.set_quote_code()` | `supabase/migrations/20251216000001_create_quotes_table.sql` |
| `trigger_update_quotes_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251216000001_create_quotes_table.sql` |

### `public.rate_calendar`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_rate_calendar_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000019_create_new_rate_system.sql` |

### `public.rate_inventory`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_rate_inventory_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |

### `public.rate_restrictions`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `rate_restrictions_sync_calendar_after` | `AFTER` | `INSERT OR UPDATE OR DELETE` | `public.trg_rate_restrictions_sync_calendar()` | `supabase/migrations/20260410150000_rate_restrictions_sync_calendar.sql` |
| `update_rate_restrictions_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000019_create_new_rate_system.sql` |

### `public.rate_sales_status`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_rate_sales_status_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |

### `public.reservation_extensions`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_reservation_extensions_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20251120000014_create_guest_stay_history.sql` |

### `public.reservation_service_fees`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_reservation_service_fees_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251115000009_create_reservation_service_fees.sql` |

### `public.reservations`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `set_reservation_code_trigger` | `BEFORE` | `INSERT` | `public.set_reservation_code()` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `trg_reservation_insert_dynamic_pricing` | `AFTER` | `INSERT` | `public.trg_reservation_insert_dynamic_pricing()` | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` |
| `trg_reservation_update_cancelled_dynamic_pricing` | `AFTER` | `UPDATE` | `public.trg_reservation_update_cancelled_dynamic_pricing()` | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` |
| `trigger_auto_create_receivable_on_reservation_insert` | `AFTER` | `INSERT` | `auto_create_receivable_from_reservation()` | `supabase/migrations/20250126000002_auto_create_receivables_from_reservations.sql` |
| `trigger_auto_create_receivable_on_reservation_update` | `AFTER` | `UPDATE` | `auto_create_receivable_from_reservation()` | `supabase/migrations/20250126000002_auto_create_receivables_from_reservations.sql` |
| `trigger_auto_sync_inventory_on_reservation` | `AFTER` | `INSERT OR UPDATE OR DELETE` | `public.auto_sync_inventory_on_reservation_change()` | `supabase/migrations/20250127000002_ari_auto_sync_inventory_triggers.sql` |
| `trigger_increment_coupon_uses` | `AFTER` | `INSERT` | `public.increment_coupon_uses()` | `supabase/migrations/20251219000001_increment_coupon_uses_on_reservation.sql` |
| `trigger_set_reservation_identification_number` | `BEFORE` | `INSERT` | `public.set_reservation_identification_number()` | `supabase/migrations/20251129000001_add_identification_number_to_reservations.sql` |
| `update_reservations_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.room_categories`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_room_categories_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.rooms`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `trigger_auto_sync_inventory_on_room` | `AFTER` | `INSERT OR UPDATE` | `public.auto_sync_inventory_on_room_change()` | `supabase/migrations/20250127000002_ari_auto_sync_inventory_triggers.sql` |
| `update_rooms_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000002_complete_schema.sql` |

### `public.service_fees`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_service_fees_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251115000008_create_service_fees.sql` |

### `public.simplified_pricing`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_simplified_pricing_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251113000003_create_simplified_pricing_table.sql` |

### `public.site_settings`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_site_settings_updated_at` | `BEFORE` | `UPDATE` | `update_site_settings_updated_at()` | `supabase/migrations/20251120000012_create_site_settings.sql` |

### `public.stay_reviews`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_stay_reviews_updated_at` | `BEFORE` | `UPDATE` | `update_updated_at_column()` | `supabase/migrations/20251209000001_create_stay_reviews_system.sql` |

### `public.stripe_establishment_config`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_stripe_establishment_config_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |

### `public.stripe_global_config`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_stripe_global_config_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |

### `public.stripe_payment_methods`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_stripe_payment_methods_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |

### `public.stripe_payments`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `trigger_mark_checkin_charge_paid_stripe` | `AFTER` | `INSERT OR UPDATE` | `public.mark_checkin_charge_paid_on_reservation_payment()` | `supabase/migrations/20250220000004_checkin_charge_on_payment_paid.sql` |
| `update_stripe_payments_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |

### `public.stripe_refunds`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_stripe_refunds_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |

### `public.user_companies`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_user_companies_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000007_create_multi_tenant.sql` |

### `public.user_limits`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_user_limits_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000020_create_user_limits.sql` |

### `public.users`

| Nome | Momento | Eventos | Função / procedimento | Migração |
| --- | --- | --- | --- | --- |
| `update_users_updated_at` | `BEFORE` | `UPDATE` | `public.update_updated_at_column()` | `supabase/migrations/20251112000012_create_users_table.sql` |

## `DROP TRIGGER` (referência)

| Trigger | Tabela | Migração |
| --- | --- | --- |
| `on_auth_user_created` | `auth.users` | `supabase/migrations/20251112000012_create_users_table.sql` |
| `update_accounts_payable_updated_at` | `public.accounts_payable` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `update_payable_status_trigger` | `public.accounts_payable` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `update_accounts_receivable_updated_at` | `public.accounts_receivable` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `update_receivable_status_trigger` | `public.accounts_receivable` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `update_admin_users_updated_at` | `public.admin_users` | `supabase/migrations/20251112000010_create_admin_users.sql` |
| `update_api_settings_updated_at` | `public.api_settings` | `supabase/migrations/20251112000006_create_hotel_settings.sql` |
| `update_bank_accounts_updated_at` | `public.bank_accounts` | `supabase/migrations/20250126000003_create_bank_accounts.sql` |
| `update_bank_reconciliation_updated_at` | `public.bank_reconciliation` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `update_buildings_updated_at` | `public.buildings` | `supabase/migrations/20251112000005_create_buildings.sql` |
| `update_channel_pricing_updated_at` | `public.channel_pricing` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `checkin_charge_config_updated_at` | `public.checkin_charge_config` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charge_templates_updated_at` | `public.checkin_charge_templates` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `checkin_charges_updated_at` | `public.checkin_charges` | `supabase/migrations/20250220000001_checkin_charge_system.sql` |
| `update_clients_updated_at` | `public.clients` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `update_companies_updated_at` | `public.companies` | `supabase/migrations/20251112000007_create_multi_tenant.sql` |
| `update_company_api_credentials_updated_at` | `public.company_api_credentials` | `supabase/migrations/20260407000100_create_company_api_credentials_and_helpers.sql` |
| `update_competitor_prices_updated_at` | `public.competitor_prices` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |
| `update_daily_cash_flow_updated_at` | `public.daily_cash_flow` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `trg_dynamic_rule_changed` | `public.dynamic_pricing_rules` | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` |
| `trg_dynamic_rule_insert_dynamic_pricing` | `public.dynamic_pricing_rules` | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` |
| `trg_dynamic_rule_update_dynamic_pricing` | `public.dynamic_pricing_rules` | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` |
| `update_employee_roles_updated_at` | `public.employee_roles` | `supabase/migrations/20251112000018_create_employee_roles.sql` |
| `update_employees_updated_at` | `public.employees` | `supabase/migrations/20251112000018_create_employee_roles.sql` |
| `update_establishment_fnrh_secrets_updated_at` | `public.establishment_fnrh_secrets` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |
| `update_establishment_fnrh_settings_updated_at` | `public.establishment_fnrh_settings` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |
| `update_establishments_updated_at` | `public.establishments` | `supabase/migrations/20251112000007_create_multi_tenant.sql` |
| `update_fiscal_document_requests_updated_at` | `public.fiscal_document_requests` | `supabase/migrations/20251124000004_create_fiscal_document_requests.sql` |
| `update_hotel_settings_updated_at` | `public.hotel_settings` | `supabase/migrations/20251112000006_create_hotel_settings.sql` |
| `update_invoices_updated_at` | `public.invoices` | `supabase/migrations/20250126000001_create_financial_module_base.sql` |
| `update_local_events_updated_at` | `public.local_events` | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` |
| `update_maintenance_tickets_updated_at` | `public.maintenance_tickets` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `update_notifications_updated_at` | `public.notifications` | `supabase/migrations/20251120000030_create_notifications.sql` |
| `update_ota_channels_updated_at` | `public.ota_channels` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `update_ota_reservations_updated_at` | `public.ota_reservations` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `update_payment_carriers_updated_at` | `public.payment_carriers` | `supabase/migrations/20251112000004_create_payment_carriers.sql` |
| `update_payment_types_updated_at` | `public.payment_types` | `supabase/migrations/20251112000004_create_payment_carriers.sql` |
| `trigger_mark_checkin_charge_paid` | `public.payments` | `supabase/migrations/20250220000004_checkin_charge_on_payment_paid.sql` |
| `trigger_sync_receivable_on_payment` | `public.payments` | `supabase/migrations/20250126000002_auto_create_receivables_from_reservations.sql` |
| `update_pricing_plan_types_updated_at` | `public.pricing_plan_types` | `supabase/migrations/20251120000036_create_pricing_plan_types.sql` |
| `update_pricing_rules_updated_at` | `public.pricing_rules` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `update_pricing_seasons_updated_at` | `public.pricing_seasons` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `update_promotions_updated_at` | `public.promotions` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `update_rate_inventory_updated_at` | `public.rate_inventory` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |
| `rate_restrictions_sync_calendar_after` | `public.rate_restrictions` | `supabase/migrations/20260410150000_rate_restrictions_sync_calendar.sql` |
| `update_rate_sales_status_updated_at` | `public.rate_sales_status` | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` |
| `set_reservation_code_trigger` | `public.reservations` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `trg_reservation_insert_dynamic_pricing` | `public.reservations` | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` |
| `trg_reservation_update_cancelled_dynamic_pricing` | `public.reservations` | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` |
| `trigger_auto_create_receivable_on_reservation_insert` | `public.reservations` | `supabase/migrations/20250126000002_auto_create_receivables_from_reservations.sql` |
| `trigger_auto_create_receivable_on_reservation_update` | `public.reservations` | `supabase/migrations/20250126000002_auto_create_receivables_from_reservations.sql` |
| `trigger_auto_sync_inventory_on_reservation` | `public.reservations` | `supabase/migrations/20250127000002_ari_auto_sync_inventory_triggers.sql` |
| `trigger_increment_coupon_uses` | `public.reservations` | `supabase/migrations/20251219000001_increment_coupon_uses_on_reservation.sql` |
| `trigger_set_reservation_identification_number` | `public.reservations` | `supabase/migrations/20251129000001_add_identification_number_to_reservations.sql` |
| `update_reservations_updated_at` | `public.reservations` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `update_room_categories_updated_at` | `public.room_categories` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `trigger_auto_sync_inventory_on_room` | `public.rooms` | `supabase/migrations/20250127000002_ari_auto_sync_inventory_triggers.sql` |
| `update_rooms_updated_at` | `public.rooms` | `supabase/migrations/20251112000002_complete_schema.sql` |
| `update_site_settings_updated_at` | `public.site_settings` | `supabase/migrations/20251120000012_create_site_settings.sql` |
| `update_stripe_establishment_config_updated_at` | `public.stripe_establishment_config` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `update_stripe_global_config_updated_at` | `public.stripe_global_config` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `update_stripe_payment_methods_updated_at` | `public.stripe_payment_methods` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `trigger_mark_checkin_charge_paid_stripe` | `public.stripe_payments` | `supabase/migrations/20250220000004_checkin_charge_on_payment_paid.sql` |
| `update_stripe_payments_updated_at` | `public.stripe_payments` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `update_stripe_refunds_updated_at` | `public.stripe_refunds` | `supabase/migrations/20251120000037_create_stripe_integration.sql` |
| `update_user_companies_updated_at` | `public.user_companies` | `supabase/migrations/20251112000007_create_multi_tenant.sql` |
| `update_user_limits_updated_at` | `public.user_limits` | `supabase/migrations/20251112000020_create_user_limits.sql` |
| `update_users_updated_at` | `public.users` | `supabase/migrations/20251112000012_create_users_table.sql` |

## Limitações

- Apenas `CREATE TRIGGER` / `DROP TRIGGER` estáticos; triggers criados só no dashboard não aparecem.
- A expressão `WHEN (...)` não é extraída; colunas `REFERENCING` / `CONSTRAINT TRIGGER` podem ser incompletas.
