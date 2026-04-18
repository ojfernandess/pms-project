import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RateEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  categoryId: string;
  date: Date;
  initialPrice?: number;
  onSave: (data: {
    planId: string;
    categoryId: string;
    date: Date;
    basePrice: number;
    adultPrice?: number;
    childPrice?: number;
  }) => void;
}

export const RateEditDialog = ({
  open,
  onOpenChange,
  planId,
  categoryId,
  date,
  initialPrice,
  onSave,
}: RateEditDialogProps) => {
  const [basePrice, setBasePrice] = useState(initialPrice?.toString() || "");
  const [adultPrice, setAdultPrice] = useState("");
  const [childPrice, setChildPrice] = useState("");

  useEffect(() => {
    if (open) {
      setBasePrice(initialPrice?.toString() || "");
      setAdultPrice("");
      setChildPrice("");
    }
  }, [open, initialPrice]);

  const handleSave = () => {
    const base = parseFloat(basePrice) || 0;
    const adult = adultPrice ? parseFloat(adultPrice) : undefined;
    const child = childPrice ? parseFloat(childPrice) : undefined;

    onSave({
      planId,
      categoryId,
      date,
      basePrice: base,
      adultPrice: adult,
      childPrice: child,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Tarifa</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Data</Label>
            <Input
              type="text"
              value={format(date, "dd/MM/yyyy", { locale: ptBR })}
              disabled
            />
          </div>
          <div>
            <Label>Preço Base</Label>
            <Input
              type="number"
              step="0.01"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              placeholder="R$ 0,00"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Adulto Extra</Label>
              <Input
                type="number"
                step="0.01"
                value={adultPrice}
                onChange={(e) => setAdultPrice(e.target.value)}
                placeholder="R$ 0,00"
              />
            </div>
            <div>
              <Label>Criança Extra</Label>
              <Input
                type="number"
                step="0.01"
                value={childPrice}
                onChange={(e) => setChildPrice(e.target.value)}
                placeholder="R$ 0,00"
              />
            </div>
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
};


