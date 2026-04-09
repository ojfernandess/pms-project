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
  Play,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  Eye,
  Edit,
  BarChart3,
  LayoutGrid,
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
import { MaintenanceTicketComments } from "@/components/maintenance/MaintenanceTicketComments";
import {
  MaintenanceKanbanBoard,
  type MaintenanceKanbanStatus,
} from "@/components/maintenance/MaintenanceKanbanBoard";
import { formatDate } from "@/lib/reservationUtils";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { format, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { toast } from "sonner";

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
const AttachmentThumbnail = ({ 
  attachment, 
  onImageClick 
}: { 
  attachment: any;
  onImageClick?: (url: string, fileName: string) => void;
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageUrl, setImageUrl] = useState<string>(convertUrlToMaintenanceBucket(attachment.file_url));
  
  // Tentar gerar signed URL se a URL pública falhar
  useEffect(() => {
    const tryGenerateSignedUrl = async () => {
      if (imageError && attachment.file_url) {
        try {
          // Extrair o caminho do arquivo da URL (sem o prefixo "maintenance/" porque já especificamos o bucket)
          const extractFilePath = (url: string): string | null => {
            if (!url) return null;
            
            // Se já for um caminho relativo começando com "maintenance/", remover o prefixo
            if (url.startsWith("maintenance/")) {
              return url.replace(/^maintenance\//, "");
            }
            
            // Tentar extrair o caminho após /maintenance/ (pode aparecer uma ou duas vezes)
            // Formato esperado: /storage/v1/object/public/maintenance/maintenance/ticket_id/file.png
            // ou: /storage/v1/object/public/maintenance/ticket_id/file.png
            const match = url.match(/\/maintenance\/(.+)$/);
            if (match) {
              let path = match[1];
              // Se o path começa com "maintenance/", remover (duplicação)
              if (path.startsWith("maintenance/")) {
                path = path.replace(/^maintenance\//, "");
              }
              return path;
            }
            
            // Tentar extrair o caminho após /storage/v1/object/public/maintenance/
            const publicMatch = url.match(/\/storage\/v1\/object\/public\/maintenance\/(.+)$/);
            if (publicMatch) {
              let path = publicMatch[1];
              // Se o path começa com "maintenance/", remover (duplicação)
              if (path.startsWith("maintenance/")) {
                path = path.replace(/^maintenance\//, "");
              }
              return path;
            }
            
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
  
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onImageClick) {
      onImageClick(imageUrl, attachment.file_name || "Anexo");
    } else {
      // Fallback: abrir em nova aba se não houver handler
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    }
  };
  
  return (
    <button
      type="button"
      onClick={handleClick}
      className="relative group cursor-pointer"
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
    </button>
  );
};

const Maintenance = () => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | undefined>();
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedTicketForDetails, setSelectedTicketForDetails] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [selectedKPI, setSelectedKPI] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("board");
  const [selectedImage, setSelectedImage] = useState<{ url: string; fileName: string; ticketId?: string } | null>(null);
  const [establishmentLogo, setEstablishmentLogo] = useState<string | null>(null);

  const { tickets, isLoading, refetch, startTicket, completeTicket, cancelTicket, updateTicket } = useMaintenance();
  const { canCreate, canUpdate } = usePermissions();
  const { selectedEstablishment } = useEstablishment();

  // Buscar logo do estabelecimento quando necessário
  useEffect(() => {
    const fetchLogo = async () => {
      if (!selectedEstablishment?.id) return;

      try {
        // Buscar logo do hotel_settings
        const { data: hotelSettings } = await supabase
          .from("hotel_settings")
          .select("logo_url")
          .eq("establishment_id", selectedEstablishment.id)
          .maybeSingle();

        if (hotelSettings?.logo_url) {
          setEstablishmentLogo(hotelSettings.logo_url);
          return;
        }

        // Se não encontrou, buscar do site_settings como fallback
        const { data: siteSettings } = await supabase
          .from("site_settings")
          .select("logo_url")
          .maybeSingle();

        if (siteSettings?.logo_url) {
          setEstablishmentLogo(siteSettings.logo_url);
        }
      } catch (error) {
        console.error("Erro ao buscar logo:", error);
      }
    };

    fetchLogo();
  }, [selectedEstablishment?.id]);

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
      // Buscar pelo número do ticket (primeiros 8 caracteres do UUID)
      const ticketNumber = ticket.id?.substring(0, 8).toUpperCase() || "";
      const searchTermUpper = searchTerm.toUpperCase();
      const matchesTicketNumber = ticketNumber.includes(searchTermUpper);
      
      const matchesSearch =
        matchesTicketNumber ||
        ticket.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.rooms?.room_number?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;

      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [tickets, searchTerm, statusFilter, priorityFilter]);

  // Quadro Kanban: ignora filtro de status para sempre mostrar o fluxo completo; respeita busca e prioridade.
  const boardTickets = useMemo(() => {
    return tickets.filter((ticket: any) => {
      const ticketNumber = ticket.id?.substring(0, 8).toUpperCase() || "";
      const searchTermUpper = searchTerm.toUpperCase();
      const matchesTicketNumber = ticketNumber.includes(searchTermUpper);
      const matchesSearch =
        matchesTicketNumber ||
        ticket.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        ticket.rooms?.room_number?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPriority = priorityFilter === "all" || ticket.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });
  }, [tickets, searchTerm, priorityFilter]);

  // Estatísticas de quartos com mais chamados (todos os chamados do quarto, inclusive cancelados)
  const roomStatistics = useMemo(() => {
    // Função para extrair palavras-chave de um texto
    const extractKeywords = (text: string): string[] => {
      if (!text) return [];
      
      // Palavras comuns a ignorar (stop words em português)
      const stopWords = new Set([
        'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas',
        'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas',
        'para', 'por', 'com', 'sem', 'sob', 'sobre', 'entre',
        'é', 'são', 'foi', 'ser', 'estar', 'ter', 'há',
        'que', 'qual', 'quais', 'quando', 'onde', 'como',
        'e', 'ou', 'mas', 'porém', 'entretanto',
        'não', 'nunca', 'jamais',
        'o', 'a', 'os', 'as', 'um', 'uma',
        'meu', 'minha', 'meus', 'minhas',
        'seu', 'sua', 'seus', 'suas',
        'nosso', 'nossa', 'nossos', 'nossas',
        'este', 'esta', 'estes', 'estas',
        'esse', 'essa', 'esses', 'essas',
        'aquele', 'aquela', 'aqueles', 'aquelas',
        'muito', 'muita', 'muitos', 'muitas',
        'pouco', 'pouca', 'poucos', 'poucas',
        'mais', 'menos', 'muito', 'bem', 'mal',
        'também', 'tampouco', 'ainda', 'já', 'sempre', 'nunca',
        'aqui', 'ali', 'lá', 'aí', 'aqui', 'acolá',
        'hoje', 'ontem', 'amanhã', 'agora', 'depois', 'antes',
        'quarto', 'sala', 'banheiro', 'porta', 'janela', 'parede', 'teto', 'chão',
        'problema', 'problemas', 'chamado', 'chamados', 'manutenção'
      ]);

      // Normalizar texto: remover acentos, converter para minúsculas
      const normalize = (str: string) => {
        return str
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^\w\s]/g, ' ');
      };

      const normalizedText = normalize(text);
      
      // Extrair palavras (mínimo 3 caracteres)
      const words = normalizedText
        .split(/\s+/)
        .filter(word => word.length >= 3 && !stopWords.has(word))
        .filter(word => !/^\d+$/.test(word)); // Remover números puros

      // Contar frequência das palavras
      const wordCount = new Map<string, number>();
      words.forEach(word => {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      });

      // Retornar as palavras mais frequentes (top 5)
      return Array.from(wordCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);
    };

    // Agrupar por quarto
    const roomMap = new Map<string, {
      room_number: string;
      room_id: string;
      totalTickets: number;
      activeTickets: number;
      problems: Map<string, number>;
      keywords: Map<string, number>; // Palavras-chave com contagem
    }>();

    tickets.forEach((ticket: any) => {
      const roomsData = Array.isArray(ticket.rooms) ? ticket.rooms[0] : ticket.rooms;
      const roomId = ticket.room_id || roomsData?.id || null;
      const roomNumber = roomsData?.room_number || "N/A";
      const ticketType = ticket.ticket_type || "general";
      const st = (ticket.status || "").toLowerCase();
      const isActive = st === "open" || st === "in_progress";

      if (!roomId) {
        return;
      }

      if (!roomMap.has(roomId)) {
        roomMap.set(roomId, {
          room_number: roomNumber,
          room_id: roomId,
          totalTickets: 0,
          activeTickets: 0,
          problems: new Map(),
          keywords: new Map(),
        });
      }

      const room = roomMap.get(roomId)!;
      room.totalTickets += 1;
      if (isActive) room.activeTickets += 1;
      
      // Contar tipo de problema
      const currentCount = room.problems.get(ticketType) || 0;
      room.problems.set(ticketType, currentCount + 1);

      // Extrair palavras-chave do título e descrição
      const titleKeywords = extractKeywords(ticket.title || '');
      const descriptionKeywords = extractKeywords(ticket.description || '');
      const allKeywords = [...titleKeywords, ...descriptionKeywords];

      // Adicionar palavras-chave ao quarto
      allKeywords.forEach(keyword => {
        const currentKeywordCount = room.keywords.get(keyword) || 0;
        room.keywords.set(keyword, currentKeywordCount + 1);
      });
    });

    // Converter para array e ordenar por total de tickets
    const result = Array.from(roomMap.values())
      .map(room => ({
        ...room,
        problems: Array.from(room.problems.entries()).map(([type, count]) => ({
          type,
          count,
        })),
        keywords: Array.from(room.keywords.entries())
          .sort((a, b) => b[1] - a[1]) // Ordenar por frequência
          .slice(0, 10) // Top 10 palavras-chave
          .map(([word, count]) => ({
            word,
            count,
          })),
      }))
      .sort((a, b) => b.totalTickets - a.totalTickets);

    return result;
  }, [tickets]);

  const getTicketTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      general: "Geral",
      electrical: "Elétrica",
      plumbing: "Hidráulica",
      hvac: "Ar Condicionado",
      furniture: "Mobiliário",
      cleaning: "Limpeza",
      other: "Outro",
    };
    return typeMap[type] || type;
  };

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

  const handleViewDetails = (ticket: any) => {
    setSelectedTicketForDetails(ticket);
    setDetailsDialogOpen(true);
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

  const kanbanStatusLabel: Record<MaintenanceKanbanStatus, string> = {
    open: "Aberto",
    in_progress: "Em progresso",
    completed: "Concluído",
    cancelled: "Cancelado",
  };

  const handleKanbanStatusChange = async (
    ticketId: string,
    fromStatus: string,
    toStatus: MaintenanceKanbanStatus
  ) => {
    if (fromStatus === toStatus) return;

    if (fromStatus === "cancelled") {
      toast.error("Chamados cancelados não podem ser movidos pelo quadro.");
      return;
    }

    const leavingCompleted = fromStatus === "completed" && toStatus !== "completed";
    if (leavingCompleted) {
      const targetName = kanbanStatusLabel[toStatus];
      const detail =
        toStatus === "cancelled"
          ? `O status do chamado passará para "${targetName}".`
          : `O status passará para "${targetName}" e o quarto voltará para manutenção.`;
      const ok = window.confirm(
        `Este chamado está concluído.\n\n${detail}\n\nDeseja alterar o status?`
      );
      if (!ok) return;
    }

    if (toStatus === "cancelled") {
      if (!leavingCompleted && !window.confirm("Cancelar este chamado?")) return;
      await cancelTicket(ticketId);
      return;
    }

    if (toStatus === "completed") {
      await completeTicket(ticketId);
      return;
    }

    if (toStatus === "in_progress") {
      if (fromStatus === "open") {
        await startTicket(ticketId);
      } else {
        await updateTicket({ id: ticketId, status: "in_progress" });
      }
      return;
    }

    if (toStatus === "open") {
      if (fromStatus === "in_progress" || fromStatus === "completed") {
        await updateTicket({ id: ticketId, status: "open" });
        return;
      }
      toast.error("Somente chamados em progresso ou concluídos podem voltar para Aberto.");
      return;
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
                placeholder="Buscar por número do ticket, quarto, problema ou status..."
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

        {/* Abas */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="board" className="gap-2">
              <LayoutGrid className="h-4 w-4" />
              Quadro
            </TabsTrigger>
            <TabsTrigger value="tickets" className="gap-2">
              <Wrench className="h-4 w-4" />
              Lista
            </TabsTrigger>
            <TabsTrigger value="statistics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              Estatísticas
            </TabsTrigger>
          </TabsList>

          {/* Aba: Quadro Kanban */}
          <TabsContent value="board" className="space-y-4">
            <p className="text-sm text-slate-500">
              Arraste os cartões entre colunas para atualizar o status. A busca e a prioridade aplicam-se ao quadro; o filtro de status vale só na lista.
            </p>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : (
              <MaintenanceKanbanBoard
                tickets={boardTickets}
                canDrag={canUpdate("maintenance") || canCreate("maintenance")}
                onViewDetails={handleViewDetails}
                onStatusChange={handleKanbanStatusChange}
              />
            )}
          </TabsContent>

          {/* Aba: Lista */}
          <TabsContent value="tickets" className="space-y-4">
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
                        {/* Número do Ticket - Minimalista */}
                        <div className="flex-shrink-0">
                          <span className="text-xs font-mono font-medium text-slate-500 tracking-wider">
                            {ticket.id?.substring(0, 8).toUpperCase() || "N/A"}
                          </span>
                        </div>
                        
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
                              <AttachmentThumbnail 
                                key={attachment.id} 
                                attachment={attachment}
                                onImageClick={(url, fileName) => setSelectedImage({ url, fileName, ticketId: ticket.id })}
                              />
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
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Ver Detalhes */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-slate-100"
                        onClick={() => handleViewDetails(ticket)}
                        title="Ver Detalhes"
                      >
                        <Eye className="h-4 w-4 text-slate-600" />
                      </Button>

                      {/* Editar */}
                      {(canUpdate("maintenance") || canCreate("maintenance")) && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-blue-50"
                          onClick={() => handleEdit(ticket.id)}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4 text-blue-600" />
                        </Button>
                      )}

                      {/* Iniciar */}
                      {ticket.status === "open" && (canUpdate("maintenance") || canCreate("maintenance")) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-blue-50"
                          onClick={() => handleStart(ticket.id)}
                          title="Iniciar"
                        >
                          <Play className="h-4 w-4 text-blue-600" />
                        </Button>
                      )}
                      
                      {/* Concluir */}
                      {ticket.status === "in_progress" && (canUpdate("maintenance") || canCreate("maintenance")) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-green-50"
                          onClick={() => handleComplete(ticket.id)}
                          title="Concluir"
                        >
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        </Button>
                      )}

                      {/* Cancelar */}
                        {(canUpdate("maintenance") || canCreate("maintenance")) && !["completed", "cancelled"].includes(ticket.status) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-red-50"
                          onClick={() => handleCancel(ticket.id)}
                          title="Cancelar"
                        >
                          <XCircle className="h-4 w-4 text-red-600" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
          </TabsContent>

          {/* Aba: Estatísticas */}
          <TabsContent value="statistics" className="space-y-4">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-6">
                <BarChart3 className="h-5 w-5 text-slate-600" />
                <h2 className="text-xl font-semibold text-slate-900">
                  Quartos com Mais Chamados
                </h2>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : roomStatistics.length === 0 ? (
                <div className="text-center py-12">
                  <Wrench className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">
                    Nenhum chamado encontrado
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {roomStatistics.map((room, index) => (
                    <Card 
                      key={room.room_id} 
                      className={cn(
                        "p-4 border",
                        index === 0 && "border-blue-300 bg-blue-50/30"
                      )}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg font-bold text-slate-900">
                              Quarto {room.room_number}
                            </span>
                            {index === 0 && (
                              <Badge className="bg-blue-600 text-white text-xs">
                                Mais Problemas
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-600">
                            {room.totalTickets} chamado{room.totalTickets > 1 ? "s" : ""} registrado
                            {room.totalTickets > 1 ? "s" : ""}
                            {room.activeTickets > 0 ? (
                              <span className="text-slate-500">
                                {" "}
                                ({room.activeTickets} aberto{room.activeTickets > 1 ? "s" : ""} ou em andamento)
                              </span>
                            ) : (
                              <span className="text-slate-500"> (nenhum em aberto)</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                        {/* Tipos de Problemas */}
                        <div>
                          <p className="text-xs font-semibold text-slate-700 mb-2">
                            Tipos de Problemas:
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {room.problems.map((problem) => (
                              <Badge
                                key={problem.type}
                                variant="outline"
                                className="text-xs"
                              >
                                {getTicketTypeLabel(problem.type)}: {problem.count}
                              </Badge>
                            ))}
                          </div>
                        </div>

                        {/* Palavras-chave */}
                        {room.keywords && room.keywords.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-slate-700 mb-2">
                              Palavras-chave mais mencionadas:
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {room.keywords.map((keyword, idx) => (
                                <Badge
                                  key={`${keyword.word}-${idx}`}
                                  variant="outline"
                                  className="text-xs bg-blue-50 text-blue-700 border-blue-200"
                                  title={`Mencionada ${keyword.count} vez${keyword.count > 1 ? 'es' : ''}`}
                                >
                                  {keyword.word}
                                  {keyword.count > 1 && (
                                    <span className="ml-1 text-blue-600 font-semibold">
                                      ({keyword.count})
                                    </span>
                                  )}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
        )}
      </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal de Imagem */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 rounded-xl overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>
              {selectedImage ? `Visualizar imagem: ${selectedImage.fileName || 'Imagem do ticket'}` : 'Visualizar imagem'}
            </DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div className="relative">
              <div className="p-4 border-b border-slate-200 bg-white rounded-t-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Logo do Estabelecimento */}
                    {establishmentLogo && (
                      <img
                        src={establishmentLogo}
                        alt="Logo"
                        className="h-8 w-8 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    {/* Número do Ticket */}
                    {selectedImage.ticketId && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-medium text-slate-500 tracking-wider">
                          {selectedImage.ticketId.substring(0, 8).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-b-xl">
                <div className="relative w-full max-h-[70vh] flex items-center justify-center">
                  <img
                    src={selectedImage.url}
                    alt={selectedImage.fileName}
                    className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23ddd' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='14'%3EImagem não encontrada%3C/text%3E%3C/svg%3E";
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      {/* Diálogo de Detalhes do Ticket */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-medium text-slate-500 tracking-wider">
                  {selectedTicketForDetails?.id?.substring(0, 8).toUpperCase() || "N/A"}
                </span>
                <span className="text-slate-400">•</span>
                <span>{selectedTicketForDetails?.title}</span>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedTicketForDetails && (
            <div className="space-y-4">
              {/* Informações do Ticket */}
              <Card className="p-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Quarto:</span>
                    <span className="text-sm text-slate-900">
                      {selectedTicketForDetails.rooms?.room_number || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Status:</span>
                    {getStatusBadge(selectedTicketForDetails.status)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Prioridade:</span>
                    {getPriorityBadge(selectedTicketForDetails.priority)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Descrição:</span>
                    <span className="text-sm text-slate-900">
                      {selectedTicketForDetails.description || "Sem descrição"}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Comentários */}
              <MaintenanceTicketComments ticketId={selectedTicketForDetails.id} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Maintenance;
