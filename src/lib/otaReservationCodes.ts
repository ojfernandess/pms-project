/** Metadados OTA vindos de `ota_reservations` (Bukly, Aiosell, Channex). */

export type OtaReservationCodeFields = {
  ota_reservation_code?: string | null;
  ota_cm_booking_id?: string | null;
  ota_source_channel_name?: string | null;
};

/** ID no channel manager por quarto/linha (ex. Bukly `6AFAF6EE907C9#abc123`). */
export function otaSyncReservationCode(ota: OtaReservationCodeFields | null | undefined): string {
  return String(ota?.ota_reservation_code ?? "").trim();
}

/** Referência master do CM sem sufixo de quarto (`6AFAF6EE907C9`). */
export function otaChannelManagerMasterRef(ota: OtaReservationCodeFields | null | undefined): string {
  const code = otaSyncReservationCode(ota);
  if (!code) return "";
  const hash = code.indexOf("#");
  return hash >= 0 ? code.slice(0, hash).trim() : code;
}

/**
 * Código da reserva no canal de venda (Booking.com, etc.).
 * Bukly: `HotelReservationID@ResID_Type="24"` → gravado em `ota_cm_booking_id`.
 */
export function otaPartnerChannelReservationCode(
  ota: OtaReservationCodeFields | null | undefined,
): string {
  return String(ota?.ota_cm_booking_id ?? "").trim();
}

export function formatOtaReservationCodesForDisplay(
  ota: OtaReservationCodeFields | null | undefined,
): {
  partnerCode: string;
  managerMasterRef: string;
  syncLineCode: string;
} {
  return {
    partnerCode: otaPartnerChannelReservationCode(ota),
    managerMasterRef: otaChannelManagerMasterRef(ota),
    syncLineCode: otaSyncReservationCode(ota),
  };
}