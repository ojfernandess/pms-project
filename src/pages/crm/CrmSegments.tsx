import { useState } from "react";
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
  createCrmSegment,
  listCrmSegments,
  previewCrmSegment,
} from "@/lib/crm/crmCampaigns";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const CrmSegments = () => {
  const { selectedEstablishment } = useEstablishment();
  const companyId = selectedEstablishment?.company_id;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hasEmail, setHasEmail] = useState(true);
  const [sourceIn, setSourceIn] = useState("");

  const { data: segments = [], isLoading } = useQuery({
    queryKey: ["crm-segments", companyId],
    queryFn: () => listCrmSegments(companyId!),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCrmSegment({
        companyId: companyId!,
        name: name.trim(),
        description: description.trim() || undefined,
        rules: {
          has_email: hasEmail || undefined,
          source_in: sourceIn
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => {
      toast.success("Segmento criado");
      setOpen(false);
      setName("");
      setDescription("");
      setSourceIn("");
      queryClient.invalidateQueries({ queryKey: ["crm-segments", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const preview = async (id: string) => {
    try {
      const res = await previewCrmSegment(id);
      toast.message(`Prévia: ${res.matched} contato(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na prévia");
    }
  };

  return (
    <CrmFeatureGate>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold">Segmentos</h1>
            <p className="text-muted-foreground">
              Regras para selecionar contatos em campanhas (opt-in marketing)
            </p>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo segmento
          </Button>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Regras</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : !segments.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    Nenhum segmento
                  </TableCell>
                </TableRow>
              ) : (
                segments.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.description || "—"}</TableCell>
                    <TableCell className="text-xs font-mono max-w-xs truncate">
                      {JSON.stringify(s.rules)}
                    </TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => preview(s.id)}>
                        Prévia
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo segmento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="has-email"
                type="checkbox"
                checked={hasEmail}
                onChange={(e) => setHasEmail(e.target.checked)}
              />
              <Label htmlFor="has-email">Exigir e-mail</Label>
            </div>
            <div className="space-y-2">
              <Label>Origens (separadas por vírgula)</Label>
              <Input
                placeholder="quote_staff, motor_abandon"
                value={sourceIn}
                onChange={(e) => setSourceIn(e.target.value)}
              />
            </div>
            <Button
              disabled={!name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </CrmFeatureGate>
  );
};

export default CrmSegments;
