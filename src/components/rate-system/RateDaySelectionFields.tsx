import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  RATE_WEEKDAY_LABELS,
  eachDateStringInRange,
  weekdayIndexFromDateStr,
  type RateDateSelectionMode,
} from "@/lib/rateEditorDaySelection";
import { format, parseISO } from "date-fns";

type RateDaySelectionFieldsProps = {
  startDate: Date;
  endDate: Date;
  dateMode: RateDateSelectionMode;
  onDateModeChange: (mode: RateDateSelectionMode) => void;
  selectedWeekdays: Set<number>;
  onToggleWeekday: (dow: number, checked: boolean) => void;
  specificDates: Set<string>;
  onToggleSpecificDate: (dateStr: string) => void;
  onSelectAllSpecific: () => void;
  onClearSpecific: () => void;
  /** Modo criar tarifário: preços por data selecionada */
  specificDatePrices?: Record<string, string>;
  onSpecificDatePriceChange?: (dateStr: string, value: string) => void;
  disabled?: boolean;
};

export function RateDaySelectionFields({
  startDate,
  endDate,
  dateMode,
  onDateModeChange,
  selectedWeekdays,
  onToggleWeekday,
  specificDates,
  onToggleSpecificDate,
  onSelectAllSpecific,
  onClearSpecific,
  specificDatePrices,
  onSpecificDatePriceChange,
  disabled,
}: RateDaySelectionFieldsProps) {
  const rangeDates = eachDateStringInRange(startDate, endDate);

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="space-y-2">
        <Label>Como selecionar os dias?</Label>
        <Select
          value={dateMode}
          onValueChange={(v) => onDateModeChange(v as RateDateSelectionMode)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os dias do período</SelectItem>
            <SelectItem value="weekdays">Somente dias da semana selecionados</SelectItem>
            <SelectItem value="specific">Somente datas específicas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {dateMode === "weekdays" && (
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Dias da semana</Label>
          <div className="flex flex-wrap gap-2">
            {RATE_WEEKDAY_LABELS.map((label, dow) => (
              <label
                key={label}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer",
                  selectedWeekdays.has(dow) && "border-primary bg-primary/5",
                )}
              >
                <Checkbox
                  checked={selectedWeekdays.has(dow)}
                  onCheckedChange={(c) => onToggleWeekday(dow, c === true)}
                  disabled={disabled}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}

      {dateMode === "specific" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Label className="flex-1 min-w-[200px]">Escolha as datas no intervalo</Label>
            <Button type="button" variant="outline" size="sm" onClick={onSelectAllSpecific} disabled={disabled}>
              Selecionar todas
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClearSpecific} disabled={disabled}>
              Limpar seleção
            </Button>
            <span className="text-xs text-muted-foreground">{specificDates.size} selecionada(s)</span>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 max-h-48 overflow-y-auto border rounded-md p-2">
            {rangeDates.map((dateStr) => {
              const selected = specificDates.has(dateStr);
              const dow = weekdayIndexFromDateStr(dateStr);
              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={disabled}
                  onClick={() => onToggleSpecificDate(dateStr)}
                  className={cn(
                    "rounded-md border px-1 py-2 text-center text-xs transition-colors",
                    selected ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  )}
                >
                  <div className="font-medium">{format(parseISO(dateStr), "dd/MM")}</div>
                  <div className="text-[10px] opacity-80">{RATE_WEEKDAY_LABELS[dow]}</div>
                </button>
              );
            })}
          </div>

          {specificDatePrices && onSpecificDatePriceChange && specificDates.size > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Defina um valor diferente para cada data selecionada (opcional). Valor individual tem prioridade sobre o
                geral. Datas não selecionadas não são alteradas.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {[...specificDates].sort().map((dateStr) => {
                  const dow = weekdayIndexFromDateStr(dateStr);
                  return (
                    <div key={dateStr} className="flex items-center gap-2 border rounded-md p-2 text-sm">
                      <span className="shrink-0 text-xs text-muted-foreground min-w-[88px]">
                        {format(parseISO(dateStr), "dd/MM/yyyy")} · {RATE_WEEKDAY_LABELS[dow]}
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="h-8"
                        placeholder="R$"
                        value={specificDatePrices[dateStr] ?? ""}
                        onChange={(e) => onSpecificDatePriceChange(dateStr, e.target.value)}
                        disabled={disabled}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type WeeklyPriceFieldsProps = {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  weeklyValues: Record<number, string>;
  onWeeklyChange: (dow: number, value: string) => void;
  disabled?: boolean;
};

export function WeeklyPriceFields({
  enabled,
  onEnabledChange,
  weeklyValues,
  onWeeklyChange,
  disabled,
}: WeeklyPriceFieldsProps) {
  return (
    <div className="space-y-3 border rounded-md p-3">
      <Label className="text-sm font-medium">Preços diferentes por dia da semana (opcional)</Label>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <Checkbox
          checked={enabled}
          onCheckedChange={(c) => onEnabledChange(c === true)}
          disabled={disabled}
        />
        Ativar preços individuais por dia da semana
      </label>
      {enabled && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
          {RATE_WEEKDAY_LABELS.map((label, dow) => (
            <div key={label}>
              <Label className="text-xs">{label}</Label>
              <Input
                type="text"
                inputMode="decimal"
                className="h-9 mt-1"
                placeholder="R$"
                value={weeklyValues[dow] ?? ""}
                onChange={(e) => onWeeklyChange(dow, e.target.value)}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}