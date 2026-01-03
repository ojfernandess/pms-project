import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useEmailLogs } from "@/hooks/useEmailLogs";
import { Mail, RefreshCw, Search } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function EmailLogsManager() {
  const [filters, setFilters] = useState({
    recipientEmail: "",
    status: undefined as string | undefined,
    eventType: undefined as string | undefined,
  });

  const { logs, isLoading, resendEmail, refetch } = useEmailLogs({
    recipientEmail: filters.recipientEmail,
    status: filters.status || undefined,
    eventType: filters.eventType || undefined,
    limit: 100,
  });

  const statusColors: { [key: string]: string } = {
    sent: "default",
    failed: "destructive",
    pending: "secondary",
    queued: "outline",
    sending: "outline",
  };

  const eventTypeLabels: { [key: string]: string } = {
    "reservation.created": "Reserva Criada",
    "reservation.imported": "Reserva Importada",
    "reservation.cancelled": "Reserva Cancelada",
    "reservation.extended": "Extensão de Reserva",
    "reservation.overbooking": "Overbooking Detectado",
    "preregistration.expired": "Pré-reserva Cancelada por Expiração",
    "payment.confirmed": "Pagamento Confirmado",
    "payment.pending": "Pagamento Pendente",
    "checkin.confirmed": "Check-in Confirmado",
    "checkin.reception.notification": "Notificação de Check-in para Portaria",
    "checkout.completed": "Check-out Concluído",
    "checkout.reminder": "Lembrete de Check-out Próximo",
    "fiscal_document.request": "Solicitação de Documento Fiscal",
    "employee.added_to_establishment": "Funcionário Adicionado ao Estabelecimento",
    "guest.password_reset": "Recuperação de Senha do Hóspede",
  };

  const handleResend = async (logId: string) => {
    try {
      await resendEmail(logId);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Logs de E-mail</h2>
          <p className="text-muted-foreground">
            Histórico completo de e-mails enviados
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid gap-4 md:grid-cols-3 mb-4">
          <div>
            <Label htmlFor="search_email">Buscar por E-mail</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search_email"
                placeholder="E-mail do destinatário"
                value={filters.recipientEmail}
                onChange={(e) => setFilters({ ...filters, recipientEmail: e.target.value })}
                className="pl-10"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="filter_status">Status</Label>
            <Select
              value={filters.status || "all"}
              onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? undefined : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="queued">Na Fila</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="filter_event">Tipo de Evento</Label>
            <Select
              value={filters.eventType || "all"}
              onValueChange={(value) => setFilters({ ...filters, eventType: value === "all" ? undefined : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(eventTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        {isLoading ? (
          <div className="p-6 text-center">Carregando logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            Nenhum log encontrado
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Destinatário</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reserva</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {log.created_at
                      ? format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{log.recipient_email}</div>
                      {log.recipient_name && (
                        <div className="text-xs text-muted-foreground">{log.recipient_name}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">{log.subject}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {eventTypeLabels[log.event_type] || log.event_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusColors[log.status] as any || "secondary"}>
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {log.reservation_id ? (
                      log.reservation?.reservation_code ? (
                        <Badge variant="outline">{log.reservation.reservation_code}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">ID: {log.reservation_id.substring(0, 8)}...</span>
                      )
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {log.status === "failed" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleResend(log.id)}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Reenviar
                      </Button>
                    )}
                    {log.error_message && (
                      <div className="text-xs text-destructive mt-1">
                        {log.error_message}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

