import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BedDouble, Home, Info, Loader2, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/reservationUtils";
import { allocateCleaningFeePerNight } from "@/lib/cleaningFeeConfig";
import { cn } from "@/lib/utils";

export type NightlyQuoteLine = {
  date: string;
  dayLabel: string;
  amount: number;
};

type Props = {
  checkinDate: string;
  checkoutDate: string;
  nightlyLines: NightlyQuoteLine[];
  lodgingTotal: number;
  cleaningFee: number;
  cleaningConfigured: boolean;
  includeCleaning: boolean;
  onIncludeCleaningChange: (value: boolean) => void;
  loading?: boolean;
  couponFinalAmount?: number | null;
  showCleaningToggle?: boolean;
};

function nightsBetween(checkin: string, checkout: string): number {
  const a = parseISO(checkin);
  const b = parseISO(checkout);
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

export function ReservationQuoteSummary({
  checkinDate,
  checkoutDate,
  nightlyLines,
  lodgingTotal,
  cleaningFee,
  cleaningConfigured,
  includeCleaning,
  onIncludeCleaningChange,
  loading,
  couponFinalAmount,
  showCleaningToggle = true,
}: Props) {
  const nights = nightsBetween(checkinDate, checkoutDate);
  const effectiveLodging =
    couponFinalAmount != null && couponFinalAmount >= 0 ? couponFinalAmount : lodgingTotal;
  const cleaningAmount = cleaningConfigured && includeCleaning ? cleaningFee : 0;
  const grandTotal = effectiveLodging + cleaningAmount;
  const avgNight = nights > 0 ? effectiveLodging / nights : 0;

  if (!checkinDate || !checkoutDate || nights <= 0) return null;

  return (
    <div className="col-span-2 space-y-4 rounded-lg border border-violet-200/70 bg-violet-50/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">Período:</span>
          <span>
            {format(parseISO(checkinDate), "dd/MM/yyyy", { locale: ptBR })} a{" "}
            {format(parseISO(checkoutDate), "dd/MM/yyyy", { locale: ptBR })}
          </span>
          <span className="text-muted-foreground">({nights} diária{nights !== 1 ? "s" : ""})</span>
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
      </div>

      <div className="overflow-x-auto rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Dia</TableHead>
              <TableHead className="text-right">Valor da diária</TableHead>
              {cleaningConfigured ? (
                <TableHead className="text-right bg-violet-50/80">Taxa de limpeza</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {nightlyLines.length === 0 && !loading ? (
              <TableRow>
                <TableCell colSpan={cleaningConfigured ? 4 : 3} className="text-center text-muted-foreground text-sm">
                  Selecione categoria e datas para ver o detalhamento.
                </TableCell>
              </TableRow>
            ) : (
              nightlyLines.map((line, index) => {
                const cleaningParts =
                  cleaningConfigured && includeCleaning
                    ? allocateCleaningFeePerNight(cleaningFee, nights)
                    : [];
                const cleaningSlice = cleaningParts[index] ?? 0;
                return (
                  <TableRow key={line.date}>
                    <TableCell>{format(parseISO(line.date), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell className="capitalize">{line.dayLabel}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(line.amount)}</TableCell>
                    {cleaningConfigured ? (
                      <TableCell
                        className={cn(
                          "text-right text-violet-800",
                          index === 0 && nights > 1 ? "text-muted-foreground text-xs" : "",
                        )}
                      >
                        {index === 0 && includeCleaning ? (
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Home className="h-3 w-3" />
                            {formatCurrency(cleaningFee)} (única)
                          </span>
                        ) : index === 0 && !includeCleaning ? (
                          "—"
                        ) : null}
                        {index > 0 && cleaningSlice > 0 && includeCleaning ? (
                          <span className="text-[10px] text-muted-foreground">rateio</span>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-3 rounded-lg border bg-background p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-start gap-2">
          <BedDouble className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Diárias ({nights}x)</p>
            <p className="text-lg font-bold">{formatCurrency(effectiveLodging)}</p>
            <p className="text-[11px] text-muted-foreground">
              {nights > 0 ? `(${formatCurrency(avgNight)} cada)` : null}
            </p>
          </div>
        </div>
        {cleaningConfigured ? (
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-5 w-5 text-violet-600" />
            <div>
              <p className="text-xs text-muted-foreground">Taxa de limpeza</p>
              <p className="text-lg font-bold">{formatCurrency(cleaningAmount)}</p>
              <p className="text-[11px] text-muted-foreground">(única)</p>
            </div>
          </div>
        ) : null}
        <div className="sm:col-span-2 lg:col-span-2 flex flex-col justify-center sm:items-end">
          <p className="text-xs text-muted-foreground">Total estimado da cotação</p>
          <p className="text-2xl font-bold text-primary">{formatCurrency(grandTotal)}</p>
        </div>
      </div>

      {cleaningConfigured && showCleaningToggle ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-violet-200 bg-violet-50/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="include-cleaning-quote"
              checked={includeCleaning}
              onCheckedChange={(v) => onIncludeCleaningChange(Boolean(v))}
            />
            <Label htmlFor="include-cleaning-quote" className="text-sm cursor-pointer">
              Incluir taxa de limpeza na cotação
            </Label>
          </div>
          <p className="flex items-center gap-1 text-xs text-violet-900">
            <Info className="h-3.5 w-3.5 shrink-0" />
            A taxa de limpeza é cobrada apenas uma vez, independentemente da quantidade de diárias.
          </p>
        </div>
      ) : null}
    </div>
  );
}