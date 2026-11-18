import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import {
  applyFinancialArMigration,
  previewFinancialArMigration,
  type FinancialArMigrationPreview,
} from "@/services/financial/financialMigrationService";
import { Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export function FinancialArMigrationPanel() {
  const { selectedEstablishment } = useEstablishment();
  const establishmentId = selectedEstablishment?.id || getSelectedEstablishmentId();

  const [preview, setPreview] = useState<FinancialArMigrationPreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  const runPreview = async () => {
    if (!establishmentId) {
      toast.error("Selecione um estabelecimento");
      return;
    }
    setIsLoading(true);
    try {
      const result = await previewFinancialArMigration(establishmentId);
      if (!result.success || !result.data) throw new Error(result.error);
      setPreview(result.data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro na prévia");
    } finally {
      setIsLoading(false);
    }
  };

  const runApply = async () => {
    if (!establishmentId) return;
    if (!confirm("Aplicar correções nos títulos AR deste estabelecimento? Revise a prévia antes.")) return;

    setIsApplying(true);
    try {
      const result = await applyFinancialArMigration(establishmentId);
      if (!result.success) throw new Error(result.error);
      toast.success("Migração aplicada");
      await runPreview();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao aplicar");
    } finally {
      setIsApplying(false);
    }
  };

  const total = preview?.summary.total_issues ?? null;

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Migração e validação AR (Fase 6)
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Gere a prévia de inconsistências (reservas quitadas com título aberto, duplicatas, valores divergentes, vagas espelho).
          Só aplique após conferir.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={runPreview} disabled={isLoading || !establishmentId}>
          {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Gerar prévia
        </Button>
        <Button variant="destructive" onClick={runApply} disabled={isApplying || !preview}>
          {isApplying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Aplicar correção
        </Button>
      </div>

      {preview && (
        <div className="rounded-lg border p-3 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            {total === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            <span className="font-medium">
              {total === 0 ? "Nenhuma inconsistência encontrada" : `${total} problema(s) detectado(s)`}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Quitadas com título aberto: {preview.summary.paid_reservation_still_open}</Badge>
            <Badge variant="outline">Duplicatas: {preview.summary.duplicate_reservation_titles}</Badge>
            <Badge variant="outline">Valor divergente: {preview.summary.amount_mismatch}</Badge>
            <Badge variant="outline">Vaga espelho: {preview.summary.parking_mirror_titles}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Gerado em {new Date(preview.generated_at).toLocaleString("pt-BR")}
          </p>
        </div>
      )}
    </Card>
  );
}