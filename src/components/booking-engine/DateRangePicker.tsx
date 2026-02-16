import { useState, useMemo } from "react";
import type { ReactNode } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addMonths, startOfMonth, differenceInDays, isAfter, isBefore, isSameDay, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Helper para criar Date sem problemas de timezone
const createDateFromString = (dateString: string): Date => {
  // Se a string está no formato yyyy-MM-dd, criar a data no timezone local
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

interface DateRangePickerProps {
  checkin: string;
  checkout: string;
  onCheckinChange: (date: string) => void;
  onCheckoutChange: (date: string) => void;
  onClear: () => void;
  onSearch: () => void;
  theme?: {
    searchInputBg: string;
    searchInputBorder: string;
    searchInputText: string;
    searchInputFocus: string;
    textSecondary: string;
    accentColor?: string;
    primaryButton: string;
    primaryButtonHover: string;
    secondaryButton: string;
    secondaryButtonHover: string;
  };
  minDate?: Date;
  maxNights?: number;
  customTrigger?: ReactNode;
}

export function DateRangePicker({
  checkin,
  checkout,
  onCheckinChange,
  onCheckoutChange,
  onClear,
  onSearch,
  theme = {
    searchInputBg: "bg-white",
    searchInputBorder: "border-slate-200",
    searchInputText: "text-slate-900",
    searchInputFocus: "focus:border-blue-500",
    textSecondary: "text-slate-600",
    accentColor: "text-blue-600",
    primaryButton: "bg-blue-600 text-white",
    primaryButtonHover: "hover:bg-blue-700",
    secondaryButton: "bg-white text-slate-700 border border-slate-300",
    secondaryButtonHover: "hover:bg-slate-50",
  },
  minDate = new Date(),
  maxNights = 365,
  customTrigger,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<Date>(() => {
    if (checkin) {
      return startOfMonth(new Date(checkin));
    }
    return startOfMonth(new Date());
  });

  // Criar datas sem problemas de timezone
  const checkinDate = checkin ? createDateFromString(checkin) : null;
  const checkoutDate = checkout ? createDateFromString(checkout) : null;

  // Calcular meses para exibição (dois meses lado a lado)
  const firstMonth = selectedMonth;
  const secondMonth = addMonths(selectedMonth, 1);

  // Calcular intervalo de noites
  const nights = useMemo(() => {
    if (checkinDate && checkoutDate) {
      const diff = differenceInDays(checkoutDate, checkinDate);
      return diff > 0 ? diff : 0;
    }
    return 0;
  }, [checkinDate, checkoutDate]);

  // Validar se checkout é depois de check-in
  const isValidRange = useMemo(() => {
    if (!checkinDate || !checkoutDate) return false;
    if (isAfter(checkinDate, checkoutDate) || isSameDay(checkinDate, checkoutDate)) return false;
    if (nights > maxNights) return false;
    return true;
  }, [checkinDate, checkoutDate, nights, maxNights]);

  // Desabilitar datas passadas e após maxNights do check-in
  const disabledDates = useMemo(() => {
    const disabled: Date[] = [];
    const today = startOfDay(new Date());
    
    // Desabilitar datas passadas
    if (checkinDate) {
      // Se check-in está selecionado, desabilitar datas antes dele
      const checkinStart = startOfDay(checkinDate);
      if (isBefore(today, checkinStart)) {
        // Se check-in é no futuro, desabilitar datas entre hoje e check-in
        let date = today;
        while (isBefore(date, checkinStart)) {
          disabled.push(new Date(date));
          date = addMonths(date, 0);
          date.setDate(date.getDate() + 1);
        }
      }
      
      // Desabilitar datas após maxNights do check-in
      const maxDate = addMonths(checkinDate, 0);
      maxDate.setDate(maxDate.getDate() + maxNights);
      // Não precisamos adicionar essas datas, apenas validar no select
    } else {
      // Se check-in não está selecionado, desabilitar apenas datas passadas
      let date = new Date(today);
      date.setDate(date.getDate() - 365); // Desabilitar até 1 ano atrás
      // Não vamos adicionar todas, apenas usar a função de validação
    }
    
    return disabled;
  }, [checkinDate, maxNights]);

  const handleDateSelect = (range: { from?: Date; to?: Date } | undefined) => {
    const today = startOfDay(new Date());

    // Se range foi completamente limpo (undefined ou ambos vazios), limpar tudo
    if (!range || (!range.from && !range.to)) {
      // Só limpar se realmente não há nada selecionado
      if (checkinDate || checkoutDate) {
        onCheckinChange("");
        onCheckoutChange("");
      }
      return;
    }

    // Normalizar as datas do range para evitar problemas de timezone
    const normalizeDate = (date: Date): Date => {
      // Criar uma nova data no timezone local usando apenas ano, mês e dia
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();
      return new Date(year, month, day);
    };

    // Se temos from e to ao mesmo tempo (range completo selecionado)
    if (range.from && range.to) {
      const fromDate = normalizeDate(range.from);
      const toDate = normalizeDate(range.to);

      // Validar que ambas as datas não são passadas
      if (isBefore(fromDate, today) || isBefore(toDate, today)) {
        return;
      }

      // Se from é depois de to, inverter (o usuário selecionou da direita para esquerda)
      if (isAfter(fromDate, toDate)) {
        // Inverter: from vira checkout, to vira check-in
        onCheckinChange(format(toDate, "yyyy-MM-dd"));
        const nightsDiff = differenceInDays(fromDate, toDate);
        if (nightsDiff > 0 && nightsDiff <= maxNights) {
          onCheckoutChange(format(fromDate, "yyyy-MM-dd"));
          setIsOpen(false);
        }
      } else if (!isSameDay(fromDate, toDate)) {
        // Range válido: from é check-in, to é checkout
        onCheckinChange(format(fromDate, "yyyy-MM-dd"));
        const nightsDiff = differenceInDays(toDate, fromDate);
        if (nightsDiff > 0 && nightsDiff <= maxNights) {
          onCheckoutChange(format(toDate, "yyyy-MM-dd"));
          setIsOpen(false);
        }
      }
      return;
    }

    // Se temos apenas from (seleção de check-in)
    if (range.from && !range.to) {
      const selectedDate = normalizeDate(range.from);
      
      // Não permitir selecionar datas passadas
      if (isBefore(selectedDate, today)) {
        return;
      }

      // Se já havia checkout e a nova data de check-in é depois ou igual ao checkout, limpar checkout
      if (checkoutDate) {
        const checkoutStart = startOfDay(checkoutDate);
        if (isAfter(selectedDate, checkoutStart) || isSameDay(selectedDate, checkoutStart)) {
          onCheckoutChange("");
        }
      }

      // Definir check-in - usar a data normalizada para evitar problemas de timezone
      onCheckinChange(format(selectedDate, "yyyy-MM-dd"));
      return;
    }

    // Se temos apenas to (seleção de checkout - raro, mas possível)
    if (range.to && !range.from) {
      const selectedDate = normalizeDate(range.to);
      
      // Não permitir selecionar datas passadas
      if (isBefore(selectedDate, today)) {
        return;
      }

      // Só definir checkout se já temos check-in
      if (checkinDate) {
        const checkinStart = startOfDay(checkinDate);
        if (isAfter(selectedDate, checkinStart) && !isSameDay(selectedDate, checkinStart)) {
          const nightsDiff = differenceInDays(selectedDate, checkinStart);
          if (nightsDiff > 0 && nightsDiff <= maxNights) {
            onCheckoutChange(format(selectedDate, "yyyy-MM-dd"));
            setIsOpen(false);
          }
        }
      }
      return;
    }
  };

  const handleClear = () => {
    onCheckinChange("");
    onCheckoutChange("");
    onClear();
    setIsOpen(false);
  };

  const handleSearch = () => {
    if (isValidRange) {
      onSearch();
      setIsOpen(false);
    }
  };

  // Determinar quais datas estão selecionadas
  // IMPORTANTE: Retornar undefined quando não há seleção válida para evitar que o calendário selecione automaticamente
  const selectedRange = useMemo(() => {
    // Só retornar range se temos check-in e checkout válidos
    if (checkinDate && checkoutDate && isValidRange) {
      return {
        from: checkinDate,
        to: checkoutDate,
      };
    }
    // Se temos apenas check-in, retornar apenas from (sem to) para permitir seleção de checkout
    if (checkinDate) {
      return {
        from: checkinDate,
        to: undefined,
      };
    }
    // Se não temos nada, retornar undefined para não interferir na seleção
    return undefined;
  }, [checkinDate, checkoutDate, isValidRange]);

  // Texto do botão
  const buttonText = useMemo(() => {
    if (checkinDate && checkoutDate && isValidRange) {
      return `${format(checkinDate, "dd/MM", { locale: ptBR })} - ${format(checkoutDate, "dd/MM", { locale: ptBR })}`;
    }
    if (checkinDate) {
      return format(checkinDate, "dd/MM/yyyy", { locale: ptBR });
    }
    return "Check-in e checkout";
  }, [checkinDate, checkoutDate, isValidRange]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {customTrigger || (
          <Button
            variant="outline"
            className={cn(
              "w-full h-12 justify-start text-left font-normal",
              !checkinDate && "text-muted-foreground",
              theme.searchInputBg,
              theme.searchInputBorder,
              theme.searchInputText,
              "border rounded-lg"
            )}
          >
            <CalendarDays className={cn("mr-2 h-4 w-4", theme.accentColor || "text-blue-600")} />
            {buttonText}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 max-w-[95vw] sm:max-w-[700px]" align="start">
        <div className="p-3 sm:p-4">
          {/* Header com informações */}
          <div className="mb-3 sm:mb-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Selecione as datas</h3>
              {checkinDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  className="h-7 w-7 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {checkinDate && checkoutDate && isValidRange && (
              <p className="text-xs text-slate-600">
                {nights} {nights === 1 ? "noite" : "noites"} selecionada{nights > 1 ? "s" : ""}
              </p>
            )}
          </div>

          {/* Calendários lado a lado - Responsivo */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            {/* Primeiro mês */}
            <div className="w-full sm:w-auto">
              <Calendar
                mode="range"
                selected={selectedRange}
                onSelect={handleDateSelect}
                month={firstMonth}
                onMonthChange={setSelectedMonth}
                numberOfMonths={1}
                locale={ptBR}
                defaultMonth={firstMonth}
                disabled={(date) => {
                const dateStart = startOfDay(date);
                const today = startOfDay(new Date());
                
                // Desabilitar datas passadas
                if (isBefore(dateStart, today)) return true;
                
                // Se check-in está selecionado, desabilitar datas antes dele
                if (checkinDate) {
                  const checkinStart = startOfDay(checkinDate);
                  if (isBefore(dateStart, checkinStart)) return true;
                  
                  // Desabilitar datas após maxNights do check-in
                  const maxDate = new Date(checkinDate);
                  maxDate.setDate(maxDate.getDate() + maxNights);
                  if (isAfter(dateStart, maxDate)) return true;
                }
                
                return false;
              }}
              className="rounded-md border-0 w-full"
              classNames={{
                months: "flex flex-col space-y-4",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium text-slate-900",
                nav: "space-x-1 flex items-center",
                nav_button: cn(
                  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                  "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 border border-slate-200 hover:bg-slate-100"
                ),
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse space-y-1",
                head_row: "flex",
                head_cell: "text-slate-500 rounded-md w-9 font-normal text-[0.8rem]",
                row: "flex w-full mt-2",
                cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-100/50 [&:has([aria-selected])]:bg-slate-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: cn(
                  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                  "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-slate-100"
                ),
                day_range_end: "day-range-end",
                day_selected: "bg-blue-600 text-white hover:bg-blue-700 hover:text-white focus:bg-blue-600 focus:text-white",
                day_today: "bg-blue-100 text-blue-900 font-semibold",
                day_outside: "text-slate-400 opacity-50 aria-selected:bg-slate-100/50 aria-selected:text-slate-400 aria-selected:opacity-30",
                day_disabled: "text-slate-300 opacity-50 cursor-not-allowed",
                day_range_middle: "aria-selected:bg-blue-100 aria-selected:text-blue-900",
                day_hidden: "invisible",
              }}
            />
            </div>

            {/* Segundo mês */}
            <div className="w-full sm:w-auto">
              <Calendar
              mode="range"
              selected={selectedRange}
              onSelect={handleDateSelect}
              month={secondMonth}
              onMonthChange={(date) => setSelectedMonth(addMonths(date, -1))}
              numberOfMonths={1}
              locale={ptBR}
              defaultMonth={secondMonth}
              disabled={(date) => {
                const dateStart = startOfDay(date);
                const today = startOfDay(new Date());
                
                // Desabilitar datas passadas
                if (isBefore(dateStart, today)) return true;
                
                // Se check-in está selecionado, desabilitar datas antes dele
                if (checkinDate) {
                  const checkinStart = startOfDay(checkinDate);
                  if (isBefore(dateStart, checkinStart)) return true;
                  
                  // Desabilitar datas após maxNights do check-in
                  const maxDate = new Date(checkinDate);
                  maxDate.setDate(maxDate.getDate() + maxNights);
                  if (isAfter(dateStart, maxDate)) return true;
                }
                
                return false;
              }}
              className="rounded-md border-0 w-full"
              classNames={{
                months: "flex flex-col space-y-4",
                month: "space-y-4",
                caption: "flex justify-center pt-1 relative items-center",
                caption_label: "text-sm font-medium text-slate-900",
                nav: "space-x-1 flex items-center",
                nav_button: cn(
                  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                  "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 border border-slate-200 hover:bg-slate-100"
                ),
                nav_button_previous: "absolute left-1",
                nav_button_next: "absolute right-1",
                table: "w-full border-collapse space-y-1",
                head_row: "flex",
                head_cell: "text-slate-500 rounded-md w-9 font-normal text-[0.8rem]",
                row: "flex w-full mt-2",
                cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-slate-100/50 [&:has([aria-selected])]:bg-slate-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
                day: cn(
                  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                  "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-slate-100"
                ),
                day_range_end: "day-range-end",
                day_selected: "bg-blue-600 text-white hover:bg-blue-700 hover:text-white focus:bg-blue-600 focus:text-white",
                day_today: "bg-blue-100 text-blue-900 font-semibold",
                day_outside: "text-slate-400 opacity-50 aria-selected:bg-slate-100/50 aria-selected:text-slate-400 aria-selected:opacity-30",
                day_disabled: "text-slate-300 opacity-50 cursor-not-allowed",
                day_range_middle: "aria-selected:bg-blue-100 aria-selected:text-blue-900",
                day_hidden: "invisible",
              }}
            />
            </div>
          </div>

          {/* Instruções e botões */}
          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500 mb-3 sm:mb-4 text-center">
              Selecione um intervalo de datas entre 1 e {maxNights} noites
            </p>
            <div className="flex flex-col sm:flex-row gap-2 justify-end sm:items-center">
              <Button
                variant="outline"
                onClick={handleClear}
                className={cn(
                  "h-9 px-4 order-2 sm:order-1",
                  theme.secondaryButton,
                  theme.secondaryButtonHover
                )}
                disabled={!checkinDate && !checkoutDate}
              >
                Limpar
              </Button>
              <Button
                onClick={handleSearch}
                disabled={!isValidRange}
                className={cn(
                  "h-9 px-5 min-w-[150px] order-1 sm:order-2",
                  theme.primaryButton,
                  theme.primaryButtonHover,
                  !isValidRange && "opacity-50 cursor-not-allowed"
                )}
              >
                Ver disponibilidade
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

