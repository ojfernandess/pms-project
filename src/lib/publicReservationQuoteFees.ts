import type { CleaningFeeConfig } from "@/lib/cleaningFeeConfig";
import { isCleaningFeeConfigured, CLEANING_FEE_NAME } from "@/lib/cleaningFeeConfig";
import type { ParkingFeeConfig } from "@/lib/parkingFeeConfig";
import { computeParkingFeeTotal, isParkingFeeConfigured, PARKING_FEE_NAME } from "@/lib/parkingFeeConfig";

export type PublicQuoteFeeFlags = {
  showCleaning: boolean;
  showParkingOption: boolean;
};

export function computePublicQuoteExtras(params: {
  lodgingTotal: number;
  nights: number;
  flags: PublicQuoteFeeFlags;
  cleaning: CleaningFeeConfig | null | undefined;
  parking: ParkingFeeConfig | null | undefined;
  includeParking: boolean;
}): {
  lodgingTotal: number;
  cleaningAmount: number;
  parkingAmount: number;
  grandTotal: number;
  cleaningActive: boolean;
  parkingOffered: boolean;
} {
  const cleaningActive =
    params.flags.showCleaning && isCleaningFeeConfigured(params.cleaning);
  const cleaningAmount = cleaningActive ? Number(params.cleaning!.amount) : 0;

  const parkingOffered =
    params.flags.showParkingOption && isParkingFeeConfigured(params.parking);
  let parkingAmount = 0;
  if (parkingOffered && params.includeParking && params.parking) {
    const b = computeParkingFeeTotal(params.parking, params.nights);
    parkingAmount = b.amount * b.quantity;
  }

  const grandTotal = Math.max(0, params.lodgingTotal + cleaningAmount + parkingAmount);

  return {
    lodgingTotal: params.lodgingTotal,
    cleaningAmount,
    parkingAmount,
    grandTotal,
    cleaningActive,
    parkingOffered,
  };
}

export { CLEANING_FEE_NAME, PARKING_FEE_NAME };