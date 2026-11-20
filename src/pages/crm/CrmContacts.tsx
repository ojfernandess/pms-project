import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, Plus } from "lucide-react";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { listCrmContacts, upsertCrmContact } from "@/lib/crm/crmApi";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { usePermissions } from "@/hooks/usePermissions";
import { CrmFeatureGate } from "@/components/crm/CrmFeatureGate";
import { formatCrmSource } from "@/lib/crm/crmLabels";

const CrmContacts = () => {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const companyId = selectedEstablishment?.company_id;
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const { canCreate } = usePermissions();
  const base = `/${establishmentId || selectedEstablishment?.numeric_id}`;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["crm-contacts", companyId, searchTerm, page],
    queryFn: () =>
      listCrmContacts({
        companyId: companyId!,
        q: searchTerm || undefined,
        page,
        pageSize: 25,
      }),
    enabled: !!companyId,
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 25))),
    [data],
  );

  const handleCreate = async () => {
    if (!companyId || !fullName.trim()) {
      toast.error("Informe o nome do contato");
      return;
    }
    try {
      await upsertCrmContact({
        companyId,
        fullName: fullName.trim(),
        email: email || null,
        phone: phone || null,
        establishmentId: selectedEstablishment?.id,
        source: "manual",
      });
      toast.success("Contato criado");
      setCreateOpen(false);
      setFullName("");
      setEmail("");
      setPhone("");
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar contato");
    }
  };

  return (
    <CrmFeatureGate>
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contatos CRM</h1>
          <p className="text-muted-foreground">Perfis unificados vinculados aos clientes do PMS</p>
        </div>
        {(canCreate("crm") || canCreate("crm_contacts")) && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo contato
          </Button>
        )}
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar nome, e-mail, telefone..."
            value={searchTerm}
            onChange={(e) => {
              setPage(1);
              setSearchTerm(e.target.value);
            }}
          />
        </div>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Clientes PMS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : !data?.items?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Nenhum contato encontrado
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <Link
                      className="font-medium text-primary hover:underline"
                      to={`${base}/crm/contatos/${contact.id}`}
                    >
                      {contact.full_name}
                    </Link>
                  </TableCell>
                  <TableCell>{contact.email || "—"}</TableCell>
                  <TableCell>{contact.phone || "—"}</TableCell>
                  <TableCell>{formatCrmSource(contact.source)}</TableCell>
                  <TableCell>{contact.client_links?.length ?? 0}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data?.total ?? 0} contato(s) · página {page}/{totalPages}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <Button
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo contato CRM</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Button onClick={handleCreate}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </CrmFeatureGate>
  );
};

export default CrmContacts;
