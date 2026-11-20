import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Edit, Eye, Loader2, Mail, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { extractVariables } from "@/lib/emailTemplateEngine";
import { EMAIL_TEMPLATE_VARIABLES } from "@/lib/emailTemplateConstants";
import {
  useEstablishmentEmailTemplates,
  type EstablishmentEmailTemplateView,
} from "@/hooks/useEstablishmentEmailTemplates";

type EstablishmentEmailTemplatesManagerProps = {
  establishmentId: string;
};

export function EstablishmentEmailTemplatesManager({
  establishmentId,
}: EstablishmentEmailTemplatesManagerProps) {
  const { templates, isLoading, saveOverride, resetToDefault, setTemplateEnabled } =
    useEstablishmentEmailTemplates(establishmentId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [selected, setSelected] = useState<EstablishmentEmailTemplateView | null>(null);

  const [formData, setFormData] = useState({
    subject: "",
    body_html: "",
    body_text: "",
    primary_color: "#4F46E5",
    footer_text: "",
    logo_url: "",
    cc_emails: "",
    bcc_emails: "",
  });

  const availableTemplates = useMemo(
    () => templates.filter((item) => item.globalTemplate),
    [templates],
  );

  const openEditor = (item: EstablishmentEmailTemplateView) => {
    const source = item.isCustomized && item.override
      ? item.override
      : item.globalTemplate;

    setSelected(item);
    setFormData({
      subject: String(source?.subject || ""),
      body_html: String(source?.body_html || ""),
      body_text: String(source?.body_text || ""),
      primary_color: String(source?.primary_color || "#4F46E5"),
      footer_text: String(source?.footer_text || ""),
      logo_url: String(source?.logo_url || ""),
      cc_emails: String(source?.cc_emails || ""),
      bcc_emails: String(source?.bcc_emails || ""),
    });
    setDialogOpen(true);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected?.globalTemplate) return;

    const variables = extractVariables(`${formData.body_html} ${formData.subject}`);
    await saveOverride.mutateAsync({
      establishment_id: establishmentId,
      event_type: selected.event_type,
      parent_template_id: String(selected.globalTemplate.id || ""),
      use_custom_template: true,
      name: String(selected.globalTemplate.name || selected.event_label),
      subject: formData.subject,
      body_html: formData.body_html,
      body_text: formData.body_text,
      variables,
      logo_url: formData.logo_url || undefined,
      primary_color: formData.primary_color || undefined,
      footer_text: formData.footer_text || undefined,
      cc_emails: formData.cc_emails || undefined,
      bcc_emails: formData.bcc_emails || undefined,
    });
    setDialogOpen(false);
  };

  const handleReset = async () => {
    if (!selected) return;
    await resetToDefault.mutateAsync({ event_type: selected.event_type });
    setResetDialogOpen(false);
    setDialogOpen(false);
    setSelected(null);
  };

  if (isLoading) {
    return (
      <Card className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando templates de e-mail...
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Templates de E-mail
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Personalize os e-mails automáticos do seu hotel. Use o interruptor para ativar ou
          desativar o envio de cada template. Os padrões do sistema podem ser restaurados a qualquer
          momento.
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Evento</TableHead>
              <TableHead>Assunto</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="w-[120px]">Ativo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {availableTemplates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum template padrão disponível para este estabelecimento.
                </TableCell>
              </TableRow>
            ) : (
              availableTemplates.map((item) => (
                <TableRow key={item.event_type} className={!item.isEnabled ? "opacity-60" : undefined}>
                  <TableCell>
                    <div className="font-medium">{item.event_label}</div>
                    <div className="text-xs text-muted-foreground">{item.event_type}</div>
                  </TableCell>
                  <TableCell className="max-w-md truncate">
                    {String(
                      item.resolved?.subject ||
                        item.override?.subject ||
                        item.globalTemplate?.subject ||
                        "—",
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={item.isCustomized ? "default" : "secondary"}>
                        {item.isCustomized ? "Personalizado" : "Padrão do sistema"}
                      </Badge>
                      {!item.isEnabled && (
                        <Badge variant="outline" className="text-muted-foreground">
                          Desativado
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={item.isEnabled}
                        disabled={setTemplateEnabled.isPending}
                        onCheckedChange={(checked) => {
                          void setTemplateEnabled.mutateAsync({
                            event_type: item.event_type,
                            enabled: checked,
                            globalTemplate: item.globalTemplate,
                            existingOverride: item.override,
                          });
                        }}
                        aria-label={`${item.isEnabled ? "Desativar" : "Ativar"} ${item.event_label}`}
                      />
                      <span className="text-xs text-muted-foreground">
                        {item.isEnabled ? "Sim" : "Não"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelected(item);
                          setPreviewOpen(true);
                        }}
                        title="Visualizar"
                        disabled={!item.isEnabled && !item.isCustomized}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditor(item)}
                        title="Personalizar"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {item.isCustomized && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelected(item);
                            setResetDialogOpen(true);
                          }}
                          title="Restaurar padrão"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4">
        <h3 className="font-medium mb-3">Variáveis disponíveis</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {EMAIL_TEMPLATE_VARIABLES.map((variable) => (
            <div key={variable.name} className="rounded-md border px-3 py-2 text-sm">
              <code className="text-xs font-semibold">{`{{${variable.name}}}`}</code>
              <p className="text-muted-foreground text-xs mt-1">{variable.description}</p>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Personalizar: {selected?.event_label}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label htmlFor="subject">Assunto *</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="body_html">Corpo HTML *</Label>
              <Textarea
                id="body_html"
                value={formData.body_html}
                onChange={(e) => setFormData({ ...formData, body_html: e.target.value })}
                required
                rows={16}
                className="font-mono text-sm"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="primary_color">Cor primária</Label>
                <Input
                  id="primary_color"
                  value={formData.primary_color}
                  onChange={(e) => setFormData({ ...formData, primary_color: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="logo_url">URL do logo</Label>
                <Input
                  id="logo_url"
                  value={formData.logo_url}
                  onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="footer_text">Rodapé</Label>
              <Textarea
                id="footer_text"
                value={formData.footer_text}
                onChange={(e) => setFormData({ ...formData, footer_text: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="cc_emails">CC</Label>
                <Input
                  id="cc_emails"
                  value={formData.cc_emails}
                  onChange={(e) => setFormData({ ...formData, cc_emails: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="bcc_emails">BCC</Label>
                <Input
                  id="bcc_emails"
                  value={formData.bcc_emails}
                  onChange={(e) => setFormData({ ...formData, bcc_emails: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSelected(selected);
                  setResetDialogOpen(true);
                }}
                disabled={!selected?.isCustomized || resetToDefault.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Restaurar padrão
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saveOverride.isPending}>
                  {saveOverride.isPending ? "Salvando..." : "Salvar personalização"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview: {selected?.event_label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!selected?.isEnabled && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Este template está desativado — o e-mail não será enviado automaticamente.
              </p>
            )}
            <div>
              <Label>Assunto</Label>
              <p className="text-sm mt-1">
                {String(
                  selected?.resolved?.subject ||
                    selected?.override?.subject ||
                    selected?.globalTemplate?.subject ||
                    "—",
                )}
              </p>
            </div>
            <div>
              <Label>HTML</Label>
              <div
                className="mt-2 rounded-md border p-4 bg-white prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: String(
                    selected?.resolved?.body_html ||
                      selected?.override?.body_html ||
                      selected?.globalTemplate?.body_html ||
                      "<p>Sem conteúdo</p>",
                  ),
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar template padrão?</AlertDialogTitle>
            <AlertDialogDescription>
              A personalização de <strong>{selected?.event_label}</strong> será removida e o
              estabelecimento voltará a usar o template padrão configurado no super admin.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} disabled={resetToDefault.isPending}>
              {resetToDefault.isPending ? "Restaurando..." : "Restaurar padrão"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
