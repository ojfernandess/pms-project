# Inventário: funções PostgreSQL (migrações)

Gerado por `scripts/migration_sql_rpc_inventory.py`, que analisa `supabase/migrations/*.sql`: definições `CREATE [OR REPLACE] FUNCTION` e `GRANT EXECUTE ON FUNCTION`.

## Resumo

- Ficheiros de migração analisados: **327**
- Entradas `CREATE ... FUNCTION` encontradas: **153**
- Únicas por nome+argumentos (última migração vence): **104**
- Linhas `GRANT EXECUTE ON FUNCTION`: **27** (assinaturas distintas após merge: **21**)

## Funções (última definição por migração aplicada)

| Esquema.nome | Argumentos | RETURNS (início) | Última migração | Frontend `.rpc` |
| --- | --- | --- | --- | --- |
| `public.apply_dynamic_rules_batch` | `( p_establishment_id UUID, p_date_range DATERANGE, p_category_ids UUID[] DEFA...` | INTEGER | `supabase/migrations/20251120000023_create_rate_system_rpc_functions.sql` | — |
| `public.apply_recommendation_price` | `( p_establishment_id UUID, p_category_id UUID, p_pricing_plan_id UUID, p_date...` | JSONB | `supabase/migrations/20251212000001_improve_apply_recommendation_price_error_handling.sql` | sim |
| `public.auto_create_receivable_from_reservation` | `()` | TRIGGER | `supabase/migrations/20250126000002_auto_create_receivables_from_reservations.sql` | — |
| `public.bulk_update_rate_calendar` | `( p_establishment_id UUID, p_updates JSONB )` | INTEGER | `supabase/migrations/20251120000023_create_rate_system_rpc_functions.sql` | — |
| `public.calculate_rate_breakdown` | `( p_establishment_id UUID, p_category_id UUID, p_pricing_plan_id UUID, p_chec...` | TABLE | `supabase/migrations/20251120000023_create_rate_system_rpc_functions.sql` | — |
| `public.create_guest_account` | `( p_email TEXT, p_password TEXT, p_full_name TEXT, p_phone TEXT DEFAULT NULL,...` | TABLE | `supabase/migrations/20251120000015_create_guest_account_functions.sql` | sim |
| `public.deactivate_guest_account` | `( p_account_id UUID )` | BOOLEAN | `supabase/migrations/20251208000001_add_guest_account_deactivation.sql` | sim |
| `public.generate_invoice_number` | `( p_establishment_id UUID, p_series TEXT DEFAULT 'A' )` | TEXT | `supabase/migrations/20250126000001_create_financial_module_base.sql` | — |
| `public.generate_rate_recommendations` | `( p_establishment_id UUID, p_date DATE, p_category_id UUID DEFAULT NULL )` | TABLE | `supabase/migrations/20251120000023_create_rate_system_rpc_functions.sql` | sim |
| `public.generate_rate_recommendations` | `( p_establishment_id UUID, p_start_date DATE, p_end_date DATE, p_category_id ...` | TABLE | `supabase/migrations/20251212000003_generate_recommendations_for_all_plans.sql` | sim |
| `public.get_active_restrictions` | `( p_establishment_id UUID, p_start_date DATE, p_end_date DATE, p_category_id ...` | TABLE | `supabase/migrations/20251120000023_create_rate_system_rpc_functions.sql` | — |
| `public.move_email_to_logs` | `()` | TRIGGER | `supabase/migrations/20251120000001_create_email_system.sql` | — |
| `public.auto_sync_inventory_on_reservation_change` | `()` | TRIGGER | `supabase/migrations/20250127000002_ari_auto_sync_inventory_triggers.sql` | — |
| `public.auto_sync_inventory_on_room_change` | `()` | TRIGGER | `supabase/migrations/20250127000002_ari_auto_sync_inventory_triggers.sql` | — |
| `public.calculate_category_availability` | `( p_establishment_id UUID, p_category_id UUID, p_date DATE )` | JSONB | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` | sim |
| `public.calculate_demand_score` | `( p_establishment_id UUID, p_category_id UUID, p_date DATE )` | DECIMAL(5,2) | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` | — |
| `public.calculate_dynamic_price` | `( p_category_id UUID, p_checkin_date DATE, p_checkout_date DATE, p_promotion_...` | DECIMAL(10,2) | `supabase/migrations/20251112000002_complete_schema.sql` | — |
| `public.calculate_dynamic_price` | `( p_category_id UUID, p_checkin_date DATE, p_checkout_date DATE, p_promotion_...` | DECIMAL(10,2) | `supabase/migrations/20251113000002_fix_calculate_dynamic_price_with_pricing_plan.sql` | — |
| `public.calculate_dynamic_price` | `( p_category_id UUID, p_checkin_date DATE, p_checkout_date DATE, p_promotion_...` | DECIMAL(10,2) | `supabase/migrations/20251120000020_update_calculate_price_for_new_rate_system.sql` | — |
| `public.calculate_occupancy_metrics` | `( p_establishment_id UUID, p_category_id UUID, p_date DATE )` | TABLE | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` | — |
| `public.calculate_pickup_rate` | `( p_establishment_id UUID, p_category_id UUID, p_date DATE, p_days_back INTEG...` | DECIMAL(10,2) | `supabase/migrations/20251120000021_enhance_rate_system_with_metrics.sql` | — |
| `public.calculate_rate_price` | `( p_establishment_id UUID, p_category_id UUID, p_pricing_plan_id UUID, p_date...` | DECIMAL(10,2) | `supabase/migrations/20251212000005_add_establishment_occupancy_to_dynamic_rules.sql` | sim |
| `public.cancel_expired_preregistrations` | `()` | INTEGER | `supabase/migrations/20251210000013_fix_preregistration_cancellation_final.sql` | sim |
| `public.cancel_expired_quote` | `(p_quote_id UUID)` | JSONB | `supabase/migrations/20251221000002_create_cancel_expired_quote_function.sql` | sim |
| `public.company_has_feature_access` | `( p_feature_key TEXT, p_company_id UUID )` | BOOLEAN | `supabase/migrations/20260407000500_company_feature_access_support_establishment_ids.sql` | sim |
| `public.create_notification` | `( p_establishment_id UUID, p_user_id UUID, p_type notification_type, p_title ...` | UUID | `supabase/migrations/20251120000030_create_notifications.sql` | sim |
| `public.create_notification_for_establishment` | `( p_establishment_id UUID, p_type notification_type, p_title TEXT, p_message ...` | void | `supabase/migrations/20251120000030_create_notifications.sql` | sim |
| `public.create_reservation_with_lock` | `( p_reservation_data JSONB, p_checkin_date DATE, p_checkout_date DATE, p_esta...` | JSONB | `supabase/migrations/20251219000003_fix_reservation_conflict_check.sql` | sim |
| `public.debug_expired_preregistrations` | `()` | TABLE | `supabase/migrations/20251210000008_debug_expired_preregistrations.sql` | sim |
| `public.email_template_allows_establishment` | `( p_establishment_ids JSONB, p_establishment_id UUID )` | BOOLEAN | `supabase/migrations/20260824140000_establishment_email_templates.sql` | — |
| `public.enqueue_dynamic_pricing_recalc` | `( p_establishment_id UUID, p_trigger_type TEXT, p_metadata JSONB DEFAULT NULL...` | UUID | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` | — |
| `public.generate_identification_number` | `()` | BIGINT | `supabase/migrations/20251129000001_add_identification_number_to_reservations.sql` | — |
| `public.generate_quote_code` | `()` | TEXT | `supabase/migrations/20251216000001_create_quotes_table.sql` | — |
| `public.generate_reservation_code` | `()` | TEXT | `supabase/migrations/20251112000002_complete_schema.sql` | — |
| `public.get_checkin_charge_by_payment_token` | `(p_token TEXT)` | TABLE | `supabase/migrations/20250220000001_checkin_charge_system.sql` | sim |
| `public.get_company_api_credentials_status` | `( p_company_id UUID )` | TABLE | `supabase/migrations/20260407000100_create_company_api_credentials_and_helpers.sql` | sim |
| `public.get_company_api_request_logs` | `( p_company_id UUID, p_limit INTEGER DEFAULT 50 )` | TABLE | `supabase/migrations/20260407000200_company_api_request_logs_and_toggle.sql` | sim |
| `public.get_fnrh_guest_form_visibility` | `( p_establishment_id UUID, p_category_id UUID )` | BOOLEAN | `supabase/migrations/20260424120000_fnrh_guest_form_visibility_rpc.sql` | sim |
| `public.get_fnrh_settings_public` | `(p_establishment_id UUID)` | TABLE | `supabase/migrations/20260423100000_fnrh_category_scope.sql` | sim |
| `public.get_resolved_email_template` | `( p_event_type public.email_event_type, p_establishment_id UUID DEFAULT NULL )` | JSONB | `supabase/migrations/20260824140000_establishment_email_templates.sql` | sim |
| `public.handle_new_user` | `()` | TRIGGER | `supabase/migrations/20251112000012_create_users_table.sql` | — |
| `public.has_public_quote_for_category` | `(cat_id UUID)` | BOOLEAN | `supabase/migrations/20251216000006_fix_quotes_rls_recursion.sql` | — |
| `public.has_public_quote_for_category_payment` | `(cat_id UUID)` | BOOLEAN | `supabase/migrations/20251216000013_fix_quote_payment_establishment_access.sql` | — |
| `public.has_public_quote_for_establishment` | `(est_id UUID)` | BOOLEAN | `supabase/migrations/20251216000006_fix_quotes_rls_recursion.sql` | — |
| `public.has_public_quote_for_establishment_payment` | `(est_id UUID)` | BOOLEAN | `supabase/migrations/20251216000013_fix_quote_payment_establishment_access.sql` | — |
| `public.has_public_quote_for_stripe_config` | `(est_id UUID)` | BOOLEAN | `supabase/migrations/20251216000004_allow_public_stripe_config_for_quotes.sql` | — |
| `public.has_public_room_in_category` | `(cat_id UUID)` | BOOLEAN | `supabase/migrations/20251216000014_fix_public_rooms_category_access.sql` | — |
| `public.increment_coupon_uses` | `()` | TRIGGER | `supabase/migrations/20251219000001_increment_coupon_uses_on_reservation.sql` | — |
| `public.initialize_ari_for_establishment` | `( p_establishment_id UUID, p_days_ahead INTEGER DEFAULT 365 )` | JSONB | `supabase/migrations/20250127000004_ari_initialize_inventory_for_all_establishments.sql` | — |
| `public.initialize_ari_inventory` | `( p_establishment_id UUID, p_start_date DATE DEFAULT CURRENT_DATE, p_end_date...` | JSONB | `supabase/migrations/20250127000003_ari_migrate_existing_data.sql` | — |
| `public.insert_activity_log` | `( p_establishment_id UUID, p_action_type TEXT, p_entity_type TEXT, p_descript...` | UUID | `supabase/migrations/20251122000006_create_insert_activity_log_function.sql` | — |
| `public.insert_email_queue` | `( p_template_id UUID, p_event_type TEXT, p_recipient_email TEXT, p_recipient_...` | UUID | `supabase/migrations/20251122000001_create_insert_email_queue_function.sql` | sim |
| `public.insert_email_queue` | `( p_template_id UUID, p_event_type TEXT, p_recipient_email TEXT, p_recipient_...` | UUID | `supabase/migrations/20260418150000_overbooking_one_row_per_reservation_email_queue.sql` | sim |
| `public.is_date_available_for_sale` | `( p_establishment_id UUID, p_category_id UUID, p_date DATE, p_channel TEXT DE...` | BOOLEAN | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` | sim |
| `public.is_manager_of_establishment` | `( p_user_id UUID, p_establishment_id UUID )` | BOOLEAN | `supabase/migrations/20251112000023_fix_employees_rls_recursion.sql` | — |
| `public.is_reservation_linked_to_guest_account` | `( p_reservation_id UUID, p_guest_account_id UUID )` | BOOLEAN | `supabase/migrations/20251220000001_allow_guests_update_reservation_notes.sql` | — |
| `public.is_super_admin` | `(user_uuid UUID)` | BOOLEAN | `supabase/migrations/20251120000001_create_email_system.sql` | — |
| `public.log_activity` | `( p_establishment_id UUID, p_user_id UUID, p_action_type TEXT, p_entity_type ...` | UUID | `supabase/migrations/20251120000008_create_activity_logs.sql` | sim |
| `public.mark_checkin_charge_paid_on_reservation_payment` | `()` | TRIGGER | `supabase/migrations/20250220000004_checkin_charge_on_payment_paid.sql` | — |
| `public.merge_duplicate_clients_into_primary` | `( p_primary_id uuid, p_duplicate_ids uuid[] )` | jsonb | `supabase/migrations/20260425121000_fix_merge_duplicate_clients_rpc_email_logs.sql` | sim |
| `public.migrate_restrictions_to_sales_status` | `( p_establishment_id UUID )` | JSONB | `supabase/migrations/20250127000003_ari_migrate_existing_data.sql` | — |
| `public.migrate_stop_sell_to_sales_status` | `( p_establishment_id UUID )` | JSONB | `supabase/migrations/20250127000004_ari_initialize_inventory_for_all_establishments.sql` | — |
| `public.move_email_to_logs` | `()` | TRIGGER | `supabase/migrations/20251124000007_fix_email_queue_rls_for_guests.sql` | — |
| `public.ota_link_reservation_after_sync` | `( p_reservation_id uuid, p_ota_channel_id uuid, p_ota_reservation_code text, ...` | jsonb | `supabase/migrations/20260419100000_ota_link_reservation_after_sync.sql` | — |
| `public.process_no_shows` | `( p_establishment_id UUID DEFAULT NULL )` | INTEGER | `supabase/migrations/20251225000016_create_no_show_processor_function.sql` | sim |
| `public.reallocate_reservation` | `( p_reservation_id UUID, p_target_establishment_id UUID, p_target_room_id UUI...` | JSONB | `supabase/migrations/20260823194500_fix_reallocate_reservation_audit.sql` | sim |
| `public.recompute_rate_calendar_from_restrictions` | `( p_establishment_id uuid, p_from date, p_to date )` | integer | `supabase/migrations/20260410150000_rate_restrictions_sync_calendar.sql` | — |
| `public.recompute_rate_sales_status_from_restrictions` | `( p_establishment_id uuid, p_from date, p_to date )` | void | `supabase/migrations/20260410150000_rate_restrictions_sync_calendar.sql` | — |
| `public.refresh_rate_calendar_summary` | `()` | void | `supabase/migrations/20250217000003_refresh_rate_calendar_summary_rpc.sql` | — |
| `public.rotate_company_api_credentials` | `( p_company_id UUID )` | TABLE | `supabase/migrations/20260407000400_fix_rotate_company_api_credentials_ambiguous_company_id.sql` | sim |
| `public.rpc_recompute_denormalized_from_rate_restrictions` | `( p_establishment_id uuid, p_from date, p_to date )` | integer | `supabase/migrations/20260410161000_rpc_recompute_rate_restrictions_denormalized.sql` | — |
| `public.send_checkout_reminders` | `()` | jsonb | `supabase/migrations/20251204000004_schedule_checkout_reminders_cron.sql` | — |
| `public.set_company_api_credentials_active` | `( p_company_id UUID, p_is_active BOOLEAN )` | BOOLEAN | `supabase/migrations/20260407000200_company_api_request_logs_and_toggle.sql` | sim |
| `public.set_quote_code` | `()` | TRIGGER | `supabase/migrations/20251216000001_create_quotes_table.sql` | — |
| `public.set_reservation_code` | `()` | TRIGGER | `supabase/migrations/20251112000002_complete_schema.sql` | — |
| `public.set_reservation_identification_number` | `()` | TRIGGER | `supabase/migrations/20251129000001_add_identification_number_to_reservations.sql` | — |
| `public.sync_rate_inventory_from_reservations` | `( p_establishment_id UUID, p_category_id UUID, p_date DATE )` | JSONB | `supabase/migrations/20250127000001_create_ari_rate_availability_grid.sql` | sim |
| `public.test_expired_preregistrations` | `()` | TABLE | `supabase/migrations/20251210000007_test_expired_preregistrations.sql` | sim |
| `public.trg_dynamic_rule_changed` | `()` | TRIGGER | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` | — |
| `public.trg_rate_restrictions_sync_calendar` | `()` | trigger | `supabase/migrations/20260410150000_rate_restrictions_sync_calendar.sql` | — |
| `public.trg_reservation_insert_dynamic_pricing` | `()` | TRIGGER | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` | — |
| `public.trg_reservation_update_cancelled_dynamic_pricing` | `()` | TRIGGER | `supabase/migrations/20250215000002_dynamic_pricing_triggers.sql` | — |
| `public.update_notifications_updated_at` | `()` | TRIGGER | `supabase/migrations/20251120000030_create_notifications.sql` | — |
| `public.update_reservation_notes_for_guest` | `( p_reservation_id UUID, p_guest_account_id UUID, p_notes TEXT )` | JSONB | `supabase/migrations/20251220000001_allow_guests_update_reservation_notes.sql` | sim |
| `public.update_updated_at_column` | `()` | TRIGGER | `supabase/migrations/20251112000002_complete_schema.sql` | — |
| `public.update_user_password` | `( target_user_id UUID, new_password TEXT )` | BOOLEAN | `supabase/migrations/20251113000001_create_update_user_password_function.sql` | — |
| `public.upsert_fnrh_settings` | `( p_establishment_id UUID, p_enabled BOOLEAN, p_environment TEXT, p_base_url_...` | void | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` | sim |
| `public.upsert_fnrh_settings` | `( p_establishment_id UUID, p_enabled BOOLEAN, p_environment TEXT, p_base_url_...` | void | `supabase/migrations/20260423100000_fnrh_category_scope.sql` | sim |
| `public.user_can_access_establishment` | `( p_user_id UUID, p_establishment_id UUID )` | BOOLEAN | `supabase/migrations/20251219000005_fix_employees_rls_recursion_final.sql` | — |
| `public.validate_and_apply_discount` | `( p_code TEXT, p_establishment_id UUID, p_total_amount DECIMAL, p_nights INTE...` | JSONB | `supabase/migrations/20251218000001_create_discount_coupons_table.sql` | sim |
| `public.validate_reservation_exists` | `( p_reservation_id UUID )` | BOOLEAN | `supabase/migrations/20251219000006_fix_web_checkin_insert_rls.sql` | — |
| `public.request_guest_password_reset` | `( p_email TEXT )` | TABLE | `supabase/migrations/20251120000016_add_guest_password_reset.sql` | sim |
| `public.reset_guest_password` | `( p_reset_token TEXT, p_new_password TEXT )` | BOOLEAN | `supabase/migrations/20251120000016_add_guest_password_reset.sql` | sim |
| `public.sync_receivable_on_payment` | `()` | TRIGGER | `supabase/migrations/20250126000002_auto_create_receivables_from_reservations.sql` | — |
| `public.update_cancellation_policies_updated_at` | `()` | TRIGGER | `supabase/migrations/20251225000012_add_cancellation_policies.sql` | — |
| `public.update_checkin_charge_updated_at` | `()` | TRIGGER | `supabase/migrations/20250220000001_checkin_charge_system.sql` | — |
| `public.update_guest_password` | `( p_account_id UUID, p_new_password TEXT )` | BOOLEAN | `supabase/migrations/20251120000017_add_update_guest_password_function.sql` | sim |
| `public.update_overdue_payables` | `()` | INTEGER | `supabase/migrations/20250126000001_create_financial_module_base.sql` | — |
| `public.update_overdue_receivables` | `()` | INTEGER | `supabase/migrations/20250126000001_create_financial_module_base.sql` | — |
| `public.update_payable_status` | `()` | TRIGGER | `supabase/migrations/20250126000001_create_financial_module_base.sql` | — |
| `public.update_receivable_status` | `()` | TRIGGER | `supabase/migrations/20250126000001_create_financial_module_base.sql` | — |
| `public.update_site_settings_updated_at` | `()` | TRIGGER | `supabase/migrations/20251120000012_create_site_settings.sql` | — |
| `public.update_updated_at_column` | `()` | TRIGGER | `supabase/migrations/20251120000014_create_guest_stay_history.sql` | — |
| `public.verify_guest_password` | `( p_account_id UUID, p_password TEXT )` | BOOLEAN | `supabase/migrations/20251208000001_add_guest_account_deactivation.sql` | sim |

## Permissões `GRANT EXECUTE` (roles acumuladas por assinatura)

| Função (como no SQL) | Roles | Última migração com GRANT |
| --- | --- | --- |
| `apply_dynamic_rules_batch` | `authenticated` | `supabase/migrations/20251120000023_create_rate_system_rpc_functions.sql` |
| `bulk_update_rate_calendar` | `authenticated` | `supabase/migrations/20251120000023_create_rate_system_rpc_functions.sql` |
| `calculate_rate_breakdown` | `authenticated` | `supabase/migrations/20251120000023_create_rate_system_rpc_functions.sql` |
| `generate_rate_recommendations` | `authenticated` | `supabase/migrations/20251120000023_create_rate_system_rpc_functions.sql` |
| `get_active_restrictions` | `authenticated` | `supabase/migrations/20251120000023_create_rate_system_rpc_functions.sql` |
| `public.calculate_rate_price(UUID, UUID, UUID, DATE, INTEGER, INTEGER)` | `anon`, `authenticated` | `supabase/migrations/20251216000016_grant_public_access_to_calculate_rate_price.sql` |
| `public.get_company_api_credentials_status(UUID)` | `authenticated` | `supabase/migrations/20260407000100_create_company_api_credentials_and_helpers.sql` |
| `public.get_company_api_request_logs(UUID, INTEGER)` | `authenticated` | `supabase/migrations/20260407000200_company_api_request_logs_and_toggle.sql` |
| `public.get_fnrh_guest_form_visibility(UUID, UUID)` | `anon`, `authenticated` | `supabase/migrations/20260424120000_fnrh_guest_form_visibility_rpc.sql` |
| `public.get_fnrh_settings_public(UUID)` | `authenticated` | `supabase/migrations/20260423100000_fnrh_category_scope.sql` |
| `public.get_resolved_email_template(public.email_event_type, UUID)` | `authenticated`, `service_role` | `supabase/migrations/20260824140000_establishment_email_templates.sql` |
| `public.insert_email_queue` | `anon`, `authenticated`, `public` | `supabase/migrations/20251205000006_update_insert_email_queue_for_cc_bcc.sql` |
| `public.merge_duplicate_clients_into_primary(uuid, uuid[])` | `authenticated`, `service_role` | `supabase/migrations/20260425120000_merge_duplicate_clients_rpc.sql` |
| `public.ota_link_reservation_after_sync(uuid, uuid, text, jsonb)` | `service_role` | `supabase/migrations/20260419100000_ota_link_reservation_after_sync.sql` |
| `public.reallocate_reservation(UUID, UUID, UUID, UUID, TEXT)` | `authenticated` | `supabase/migrations/20260823194500_fix_reallocate_reservation_audit.sql` |
| `public.rotate_company_api_credentials(UUID)` | `authenticated` | `supabase/migrations/20260407000100_create_company_api_credentials_and_helpers.sql` |
| `public.rpc_recompute_denormalized_from_rate_restrictions(uuid, date, date)` | `authenticated` | `supabase/migrations/20260410161000_rpc_recompute_rate_restrictions_denormalized.sql` |
| `public.set_company_api_credentials_active(UUID, BOOLEAN)` | `authenticated` | `supabase/migrations/20260407000200_company_api_request_logs_and_toggle.sql` |
| `public.upsert_fnrh_settings( UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,...` | `authenticated` | `supabase/migrations/20260420100000_fnrh_establishment_integration.sql` |
| `public.upsert_fnrh_settings( UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,...` | `authenticated` | `supabase/migrations/20260423100000_fnrh_category_scope.sql` |
| `public.user_can_access_establishment(UUID, UUID)` | `authenticated` | `supabase/migrations/20260327130000_grant_user_can_access_establishment_rpc.sql` |

## Limitações deste relatório

- Apenas ficheiros em `supabase/migrations/` são analisados; o estado real da base pode ter objetos criados manualmente ou noutro pipeline.
- Muitas RPCs **não têm** `GRANT EXECUTE` explícito nas migrações (usam default dos roles em Postgres/Supabase).
- **Varias versões** da mesma função com assinaturas diferentes aparecem como linhas separadas (a última migração por chave normalizada `nome + argumentos` vence).

## Mesmo nome, assinaturas distintas (várias linhas na tabela acima)

- `calculate_dynamic_price` (3 variantes)
- `generate_rate_recommendations` (2 variantes)
- `insert_email_queue` (2 variantes)
- `move_email_to_logs` (2 variantes)
- `update_updated_at_column` (2 variantes)
- `upsert_fnrh_settings` (2 variantes)

## Cruzar com o frontend

A coluna **Frontend** usa nomes de `docs/migration/frontend-rpc-inventory.md` (correspondência pelo nome da função, não pela assinatura completa).

_Nenhuma discrepância de nome entre o frontend e as definições `CREATE FUNCTION` destas migrações._
