import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MaintenanceTicketComments } from "@/components/maintenance/MaintenanceTicketComments";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Wrench, MessageSquare, Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface GuestMaintenanceTicketsProps {
  guestAccountId: string;
  reservationId?: string;
  openTicketId?: string; // ID do ticket para abrir automaticamente
}

export function GuestMaintenanceTickets({ 
  guestAccountId, 
  reservationId,
  openTicketId
}: GuestMaintenanceTicketsProps) {
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Buscar tickets do hóspede
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["guest_maintenance_tickets", guestAccountId, reservationId],
    queryFn: async () => {
      // Se não tiver guestAccountId nem reservationId, não buscar
      if (!guestAccountId && !reservationId) {
        console.warn("⚠️ guestAccountId e reservationId não fornecidos para buscar tickets");
        return [];
      }

      console.log("🔍 Buscando tickets para hóspede:", { guestAccountId, reservationId });

      let data: any[] = [];
      let error: any = null;

      // Buscar tickets por guest_account_id se disponível
      // NÃO usar joins - buscar relacionamentos separadamente para evitar problemas de RLS
      if (guestAccountId) {
        // Buscar tickets básicos (sem joins)
        const { data: ticketsData, error: ticketsError } = await supabase
          .from("maintenance_tickets")
          .select("*")
          .eq("guest_account_id", guestAccountId)
          .order("opened_at", { ascending: false });

        console.log("📋 Tickets encontrados:", {
          count: ticketsData?.length || 0,
          error: ticketsError?.message,
          ticketIds: ticketsData?.map((t: any) => t.id)
        });

        if (ticketsError) {
          console.error("❌ Erro ao buscar tickets:", ticketsError);
          error = ticketsError;
        }

        if (!ticketsData || ticketsData.length === 0) {
          data = [];
        } else {
          data = ticketsData;
          
          // Buscar relacionamentos separadamente
          const roomIds = [...new Set(data.map((t: any) => t.room_id).filter(Boolean))];
          const attachmentTicketIds = data.map((t: any) => t.id);
          const commentTicketIds = data.map((t: any) => t.id);

          // Buscar rooms
          let roomsMap: Record<string, any> = {};
          if (roomIds.length > 0) {
            const { data: roomsData } = await supabase
              .from("rooms")
              .select("*")
              .in("id", roomIds);
            if (roomsData) {
              roomsData.forEach((room: any) => {
                roomsMap[room.id] = room;
              });
            }
          }

          // Buscar attachments
          let attachmentsMap: Record<string, any[]> = {};
          if (attachmentTicketIds.length > 0) {
            const { data: attachmentsData } = await supabase
              .from("maintenance_ticket_attachments")
              .select("*")
              .in("ticket_id", attachmentTicketIds);
            if (attachmentsData) {
              attachmentsData.forEach((att: any) => {
                if (!attachmentsMap[att.ticket_id]) {
                  attachmentsMap[att.ticket_id] = [];
                }
                attachmentsMap[att.ticket_id].push(att);
              });
            }
          }

          // Buscar comments
          let commentsMap: Record<string, any[]> = {};
          if (commentTicketIds.length > 0) {
            const { data: commentsData } = await supabase
              .from("maintenance_ticket_comments")
              .select("*")
              .in("ticket_id", commentTicketIds);
            if (commentsData) {
              commentsData.forEach((comment: any) => {
                if (!commentsMap[comment.ticket_id]) {
                  commentsMap[comment.ticket_id] = [];
                }
                commentsMap[comment.ticket_id].push(comment);
              });
            }
          }

          // Combinar dados
          data = data.map((ticket: any) => ({
            ...ticket,
            rooms: ticket.room_id ? roomsMap[ticket.room_id] || null : null,
            maintenance_ticket_attachments: attachmentsMap[ticket.id] || [],
            maintenance_ticket_comments: commentsMap[ticket.id] || [],
          }));
        }
      }

      if (error) {
        console.error("❌ Erro ao buscar tickets por guest_account_id:", error);
        // Continuar para tentar por reservation_id
      }

      console.log("✅ Tickets encontrados por guest_account_id:", { count: data?.length || 0 });

      // Se não encontrou tickets por guest_account_id, tentar por reservation_id
      if ((!data || data.length === 0) && reservationId) {
        console.log("🔍 Tentando buscar tickets por reservation_id:", reservationId);
        
        // Primeiro, verificar se existem tickets com esse reservation_id (sem filtro)
        const { data: allReservationTickets, error: allResError } = await supabase
          .from("maintenance_tickets")
          .select("id, guest_account_id, reservation_id, title, status")
          .eq("reservation_id", reservationId)
          .limit(10);

        console.log("📊 Todos os tickets da reserva (debug):", { 
          count: allReservationTickets?.length || 0, 
          tickets: allReservationTickets,
          error: allResError 
        });

        const { data: reservationTickets, error: reservationError } = await supabase
          .from("maintenance_tickets")
          .select(`
            *,
            rooms (*),
            maintenance_ticket_attachments (*),
            maintenance_ticket_comments (*)
          `)
          .eq("reservation_id", reservationId)
          .order("opened_at", { ascending: false });

        if (reservationError) {
          console.error("❌ Erro ao buscar tickets por reservation_id:", reservationError);
        } else {
          console.log("✅ Tickets encontrados por reservation_id:", { 
            count: reservationTickets?.length || 0,
            tickets: reservationTickets?.map((t: any) => ({
              id: t.id,
              guest_account_id: t.guest_account_id,
              reservation_id: t.reservation_id,
              title: t.title
            }))
          });
          if (reservationTickets && reservationTickets.length > 0) {
            // Filtrar apenas tickets que pertencem ao hóspede ou que não têm guest_account_id (tickets antigos)
            const filteredTickets = reservationTickets.filter(
              (ticket: any) => !ticket.guest_account_id || ticket.guest_account_id === guestAccountId
            );
            console.log("🔍 Tickets filtrados:", { 
              total: reservationTickets.length,
              filtrados: filteredTickets.length,
              filtradosIds: filteredTickets.map((t: any) => t.id)
            });
            if (filteredTickets.length > 0) {
              data = filteredTickets;
            }
          }
        }
      }

      // Se ainda não encontrou nada, retornar array vazio
      if (!data || data.length === 0) {
        console.log("ℹ️ Nenhum ticket encontrado");
        return [];
      }

      // Buscar dados dos usuários e hóspedes separadamente para os comentários
      const allComments = data.flatMap((ticket: any) => ticket.maintenance_ticket_comments || []);
      const userIds = [...new Set(allComments.map((c: any) => c.created_by_user_id).filter(Boolean))];
      const guestIds = [...new Set(allComments.map((c: any) => c.created_by_guest_id).filter(Boolean))];

      // Buscar usuários
      let usersMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, email, full_name")
          .in("id", userIds);
        
        if (usersData) {
          usersData.forEach((user: any) => {
            usersMap[user.id] = user;
          });
        }
      }

      // Buscar hóspedes
      let guestsMap: Record<string, any> = {};
      if (guestIds.length > 0) {
        const { data: guestsData } = await supabase
          .from("guest_accounts")
          .select("id, email, full_name")
          .in("id", guestIds);
        
        if (guestsData) {
          guestsData.forEach((guest: any) => {
            guestsMap[guest.id] = guest;
          });
        }
      }

      // Combinar dados
      return data.map((ticket: any) => ({
        ...ticket,
        maintenance_ticket_comments: (ticket.maintenance_ticket_comments || []).map((comment: any) => ({
          ...comment,
          created_by_user: comment.created_by_user_id ? usersMap[comment.created_by_user_id] : null,
          created_by_guest: comment.created_by_guest_id ? guestsMap[comment.created_by_guest_id] : null,
        })),
      }));
    },
    enabled: !!(guestAccountId || reservationId), // Habilitar query se tiver guestAccountId ou reservationId
  });

  // Abrir ticket automaticamente se openTicketId for fornecido ou se receber evento
  useEffect(() => {
    const handleOpenTicket = (event: CustomEvent) => {
      const ticketId = event.detail?.ticketId;
      if (ticketId && tickets.length > 0) {
        const ticketToOpen = tickets.find((t: any) => t.id === ticketId);
        if (ticketToOpen) {
          setSelectedTicket(ticketToOpen);
          setDetailsOpen(true);
        }
      }
    };

    window.addEventListener('openMaintenanceTicket', handleOpenTicket as EventListener);
    
    if (openTicketId && tickets.length > 0) {
      const ticketToOpen = tickets.find((t: any) => t.id === openTicketId);
      if (ticketToOpen && !detailsOpen) {
        setSelectedTicket(ticketToOpen);
        setDetailsOpen(true);
      }
    }

    return () => {
      window.removeEventListener('openMaintenanceTicket', handleOpenTicket as EventListener);
    };
  }, [openTicketId, tickets, detailsOpen]);

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

  const getUnreadCommentsCount = (ticket: any) => {
    if (!ticket.maintenance_ticket_comments) return 0;
    // Contar comentários de usuários do sistema (não hóspedes)
    return ticket.maintenance_ticket_comments.filter(
      (comment: any) => comment.created_by_user_id && !comment.created_by_guest_id
    ).length;
  };

  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      </Card>
    );
  }

  if (tickets.length === 0) {
    return (
      <Card className="p-4">
        <div className="text-center py-8">
          <Wrench className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            Nenhum chamado de manutenção encontrado
          </p>
        </div>
      </Card>
    );
  }

  return (
    <>
      <div id="guest-maintenance-tickets" className="space-y-3">
        {tickets.map((ticket: any) => {
          const unreadCount = getUnreadCommentsCount(ticket);
          const hasNewComments = unreadCount > 0;

          return (
            <Card 
              key={ticket.id}
              className={cn(
                "p-4 hover:shadow-md transition-all border cursor-pointer",
                hasNewComments && "border-blue-300 bg-blue-50/30"
              )}
              onClick={() => {
                setSelectedTicket(ticket);
                setDetailsOpen(true);
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono font-medium text-slate-500 tracking-wider">
                      {ticket.id?.substring(0, 8).toUpperCase() || "N/A"}
                    </span>
                    <Wrench className="h-4 w-4 text-slate-500" />
                    <h3 className="font-semibold text-slate-900">
                      {ticket.title}
                    </h3>
                    {hasNewComments && (
                      <Badge className="bg-blue-600 text-white text-xs">
                        {unreadCount} nova{unreadCount > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  
                  {ticket.description && (
                    <p className="text-sm text-slate-600 line-clamp-2 mb-2">
                      {ticket.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 flex-wrap">
                    {getStatusBadge(ticket.status)}
                    {getPriorityBadge(ticket.priority)}
                    <span className="text-xs text-slate-500">
                      Quarto {ticket.rooms?.room_number || "N/A"}
                    </span>
                    <span className="text-xs text-slate-500">
                      {format(new Date(ticket.opened_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {ticket.maintenance_ticket_comments && ticket.maintenance_ticket_comments.length > 0 && (
                    <div className="flex items-center gap-1 text-sm text-slate-500">
                      <MessageSquare className="h-4 w-4" />
                      <span>{ticket.maintenance_ticket_comments.length}</span>
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTicket(ticket);
                      setDetailsOpen(true);
                    }}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Ver
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Diálogo de Detalhes */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-medium text-slate-500 tracking-wider">
                  {selectedTicket?.id?.substring(0, 8).toUpperCase() || "N/A"}
                </span>
                <span className="text-slate-400">•</span>
                <span>{selectedTicket?.title}</span>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedTicket && (
            <div className="space-y-4">
              {/* Informações do Ticket */}
              <Card className="p-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Quarto:</span>
                    <span className="text-sm text-slate-900">
                      {selectedTicket.rooms?.room_number || "N/A"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Status:</span>
                    {getStatusBadge(selectedTicket.status)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Prioridade:</span>
                    {getPriorityBadge(selectedTicket.priority)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Descrição:</span>
                    <span className="text-sm text-slate-900">
                      {selectedTicket.description || "Sem descrição"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600">Aberto em:</span>
                    <span className="text-sm text-slate-900">
                      {format(new Date(selectedTicket.opened_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Comentários */}
              <MaintenanceTicketComments 
                ticketId={selectedTicket.id} 
                isGuest={true}
                guestAccountId={guestAccountId}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

