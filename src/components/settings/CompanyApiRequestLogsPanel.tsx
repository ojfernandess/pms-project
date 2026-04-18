import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { History, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type ApiRequestLogRow = {
  id: string;
  company_id: string;
  http_method: string;
  action: string | null;
  status_code: number;
  response_snippet: string | null;
  client_ip: string | null;
  created_at: string;
};

type Props = {
  companyId: string | null | undefined;
  isFeatureEnabled: boolean;
};

export function CompanyApiRequestLogsPanel({ companyId, isFeatureEnabled }: Props) {
  const [logs, setLogs] = useState<ApiRequestLogRow[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadLogs = async (targetCompanyId: string) => {
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase.rpc("get_company_api_request_logs", {
        p_company_id: targetCompanyId,
        p_limit: 50,
      } as never);
      if (error) throw error;
      setLogs(Array.isArray(data) ? (data as ApiRequestLogRow[]) : []);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível carregar o histórico de chamadas.");
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (!companyId || !isFeatureEnabled) return;
    void loadLogs(companyId);
  }, [companyId, isFeatureEnabled]);

  if (!companyId) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecione um estabelecimento com empresa vinculada para ver o histórico.
      </p>
    );
  }

  if (!isFeatureEnabled) {
    return (
      <div className="text-sm text-muted-foreground">
        Feature <code className="rounded bg-muted px-1">api_integrations</code> desativada para esta empresa.
      </div>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <History className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
          <div>
            <h4 className="font-semibold text-foreground">Últimas chamadas à API</h4>
            <p className="text-sm text-muted-foreground mt-1">
              Registros recentes da API pública da empresa (<code className="text-xs">company-public-api</code>),
              incluindo método HTTP, ação, status e trecho da resposta.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={loadingLogs}
          onClick={() => void loadLogs(companyId)}
        >
          {loadingLogs ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Atualizar
        </Button>
      </div>

      {loadingLogs && logs.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando histórico...
        </div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Nenhuma chamada registrada ainda.</p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Quando</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="min-w-[180px]">Resposta (trecho)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {new Date(row.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-xs font-mono">{row.http_method}</TableCell>
                  <TableCell className="text-xs font-mono">{row.action ?? "—"}</TableCell>
                  <TableCell className="text-xs">{row.status_code}</TableCell>
                  <TableCell className="text-xs font-mono max-w-[120px] truncate" title={row.client_ip ?? ""}>
                    {row.client_ip ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono max-w-[280px] truncate" title={row.response_snippet ?? ""}>
                    {row.response_snippet ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
