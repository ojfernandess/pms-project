import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, HardDrive } from "lucide-react";
import { toast } from "sonner";
import { resolvePmsApiUrl } from "@/lib/runtimeConfig";

const SESSION_KEY = "pms.auth.session";

function readAccessToken(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { access_token?: string };
    return parsed.access_token ?? null;
  } catch {
    return null;
  }
}

type EnvStorageTestResult = {
  ok?: boolean;
  message?: string;
  source?: string;
  provider?: string;
  endpoint?: string;
  port?: number;
  useSSL?: boolean;
  bucket?: string;
};

export function PlatformStorageSettingsManager() {
  const [testing, setTesting] = useState(false);
  const [lastResult, setLastResult] = useState<EnvStorageTestResult | null>(null);

  const testConnection = async () => {
    const token = readAccessToken();
    if (!token) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    setTesting(true);
    try {
      const response = await fetch(`${resolvePmsApiUrl()}/storage/v1/admin/connection-test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      const result = (await response.json()) as EnvStorageTestResult;
      setLastResult(result);
      if (result.ok) {
        toast.success(result.message || "Conexão OK");
      } else {
        toast.error(result.message || "Falha na conexão");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao testar conexão");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="p-4 space-y-4 border-dashed">
      <div className="flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold">Armazenamento de arquivos (PMS)</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        O provedor e o MinIO são definidos apenas nas <strong>variáveis de ambiente do backend</strong>{" "}
        (<code className="text-xs">STORAGE_PROVIDER</code>, <code className="text-xs">MINIO_*</code>). Ajuste no painel
        de deploy e reinicie a API. Use o botão abaixo para validar o env ativo no container.
      </p>

      <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
        <li>
          MinIO público Stayos: <code className="text-xs">MINIO_ENDPOINT=s3.stayos.com.br</code>,{" "}
          <code className="text-xs">MINIO_PORT=443</code>, <code className="text-xs">MINIO_USE_SSL=true</code>
        </li>
        <li>Local (disco): <code className="text-xs">STORAGE_PROVIDER=local</code> ou omita <code className="text-xs">STORAGE_PROVIDER</code></li>
      </ul>

      <Button type="button" variant="outline" onClick={() => void testConnection()} disabled={testing}>
        {testing ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Testando env…
          </>
        ) : (
          "Testar conexão (env do backend)"
        )}
      </Button>

      {lastResult && (
        <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1 font-mono">
          <div>source: {lastResult.source ?? "env"}</div>
          {lastResult.provider && <div>provider: {lastResult.provider}</div>}
          {lastResult.endpoint != null && (
            <div>
              endpoint: {lastResult.endpoint}:{lastResult.port ?? "?"}
              {lastResult.useSSL ? " (HTTPS)" : " (HTTP)"}
            </div>
          )}
          {lastResult.bucket && <div>bucket: {lastResult.bucket}</div>}
          <div className={lastResult.ok ? "text-green-700" : "text-red-700"}>{lastResult.message}</div>
        </div>
      )}
    </Card>
  );
}