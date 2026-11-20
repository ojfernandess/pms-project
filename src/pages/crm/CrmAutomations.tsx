import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CrmFeatureGate } from "@/components/crm/CrmFeatureGate";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import {
  createCrmAutomationFromTemplate,
  listCrmAutomationRuns,
  listCrmAutomationTemplates,
  listCrmAutomations,
  setCrmAutomationActive,
} from "@/lib/crm/crmAutomations";
import { toast } from "sonner";
import { Plus, Workflow, Power } from "lucide-react";

const CrmAutomations = () => {
  const { establishmentId } = useParams<{ establishmentId?: string }>();
  const { selectedEstablishment } = useEstablishment();
  const companyId = selectedEstablishment?.company_id;
  const base = `/${establishmentId || selectedEstablishment?.numeric_id}`;
  const queryClient = useQueryClient();
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const { data: automations = [], isLoading } = useQuery({
    queryKey: ["crm-automations", companyId],
    queryFn: () => listCrmAutomations(companyId!),
    enabled: !!companyId,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["crm-automation-templates"],
    queryFn: () => listCrmAutomationTemplates(),
    enabled: templatesOpen,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["crm-automation-runs", companyId],
    queryFn: () => listCrmAutomationRuns(companyId!, 30),
    enabled: !!companyId,
  });

  const fromTemplateMutation = useMutation({
    mutationFn: (templateKey: string) =>
      createCrmAutomationFromTemplate({ companyId: companyId!, templateKey }),
    onSuccess: () => {
      toast.success("Automação criada a partir do template");
      setTemplatesOpen(false);
      queryClient.invalidateQueries({ queryKey: ["crm-automations", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      setCrmAutomationActive(id, isActive),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crm-automations", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <CrmFeatureGate>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Automações</h1>
            <p className="text-muted-foreground">
              Triggers, condições e ações — templates do sistema e histórico de runs
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`${base}/crm`}>CRM</Link>
            </Button>
            <Button onClick={() => setTemplatesOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              De template
            </Button>
          </div>
        </div>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4 text-muted-foreground">
            <Workflow className="h-4 w-4" />
            <span className="text-sm font-medium">Automações da empresa</span>
          </div>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : automations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma automação. Use um template do sistema para começar.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {automations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      {a.description ? (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {a.description}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{a.trigger_type}</code>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.template_key || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={a.is_active ? "default" : "secondary"}>
                        {a.is_active ? "ativa" : "pausada"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={toggleMutation.isPending}
                        onClick={() =>
                          toggleMutation.mutate({ id: a.id, isActive: !a.is_active })
                        }
                      >
                        <Power className="h-4 w-4 mr-1" />
                        {a.is_active ? "Pausar" : "Ativar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Runs recentes</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma execução ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Automação</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.automation?.name || r.automation_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{r.trigger_type}</code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "completed"
                            ? "default"
                            : r.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {r.status}
                      </Badge>
                      {r.error ? (
                        <span className="ml-2 text-xs text-destructive">{r.error}</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>

        <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Templates do sistema</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {templates.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t.description}
                    </div>
                    <code className="text-xs mt-1 block">{t.trigger_type}</code>
                  </div>
                  <Button
                    size="sm"
                    disabled={fromTemplateMutation.isPending}
                    onClick={() => fromTemplateMutation.mutate(t.template_key)}
                  >
                    Usar
                  </Button>
                </div>
              ))}
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Carregando templates…</p>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </CrmFeatureGate>
  );
};

export default CrmAutomations;
