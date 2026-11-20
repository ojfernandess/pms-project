import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { addCrmActivity, getCrmContact360 } from "@/lib/crm/crmApi";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { ArrowLeft, MessagesSquare } from "lucide-react";
import { toast } from "sonner";
import { CrmFeatureGate } from "@/components/crm/CrmFeatureGate";
import { buildCrmCentralPath } from "@/lib/crm/crmCentral";
import { upsertCrmConsent } from "@/lib/crm/crmCampaigns";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CrmContact360 = () => {
  const { contactId, establishmentId } = useParams<{
    contactId: string;
    establishmentId?: string;
  }>();
  const { selectedEstablishment } = useEstablishment();
  const base = `/${establishmentId || selectedEstablishment?.numeric_id}`;
  const [note, setNote] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["crm-contact-360", contactId],
    queryFn: () => getCrmContact360(contactId!),
    enabled: !!contactId,
  });

  const saveNote = async () => {
    if (!contactId || !note.trim()) return;
    try {
      await addCrmActivity(contactId, {
        activityType: "note",
        subject: "Nota",
        body: note.trim(),
      });
      setNote("");
      toast.success("Nota adicionada");
      queryClient.invalidateQueries({ queryKey: ["crm-contact-360", contactId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar nota");
    }
  };

  if (isLoading) {
    return <p className="text-muted-foreground">Carregando perfil 360...</p>;
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link to={`${base}/crm/contatos`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Link>
        </Button>
        <p className="text-destructive">
          {error instanceof Error ? error.message : "Contato não encontrado"}
        </p>
      </div>
    );
  }

  const { contact, reservations, quotes, indicators } = data;

  return (
    <CrmFeatureGate>
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Button asChild variant="ghost" className="px-0 h-auto mb-1">
            <Link to={`${base}/crm/contatos`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Contatos
            </Link>
          </Button>
          <h1 className="text-3xl font-bold text-foreground">{contact.full_name}</h1>
          <p className="text-muted-foreground">
            {[contact.email, contact.phone].filter(Boolean).join(" · ") || "Sem contato"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Button asChild variant="outline" size="sm">
            <Link
              to={buildCrmCentralPath(establishmentId || selectedEstablishment?.numeric_id || "", {
                contactId: contact.id,
              })}
            >
              <MessagesSquare className="h-4 w-4 mr-2" />
              Abrir na Central
            </Link>
          </Button>
          <div className="grid grid-cols-3 gap-3">
            <Card className="p-3 min-w-[110px]">
              <p className="text-xs text-muted-foreground">LTV</p>
              <p className="text-lg font-semibold">{money(indicators.ltv)}</p>
            </Card>
            <Card className="p-3 min-w-[110px]">
              <p className="text-xs text-muted-foreground">Estadias</p>
              <p className="text-lg font-semibold">{indicators.stayCount}</p>
            </Card>
            <Card className="p-3 min-w-[110px]">
              <p className="text-xs text-muted-foreground">Ticket médio</p>
              <p className="text-lg font-semibold">{money(indicators.averageTicket)}</p>
            </Card>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="stays">Hospedagens</TabsTrigger>
          <TabsTrigger value="commercial">Comercial</TabsTrigger>
          <TabsTrigger value="interactions">Interações</TabsTrigger>
          <TabsTrigger value="consent">Preferências</TabsTrigger>
          <TabsTrigger value="indicators">Indicadores</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="p-4 grid gap-2 md:grid-cols-2 text-sm">
            <div>
              <p className="text-muted-foreground">Documento</p>
              <p>
                {contact.document_type || "—"} {contact.document_number || ""}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Origem</p>
              <p>{contact.source || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Classificação</p>
              <p>{contact.classification || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Clientes PMS vinculados</p>
              <p>{data.linkedClientIds.length}</p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="stays">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!reservations.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Sem reservas vinculadas
                    </TableCell>
                  </TableRow>
                ) : (
                  reservations.map((r) => (
                    <TableRow key={String(r.id)}>
                      <TableCell>
                        {r.reservation_code ? (
                          <Link
                            className="text-primary hover:underline"
                            to={`${base}/reservas/${r.reservation_code}`}
                          >
                            {String(r.reservation_code)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{String(r.checkin_date || "—")}</TableCell>
                      <TableCell>{String(r.checkout_date || "—")}</TableCell>
                      <TableCell>{String(r.status || "—")}</TableCell>
                      <TableCell>{money(Number(r.total_amount || 0))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="commercial">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Orçamento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!quotes.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Sem orçamentos vinculados
                    </TableCell>
                  </TableRow>
                ) : (
                  quotes.map((q) => (
                    <TableRow key={String(q.id)}>
                      <TableCell>{String(q.quote_code || q.id)}</TableCell>
                      <TableCell>{String(q.status || "—")}</TableCell>
                      <TableCell>{String(q.checkin_date || "—")}</TableCell>
                      <TableCell>{money(Number(q.total_amount || 0))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="interactions" className="space-y-4">
          <Card className="p-4 space-y-3">
            <Textarea
              placeholder="Adicionar nota..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button onClick={saveNote} disabled={!note.trim()}>
              Salvar nota
            </Button>
          </Card>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Conteúdo</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!(contact.activities || []).length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground">
                      Sem interações
                    </TableCell>
                  </TableRow>
                ) : (
                  (contact.activities || []).map((a: Record<string, unknown>) => (
                    <TableRow key={String(a.id)}>
                      <TableCell>{String(a.activity_type || "—")}</TableCell>
                      <TableCell>{String(a.subject || "—")}</TableCell>
                      <TableCell className="max-w-md truncate">{String(a.body || "—")}</TableCell>
                      <TableCell>
                        {a.created_at
                          ? new Date(String(a.created_at)).toLocaleString("pt-BR")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="consent" className="space-y-4">
          <Card className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Campanhas (etapa 4) só enviam com opt-in de marketing no canal.
            </p>
            {(["email", "whatsapp", "sms"] as const).map((channel) => {
              const row = (contact.consents || []).find(
                (c: Record<string, unknown>) =>
                  String(c.channel) === channel && String(c.purpose) === "marketing",
              );
              const granted = Boolean(row?.granted);
              return (
                <div key={channel} className="flex items-center justify-between gap-4">
                  <Label className="capitalize">{channel} · marketing</Label>
                  <Switch
                    checked={granted}
                    onCheckedChange={async (v) => {
                      try {
                        await upsertCrmConsent(contact.id, channel, v);
                        toast.success("Consentimento atualizado");
                        queryClient.invalidateQueries({
                          queryKey: ["crm-contact-360", contactId],
                        });
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Erro ao salvar");
                      }
                    }}
                  />
                </div>
              );
            })}
          </Card>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Finalidade</TableHead>
                  <TableHead>Consentimento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!(contact.consents || []).length ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      Sem registros de consentimento
                    </TableCell>
                  </TableRow>
                ) : (
                  (contact.consents || []).map((c: Record<string, unknown>) => (
                    <TableRow key={String(c.id)}>
                      <TableCell>{String(c.channel)}</TableCell>
                      <TableCell>{String(c.purpose)}</TableCell>
                      <TableCell>{c.granted ? "Sim" : "Não"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="indicators">
          <Card className="p-4 space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">LTV: </span>
              {money(indicators.ltv)}
            </p>
            <p>
              <span className="text-muted-foreground">Estadias elegíveis: </span>
              {indicators.stayCount}
            </p>
            <p>
              <span className="text-muted-foreground">Ticket médio: </span>
              {money(indicators.averageTicket)}
            </p>
            <p className="text-muted-foreground">
              Calculado a partir das reservas PMS vinculadas (exclui canceladas / no-show / draft).
            </p>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </CrmFeatureGate>
  );
};

export default CrmContact360;
