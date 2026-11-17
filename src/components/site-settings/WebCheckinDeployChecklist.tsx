import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

function hostnamesFromBaseUrls(...urls: (string | undefined | null)[]): string[] {
  const out = new Set<string>();
  for (const raw of urls) {
    const t = raw?.trim();
    if (!t) continue;
    try {
      const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
      out.add(new URL(withScheme).hostname.toLowerCase());
    } catch {
      const bare = t.split("/")[0].toLowerCase();
      if (bare) out.add(bare);
    }
  }
  return [...out];
}

function buildTraefikRule(hosts: string[]): string {
  return hosts.map((h) => `Host(\`${h}\`)`).join(" || ");
}

type Props = {
  webCheckinBaseUrl: string;
  pmsBaseUrl: string;
};

export function WebCheckinDeployChecklist({ webCheckinBaseUrl, pmsBaseUrl }: Props) {
  const hosts = useMemo(
    () => hostnamesFromBaseUrls(webCheckinBaseUrl),
    [webCheckinBaseUrl],
  );

  const envBlock = useMemo(() => {
    if (hosts.length === 0) return "";
    const primary = hosts[0];
    const rule = buildTraefikRule(hosts);
    const pms = pmsBaseUrl.trim().replace(/\/+$/, "");
    const lines = [
      `# Cole no Environment do Docker Compose (Dokploy) e redeploy (frontend + backend)`,
      `WEB_CHECKIN_PUBLIC_HOST=${primary}`,
      `WEB_CHECKIN_TRAEFIK_RULE=${rule}`,
      `WEB_CHECKIN_PUBLIC_URL=${webCheckinBaseUrl.trim().replace(/\/+$/, "")}`,
    ];
    if (pms) {
      const withoutWww = pms.replace(/^https:\/\/www\./i, "https://");
      const checkin = webCheckinBaseUrl.trim().replace(/\/+$/, "");
      let myapi = "https://myapi.seudominio.com";
      try {
        const apex = new URL(withoutWww).hostname.split(".").slice(-2).join(".");
        myapi = `https://myapi.${apex}`;
      } catch {
        /* keep placeholder */
      }
      lines.push(
        `# SPA (frontend) vs API (backend Dokploy Domains)`,
        `VITE_PMS_API_URL=${myapi}`,
        `PMS_API_URL=${myapi}`,
        `VITE_APP_URL=${withoutWww}`,
        `PUBLIC_APP_URL=${withoutWww}`,
        `PLATFORM_DNS_CNAME_TARGET=${withoutWww.replace(/^https:\/\//, "").replace(/\/+$/, "")}`,
      );
      if (checkin) {
        lines.push(`WEB_CHECKIN_PUBLIC_URL=${checkin}`, `WEB_CHECKIN_PUBLIC_HOST=${hosts[0] ?? ""}`);
        lines.push(`CORS_ORIGINS=${withoutWww},${checkin}`);
      }
    }
    if (hosts.length > 1) {
      lines.push(`WEB_CHECKIN_PUBLIC_HOSTS=${hosts.join(",")}`);
    }
    return lines.join("\n");
  }, [hosts, webCheckinBaseUrl]);

  if (!webCheckinBaseUrl.trim()) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(envBlock);
      toast.success("Variáveis copiadas — cole no Dokploy e redeploy");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 space-y-3">
      <p className="text-sm font-medium text-amber-950">Deploy do domínio check-in (evita 404 do Traefik)</p>
      <ol className="text-sm text-amber-900/90 list-decimal list-inside space-y-2">
        <li>
          Dokploy → projeto PMS → <strong>General</strong>: compose ={" "}
          <code className="text-xs">docker-compose.dokploy.yml</code>, branch <code className="text-xs">PMS-Backend</code>{" "}
          → <strong>Pull</strong> → <strong>Deploy</strong> (com cache limpo se o compose não atualizar).
        </li>
        <li>
          Cole as variáveis abaixo em <strong>Environment</strong> e faça <strong>Redeploy</strong>.
        </li>
        <li>
          <strong>Domains</strong> → <strong>Create Domain</strong> → host{" "}
          <code className="text-xs">{hosts[0] ?? "checkin.seudominio.com"}</code>, serviço{" "}
          <strong>frontend</strong>, porta <strong>80</strong>, HTTPS ON. (O PMS já está em outro domínio no mesmo{" "}
          <strong>frontend</strong>.)
        </li>
        <li>
          Super Admin: PMS = <code className="text-xs">{pmsBaseUrl.trim() || "URL Base do PMS"}</code>, check-in = URL
          pública acima.
        </li>
      </ol>
      <pre className="text-xs bg-white/80 border rounded p-2 overflow-x-auto whitespace-pre-wrap">{envBlock}</pre>
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        <Copy className="h-4 w-4 mr-2" />
        Copiar variáveis para o Dokploy
      </Button>
    </div>
  );
}