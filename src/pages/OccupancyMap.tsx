import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { 
  Bed, 
  Wrench, 
  Lock, 
  Sparkles, 
  Loader2, 
  Search, 
  Filter,
  Calendar,
  ChevronDown,
  ChevronRight,
  Eye,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  Info
} from "lucide-react";
import { useOccupancyMap, RoomOccupancyStatus, RoomOccupancyData } from "@/hooks/useOccupancyMap";
import { useReservations } from "@/hooks/useReservations";
import { useMaintenance } from "@/hooks/useMaintenance";
import { usePermissions } from "@/hooks/usePermissions";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { format, addDays, subDays, isToday, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ReservationDialog } from "@/components/reservations/ReservationDialog";
import { BlockRoomDialog } from "@/components/reservations/BlockRoomDialog";
import { MaintenanceTicketDialog } from "@/components/maintenance/MaintenanceTicketDialog";
import { formatCurrency } from "@/lib/reservationUtils";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const statusConfig: Record<RoomOccupancyStatus, {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
  icon: typeof Bed;
  emoji: string;
}> = {
  available: { 
    label: "Disponível/Limpo",
    color: "bg-green-500",
    bgColor: "bg-green-50 border-green-200",
    textColor: "text-green-700",
    icon: Bed,
    emoji: "🟢"
  },
  occupied: { 
    label: "Ocupado", 
    color: "bg-red-500",
    bgColor: "bg-red-50 border-red-200",
    textColor: "text-red-700",
    icon: Bed,
    emoji: "🔴"
  },
  dirty: {
    label: "Sujo/Aguardando Limpeza",
    color: "bg-yellow-500",
    bgColor: "bg-yellow-50 border-yellow-200",
    textColor: "text-yellow-700",
    icon: Sparkles,
    emoji: "🟡"
  },
  maintenance: { 
    label: "Em Manutenção",
    color: "bg-blue-500",
    bgColor: "bg-blue-50 border-blue-200",
    textColor: "text-blue-700",
    icon: Wrench,
    emoji: "🔵"
  },
  blocked: { 
    label: "Bloqueado", 
    color: "bg-gray-800",
    bgColor: "bg-gray-100 border-gray-300",
    textColor: "text-gray-800",
    icon: Lock,
    emoji: "⚫"
  },
  reserved: {
    label: "Reservado (Check-in Futuro)",
    color: "bg-purple-500",
    bgColor: "bg-purple-50 border-purple-200",
    textColor: "text-purple-700",
    icon: Bed,
    emoji: "🟣"
  },
  inspection: {
    label: "Aguardando Inspeção",
    color: "bg-orange-500",
    bgColor: "bg-orange-50 border-orange-200",
    textColor: "text-orange-700",
    icon: Eye,
    emoji: "🟠"
  },
  dirty_priority: {
    label: "Sujo com Prioridade",
    color: "bg-amber-700",
    bgColor: "bg-amber-50 border-amber-300",
    textColor: "text-amber-800",
    icon: AlertCircle,
    emoji: "🟤"
  },
};

// Função para mapear RoomOccupancyStatus para room_status (ENUM do banco)
const mapOccupancyStatusToRoomStatus = (status: RoomOccupancyStatus): 'available' | 'occupied' | 'cleaning' | 'maintenance' | 'blocked' => {
  switch (status) {
    case 'maintenance':
      return 'maintenance';
    case 'blocked':
      return 'blocked';
    case 'dirty':
    case 'dirty_priority':
      return 'cleaning';
    case 'occupied':
      return 'occupied';
    case 'reserved':
    case 'inspection':
    case 'available':
    default:
      return 'available';
  }
};

const OccupancyMap = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { selectedEstablishment } = useEstablishment();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatuses, setSelectedStatuses] = useState<Set<RoomOccupancyStatus>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedRoom, setSelectedRoom] = useState<RoomOccupancyData | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [changeStatusDialogOpen, setChangeStatusDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [maintenanceDialogOpen, setMaintenanceDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<RoomOccupancyStatus | "">("");
  
  const { rooms: roomsFromHook, isLoading } = useOccupancyMap(selectedDate);
  const { reservations, refetch: refetchReservations, checkIn, checkOut } = useReservations();
  const { createTicket } = useMaintenance();
  const { canCreate } = usePermissions();
  
  // Estado local para atualizações otimistas (sem bloquear o mapa)
  const [localRoomUpdates, setLocalRoomUpdates] = useState<Record<string, RoomOccupancyStatus>>({});
  
  // Combinar dados do hook com atualizações locais
  const rooms = useMemo(() => {
    return roomsFromHook.map(room => {
      const localUpdate = localRoomUpdates[room.id];
      if (localUpdate) {
        return { ...room, status: localUpdate };
      }
      return room;
    });
  }, [roomsFromHook, localRoomUpdates]);

  // Agrupar quartos por categoria
  const roomsByCategory = useMemo(() => {
    const grouped: Record<string, RoomOccupancyData[]> = {};
    rooms.forEach((room) => {
      const categoryId = room.category_id || "uncategorized";
      if (!grouped[categoryId]) {
        grouped[categoryId] = [];
      }
      grouped[categoryId].push(room);
    });
    return grouped;
  }, [rooms]);

  // Obter categorias únicas
  const categories = useMemo(() => {
    const categoryMap = new Map<string, { id: string; name: string }>();
    rooms.forEach((room) => {
      if (room.category_id && !categoryMap.has(room.category_id)) {
        categoryMap.set(room.category_id, {
          id: room.category_id,
          name: room.category_name,
        });
      }
    });
    return Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rooms]);

  // Filtrar quartos
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      // Filtro de busca
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        // Converter identification_number para string para busca
        const identificationNumberStr = room.identification_number 
          ? `#${room.identification_number}` 
          : '';
        
        const matchesSearch =
          room.room_number.toLowerCase().includes(searchLower) ||
          room.name?.toLowerCase().includes(searchLower) ||
          room.guest_name?.toLowerCase().includes(searchLower) ||
          room.reservation_code?.toLowerCase().includes(searchLower) ||
          identificationNumberStr.toLowerCase().includes(searchLower) ||
          room.category_name.toLowerCase().includes(searchLower);
        if (!matchesSearch) return false;
      }

      // Filtro de categoria
      if (selectedCategory !== "all" && room.category_id !== selectedCategory) {
        return false;
      }

      // Filtro de status
      if (selectedStatuses.size > 0 && !selectedStatuses.has(room.status)) {
        return false;
      }

      return true;
    });
  }, [rooms, searchTerm, selectedCategory, selectedStatuses]);

  // Estatísticas
  const stats = useMemo(() => {
    const total = rooms.length;
    const byStatus: Record<RoomOccupancyStatus, number> = {
      available: 0,
      occupied: 0,
      dirty: 0,
      maintenance: 0,
      blocked: 0,
      reserved: 0,
      inspection: 0,
      dirty_priority: 0,
    };

    rooms.forEach((room) => {
      byStatus[room.status]++;
    });

    const occupied = byStatus.occupied + byStatus.reserved;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;

    return {
      total,
      byStatus,
      occupancyRate,
      available: byStatus.available,
      occupied,
      dirty: byStatus.dirty + byStatus.dirty_priority,
      maintenance: byStatus.maintenance,
      blocked: byStatus.blocked,
    };
  }, [rooms]);

  // Expandir/colapsar categoria
  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  // Expandir todas as categorias por padrão
  useEffect(() => {
    if (categories.length > 0 && expandedCategories.size === 0) {
      setExpandedCategories(new Set(categories.map((cat) => cat.id)));
    }
  }, [categories, expandedCategories.size]);

  // Limpar atualizações locais quando os dados do hook forem atualizados ou quando a data mudar
  useEffect(() => {
    // Limpar atualizações locais após um delay para permitir que as queries sincronizem
    const timer = setTimeout(() => {
      setLocalRoomUpdates({});
    }, 3000);
    
    return () => clearTimeout(timer);
  }, [roomsFromHook, selectedDate]);

  // Toggle status filter
  const toggleStatusFilter = (status: RoomOccupancyStatus) => {
    setSelectedStatuses((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(status)) {
        newSet.delete(status);
      } else {
        newSet.add(status);
      }
      return newSet;
    });
  };

  // Handler para clique no quarto
  const handleRoomClick = (room: RoomOccupancyData) => {
    setSelectedRoom(room);
    setActionDialogOpen(true);
  };

  // Handler para ver detalhes
  const handleViewDetails = () => {
    if (selectedRoom?.reservation_id) {
      setActionDialogOpen(false);
      setDetailsDialogOpen(true);
    } else {
      toast.info("Este quarto não possui reserva ativa");
    }
  };

  // Handler para alterar status
  const handleChangeStatus = () => {
    setActionDialogOpen(false);
    setChangeStatusDialogOpen(true);
    setNewStatus(selectedRoom?.status || "");
  };

  // Handler para salvar novo status
  const handleSaveStatus = async () => {
    if (!selectedRoom || !newStatus) return;

    const roomId = selectedRoom.id;
    
    // Atualização otimista: atualizar visualmente imediatamente
    setLocalRoomUpdates(prev => ({
      ...prev,
      [roomId]: newStatus as RoomOccupancyStatus
    }));
    
    // Fechar diálogo imediatamente
    setChangeStatusDialogOpen(false);
    setSelectedRoom(null);
    
    // Atualizar no banco em background (sem bloquear o mapa)
    try {
      // Mapear RoomOccupancyStatus para room_status (ENUM do banco)
      const roomStatus = mapOccupancyStatusToRoomStatus(newStatus as RoomOccupancyStatus);
      
      const { error } = await supabase
        .from("rooms")
        .update({ status: roomStatus })
        .eq("id", roomId);

      if (error) {
        // Se houver erro, reverter a atualização otimista
        setLocalRoomUpdates(prev => {
          const newUpdates = { ...prev };
          delete newUpdates[roomId];
          return newUpdates;
        });
        throw error;
      }

      // Atualizar queries em background (sem bloquear a UI)
      // Invalidar todas as queries do mapa de ocupação (todas as datas)
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["rooms"] });
      // Forçar refetch imediato para a data atual
      queryClient.refetchQueries({ queryKey: ["occupancy_map_rooms", selectedEstablishment?.id, format(selectedDate, "yyyy-MM-dd")] });
      
      toast.success("Status do quarto atualizado com sucesso!");
      
      // Limpar atualização local após um tempo (quando a query atualizar)
      setTimeout(() => {
        setLocalRoomUpdates(prev => {
          const newUpdates = { ...prev };
          delete newUpdates[roomId];
          return newUpdates;
        });
      }, 2000);
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar status");
    }
  };

  // Handler para ver reservas
  const handleViewReservations = () => {
    setActionDialogOpen(false);
    navigate("/reservations", { 
      state: { 
        roomFilter: selectedRoom?.room_number,
        dateFilter: format(selectedDate, "yyyy-MM-dd")
      } 
    });
  };

  // Handler para check-in
  const handleCheckIn = async () => {
    if (!selectedRoom?.reservation_id) {
      toast.error("Este quarto não possui reserva para check-in");
      return;
    }

    try {
      await checkIn({ id: selectedRoom.reservation_id, roomId: selectedRoom.id });
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      setActionDialogOpen(false);
      setSelectedRoom(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao realizar check-in");
    }
  };

  // Handler para check-out
  const handleCheckOut = async () => {
    if (!selectedRoom?.reservation_id) {
      toast.error("Este quarto não possui reserva para check-out");
      return;
    }

    try {
      await checkOut(selectedRoom.reservation_id);
      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      setActionDialogOpen(false);
      setSelectedRoom(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao realizar check-out");
    }
  };

  // Handler para abrir chamado de manutenção
  const handleOpenMaintenance = () => {
    setActionDialogOpen(false);
    setMaintenanceDialogOpen(true);
  };

  // Handler para solicitar limpeza
  const handleRequestCleaning = async () => {
    if (!selectedRoom) return;

    try {
      // Criar uma "tarefa" de limpeza ou atualizar status
      // Por enquanto, apenas mostrar mensagem
      toast.success("Limpeza solicitada para o quarto " + selectedRoom.room_number);
      setActionDialogOpen(false);
      setSelectedRoom(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao solicitar limpeza");
    }
  };

  // Handler para bloquear quarto
  const handleBlockRoom = () => {
    setActionDialogOpen(false);
    setBlockDialogOpen(true);
  };

  // Handler para desbloquear quarto
  const handleUnblockRoom = async () => {
    if (!selectedRoom?.reservation_id) {
      toast.error("Este quarto não possui bloqueio ativo");
      return;
    }

    try {
      // Buscar dados do bloqueio antes de cancelar
      const { data: blockReservation } = await supabase
        .from("reservations")
        .select(`
          *,
          rooms (*),
          room_categories (*)
        `)
        .eq("id", selectedRoom.reservation_id)
        .single();

      // Cancelar a reserva de bloqueio
      const { error } = await supabase
        .from("reservations")
        .update({ status: "cancelled" })
        .eq("id", selectedRoom.reservation_id);

      if (error) throw error;

      // Registrar log de atividade
      if (blockReservation) {
        try {
          const { logActivity } = await import("@/lib/activityLogger");
          const roomName = blockReservation.rooms?.name || 
                         blockReservation.rooms?.room_number || 
                         blockReservation.room_categories?.name || 
                         "N/A";
          const blockReason = blockReservation.notes?.replace(/^Bloqueio:\s*/i, "") || "Não informado";
          
          await logActivity({
            actionType: "unblocked",
            entityType: "block",
            entityId: blockReservation.id,
            entityCode: null, // Bloqueios não têm código de reserva
            description: `Quarto ${roomName} desbloqueado (bloqueio de ${blockReservation.checkin_date} a ${blockReservation.checkout_date})`,
            oldValues: {
              status: "blocked",
              room_id: blockReservation.room_id,
              room_name: roomName,
              checkin_date: blockReservation.checkin_date,
              checkout_date: blockReservation.checkout_date,
              reason: blockReason,
            },
            newValues: {
              status: "cancelled",
            },
            metadata: {
              reservation_id: blockReservation.id,
            },
          });
        } catch (logError) {
          console.error("Erro ao registrar log de desbloqueio:", logError);
          // Não interromper o fluxo principal
        }
      }

      queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
      queryClient.invalidateQueries({ queryKey: ["reservations"] });
      
      toast.success("Quarto desbloqueado com sucesso!");
      setActionDialogOpen(false);
      setSelectedRoom(null);
    } catch (error: any) {
      toast.error(error.message || "Erro ao desbloquear quarto");
    }
  };

  // Agrupar quartos filtrados por categoria
  const filteredRoomsByCategory = useMemo(() => {
    const grouped: Record<string, RoomOccupancyData[]> = {};
    filteredRooms.forEach((room) => {
      const categoryId = room.category_id || "uncategorized";
      if (!grouped[categoryId]) {
        grouped[categoryId] = [];
      }
      grouped[categoryId].push(room);
    });
    return grouped;
  }, [filteredRooms]);

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Mapa de Ocupação</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Visualização em tempo real dos quartos</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Mapa de Ocupação</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Visualização em tempo real dos quartos</p>
        </div>
        {canCreate("reservations") && (
          <Button onClick={() => setReservationDialogOpen(true)} className="w-full sm:w-auto">Nova Reserva</Button>
        )}
      </div>

      {/* Filtros */}
      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Data */}
          <div>
            <Label htmlFor="date" className="text-sm font-medium mb-2 block">
              Data
            </Label>
            <div className="flex gap-2">
              <Input
                id="date"
                type="date"
                value={format(selectedDate, "yyyy-MM-dd")}
                onChange={(e) => setSelectedDate(new Date(e.target.value))}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSelectedDate(new Date())}
                title="Hoje"
              >
                <Calendar className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Busca */}
          <div>
            <Label htmlFor="search" className="text-sm font-medium mb-2 block">
              Buscar
            </Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Quarto, hóspede, reserva..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          {/* Categoria */}
          <div>
            <Label htmlFor="category" className="text-sm font-medium mb-2 block">
              Categoria
            </Label>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Status</Label>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(statusConfig).map(([status, config]) => {
                const isSelected = selectedStatuses.has(status as RoomOccupancyStatus);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatusFilter(status as RoomOccupancyStatus)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200",
                      "border-2 cursor-pointer select-none",
                      "hover:scale-105 active:scale-95",
                      isSelected
                        ? cn(
                            "bg-slate-900 text-white border-slate-900 shadow-sm",
                            "hover:bg-slate-800 hover:border-slate-800"
                          )
                        : cn(
                            "bg-white text-slate-700 border-slate-200",
                            "hover:bg-slate-50 hover:border-slate-300"
                          )
                    )}
                  >
                    <span className="text-sm leading-none">{config.emoji}</span>
                    <span className="hidden sm:inline whitespace-nowrap">
                      {config.label.split("/")[0]}
                    </span>
                    {isSelected && (
                      <CheckCircle2 className="h-3 w-3 text-white" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        {/* Mapa de Quartos */}
        <div className="space-y-4">
          {/* Legenda */}
          <Card className="p-3 sm:p-4">
            <div className="flex flex-wrap items-center gap-3 sm:gap-6">
              <span className="text-xs sm:text-sm font-semibold text-slate-700 w-full sm:w-auto">Legenda:</span>
        {Object.entries(statusConfig).map(([status, config]) => (
          <div key={status} className="flex items-center gap-1.5 sm:gap-2">
                  <div className={cn("w-3 h-3 sm:w-4 sm:h-4 rounded flex-shrink-0", config.color)} />
                  <span className="text-[10px] sm:text-xs font-medium text-slate-600 whitespace-nowrap">{config.label}</span>
          </div>
        ))}
      </div>
          </Card>

          {/* Quartos agrupados por categoria */}
          {categories.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          Nenhum quarto cadastrado
        </Card>
      ) : (
            <div className="space-y-4">
              {categories.map((category) => {
                const categoryRooms = filteredRoomsByCategory[category.id] || [];
                if (categoryRooms.length === 0 && selectedCategory !== "all") return null;
                
                const isExpanded = expandedCategories.has(category.id);
                
                return (
                  <Card key={category.id} className="overflow-hidden">
                    {/* Cabeçalho da Categoria */}
                    <div
                      className="flex items-center justify-between p-3 sm:p-4 bg-slate-50 border-b cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => toggleCategory(category.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-600 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-600 flex-shrink-0" />
                        )}
                        <h3 className="font-semibold text-sm sm:text-base text-slate-900 truncate">
                          {category.name}
                        </h3>
                        <Badge variant="secondary" className="ml-2 flex-shrink-0">
                          {categoryRooms.length}
                        </Badge>
                      </div>
                    </div>

                    {/* Quartos da Categoria - Visualização em Tabela Minimalista */}
                    {isExpanded && (
                      <div className="overflow-x-auto -mx-1 sm:mx-0">
                        {categoryRooms.length === 0 ? (
                          <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">
                            Nenhum quarto encontrado
                          </p>
                        ) : (
                          <div className="min-w-[800px] sm:min-w-full">
                            {/* Cabeçalho da Tabela */}
                            <div className="grid grid-cols-12 gap-1 sm:gap-2 px-2 sm:px-3 py-2 bg-slate-50 border-b-2 border-slate-300 text-[10px] sm:text-[11px] font-bold text-slate-800 uppercase tracking-wide">
                              <div className="col-span-2">Unidade</div>
                              <div className="col-span-4">Clientes</div>
                              <div className="col-span-1 text-center">
                                <div className="bg-slate-700 text-white px-1 sm:px-2 py-0.5 sm:py-1 rounded text-[9px] sm:text-[10px]">Checkout</div>
                              </div>
                              <div className="col-span-1 text-center">
                                <div className="bg-pink-500 text-white px-1 sm:px-2 py-0.5 sm:py-1 rounded text-[9px] sm:text-[10px]">Checkin</div>
                              </div>
                              <div className="col-span-2">Status do Quarto</div>
                              <div className="col-span-1 text-center">NP</div>
                              <div className="col-span-1 text-center">Ações</div>
                            </div>
                            
                            {/* Linhas dos Quartos */}
                            <div className="divide-y divide-slate-200">
                              {categoryRooms.map((room) => {
                                const config = statusConfig[room.status];
            const Icon = config.icon;
                                
                                // Verificar se checkout ocorreu na data selecionada
                                // Verificar se a reserva atual tem checkout na data selecionada e status checkedout
                                // OU se há hóspede anterior com checkout na data selecionada
                                const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
                                const checkoutOccurred = 
                                  (room.checkout_date === selectedDateStr && room.reservation_status === "checkedout") ||
                                  (room.previous_checkout_date === selectedDateStr);
                                
                                // Verificar se checkin ocorreu na data selecionada
                                // Verificar se há próximo hóspede com checkin na data selecionada E status checkedin
                                // OU se a reserva atual tem checkin na data selecionada E status checkedin
                                const checkinOccurred = 
                                  (room.next_checkin_date === selectedDateStr && 
                                   room.next_guest_name && 
                                   room.next_reservation_code) ||
                                  (room.checkin_date === selectedDateStr && 
                                   room.reservation_status === "checkedin");
                                
                                // Determinar texto do status do quarto
                                let roomStatusText = config.label;
                                let statusDisplayText = "";
                                
                                // Texto superior (dias ou status)
                                if (room.nights_remaining !== undefined && room.nights_remaining > 0) {
                                  statusDisplayText = `${room.nights_remaining}º dia`;
                                } else if (room.nights_remaining === 0) {
                                  statusDisplayText = "Último dia";
                                } else if (room.status === "available") {
                                  statusDisplayText = "Disponível";
                                } else if (room.status === "dirty" || room.status === "dirty_priority") {
                                  statusDisplayText = "Aguardando Limpeza";
                                } else if (room.status === "maintenance") {
                                  statusDisplayText = "Em Manutenção";
                                } else if (room.status === "blocked") {
                                  statusDisplayText = "Bloqueado";
                                } else if (room.status === "reserved") {
                                  statusDisplayText = "Reservado";
                                } else if (room.status === "occupied") {
                                  statusDisplayText = "Ocupado";
                                }
            
            return (
                                  <div
                key={room.id}
                                    className="grid grid-cols-12 gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-2.5 hover:bg-slate-50/50 transition-colors cursor-pointer border-b border-slate-100"
                onClick={() => handleRoomClick(room)}
              >
                                    {/* Unidade */}
                                    <div className="col-span-2 flex items-center gap-1 sm:gap-1.5 min-w-0">
                                      <div className="flex flex-col gap-0.5 min-w-0">
                                        <div className="flex items-center gap-1 min-w-0">
                                          <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                            {room.name || room.room_number}
                                          </span>
                                          {(room.previous_guest_name || room.next_guest_name) && (
                                            <AlertCircle className="h-3 w-3 text-orange-500 flex-shrink-0" />
                                          )}
                                        </div>
                                        <span className="text-[9px] sm:text-[10px] text-slate-500 uppercase truncate">
                                          {room.category_name}
                                        </span>
                  </div>
                </div>
                
                                    {/* Clientes */}
                                    <div className="col-span-4 flex flex-col gap-0.5 sm:gap-1 py-0.5 min-w-0">
                                      {/* Hóspede Anterior (Checkout) - Sempre mostrar */}
                                      <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap min-h-[16px] sm:min-h-[18px]">
                                        {room.previous_guest_name ? (
                                          <>
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 mt-0.5" />
                                            <span className="text-[10px] sm:text-xs text-slate-800 truncate max-w-[120px] sm:max-w-[150px]">
                                              {room.previous_guest_name}
                                            </span>
                                            {room.previous_reservation_code && (
                                              <span className="text-[8px] sm:text-[9px] px-0.5 sm:px-1 py-0.5 bg-slate-100 rounded text-slate-600 flex-shrink-0">
                                                #{room.previous_reservation_code}
                                              </span>
                                            )}
                                            <span className="text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 bg-slate-700 text-white rounded flex-shrink-0 font-medium">
                                              CHECKOUT
                                            </span>
                                            {room.previous_checkout_date && (
                                              <span className="text-[8px] sm:text-[9px] text-slate-500 flex-shrink-0 hidden sm:inline">
                                                - às {room.previous_checkout_time ? room.previous_checkout_time.substring(0, 5) : "12:00"}
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          <span className="text-[10px] sm:text-xs text-slate-400 italic">Sem hóspede anterior</span>
                                        )}
                                      </div>
                                      
                                      {/* Hóspede Atual - Sempre mostrar */}
                                      <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap min-h-[16px] sm:min-h-[18px]">
                                        {room.guest_name ? (
                                          <>
                                            <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 mt-0.5" />
                                            <span className="text-[10px] sm:text-xs text-slate-800 truncate max-w-[120px] sm:max-w-[150px] font-semibold">
                                              {room.guest_name}
                                            </span>
                                            {room.reservation_code && (
                                              <span className="text-[8px] sm:text-[9px] px-0.5 sm:px-1 py-0.5 bg-slate-100 rounded text-slate-600 flex-shrink-0">
                                                #{room.reservation_code}
                                              </span>
                                            )}
                                            <span className="text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 bg-slate-700 text-white rounded flex-shrink-0 font-medium">
                                              CHECKOUT
                                            </span>
                                            {room.checkout_date && (
                                              <span className="text-[8px] sm:text-[9px] text-slate-500 flex-shrink-0 hidden sm:inline">
                                                - às {room.checkout_time?.substring(0, 5) || "12:00"}
                                              </span>
                                            )}
                                          </>
                                        ) : (
                                          <span className="text-[10px] sm:text-xs text-slate-400 italic">Sem hóspede atual</span>
                                        )}
                                      </div>
                                      
                                      {/* Próximo Hóspede (Checkin) - Mostrar apenas se houver */}
                                      {room.next_guest_name && (
                                        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap min-h-[16px] sm:min-h-[18px]">
                                          <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0 mt-0.5" />
                                          <span className="text-[10px] sm:text-xs text-slate-800 truncate max-w-[120px] sm:max-w-[150px]">
                                            {room.next_guest_name}
                                          </span>
                                          {room.next_reservation_code && (
                                            <span className="text-[8px] sm:text-[9px] px-0.5 sm:px-1 py-0.5 bg-slate-100 rounded text-slate-600 flex-shrink-0">
                                              #{room.next_reservation_code}
                                            </span>
                                          )}
                                          <span className="text-[8px] sm:text-[9px] px-1 sm:px-1.5 py-0.5 bg-pink-500 text-white rounded flex-shrink-0 font-medium">
                                            CHECKIN
                                          </span>
                                          {room.next_checkin_date && (
                                            <span className="text-[8px] sm:text-[9px] text-slate-500 flex-shrink-0 hidden sm:inline">
                                              - às {room.next_checkin_time?.substring(0, 5) || "15:00"}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Checkout */}
                                    <div className="col-span-1 flex items-center justify-center">
                                      <div className="flex flex-col items-center gap-0.5">
                                        {checkoutOccurred ? (
                                          <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
                                        ) : (
                                          <>
                                            <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500" />
                                            <span className="text-[8px] sm:text-[9px] text-slate-600 leading-tight hidden sm:block">Não ocorreu</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Checkin */}
                                    <div className="col-span-1 flex items-center justify-center">
                                      <div className="flex flex-col items-center gap-0.5">
                                        {checkinOccurred ? (
                                          <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
                                        ) : (
                                          <>
                                            {room.next_guest_name && (
                                              <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-blue-500" />
                                            )}
                                            <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-red-500" />
                                            <span className="text-[8px] sm:text-[9px] text-slate-600 leading-tight hidden sm:block">Não ocorreu</span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Status do Quarto */}
                                    <div className="col-span-2 min-w-0">
                                      <div className={cn(
                                        "px-1.5 sm:px-2 py-1 sm:py-1.5 rounded text-[10px] sm:text-xs border-2",
                                        config.bgColor,
                                        config.textColor
                                      )}>
                                        <div className={cn("font-semibold leading-tight truncate", config.textColor)}>
                                          {statusDisplayText}
                                        </div>
                                        <div className={cn("leading-tight mt-0.5 opacity-90 truncate hidden sm:block", config.textColor)}>
                                          {roomStatusText}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* NP (Número de Pessoas) */}
                                    <div className="col-span-1 flex items-center justify-center">
                                      <div className="bg-slate-100 px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded text-[10px] sm:text-xs font-semibold text-slate-700 border border-slate-200">
                                        {room.adults || 0}
                                      </div>
                                    </div>
                                    
                                    {/* Ações */}
                                    <div className="col-span-1 flex items-center justify-center">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 sm:h-7 sm:w-7 p-0 hover:bg-slate-200"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRoomClick(room);
                                        }}
                                        title="Ver detalhes"
                                      >
                                        <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-slate-600" />
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                    </div>
                  )}
                </div>
                    )}
              </Card>
            );
          })}
        </div>
      )}
        </div>

        {/* Resumo - Abaixo das Categorias */}
        <div className="space-y-4">
          <Card className="p-3 sm:p-4">
            <h3 className="font-semibold text-sm sm:text-base text-slate-900 mb-3 sm:mb-4">
              RESUMO - {format(selectedDate, "dd/MM/yyyy", { locale: ptBR })}
            </h3>
            <div className="space-y-3">
              <div>
                <div className="text-xs sm:text-sm text-slate-600 mb-1">Total de Quartos</div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900">{stats.total}</div>
              </div>
              
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-sm sm:text-base">🟢</span>
                    <span>Disponíveis</span>
                  </div>
                  <div className="font-semibold text-xs sm:text-sm">
                    {stats.available} ({Math.round((stats.available / stats.total) * 100)}%)
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-sm sm:text-base">🔴</span>
                    <span>Ocupados</span>
                  </div>
                  <div className="font-semibold text-xs sm:text-sm">
                    {stats.occupied} ({Math.round((stats.occupied / stats.total) * 100)}%)
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-sm sm:text-base">🟡</span>
                    <span>Sujos</span>
                  </div>
                  <div className="font-semibold text-xs sm:text-sm">
                    {stats.dirty} ({Math.round((stats.dirty / stats.total) * 100)}%)
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-sm sm:text-base">🔵</span>
                    <span>Manutenção</span>
                  </div>
                  <div className="font-semibold text-xs sm:text-sm">
                    {stats.maintenance} ({Math.round((stats.maintenance / stats.total) * 100)}%)
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-sm sm:text-base">⚫</span>
                    <span>Bloqueados</span>
                  </div>
                  <div className="font-semibold text-xs sm:text-sm">
                    {stats.blocked} ({Math.round((stats.blocked / stats.total) * 100)}%)
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t">
                <div className="text-xs sm:text-sm text-slate-600 mb-1">Taxa de Ocupação</div>
                <div className="text-lg sm:text-xl font-bold text-slate-900">{stats.occupancyRate}%</div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Modal de Ações Rápidas */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              QUARTO {selectedRoom?.room_number} - {selectedRoom?.category_name}
            </DialogTitle>
            <DialogDescription>
              Status Atual: {selectedRoom && statusConfig[selectedRoom.status].emoji} {selectedRoom && statusConfig[selectedRoom.status].label}
            </DialogDescription>
          </DialogHeader>
          
          {/* Informações de Hóspedes - Visualização Simplificada */}
          {(selectedRoom?.previous_guest_name || selectedRoom?.guest_name || selectedRoom?.next_guest_name) && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Informações dos Hóspedes
              </div>
              
              {/* Hóspede Anterior */}
              {selectedRoom?.previous_guest_name && (
                <div className="flex items-start gap-2 p-2 bg-orange-50 border-l-4 border-orange-500 rounded">
                  <span className="text-orange-600 font-bold text-sm mt-0.5">←</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-orange-700 mb-0.5">Anterior</div>
                    <div className="text-sm font-medium text-slate-900 truncate">{selectedRoom.previous_guest_name}</div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-600">
                      {selectedRoom.previous_checkout_date && (
                        <span>Check-out: {format(parseISO(selectedRoom.previous_checkout_date), "dd/MM/yyyy")}</span>
                      )}
                      {selectedRoom.previous_reservation_code && (
                        <span className="text-slate-500">#{selectedRoom.previous_reservation_code}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Hóspede Atual */}
              {selectedRoom?.guest_name && (
                <div className="flex items-start gap-2 p-2 bg-slate-100 border-l-4 border-slate-400 rounded">
                  <span className="text-slate-600 font-bold text-sm mt-0.5">●</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700 mb-0.5">Atual</div>
                    <div className="text-sm font-medium text-slate-900 truncate">{selectedRoom.guest_name}</div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-600">
                      {selectedRoom.checkout_date && (
                        <span>Check-out: {format(parseISO(selectedRoom.checkout_date), "dd/MM/yyyy")}</span>
                      )}
                      {selectedRoom.nights_remaining !== undefined && (
                        <span>{selectedRoom.nights_remaining} noite(s) restante(s)</span>
                      )}
                      {selectedRoom.reservation_code && (
                        <span className="text-slate-500">#{selectedRoom.reservation_code}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Próximo Hóspede */}
              {selectedRoom?.next_guest_name && (
                <div className="flex items-start gap-2 p-2 bg-blue-50 border-l-4 border-blue-500 rounded">
                  <span className="text-blue-600 font-bold text-sm mt-0.5">→</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-blue-700 mb-0.5">Próximo</div>
                    <div className="text-sm font-medium text-slate-900 truncate">{selectedRoom.next_guest_name}</div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-600">
                      {selectedRoom.next_checkin_date && (
                        <span>
                          Check-in: {format(parseISO(selectedRoom.next_checkin_date), "dd/MM/yyyy")}
                          {selectedRoom.next_checkin_time && (
                            <span> às {selectedRoom.next_checkin_time.substring(0, 5)}</span>
                          )}
                        </span>
                      )}
                      {selectedRoom.next_reservation_code && (
                        <span className="text-slate-500">#{selectedRoom.next_reservation_code}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleViewDetails}
              disabled={!selectedRoom?.reservation_id}
            >
              📋 Ver Detalhes Completos
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleChangeStatus}
            >
              🔄 Alterar Status
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleViewReservations}
            >
              📅 Ver Reservas
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start" 
              onClick={() => {
                setActionDialogOpen(false);
                setReservationDialogOpen(true);
              }}
            >
              🛏️ Nova Reserva
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleCheckIn}
              disabled={!selectedRoom?.reservation_id || selectedRoom?.reservation_status === "checkedin"}
            >
              ✅ Check-in
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleCheckOut}
              disabled={!selectedRoom?.reservation_id || selectedRoom?.reservation_status !== "checkedin"}
            >
              🚪 Check-out
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleOpenMaintenance}
            >
              🔧 Abrir Chamado Manutenção
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleRequestCleaning}
              disabled={selectedRoom?.status === "available"}
            >
              🧹 Solicitar Limpeza
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleBlockRoom}
              disabled={selectedRoom?.status === "blocked"}
            >
              🔒 Bloquear Quarto
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start"
              onClick={handleUnblockRoom}
              disabled={selectedRoom?.status !== "blocked"}
            >
              🔓 Desbloquear Quarto
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Nova Reserva */}
      <ReservationDialog
        open={reservationDialogOpen}
        onOpenChange={setReservationDialogOpen}
        onSuccess={() => {
          refetchReservations();
          queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
          setReservationDialogOpen(false);
        }}
        initialData={selectedRoom ? {
          room_id: selectedRoom.id,
          category_id: selectedRoom.category_id,
        } : undefined}
      />

      {/* Modal de Detalhes da Reserva */}
      {selectedRoom?.reservation_id && (
        <ReservationDialog
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          reservationId={selectedRoom.reservation_id}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
            setDetailsDialogOpen(false);
            setSelectedRoom(null);
          }}
        />
      )}

      {/* Modal de Alterar Status */}
      <Dialog open={changeStatusDialogOpen} onOpenChange={setChangeStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Status do Quarto {selectedRoom?.room_number}</DialogTitle>
            <DialogDescription>
              Selecione o novo status para este quarto
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Novo Status</Label>
              <Select value={newStatus} onValueChange={(value) => setNewStatus(value as RoomOccupancyStatus)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(statusConfig).map(([status, config]) => (
                    <SelectItem key={status} value={status}>
                      <div className="flex items-center gap-2">
                        <span>{config.emoji}</span>
                        <span>{config.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setChangeStatusDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveStatus} disabled={!newStatus}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Bloquear Quarto */}
      {selectedRoom && (
        <BlockRoomDialog
          open={blockDialogOpen}
          onOpenChange={setBlockDialogOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
            setBlockDialogOpen(false);
            setSelectedRoom(null);
          }}
          initialData={{
            category_id: selectedRoom.category_id,
            room_id: selectedRoom.id,
            checkin_date: format(selectedDate, "yyyy-MM-dd"),
            checkout_date: format(addDays(selectedDate, 1), "yyyy-MM-dd"),
          }}
        />
      )}

      {/* Modal de Manutenção */}
      {selectedRoom && (
        <MaintenanceTicketDialog
          open={maintenanceDialogOpen}
          onOpenChange={setMaintenanceDialogOpen}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["occupancy_map_rooms"] });
            queryClient.invalidateQueries({ queryKey: ["maintenance_tickets"] });
            setMaintenanceDialogOpen(false);
            setSelectedRoom(null);
          }}
          initialRoomId={selectedRoom.id}
        />
      )}
    </div>
  );
};

export default OccupancyMap;
