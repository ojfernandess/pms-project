import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useFinancialDailyResultLines } from "@/hooks/useFinancialDailyResultLines";
import type { DailyResultLineConfig } from "@/services/financial/operatingReportService";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  establishments: Array<{ id: string; name: string }>;
  lines: DailyResultLineConfig[];
};

export function DailyResultLinesDialog({ open, onOpenChange, companyId, establishments, lines }: Props) {
  const { upsert, remove } = useFinancialDailyResultLines(companyId);
  const [label, setLabel] = useState("");
  const [establishmentIds, setEstablishmentIds] = useState<string[]>([]);
  const [isUnified, setIsUnified] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [editingId, setEditingId] = useState<string | undefined>();

  const resetForm = () => {
    setLabel("");
    setEstablishmentIds([]);
    setIsUnified(false);
    setIsActive(true);
    setEditingId(undefined);
  };

  const startEdit = (line: DailyResultLineConfig) => {
    setEditingId(line.id.startsWith("default-") ? undefined : line.id);
    setLabel(line.label);
    setEstablishmentIds(line.establishmentIds);
    setIsUnified(line.isUnified);
    setIsActive(line.isActive);
  };

  const save = async () => {
    if (!companyId) {
      toast.error("Empresa não identificada.");
      return;
    }
    if (!label.trim() || establishmentIds.length === 0) {
      toast.error("Informe o rótulo e pelo menos um estabelecimento.");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: editingId,
        label: label.trim(),
        establishmentIds,
        displayOrder: editingId
          ? lines.find((l) => l.id === editingId)?.displayOrder ?? lines.length
          : lines.filter((l) => !l.id.startsWith("default-")).length,
        isUnified,
        isActive,
      });
      toast.success("Linha salva.");
      resetForm();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível salvar a linha.");
    }
  };

  const persisted = lines.filter((l) => !l.id.startsWith("default-"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Linhas do resultado do dia</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {persisted.length > 0 && (
            <div className="space-y-2">
              {persisted.map((line) => (
                <div key={line.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                  <div>
                    <div className="font-medium">{line.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {line.establishmentIds.length} estabelecimento(s)
                      {line.isUnified ? " · unificada" : ""}
                      {!line.isActive ? " · inativa" : ""}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(line)}>
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await remove.mutateAsync(line.id);
                          toast.success("Linha removida.");
                        } catch (e: any) {
                          toast.error(e?.message || "Não foi possível remover.");
                        }
                      }}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <Label>Rótulo</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: GRUPO X" />
            <Label>Estabelecimentos</Label>
            <div className="max-h-40 space-y-2 overflow-auto rounded-md border p-2">
              {establishments.map((e) => (
                <label key={e.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={establishmentIds.includes(e.id)}
                    onCheckedChange={(checked) => {
                      setEstablishmentIds((prev) =>
                        checked ? [...prev, e.id] : prev.filter((id) => id !== e.id),
                      );
                    }}
                  />
                  {e.name}
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="unified">Linha unificada</Label>
              <Switch id="unified" checked={isUnified} onCheckedChange={setIsUnified} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="active">Ativa</Label>
              <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={resetForm}>
            Nova
          </Button>
          <Button onClick={save} disabled={upsert.isPending}>
            Salvar linha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
