import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function WebCheckinDomainHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Como configurar o domínio do Web Check-in"
        >
          <CircleHelp className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-lg max-h-[min(75vh,560px)] overflow-y-auto text-sm" align="start">
        <div className="space-y-4">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-950">
            <p className="font-semibold">Não use caminho no DNS</p>
            <p className="mt-1 text-muted-foreground text-red-900/90">
              O destino do CNAME é <strong>só o hostname</strong>, por exemplo{" "}
              <code className="text-xs">pms.stayos.com.br</code>. Valores como{" "}
              <code className="text-xs">pms.stayos.com.br/web-checkin</code> são inválidos (Cloudflare 1016 ou
              aviso de barra no nome). O localizador (<code className="text-xs">RSV154684</code>) entra só no link
              gerado pelo sistema: <code className="text-xs">https://checkin.seudominio.com/RSV154684</code>.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-foreground">Passo 1 — Super Admin</p>
            <p className="text-muted-foreground">
              Campo <strong>URL pública do Web Check-in</strong>: <code className="text-xs">https://checkin.seudominio.com</code>{" "}
              (sem código de reserva no final).
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-foreground">Passo 2 — Hospedagem (evita 404)</p>
            <p className="text-muted-foreground">
              No painel onde o <strong>frontend do PMS</strong> está publicado, adicione{" "}
              <code className="text-xs">checkin.seudominio.com</code> como <strong>domínio extra</strong> no mesmo
              serviço de <code className="text-xs">pms.seudominio.com</code>, com HTTPS. Sem isso, A ou CNAME
              corretos ainda retornam <strong>404 page not found</strong> (proxy não reconhece o host).
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-semibold text-foreground">Passo 3 — Cloudflare (escolha uma)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-1">Tipo</th>
                    <th className="text-left p-1">Nome</th>
                    <th className="text-left p-1">Destino</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="p-1 font-medium text-foreground">CNAME</td>
                    <td className="p-1">checkin</td>
                    <td className="p-1">
                      <code>pms.stayos.com.br</code> (somente isso)
                    </td>
                  </tr>
                  <tr>
                    <td className="p-1 font-medium text-foreground">A</td>
                    <td className="p-1">checkin</td>
                    <td className="p-1">mesmo IP do registro A de <code>pms</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-muted-foreground">
              Proxy (nuvem laranja): ok se o SSL da origem estiver válido. Erro <strong>1016</strong>: confira destino
              sem barra, propagação DNS e domínio cadastrado na hospedagem.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-foreground">Registro.br / GoDaddy / Hostinger</p>
            <p className="text-muted-foreground">
              Mesma lógica: CNAME <code className="text-xs">checkin</code> → hostname do PMS, ou A → mesmo IP. Depois
              vincule o subdomínio no frontend e no Super Admin.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-foreground">Variável opcional no frontend</p>
            <p className="text-muted-foreground">
              <code className="text-xs">WEB_CHECKIN_PUBLIC_HOST=checkin.seudominio.com</code> no container do frontend
              ajuda a reconhecer o domínio antes das configurações do site carregarem. Se a API for outro host, no
              backend use <code className="text-xs">WEB_CHECKIN_PUBLIC_URL=https://checkin.seudominio.com</code> ou{" "}
              <code className="text-xs">CORS_ORIGINS</code>.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-foreground">Teste</p>
            <p className="text-muted-foreground">
              Abra <code className="text-xs">https://checkin.seudominio.com</code> — deve aparecer o Web Check-in, não
              o login do PMS. Documentação: <code className="text-xs">docs/WEB_CHECKIN_CUSTOM_DOMAIN.md</code> no
              repositório.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}