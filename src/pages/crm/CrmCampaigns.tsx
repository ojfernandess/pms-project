import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CrmFeatureGate } from "@/components/crm/CrmFeatureGate";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import {
  buildCrmCampaignRecipients,
  createCrmCampaign,
  enqueueCrmCampaign,
  getCrmCampaign,
  listCrmCampaigns,
  listCrmSegments,
} from "@/lib/crm/crmCampaigns";
import { toast } from "sonner";
import { Plus, Send, Users } from "lucide-react";

const CrmCampaigns = () => {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const companyId = selectedEstablishment?.company_id;
  const base = `/${establishmentId || selectedEstablishment?.numeric_id}`;
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [channel, setChannel] = useState("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [segmentId, setSegmentId] = useState<string>("");

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["crm-campaigns", companyId],
    queryFn: () => listCrmCampaigns(companyId!),
    enabled: !!companyId,
  });

  const { data: segments = [] } = useQuery({
    queryKey: ["crm-segments", companyId],
    queryFn: () => listCrmSegments(companyId!),
    enabled: !!companyId,
  });

  const { data: detail } = useQuery({
    queryKey: ["crm-campaign-detail", detailId],
    queryFn: () => getCrmCampaign(detailId!),
    enabled: !!detailId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCrmCampaign({
        companyId: companyId!,
        name: name.trim(),
        channel,
        subject: subject || undefined,
        body,
        segmentId: segmentId || undefined,
      }),
    onSuccess: () => {
      toast.success("Campanha criada");
      setOpen(false);
      setName("");
      setSubject("");
      setBody("");
      setSegmentId("");
      queryClient.invalidateQueries({ queryKey: ["crm-campaigns", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const buildMutation = useMutation({
    mutationFn: (id: string) => buildCrmCampaignRecipients(id),
    onSuccess: (res) => {
      toast.success(`Recipients: ${res.pending} prontos, ${res.skipped} pulados (consent/endereço)`);
      queryClient.invalidateQueries({ queryKey: ["crm-campaigns", companyId] });
      queryClient.invalidateQueries({ queryKey: ["crm-campaign-detail", detailId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enqueueMutation = useMutation({
    mutationFn: (id: string) => enqueueCrmCampaign(id),
    onSuccess: (res) => {
      toast.success(`Campanha enfileirada (${res.pendingCount} envios)`);
      queryClient.invalidateQueries({ queryKey: ["crm-campaigns", companyId] });
      queryClient.invalidateQueries({ queryKey: ["crm-campaign-detail", detailId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CrmFeatureGate>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Campanhas</h1>
            <p className="text-muted-foreground">
              Segmentos + consentimento marketing; fila BullMQ <code>crm</code>
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to={`${base}/crm/segmentos`}>Segmentos</Link>
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova campanha
            </Button>
          </div>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : !campaigns.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    Nenhuma campanha
                  </TableCell>
                </TableRow>
              ) : (
                campaigns.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.channel}</TableCell>
                    <TableCell>{c.segment?.name || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.status}</Badge>
                    </TableCell>
                    <TableCell className="space-x-2">
                      <Button variant="outline" size="sm" onClick={() => setDetailId(c.id)}>
                        Detalhe
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => buildMutation.mutate(c.id)}
                      >
                        <Users className="h-3.5 w-3.5 mr-1" />
                        Recipients
                      </Button>
                      <Button size="sm" onClick={() => enqueueMutation.mutate(c.id)}>
                        <Send className="h-3.5 w-3.5 mr-1" />
                        Enfileirar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Canal</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="sms">SMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Segmento</Label>
              <Select value={segmentId || "none"} onValueChange={(v) => setSegmentId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Todos (com consentimento)</SelectItem>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {channel === "email" && (
              <div className="space-y-2">
                <Label>Assunto</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
            </div>
            <Button
              disabled={!name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Salvar rascunho
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{(detail as any)?.name || "Campanha"}</DialogTitle>
          </DialogHeader>
          {(detail as any)?.recipients ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contato</TableHead>
                  <TableHead>Endereço</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detail as any).recipients.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.crm_contact?.full_name || r.crm_contact_id}</TableCell>
                    <TableCell className="font-mono text-xs">{r.address || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.status}</Badge>
                      {r.skip_reason && (
                        <span className="text-[10px] text-muted-foreground ml-2">{r.skip_reason}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Sem recipients ainda — use “Recipients”.</p>
          )}
        </DialogContent>
      </Dialog>
    </CrmFeatureGate>
  );
};

export default CrmCampaigns;
