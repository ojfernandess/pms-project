import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useEmailQueue } from "@/hooks/useEmailQueue";
import { RefreshCw, Play, X, AlertCircle, Trash2 } from "lucide-react";
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export function EmailQueueManager() {
  const {
    queue,
    isLoading,
    refetch,
    processQueueItem,
    cancelQueueItem,
    retryQueueItem,
    clearQueue,
    isProcessing,
    isClearing,
  } = useEmailQueue({
    status: "pending",
    limit: 50,
  });

  const [clearDialogOpen, setClearDialogOpen] = useState(false);

  const statusColors: { [key: string]: string } = {
    sent: "default",
    failed: "destructive",
    pending: "secondary",
    queued: "outline",
    sending: "outline",
    cancelled: "outline",
  };

  const handleProcess = async (itemId: string) => {
    try {
      const success = await processQueueItem(itemId);
      if (success) {
        toast.success("E-mail processado com sucesso!");
        refetch();
      } else {
        toast.error("Erro ao processar e-mail. Verifique os logs.");
        refetch();
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao processar e-mail");
      refetch();
    }
  };

  const handleCancel = async (itemId: string) => {
    try {
      await cancelQueueItem(itemId);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao cancelar e-mail");
    }
  };

  const handleRetry = async (itemId: string) => {
    try {
      await retryQueueItem(itemId);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "Erro ao reprocessar e-mail");
    }
  };

  const pendingEmails = queue.filter((item: any) => item.status === "pending");
  const failedEmails = queue.filter((item: any) => item.status === "failed");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Fila de E-mails</h2>
          <p className="text-muted-foreground">
            Gerencie a fila de e-mails pendentes e falhados
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={async () => {
              try {
                await refetch();
                toast.success('Fila atualizada!');
              } catch (error: any) {
                toast.error(error.message || 'Erro ao atualizar fila');
              }
            }} 
            variant="outline" 
            size="sm"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          {queue.length > 0 && (
            <Button
              onClick={() => setClearDialogOpen(true)}
              variant="destructive"
              size="sm"
              disabled={isClearing}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar Fila
            </Button>
          )}
          {pendingEmails.length > 0 && (
            <Button
              onClick={async () => {
                toast.info(`Processando ${pendingEmails.length} e-mail(s)...`);
                for (const item of pendingEmails) {
                  await handleProcess(item.id);
                }
              }}
              disabled={isProcessing}
            >
              <Play className="h-4 w-4 mr-2" />
              Processar Todos ({pendingEmails.length})
            </Button>
          )}
        </div>
      </div>

      {failedEmails.length > 0 && (
        <Card className="p-4 border-destructive">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <div>
              <p className="font-semibold">
                {failedEmails.length} e-mail(s) falharam
              </p>
              <p className="text-sm">
                Verifique as configurações e tente reprocessar
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <div className="p-6 text-center">Carregando fila...</div>
        ) : queue.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            Nenhum e-mail na fila
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.created_at
                      ? format(new Date(item.created_at), "dd/MM/yyyy HH:mm", {
                          locale: ptBR,
                        })
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{item.recipient_email}</div>
                      {item.recipient_name && (
                        <div className="text-xs text-muted-foreground">
                          {item.recipient_name}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {item.subject}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[item.status] as any || "secondary"}>
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.retry_count || 0} / {item.max_retries || 3}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {item.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleProcess(item.id)}
                          disabled={isProcessing}
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Processar
                        </Button>
                      )}
                      {item.status === "failed" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRetry(item.id)}
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Tentar Novamente
                        </Button>
                      )}
                      {item.status === "pending" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(item.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {item.error_message && (
                      <div className="text-xs text-destructive mt-1 max-w-xs">
                        {item.error_message}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Dialog: Confirmar Limpeza da Fila */}
      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Limpeza da Fila</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja limpar toda a fila de e-mails? Esta ação irá deletar todos os e-mails pendentes, falhados e cancelados da fila. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await clearQueue();
                  setClearDialogOpen(false);
                  // Aguardar um pouco antes de atualizar para garantir que a deleção foi processada
                  setTimeout(() => {
                    refetch();
                  }, 500);
                } catch (error: any) {
                  console.error('Erro ao limpar fila:', error);
                  toast.error(error.message || 'Erro ao limpar fila');
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isClearing}
            >
              {isClearing ? 'Limpando...' : 'Limpar Fila'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

