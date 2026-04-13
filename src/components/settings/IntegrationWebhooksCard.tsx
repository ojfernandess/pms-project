import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getIntegrationWebhookRows } from "@/lib/integrationWebhookUrls";
import { Copy, Webhook } from "lucide-react";
import { toast } from "sonner";

type Props = {
  pmsPublicApiUrl?: string | null;
  supabaseProjectUrl?: string | null;
  establishmentId?: string | null;
};

async function copyText(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

export function IntegrationWebhooksCard({ pmsPublicApiUrl, supabaseProjectUrl, establishmentId }: Props) {
  const rows = useMemo(
    () => getIntegrationWebhookRows(pmsPublicApiUrl, supabaseProjectUrl, establishmentId),
    [pmsPublicApiUrl, supabaseProjectUrl, establishmentId],
  );

  const hasAnyUrl = rows.some((r) => r.nodeUrl || r.edgeUrl);

  const curlExampleBase = useMemo(() => {
    const t = (pmsPublicApiUrl ?? "").trim().replace(/\/$/, "");
    return t || "http://localhost:8787";
  }, [pmsPublicApiUrl]);

  return (
    <Card className="p-6 space-y-4">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Webhook className="h-5 w-5" />
          URLs de webhooks
        </h3>
        <p className="text-sm text-muted-foreground">
          Endereços para configurar nos painéis externos (Stripe, Aiosell, Channex). Em produção com{" "}
          <code className="text-xs">VITE_PMS_API_URL</code>, prefira a coluna <strong>API PMS</strong>; caso contrário use a
          coluna <strong>Supabase Edge</strong>.
        </p>
      </div>

      {!hasAnyUrl ? (
        <p className="text-sm text-muted-foreground rounded-md border bg-muted/30 p-4">
          Defina <code className="text-xs">VITE_PMS_API_URL</code> ou <code className="text-xs">VITE_SUPABASE_URL</code> no
          ambiente do frontend para ver as URLs completas.
        </p>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[140px]">Integração</TableHead>
                <TableHead className="whitespace-nowrap">Método</TableHead>
                <TableHead className="min-w-[220px]">API PMS (Node)</TableHead>
                <TableHead className="min-w-[220px]">Supabase Edge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">{row.subtitle}</p>
                      {row.notes && <p className="text-xs text-muted-foreground leading-snug pt-1">{row.notes}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.method}</Badge>
                  </TableCell>
                  <TableCell className="align-top">
                    {row.nodeUrl ? (
                      <div className="flex flex-col gap-1">
                        <code className="text-xs break-all whitespace-pre-wrap bg-muted/50 rounded px-2 py-1.5">
                          {row.nodeUrl}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-fit"
                          onClick={() => void copyText(row.nodeUrl!, "URL (API PMS)")}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                          Copiar
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    {row.edgeUrl ? (
                      <div className="flex flex-col gap-1">
                        <code className="text-xs break-all whitespace-pre-wrap bg-muted/50 rounded px-2 py-1.5">
                          {row.edgeUrl}
                        </code>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="w-fit"
                          onClick={() => void copyText(row.edgeUrl!, "URL (Edge)")}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1.5" />
                          Copiar
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="rounded-md border bg-muted/20 p-4 space-y-2 text-xs text-muted-foreground">
        <p className="font-medium text-foreground text-sm">Teste rápido (desenvolvimento)</p>
        <p>
          Com a API Node a correr (ex.: <code className="text-[11px]">http://localhost:8787</code>) e{" "}
          <code className="text-[11px]">VITE_PMS_API_URL</code> apontando para ela, pode testar o webhook Channex com um POST
          vazio (a Edge pode responder erro de validação, mas confirma que o proxy responde):
        </p>
        <pre className="text-[11px] bg-background rounded border p-3 overflow-x-auto whitespace-pre-wrap">
          {`curl -sS -X POST "${curlExampleBase}/api/webhooks/channex-reservation" \\
  -H "Content-Type: application/json" \\
  -d "{}"`}
        </pre>
        <p>
          Para a <strong>API pública</strong> (ClientId / ClientSecret), use o separador <strong>APIs e credenciais</strong> e
          o exemplo cURL em <strong>Endpoints da API pública</strong>, ou:
        </p>
        <pre className="text-[11px] bg-background rounded border p-3 overflow-x-auto whitespace-pre-wrap">
          {`curl -sS -X GET "${curlExampleBase}/api/public/company-public-api?action=establishments" \\
  -H "ClientId: SEU_CLIENT_ID" \\
  -H "ClientSecret: SEU_CLIENT_SECRET"`}
        </pre>
      </div>
    </Card>
  );
}
