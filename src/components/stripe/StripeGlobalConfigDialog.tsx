import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStripe, StripeGlobalConfig } from "@/hooks/useStripe";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff } from "lucide-react";

interface StripeGlobalConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const StripeGlobalConfigDialog = ({
  open,
  onOpenChange,
}: StripeGlobalConfigDialogProps) => {
  const { globalConfig, isLoadingGlobalConfig, updateGlobalConfig } = useStripe();
  const [isEnabled, setIsEnabled] = useState(false);
  const [testMode, setTestMode] = useState(true);
  const [testPublishableKey, setTestPublishableKey] = useState("");
  const [testSecretKey, setTestSecretKey] = useState("");
  const [livePublishableKey, setLivePublishableKey] = useState("");
  const [liveSecretKey, setLiveSecretKey] = useState("");
  const [webhookSecretTest, setWebhookSecretTest] = useState("");
  const [webhookSecretLive, setWebhookSecretLive] = useState("");
  const [showTestSecret, setShowTestSecret] = useState(false);
  const [showLiveSecret, setShowLiveSecret] = useState(false);

  useEffect(() => {
    if (globalConfig) {
      setIsEnabled(globalConfig.is_enabled);
      setTestMode(globalConfig.test_mode);
      setTestPublishableKey(globalConfig.test_publishable_key || "");
      setTestSecretKey(globalConfig.test_secret_key || "");
      setLivePublishableKey(globalConfig.live_publishable_key || "");
      setLiveSecretKey(globalConfig.live_secret_key || "");
      setWebhookSecretTest(globalConfig.webhook_secret_test || "");
      setWebhookSecretLive(globalConfig.webhook_secret_live || "");
    }
  }, [globalConfig, open]);

  const handleSave = async () => {
    try {
      await updateGlobalConfig({
        is_enabled: isEnabled,
        test_mode: testMode,
        test_publishable_key: testPublishableKey || undefined,
        test_secret_key: testSecretKey || undefined,
        live_publishable_key: livePublishableKey || undefined,
        live_secret_key: liveSecretKey || undefined,
        webhook_secret_test: webhookSecretTest || undefined,
        webhook_secret_live: webhookSecretLive || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      // Erro já é tratado no hook
    }
  };

  if (isLoadingGlobalConfig) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <div className="text-center p-8">Carregando configuração...</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuração Global do Stripe</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Esta configuração ativa o Stripe para todo o sistema. Quando ativada, todos os
              estabelecimentos poderão configurar suas próprias contas Stripe.
            </AlertDescription>
          </Alert>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="isEnabled">Ativar Integração Stripe</Label>
              <p className="text-sm text-gray-500">
                Quando ativado, os estabelecimentos poderão configurar suas contas Stripe
              </p>
            </div>
            <Switch id="isEnabled" checked={isEnabled} onCheckedChange={setIsEnabled} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="testMode">Modo de Teste</Label>
              <p className="text-sm text-gray-500">
                Use chaves de teste para desenvolvimento ou chaves de produção para ambiente real
              </p>
            </div>
            <Switch id="testMode" checked={testMode} onCheckedChange={setTestMode} />
          </div>

          <Tabs defaultValue="test" value={testMode ? "test" : "live"}>
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

