import { cn } from "@/lib/utils";

/** Ícone de vassoura (lucide-react 0.462 não exporta BrushCleaning). */
export function CleaningBroomIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4", className)}
      aria-hidden
    >
      <path d="M6 18 17 6" />
      <path d="m17 6 2 2" />
      <path d="M3 20h12" />
      <path d="M2 22h14" />
      <path d="M5 20v2" />
      <path d="M9 20v2" />
    </svg>
  );
}