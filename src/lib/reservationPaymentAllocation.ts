import { isPaymentRefundRecord } from "@/lib/reservationUtils";
import { parseISO } from "date-fns";

export type ReservationServiceFeeRow = {
  id: string;
  amount?: number | null;
  quantity?: number | null;
  created_at?: string | null;
};

export type ReservationPaymentRow = {
  amount?: number | null;
  notes?: string | null;
  created_at?: string | null;
  payment_date?: string | null;
};

export type PaymentAllocationInput = {
  payments: ReservationPaymentRow[];
  serviceFees: ReservationServiceFeeRow[];
  originalBaseAmount: number;
  extensionAmount: number;
  wasCreatedWithoutPayment: boolean;
  extensionAddedAt: Date | null;
};

export type PaymentAllocationResult = {
  feesPaid: Record<string, number>;
  remainingForBase: number;
  remainingForExtension: number;
};

function paymentDateFromRow(payment: ReservationPaymentRow): Date | null {
  if (payment.created_at) {
    const d = new Date(payment.created_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (payment.payment_date) {
    try {
      const d = parseISO(String(payment.payment_date));
      if (!Number.isNaN(d.getTime())) return d;
    } catch {
      /* ignore */
    }
    const d = new Date(payment.payment_date);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/** Mesma regra do modal de pagamento: distribui valores por componente (base, extensão, taxas). */
export function allocateReservationPayments(input: PaymentAllocationInput): PaymentAllocationResult {
  const {
    payments,
    serviceFees,
    originalBaseAmount,
    extensionAmount: effectiveExtensionAmount,
    wasCreatedWithoutPayment,
    extensionAddedAt,
  } = input;

  const sortedFees = [...(serviceFees || [])].sort((a, b) => {
    const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return dateA - dateB;
  });

  const sortedPayments = [...(payments || [])].sort((a, b) => {
    const dateA = paymentDateFromRow(a)?.getTime() ?? 0;
    const dateB = paymentDateFromRow(b)?.getTime() ?? 0;
    return dateA - dateB;
  });

  let remainingForBase = Math.max(0, originalBaseAmount);
  let remainingForExtension = wasCreatedWithoutPayment ? 0 : Math.max(0, effectiveExtensionAmount);
  const feesPaid: Record<string, number> = {};

  sortedPayments.forEach((payment) => {
    if (isPaymentRefundRecord(payment)) return;

    const paymentAmount = Number(payment.amount || 0);
    const paymentDate = paymentDateFromRow(payment);
    if (!paymentDate) return;

    const componentMatch = payment.notes?.match(/\[COMPONENT:([^\]]+)\]/);
    const paymentComponent = componentMatch ? componentMatch[1] : null;

    let remaining = paymentAmount;

    if (paymentComponent === "all") {
      if (remainingForBase > 0 && remaining > 0) {
        const appliedToBase = Math.min(remaining, remainingForBase);
        remainingForBase -= appliedToBase;
        remaining -= appliedToBase;
      }
      if (
        !wasCreatedWithoutPayment &&
        effectiveExtensionAmount > 0 &&
        extensionAddedAt &&
        paymentDate >= extensionAddedAt &&
        remainingForExtension > 0 &&
        remaining > 0
      ) {
        const appliedToExtension = Math.min(remaining, remainingForExtension);
        remainingForExtension -= appliedToExtension;
        remaining -= appliedToExtension;
      }
      if (remaining > 0) {
        sortedFees.forEach((fee) => {
          if (remaining <= 0) return;
          const feeId = fee.id;
          if (!feeId) return;
          const feeCreatedAt = fee.created_at ? new Date(fee.created_at) : null;
          if (!feeCreatedAt || paymentDate < feeCreatedAt) return;
          const feeTotal = Number(fee.amount || 0) * Number(fee.quantity || 1);
          const currentPaid = feesPaid[feeId] || 0;
          const feeRemaining = feeTotal - currentPaid;
          if (feeRemaining > 0 && remaining > 0) {
            const appliedToFee = Math.min(remaining, feeRemaining);
            feesPaid[feeId] = (feesPaid[feeId] || 0) + appliedToFee;
            remaining -= appliedToFee;
          }
        });
      }
      return;
    }

    if (paymentComponent) {
      if (paymentComponent === "base") {
        if (remainingForBase > 0 && remaining > 0) {
          const appliedToBase = Math.min(remaining, remainingForBase);
          remainingForBase -= appliedToBase;
        }
        return;
      }
      if (paymentComponent === "extension") {
        if (
          !wasCreatedWithoutPayment &&
          effectiveExtensionAmount > 0 &&
          remainingForExtension > 0 &&
          remaining > 0
        ) {
          const appliedToExtension = Math.min(remaining, remainingForExtension);
          remainingForExtension -= appliedToExtension;
        }
        return;
      }
      if (paymentComponent.startsWith("fee-")) {
        const feeId = paymentComponent.replace("fee-", "");
        const fee = sortedFees.find((f) => f.id === feeId);
        if (fee) {
          const feeTotal = Number(fee.amount || 0) * Number(fee.quantity || 1);
          const currentPaid = feesPaid[feeId] || 0;
          const feeRemaining = feeTotal - currentPaid;
          if (feeRemaining > 0 && remaining > 0) {
            const appliedToFee = Math.min(remaining, feeRemaining);
            feesPaid[feeId] = (feesPaid[feeId] || 0) + appliedToFee;
          }
        }
        return;
      }
      return;
    }

    if (remainingForBase > 0 && remaining > 0) {
      const appliedToBase = Math.min(remaining, remainingForBase);
      remainingForBase -= appliedToBase;
      remaining -= appliedToBase;
    }

    if (
      !wasCreatedWithoutPayment &&
      effectiveExtensionAmount > 0 &&
      extensionAddedAt &&
      paymentDate >= extensionAddedAt &&
      remainingForExtension > 0 &&
      remaining > 0
    ) {
      const appliedToExtension = Math.min(remaining, remainingForExtension);
      remainingForExtension -= appliedToExtension;
      remaining -= appliedToExtension;
    }

    if (remaining > 0) {
      sortedFees.forEach((fee) => {
        if (remaining <= 0) return;
        const feeId = fee.id;
        if (!feeId) return;
        const feeCreatedAt = fee.created_at ? new Date(fee.created_at) : null;
        if (!feeCreatedAt || paymentDate < feeCreatedAt) return;
        const feeTotal = Number(fee.amount || 0) * Number(fee.quantity || 1);
        const currentPaid = feesPaid[feeId] || 0;
        const feeRemaining = feeTotal - currentPaid;
        if (feeRemaining > 0 && remaining > 0) {
          const appliedToFee = Math.min(remaining, feeRemaining);
          feesPaid[feeId] = (feesPaid[feeId] || 0) + appliedToFee;
          remaining -= appliedToFee;
        }
      });
    }
  });

  return { feesPaid, remainingForBase, remainingForExtension };
}

type ActivityLogRow = {
  action_type?: string | null;
  new_values?: { paid_amount?: number; total_amount?: number; checkout_date?: string } | null;
  old_values?: { checkout_date?: string } | null;
  created_at?: string | null;
};

/** Infere parâmetros de rateio a partir da reserva e logs (mesma intenção do modal de pagamento). */
export function inferPaymentAllocationParams(
  reservation: { total_amount?: number | null },
  activityLogs: ActivityLogRow[] | null | undefined,
): Pick<PaymentAllocationInput, "originalBaseAmount" | "extensionAmount" | "wasCreatedWithoutPayment" | "extensionAddedAt"> {
  const baseAmount = Number(reservation.total_amount || 0);
  const createdLog = activityLogs?.find((log) => log.action_type === "created");
  const originalPaidAmount = Number(createdLog?.new_values?.paid_amount ?? 0);
  const wasCreatedWithoutPayment = originalPaidAmount < 0.01;

  let extensionAmount = 0;
  let extensionAddedAt: Date | null = null;
  let originalBaseAmount = baseAmount;

  if (!wasCreatedWithoutPayment && activityLogs?.length) {
    const originalTotalAmount =
      createdLog?.new_values?.total_amount != null
        ? Number(createdLog.new_values.total_amount)
        : baseAmount;

    const extensionLogs = activityLogs.filter((log) => {
      if (!log.old_values?.checkout_date || !log.new_values?.checkout_date) return false;
      try {
        const oldCheckout = parseISO(log.old_values.checkout_date);
        const newCheckout = parseISO(log.new_values.checkout_date);
        return newCheckout > oldCheckout;
      } catch {
        return false;
      }
    });

    if (extensionLogs.length > 0) {
      extensionLogs.sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );
      const latest = extensionLogs[0];
      if (latest?.created_at) extensionAddedAt = new Date(latest.created_at);
    }

    if (baseAmount > originalTotalAmount + 0.009) {
      extensionAmount = baseAmount - originalTotalAmount;
      originalBaseAmount = originalTotalAmount;
    }
  }

  if (wasCreatedWithoutPayment) {
    extensionAmount = 0;
    originalBaseAmount = baseAmount;
    extensionAddedAt = null;
  }

  return {
    originalBaseAmount: Math.max(0, originalBaseAmount),
    extensionAmount: Math.max(0, extensionAmount),
    wasCreatedWithoutPayment,
    extensionAddedAt,
  };
}