# Inventário: RPCs chamados pelo frontend (`src/`)

Gerado por `scripts/migration_frontend_rpc_inventory.py`. Extrai o primeiro argumento em string de cada `supabase.rpc(...)` / `(supabase as any).rpc(...)`.

## Tabela (exclui exemplos em `Documentation.tsx`)

| RPC | Ficheiros |
| --- | --- |
| `apply_recommendation_price` | 1 - `src/hooks/useRateSystem.ts` |
| `calculate_category_availability` | 2 - `src/hooks/useARISystem.ts`, `src/lib/ariAvailabilityUtils.ts` |
| `calculate_rate_price` | 1 - `src/lib/calculateRatePriceRpc.ts` |
| `cancel_expired_preregistrations` | 2 - `src/hooks/useExpiredPreregistrations.ts`, `src/hooks/useReservations.ts` |
| `cancel_expired_quote` | 1 - `src/pages/QuotePaymentPage.tsx` |
| `company_has_feature_access` | 1 - `src/lib/featureAccess.ts` |
| `create_guest_account` | 1 - `src/hooks/useGuestAccount.ts` |
| `create_notification` | 2 - `src/components/maintenance/MaintenanceTicketComments.tsx`, `src/hooks/useNotifications.ts` |
| `create_notification_for_establishment` | 9 - `src/components/maintenance/MaintenanceTicketComments.tsx`, `src/components/reservations/ReservationPaymentModal.tsx`, `src/components/webcheckin/MaintenanceTicketDialog.tsx`, `src/components/webcheckin/WebCheckoutDialog.tsx`, `src/hooks/useCheckoutCleaning.ts`, `src/hooks/useNotifications.ts`, `src/hooks/usePendingReservations.ts`, `src/hooks/useReservations.ts`, `src/hooks/useStayReviews.ts` |
| `create_reservation_with_lock` | 3 - `src/hooks/useQuotes.ts`, `src/hooks/useReservations.ts`, `src/pages/PublicReservation.tsx` |
| `deactivate_guest_account` | 1 - `src/hooks/useGuestAccount.ts` |
| `debug_expired_preregistrations` | 1 - `src/hooks/useExpiredPreregistrations.ts` |
| `generate_rate_recommendations` | 1 - `src/hooks/useRateSystem.ts` |
| `get_checkin_charge_by_payment_token` | 1 - `src/pages/CheckinChargePaymentPage.tsx` |
| `get_company_api_credentials_status` | 1 - `src/components/settings/CompanyApiCredentialsCard.tsx` |
| `get_company_api_request_logs` | 1 - `src/components/settings/CompanyApiRequestLogsPanel.tsx` |
| `get_fnrh_guest_form_visibility` | 1 - `src/components/webcheckin/GuestInformationStep.tsx` |
| `get_fnrh_settings_public` | 1 - `src/hooks/useFnrhSettings.ts` |
| `get_resolved_email_template` | 1 - `src/lib/emailTemplateResolver.ts` |
| `insert_email_queue` | 1 - `src/lib/emailService.ts` |
| `is_date_available_for_sale` | 2 - `src/hooks/useARISystem.ts`, `src/lib/ariAvailabilityUtils.ts` |
| `log_activity` | 2 - `src/hooks/useWebCheckin.ts`, `src/lib/activityLogger.ts` |
| `merge_duplicate_clients_into_primary` | 1 - `src/pages/ClientDeduplication.tsx` |
| `process_no_shows` | 2 - `src/hooks/useNoShowMigrations.ts`, `src/hooks/useNoShowProcessor.ts` |
| `reallocate_reservation` | 1 - `src/components/reservations/ReservationReallocationModal.tsx` |
| `request_guest_password_reset` | 1 - `src/pages/GuestResetPassword.tsx` |
| `reset_guest_password` | 1 - `src/pages/GuestResetPassword.tsx` |
| `rotate_company_api_credentials` | 1 - `src/components/settings/CompanyApiCredentialsCard.tsx` |
| `set_company_api_credentials_active` | 1 - `src/components/settings/CompanyApiCredentialsCard.tsx` |
| `sync_rate_inventory_from_reservations` | 2 - `src/components/rate-system/ARIGrid.tsx`, `src/hooks/useARISystem.ts` |
| `test_expired_preregistrations` | 1 - `src/hooks/useExpiredPreregistrations.ts` |
| `update_guest_password` | 1 - `src/hooks/useGuestAccount.ts` |
| `update_reservation_notes_for_guest` | 1 - `src/components/webcheckin/SpecialRequestsDialog.tsx` |
| `upsert_fnrh_settings` | 1 - `src/hooks/useFnrhSettings.ts` |
| `validate_and_apply_discount` | 2 - `src/components/reservations/ReservationDialog.tsx`, `src/pages/PublicReservation.tsx` |
| `verify_guest_password` | 1 - `src/hooks/useGuestAccount.ts` |

## Apenas exemplos em documentação

_Estes aparecem em `src/pages/Documentation.tsx` (snippets de exemplo); não contar como uso em produção._

| RPC |
| --- |
| `apply_recommendation_price` |
| `calculate_rate_price` |
| `company_has_feature_access` |
| `generate_rate_recommendations` |

_Total de RPCs distintos (sem Documentation): **36**._
