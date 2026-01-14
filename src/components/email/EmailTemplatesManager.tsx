import { useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useEmailTemplates } from "@/hooks/useEmailTemplates";
import { extractVariables } from "@/lib/emailTemplateEngine";
import { Plus, Edit, Trash2, Mail, Eye, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useEstablishments } from "@/hooks/useEstablishments";
import { useCompanies } from "@/hooks/useCompanies";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
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

export function EmailTemplatesManager() {
  const {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    sendTestEmail,
  } = useEmailTemplates();
  
  const { establishments } = useEstablishments();
  const { companies } = useCompanies();
  const { settings: siteSettings } = useSiteSettings();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [testEmailDialogOpen, setTestEmailDialogOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  const [selectedEstablishmentIds, setSelectedEstablishmentIds] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    name: "",
    event_type: "reservation.created" as any,
    subject: "",
    body_html: "",
    body_text: "",
    is_active: true,
    primary_color: "#4F46E5",
    footer_text: "",
    logo_url: "",
    cc_emails: "",
    bcc_emails: "",
    establishment_ids: [] as string[],
  });

  const eventTypes = [
    { value: "reservation.created", label: "Reserva Criada" },
    { value: "reservation.imported", label: "Reserva Importada" },
    { value: "reservation.cancelled", label: "Reserva Cancelada" },
    { value: "reservation.overbooking", label: "Overbooking Detectado" },
    { value: "reservation.extended", label: "Extensão de Reserva" },
    { value: "reservation.modified", label: "Alteração de Reserva" },
    { value: "preregistration.expired", label: "Pré-reserva Cancelada por Expiração" },
    { value: "payment.confirmed", label: "Pagamento Confirmado" },
    { value: "payment.pending", label: "Pagamento Pendente" },
    { value: "checkin.confirmed", label: "Check-in Confirmado" },
    { value: "checkin.reception.notification", label: "Notificação de Check-in para Portaria" },
    { value: "checkout.completed", label: "Check-out Concluído" },
    { value: "checkout.reminder", label: "Lembrete de Check-out Próximo" },
    { value: "guest.password_reset", label: "Recuperação de Senha do Hóspede" },
    { value: "fiscal_document.request", label: "Solicitação de Documento Fiscal" },
    { value: "employee.added_to_establishment", label: "Funcionário Adicionado ao Estabelecimento" },
  ];

  const handleOpenDialog = (template?: any) => {
    // Obter IDs dos estabelecimentos que têm sistema de e-mail habilitado
    const enabledIds = enabledEstablishments.map((est: any) => est.id);
    
    console.log('📂 Abrindo dialog de template:', {
      hasTemplate: !!template,
      templateId: template?.id,
      templateName: template?.name,
      rawEstablishmentIds: template?.establishment_ids,
      enabledIdsCount: enabledIds.length,
      enabledIds: enabledIds
    });
    
    if (template) {
      setSelectedTemplate(template);
      
      // Verificar se o template tem establishment_ids definido
      // null ou undefined = nunca foi definido, então pré-selecionar todos os habilitados
      // [] (array vazio) = foi salvo como vazio (todos desmarcados), então manter vazio
      // Array com valores = usar os valores salvos, mas filtrar apenas os que ainda têm sistema de e-mail habilitado
      let finalIds: string[] = [];
      
      if (template.establishment_ids === null || template.establishment_ids === undefined) {
        // Nunca foi definido, pré-selecionar todos os habilitados (comportamento padrão)
        finalIds = enabledIds;
        console.log('✅ Template nunca foi definido - pré-selecionando todos:', finalIds);
      } else {
        // Foi definido (pode ser array vazio ou array com valores)
        let establishmentIds: string[] = [];
        
        if (Array.isArray(template.establishment_ids)) {
          establishmentIds = template.establishment_ids;
        } else if (typeof template.establishment_ids === 'string' && template.establishment_ids.trim() !== '') {
          try {
            const parsed = JSON.parse(template.establishment_ids);
            establishmentIds = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            establishmentIds = [];
          }
        }
        
        console.log('📋 Template já foi definido:', {
          rawValue: template.establishment_ids,
          parsedArray: establishmentIds,
          arrayLength: establishmentIds.length
        });
        
        // Se o array estava vazio, manter vazio (foi explicitamente desmarcado)
        // Se tinha valores, filtrar apenas os que ainda têm sistema de e-mail habilitado
        if (establishmentIds.length === 0) {
          finalIds = [];
          console.log('⚠️ Array vazio - mantendo vazio (todos desmarcados)');
        } else {
          finalIds = establishmentIds.filter((id: string) => enabledIds.includes(id));
          console.log('✅ Array com valores - filtrando:', finalIds);
        }
      }
      
      console.log('🎯 IDs finais para seleção:', finalIds);
      setSelectedEstablishmentIds(finalIds);
      setFormData({
        name: template.name || "",
        event_type: template.event_type || "reservation.created",
        subject: template.subject || "",
        body_html: template.body_html || "",
        body_text: template.body_text || "",
        is_active: template.is_active ?? true,
        primary_color: template.primary_color || "#4F46E5",
        footer_text: template.footer_text || "",
        logo_url: template.logo_url || "",
        cc_emails: template.cc_emails || "",
        bcc_emails: template.bcc_emails || "",
        establishment_ids: finalIds,
      });
    } else {
      setSelectedTemplate(null);
      // Pré-selecionar todos os estabelecimentos que têm sistema de e-mail habilitado (comportamento padrão)
      setSelectedEstablishmentIds(enabledIds);
      setFormData({
        name: "",
        event_type: "reservation.created",
        subject: "",
        body_html: "",
        body_text: "",
        is_active: true,
        primary_color: "#4F46E5",
        footer_text: "",
        logo_url: "",
        cc_emails: "",
        bcc_emails: "",
        establishment_ids: enabledIds,
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const variables = extractVariables(formData.body_html + " " + formData.subject);
    
    // Obter IDs dos estabelecimentos que têm sistema de e-mail habilitado
    const enabledIds = enabledEstablishments.map((est: any) => est.id);
    
    // Garantir que establishment_ids seja um array válido
    const selectedIds = Array.isArray(selectedEstablishmentIds) 
      ? selectedEstablishmentIds 
      : [];
    
    // Determinar o valor a salvar:
    // - Se todos os habilitados estão selecionados = null (comportamento padrão, permite todos)
    // - Se nenhum está selecionado = [] (array vazio, não permite nenhum)
    // - Se alguns estão selecionados = array com os IDs selecionados
    let establishmentIdsToSave: string[] | null = null;
    
    if (selectedIds.length === 0) {
      // Nenhum selecionado = array vazio (não permite nenhum)
      establishmentIdsToSave = [];
      console.log('💾 Salvando: NENHUM selecionado - array vazio [] (BLOQUEADO)');
    } else if (selectedIds.length === enabledIds.length && 
               enabledIds.every(id => selectedIds.includes(id))) {
      // Todos os habilitados estão selecionados = null (comportamento padrão)
      establishmentIdsToSave = null;
      console.log('💾 Salvando: TODOS selecionados - null (PERMITIDO para todos)');
    } else {
      // Alguns selecionados = array com os IDs
      establishmentIdsToSave = selectedIds;
      console.log('💾 Salvando: ALGUNS selecionados - array com IDs:', establishmentIdsToSave);
    }
    
    console.log('💾 Dados finais para salvar:', {
      selectedIdsCount: selectedIds.length,
      enabledIdsCount: enabledIds.length,
      establishmentIdsToSave,
      isNull: establishmentIdsToSave === null,
      isArray: Array.isArray(establishmentIdsToSave),
      arrayLength: Array.isArray(establishmentIdsToSave) ? establishmentIdsToSave.length : 'N/A'
    });
    
    const templateData = {
      ...formData,
      establishment_ids: establishmentIdsToSave,
      variables: variables,
    };

    try {
      if (selectedTemplate) {
        await updateTemplate({ id: selectedTemplate.id, ...templateData });
      } else {
        await createTemplate(templateData);
      }
      setDialogOpen(false);
      // Não limpar selectedEstablishmentIds aqui, pois pode ser usado novamente se o dialog for reaberto
    } catch (error) {
      console.error(error);
    }
  };
  
  // Filtrar estabelecimentos que têm sistema de e-mail habilitado
  const enabledEstablishments = useMemo(() => {
    if (!establishments || !siteSettings?.features_enabled?.email) return [];
    
    return establishments.filter((establishment: any) => {
      return isFeatureEnabledForEstablishment(
        siteSettings.features_enabled.email,
        establishment.id
      );
    });
  }, [establishments, siteSettings]);
  
  // Agrupar estabelecimentos por empresa (apenas os que têm e-mail habilitado)
  const establishmentsByCompanyMap = useMemo(() => {
    if (!enabledEstablishments || !companies) return new Map();
    
    const grouped = new Map<string, {
      company: any;
      establishments: any[];
    }>();
    
    companies.forEach((company: any) => {
      const companyEstablishments = enabledEstablishments.filter(
        (est: any) => est.company_id === company.id
      );
      
      if (companyEstablishments.length > 0) {
        grouped.set(company.id, {
          company,
          establishments: companyEstablishments,
        });
      }
    });
    
    // Adicionar estabelecimentos sem empresa
    const establishmentsWithoutCompany = enabledEstablishments.filter(
      (est: any) => !est.company_id || !companies.find((c: any) => c.id === est.company_id)
    );
    
    if (establishmentsWithoutCompany.length > 0) {
      grouped.set('no-company', {
        company: { id: 'no-company', name: 'Sem Empresa' },
        establishments: establishmentsWithoutCompany,
      });
    }
    
    return grouped;
  }, [enabledEstablishments, companies]);
  
  const toggleCompanyExpansion = (companyId: string) => {
    setExpandedCompanies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(companyId)) {
        newSet.delete(companyId);
      } else {
        newSet.add(companyId);
      }
      return newSet;
    });
  };
  
  const handleEstablishmentToggle = (establishmentId: string, isSelected: boolean) => {
    setSelectedEstablishmentIds((prev) => {
      if (isSelected) {
        return prev.includes(establishmentId) ? prev : [...prev, establishmentId];
      } else {
        return prev.filter((id) => id !== establishmentId);
      }
    });
  };
  
  const handleCompanyEstablishmentsToggle = (companyId: string, companyEstablishments: any[]) => {
    const companyEstIds = companyEstablishments.map((e: any) => e.id);
    const allSelected = companyEstIds.every((id: string) => 
      selectedEstablishmentIds.includes(id)
    );
    
    // Se todos estão selecionados, desmarcar todos
    // Se não, marcar todos
    companyEstIds.forEach((estId: string) => {
      handleEstablishmentToggle(estId, !allSelected);
    });
  };
  
  // Calcular estado de seleção por empresa
  const establishmentsByCompany = Array.from(establishmentsByCompanyMap.values()).map((group) => {
    const companyEstIds = group.establishments.map((e: any) => e.id);
    const allSelected = companyEstIds.every((id: string) => 
      selectedEstablishmentIds.includes(id)
    );
    const someSelected = companyEstIds.some((id: string) => 
      selectedEstablishmentIds.includes(id)
    );
    
    return {
      ...group,
      allSelected,
      someSelected,
    };
  });

  const handleDelete = async () => {
    if (selectedTemplate) {
      await deleteTemplate(selectedTemplate.id);
      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
    }
  };

  const handleSendTest = async () => {
    if (!selectedTemplate || !testEmail) {
      toast.error("Selecione um template e informe um e-mail");
      return;
    }

    try {
      await sendTestEmail({
        templateId: selectedTemplate.id,
        recipientEmail: testEmail,
        variables: {
          guest_name: "Nome do Hóspede",
          reservation_code: "TEST123",
          checkin_date: new Date().toLocaleDateString("pt-BR"),
          checkout_date: new Date(Date.now() + 86400000).toLocaleDateString("pt-BR"),
          total_amount: "500,00",
        },
      });
      setTestEmailDialogOpen(false);
      setTestEmail("");
    } catch (error) {
      console.error(error);
    }
  };

  const handlePreview = (template: any) => {
    setSelectedTemplate(template);
    setPreviewDialogOpen(true);
  };

  if (isLoading) {
    return <div className="p-6">Carregando templates...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Templates de E-mail</h2>
          <p className="text-muted-foreground">
            Gerencie os templates de e-mail automáticos
          </p>
        </div>
        <Button onClick={() => handleOpenDialog()}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Template
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Evento</TableHead>
              <TableHead>Assunto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Variáveis</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((template: any) => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">{template.name}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {eventTypes.find((e) => e.value === template.event_type)?.label || template.event_type}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate">{template.subject}</TableCell>
                <TableCell>
                  <Badge variant={template.is_active ? "default" : "secondary"}>
                    {template.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      // template.variables é um objeto JSONB, não um array
                      // Converter para array de chaves
                      const variablesObj = template.variables || {};
                      const variableKeys = typeof variablesObj === 'object' && !Array.isArray(variablesObj)
                        ? Object.keys(variablesObj)
                        : Array.isArray(variablesObj) ? variablesObj : [];
                      
                      return (
                        <>
                          {variableKeys.slice(0, 3).map((v: string) => (
                            <Badge key={v} variant="outline" className="text-xs">
                              {`{{${v}}}`}
                            </Badge>
                          ))}
                          {variableKeys.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{variableKeys.length - 3}
                            </Badge>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePreview(template)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setTestEmailDialogOpen(true);
                      }}
                    >
                      <Mail className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenDialog(template)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedTemplate(template);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Dialog: Criar/Editar Template */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedTemplate ? "Editar Template" : "Novo Template"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="name">Nome do Template *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="event_type">Tipo de Evento *</Label>
                <Select
                  value={formData.event_type}
                  onValueChange={(value) => setFormData({ ...formData, event_type: value as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {eventTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="subject">Assunto *</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                required
                placeholder="Ex: Confirmação de Reserva - {{reservation_code}}"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use variáveis como {"{{guest_name}}"}, {"{{reservation_code}}"}, etc.
              </p>
            </div>

            <div>
              <Label htmlFor="body_html">Corpo HTML *</Label>
              <Textarea
                id="body_html"
                value={formData.body_html}
                onChange={(e) => setFormData({ ...formData, body_html: e.target.value })}
                required
                rows={15}
                className="font-mono text-sm"
                placeholder="<html>...</html>"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Variáveis disponíveis: guest_name, reservation_code, checkin_date, checkout_date, total_amount, policies_link, etc.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="cc_emails">Emails em Cópia (CC)</Label>
                <Input
                  id="cc_emails"
                  type="text"
                  value={formData.cc_emails}
                  onChange={(e) => setFormData({ ...formData, cc_emails: e.target.value })}
                  placeholder="email1@exemplo.com, email2@exemplo.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Separe múltiplos emails por vírgula
                </p>
              </div>
              <div>
                <Label htmlFor="bcc_emails">Emails em Cópia Oculta (BCC)</Label>
                <Input
                  id="bcc_emails"
                  type="text"
                  value={formData.bcc_emails}
                  onChange={(e) => setFormData({ ...formData, bcc_emails: e.target.value })}
                  placeholder="email1@exemplo.com, email2@exemplo.com"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Separe múltiplos emails por vírgula
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Template Ativo</Label>
            </div>

            {/* Seleção de Estabelecimentos */}
            <div className="space-y-2 border-t pt-4">
              <Label className="text-sm font-medium">Estabelecimentos Permitidos:</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Por padrão, todos os estabelecimentos com sistema de e-mail habilitado estão selecionados. Desmarque os estabelecimentos que não devem usar este template. Se todos forem desmarcados e salvar, o template não será usado por nenhum estabelecimento.
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
                {establishmentsByCompany.map((group) => {
                  const isCompanyExpanded = expandedCompanies.has(group.company.id);
                  return (
                    <div key={group.company.id} className="border rounded-lg">
                      {/* Cabeçalho da Empresa */}
                      <div className="flex items-center justify-between p-2 bg-muted/50 rounded-t-lg">
                        <div className="flex items-center space-x-2 flex-1">
                          <button
                            type="button"
                            onClick={() => toggleCompanyExpansion(group.company.id)}
                            className="p-1 hover:bg-muted rounded"
                          >
                            {isCompanyExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <input
                            type="checkbox"
                            checked={group.allSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = group.someSelected && !group.allSelected;
                            }}
                            onChange={() => handleCompanyEstablishmentsToggle(group.company.id, group.establishments)}
                            className="rounded"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Label 
                            className="text-sm font-medium cursor-pointer flex-1"
                            onClick={() => handleCompanyEstablishmentsToggle(group.company.id, group.establishments)}
                          >
                            {group.company.name}
                            <span className="text-muted-foreground ml-2">
                              ({group.establishments.length} estabelecimento{group.establishments.length !== 1 ? 's' : ''})
                            </span>
                          </Label>
                        </div>
                      </div>
                      
                      {/* Estabelecimentos da Empresa */}
                      {isCompanyExpanded && (
                        <div className="p-2 space-y-1 bg-background rounded-b-lg">
                          {group.establishments.map((establishment: any) => {
                            const isSelected = selectedEstablishmentIds.includes(establishment.id);
                            return (
                              <div
                                key={establishment.id}
                                className="flex items-center space-x-2 p-2 rounded border hover:bg-muted/50 cursor-pointer ml-6"
                                onClick={() => handleEstablishmentToggle(establishment.id, !isSelected)}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleEstablishmentToggle(establishment.id, !isSelected)}
                                  className="rounded"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <Label className="text-sm cursor-pointer flex-1">
                                  {establishment.name}
                                </Label>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
                {establishmentsByCompany.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Nenhum estabelecimento cadastrado
                  </p>
                )}
              </div>
              {selectedEstablishmentIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedEstablishmentIds.length} estabelecimento{selectedEstablishmentIds.length !== 1 ? 's' : ''} selecionado{selectedEstablishmentIds.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Preview */}
      <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview do Template</DialogTitle>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              <div>
                <Label>Assunto:</Label>
                <p className="font-medium">{selectedTemplate.subject}</p>
              </div>
              <div>
                <Label>HTML:</Label>
                <div
                  className="border rounded p-4 bg-white"
                  dangerouslySetInnerHTML={{ __html: selectedTemplate.body_html }}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog: Enviar Teste */}
      <Dialog open={testEmailDialogOpen} onOpenChange={setTestEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar E-mail de Teste</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="test_email">E-mail de Destino *</Label>
              <Input
                id="test_email"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="teste@exemplo.com"
                required
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setTestEmailDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSendTest}>Enviar Teste</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Alert Dialog: Deletar */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este template? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

