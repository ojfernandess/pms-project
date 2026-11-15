import { AlertTriangle, Clock, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreregistrationExpiryCountdown } from "@/hooks/usePreregistrationExpiryCountdown";

interface PreregistrationExpiryTimerProps {
  expirationDate?: string | null;
  className?: string;
  variant?: "prominent" | "compact";
}

const urgencyStyles = {
  normal: {
    shell: "border-purple-200/80 bg-white/70",
    badge: "text-purple-800 bg-purple-100",
    timer: "text-purple-900",
  },
  warning: {
    shell: "border-amber-300/90 bg-amber-50/80",
    badge: "text-amber-900 bg-amber-100",
    timer: "text-amber-900",
  },
  critical: {
    shell: "border-red-300/90 bg-red-50/80 ring-1 ring-red-200/60",
    badge: "text-red-900 bg-red-100",
    timer: "text-red-900",
  },
  expired: {
    shell: "border-red-400/90 bg-red-50",
    badge: "text-red-900 bg-red-100",
    timer: "text-red-900",
  },
  none: {
    shell: "border-slate-200 bg-white/50",
    badge: "text-slate-700 bg-slate-100",
    timer: "text-slate-800",
  },
};

export function PreregistrationExpiryTimer({
  expirationDate,
  className,
  variant = "prominent",
}: PreregistrationExpiryTimerProps) {
  const { hasExpiration, isExpired, countdownLabel, expiresAtLabel, urgency } =
    usePreregistrationExpiryCountdown(expirationDate);

  const styles = urgencyStyles[urgency];

  if (!hasExpiration) {
    return (
      <div
        className={cn(
          "rounded-lg border px-3 py-2 text-xs text-muted-foreground flex items-center gap-2",
          styles.shell,
          className,
        )}
      >
        <Clock className="h-4 w-4 shrink-0 opacity-70" />
        Nenhum prazo de expiração definido para esta pré-reserva.
      </div>
    );
  }

  const isCompact = variant === "compact";

  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        styles.shell,
        isCompact ? "px-3 py-2.5" : "px-4 py-3.5",
        className,
      )}
      role="timer"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className={cn("flex gap-3", isCompact ? "items-center" : "items-start")}>
        <div
          className={cn(
            "shrink-0 rounded-lg flex items-center justify-center",
            isCompact ? "h-9 w-9" : "h-11 w-11",
            styles.badge,
          )}
        >
          {isExpired ? (
            <AlertTriangle className={cn(isCompact ? "h-4 w-4" : "h-5 w-5")} />
          ) : (
            <Timer className={cn(isCompact ? "h-4 w-4" : "h-5 w-5")} />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <p className={cn("font-medium", isCompact ? "text-xs" : "text-sm", styles.timer)}>
            {isExpired
              ? "Prazo de pagamento expirado"
              : "Tempo restante para confirmar com pagamento"}
          </p>

          {!isExpired && countdownLabel && (
            <p
              className={cn(
                "font-mono font-bold tabular-nums tracking-tight",
                isCompact ? "text-lg" : "text-2xl sm:text-3xl",
                styles.timer,
                urgency === "critical" && "animate-pulse",
              )}
            >
              {countdownLabel}
            </p>
          )}

          <p className={cn("text-muted-foreground", isCompact ? "text-[11px]" : "text-xs")}>
            {isExpired ? (
              <>
                O prazo era <span className="font-medium text-foreground">{expiresAtLabel}</span>. A pré-reserva
                pode ser cancelada automaticamente por falta de pagamento.
              </>
            ) : (
              <>
                Expira em <span className="font-medium text-foreground">{expiresAtLabel}</span>
                {urgency === "warning" && " — prazo se aproximando"}
                {urgency === "critical" && " — última hora para pagar"}
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}