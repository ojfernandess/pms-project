import type { HostnameResolution } from "@/types/hostnameResolution";
import { AlertTriangle } from "lucide-react";

type Props = {
  resolution?: HostnameResolution | null;
};

export default function UnconfiguredHostname({ resolution }: Props) {
  const hostname = resolution?.hostname || (typeof window !== "undefined" ? window.location.hostname : "");
  const mode = resolution?.mode;

  const title =
    mode === "suspended"
      ? "Domínio suspenso"
      : mode === "pending"
        ? "Domínio aguardando ativação"
        : "Domínio não configurado";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-lg w-full rounded-xl border bg-card p-8 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-amber-600">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          O hostname <code className="text-xs bg-muted px-1 rounded">{hostname}</code>{" "}
          {mode === "pending"
            ? "ainda não foi validado ou não está ativo no PMS."
            : "não está cadastrado para nenhum serviço nesta plataforma."}
        </p>
        {resolution?.message ? (
          <p className="text-sm text-foreground/90">{resolution.message}</p>
        ) : null}
        {resolution?.diagnosis?.length ? (
          <ul className="text-sm list-disc list-inside text-muted-foreground space-y-1">
            {resolution.diagnosis.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <p className="text-xs text-muted-foreground pt-2">
          Este endereço não exibe o painel do PMS por segurança. Configure o domínio em Super Admin → Domínios
          personalizados ou ajuste o DNS conforme a documentação do seu provedor.
        </p>
      </div>
    </div>
  );
}