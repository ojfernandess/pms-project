import { useState } from "react";
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
  /** no passo do período: não mostra grade de datas (vai para o passo de preços) */
  specificUiPlacement?: "inline" | "deferred";
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
  specificUiPlacement = "inline",
  disabled,
}: RateDaySelectionFieldsProps) {
  const rangeDates = eachDateStringInRange(startDate, endDate);
  const showSpecificGrid = dateMode === "specific" && specificUiPlacement === "inline";

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="space-y-2">
        <Label>Como selecionar os dias?</Label>
        <Select
          value={dateMode}
          onValueChange={(v) => onDateModeChange(v as RateDateSelectionMode)}
          disabled={disabled}
        >
          <SelectTrigger className="w-full">
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
                  "flex items-center gap-2 rounded-md border px-2.5 py-2 text-sm cursor-pointer min-h-[40px]",
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

      {dateMode === "specific" && specificUiPlacement === "deferred" && (
        <div className="rounded-md border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
          Na próxima etapa você escolherá as datas e definirá os valores (único para todas ou individual por
          data).
        </div>
      )}

      {showSpecificGrid && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Label className="sm:flex-1">Escolha as datas no intervalo</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onSelectAllSpecific} disabled={disabled}>
                Selecionar todas
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onClearSpecific} disabled={disabled}>
                Limpar seleção
              </Button>
              <span className="text-xs text-muted-foreground self-center px-1">
                {specificDates.size} selecionada(s)
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-7 gap-1.5 max-h-52 overflow-y-auto border rounded-md p-2">
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
                    "rounded-md border px-1 py-2 text-center text-xs transition-colors min-h-[52px]",
                    selected ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                  )}
                >
                  <div className="font-medium">{format(parseISO(dateStr), "dd/MM")}</div>
                  <div className="text-[10px] opacity-80">{RATE_WEEKDAY_LABELS[dow]}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type RateSpecificDatesPriceSectionProps = {
  startDate: Date;
  endDate: Date;
  specificDates: Set<string>;
  onToggleSpecificDate: (dateStr: string) => void;
  onSelectAllSpecific: () => void;
  onClearSpecific: () => void;
  specificDatePrices: Record<string, string>;
  onSpecificDatePriceChange: (dateStr: string, value: string) => void;
  valueLabel?: string;
  disabled?: boolean;
};

/** Passo de preços: datas + valor único ou individual (criar tarifário / lote). */
export function RateSpecificDatesPriceSection({
  startDate,
  endDate,
  specificDates,
  onToggleSpecificDate,
  onSelectAllSpecific,
  onClearSpecific,
  specificDatePrices,
  onSpecificDatePriceChange,
  valueLabel = "Valor (R$)",
  disabled,
}: RateSpecificDatesPriceSectionProps) {
  const rangeDates = eachDateStringInRange(startDate, endDate);
  const [uniformValue, setUniformValue] = useState("");
  const [showIndividual, setShowIndividual] = useState(false);

  const applyUniformToAll = () => {
    const clean = uniformValue.trim().replace(",", ".");
    if (!clean || Number.isNaN(Number(clean)) || Number(clean) <= 0) return;
    for (const d of specificDates) {
      onSpecificDatePriceChange(d, clean);
    }
    setShowIndividual(false);
  };

  return (
    <div className="space-y-4 border rounded-lg p-3 sm:p-4 bg-muted/20">
      <div>
        <Label className="text-sm font-semibold">Datas e valores (somente datas específicas)</Label>
        <p className="text-xs text-muted-foreground mt-1">
          Selecione as datas e use um valor único para todas ou preencha cada data separadamente.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onSelectAllSpecific} disabled={disabled}>
            Selecionar todas
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClearSpecific} disabled={disabled}>
            Limpar seleção
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">{specificDates.size} data(s) selecionada(s)</span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-1.5 max-h-48 overflow-y-auto border rounded-md p-2 bg-background">
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
                selected ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              <div className="font-medium">{format(parseISO(dateStr), "dd/MM")}</div>
              <div className="text-[10px] opacity-80">{RATE_WEEKDAY_LABELS[dow]}</div>
            </button>
          );
        })}
      </div>

      {specificDates.size > 0 && (
        <div className="space-y-3 pt-2 border-t">
          <Label className="text-xs font-medium text-muted-foreground">Valor para as datas selecionadas</Label>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1 min-w-0">
              <Label className="text-xs sr-only">Valor único para todas</Label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="Ex.: 320,00 — mesmo valor para todas as datas"
                value={uniformValue}
                onChange={(e) => setUniformValue(e.target.value)}
                disabled={disabled}
                className="h-10"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto shrink-0"
              disabled={disabled || specificDates.size === 0}
              onClick={applyUniformToAll}
            >
              Aplicar a todas
            </Button>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={showIndividual}
              onCheckedChange={(c) => setShowIndividual(c === true)}
              disabled={disabled}
            />
            Preencher valor individualmente por data
          </label>

          {showIndividual && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-56 overflow-y-auto">
              {[...specificDates].sort().map((dateStr) => {
                const dow = weekdayIndexFromDateStr(dateStr);
                return (
                  <div
                    key={dateStr}
                    className="flex flex-col sm:flex-row sm:items-center gap-1.5 border rounded-md p-2 bg-background text-sm"
                  >
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(parseISO(dateStr), "dd/MM/yyyy")} · {RATE_WEEKDAY_LABELS[dow]}
                    </span>
                    <Input
                      type="text"
                      inputMode="decimal"
                      className="h-9 flex-1 min-w-0"
                      placeholder={valueLabel}
                      value={specificDatePrices[dateStr] ?? ""}
                      onChange={(e) => onSpecificDatePriceChange(dateStr, e.target.value)}
                      disabled={disabled}
                    />
                  </div>
                );
              })}
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
    <div className="space-y-3 border rounded-md p-3 sm:p-4">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mt-2">
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