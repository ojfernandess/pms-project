import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronRight,
  ArrowLeft,
  ExternalLink,
  MessageCircle,
  Zap,
  Webhook,
  Play,
  BookOpen,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

const DOC_LINKS = {
  chatwootSelfHosted: "https://www.chatwoot.com/docs/self-hosted/deployment/docker",
  chatwootWhatsApp: "https://www.chatwoot.com/hc/user-guide/articles/1677832735-how-to-setup-a-whats_app-channel",
  chatwootWhatsAppEmbedded: "https://www.chatwoot.com/hc/user-guide/articles/1752129193-how-to-use-whatsapp-embedded-signup",
  evolutionApi: "https://doc.evolution-api.com/",
  evolutionChatwoot: "https://doc.evolution-api.com/v2/en/integrations/chatwoot",
  evolutionLogo: "https://evolution-api.com/files/evolution-api-favicon.png",
  whatsappCloud: "https://developers.facebook.com/docs/whatsapp/cloud-api/get-started",
  whatsappCloudApi: "https://developers.facebook.com/docs/whatsapp/cloud-api",
};

export default function HelpCheckinCharge() {
  const { establishmentId } = useParams();
  const [openSections, setOpenSections] = useState({
    chatwoot: true,
    chatwootEvolution: false,
    whatsappCloud: false,
    webhook: false,
  });

  const basePath = establishmentId ? `/${establishmentId}/cobranca-checkin` : "/cobranca-checkin";

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to={basePath}>
            <Button variant="ghost" size="sm" className="mb-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Ajuda: Mensagens & Cobranças</h1>
          <p className="text-muted-foreground mt-1">
            Guia passo a passo para configurar Chatwoot, Evolution API, WhatsApp Cloud API e Webhook.
          </p>
        </div>
      </div>

      <Card className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Escolha o canal de envio de mensagens e siga as instruções abaixo. O sistema suporta quatro integrações principais.
        </p>

        {/* Seção 1: Chatwoot */}
        <Collapsible
          open={openSections.chatwoot}
          onOpenChange={() => toggleSection("chatwoot")}
          className="border rounded-lg overflow-hidden"
        >
          <CollapsibleTrigger className="w-full px-4 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
                <MessageCircle className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">1. Chatwoot (instalação básica)</h3>
                <p className="text-sm text-muted-foreground">Plataforma de atendimento e central de mensagens</p>
              </div>
            </div>
            <ChevronRight
              className={`h-5 w-5 text-muted-foreground transition-transform ${openSections.chatwoot ? "rotate-90" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-2 space-y-4 border-t">
              <p className="text-sm text-muted-foreground">
                O Chatwoot é uma plataforma open-source de atendimento ao cliente. Você pode hospedá-lo na nuvem ou
                self-hosted (Docker).
              </p>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                  Instalar com Docker (recomendado)
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground pl-2">
                  <li>Instale Docker e Docker Compose no servidor (Ubuntu 20.04+).</li>
                  <li>Baixe os arquivos:
                    <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-x-auto">
{`wget -O .env https://raw.githubusercontent.com/chatwoot/chatwoot/develop/.env.example
wget -O docker-compose.yaml https://raw.githubusercontent.com/chatwoot/chatwoot/develop/docker-compose.production.yaml`}
                    </pre>
                  </li>
                  <li>Configure o <code className="px-1 py-0.5 bg-muted rounded">.env</code> (Redis, PostgreSQL, SMTP).</li>
                  <li>Prepare o banco: <code className="px-1 py-0.5 bg-muted rounded">docker compose run --rm rails bundle exec rails db:chatwoot_prepare</code></li>
                  <li>Inicie: <code className="px-1 py-0.5 bg-muted rounded">docker compose up -d</code></li>
                  <li>Configure Nginx ou proxy reverso para HTTPS (ex: chat.seudominio.com).</li>
                </ol>
                <a
                  href={DOC_LINKS.chatwootSelfHosted}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <BookOpen className="h-4 w-4" />
                  Documentação oficial
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                  Obter URL e token
                </h4>
                <p className="text-sm text-muted-foreground">
                  Após instalar, acesse seu Chatwoot. Em <strong>Configurações → Perfil → Access Token</strong> ou na API,
                  obtenha o token de um usuário admin. O <code className="px-1 py-0.5 bg-muted rounded">accountId</code> é o ID da conta
                  (geralmente 1 na primeira conta).
                </p>
              </div>

              <Separator />

              <p className="text-xs text-muted-foreground">
                Para conectar WhatsApp ao Chatwoot, você pode usar Evolution API (próxima seção) ou o fluxo oficial da Meta.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Seção 2: Chatwoot + Evolution API */}
        <Collapsible
          open={openSections.chatwootEvolution}
          onOpenChange={() => toggleSection("chatwootEvolution")}
          className="border rounded-lg overflow-hidden"
        >
          <CollapsibleTrigger className="w-full px-4 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <img
                  src={DOC_LINKS.evolutionLogo}
                  alt="Evolution API"
                  className="h-10 w-10 object-contain"
                />
                <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Zap className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold">2. Chatwoot + Evolution API</h3>
                <p className="text-sm text-muted-foreground">WhatsApp sem Meta: QR Code + Chatwoot</p>
              </div>
            </div>
            <ChevronRight
              className={`h-5 w-5 text-muted-foreground transition-transform ${openSections.chatwootEvolution ? "rotate-90" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-2 space-y-4 border-t">
              <p className="text-sm text-muted-foreground">
                A Evolution API conecta WhatsApp (via QR Code) ao Chatwoot. Você não precisa de conta Meta/WhatsApp Business
                para enviar mensagens.
              </p>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                  Instalar Evolution API
                </h4>
                <p className="text-sm text-muted-foreground">
                  Use Docker para subir a Evolution API. Consulte o repositório oficial no GitHub ou a documentação.
                </p>
                <a
                  href={DOC_LINKS.evolutionApi}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <BookOpen className="h-4 w-4" />
                  Documentação Evolution API
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                  Criar instância e conectar WhatsApp
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground pl-2">
                  <li>Crie uma instância via API: <code className="px-1 py-0.5 bg-muted rounded">POST /instance/create</code></li>
                  <li>Use <code className="px-1 py-0.5 bg-muted rounded">qrcode: true</code> para gerar QR Code.</li>
                  <li>Escaneie o QR Code com o WhatsApp no celular (apenas uma vez).</li>
                </ol>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
                  Configurar Chatwoot na Evolution
                </h4>
                <p className="text-sm text-muted-foreground">
                  Envie um POST para <code className="px-1 py-0.5 bg-muted rounded">{`/chatwoot/set/{{instance}}`}</code> com:
                </p>
                <pre className="p-3 bg-muted rounded-lg text-xs overflow-x-auto">
{`{
  "enabled": true,
  "accountId": "1",
  "token": "SEU_TOKEN_CHATWOOT",
  "url": "https://seu-chatwoot.com",
  "signMsg": true,
  "reopenConversation": true,
  "nameInbox": "evolution"
}`}
                </pre>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li><strong>accountId</strong>: ID da conta no Chatwoot (geralmente 1)</li>
                  <li><strong>token</strong>: Token de API de um usuário admin</li>
                  <li><strong>url</strong>: URL base do Chatwoot (sem barra no final)</li>
                </ul>
                <a
                  href={DOC_LINKS.evolutionChatwoot}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <BookOpen className="h-4 w-4" />
                  Guia de integração Chatwoot + Evolution
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">4</span>
                  Conectar ao PMS
                </h4>
                <p className="text-sm text-muted-foreground">
                  Em Mensagens & Cobranças → Configuração, preencha a URL da Evolution API e a chave (API Key). Em Chatwoot,
                  preencha a URL do Chatwoot e o token. O sistema enviará mensagens via Chatwoot (que usa a Evolution para WhatsApp).
                </p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Seção 3: WhatsApp Cloud API */}
        <Collapsible
          open={openSections.whatsappCloud}
          onOpenChange={() => toggleSection("whatsappCloud")}
          className="border rounded-lg overflow-hidden"
        >
          <CollapsibleTrigger className="w-full px-4 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#25D366]/10 ring-1 ring-[#25D366]/30">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="#25D366" aria-hidden>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold">3. WhatsApp Cloud API (Meta)</h3>
                <p className="text-sm text-muted-foreground">Integração oficial da Meta com templates aprovados</p>
              </div>
            </div>
            <ChevronRight
              className={`h-5 w-5 text-muted-foreground transition-transform ${openSections.whatsappCloud ? "rotate-90" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-2 space-y-4 border-t">
              <p className="text-sm text-muted-foreground">
                A WhatsApp Cloud API é a solução oficial da Meta. Exige conta Meta for Developers e templates de mensagem
                aprovados. Ideal para alto volume e conformidade.
              </p>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                  Criar conta e app
                </h4>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground pl-2">
                  <li>Acesse <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">developers.facebook.com</a> e crie uma conta.</li>
                  <li>Crie um app (ou use um existente) e adicione o produto WhatsApp.</li>
                  <li>Em WhatsApp → Configuração da API, você verá o <strong>Phone Number ID</strong> e <strong>WhatsApp Business Account ID (WABA)</strong>.</li>
                </ol>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                  Obter token de acesso
                </h4>
                <p className="text-sm text-muted-foreground">
                  Gere um token permanente (System User) em Configurações do app → Usuários do sistema. O token precisa
                  ter permissões para enviar mensagens WhatsApp.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
                  Configurar Webhook (opcional para envio)
                </h4>
                <p className="text-sm text-muted-foreground">
                  Para receber respostas e status de mensagens, configure um webhook em WhatsApp → Configuração. O endpoint
                  deve validar o token e responder a eventos.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">4</span>
                  Conectar ao PMS
                </h4>
                <p className="text-sm text-muted-foreground">
                  Em Mensagens & Cobranças → Configuração, selecione WhatsApp Cloud API e preencha: URL base da API
                  (geralmente https://graph.facebook.com/v18.0), Phone Number ID, WABA e o token de acesso. Crie e aprova
                  templates no Meta Business Manager.
                </p>
                <a
                  href={DOC_LINKS.whatsappCloud}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <Play className="h-4 w-4" />
                  Guia oficial: Get Started
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Seção 4: Webhook */}
        <Collapsible
          open={openSections.webhook}
          onOpenChange={() => toggleSection("webhook")}
          className="border rounded-lg overflow-hidden"
        >
          <CollapsibleTrigger className="w-full px-4 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors text-left">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Webhook className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">4. Webhook</h3>
                <p className="text-sm text-muted-foreground">Enviar mensagens para seu próprio endpoint</p>
              </div>
            </div>
            <ChevronRight
              className={`h-5 w-5 text-muted-foreground transition-transform ${openSections.webhook ? "rotate-90" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-2 space-y-4 border-t">
              <p className="text-sm text-muted-foreground">
                O webhook permite que você receba os dados da mensagem em um endpoint próprio e processe o envio com sua
                lógica (SMS, Telegram, sistema interno, etc.).
              </p>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                  Criar endpoint POST
                </h4>
                <p className="text-sm text-muted-foreground">
                  Seu servidor deve expor um endpoint que aceite requisições POST com o seguinte corpo:
                </p>
                <pre className="p-3 bg-muted rounded-lg text-xs overflow-x-auto">
{`{
  "to": "5511999999999",
  "message": "Olá João! Sua reserva está confirmada...",
  "reservation_id": "uuid-da-reserva",
  "channel": "checkin_reminder" | "payment_pending" | "checkout_reminder" | "manual"
}`}
                </pre>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                  Responder com 200
                </h4>
                <p className="text-sm text-muted-foreground">
                  O endpoint deve responder com status <code className="px-1 py-0.5 bg-muted rounded">200 OK</code> para confirmar o recebimento.
                  Caso contrário, o sistema pode tentar reenviar.
                </p>
              </div>

              <div className="space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
                  Conectar ao PMS
                </h4>
                <p className="text-sm text-muted-foreground">
                  Em Mensagens & Cobranças → Configuração, selecione Webhook e informe a URL completa do seu endpoint
                  (ex: https://api.seudominio.com/whatsapp/send).
                </p>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card className="p-6 bg-muted/30">
        <h4 className="font-semibold flex items-center gap-2 mb-3">
          <Play className="h-4 w-4" />
          Vídeos e tutoriais
        </h4>
        <ul className="space-y-2 text-sm mb-4">
          <li>
            <a href="https://www.youtube.com/watch?v=idLJ-7srodE" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              Evolution API — Instalação passo a passo (EasyPanel + n8n)
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            <a href="https://www.youtube.com/watch?v=hJSM32D1YHU" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              Evolution API e N8N no VPS (Dokploy)
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        </ul>

        <h4 className="font-semibold flex items-center gap-2 mb-2">
          <BookOpen className="h-4 w-4" />
          Documentação oficial
        </h4>
        <ul className="space-y-2 text-sm">
          <li>
            <a href={DOC_LINKS.chatwootSelfHosted} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              Chatwoot — Deploy com Docker
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            <a href={DOC_LINKS.chatwootWhatsApp} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              Chatwoot — Configurar canal WhatsApp
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            <a href={DOC_LINKS.chatwootWhatsAppEmbedded} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              Chatwoot — WhatsApp Embedded Signup
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            <a href={DOC_LINKS.evolutionChatwoot} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              Evolution API — Integração Chatwoot
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            <a href={DOC_LINKS.whatsappCloudApi} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
              Meta — WhatsApp Cloud API
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
        </ul>
      </Card>
    </div>
  );
}
