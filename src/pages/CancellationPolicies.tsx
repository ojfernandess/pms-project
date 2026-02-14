import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, HelpCircle } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCancellationPolicies } from "@/hooks/useCancellationPolicies";
import { CancellationPolicyDialog } from "@/components/cancellation/CancellationPolicyDialog";
import { CancellationPolicySimulator } from "@/components/cancellation/CancellationPolicySimulator";
import { CancellationPolicyTestSuite } from "@/components/cancellation/CancellationPolicyTestSuite";
import { NoShowProcessor } from "@/components/cancellation/NoShowProcessor";
import { NoShowSelector } from "@/components/cancellation/NoShowSelector";
import { NoShowScheduleConfig } from "@/components/cancellation/NoShowScheduleConfig";
import { formatDate } from "@/lib/reservationUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CancellationPolicies = () => {
  const { policies, isLoading, refetch, deletePolicy } = useCancellationPolicies();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [policyToDelete, setPolicyToDelete] = useState<string | null>(null);
  const [selectedPolicyForSimulator, setSelectedPolicyForSimulator] = useState<any>(null);

  const handleDelete = async () => {
    if (!policyToDelete) return;
    try {
      await deletePolicy(policyToDelete);
      setDeleteDialogOpen(false);
      setPolicyToDelete(null);
    } catch (error) {
      console.error(error);
    }
  };

  const openDeleteDialog = (id: string) => {
    setPolicyToDelete(id);
    setDeleteDialogOpen(true);
  };

  const formatPolicyDescription = (policy: any) => {
    // Usar o resumo gerado automaticamente se disponível
    if (policy.policy_summary) {
      return policy.policy_summary;
    }

    let description = "";
    
    if (policy.has_free_cancellation && policy.free_cancellation_deadline) {
      description += `O hóspede pode cancelar gratuitamente ${policy.free_cancellation_deadline}. `;
      
      // Taxa após o prazo de cancelamento gratuito
      if (policy.cancellation_fee_after_deadline_type === "first_night") {
        description += `O hóspede deverá pagar o custo da primeira diária em caso de cancelamento após o prazo de cancelamento gratuito. `;
      } else if (policy.cancellation_fee_after_deadline_type === "percentage" && policy.cancellation_fee_after_deadline_percentage) {
        description += `O hóspede deverá pagar ${policy.cancellation_fee_after_deadline_percentage}% do preço total em caso de cancelamento após o prazo de cancelamento gratuito. `;
      }
    } else {
      // Sem cancelamento gratuito
      if (policy.cancellation_fee_type === "first_night") {
        description += "O hóspede deverá pagar o custo da primeira diária em caso de cancelamento";
        if (policy.cancellation_fee_when && policy.cancellation_fee_when !== "em qualquer momento") {
          description += ` ${policy.cancellation_fee_when}`;
        }
        description += ". ";
      } else if (policy.cancellation_fee_type === "percentage" && policy.cancellation_fee_percentage) {
        description += `O hóspede deverá pagar ${policy.cancellation_fee_percentage}% do preço total em caso de cancelamento`;
        if (policy.cancellation_fee_when && policy.cancellation_fee_when !== "em qualquer momento") {
          description += ` ${policy.cancellation_fee_when}`;
        }
        description += ". ";
      }
    }

    // Taxa de não comparecimento
    if (policy.no_show_fee_type === "same_as_cancellation") {
      description += "Em caso de não comparecimento, o hóspede será cobrado do preço total da reserva. ";
    } else if (policy.no_show_fee_type === "first_night") {
      description += "Em caso de não comparecimento, o hóspede será cobrado o custo da primeira diária. ";
    } else if (policy.no_show_fee_type === "percentage" && policy.no_show_fee_percentage) {
      description += `Em caso de não comparecimento, o hóspede será cobrado ${policy.no_show_fee_percentage}% do preço total. `;
    }

    // Pré-pagamento
    if (policy.requires_prepayment && policy.prepayment_percentage) {
      description += `O hóspede será cobrado um pré-pagamento de ${policy.prepayment_percentage}% do preço total após a reserva.`;
      if (policy.prepayment_summary) {
        description += ` ${policy.prepayment_summary}`;
      }
    }

    return description || policy.description || "Política de cancelamento configurada.";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Políticas de Cancelamento</h1>
          <p className="text-muted-foreground">
            Gerencie as políticas de cancelamento que podem ser associadas aos planos tarifários
          </p>
        </div>
        <Button onClick={() => {
          setSelectedPolicyId(undefined);
          setDialogOpen(true);
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Criar nova política de cancelamento
        </Button>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Carregando políticas...</p>
        </Card>
      ) : policies.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">
            Nenhuma política de cancelamento cadastrada.
          </p>
          <Button onClick={() => {
            setSelectedPolicyId(undefined);
            setDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Criar primeira política
          </Button>
        </Card>
      ) : (
        <Tabs defaultValue="list" className="space-y-4">
          <TabsList>
            <TabsTrigger value="list">Lista de Políticas</TabsTrigger>
            <TabsTrigger value="simulator">Simulador</TabsTrigger>
            <TabsTrigger value="tests">Testes</TabsTrigger>
            <TabsTrigger value="no-shows">No-Shows</TabsTrigger>
          </TabsList>
          
          <TabsContent value="list" className="space-y-4">
            <div className="grid gap-4">
              {policies.map((policy) => (
                <Card key={policy.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold">{policy.name}</h3>
                        {policy.is_active ? (
                          <Badge variant="default" className="bg-green-500">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Inativo</Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground mb-4 whitespace-pre-line">
                        {policy.policy_summary ? (
                          <div>
                            {policy.policy_summary.split('. ').map((sentence: string, idx: number, arr: string[]) => (
                              <p key={idx} className="mb-1">{sentence}{idx < arr.length - 1 ? '.' : ''}</p>
                            ))}
                          </div>
                        ) : (
                          <p>{formatPolicyDescription(policy)}</p>
                        )}
                      </div>
                      {policy.requires_prepayment && policy.prepayment_summary && (
                        <div className="text-sm text-muted-foreground mb-4 whitespace-pre-line">
                          {policy.prepayment_summary.split('. ').map((sentence: string, idx: number, arr: string[]) => (
                            <p key={idx} className="mb-1">{sentence}{idx < arr.length - 1 ? '.' : ''}</p>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        <p>Dados de: {formatDate(policy.created_at)} a {formatDate(policy.updated_at)}</p>
                        <p>Total de diárias: 0</p>
                        <p>Faturamento total: R$ 0,00</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedPolicyId(policy.id);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedPolicyForSimulator(policy)}
                      >
                        <HelpCircle className="h-4 w-4 mr-2" />
                        Simular
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openDeleteDialog(policy.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="simulator" className="space-y-4">
            {selectedPolicyForSimulator ? (
              <CancellationPolicySimulator 
                policy={selectedPolicyForSimulator} 
                onBack={() => setSelectedPolicyForSimulator(null)}
              />
            ) : policies.length > 0 ? (
              <Card className="p-6">
                <p className="text-muted-foreground mb-4">
                  Selecione uma política da lista e clique em "Simular" para testar diferentes cenários de cancelamento.
                </p>
                <div className="grid gap-4">
                  {policies.map((policy) => (
                    <Card key={policy.id} className="p-4 cursor-pointer hover:bg-muted/50" onClick={() => setSelectedPolicyForSimulator(policy)}>
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold">{policy.name}</h4>
                          <p className="text-sm text-muted-foreground">{policy.policy_summary || "Sem descrição"}</p>
                        </div>
                        <Button variant="outline" size="sm">
                          Selecionar
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </Card>
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">
                  Crie uma política de cancelamento primeiro para usar o simulador.
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="tests" className="space-y-4">
            <CancellationPolicyTestSuite />
          </TabsContent>

          <TabsContent value="no-shows" className="space-y-4">
            <NoShowSelector />
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <NoShowScheduleConfig />
              
              <div className="space-y-4">
                <NoShowProcessor 
                  defaultAutoProcess={false}
                  defaultManualEnabled={true}
                  intervalMinutes={60}
                />
                
                <Card className="p-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold">Sobre o Processamento de No-Shows</h4>
                    <p className="text-sm text-muted-foreground">
                      O sistema detecta automaticamente reservas confirmadas que passaram do horário de check-in (18:00)
                      sem que o hóspede tenha feito check-in. Ao processar, o sistema:
                    </p>
                    <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                      <li>Marca a reserva como "no-show"</li>
                      <li>Calcula a multa de no-show baseada na política de cancelamento</li>
                      <li>Cria uma fatura para a multa</li>
                      <li>Registra um log de auditoria</li>
                    </ul>
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm font-semibold text-amber-800 mb-1">
                        ⚠️ Função RPC não encontrada
                      </p>
                      <p className="text-xs text-amber-700">
                        Para melhor performance, aplique a migration <code className="bg-amber-100 px-1 rounded">20251225000016_create_no_show_processor_function.sql</code> no Supabase.
                        O sistema continuará funcionando usando o método via serviço como fallback.
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground mt-4">
                      <strong>Recomendação:</strong> Configure um processamento automático diário às 19:00
                      usando Supabase Edge Functions ou cron job.
                    </p>
                  </div>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}

      <CancellationPolicyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          refetch();
          setSelectedPolicyId(undefined);
        }}
        policyId={selectedPolicyId}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta política de cancelamento? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CancellationPolicies;

