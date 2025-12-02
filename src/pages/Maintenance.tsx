import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Filter, AlertTriangle, Wrench, CheckCircle, Clock, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMaintenance } from "@/hooks/useMaintenance";
import { MaintenanceTicketDialog } from "@/components/maintenance/MaintenanceTicketDialog";
import { formatDate } from "@/lib/reservationUtils";
import { usePermissions } from "@/hooks/usePermissions";
import { MoreVertical } from "lucide-react";

const Maintenance = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const { tickets, isLoading, refetch, startTicket, completeTicket, cancelTicket } = useMaintenance();
  const { canCreate, canUpdate } = usePermissions();

  // Estatísticas
  const stats = useMemo(() => {
    const open = tickets.filter((t: any) => t.status === "open").length;
    const inProgress = tickets.filter((t: any) => t.status === "in_progress").length;
    const urgent = tickets.filter((t: any) => t.priority === "urgent" && t.status !== "completed").length;
    const completed = tickets.filter((t: any) => t.status === "completed").length;

    return { open, inProgress, urgent, completed };
  }, [tickets]);

  // Filtrar tickets
  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket: any) => {
      const matchesSearch =
        ticket.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.rooms?.room_number?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tickets, searchTerm, statusFilter, priorityFilter]);

  const getPriorityBadge = (priority: string) => {
    const priorityMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
      low: { label: "Baixa", variant: "outline" },
      medium: { label: "Média", variant: "secondary" },
      high: { label: "Alta", variant: "default" },
      urgent: { label: "Urgente", variant: "destructive" },
    };

    const priorityInfo = priorityMap[priority] || { label: priority, variant: "outline" };
    return <Badge variant={priorityInfo.variant}>{priorityInfo.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
      open: { label: "Aberto", variant: "secondary" },
      in_progress: { label: "Em Progresso", variant: "default" },
      completed: { label: "Concluído", variant: "outline" },
      cancelled: { label: "Cancelado", variant: "destructive" },
    };

    const statusInfo = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const handleEdit = (id: string) => {
    setSelectedTicketId(id);
    setDialogOpen(true);
  };

  const handleNew = () => {
    console.log("handleNew chamado (Maintenance)");
    setSelectedTicketId(undefined);
    setDialogOpen(true);
  };

  const handleStart = async (id: string) => {
    try {
      await startTicket(id);
    } catch (error) {
      // Error já tratado no hook
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await completeTicket(id);
    } catch (error) {
      // Error já tratado no hook
    }
  };

  const handleCancel = async (id: string) => {
    if (confirm("Tem certeza que deseja cancelar este ticket?")) {
      try {
        await cancelTicket(id);
      } catch (error) {
        // Error já tratado no hook
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Manutenção</h1>
          <p className="text-muted-foreground">Gerencie tickets de manutenção dos quartos</p>
        </div>
        <Button 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleNew();
          }}
          type="button"
        >
          <Plus className="h-4 w-4 mr-2" />
          Abrir Chamado
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-warning/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.open}</p>
              <p className="text-sm text-muted-foreground">Abertos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Wrench className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.inProgress}</p>
              <p className="text-sm text-muted-foreground">Em Progresso</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.urgent}</p>
              <p className="text-sm text-muted-foreground">Urgentes</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-sm text-muted-foreground">Concluídos</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por título, descrição ou quarto..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Filter className="h-4 w-4 mr-2" />
                Filtros
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="p-2">
                <p className="text-sm font-medium mb-2">Status</p>
                <div className="space-y-1">
                  <DropdownMenuItem onClick={() => setStatusFilter("all")}>
                    Todos
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("open")}>
                    Aberto
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("in_progress")}>
                    Em Progresso
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("completed")}>
                    Concluído
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setStatusFilter("cancelled")}>
                    Cancelado
                  </DropdownMenuItem>
                </div>
              </div>
              <div className="p-2 border-t">
                <p className="text-sm font-medium mb-2">Prioridade</p>
                <div className="space-y-1">
                  <DropdownMenuItem onClick={() => setPriorityFilter("all")}>
                    Todas
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPriorityFilter("urgent")}>
                    Urgente
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPriorityFilter("high")}>
                    Alta
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPriorityFilter("medium")}>
                    Média
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPriorityFilter("low")}>
                    Baixa
                  </DropdownMenuItem>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhum ticket encontrado
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quarto</TableHead>
                <TableHead>Título</TableHead>
                <TableHead>Prioridade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Aberto em</TableHead>
                <TableHead>Concluído em</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTickets.map((ticket: any) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-medium">
                    {ticket.rooms?.room_number || "N/A"}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{ticket.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {ticket.description}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>{getPriorityBadge(ticket.priority)}</TableCell>
                  <TableCell>{getStatusBadge(ticket.status)}</TableCell>
                  <TableCell>{formatDate(ticket.opened_at)}</TableCell>
                  <TableCell>
                    {ticket.completed_at ? formatDate(ticket.completed_at) : "-"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {(canUpdate("maintenance") || canCreate("maintenance")) && (
                          <DropdownMenuItem 
                            onSelect={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleEdit(ticket.id);
                            }}
                          >
                            Editar
                          </DropdownMenuItem>
                        )}
                        {(canUpdate("maintenance") || canCreate("maintenance")) && ticket.status === "open" && (
                          <DropdownMenuItem 
                            onSelect={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleStart(ticket.id);
                            }}
                          >
                            Iniciar Manutenção
                          </DropdownMenuItem>
                        )}
                        {(canUpdate("maintenance") || canCreate("maintenance")) && ticket.status === "in_progress" && (
                          <DropdownMenuItem 
                            onSelect={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleComplete(ticket.id);
                            }}
                          >
                            Concluir
                          </DropdownMenuItem>
                        )}
                        {(canUpdate("maintenance") || canCreate("maintenance")) && !["completed", "cancelled"].includes(ticket.status) && (
                          <DropdownMenuItem
                            onSelect={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleCancel(ticket.id);
                            }}
                            className="text-destructive"
                          >
                            Cancelar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <MaintenanceTicketDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => {
          refetch();
          setDialogOpen(false);
          setSelectedTicketId(undefined);
        }}
        ticketId={selectedTicketId}
      />
    </div>
  );
};

export default Maintenance;

