import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Download, Loader2, Upload } from "lucide-react";
import { useReservationImportExportFeature } from "@/hooks/useReservationImportExportFeature";
import {
  createReservationImportJob,
  exportReservationsJson,
  fetchReservationImportExample,
  getReservationImportJob,
  type ReservationImportJob,
} from "@/lib/reservationImportApi";

export default function ReservationImportExport() {
  const { establishmentId: routeEstId } = useParams();
  const { enabled, establishmentId } = useReservationImportExportFeature();
  const [checkinFrom, setCheckinFrom] = useState("");
  const [checkinTo, setCheckinTo] = useState("");
  const [status, setStatus] = useState("all");
  const [batchSize, setBatchSize] = useState(25);
  const [jsonText, setJsonText] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [job, setJob] = useState<ReservationImportJob | null>(null);

  const pollActive = job && (job.status === "pending" || job.status === "running");

  useEffect(() => {
    if (!pollActive || !job?.id || !establishmentId) return;
    const timer = setInterval(async () => {
      try {
        const next = await getReservationImportJob(job.id, establishmentId);
        setJob(next);
        if (next.status === "completed" || next.status === "failed") {
          setImporting(false);
          if (next.status === "completed") {
            toast.success(
              `Importação concluída: ${next.created_count} criadas, ${next.updated_count} atualizadas, ${next.error_count} erros`,
            );
          } else {
            toast.error("Importação falhou");
          }
        }
      } catch (err: any) {
        console.error(err);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [pollActive, job?.id, establishmentId]);

  const handleCopyExample = useCallback(async () => {
    try {
      const example = await fetchReservationImportExample();
      const text = JSON.stringify(example, null, 2);
      setJsonText(text);
      await navigator.clipboard.writeText(text);
      toast.success("Exemplo JSON copiado");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao obter exemplo");
    }
  }, []);

  const handleExport = useCallback(async () => {
    if (!establishmentId) return;
    setExporting(true);
    try {
      const data = await exportReservationsJson({
        establishmentId,
        checkinFrom: checkinFrom || undefined,
        checkinTo: checkinTo || undefined,
        status: status === "all" ? undefined : status,
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reservas-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída");
    } catch (err: any) {
      toast.error(err?.message || "Falha na exportação");
    } finally {
      setExporting(false);
    }
  }, [establishmentId, checkinFrom, checkinTo, status]);

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return;
    const text = await file.text();
    setJsonText(text);
  }, []);

  const handleImport = useCallback(async () => {
    if (!establishmentId) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(jsonText);
    } catch {
      toast.error("JSON inválido");
      return;
    }
    setImporting(true);
    setJob(null);
    try {
      const created = await createReservationImportJob({
        establishmentId,
        batchSize,
        payload,
      });
      setJob(created);
      toast.success("Job de importação iniciado");
    } catch (err: any) {
      setImporting(false);
      toast.error(err?.message || "Falha ao iniciar importação");
    }
  }, [establishmentId, jsonText, batchSize]);

  const progressPct = useMemo(() => job?.progress_pct ?? 0, [job]);

  if (!enabled) {
    return <Navigate to={`/${routeEstId || ""}`} replace />;
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950">
        <p className="font-semibold">Modo importação e exportação ativo</p>
        <p className="text-sm text-amber-900/80">
          Configure os códigos de-para em Unidades e Planos antes de importar.
        </p>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Importação e exportação de reservas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          JSON com hóspede, responsável financeiro, check-in, valores e pagamentos.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <h2 className="text-lg font-medium">Exportar</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Check-in de</Label>
            <Input type="date" value={checkinFrom} onChange={(e) => setCheckinFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Check-in até</Label>
            <Input type="date" value={checkinTo} onChange={(e) => setCheckinTo(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="confirmed">confirmed</SelectItem>
                <SelectItem value="checked_in">checked_in</SelectItem>
                <SelectItem value="checked_out">checked_out</SelectItem>
                <SelectItem value="cancelled">cancelled</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
          Baixar JSON
        </Button>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Importar</h2>
          <Button variant="outline" onClick={handleCopyExample}>
            <Copy className="h-4 w-4 mr-2" />
            Copiar exemplo JSON
          </Button>
        </div>

        <div className="space-y-2">
          <Label>Arquivo JSON</Label>
          <Input
            type="file"
            accept="application/json,.json"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />
        </div>

        <div className="space-y-2">
          <Label>JSON</Label>
          <Textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="min-h-[220px] font-mono text-xs"
            placeholder='Cole o JSON ou use "Copiar exemplo JSON"'
          />
        </div>

        <div className="space-y-2 max-w-xs">
          <Label>Tamanho do lote (batchSize): {batchSize}</Label>
          <Input
            type="range"
            min={1}
            max={100}
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value))}
          />
        </div>

        <Button onClick={handleImport} disabled={importing || !jsonText.trim()}>
          {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          Iniciar importação
        </Button>

        {job && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex flex-wrap gap-4 text-sm">
              <span>Status: <strong>{job.status}</strong></span>
              <span>
                {job.processed}/{job.total} processadas
              </span>
              <span>{job.created_count} criadas</span>
              <span>{job.updated_count} atualizadas</span>
              <span>{job.error_count} erros</span>
            </div>
            <Progress value={progressPct} className="h-2" />
            <p className="text-xs text-muted-foreground">{progressPct}%</p>

            {Array.isArray(job.errors) && job.errors.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reserva</TableHead>
                      <TableHead>Hóspede</TableHead>
                      <TableHead>Mapeamento</TableHead>
                      <TableHead>Mensagem</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {job.errors.slice(0, 100).map((err, idx) => (
                      <TableRow key={`${err.code}-${idx}`}>
                        <TableCell className="font-mono text-xs">{err.reservation_code || "—"}</TableCell>
                        <TableCell>{err.guest_name || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {err.mapping_field
                            ? `${err.mapping_field}: ${err.external_code || "—"}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{err.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
