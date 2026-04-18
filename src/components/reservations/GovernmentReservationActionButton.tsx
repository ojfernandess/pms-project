import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const base =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-sm border px-4 py-2.5 " +
  "font-serif text-sm font-semibold leading-snug tracking-tight shadow-sm " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:shrink-0";

const outlineStyles =
  "border-slate-300 bg-white text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.06)] " +
  "hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 hover:shadow-[0_2px_6px_rgba(15,23,42,0.08)] " +
  "[&_svg]:text-blue-900";

const primaryStyles =
  "border-blue-950 bg-blue-900 text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)] " +
  "hover:border-blue-900 hover:bg-blue-800 hover:shadow-[0_2px_6px_rgba(30,58,138,0.25)] " +
  "[&_svg]:text-white";

export type GovernmentReservationActionButtonVariant = "outline" | "primary";

export type GovernmentReservationActionButtonProps =
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: GovernmentReservationActionButtonVariant;
    /** Ícone à esquerda (padrão governamental / auditoria) */
    icon: ReactNode;
    children: ReactNode;
  };

/**
 * Botão de ação em reserva com identidade visual institucional (tons azul, cinza, branco),
 * alvo mínimo 44×44px (WCAG 2.1 toque), foco visível para teclado.
 */
export const GovernmentReservationActionButton = forwardRef<
  HTMLButtonElement,
  GovernmentReservationActionButtonProps
>(function GovernmentReservationActionButton(
  { className, variant = "outline", icon, children, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        base,
        variant === "primary" ? primaryStyles : outlineStyles,
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
});
