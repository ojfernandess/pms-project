import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  createPlatformDomain,
  diagnosePlatformDomain,
  importLegacyWebCheckinDomain,
  listPlatformDomains,
  type PlatformDomainRecord,
  verifyPlatformDomain,
} from "@/lib/platformDomainsApi";
import { toast } from "sonner";
import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "suspended" || status === "error") return "destructive";
  return "secondary";
}

export function PlatformCustomDomainsManager() {
  const qc = useQueryClient();
  const [hostname, setHostname] = useState("");
  const [diagnoseId, setDiagnoseId] = useState<string | null>(null);
  const [diagnoseResult, setDiagnoseResult] = useState<string | null>(null);

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ["platform-custom-domains"],
    queryFn: listPlatformDomains,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["platform-custom-domains"] });

  const createMut = useMutation({
    mutationFn: () => createPlatformDomain({ hostname, service_type: "web_checkin" }),
    onSuccess: () => {
      toast.success("Domínio cadastrado — configure o TXT e DNS");
      setHostname("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importMut = useMutation({
    mutationFn: importLegacyWebCheckinDomain,
    onSuccess: () => {
      toast.success("Domínio importado a partir das configurações do site");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyMut = useMutation({
    mutationFn: (id: string) => verifyPlatformDomain(id),
    onSuccess: (res) => {
      const ok = res?.domain?.status === "active";
      toast.success(ok ? "Domínio ativo" : "Verificação concluída — confira DNS/SSL");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const diagnoseMut = useMutation({
    mutationFn: (id: string) => diagnosePlatformDomain(id),
    onSuccess: (res) => {
      const lines = [
        ...(res?.checks?.details ?? []),
        res?.routing?.message,
        ...(res?.routing?.diagnosis ?? []),
      ].filter(Boolean);
      setDiagnoseResult(lines.join("\n") || "Sem problemas detectados");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Domínios personalizados (Web Check-in)
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastro centralizado com verificação TXT, diagnóstico DNS/SSL e roteamento por hostname — sem redirecionar
            para o domínio do PMS.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={importMut.isPending} onClick={() => importMut.mutate()}>
          Importar URL atual do Web Check-in
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end max-w-xl">
        <div>
          <Label htmlFor="platform_domain_hostname">Novo hostname</Label>
          <Input
            id="platform_domain_hostname"
            placeholder="checkin.hotelcliente.com.br"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
          />
        </div>
        <Button type="button" disabled={!hostname.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
          Cadastrar
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando domínios…
        </div>
      ) : null}

      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Domínios</h4>

      <button type="button" className="hidden" aria-hidden onClick={() => invalidate()} />

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2 font-medium">Domínio</th>
              <th className="p-2 font-medium">Serviço</th>
              <th className="p-2 font-medium">DNS</th>
              <th className="p-2 font-medium">SSL</th>
              <th className="p-2 font-medium">Status</th>
              <th className="p-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {domains.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-4 text-muted-foreground text-center">
                  Nenhum domínio cadastrado na tabela centralizada.
                </td>
              </tr>
            ) : (
              domains.map((row: PlatformDomainRecord) => (
                <tr key={row.id} className="border-t">
                  <td className="p-2 font-mono text-xs">{row.hostname}</td>
                  <td className="p-2">Web Check-in</td>
                  <td className="p-2">{row.dns_status ?? "—"}</td>
                  <td className="p-2">{row.ssl_status ?? "—"}</td>
                  <td className="p-2">
                    <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                  </td>
                  <td className="p-2 space-x-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => verifyMut.mutate(row.id)}>
                      Verificar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDiagnoseId(row.id);
                        diagnoseMut.mutate(row.id);
                      }}
                    >
                      Diagnóstico
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {domains.map((row) => (
        <details key={`dns-${row.id}`} className="text-xs rounded border p-3 bg-muted/30">
          <summary className="cursor-pointer font-medium">DNS — {row.hostname}</summary>
          <div className="mt-2 space-y-2 font-mono">
            <p>
              TXT <span className="text-primary">{row.verification_txt.name}</span> = {row.verification_txt.value}
            </p>
            {row.dns_instructions.cname ? (
              <p>
                CNAME {row.dns_instructions.cname.name} → {row.dns_instructions.cname.target}
              </p>
            ) : null}
            {row.dns_instructions.a ? (
              <p>
                A {row.dns_instructions.a.name} → {row.dns_instructions.a.target}
              </p>
            ) : null}
            <p className="text-muted-foreground font-sans">{row.dns_instructions.note}</p>
            {row.last_error ? <p className="text-destructive font-sans">{row.last_error}</p> : null}
          </div>
        </details>
      ))}

      {diagnoseId && diagnoseResult ? (
        <pre className="text-xs whitespace-pre-wrap rounded border bg-muted/40 p-3">{diagnoseResult}</pre>
      ) : null}

      <Button type="button" variant="ghost" size="sm" onClick={() => invalidate()}>
        <RefreshCw className="h-4 w-4 mr-2" />
        Atualizar lista
      </Button>
    </div>
  );
}