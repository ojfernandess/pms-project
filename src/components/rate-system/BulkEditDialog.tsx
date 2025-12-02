import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPlan: string;
  categories: any[];
  startDate: Date;
  endDate: Date;
  onSave: (data: {
    planId: string;
    categoryIds: string[];
    startDate: Date;
    endDate: Date;
    adjustmentType: 'percentage' | 'fixed' | 'replace';
    adjustmentValue: number;
  }) => Promise<void>;
}

export const BulkEditDialog = memo(({
  open,
  onOpenChange,
  selectedPlan,
  categories,
  startDate,
  endDate,
  onSave,
}: BulkEditDialogProps) => {
  const [adjustmentType, setAdjustmentType] = useState<'percentage' | 'fixed' | 'replace'>('percentage');
  const [adjustmentValue, setAdjustmentValue] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [bulkStartDate, setBulkStartDate] = useState<Date>(() => new Date(startDate));
  const [bulkEndDate, setBulkEndDate] = useState<Date>(() => new Date(endDate));
  const [startDateOpen, setStartDateOpen] = useState(false);
  const [endDateOpen, setEndDateOpen] = useState(false);
  const prevOpenRef = useRef(false);

  // Resetar estado apenas quando o dialog for aberto pela primeira vez
  useEffect(() => {
    if (open) {
      // Só resetar se o dialog acabou de abrir (não estava aberto antes)
      if (!prevOpenRef.current) {
        setBulkStartDate(new Date(startDate));
        setBulkEndDate(new Date(endDate));
        setSelectedCategories([]);
        setAdjustmentValue("");
        setAdjustmentType('percentage');
        setStartDateOpen(false);
        setEndDateOpen(false);
      }
      prevOpenRef.current = true;
    } else {
      // Quando o dialog fecha, resetar a referência
      prevOpenRef.current = false;
    }
  }, [open]); // Apenas observar 'open', não startDate/endDate para evitar resets durante uso

  const handleCategoryToggle = useCallback((categoryId: string, checked: boolean) => {
    if (!categoryId) return;
    
    setSelectedCategories(prev => {
      if (checked) {
        // Evitar duplicatas
        if (prev.includes(categoryId)) return prev;
        return [...prev, categoryId];
      } else {
        return prev.filter(id => id !== categoryId);
      }
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (!categories || categories.length === 0) return;
    
    setSelectedCategories(prev => {
      const allCategoryIds = categories.map(c => c.id).filter(Boolean);
      const allSelected = allCategoryIds.length > 0 && 
        allCategoryIds.every(id => prev.includes(id));
      
      if (allSelected) {
        return [];
      } else {
        return [...allCategoryIds];
      }
    });
  }, [categories]);

  const handleSave = async () => {
    if (selectedCategories.length === 0) {
      alert("Selecione pelo menos uma categoria para edição em lote");
      return;
    }

    const value = parseFloat(adjustmentValue);
    if (isNaN(value)) {
      alert("Valor inválido");
      return;
    }

    await onSave({
      planId: selectedPlan,
      categoryIds: selectedCategories,
      startDate: bulkStartDate,
      endDate: bulkEndDate,
      adjustmentType,
      adjustmentValue: value,
    });
    onOpenChange(false);
  };

  const getPlaceholder = () => {
    if (adjustmentType === 'percentage') {
      return "Ex: 10 para +10%";
    } else if (adjustmentType === 'fixed') {
      return "Ex: 50 para +R$ 50";
    } else {
      return "Ex: 250 para R$ 250";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edição em Lote</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Período</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Popover open={startDateOpen} onOpenChange={setStartDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(bulkStartDate, "dd/MM/yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bulkStartDate}
                    onSelect={(date) => {
                      if (date) {
                        setBulkStartDate(startOfDay(date));
                        setStartDateOpen(false);
                      }
                    }}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
              <Popover open={endDateOpen} onOpenChange={setEndDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(bulkEndDate, "dd/MM/yyyy", { locale: ptBR })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bulkEndDate}
                    onSelect={(date) => {
                      if (date) {
                        setBulkEndDate(startOfDay(date));
                        setEndDateOpen(false);
                      }
                    }}
                    initialFocus
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Categorias</Label>
              <Button
                variant="link"
                size="sm"
                onClick={handleSelectAll}
                className="h-auto p-0 text-xs"
              >
                {categories && categories.length > 0 && selectedCategories.length === categories.length ? "Desmarcar Todas" : "Selecionar Todas"}
              </Button>
            </div>
            <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
              {categories && categories.length > 0 ? (
                categories.map((category) => {
                  const isChecked = selectedCategories.includes(category.id);
                  return (
                    <div key={category.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`category-${category.id}`}
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          handleCategoryToggle(category.id, checked === true);
                        }}
                      />
                      <label
                        htmlFor={`category-${category.id}`}
                        className="text-sm font-medium leading-none cursor-pointer flex-1"
                      >
                        {category.name || category.id}
                      </label>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma categoria disponível
                </p>
              )}
            </div>
          </div>

          <div>
            <Label>Tipo de Ajuste</Label>
            <Select value={adjustmentType} onValueChange={(v: any) => setAdjustmentType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentual</SelectItem>
                <SelectItem value="fixed">Valor Fixo</SelectItem>
                <SelectItem value="replace">Substituir Valor</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Valor</Label>
            <Input
              type="number"
              step="0.01"
              value={adjustmentValue}
              onChange={(e) => setAdjustmentValue(e.target.value)}
              placeholder={getPlaceholder()}
              className="mt-1"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
});

BulkEditDialog.displayName = "BulkEditDialog";

