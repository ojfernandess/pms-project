import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

type Props = {
  envBlock?: string | null;
  sslIssue?: string | null;
  autoSyncEnabled?: boolean;
  infraSyncQueued?: boolean;
};

export function BookingEngineDeployChecklist({
  envBlock,
  sslIssue,
  autoSyncEnabled,
  infraSyncQueued,
}: Props) {
  if (autoSyncEnabled) {
    return (
      <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-4">
        <p className="text-xs font-medium text-emerald-900">
          Sincronização automática com o Dokploy ativa
          {infraSyncQueued ? " — atualização enfileirada após salvar o domínio." : "."}
        </p>
        {sslIssue ? (
          <p className="text-xs leading-snug text-amber-900">{sslIssue}</p>
        ) : (
          <p className="text-[11px] text-emerald-800">
            Traefik (HTTPS) e CORS da API são ajustados a partir do banco. Aguarde o deploy e o Let&apos;s Encrypt (alguns
            minutos).
          </p>
        )}
      </div>
    );
  }

  if (!envBlock?.trim()) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(envBlock);
      toast.success("Variáveis copiadas para a área de transferência");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/60 p-4">
      {sslIssue ? (
        <p className="text-xs font-medium leading-snug text-red-900">{sslIssue}</p>
      ) : (
        <p className="text-xs text-red-800">
          Após o CNAME, é obrigatório registrar o host no Traefik para emitir HTTPS (Let's Encrypt).
        </p>
      )}
      <p className="text-[11px] text-slate-600">
        Copie no <strong>Environment</strong> do Dokploy (compose) e redeploy do <strong>frontend</strong>.
        O erro <code className="rounded bg-white px-1">TRAEFIK DEFAULT CERT</code> some após isso.
      </p>
      <pre className="max-h-40 overflow-auto rounded-md border border-slate-200 bg-white p-3 text-[10px] leading-relaxed text-slate-800">
        {envBlock}
      </pre>
      <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => void copy()}>
        <Copy className="mr-1.5 h-3.5 w-3.5" />
        Copiar variáveis Traefik
      </Button>
    </div>
  );
}