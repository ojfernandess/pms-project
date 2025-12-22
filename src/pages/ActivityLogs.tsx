import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  Search,
  Filter,
  Loader2,
  Calendar,
  User,
  FileText,
  RefreshCw,
} from "lucide-react";
import { useActivityLogs, ActivityLogsFilters, ActivityLog } from "@/hooks/useActivityLogs";
import { formatDate } from "@/lib/reservationUtils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const actionTypeLabels: Record<string, string> = {
  created: "Criado",
  updated: "Atualizado",
  deleted: "Deletado",
  moved: "Movido",
  swapped: "Trocado",
  blocked: "Bloqueado",
  unblocked: "Desbloqueado",
  checked_in: "Check-in",
  checked_out: "Check-out",
  cancelled: "Cancelado",
  payment_added: "Pagamento Adicionado",
  payment_updated: "Pagamento Atualizado",
  payment_refunded: "Pagamento Estornado",
  payment_notes_updated: "Observação de Pagamento Atualizada",
  service_fee_added: "Taxa Adicionada",
  service_fee_updated: "Taxa Atualizada",
  service_fee_removed: "Taxa Removida",
  split: "Dividido",
  merged: "Mesclado",
  status_changed: "Status Alterado",
  room_assigned: "Quarto Atribuído",
  room_changed: "Quarto Alterado",
  dates_changed: "Datas Alteradas",
  amount_changed: "Valor Alterado",
  guest_changed: "Hóspede Alterado",
  resolved: "Resolvido",
  price_applied: "Preço Aplicado",
  bulk_updated: "Atualização em Lote",
  rule_applied: "Regra Aplicada",
};

const entityTypeLabels: Record<string, string> = {
  reservation: "Reserva",
  room: "Quarto",
  client: "Cliente",
  room_category: "Categoria",
  payment: "Pagamento",
  block: "Bloqueio",
  pending: "Pendência",
  rate_calendar: "Calendário de Tarifas",
  pricing_plan: "Plano Tarifário",
  dynamic_pricing_rule: "Regra Dinâmica",
  rate_restriction: "Restrição de Tarifa",
};

const actionTypeColors: Record<string, string> = {
  created: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  updated: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  deleted: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  moved: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
  swapped: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100",
  blocked: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100",
  unblocked: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  checked_in: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100",
  checked_out: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  payment_added: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  payment_updated: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  payment_refunded: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  payment_notes_updated: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100",
  service_fee_added: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  service_fee_updated: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  service_fee_removed: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
};

const ActivityLogs = () => {
  const [filters, setFilters] = useState<ActivityLogsFilters>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  const effectiveFilters: ActivityLogsFilters = useMemo(() => {
    return {
      ...filters,
      search: searchTerm || undefined,
      startDate: startDate ? format(startDate, "yyyy-MM-dd") : undefined,
      endDate: endDate ? format(endDate, "yyyy-MM-dd") : undefined,
    };
  }, [filters, searchTerm, startDate, endDate]);

  const { logs, isLoading, refetch } = useActivityLogs(effectiveFilters);

  // Extrair lista única de usuários dos logs
  const uniqueUsers = useMemo(() => {
    const usersMap = new Map<string, { id: string; name: string }>();
    
    logs.forEach((log) => {
      if (log.user_id && !usersMap.has(log.user_id)) {
        const userName = log.user?.full_name || log.user?.email || log.user_id.substring(0, 8) + "...";
        usersMap.set(log.user_id, {
          id: log.user_id,
          name: userName,
        });
      }
    });
    
    return Array.from(usersMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs;
  }, [logs]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Logs de Atividades</h1>
          <p className="text-muted-foreground">
            Histórico completo de todas as ações realizadas no sistema
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por descrição ou código..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Tipo de Ação */}
          <Select
            value={filters.actionType || "all"}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                actionType: value === "all" ? undefined : value,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Tipo de Ação" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Tipos</SelectItem>
              {Object.entries(actionTypeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tipo de Entidade */}
          <Select
            value={filters.entityType || "all"}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                entityType: value === "all" ? undefined : value,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Tipo de Entidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Entidades</SelectItem>
              {Object.entries(entityTypeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filtro por Usuário */}
          <Select
            value={filters.userId || "all"}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                userId: value === "all" ? undefined : value,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Usuário" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Usuários</SelectItem>
              <SelectItem value="system">Sistema</SelectItem>
              {uniqueUsers.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Data Inicial */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <Calendar className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "dd/MM/yyyy") : "Data Inicial"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <CalendarComponent
                mode="single"
                selected={startDate}
                onSelect={setStartDate}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>

          {/* Data Final */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <Calendar className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "dd/MM/yyyy") : "Data Final"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <CalendarComponent
                mode="single"
                selected={endDate}
                onSelect={setEndDate}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Botão Limpar Filtros */}
        {(filters.actionType ||
          filters.entityType ||
          filters.userId ||
          searchTerm ||
          startDate ||
          endDate) && (
          <div className="mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters({});
                setSearchTerm("");
                setStartDate(undefined);
                setEndDate(undefined);
              }}
            >
              Limpar Filtros
            </Button>
          </div>
        )}
      </Card>

      {/* Tabela de Logs */}
      <Card>
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum log encontrado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(parseISO(log.created_at), "dd/MM/yyyy HH:mm:ss", {
                          locale: ptBR,
                        })}
                      </TableCell>
                      <TableCell>
                        {log.user?.full_name || log.user?.email || "Sistema"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            actionTypeColors[log.action_type] ||
                            "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100"
                          }
                        >
                          {actionTypeLabels[log.action_type] || log.action_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {entityTypeLabels[log.entity_type] || log.entity_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {log.entity_code || "-"}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <div className="truncate" title={log.description}>
                          {log.description}
                        </div>
                      </TableCell>
                      <TableCell>
                        {(log.old_values || log.new_values) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedLog(log);
                              setDetailsDialogOpen(true);
                            }}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Card>

      {/* Dialog de Detalhes */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Atividade</DialogTitle>
            <DialogDescription>
              Valores anteriores e novos da alteração
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4 mt-4">
              {/* Informações básicas */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Ação</p>
                  <p className="text-sm font-semibold">
                    {actionTypeLabels[selectedLog.action_type] || selectedLog.action_type}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Entidade</p>
                  <p className="text-sm font-semibold">
                    {entityTypeLabels[selectedLog.entity_type] || selectedLog.entity_type}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Código</p>
                  <p className="text-sm font-semibold font-mono">
                    {selectedLog.entity_code || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Usuário</p>
                  <p className="text-sm font-semibold">
                    {selectedLog.user?.full_name || selectedLog.user?.email || "Sistema"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Data/Hora</p>
                  <p className="text-sm font-semibold">
                    {format(parseISO(selectedLog.created_at), "dd/MM/yyyy HH:mm:ss", {
                      locale: ptBR,
                    })}
                  </p>
                </div>
              </div>

              {/* Descrição */}
              <div className="mt-4">
                <h3 className="text-sm font-semibold mb-2">Descrição</h3>
                <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                  {selectedLog.description}
                </p>
              </div>

              {/* Valores antigos e novos */}
              {(selectedLog.old_values || selectedLog.new_values) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {/* Valores Anteriores */}
                  {selectedLog.old_values && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">
                        Valores Anteriores
                      </h3>
                      <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md p-4">
                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(selectedLog.old_values, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Valores Novos */}
                  {selectedLog.new_values && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-green-600 dark:text-green-400">
                        Valores Novos
                      </h3>
                      <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-md p-4">
                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(selectedLog.new_values, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Metadados */}
              {selectedLog.metadata && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold mb-2">Metadados</h3>
                  <div className="bg-muted border rounded-md p-4">
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ActivityLogs;

