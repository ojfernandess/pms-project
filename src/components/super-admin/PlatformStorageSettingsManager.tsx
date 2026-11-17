import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, HardDrive, Cloud } from "lucide-react";
import { toast } from "sonner";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import {
  defaultStorageConfig,
  parseStorageConfigFromSite,
  type StorageConfig,
} from "@/lib/storageConfig";
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

export function PlatformStorageSettingsManager() {
  const { settings, isLoading, updateSettings, isUpdating } = useSiteSettings();
  const [storageConfig, setStorageConfig] = useState<StorageConfig>(defaultStorageConfig());
  const [testing, setTesting] = useState(false);
  const [secretTouched, setSecretTouched] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setStorageConfig(parseStorageConfigFromSite(settings.storage_config));
    setSecretTouched(false);
  }, [settings]);

  const save = () => {
    const payload: StorageConfig =
      storageConfig.provider === "local"
        ? { provider: "local" }
        : {
            provider: "minio",
            minio: {
              endPoint: storageConfig.minio?.endPoint?.trim() || "",
              port: storageConfig.minio?.port ?? 9000,
              useSSL: storageConfig.minio?.useSSL === true,
              accessKey: storageConfig.minio?.accessKey?.trim() || "",
              secretKey: storageConfig.minio?.secretKey?.trim() || "",
              region: storageConfig.minio?.region?.trim() || "us-east-1",
              bucket: storageConfig.minio?.bucket?.trim() || "pms",
            },
          };

    if (payload.provider === "minio") {
      const m = payload.minio!;
      const existing = parseStorageConfigFromSite(settings?.storage_config).minio;
      if (!m.secretKey && existing?.secretKey) {
        m.secretKey = existing.secretKey;
      }
      if (!m.endPoint || !m.accessKey || !m.secretKey) {
        toast.error("Preencha endpoint, access key e secret key do MinIO.");
        return;
      }
    }

    updateSettings({ storage_config: payload });
  };

  const testConnection = async () => {
    const token = readAccessToken();
    if (!token) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }
    setTesting(true);
    try {
      const body =
        storageConfig.provider === "local"
          ? { storage_config: { provider: "local" } }
          : { storage_config: storageConfig };
      const response = await fetch(`${resolvePmsApiUrl()}/storage/v1/admin/connection-test`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { ok?: boolean; message?: string };
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

  if (isLoading) {
    return (
      <Card className="p-4 flex justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const minio = storageConfig.minio ?? defaultStorageConfig().minio!;

  return (
    <Card className="p-4 space-y-4 border-dashed">
      <div className="flex items-center gap-2">
        <HardDrive className="h-4 w-4 text-primary" />
        <h3 className="text-base font-semibold">Armazenamento de arquivos (PMS)</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Escolha entre o disco padrão da API Nest ou um servidor MinIO (API S3). Uploads de documentos do
        check-in web, logos e demais buckets seguem o mesmo provedor.
      </p>

      <div className="space-y-2">
        <Label>Provedor</Label>
        <Select
          value={storageConfig.provider}
          onValueChange={(value: "local" | "minio") =>
            setStorageConfig((prev) => ({
              ...prev,
              provider: value,
              minio: prev.minio ?? defaultStorageConfig().minio,
            }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local">Padrão do sistema (disco local)</SelectItem>
            <SelectItem value="minio">MinIO (S3-compatível)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {storageConfig.provider === "minio" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="minio-endpoint">Endpoint MinIO</Label>
            <Input
              id="minio-endpoint"
              value={minio.endPoint}
              onChange={(e) =>
                setStorageConfig((prev) => ({
                  ...prev,
                  minio: { ...minio, endPoint: e.target.value },
                }))
              }
              placeholder="minio.seudominio.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minio-port">Porta</Label>
            <Input
              id="minio-port"
              type="number"
              value={minio.port}
              onChange={(e) =>
                setStorageConfig((prev) => ({
                  ...prev,
                  minio: { ...minio, port: Number(e.target.value) || 9000 },
                }))
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="minio-ssl">Usar HTTPS</Label>
            <Switch
              id="minio-ssl"
              checked={minio.useSSL}
              onCheckedChange={(checked) =>
                setStorageConfig((prev) => ({
                  ...prev,
                  minio: { ...minio, useSSL: checked },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minio-bucket">Bucket S3</Label>
            <Input
              id="minio-bucket"
              value={minio.bucket}
              onChange={(e) =>
                setStorageConfig((prev) => ({
                  ...prev,
                  minio: { ...minio, bucket: e.target.value },
                }))
              }
              placeholder="pms"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minio-region">Região</Label>
            <Input
              id="minio-region"
              value={minio.region}
              onChange={(e) =>
                setStorageConfig((prev) => ({
                  ...prev,
                  minio: { ...minio, region: e.target.value },
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minio-access">Access Key</Label>
            <Input
              id="minio-access"
              value={minio.accessKey}
              onChange={(e) =>
                setStorageConfig((prev) => ({
                  ...prev,
                  minio: { ...minio, accessKey: e.target.value },
                }))
              }
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="minio-secret">Secret Key</Label>
            <Input
              id="minio-secret"
              type="password"
              value={minio.secretKey}
              onChange={(e) => {
                setSecretTouched(true);
                setStorageConfig((prev) => ({
                  ...prev,
                  minio: { ...minio, secretKey: e.target.value },
                }));
              }}
              placeholder={secretTouched ? "" : "•••••••• (mantém o atual se vazio ao salvar)"}
              autoComplete="new-password"
            />
          </div>
          <p className="sm:col-span-2 text-xs text-muted-foreground flex items-start gap-1">
            <Cloud className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            Compatível com MinIO via SDK AWS S3: objetos em <code className="text-xs">{`{bucket lógico}/{caminho}`}</code>{" "}
            dentro do bucket S3 configurado.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => void testConnection()} disabled={testing}>
          {testing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Testando…
            </>
          ) : (
            "Testar conexão"
          )}
        </Button>
        <Button type="button" onClick={save} disabled={isUpdating}>
          {isUpdating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Salvando…
            </>
          ) : (
            "Salvar storage"
          )}
        </Button>
      </div>
    </Card>
  );
}
