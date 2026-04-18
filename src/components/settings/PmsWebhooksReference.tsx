import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Copy, Webhook } from "lucide-react";

type WebhookRow = {
  id: string;
  label: string;
  path: string;
  method: string;
  description: string;
};

/** Endpoints HTTPS expostos pelo projeto Supabase para sistemas externos (Stripe, Channex, Aiosell, etc.). */
const PMS_INBOUND_WEBHOOKS: WebhookRow[] = [
  {
    id: "stripe-webhook",
    label: "Stripe",
    path: "/functions/v1/stripe-webhook",
    method: "POST",
    description:
      "Eventos de pagamento (payment_intent, charge, etc.). No Stripe Dashboard → Webhooks, use esta URL e o signing secret nas secrets da Edge Function.",
  },
  {
    id: "channex-reservation-webhook",
    label: "Channex · reservas",
    path: "/functions/v1/channex-reservation-webhook",
    method: "POST",
    description:
      "Eventos de reserva/revisão do Channel Manager Channex. Configure a URL no painel Channex (webhooks) para o property ligado ao canal.",
  },
  {
    id: "aiosell-reservation-webhook",
    label: "Aiosell · reservas",
    path: "/functions/v1/aiosell-reservation-webhook",
    method: "POST",
    description:
      "Eventos de reserva do Aiosell, quando o canal usa este conector.",
  },
];

export function PmsWebhooksReference() {
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");

  const copy = async (fullUrl: string) => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success("URL copiada");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  if (!base) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Defina <code className="rounded bg-amber-100 px-1">VITE_SUPABASE_URL</code> no ambiente para
        mostrar as URLs completas.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Webhook className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
        <div>
          <h4 className="font-semibold text-foreground">Webhooks do PMS (Supabase Edge Functions)</h4>
          <p className="text-sm text-muted-foreground mt-1">
            Use a base do seu projeto (<span className="font-mono text-xs break-all">{base}</span>) +
            o caminho abaixo. Estes endpoints recebem <strong>POST</strong> dos serviços externos — não
            exponha chaves no navegador; segredos ficam em Supabase Secrets / painel do provedor.
          </p>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[160px]">Integração</TableHead>
              <TableHead>URL completa</TableHead>
              <TableHead className="w-[90px] text-center">Copiar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {PMS_INBOUND_WEBHOOKS.map((row) => {
              const fullUrl = `${base}${row.path}`;
              return (
                <TableRow key={row.id}>
                  <TableCell className="align-top font-medium">{row.label}</TableCell>
                  <TableCell className="align-top">
                    <code className="text-xs break-all block bg-muted/50 rounded px-2 py-1.5">{fullUrl}</code>
                    <p className="text-xs text-muted-foreground mt-2">{row.description}</p>
                  </TableCell>
                  <TableCell className="align-top text-center">
                    <Button type="button" variant="outline" size="sm" onClick={() => copy(fullUrl)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Outras funções (ex.: <code className="rounded bg-muted px-1">channex-reservations-sync</code>,{" "}
        <code className="rounded bg-muted px-1">stripe-payment</code>) são chamadas pelo próprio PMS ou por
        cron — não costumam ser registadas como URL de webhook no Channex/Stripe.
      </p>
    </div>
  );
}
