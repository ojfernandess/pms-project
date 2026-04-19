import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { isFeatureEnabledForEstablishment } from "@/lib/featureAccess";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Users, 
  Search, 
  Merge, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2,
  DollarSign,
  Calendar,
  MapPin
} from "lucide-react";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/reservationUtils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

/** Campos permitidos em PATCH de clients (evita 400 por colunas extras / id no corpo). */
const CLIENT_UPDATE_KEYS = [
  "full_name",
  "email",
  "phone",
  "document_number",
  "document_type",
  "birth_date",
  "nationality",
  "address",
  "city",
  "state",
  "postal_code",
  "country",
  "notes",
  "establishment_id",
] as const;

function buildClientUpdatePayload(merged: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of CLIENT_UPDATE_KEYS) {
    const v = merged[k];
    if (v !== undefined) out[k] = v;
  }
  return out;
}

interface DuplicateGroup {
  id: string;
  clients: any[];
  matchReason: string;
  totalReservations: number;
  totalRevenue: number;
  establishments: string[];
}

const ClientDeduplication = () => {
  const { selectedEstablishment } = useEstablishment();
  const { settings: siteSettings } = useSiteSettings();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<DuplicateGroup | null>(null);
  const [primaryClientId, setPrimaryClientId] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  /** Feedback durante mesclagem (evita “só carregando” sem contexto). */
  const [mergePhase, setMergePhase] = useState<
    "idle" | "profile" | "references" | "cleanup"
  >("idle");

  // Verificar se a funcionalidade está habilitada para este estabelecimento
  const isFeatureEnabled = isFeatureEnabledForEstablishment(
    siteSettings?.features_enabled?.client_deduplication,
    selectedEstablishment?.id
  );

  // Buscar todos os estabelecimentos para mapear IDs
  const { data: allEstablishments } = useQuery({
    queryKey: ["all-establishments-deduplication"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("establishments")
        .select("id, name, numeric_id")
        .order("name", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  // Criar mapeamento de establishment_id para nome e numeric_id
  const establishmentMap = useMemo(() => {
    if (!allEstablishments) return new Map();
    const map = new Map();
    allEstablishments.forEach(est => {
      map.set(est.id, { name: est.name, numeric_id: est.numeric_id });
    });
    return map;
  }, [allEstablishments]);

  // Buscar todos os clientes (de todos os estabelecimentos)
  const { data: allClients, isLoading: clientsLoading } = useQuery({
    queryKey: ["all-clients-deduplication"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Buscar reservas para calcular receita
  const { data: allReservations } = useQuery({
    queryKey: ["all-reservations-deduplication"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reservations")
        .select(`
          id,
          client_id,
          guest_id,
          total_amount,
          paid_amount,
          status,
          checkin_date,
          checkout_date
        `)
        .neq("status", "cancelled");

      if (error) throw error;
      return data || [];
    },
  });

  // Função para normalizar documento (remover caracteres especiais)
  const normalizeDocument = (doc: string | null | undefined): string => {
    if (!doc) return "";
    return doc.replace(/[^0-9]/g, "");
  };

  // Função para normalizar email
  const normalizeEmail = (email: string | null | undefined): string => {
    if (!email) return "";
    return email.toLowerCase().trim();
  };

  // Função para calcular similaridade de nomes (Levenshtein simplificado)
  const nameSimilarity = (name1: string, name2: string): number => {
    const n1 = name1.toLowerCase().trim();
    const n2 = name2.toLowerCase().trim();
    
    if (n1 === n2) return 1;
    
    // Verificar se um nome contém o outro
    if (n1.includes(n2) || n2.includes(n1)) return 0.8;
    
    // Calcular similaridade básica
    const longer = n1.length > n2.length ? n1 : n2;
    const shorter = n1.length > n2.length ? n2 : n1;
    const editDistance = levenshteinDistance(n1, n2);
    return 1 - (editDistance / longer.length);
  };

  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix: number[][] = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  };

  // Identificar grupos de duplicatas
  const duplicateGroups = useMemo(() => {
    if (!allClients || !allReservations) return [];

    const groups: Map<string, DuplicateGroup> = new Map();
    const processed = new Set<string>();

    for (let i = 0; i < allClients.length; i++) {
      const client1 = allClients[i];
      if (processed.has(client1.id)) continue;

      const groupClients: any[] = [client1];
      let matchReason = "";

      for (let j = i + 1; j < allClients.length; j++) {
        const client2 = allClients[j];
        if (processed.has(client2.id)) continue;

        let isDuplicate = false;

        // 1. Mesmo documento (mais confiável)
        const doc1 = normalizeDocument(client1.document_number);
        const doc2 = normalizeDocument(client2.document_number);
        if (doc1 && doc2 && doc1 === doc2 && doc1.length >= 5) {
          isDuplicate = true;
          matchReason = `Documento: ${client1.document_type} ${doc1}`;
        }

        // 2. Mesmo email
        if (!isDuplicate) {
          const email1 = normalizeEmail(client1.email);
          const email2 = normalizeEmail(client2.email);
          if (email1 && email2 && email1 === email2) {
            isDuplicate = true;
            matchReason = `Email: ${email1}`;
          }
        }

        // 3. Nome muito similar + mesmo documento parcial
        if (!isDuplicate) {
          const similarity = nameSimilarity(client1.full_name, client2.full_name);
          if (similarity > 0.85) {
            const doc1Partial = normalizeDocument(client1.document_number).substring(0, 6);
            const doc2Partial = normalizeDocument(client2.document_number).substring(0, 6);
            if (doc1Partial && doc2Partial && doc1Partial === doc2Partial && doc1Partial.length >= 4) {
              isDuplicate = true;
              matchReason = `Nome similar (${Math.round(similarity * 100)}%) + Documento parcial`;
            }
          }
        }

        if (isDuplicate) {
          groupClients.push(client2);
          processed.add(client2.id);
        }
      }

      if (groupClients.length > 1) {
        processed.add(client1.id);
        
        // Calcular estatísticas do grupo
        const clientIds = groupClients.map(c => c.id);
        const groupReservations = allReservations.filter(
          r => clientIds.includes(r.client_id) || clientIds.includes(r.guest_id)
        );
        
        const totalRevenue = groupReservations.reduce((sum, r) => sum + (r.paid_amount || 0), 0);
        const establishments = [...new Set(groupClients.map(c => c.establishment_id).filter(Boolean))];

        const groupId = `group-${client1.id}`;
        groups.set(groupId, {
          id: groupId,
          clients: groupClients,
          matchReason,
          totalReservations: groupReservations.length,
          totalRevenue,
          establishments: establishments as string[],
        });
      }
    }

    return Array.from(groups.values());
  }, [allClients, allReservations]);

  const filteredGroups = useMemo(() => {
    if (!searchTerm || searchTerm.trim() === "") return duplicateGroups;
    
    const term = searchTerm.toLowerCase().trim();
    return duplicateGroups.filter(group =>
      group.clients.some(client =>
        (client.full_name && client.full_name.toLowerCase().includes(term)) ||
        (client.email && client.email.toLowerCase().includes(term)) ||
        (client.document_number && client.document_number.toLowerCase().includes(term)) ||
        (client.phone && client.phone.toLowerCase().includes(term))
      ) ||
      group.matchReason.toLowerCase().includes(term)
    );
  }, [duplicateGroups, searchTerm]);

  const handleSelectGroup = (groupId: string) => {
    const newSelected = new Set(selectedGroups);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
    } else {
      newSelected.add(groupId);
    }
    setSelectedGroups(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedGroups.size === filteredGroups.length) {
      setSelectedGroups(new Set());
    } else {
      setSelectedGroups(new Set(filteredGroups.map(g => g.id)));
    }
  };

  const handleMergeClick = (group: DuplicateGroup) => {
    setSelectedGroup(group);
    // Selecionar o cliente mais antigo como primário por padrão
    const sorted = [...group.clients].sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    setPrimaryClientId(sorted[0].id);
    setMergeDialogOpen(true);
  };

  const handleMerge = async () => {
    if (!selectedGroup || !primaryClientId) return;

    setIsMerging(true);
    setMergePhase("profile");
    try {
      const primaryClient = selectedGroup.clients.find(c => c.id === primaryClientId);
      if (!primaryClient) throw new Error("Cliente primário não encontrado");

      const duplicateIds = selectedGroup.clients
        .filter(c => c.id !== primaryClientId)
        .map(c => c.id);

      if (duplicateIds.length === 0) {
        throw new Error("Não há clientes duplicados para mesclar.");
      }

      // 1. Mesclar dados do cliente primário (usar dados mais completos)
      const mergedData: Record<string, unknown> = { ...primaryClient };
      
      for (const duplicate of selectedGroup.clients) {
        if (duplicate.id === primaryClientId) continue;
        
        // Preencher campos vazios com dados dos duplicados
        if (!mergedData.email && duplicate.email) mergedData.email = duplicate.email;
        if (!mergedData.phone && duplicate.phone) mergedData.phone = duplicate.phone;
        if (!mergedData.address && duplicate.address) mergedData.address = duplicate.address;
        if (!mergedData.city && duplicate.city) mergedData.city = duplicate.city;
        if (!mergedData.state && duplicate.state) mergedData.state = duplicate.state;
        if (!mergedData.postal_code && duplicate.postal_code) mergedData.postal_code = duplicate.postal_code;
        if (!mergedData.birth_date && duplicate.birth_date) mergedData.birth_date = duplicate.birth_date;
        if (!mergedData.nationality && duplicate.nationality) mergedData.nationality = duplicate.nationality;
        if (!mergedData.notes && duplicate.notes) mergedData.notes = duplicate.notes;
        
        // Mesclar notas
        if (duplicate.notes && mergedData.notes && duplicate.notes !== mergedData.notes) {
          mergedData.notes = `${mergedData.notes}\n\n--- Mesclado de ${duplicate.full_name} ---\n${duplicate.notes}`;
        }
      }

      const clientPayload = buildClientUpdatePayload(mergedData);
      if (!clientPayload.full_name && typeof primaryClient.full_name === "string") {
        clientPayload.full_name = primaryClient.full_name;
      }

      // Apenas colunas válidas — evita 400 ao enviar id/created_at/relacionamentos no PATCH
      const { error: updateError } = await supabase
        .from("clients")
        .update(clientPayload as never)
        .eq("id", primaryClientId);

      if (updateError) throw updateError;

      setMergePhase("references");

      // 2. Uma transação no servidor: reservas + financeiro + cotações + … + delete duplicados
      const { error: rpcError } = await supabase.rpc("merge_duplicate_clients_into_primary", {
        p_primary_id: primaryClientId,
        p_duplicate_ids: duplicateIds,
      });

      if (rpcError) {
        console.warn("RPC merge_duplicate_clients_into_primary falhou, tentando modo compatível:", rpcError);
        // Fallback: menos requisições que o loop por duplicado (2 updates em lote + delete)
        const { error: bulkClient } = await supabase
          .from("reservations")
          .update({ client_id: primaryClientId })
          .in("client_id", duplicateIds);
        if (bulkClient) throw bulkClient;

        const { error: bulkGuest } = await supabase
          .from("reservations")
          .update({ guest_id: primaryClientId })
          .in("guest_id", duplicateIds);
        if (bulkGuest) throw bulkGuest;

        setMergePhase("cleanup");
        const { error: deleteError } = await supabase
          .from("clients")
          .delete()
          .in("id", duplicateIds);
        if (deleteError) throw deleteError;

        toast.success(
          `${duplicateIds.length} cliente(s) mesclado(s) em modo compatível (apenas reservas). Publique a migração merge_duplicate_clients no Supabase para mesclagem completa.`,
          { duration: 10000 },
        );
      } else {
        setMergePhase("cleanup");
        toast.success(`${duplicateIds.length} cliente(s) mesclado(s) com sucesso!`);
      }

      // Invalidar queries
      queryClient.invalidateQueries({ queryKey: ["all-clients-deduplication"] });
      queryClient.invalidateQueries({ queryKey: ["all-reservations-deduplication"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      setMergeDialogOpen(false);
      setSelectedGroup(null);
      setPrimaryClientId(null);
      setSelectedGroups(new Set());
    } catch (error: unknown) {
      console.error("Erro ao mesclar clientes:", error);
      const msg =
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof (error as { message: unknown }).message === "string"
          ? (error as { message: string }).message
          : "Erro ao mesclar clientes";
      const details =
        error &&
        typeof error === "object" &&
        "details" in error &&
        typeof (error as { details: unknown }).details === "string"
          ? (error as { details: string }).details
          : "";
      toast.error(details ? `${msg} (${details})` : msg);
    } finally {
      setIsMerging(false);
      setMergePhase("idle");
    }
  };

  const totalDuplicates = duplicateGroups.reduce((sum, group) => sum + group.clients.length - 1, 0);
  const totalRevenue = duplicateGroups.reduce((sum, group) => sum + group.totalRevenue, 0);

  // Se a funcionalidade não está habilitada, mostrar mensagem
  if (!isFeatureEnabled) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Centralização de Clientes</h1>
            <p className="text-muted-foreground">
              Identifique, mescle e elimine perfis duplicados de hóspedes
            </p>
          </div>
        </div>
        <Card className="p-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Esta funcionalidade não está habilitada para este estabelecimento. 
              Entre em contato com o administrador do sistema para habilitar a Centralização de Clientes.
            </AlertDescription>
          </Alert>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Centralização de Clientes</h1>
          <p className="text-muted-foreground">
            Identifique, mescle e elimine perfis duplicados de hóspedes
          </p>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Grupos de Duplicatas</p>
              <p className="text-2xl font-bold">{duplicateGroups.length}</p>
            </div>
            <Users className="h-8 w-8 text-blue-500" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Clientes Duplicados</p>
              <p className="text-2xl font-bold">{totalDuplicates}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Receita Total</p>
              <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-green-500" />
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Reservas Totais</p>
              <p className="text-2xl font-bold">
                {duplicateGroups.reduce((sum, g) => sum + g.totalReservations, 0)}
              </p>
            </div>
            <Calendar className="h-8 w-8 text-purple-500" />
          </div>
        </Card>
      </div>

      {/* Aviso */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Esta ferramenta identifica clientes duplicados por documento, email ou nome similar.
          Ao mesclar, todos os dados (reservas, pagamentos, histórico) serão consolidados no cliente primário.
          <strong className="block mt-2">Atenção: Esta ação não pode ser desfeita!</strong>
        </AlertDescription>
      </Alert>

      {/* Busca */}
      <Card className="p-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou documento..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {filteredGroups.length > 0 && (
            <Button
              variant="outline"
              onClick={handleSelectAll}
            >
              {selectedGroups.size === filteredGroups.length ? "Desselecionar Todos" : "Selecionar Todos"}
            </Button>
          )}
        </div>
      </Card>

      {/* Lista de Duplicatas */}
      {clientsLoading ? (
        <Card className="p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Carregando clientes...</p>
        </Card>
      ) : filteredGroups.length === 0 ? (
        <Card className="p-8 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-lg font-semibold">Nenhuma duplicata encontrada!</p>
          <p className="text-muted-foreground mt-2">
            Todos os clientes estão únicos no sistema.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => (
            <Card key={group.id} className="p-4">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4 flex-1">
                  <Checkbox
                    checked={selectedGroups.has(group.id)}
                    onCheckedChange={() => handleSelectGroup(group.id)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="destructive">
                        {group.clients.length} duplicata(s)
                      </Badge>
                      <Badge variant="outline">{group.matchReason}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {group.totalReservations} reserva(s)
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        {formatCurrency(group.totalRevenue)} receita
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        {group.establishments.length} estabelecimento(s)
                      </div>
                    </div>
                  </div>
                </div>
                <Button
                  onClick={() => handleMergeClick(group)}
                  size="sm"
                  className="gap-2"
                >
                  <Merge className="h-4 w-4" />
                  Mesclar
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Documento</TableHead>
                    <TableHead>Cadastrado em</TableHead>
                    <TableHead>Estabelecimento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">
                        {client.full_name}
                        {client.id === primaryClientId && (
                          <Badge variant="default" className="ml-2">Primário</Badge>
                        )}
                      </TableCell>
                      <TableCell>{client.email || "-"}</TableCell>
                      <TableCell>{client.phone || "-"}</TableCell>
                      <TableCell>
                        {client.document_type} {client.document_number || "-"}
                      </TableCell>
                      <TableCell>
                        {format(new Date(client.created_at), "dd/MM/yyyy", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {client.establishment_id ? (() => {
                          const establishment = establishmentMap.get(client.establishment_id);
                          if (establishment) {
                            return `${establishment.name} (ID: ${establishment.numeric_id})`;
                          }
                          return client.establishment_id;
                        })() : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog de Mesclagem */}
      <Dialog
        open={mergeDialogOpen}
        onOpenChange={(open) => {
          if (!open && isMerging) return;
          setMergeDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mesclar Clientes Duplicados</DialogTitle>
            <DialogDescription>
              Selecione o cliente primário que receberá todos os dados consolidados.
              Os outros clientes serão mesclados e removidos.
            </DialogDescription>
          </DialogHeader>

          {selectedGroup && (
            <div className="space-y-4">
              {isMerging && (
                <Alert className="border-primary/30 bg-primary/5">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <AlertDescription className="text-sm">
                    {mergePhase === "profile" && (
                      <>
                        <strong>Passo 1/2:</strong> a gravar dados consolidados no cliente primário…
                      </>
                    )}
                    {mergePhase === "references" && (
                      <>
                        <strong>Passo 2/2:</strong> a reatribuir reservas, registos financeiros e a remover
                        perfis duplicados (pode demorar com muitos vínculos)…
                      </>
                    )}
                    {mergePhase === "cleanup" && (
                      <>A concluir e a atualizar a lista…</>
                    )}
                    {mergePhase === "idle" && <>A processar…</>}
                  </AlertDescription>
                </Alert>
              )}
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Atenção:</strong> Esta ação irá:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Consolidar todas as reservas no cliente primário</li>
                    <li>Mesclar informações de contato e endereço</li>
                    <li>Calcular o valor vitalício consolidado</li>
                    <li>Remover os clientes duplicados</li>
                  </ul>
                  <strong className="block mt-2">Esta ação não pode ser desfeita!</strong>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Selecione o Cliente Primário:</Label>
                {selectedGroup.clients.map((client) => {
                  const clientReservations = allReservations?.filter(
                    r => r.client_id === client.id || r.guest_id === client.id
                  ) || [];
                  const clientRevenue = clientReservations.reduce(
                    (sum, r) => sum + (r.paid_amount || 0), 0
                  );

                  return (
                    <div
                      key={client.id}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                        primaryClientId === client.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => setPrimaryClientId(client.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="radio"
                              checked={primaryClientId === client.id}
                              onChange={() => setPrimaryClientId(client.id)}
                              className="mt-1"
                            />
                            <span className="font-semibold">{client.full_name}</span>
                            {new Date(client.created_at) < new Date(selectedGroup.clients.find(c => c.id !== client.id)?.created_at || 0) && (
                              <Badge variant="outline">Mais antigo</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1 ml-6">
                            <div>Email: {client.email || "-"}</div>
                            <div>Telefone: {client.phone || "-"}</div>
                            <div>Documento: {client.document_type} {client.document_number || "-"}</div>
                            <div className="flex items-center gap-4 mt-2">
                              <span>{clientReservations.length} reserva(s)</span>
                              <span className="font-semibold text-green-600">
                                {formatCurrency(clientRevenue)} receita
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-semibold mb-2">Resumo da Consolidação:</h4>
                <div className="text-sm space-y-1">
                  <div>Total de clientes a mesclar: {selectedGroup.clients.length}</div>
                  <div>Total de reservas: {selectedGroup.totalReservations}</div>
                  <div className="font-semibold text-green-600">
                    Valor vitalício consolidado: {formatCurrency(selectedGroup.totalRevenue)}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setMergeDialogOpen(false)}
              disabled={isMerging}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleMerge}
              disabled={!primaryClientId || isMerging}
              className="gap-2"
            >
              {isMerging ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Mesclando...
                </>
              ) : (
                <>
                  <Merge className="h-4 w-4" />
                  Confirmar Mesclagem
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClientDeduplication;

