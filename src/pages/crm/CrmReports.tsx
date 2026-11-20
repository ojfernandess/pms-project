import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CrmFeatureGate } from "@/components/crm/CrmFeatureGate";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import {
  downloadCsv,
  exportCrmReport,
  getCrmReportsDashboard,
} from "@/lib/crm/crmAdvanced";
import { toast } from "sonner";
import { BarChart3, Download } from "lucide-react";

const CrmReports = () => {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const companyId = selectedEstablishment?.company_id;
  const base = `/${establishmentId || selectedEstablishment?.numeric_id}`;

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["crm-reports", companyId, from, to, source],
    queryFn: () =>
      getCrmReportsDashboard(companyId!, {
        from: from || undefined,
        to: to || undefined,
        source: source || undefined,
      }),
    enabled: !!companyId,
  });

  const exportMutation = useMutation({
    mutationFn: (report: "leads_by_source" | "campaigns") =>
      exportCrmReport(companyId!, report),
    onSuccess: (res) => {
      downloadCsv(res.filename, res.csv);
      toast.success("CSV baixado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const s = data?.summary;

  return (
    <CrmFeatureGate>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Relatórios CRM</h1>
            <p className="text-muted-foreground">Indicadores comerciais com dados reais</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`${base}/crm`}>CRM</Link>
          </Button>
        </div>

        <Card className="p-4">
          <div className="grid gap-3 md:grid-cols-4 items-end">
            <div>
              <Label>De</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>Até</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <Label>Origem</Label>
              <Input
                placeholder="ex: motor, quote_staff"
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>
            <Button onClick={() => refetch()} disabled={isFetching}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </Card>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : s ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric title="Contatos" value={s.contactsTotal} sub={`+${s.contactsNew} no período`} />
              <Metric title="Leads / deals" value={s.leadsTotal} sub={`${s.opportunitiesOpen} abertos`} />
              <Metric
                title="Conversão"
                value={`${s.conversionRate}%`}
                sub={`${s.opportunitiesWon} ganhos / ${s.opportunitiesLost} perdidos`}
              />
              <Metric
                title="Receita ganha"
                value={s.wonAmount.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}
                sub={`Ticket médio ${s.averageWonTicket.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                })}`}
              />
              <Metric title="Pipeline" value={s.pipelineAmount.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })} />
              <Metric title="VIP" value={s.vipContacts} />
              <Metric title="Campanhas" value={s.campaignsTotal} />
              <Metric
                title="Automações ativas"
                value={s.automationsActive}
                sub={`B2B ${s.b2bCompanies} · Fidelidade ${s.loyaltyMembers}`}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-medium">Por origem</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={exportMutation.isPending}
                    onClick={() => exportMutation.mutate("leads_by_source")}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    CSV
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Origem</TableHead>
                      <TableHead>Qtd</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(s.bySource).map(([k, v]) => (
                      <TableRow key={k}>
                        <TableCell>{k}</TableCell>
                        <TableCell>{v}</TableCell>
                      </TableRow>
                    ))}
                    {!Object.keys(s.bySource).length ? (
                      <TableRow>
                        <TableCell colSpan={2} className="text-muted-foreground text-sm">
                          Sem dados
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-medium">Campanhas</h2>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={exportMutation.isPending}
                    onClick={() => exportMutation.mutate("campaigns")}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    CSV
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Canal</TableHead>
                      <TableHead>Recipients</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.campaigns || []).map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.channel}</TableCell>
                        <TableCell>{c.recipients}</TableCell>
                      </TableRow>
                    ))}
                    {!data?.campaigns?.length ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground text-sm">
                          Sem campanhas
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </>
        ) : null}
      </div>
    </CrmFeatureGate>
  );
};

function Metric({
  title,
  value,
  sub,
}: {
  title: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <Card className="p-4 space-y-1">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </Card>
  );
}

export default CrmReports;
