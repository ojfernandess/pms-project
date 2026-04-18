-- Cleanup one-shot for stale Channex modified revisions left in pending/failed.
-- Goal: remove orphan pending items when reservation is already cancelled or
-- superseded by a newer cancellation revision for same booking/unique.

-- 1) Modified revisions linked to reservations already cancelled in PMS.
UPDATE public.channex_booking_revisions cbr
SET
  process_status = 'processed',
  error_message = COALESCE(cbr.error_message, 'Superseded: local reservation already cancelled'),
  updated_at = now()
FROM public.reservations r
WHERE cbr.reservation_id = r.id
  AND cbr.status = 'modified'
  AND cbr.process_status IN ('pending', 'failed')
  AND r.status = 'cancelled';

-- 2) Modified revisions superseded by a newer cancellation revision
-- for same channel + booking_id.
UPDATE public.channex_booking_revisions cbr
SET
  process_status = 'processed',
  error_message = format('Superseded by cancellation revision %s', newer_cancel.revision_id),
  updated_at = now()
FROM (
  SELECT
    ota_channel_id,
    booking_id,
    MAX(updated_at) AS max_updated_at,
    MAX(revision_id::text) AS revision_id
  FROM public.channex_booking_revisions
  WHERE status = 'cancelled'
    AND booking_id IS NOT NULL
  GROUP BY ota_channel_id, booking_id
) AS newer_cancel
WHERE cbr.ota_channel_id = newer_cancel.ota_channel_id
  AND cbr.booking_id = newer_cancel.booking_id
  AND cbr.status = 'modified'
  AND cbr.process_status IN ('pending', 'failed');

-- 3) Modified revisions superseded by a newer cancellation revision
-- for same channel + unique_id (fallback when booking_id diverges).
UPDATE public.channex_booking_revisions cbr
SET
  process_status = 'processed',
  error_message = format('Superseded by cancellation revision %s', newer_cancel.revision_id),
  updated_at = now()
FROM (
  SELECT
    ota_channel_id,
    unique_id,
    MAX(updated_at) AS max_updated_at,
    MAX(revision_id::text) AS revision_id
  FROM public.channex_booking_revisions
  WHERE status = 'cancelled'
    AND unique_id IS NOT NULL
  GROUP BY ota_channel_id, unique_id
) AS newer_cancel
WHERE cbr.ota_channel_id = newer_cancel.ota_channel_id
  AND cbr.unique_id = newer_cancel.unique_id
  AND cbr.status = 'modified'
  AND cbr.process_status IN ('pending', 'failed');
