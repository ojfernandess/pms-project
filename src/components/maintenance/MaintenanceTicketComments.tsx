import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface MaintenanceTicketCommentsProps {
  ticketId: string;
  isGuest?: boolean;
  guestAccountId?: string;
}

export function MaintenanceTicketComments({ 
  ticketId, 
  isGuest = false,
  guestAccountId 
}: MaintenanceTicketCommentsProps) {
  const [newComment, setNewComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Buscar comentários
  const { data: comments = [], isLoading, refetch } = useQuery({
    queryKey: ["maintenance_ticket_comments", ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("maintenance_ticket_comments")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Buscar dados dos usuários e hóspedes separadamente
      const userIds = [...new Set(data.map((c: any) => c.created_by_user_id).filter(Boolean))];
      const guestIds = [...new Set(data.map((c: any) => c.created_by_guest_id).filter(Boolean))];

      // Buscar usuários
      let usersMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from("users")
          .select("id, email, full_name")
          .in("id", userIds);
        
        if (usersError) {
          console.warn("⚠️ Erro ao buscar usuários para comentários:", usersError);
        }
        
        if (usersData) {
          usersData.forEach((user: any) => {
            usersMap[user.id] = user;
          });
          console.log("✅ Usuários encontrados para comentários:", {
            count: usersData.length,
            users: usersData.map((u: any) => ({ id: u.id, name: u.full_name || u.email }))
          });
        } else {
          console.warn("⚠️ Nenhum usuário encontrado para os IDs:", userIds);
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
      return data.map((comment: any) => ({
        ...comment,
        created_by_user: comment.created_by_user_id ? usersMap[comment.created_by_user_id] : null,
        created_by_guest: comment.created_by_guest_id ? guestsMap[comment.created_by_guest_id] : null,
      }));
    },
  });

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newComment.trim()) {
      toast.error("Digite um comentário");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isGuest && guestAccountId) {
        // Verificar se o ticket pertence ao hóspede e buscar informações do ticket
        const { data: ticket, error: ticketError } = await supabase
          .from("maintenance_tickets")
          .select("id, guest_account_id, title, establishment_id, assigned_to")
          .eq("id", ticketId)
          .single();

        if (ticketError) throw ticketError;

        if (ticket?.guest_account_id !== guestAccountId) {
          throw new Error("Você não tem permissão para comentar neste ticket");
        }

        // Buscar nome do hóspede
        const { data: guestData } = await supabase
          .from("guest_accounts")
          .select("full_name, email")
          .eq("id", guestAccountId)
          .single();

        const guestName = guestData?.full_name || guestData?.email || "Hóspede";

        const { error } = await supabase
          .from("maintenance_ticket_comments")
          .insert([{
            ticket_id: ticketId,
            comment: newComment.trim(),
            created_by_user_id: null,
            created_by_guest_id: guestAccountId,
          }]);

        if (error) throw error;

        // Atualizar updated_at do ticket
        await supabase
          .from("maintenance_tickets")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", ticketId);

        // Criar notificações para usuários do PMS quando o hóspede responde
        if (ticket?.establishment_id) {
          try {
            const commentPreview = newComment.trim().substring(0, 100);
            const message = commentPreview.length < newComment.trim().length 
              ? `${commentPreview}...` 
              : commentPreview;

            // Notificar todos os usuários do estabelecimento
            const { error: notificationError } = await supabase.rpc("create_notification_for_establishment", {
              p_establishment_id: ticket.establishment_id,
              p_type: "maintenance_ticket",
              p_title: "Nova Resposta do Hóspede",
              p_message: `${guestName} respondeu no chamado "${ticket.title}": "${message}"`,
              p_priority: "medium",
              p_metadata: {
                ticket_id: ticket.id,
                comment_id: null, // Será atualizado se necessário
                guest_account_id: guestAccountId,
                is_guest_response: true,
              },
            });

            if (notificationError) {
              console.error("❌ Erro ao criar notificação para estabelecimento:", notificationError);
            } else {
              console.log("✅ Notificação criada para estabelecimento sobre resposta do hóspede");
            }

            // Se o ticket tiver um usuário atribuído, criar notificação específica para ele também
            if (ticket.assigned_to) {
              const { error: assignedUserError } = await supabase.rpc("create_notification", {
                p_establishment_id: ticket.establishment_id,
                p_user_id: ticket.assigned_to,
                p_type: "maintenance_ticket",
                p_title: "Nova Resposta do Hóspede",
                p_message: `${guestName} respondeu no chamado "${ticket.title}": "${message}"`,
                p_priority: "high", // Prioridade maior para usuário atribuído
                p_metadata: {
                  ticket_id: ticket.id,
                  comment_id: null,
                  guest_account_id: guestAccountId,
                  is_guest_response: true,
                },
              });

              if (assignedUserError) {
                console.error("❌ Erro ao criar notificação para usuário atribuído:", assignedUserError);
              } else {
                console.log("✅ Notificação criada para usuário atribuído sobre resposta do hóspede");
              }
            }
          } catch (notifError) {
            console.error("Erro ao criar notificações para resposta do hóspede:", notifError);
            // Não falhar a criação do comentário por causa da notificação
          }
        }
      } else {
        // Comentário de usuário do sistema
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          throw new Error("Usuário não autenticado");
        }

        // Buscar informações do ticket para verificar se é de um hóspede
        const { data: ticket, error: ticketError } = await supabase
          .from("maintenance_tickets")
          .select("id, guest_account_id, title, establishment_id")
          .eq("id", ticketId)
          .single();

        if (ticketError) {
          console.error("Erro ao buscar ticket:", ticketError);
        }

        const { error } = await supabase
          .from("maintenance_ticket_comments")
          .insert([{
            ticket_id: ticketId,
            comment: newComment.trim(),
            created_by_user_id: user.id,
            created_by_guest_id: null,
          }]);

        if (error) throw error;

        // Se o ticket pertence a um hóspede, criar notificação
        if (ticket?.guest_account_id) {
          try {
            // Buscar nome do usuário
            const { data: userData } = await supabase
              .from("users")
              .select("full_name, email")
              .eq("id", user.id)
              .single();

            const userName = userData?.full_name || userData?.email || "Equipe de Manutenção";
            const commentPreview = newComment.trim().substring(0, 100);
            const message = commentPreview.length < newComment.trim().length 
              ? `${commentPreview}...` 
              : commentPreview;

            // Criar notificação para o hóspede (será exibida no GuestDashboard)
            // Usamos uma abordagem simples: atualizar o updated_at do ticket para que seja detectado
            // A notificação será criada dinamicamente no GuestDashboard quando detectar comentários novos
            await supabase
              .from("maintenance_tickets")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", ticketId);

            console.log("✅ Ticket atualizado para notificar hóspede sobre novo comentário");
          } catch (notifError) {
            console.error("Erro ao criar notificação para hóspede:", notifError);
            // Não falhar a criação do comentário por causa da notificação
          }
        }
      }

      setNewComment("");
      await refetch();
      toast.success("Comentário adicionado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar comentário");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getAuthorName = (comment: any) => {
    if (comment.created_by_user) {
      return comment.created_by_user.full_name || comment.created_by_user.email || "Usuário";
    }
    if (comment.created_by_guest) {
      return comment.created_by_guest.full_name || comment.created_by_guest.email || "Hóspede";
    }
    return "Usuário";
  };

  const getAuthorInitials = (comment: any) => {
    const name = getAuthorName(comment);
    return name
      .split(" ")
      .map((n: string) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  };

  const isGuestComment = (comment: any) => {
    return !!comment.created_by_guest_id && !comment.created_by_user_id;
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

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5 text-slate-600" />
        <h3 className="font-semibold text-slate-900">Comentários</h3>
        {comments.length > 0 && (
          <span className="text-sm text-slate-500">({comments.length})</span>
        )}
      </div>

      {/* Lista de comentários */}
      <div className="space-y-4 mb-4 max-h-96 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">
            Nenhum comentário ainda. Seja o primeiro a comentar!
          </p>
        ) : (
          comments.map((comment: any) => {
            const isGuest = isGuestComment(comment);
            return (
              <div
                key={comment.id}
                className={cn(
                  "flex gap-3 p-3 rounded-lg",
                  isGuest 
                    ? "bg-blue-50 border border-blue-100" 
                    : "bg-slate-50 border border-slate-100"
                )}
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={cn(
                    "text-xs",
                    isGuest ? "bg-blue-200 text-blue-700" : "bg-slate-200 text-slate-700"
                  )}>
                    {getAuthorInitials(comment)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-slate-900">
                      {getAuthorName(comment)}
                    </span>
                    {isGuest && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                        Hóspede
                      </span>
                    )}
                    {!isGuest && comment.created_by_user_id && (
                      <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full">
                        Equipe
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      {format(new Date(comment.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {comment.comment}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Formulário de novo comentário */}
      <form onSubmit={handleSubmitComment} className="space-y-2">
        <Textarea
          placeholder={isGuest ? "Digite sua dúvida ou contestação..." : "Digite seu comentário..."}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="min-h-[80px] resize-none"
          disabled={isSubmitting}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            disabled={!newComment.trim() || isSubmitting}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Enviar
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
}

