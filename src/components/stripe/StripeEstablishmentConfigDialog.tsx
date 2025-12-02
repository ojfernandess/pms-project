import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStripe } from "@/hooks/useStripe";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff, Info } from "lucide-react";
import { toast } from "sonner";

interface StripeEstablishmentConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const StripeEstablishmentConfigDialog = ({
  open,
  onOpenChange,
}: StripeEstablishmentConfigDialogProps) => {
  const {
    globalConfig,
    establishmentConfig,
    isLoadingEstablishmentConfig,
    upsertEstablishmentConfig,
    isStripeEnabled,
  } = useStripe();
  
  // Verificar se Stripe está habilitado globalmente (necessário para configurar estabelecimento)
  const isGlobalStripeEnabled = globalConfig?.is_enabled ?? false;
  const [isEnabled, setIsEnabled] = useState(false);
  const [testPublishableKey, setTestPublishableKey] = useState("");
  const [testSecretKey, setTestSecretKey] = useState("");
  const [livePublishableKey, setLivePublishableKey] = useState("");
  const [liveSecretKey, setLiveSecretKey] = useState("");
  const [webhookSecretTest, setWebhookSecretTest] = useState("");
  const [webhookSecretLive, setWebhookSecretLive] = useState("");
  const [showTestSecret, setShowTestSecret] = useState(false);
  const [showLiveSecret, setShowLiveSecret] = useState(false);
  const [showEstablishmentPolicies, setShowEstablishmentPolicies] = useState(false);
  const [showRefundPolicy, setShowRefundPolicy] = useState(false);
  const [showLegalPolicies, setShowLegalPolicies] = useState(false);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [refundPolicyText, setRefundPolicyText] = useState("");

  useEffect(() => {
    if (establishmentConfig) {
      setIsEnabled(establishmentConfig.is_enabled);
      setTestPublishableKey(establishmentConfig.test_publishable_key || "");
      setTestSecretKey(establishmentConfig.test_secret_key || "");
      setLivePublishableKey(establishmentConfig.live_publishable_key || "");
      setLiveSecretKey(establishmentConfig.live_secret_key || "");
      setWebhookSecretTest(establishmentConfig.webhook_secret_test || "");
      setWebhookSecretLive(establishmentConfig.webhook_secret_live || "");
      setShowEstablishmentPolicies(establishmentConfig.show_establishment_policies || false);
      setShowRefundPolicy(establishmentConfig.show_refund_policy || false);
      setShowLegalPolicies(establishmentConfig.show_legal_policies || false);
      setShowContactInfo(establishmentConfig.show_contact_info || false);
      setRefundPolicyText(establishmentConfig.refund_policy_text || "");
    } else {
      setIsEnabled(false);
      setTestPublishableKey("");
      setTestSecretKey("");
      setLivePublishableKey("");
      setLiveSecretKey("");
      setWebhookSecretTest("");
      setWebhookSecretLive("");
      setShowEstablishmentPolicies(false);
      setShowRefundPolicy(false);
      setShowLegalPolicies(false);
      setShowContactInfo(false);
      setRefundPolicyText("");
    }
  }, [establishmentConfig, open]);

  const handleSave = async () => {
    if (!isGlobalStripeEnabled) {
      console.error('[Stripe Config] Stripe não está habilitado globalmente');
      toast.error('Stripe precisa estar habilitado globalmente primeiro. Configure em Super Admin > Stripe');
      return;
    }

    console.log('[Stripe Config] Iniciando salvamento da configuração...', {
      is_enabled: isEnabled,
      has_test_publishable: !!testPublishableKey,
      has_test_secret: !!testSecretKey,
      has_live_publishable: !!livePublishableKey,
      has_live_secret: !!liveSecretKey,
    });

    try {
      const result = await upsertEstablishmentConfig({
        is_enabled: isEnabled,
        test_publishable_key: testPublishableKey || undefined,
        test_secret_key: testSecretKey || undefined,
        live_publishable_key: livePublishableKey || undefined,
        live_secret_key: liveSecretKey || undefined,
        webhook_secret_test: webhookSecretTest || undefined,
        webhook_secret_live: webhookSecretLive || undefined,
        show_establishment_policies: showEstablishmentPolicies,
        show_refund_policy: showRefundPolicy,
        show_legal_policies: showLegalPolicies,
        show_contact_info: showContactInfo,
        refund_policy_text: refundPolicyText || undefined,
      });
      
      console.log('[Stripe Config] ✅ Configuração salva com sucesso:', result);
      onOpenChange(false);
    } catch (error: any) {
      console.error('[Stripe Config] ❌ Erro ao salvar configuração:', error);
      console.error('[Stripe Config] Detalhes do erro:', {
        message: error?.message,
        code: error?.code,
        details: error?.details,
        hint: error?.hint,
        fullError: JSON.stringify(error, null, 2)
      });
      // Erro já é tratado no hook, mas vamos garantir que seja mostrado
      if (error?.message) {
        toast.error(`Erro ao salvar: ${error.message}`);
      }
    }
  };

  if (isLoadingEstablishmentConfig) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="text-center p-8">Carregando configuração...</div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!isGlobalStripeEnabled) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              A integração Stripe não está ativada globalmente. É necessário que um Super Admin
              ative o Stripe globalmente antes de configurar esta conta.
              <br /><br />
              <strong>Próximos passos:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>Acesse <strong>Super Admin</strong> &gt; Aba <strong>Stripe</strong></li>
                <li>Configure as chaves do Stripe (test e/ou live)</li>
                <li>Ative <strong>"Stripe Habilitado"</strong></li>
                <li>Salve a configuração</li>
                <li>Volte aqui para configurar sua conta</li>
              </ol>
            </AlertDescription>
          </Alert>
          <div className="flex justify-end mt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const isTestMode = globalConfig?.test_mode ?? true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuração do Stripe - Estabelecimento</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Configure suas chaves do Stripe para processar pagamentos. Use chaves de teste para
              desenvolvimento e chaves de produção para ambiente real.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="isEnabled">Ativar Stripe para este Estabelecimento</Label>
              <p className="text-sm text-gray-500">
                Quando ativado, os pagamentos via Stripe estarão disponíveis
              </p>
            </div>
            <Switch id="isEnabled" checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          <Tabs defaultValue={isTestMode ? "test" : "live"}>
            <TabsList>
              <TabsTrigger value="test">Chaves de Teste</TabsTrigger>
              <TabsTrigger value="live">Chaves de Produção</TabsTrigger>
            </TabsList>

            <TabsContent value="test" className="space-y-4">
              <div>
                <Label htmlFor="testPublishableKey">Chave Pública de Teste</Label>
                <Input
                  id="testPublishableKey"
                  value={testPublishableKey}
                  onChange={(e) => setTestPublishableKey(e.target.value)}
                  placeholder="pk_test_..."
                />
              </div>
              <div>
                <Label htmlFor="testSecretKey">Chave Secreta de Teste</Label>
                <div className="flex gap-2">
                  <Input
                    id="testSecretKey"
                    type={showTestSecret ? "text" : "password"}
                    value={testSecretKey}
                    onChange={(e) => setTestSecretKey(e.target.value)}
                    placeholder="sk_test_..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowTestSecret(!showTestSecret)}
                  >
                    {showTestSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <Label htmlFor="webhookSecretTest">Webhook Secret de Teste</Label>
                <Input
                  id="webhookSecretTest"
                  type="password"
                  value={webhookSecretTest}
                  onChange={(e) => setWebhookSecretTest(e.target.value)}
                  placeholder="whsec_..."
                />
              </div>
            </TabsContent>

            <TabsContent value="live" className="space-y-4">
              <div>
                <Label htmlFor="livePublishableKey">Chave Pública de Produção</Label>
                <Input
                  id="livePublishableKey"
                  value={livePublishableKey}
                  onChange={(e) => setLivePublishableKey(e.target.value)}
                  placeholder="pk_live_..."
                />
              </div>
              <div>
                <Label htmlFor="liveSecretKey">Chave Secreta de Produção</Label>
                <div className="flex gap-2">
                  <Input
                    id="liveSecretKey"
                    type={showLiveSecret ? "text" : "password"}
                    value={liveSecretKey}
                    onChange={(e) => setLiveSecretKey(e.target.value)}
                    placeholder="sk_live_..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setShowLiveSecret(!showLiveSecret)}
                  >
                    {showLiveSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <Label htmlFor="webhookSecretLive">Webhook Secret de Produção</Label>
                <Input
                  id="webhookSecretLive"
                  type="password"
                  value={webhookSecretLive}
                  onChange={(e) => setWebhookSecretLive(e.target.value)}
                  placeholder="whsec_..."
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="border-t pt-6 mt-6">
            <h3 className="text-lg font-semibold mb-4">Opções de Exibição na Página de Pagamento</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Configure quais informações serão exibidas na página de pagamento para os clientes
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="showEstablishmentPolicies">Políticas do Estabelecimento</Label>
                  <p className="text-sm text-gray-500">
                    Exibir políticas gerais do estabelecimento (cancelamento, check-in/check-out, etc.)
                  </p>
                </div>
                <Switch
                  id="showEstablishmentPolicies"
                  checked={showEstablishmentPolicies}
                  onCheckedChange={setShowEstablishmentPolicies}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="showRefundPolicy">Política de Reembolsos e Devoluções</Label>
                    <p className="text-sm text-gray-500">
                      Exibir política específica de reembolsos e devoluções
                    </p>
                  </div>
                  <Switch
                    id="showRefundPolicy"
                    checked={showRefundPolicy}
                    onCheckedChange={setShowRefundPolicy}
                  />
                </div>
                {showRefundPolicy && (
                  <div>
                    <Label htmlFor="refundPolicyText">Texto da Política de Reembolsos</Label>
                    <Textarea
                      id="refundPolicyText"
                      value={refundPolicyText}
                      onChange={(e) => setRefundPolicyText(e.target.value)}
                      placeholder="Digite a política de reembolsos e devoluções que será exibida na página de pagamento..."
                      rows={6}
                      className="mt-1"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Este texto será exibido na página de pagamento quando a opção estiver ativada
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="showLegalPolicies">Políticas Jurídicas</Label>
                  <p className="text-sm text-gray-500">
                    Exibir termos e condições, políticas de privacidade, etc.
                  </p>
                </div>
                <Switch
                  id="showLegalPolicies"
                  checked={showLegalPolicies}
                  onCheckedChange={setShowLegalPolicies}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="showContactInfo">Dados de Contato</Label>
                  <p className="text-sm text-gray-500">
                    Exibir telefone, email e endereço do estabelecimento
                  </p>
                </div>
                <Switch
                  id="showContactInfo"
                  checked={showContactInfo}
                  onCheckedChange={setShowContactInfo}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar Configuração</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

