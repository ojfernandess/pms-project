import { useState, useMemo, useEffect } from "react";
import type React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Search, 
  Filter, 
  AlertTriangle, 
  Wrench, 
  CheckCircle, 
  Clock, 
  Loader2,
  MoreVertical,
  Play,
  CheckCircle2,
  XCircle,
  Image as ImageIcon
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMaintenance } from "@/hooks/useMaintenance";
import { MaintenanceTicketDialog } from "@/components/maintenance/MaintenanceTicketDialog";
import { formatDate } from "@/lib/reservationUtils";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";

// Função para converter URL antiga de "documents" para "maintenance"
// Também garante que URLs do bucket maintenance estejam corretas
const convertUrlToMaintenanceBucket = (url: string): string => {
  if (!url) return url;
  
  // Se a URL contém "/documents/", substituir por "/maintenance/"
  if (url.includes('/documents/')) {
    return url.replace(/\/documents\//g, '/maintenance/');
  }
  
  // Se já é uma URL do maintenance, retornar como está
  if (url.includes('/maintenance/')) {
    return url;
  }
  
  // Se for uma URL do Supabase Storage mas sem o bucket específico, tentar adicionar
  // Exemplo: /storage/v1/object/public/... -> /storage/v1/object/public/maintenance/...
  if (url.includes('/storage/v1/object/public/') && !url.includes('/maintenance/') && !url.includes('/documents/')) {
    // Tentar extrair o caminho após /public/ e adicionar maintenance/
    const match = url.match(/\/storage\/v1\/object\/public\/(.+)$/);
    if (match && match[1] && !match[1].startsWith('maintenance/')) {
      return url.replace(/\/storage\/v1\/object\/public\//, '/storage/v1/object/public/maintenance/');
    }
  }
  
  return url;
};

// Componente para exibir thumbnail com tratamento de erro
const AttachmentThumbnail = ({ attachment }: { attachment: any }) => {
  const [imageError, setImageError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>(convertUrlToMaintenanceBucket(attachment.file_url));
  
  // Tentar gerar signed URL se a URL pública falhar
  useEffect(() => {
    const tryGenerateSignedUrl = async () => {
      if (imageError && attachment.file_url) {
        try {
          // Extrair o caminho do arquivo da URL
          const extractFilePath = (url: string): string | null => {
            if (!url) return null;
            // Se já for um caminho relativo, retornar direto
            if (url.startsWith("maintenance/")) return url;
            // Tentar extrair o caminho após /maintenance/
            const match = url.match(/\/maintenance\/(.+)$/);
            if (match) return `maintenance/${match[1]}`;
            return null;
          };
          
          const filePath = extractFilePath(attachment.file_url);
          if (filePath) {
            const { data: signedData, error } = await supabase.storage
              .from("maintenance")
              .createSignedUrl(filePath, 3600); // 1 hora
            
            if (!error && signedData) {
              setImageUrl(signedData.signedUrl);
              setImageError(false);
            }
          }
        } catch (error) {
          console.error("Erro ao gerar signed URL:", error);
        }
      }
    };
    
    if (imageError) {
      tryGenerateSignedUrl();
    }
  }, [imageError, attachment.file_url]);
  
  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Silenciar o erro e apenas marcar como erro para mostrar placeholder
    e.preventDefault();
    setImageError(true);
  };
  
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Sempre permitir tentar abrir a URL, mesmo se a imagem falhou
    if (imageError) {
      e.preventDefault();
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    }
  };
  
  return (
    <a
      href={imageUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="relative group"
      onClick={handleClick}
    >
      {imageError ? (
        <div className="h-12 w-12 flex flex-col items-center justify-center bg-slate-100 rounded border border-slate-200 hover:border-blue-300 transition-colors">
          <ImageIcon className="h-4 w-4 text-slate-400 mb-0.5" />
          <span className="text-[8px] text-slate-500 text-center px-1">Foto</span>
        </div>
      ) : (
        <img
          src={imageUrl}
          alt={attachment.file_name || "Anexo"}
          className="h-12 w-12 object-cover rounded border border-slate-200 hover:border-blue-300 transition-colors"
          onError={handleImageError}
          loading="lazy"
        />
      )}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded" />
    </a>
  );
};

const Maintenance = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedKPI, setSelectedKPI] = useState<string | null>(null);

  const { tickets, isLoading, refetch, startTicket, completeTicket, cancelTicket } = useMaintenance();
  const { canCreate, canUpdate } = usePermissions();

  // Estatísticas
  const stats = useMemo(() => {
    const open = tickets.filter((t: any) => t.status === "open").length;
    const inProgress = tickets.filter((t: any) => t.status === "in_progress").length;
    const urgent = tickets.filter((t: any) => t.priority === "urgent" && !["completed", "cancelled"].includes(t.status)).length;
    const completed = tickets.filter((t: any) => t.status === "completed").length;

    return { open, inProgress, urgent, completed };
  }, [tickets]);

  // Filtrar tickets baseado em KPI selecionado
  const getFilterFromKPI = (kpi: string | null) => {
    if (!kpi) return { status: "all", priority: "all" };
    
    switch (kpi) {
      case "open":
        return { status: "open", priority: "all" };
      case "inProgress":
        return { status: "in_progress", priority: "all" };
      case "urgent":
        return { status: "all", priority: "urgent" };
      case "completed":
        return { status: "completed", priority: "all" };
      default:
        return { status: "all", priority: "all" };
    }
  };

  // Aplicar filtro quando KPI é clicado
  const handleKPIClick = (kpi: string) => {
    if (selectedKPI === kpi) {
      // Se já está selecionado, deselecionar
      setSelectedKPI(null);
      setStatusFilter("all");
      setPriorityFilter("all");
    } else {
      setSelectedKPI(kpi);
      const filters = getFilterFromKPI(kpi);
      setStatusFilter(filters.status);
      setPriorityFilter(filters.priority);
    }
  };

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
    const priorityMap: Record<string, { label: string; className: string }> = {
      low: { label: "Baixa", className: "bg-slate-100 text-slate-700 border-slate-200" },
      medium: { label: "Média", className: "bg-blue-50 text-blue-700 border-blue-200" },
      high: { label: "Alta", className: "bg-orange-50 text-orange-700 border-orange-200" },
      urgent: { label: "Urgente", className: "bg-red-50 text-red-700 border-red-200" },
    };

    const priorityInfo = priorityMap[priority] || { label: priority, className: "bg-slate-100 text-slate-700" };
    return (
      <Badge 
        variant="outline" 
        className={cn("text-xs font-medium border", priorityInfo.className)}
      >
        {priorityInfo.label}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; className: string }> = {
      open: { label: "Aberto", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
      in_progress: { label: "Em Progresso", className: "bg-blue-50 text-blue-700 border-blue-200" },
      completed: { label: "Concluído", className: "bg-green-50 text-green-700 border-green-200" },
      cancelled: { label: "Cancelado", className: "bg-slate-100 text-slate-700 border-slate-200" },
    };

    const statusInfo = statusMap[status] || { label: status, className: "bg-slate-100 text-slate-700" };
    return (
      <Badge 
        variant="outline" 
        className={cn("text-xs font-medium border", statusInfo.className)}
      >
        {statusInfo.label}
      </Badge>
    );
  };

  const handleEdit = (id: string) => {
    setSelectedTicketId(id);
    setDialogOpen(true);
  };

  const handleNew = () => {
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

  // Calcular SLA (tempo aberto)
  const getSLA = (openedAt: string) => {
    const opened = new Date(openedAt);
    const now = new Date();
    const hours = differenceInHours(now, opened);
    
    if (hours < 1) return "Agora";
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-semibold text-slate-900">Manutenção</h1>
            </div>
            <Button 
              onClick={handleNew}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Abrir Chamado
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-slate-900 mb-1">Manutenção</h2>
          <p className="text-sm text-slate-500">Gerencie tickets de manutenção dos quartos</p>
        </div>

        {/* KPIs Operacionais */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card 
            className={cn(
              "p-4 cursor-pointer transition-all hover:shadow-md border-2",
              selectedKPI === "open" ? "border-yellow-400 bg-yellow-50/50" : "border-transparent bg-white hover:border-yellow-200"
            )}
            onClick={() => handleKPIClick("open")}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.open}</p>
                <p className="text-xs text-slate-500">Abertos</p>
              </div>
            </div>
          </Card>

          <Card 
            className={cn(
              "p-4 cursor-pointer transition-all hover:shadow-md border-2",
              selectedKPI === "inProgress" ? "border-blue-400 bg-blue-50/50" : "border-transparent bg-white hover:border-blue-200"
            )}
            onClick={() => handleKPIClick("inProgress")}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Wrench className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.inProgress}</p>
                <p className="text-xs text-slate-500">Em Progresso</p>
              </div>
            </div>
          </Card>

          <Card 
            className={cn(
              "p-4 cursor-pointer transition-all hover:shadow-md border-2",
              selectedKPI === "urgent" ? "border-red-400 bg-red-50/50" : "border-transparent bg-white hover:border-red-200"
            )}
            onClick={() => handleKPIClick("urgent")}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.urgent}</p>
                <p className="text-xs text-slate-500">Urgentes</p>
              </div>
            </div>
          </Card>

          <Card 
            className={cn(
              "p-4 cursor-pointer transition-all hover:shadow-md border-2",
              selectedKPI === "completed" ? "border-green-400 bg-green-50/50" : "border-transparent bg-white hover:border-green-200"
            )}
            onClick={() => handleKPIClick("completed")}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stats.completed}</p>
                <p className="text-xs text-slate-500">Concluídos</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Busca e Filtros */}
        <Card className="p-4 mb-6 bg-white shadow-sm">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por quarto, problema ou status..."
                className="pl-10 bg-white border-slate-200"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="border-slate-200">
                  <Filter className="h-4 w-4 mr-2" />
                  Filtros
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="end">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">Status</label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="open">Aberto</SelectItem>
                        <SelectItem value="in_progress">Em Progresso</SelectItem>
                        <SelectItem value="completed">Concluído</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">Prioridade</label>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="low">Baixa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </Card>

        {/* Lista de Chamados */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : filteredTickets.length === 0 ? (
          <Card className="p-12 text-center bg-white">
            <p className="text-slate-500">Nenhum ticket encontrado</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTickets.map((ticket: any) => {
              const isUrgent = ticket.priority === "urgent" && ticket.status !== "completed";
              const sla = getSLA(ticket.opened_at);
              
              return (
                <Card 
                  key={ticket.id}
                  className={cn(
                    "p-4 bg-white hover:shadow-md transition-all border group",
                    isUrgent && "border-red-200 bg-red-50/30"
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    {/* Conteúdo Principal */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-3 mb-2">
                        {/* Prioridade Badge */}
                        <div className="flex-shrink-0 mt-0.5">
                          {getPriorityBadge(ticket.priority)}
                        </div>
                        
                        {/* Quarto */}
                        <div className="flex-shrink-0">
                          <span className="text-sm font-semibold text-slate-900">
                            Quarto {ticket.rooms?.room_number || "N/A"}
                          </span>
                        </div>

                        {/* SLA */}
                        <div className="flex-shrink-0 text-xs text-slate-500">
                          {sla} atrás
                        </div>
                      </div>

                      {/* Título */}
                      <h3 className="text-base font-semibold text-slate-900 mb-1">
                        {ticket.title}
                      </h3>

                      {/* Descrição */}
                      {ticket.description && (
                        <p className="text-sm text-slate-600 line-clamp-2 mb-2">
                          {ticket.description}
                        </p>
                      )}

                      {/* Fotos Anexadas */}
                      {ticket.maintenance_ticket_attachments && ticket.maintenance_ticket_attachments.length > 0 && (
                        <div className="flex items-center gap-2 mt-2 mb-2">
                          <ImageIcon className="h-4 w-4 text-slate-400" />
                          <div className="flex gap-1.5">
                            {ticket.maintenance_ticket_attachments.slice(0, 3).map((attachment: any) => (
                              <AttachmentThumbnail key={attachment.id} attachment={attachment} />
                            ))}
                            {ticket.maintenance_ticket_attachments.length > 3 && (
                              <div className="h-12 w-12 flex items-center justify-center bg-slate-100 rounded border border-slate-200 text-xs text-slate-600 font-medium">
                                +{ticket.maintenance_ticket_attachments.length - 3}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {getStatusBadge(ticket.status)}
                        <span className="text-xs text-slate-500">
                          {format(new Date(ticket.opened_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    </div>

                    {/* Ações Rápidas */}
                    <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {ticket.status === "open" && (canUpdate("maintenance") || canCreate("maintenance")) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-200 text-blue-700 hover:bg-blue-50"
                          onClick={() => handleStart(ticket.id)}
                        >
                          <Play className="h-3.5 w-3.5 mr-1.5" />
                          Iniciar
                        </Button>
                      )}
                      
                      {ticket.status === "in_progress" && (canUpdate("maintenance") || canCreate("maintenance")) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-200 text-green-700 hover:bg-green-50"
                          onClick={() => handleComplete(ticket.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                          Concluir
                        </Button>
                      )}

                      {/* Menu de Ações */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-1" align="end">
                          <div className="space-y-1">
                            {(canUpdate("maintenance") || canCreate("maintenance")) && (
                              <Button
                                variant="ghost"
                                className="w-full justify-start text-sm"
                                onClick={() => handleEdit(ticket.id)}
                              >
                                Editar
                              </Button>
                            )}
                            {(canUpdate("maintenance") || canCreate("maintenance")) && !["completed", "cancelled"].includes(ticket.status) && (
                              <Button
                                variant="ghost"
                                className="w-full justify-start text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleCancel(ticket.id)}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Cancelar
                              </Button>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

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
