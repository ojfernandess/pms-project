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
      <PopoverContent className="max-w-md max-h-[min(70vh,520px)] overflow-y-auto text-sm" align="start">
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="font-semibold text-foreground">O que informar aqui</p>
            <p className="text-muted-foreground">
              Apenas o domínio (URL base), <strong>sem</strong> o localizador da reserva. Exemplo:{" "}
              <code className="text-xs">https://checkin.seudominio.com</code>. O sistema gera links como{" "}
              <code className="text-xs">https://checkin.seudominio.com/RSV154684</code> para o hóspede.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-foreground">Visão geral do DNS</p>
            <p className="text-muted-foreground">
              Crie um subdomínio (ex. <code className="text-xs">checkin</code>) apontando para o{" "}
              <strong>mesmo servidor ou serviço</strong> que publica o frontend do PMS, com HTTPS válido.
              No painel de hospedagem, adicione esse domínio como <strong>domínio personalizado</strong> do
              frontend (além do domínio principal do PMS).
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-foreground">Cloudflare</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Acesse o site → <strong>DNS</strong> → <strong>Records</strong>.</li>
              <li>
                <strong>CNAME</strong> (recomendado): nome <code className="text-xs">checkin</code>, destino o
                hostname do seu frontend (ex. o domínio principal do app ou o host fornecido pela hospedagem).
              </li>
              <li>
                Ou <strong>A</strong>: mesmo nome, IP público do servidor — se o provedor exigir IP fixo.
              </li>
              <li>Ative <strong>Proxied</strong> (nuvem laranja) se quiser CDN/WAF; o SSL pode ser Full (strict) com certificado válido na origem.</li>
              <li>Aguarde a propagação (minutos a algumas horas) e teste <code className="text-xs">https://checkin.seudominio.com</code>.</li>
            </ol>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-foreground">Registro.br / NIC.br</p>
            <p className="text-muted-foreground">
              Em <strong>DNS</strong> do domínio, crie entrada <strong>CNAME</strong>: host{" "}
              <code className="text-xs">checkin</code> → alvo informado pela sua hospedagem. Salve e aguarde
              propagação (TTL do registro).
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-foreground">GoDaddy, Hostinger, Locaweb e outros</p>
            <p className="text-muted-foreground">
              No gerenciador de DNS, adicione <strong>CNAME</strong> ou <strong>A</strong> para o subdomínio{" "}
              <code className="text-xs">checkin</code> conforme a documentação do seu plano. Depois vincule o
              domínio no painel onde o frontend do PMS está publicado e emita/renove o certificado SSL.
            </p>
          </div>

          <div className="space-y-1">
            <p className="font-semibold text-foreground">Teste</p>
            <p className="text-muted-foreground">
              Após salvar esta configuração e propagar o DNS, abra um link de teste com um localizador real. Se
              abrir o fluxo de check-in, o domínio está correto.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}