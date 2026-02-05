import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEmailSettings } from "@/hooks/useEmailSettings";
import { Mail, Save, TestTube, HelpCircle, Code, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Lista de todas as variáveis disponíveis nos templates
const TEMPLATE_VARIABLES = [
  // Variáveis do Hóspede e Reserva
  { name: "guest_name", description: "Nome completo do hóspede", example: "João Silva", category: "Reserva" },
  { name: "reservation_code", description: "Código/localizador da reserva", example: "RSV030458", category: "Reserva" },
  { name: "identification_number", description: "Número de identificação único da reserva (com #)", example: "#123456", category: "Reserva" },
  { name: "checkin_date", description: "Data de check-in (formato DD/MM/YYYY)", example: "15/12/2024", category: "Reserva" },
  { name: "checkout_date", description: "Data de check-out (formato DD/MM/YYYY)", example: "20/12/2024", category: "Reserva" },
  { name: "new_checkout_date", description: "Nova data de check-out após extensão (formato DD/MM/YYYY)", example: "25/12/2024", category: "Reserva" },
  { name: "checkin_time", description: "Horário de check-in", example: "14:00", category: "Reserva" },
  { name: "checkout_time", description: "Horário de check-out", example: "12:00", category: "Reserva" },
  
  // Variáveis de Pagamento
  { name: "total_amount", description: "Valor total da reserva (formato brasileiro)", example: "1.500,00", category: "Pagamento" },
  { name: "paid_amount", description: "Valor pago da reserva (formato brasileiro)", example: "1.500,00", category: "Pagamento" },
  { name: "payment_status", description: "Status do pagamento (Pendente, Pago, Parcial, Reembolsado)", example: "Pago", category: "Pagamento" },
  
  // Variáveis do Quarto
  { name: "room_number", description: "Número do quarto (se já atribuído)", example: "101", category: "Quarto" },
  { name: "room_name", description: "Nome do quarto (se já atribuído)", example: "Quarto 101", category: "Quarto" },
  { name: "room_password", description: "Senha do quarto (se disponível)", example: "1234", category: "Quarto" },
  { name: "category_name", description: "Nome da categoria do quarto", example: "Suíte Master", category: "Quarto" },
  { name: "room_category", description: "Alias para category_name", example: "Suíte Master", category: "Quarto" },
  
  // Variáveis de Ocupação
  { name: "adults", description: "Número de adultos", example: "2", category: "Reserva" },
  { name: "children", description: "Número de crianças", example: "1", category: "Reserva" },
  
  // Variáveis do Estabelecimento
  { name: "hotel_name", description: "Nome do hotel/estabelecimento", example: "Hotel Exemplo", category: "Estabelecimento" },
  { name: "hotel_address", description: "Endereço completo do hotel", example: "Rua Exemplo, 123, Centro, São Paulo - SP - CEP: 01234-567", category: "Estabelecimento" },
  { name: "hotel_contact", description: "Contato do hotel (prioriza telefone, senão WhatsApp, senão e-mail)", example: "+55 11 1234-5678", category: "Estabelecimento" },
  { name: "hotel_policies", description: "Políticas do hotel", example: "Check-in às 14h, Check-out às 12h...", category: "Estabelecimento" },
  { name: "hotel_email", description: "E-mail do hotel", example: "contato@hotelexemplo.com", category: "Estabelecimento" },
  { name: "hotel_phone", description: "Telefone do hotel (sempre disponível se configurado)", example: "+55 11 1234-5678", category: "Estabelecimento" },
  { name: "hotel_whatsapp", description: "WhatsApp do hotel (sempre disponível se configurado)", example: "+55 11 98765-4321", category: "Estabelecimento" },
  { name: "hotel_website", description: "Website do hotel", example: "https://www.hotelexemplo.com", category: "Estabelecimento" },
  { name: "hotel_logo", description: "URL do logo do estabelecimento (para exibir no e-mail)", example: "https://storage.supabase.co/.../logo.png", category: "Estabelecimento" },
  { name: "logo_url", description: "Alias para hotel_logo", example: "https://storage.supabase.co/.../logo.png", category: "Estabelecimento" },
  
  // Variáveis de Links
  { name: "policies_link", description: "Link para página pública de políticas (detectado automaticamente)", example: "https://seudominio.com/policies/...", category: "Links" },
  { name: "web_checkin_link", description: "Link para web check-in com localizador (detectado automaticamente)", example: "https://seudominio.com/web-checkin/RSV030458", category: "Links" },
  { name: "payment_link", description: "Link para pagamento da reserva via Stripe (detectado automaticamente, se disponível)", example: "https://seudominio.com/payment/pi_...", category: "Links" },
  
  // Variáveis para Múltiplas Reservas (apenas para evento reservation.created com múltiplas reservas)
  { name: "reservation_count", description: "Número total de reservas criadas", example: "3", category: "Múltiplas Reservas" },
  { name: "reservations_list", description: "Lista HTML automática de todas as reservas (gera cards com todas as informações)", example: "HTML gerado automaticamente", category: "Múltiplas Reservas" },
  { name: "#reservations_list", description: "Início do loop para personalizar formato de cada reserva (use {{/reservations_list}} para fechar)", example: "{{#reservations_list}}...{{/reservations_list}}", category: "Múltiplas Reservas" },
  { name: "/reservations_list", description: "Fim do loop de reservas (deve ser usado após {{#reservations_list}})", example: "{{/reservations_list}}", category: "Múltiplas Reservas" },
  { name: "number", description: "Número da reserva no loop (1, 2, 3...)", example: "1", category: "Múltiplas Reservas" },
  { name: "code", description: "Código da reserva no loop", example: "RSV030458", category: "Múltiplas Reservas" },
  { name: "locator", description: "Localizador do check-in no loop", example: "RSV030458", category: "Múltiplas Reservas" },
  { name: "checkin_date", description: "Data de check-in da reserva no loop (formato DD/MM/YYYY)", example: "15/12/2024", category: "Múltiplas Reservas" },
  { name: "checkout_date", description: "Data de check-out da reserva no loop (formato DD/MM/YYYY)", example: "20/12/2024", category: "Múltiplas Reservas" },
  { name: "room_number", description: "Número do quarto da reserva no loop", example: "101", category: "Múltiplas Reservas" },
  { name: "room_name", description: "Nome do quarto da reserva no loop", example: "Quarto 101", category: "Múltiplas Reservas" },
  { name: "category_name", description: "Nome da categoria da reserva no loop", example: "Suíte Master", category: "Múltiplas Reservas" },
  { name: "total_amount", description: "Valor total da reserva no loop (formato brasileiro)", example: "R$ 1.500,00", category: "Múltiplas Reservas" },
  { name: "paid_amount", description: "Valor pago da reserva no loop (formato brasileiro)", example: "R$ 1.500,00", category: "Múltiplas Reservas" },
  { name: "web_checkin_link", description: "Link para web check-in da reserva no loop", example: "https://seudominio.com/web-checkin/RSV030458", category: "Múltiplas Reservas" },
];

export function EmailSettingsManager() {
  const { settings, isLoading, upsertSettings, testSettings, isSaving, isTesting } = useEmailSettings();
  
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [resendHelpDialogOpen, setResendHelpDialogOpen] = useState(false);
  const [smtpHelpDialogOpen, setSmtpHelpDialogOpen] = useState(false);
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    provider: "smtp" as "smtp" | "sendgrid" | "mailgun" | "ses" | "resend",
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    smtp_secure: true,
    api_key: "",
    sender_name: "PMS System",
    sender_email: "",
    reply_to_email: "",
    is_active: false,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        provider: settings.provider || "smtp",
        smtp_host: settings.smtp_host || "",
        smtp_port: settings.smtp_port || 587,
        smtp_username: settings.smtp_username || "",
        smtp_password: settings.smtp_password || "",
        smtp_secure: settings.smtp_secure ?? true,
        api_key: settings.api_key || "",
        sender_name: settings.sender_name || "PMS System",
        sender_email: settings.sender_email || "",
        reply_to_email: settings.reply_to_email || "",
        is_active: settings.is_active ?? false,
      });
    }
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await upsertSettings(formData);
    } catch (error) {
      console.error(error);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast.error("Informe um e-mail para teste");
      return;
    }

    if (!formData.is_active) {
      toast.error("Ative o envio de e-mails antes de testar");
      return;
    }

    try {
      // Salvar configurações primeiro
      await upsertSettings(formData);
      // Enviar teste (já processa automaticamente)
      await testSettings(testEmail);
      setTestDialogOpen(false);
      setTestEmail("");
    } catch (error: any) {
      console.error(error);
      // O erro já é mostrado pelo toast no hook
    }
  };

  if (isLoading) {
    return <div className="p-6">Carregando configurações...</div>;
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedVariable(text);
    toast.success("Variável copiada!");
    setTimeout(() => setCopiedVariable(null), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Configurações de E-mail</h2>
          <p className="text-muted-foreground">
            Configure o servidor de e-mail para envio automático
          </p>
        </div>
        <Button onClick={() => setTestDialogOpen(true)} variant="outline">
          <TestTube className="h-4 w-4 mr-2" />
          Testar Configuração
        </Button>
      </div>

      <Tabs defaultValue="settings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
          <TabsTrigger value="variables">
            <Code className="h-4 w-4 mr-2" />
            Variáveis dos Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="flex items-center gap-2">
                <Label htmlFor="provider">Provedor de E-mail *</Label>
                {formData.provider === "smtp" && (
                  <button
                    type="button"
                    onClick={() => setSmtpHelpDialogOpen(true)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    aria-label="Ajuda sobre SMTP"
                  >
                    <HelpCircle className="h-4 w-4 cursor-help" />
                  </button>
                )}
                {formData.provider === "resend" && (
                  <button
                    type="button"
                    onClick={() => setResendHelpDialogOpen(true)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    aria-label="Ajuda sobre Resend"
                  >
                    <HelpCircle className="h-4 w-4 cursor-help" />
                  </button>
                )}
              </div>
              <Select
                value={formData.provider}
                onValueChange={(value: any) => setFormData({ ...formData, provider: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resend">Resend (Recomendado) ⭐</SelectItem>
                  <SelectItem value="sendgrid">SendGrid</SelectItem>
                  <SelectItem value="mailgun">Mailgun</SelectItem>
                  <SelectItem value="smtp">SMTP</SelectItem>
                  <SelectItem value="ses">AWS SES</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-8">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Ativar Envio de E-mails</Label>
            </div>
          </div>

          {formData.provider === "smtp" && (
            <div className="space-y-4 border-t pt-4">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <HelpCircle className="h-4 w-4 text-amber-700 dark:text-amber-300 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-800 dark:text-amber-200">
                    <p>
                      <strong>Nota:</strong> SMTP requer Edge Function <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">send-email-smtp</code> no Supabase.
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                      Para mais informações, clique no ícone de ajuda ao lado de "Provedor de E-mail".
                    </p>
                  </div>
                </div>
              </div>
              <h3 className="font-semibold">Configurações SMTP</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="smtp_host">Host SMTP *</Label>
                  <Input
                    id="smtp_host"
                    value={formData.smtp_host}
                    onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                    placeholder="smtp.gmail.com"
                    required={formData.provider === "smtp"}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp_port">Porta *</Label>
                  <Input
                    id="smtp_port"
                    type="number"
                    value={formData.smtp_port}
                    onChange={(e) => setFormData({ ...formData, smtp_port: parseInt(e.target.value) || 587 })}
                    required={formData.provider === "smtp"}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp_username">Usuário *</Label>
                  <Input
                    id="smtp_username"
                    value={formData.smtp_username}
                    onChange={(e) => setFormData({ ...formData, smtp_username: e.target.value })}
                    placeholder="seu-email@gmail.com"
                    required={formData.provider === "smtp"}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp_password">Senha *</Label>
                  <Input
                    id="smtp_password"
                    type="password"
                    value={formData.smtp_password}
                    onChange={(e) => setFormData({ ...formData, smtp_password: e.target.value })}
                    required={formData.provider === "smtp"}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="smtp_secure"
                    checked={formData.smtp_secure}
                    onCheckedChange={(checked) => setFormData({ ...formData, smtp_secure: checked })}
                  />
                  <Label htmlFor="smtp_secure">Usar SSL/TLS</Label>
                </div>
              </div>
            </div>
          )}

          {(formData.provider === "sendgrid" || formData.provider === "mailgun" || formData.provider === "ses" || formData.provider === "resend") && (
            <div className="space-y-4 border-t pt-4">
              <h3 className="font-semibold">Configurações API</h3>
              <div>
                <Label htmlFor="api_key">API Key *</Label>
                <Input
                  id="api_key"
                  type="password"
                  value={formData.api_key}
                  onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                  placeholder="Sua API Key"
                  required={formData.provider !== "smtp"}
                />
                {formData.provider === "resend" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Obtenha sua API Key em: <a href="https://resend.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">resend.com/api-keys</a>
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-4 border-t pt-4">
            <h3 className="font-semibold">Informações do Remetente</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="sender_name">Nome do Remetente *</Label>
                <Input
                  id="sender_name"
                  value={formData.sender_name}
                  onChange={(e) => setFormData({ ...formData, sender_name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="sender_email">E-mail do Remetente *</Label>
                <Input
                  id="sender_email"
                  type="email"
                  value={formData.sender_email}
                  onChange={(e) => setFormData({ ...formData, sender_email: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="reply_to_email">E-mail de Resposta</Label>
                <Input
                  id="reply_to_email"
                  type="email"
                  value={formData.reply_to_email}
                  onChange={(e) => setFormData({ ...formData, reply_to_email: e.target.value })}
                  placeholder="reply@exemplo.com"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button type="submit" disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </form>
      </Card>
        </TabsContent>

        <TabsContent value="variables">
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Variáveis Disponíveis nos Templates</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Use estas variáveis nos seus templates de e-mail. Clique no botão de copiar para usar no formato <code className="bg-muted px-1 rounded">{`{{variable_name}}`}</code>
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-900">
                    <strong>Nota sobre Múltiplas Reservas:</strong> As variáveis da categoria "Múltiplas Reservas" são usadas apenas quando há múltiplas reservas criadas em um único pagamento (página pública de reservas). 
                    Use <code className="bg-blue-100 px-1 rounded">{`{{#reservations_list}}...{{/reservations_list}}`}</code> para criar um loop personalizado, ou <code className="bg-blue-100 px-1 rounded">{`{{reservations_list}}`}</code> para usar a lista HTML automática.
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                {["Reserva", "Pagamento", "Quarto", "Estabelecimento", "Links", "Múltiplas Reservas"].map((category) => {
                  const categoryVariables = TEMPLATE_VARIABLES.filter(
                    (v) => v.category === category
                  );
                  if (categoryVariables.length === 0) return null;
                  
                  return (
                    <div key={category} className="space-y-2">
                      <h4 className="text-sm font-semibold text-foreground border-b pb-2">
                        {category}
                      </h4>
                      {categoryVariables.map((variable) => (
                        <div
                          key={variable.name}
                          className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                                {`{{${variable.name}}}`}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => copyToClipboard(`{{${variable.name}}}`)}
                              >
                                {copiedVariable === `{{${variable.name}}}` ? (
                                  <Check className="h-4 w-4 text-green-600" />
                                ) : (
                                  <Copy className="h-4 w-4" />
                                )}
                              </Button>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {variable.description}
                            </p>
                            {variable.example && (
                              <p className="text-xs text-muted-foreground">
                                <strong>Exemplo:</strong> {variable.example}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  💡 Dica: Condicionais
                </h4>
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
                  Você pode usar condicionais para mostrar conteúdo apenas quando uma variável estiver disponível:
                </p>
                <code className="block text-xs bg-blue-100 dark:bg-blue-900 px-3 py-2 rounded mt-2">
                  {`{{#if room_number}}`}
                  <br />
                  {`  <p>Quarto: {{room_number}}</p>`}
                  <br />
                  {`{{/if}}`}
                </code>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Testar Configuração */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Testar Configuração de E-mail</DialogTitle>
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
              <Button type="button" variant="outline" onClick={() => setTestDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleTest} disabled={isTesting}>
                <Mail className="h-4 w-4 mr-2" />
                {isTesting ? "Enviando..." : "Enviar Teste"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Ajuda SMTP */}
      <Dialog open={smtpHelpDialogOpen} onOpenChange={setSmtpHelpDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Configuração do SMTP
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
                ⚠️ ATENÇÃO: Edge Function Necessária
              </p>
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                Para usar SMTP, você precisa criar uma Edge Function no Supabase chamada <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">send-email-smtp</code>.
              </p>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                Passos:
              </p>
              <ol className="text-sm text-amber-800 dark:text-amber-200 list-decimal list-inside space-y-1 ml-2">
                <li>Acesse <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Supabase Dashboard</a></li>
                <li>Vá em <strong>Edge Functions</strong></li>
                <li>Clique em <strong>Create a new function</strong></li>
                <li>Nome: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">send-email-smtp</code></li>
                <li>Cole o código de <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">supabase/functions/send-email-smtp/index.ts</code></li>
                <li>Clique em <strong>Deploy</strong></li>
              </ol>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-3">
                📖 Veja o guia completo: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">GUIA_EDGE_FUNCTION_SMTP.md</code>
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                ℹ️ Nota Importante
              </p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                SMTP via Edge Function pode ter problemas de compatibilidade com bibliotecas Deno. 
                Recomendamos usar <strong>Resend</strong>, <strong>SendGrid</strong> ou <strong>Mailgun</strong> que funcionam diretamente do frontend e são mais confiáveis.
              </p>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setSmtpHelpDialogOpen(false)}>
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog: Ajuda Resend */}
      <Dialog open={resendHelpDialogOpen} onOpenChange={setResendHelpDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              Configuração do Resend
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {/* Edge Function */}
            <div className="space-y-3">
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 mb-2">
                  ⚠️ ATENÇÃO: Edge Function Necessária
                </p>
                <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                  Para usar Resend, você <strong>DEVE</strong> criar uma Edge Function no Supabase chamada <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">send-email-resend</code>.
                </p>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 mb-2">
                  Passos:
                </p>
                <ol className="text-sm text-amber-800 dark:text-amber-200 list-decimal list-inside space-y-1 ml-2">
                  <li>Acesse <a href="https://app.supabase.com" target="_blank" rel="noopener noreferrer" className="underline font-semibold">Supabase Dashboard</a></li>
                  <li>Vá em <strong>Edge Functions</strong></li>
                  <li>Clique em <strong>Create a new function</strong></li>
                  <li>Nome: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">send-email-resend</code></li>
                  <li>Cole o código de <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">supabase/functions/send-email-resend/index.ts</code></li>
                  <li>Clique em <strong>Deploy</strong></li>
                </ol>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-3">
                  📖 Veja o guia completo: <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">COMO_CRIAR_EDGE_FUNCTION_RESEND.md</code>
                </p>
              </div>
            </div>

            {/* Domínio */}
            <div className="space-y-3">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-2">
                  ℹ️ Domínio Verificado Necessário
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                  O Resend não permite usar domínios de terceiros (Gmail, Outlook, etc.).
                </p>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                      Opção 1 - Domínio de Teste (Rápido):
                    </p>
                    <ul className="text-sm text-blue-800 dark:text-blue-200 list-disc list-inside space-y-1 ml-2">
                      <li>Use o domínio de teste do Resend: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">onboarding@resend.dev</code></li>
                      <li>Funciona imediatamente, mas e-mails podem ir para spam</li>
                      <li>Ideal para testes</li>
                    </ul>
                  </div>

                  <div>
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">
                      Opção 2 - Verificar Seu Domínio (Produção):
                    </p>
                    <ul className="text-sm text-blue-800 dark:text-blue-200 list-disc list-inside space-y-1 ml-2">
                      <li>Acesse <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className="underline font-semibold">resend.com/domains</a></li>
                      <li>Adicione seu domínio (ex: seudominio.com)</li>
                      <li>Configure os registros DNS conforme instruções</li>
                      <li>Use um e-mail do seu domínio (ex: noreply@seudominio.com)</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setResendHelpDialogOpen(false)}>
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

