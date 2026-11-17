import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useFnrhSettings } from "@/hooks/useFnrhSettings";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { FNRH_DEFAULTS_STAFF, FNRH_SITUACOES_HOSPEDE } from "@/lib/fnrh/domainOptions";
import { invokePmsFunction } from "@/lib/pmsApi";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Shield, Save, PlugZap, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

type Props = {
  establishmentId: string | undefined;
};

type CategoryRow = {
  id: string;
  name: string;
  building_id: string | null;
};

type FnrhTestConnectionResult = {
  success?: boolean;
  phase?: string;
  error?: string;
  message?: string;
  http_status?: number | null;
  mensagem?: string | null;
  mensagem_interna?: string | null;
  ip_locked?: boolean;
  hints?: string[];
  environment?: string;
  environment_label?: string;
  base_url?: string;
  portal_url?: string;
  request_method?: string;
  request_url?: string;
  api_username_masked?: string;
  cpf_solicitante_masked?: string;
  dominio_sample_count?: number;
};

export function FnrhSettingsCard({ establishmentId }: Props) {
  const { data: row, isLoading, saveSettings, isSaving } =
    useFnrhSettings(establishmentId);

  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState("production");
  const [baseUrlOverride, setBaseUrlOverride] = useState("");
  const [apiUsername, setApiUsername] = useState("");
  const [apiPassword, setApiPassword] = useState("");
  const [cpfSolicitante, setCpfSolicitante] = useState("");
  const [situacao, setSituacao] = useState("CHECKIN_REALIZADO");
  const [autoWeb, setAutoWeb] = useState(false);
  const [autoManual, setAutoManual] = useState(true);
  const [categoryScopeAll, setCategoryScopeAll] = useState(true);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<FnrhTestConnectionResult | null>(null);

  useEffect(() => {
    if (!row) return;
    setEnabled(row.enabled);
    setEnvironment(row.environment || "production");
    setBaseUrlOverride(row.base_url_override || "");
    setApiUsername(row.api_username || "");
    setCpfSolicitante(row.cpf_solicitante || "");
    setSituacao(row.situacao_hospede_inicial || "CHECKIN_REALIZADO");
    setAutoWeb(row.auto_submit_on_web_checkin ?? false);
    setAutoManual(row.auto_submit_on_manual_checkin ?? true);
    const scope = row.fnrh_category_scope === "selected" ? "selected" : "all";
    setCategoryScopeAll(scope === "all");
    setSelectedCategoryIds(
      Array.isArray(row.fnrh_category_ids)
        ? row.fnrh_category_ids.map(String)
        : [],
    );
    setApiPassword("");
  }, [row]);

  const categoriesQuery = useQuery({
    queryKey: ["room_categories_fnrh", establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("room_categories")
        .select("id, name, building_id")
        .eq("establishment_id", establishmentId!)
        .order("name");
      if (error) throw error;
      return (data || []) as CategoryRow[];
    },
  });

  const logsQuery = useQuery({
    queryKey: ["fnrh_submission_log", establishmentId],
    enabled: !!establishmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fnrh_submission_log")
        .select(
          "id, reservation_id, status, http_status, error_message, fnrh_reserva_id, created_at",
        )
        .eq("establishment_id", establishmentId!)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
  });

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleTestConnection = async () => {
    if (!establishmentId) return;
    if (!apiUsername.trim()) {
      toast.error("Informe o usuário da API antes de testar.");
      return;
    }
    if (!apiPassword.trim() && !row?.password_configured) {
      toast.error("Informe a senha da API (ou salve uma senha) antes de testar.");
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const access = sess?.session?.access_token;
      if (!access) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }
      const { data, error } = await invokePmsFunction<FnrhTestConnectionResult>("fnrh-test-connection", {
        body: {
          establishment_id: establishmentId,
          environment,
          base_url_override: baseUrlOverride,
          api_username: apiUsername,
          api_password: apiPassword.trim() || undefined,
          cpf_solicitante: cpfSolicitante.replace(/\D/g, ""),
        },
        headers: { Authorization: `Bearer ${access}` },
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const payload = data ?? {};
      setTestResult(payload);
      if (payload.success) {
        toast.success(payload.message || "Conexão FNRH OK.");
      } else if (payload.ip_locked) {
        toast.error("IP bloqueado na FNRH por tentativas falhas. Aguarde antes de testar de novo.");
      } else {
        toast.error(payload.error || "Falha no teste de conexão FNRH.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao testar conexão";
      toast.error(msg);
    } finally {
      setTestLoading(false);
    }
  };

  const handleSave = async () => {
    if (!establishmentId) return;
    if (!categoryScopeAll && selectedCategoryIds.length === 0) {
      toast.error(
        "Selecione ao menos uma categoria de quarto para aplicar o FNRH, ou marque «Todas as categorias».",
      );
      return;
    }
    try {
      await saveSettings({
        enabled,
        environment,
        base_url_override: baseUrlOverride,
        api_username: apiUsername,
        api_password: apiPassword,
        cpf_solicitante: cpfSolicitante.replace(/\D/g, ""),
        default_motivo_viagem_id: FNRH_DEFAULTS_STAFF.motivo_viagem_id,
        default_meio_transporte_id: FNRH_DEFAULTS_STAFF.meio_transporte_id,
        default_raca_id: FNRH_DEFAULTS_STAFF.raca_id,
        default_deficiencia_id: FNRH_DEFAULTS_STAFF.deficiencia_id,
        default_genero_id: FNRH_DEFAULTS_STAFF.genero_id,
        situacao_hospede_inicial: situacao,
        auto_submit_on_web_checkin: autoWeb,
        auto_submit_on_manual_checkin: autoManual,
        fnrh_category_scope: categoryScopeAll ? "all" : "selected",
        fnrh_category_ids: categoryScopeAll ? [] : selectedCategoryIds,
      });
      toast.success("Configuração FNRH salva.");
      setApiPassword("");
      logsQuery.refetch();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast.error(msg);
    }
  };

  if (!establishmentId) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground">Selecione um estabelecimento.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-6">
        <div className="flex items-start gap-3">
          <Shield className="h-6 w-6 text-primary shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold">FNRH — Ficha Nacional de Registro de Hóspedes</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Integração com a API oficial (v2) via HTTPS e autenticação Basic. As credenciais ficam
              armazenadas no servidor; a senha não é exibida após salvar. O cabeçalho{" "}
              <code className="text-xs bg-muted px-1 rounded">cpf_solicitante</code> é obrigatório
              para auditoria (CPF do responsável legal ou recepção). Motivo da viagem, meio de
              transporte, raça/cor, deficiência e gênero são definidos pelo hóspede no check-in web ou
              manual; o envio à API usa valores padrão compatíveis com a documentação apenas quando
              necessário no servidor.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Ativar integração</Label>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, o envio pode ocorrer conforme as regras abaixo (categorias, check-in
                  manual automático e botão na reserva).
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Ambiente</Label>
                <Select value={environment} onValueChange={setEnvironment}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Produção (Serpro)</SelectItem>
                    <SelectItem value="homologation">Homologação</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>URL base (opcional)</Label>
                <p className="text-xs text-muted-foreground">
                  Deve terminar em <code className="text-xs">/FNRH_API/rest/v2</code> (não use{" "}
                  <code className="text-xs">/rest/v1</code> — o envio usa o contrato v2).
                </p>
                <Input
                  placeholder="Ex.: https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2"
                  value={baseUrlOverride}
                  onChange={(e) => setBaseUrlOverride(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Usuário da API (Basic Auth)</Label>
                <Input
                  value={apiUsername}
                  onChange={(e) => setApiUsername(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label>Senha da API</Label>
                <Input
                  type="password"
                  placeholder={
                    row?.password_configured
                      ? "Deixe em branco para manter a senha atual"
                      : "Obrigatória na primeira configuração"
                  }
                  value={apiPassword}
                  onChange={(e) => setApiPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="space-y-2 max-w-md">
              <Label>CPF do solicitante (auditoria FNRH)</Label>
              <Input
                value={cpfSolicitante}
                onChange={(e) => setCpfSolicitante(e.target.value)}
                placeholder="Somente números, 11 dígitos"
              />
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="fnrh-all-categories"
                  checked={categoryScopeAll}
                  onCheckedChange={(v) => setCategoryScopeAll(v === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="fnrh-all-categories" className="cursor-pointer font-medium">
                    Todas as categorias de quarto
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Quando desmarcado, o FNRH aplica apenas às categorias que você selecionar (útil
                    quando parte das acomodações — por exemplo em um prédio — não exige FNRH).
                  </p>
                </div>
              </div>

              {!categoryScopeAll && (
                <div className="space-y-2 pl-1">
                  <Label>Categorias com FNRH</Label>
                  {categoriesQuery.isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : (categoriesQuery.data || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma categoria cadastrada.</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto rounded-md border bg-background p-3 space-y-2">
                      {(categoriesQuery.data || []).map((cat) => (
                          <div key={cat.id} className="flex items-start gap-2">
                            <Checkbox
                              id={`fnrh-cat-${cat.id}`}
                              checked={selectedCategoryIds.includes(cat.id)}
                              onCheckedChange={() => toggleCategory(cat.id)}
                            />
                            <label
                              htmlFor={`fnrh-cat-${cat.id}`}
                              className="text-sm cursor-pointer leading-tight"
                            >
                              {cat.name}
                              {cat.building_id ? (
                                <span className="block text-xs text-muted-foreground">
                                  Categoria vinculada a um prédio
                                </span>
                              ) : null}
                            </label>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2 max-w-xl">
              <Label>Situação inicial do hóspede no envio</Label>
              <p className="text-xs text-muted-foreground">
                Define <code className="text-xs">situacao_hospede</code> no primeiro envio à API
                (hospedagem/registrar). Use «Check-in realizado» quando o envio ocorre após o
                check-in presencial; «Pré-check-in» quando ainda é apenas cadastro prévio.
              </p>
              <Select value={situacao} onValueChange={setSituacao}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FNRH_SITUACOES_HOSPEDE.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="fnrh-auto-web">Pré check-in online (web)</Label>
                  <Switch
                    id="fnrh-auto-web"
                    checked={autoWeb}
                    onCheckedChange={setAutoWeb}
                    disabled={!enabled}
                  />
                </div>
                {!enabled ? (
                  <p className="text-xs text-muted-foreground">
                    Ative primeiro a <strong>integração FNRH</strong> acima para permitir esta opção.
                  </p>
                ) : autoWeb ? (
                  <p className="text-xs text-muted-foreground">
                    <strong>Ligado:</strong> ao concluir o pré check-in no link do hóspede, o sistema
                    pode enviar o cadastro à FNRH (hospedagem/registrar) usando a{" "}
                    <strong>situação inicial do hóspede</strong> definida acima (por exemplo
                    pré-check-in pendente ou realizado) e respeitando o{" "}
                    <strong>escopo de categorias</strong>, quando configurado. A recepção pode
                    complementar ou confirmar depois, conforme o fluxo do estabelecimento.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    <strong>Desligado:</strong> o link do hóspede serve apenas para pré-cadastro; o
                    envio oficial à FNRH fica na recepção (botão «Confirmar check-in na FNRH» na
                    reserva ou envio automático do check-in manual, se estiver ativo ao lado).
                  </p>
                )}
              </div>

              <div className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label>Enviar à FNRH ao concluir check-in manual na recepção</Label>
                  <Switch checked={autoManual} onCheckedChange={setAutoManual} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Quando <strong>ligado</strong>, após finalizar o check-in manual o sistema tenta o
                  envio (hospedagem/registrar) automaticamente, desde que a categoria da reserva
                  esteja no escopo acima. Quando <strong>desligado</strong>, só envia pelo botão
                  «Confirmar check-in na FNRH» na reserva.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar configuração FNRH
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleTestConnection}
                disabled={testLoading || isSaving}
                title="Chama GET /dominios/fnrh/meios_transporte (não registra hospedagem)"
              >
                {testLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <PlugZap className="h-4 w-4 mr-2" />
                )}
                Testar conexão FNRH
              </Button>
            </div>

            {testResult ? (
              <Alert variant={testResult.success ? "default" : "destructive"} className={testResult.success ? "border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-950/20" : undefined}>
                {testResult.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <AlertTitle>
                  {testResult.success ? "Conexão autenticada" : testResult.ip_locked ? "IP bloqueado na FNRH" : "Falha na conexão"}
                </AlertTitle>
                <AlertDescription className="space-y-2 text-sm">
                  <p>{testResult.success ? testResult.message : testResult.error}</p>
                  <ul className="list-none space-y-1 text-xs text-muted-foreground">
                    {testResult.environment_label ? (
                      <li>
                        <span className="font-medium text-foreground">Ambiente:</span> {testResult.environment_label}
                      </li>
                    ) : null}
                    {testResult.base_url ? (
                      <li>
                        <span className="font-medium text-foreground">URL base:</span>{" "}
                        <code className="text-[11px] break-all">{testResult.base_url}</code>
                      </li>
                    ) : null}
                    {testResult.request_url ? (
                      <li>
                        <span className="font-medium text-foreground">Requisição de teste:</span>{" "}
                        <code className="text-[11px] break-all">
                          {testResult.request_method ?? "GET"} {testResult.request_url}
                        </code>
                      </li>
                    ) : null}
                    {testResult.http_status != null ? (
                      <li>
                        <span className="font-medium text-foreground">HTTP:</span> {testResult.http_status}
                      </li>
                    ) : null}
                    {testResult.mensagem ? (
                      <li>
                        <span className="font-medium text-foreground">Mensagem FNRH:</span> {testResult.mensagem}
                      </li>
                    ) : null}
                    {testResult.mensagem_interna ? (
                      <li>
                        <span className="font-medium text-foreground">Mensagem interna:</span> {testResult.mensagem_interna}
                      </li>
                    ) : null}
                    {testResult.api_username_masked ? (
                      <li>
                        <span className="font-medium text-foreground">Usuário testado:</span> {testResult.api_username_masked}
                      </li>
                    ) : null}
                    {testResult.cpf_solicitante_masked ? (
                      <li>
                        <span className="font-medium text-foreground">CPF solicitante:</span> {testResult.cpf_solicitante_masked}
                      </li>
                    ) : null}
                    {testResult.success && testResult.dominio_sample_count != null ? (
                      <li>
                        <span className="font-medium text-foreground">Domínios retornados:</span> {testResult.dominio_sample_count}
                      </li>
                    ) : null}
                    {testResult.portal_url ? (
                      <li>
                        <span className="font-medium text-foreground">Portal para chaves:</span>{" "}
                        <a
                          href={testResult.portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline break-all"
                        >
                          {testResult.portal_url}
                        </a>
                      </li>
                    ) : null}
                  </ul>
                  {(testResult.hints?.length ?? 0) > 0 ? (
                    <div className="pt-1">
                      <p className="text-xs font-medium text-foreground mb-1">Orientações</p>
                      <ul className="list-disc pl-4 text-xs space-y-1">
                        {testResult.hints!.map((hint) => (
                          <li key={hint}>{hint}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
          </>
        )}
      </Card>

      <Card className="p-6">
        <h4 className="text-md font-semibold mb-4">Últimos envios (auditoria)</h4>
        {logsQuery.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>HTTP</TableHead>
                <TableHead>Reserva FNRH</TableHead>
                <TableHead>Erro</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logsQuery.data || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground text-sm">
                    Nenhum envio registrado.
                  </TableCell>
                </TableRow>
              ) : (
                logsQuery.data!.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>{log.status}</TableCell>
                    <TableCell>{log.http_status ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {log.fnrh_reserva_id || "—"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[240px] truncate" title={log.error_message || ""}>
                      {log.error_message || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
