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
import { listCrmB2bCompanies, upsertCrmB2bCompany } from "@/lib/crm/crmAdvanced";
import { toast } from "sonner";
import { Building2, Plus } from "lucide-react";

const PARTNER_TYPES = [
  { value: "corporate", label: "Corporativo" },
  { value: "agency", label: "Agência" },
  { value: "operator", label: "Operadora" },
  { value: "partner", label: "Parceiro" },
  { value: "event", label: "Eventos" },
];

const CrmCompanies = () => {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const companyId = selectedEstablishment?.company_id;
  const base = `/${establishmentId || selectedEstablishment?.numeric_id}`;
  const queryClient = useQueryClient();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [partnerType, setPartnerType] = useState("corporate");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [commercialOwner, setCommercialOwner] = useState("");
  const [notes, setNotes] = useState("");

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["crm-b2b", companyId, q],
    queryFn: () => listCrmB2bCompanies(companyId!, q || undefined),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      upsertCrmB2bCompany({
        companyId: companyId!,
        legalName: legalName.trim(),
        tradeName: tradeName || undefined,
        documentNumber: documentNumber || undefined,
        partnerType,
        email: email || undefined,
        phone: phone || undefined,
        commercialOwner: commercialOwner || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      toast.success("Empresa cadastrada");
      setOpen(false);
      setLegalName("");
      setTradeName("");
      setDocumentNumber("");
      setEmail("");
      setPhone("");
      setCommercialOwner("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["crm-b2b", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CrmFeatureGate>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Empresas & Parceiros</h1>
            <p className="text-muted-foreground">CRM B2B — agências, corporativo e operadores</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`${base}/crm`}>CRM</Link>
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova empresa
            </Button>
          </div>
        </div>

        <div className="flex gap-2 max-w-md">
          <Input
            placeholder="Buscar razão social, fantasia ou CNPJ…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4 text-muted-foreground">
            <Building2 className="h-4 w-4" />
            <span className="text-sm font-medium">{companies.length} empresas</span>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma empresa cadastrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Responsável</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.trade_name || c.legal_name}</div>
                      {c.trade_name ? (
                        <div className="text-xs text-muted-foreground">{c.legal_name}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.partner_type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{c.document_number || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {c.email || c.phone || "—"}
                      {c.contacts?.length ? (
                        <div className="text-xs text-muted-foreground">
                          {c.contacts.length} contato(s) vinculados
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{c.commercial_owner || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nova empresa / parceiro</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Razão social</Label>
                <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
              </div>
              <div>
                <Label>Nome fantasia</Label>
                <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>CNPJ</Label>
                  <Input
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Tipo</Label>
                  <Select value={partnerType} onValueChange={setPartnerType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PARTNER_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>E-mail</Label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
              </div>
              <div>
                <Label>Responsável comercial</Label>
                <Input
                  value={commercialOwner}
                  onChange={(e) => setCommercialOwner(e.target.value)}
                />
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
              </div>
              <Button
                className="w-full"
                disabled={!legalName.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                Salvar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </CrmFeatureGate>
  );
};

export default CrmCompanies;
