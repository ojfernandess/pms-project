import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type NotificationType = 
  | 'new_reservation'
  | 'pending_payment'
  | 'pending_service_fee'
  | 'maintenance_ticket'
  | 'reservation_cancelled'
  | 'checkin_today'
  | 'checkout_today'
  | 'other';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Notification {
  id: string;
  establishment_id: string | null;
  user_id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  is_read: boolean;
  read_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreateNotificationParams {
  establishment_id?: string | null;
  user_id?: string | null; // Se null, cria para todos os usuários do estabelecimento
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  message: string;
  metadata?: Record<string, any>;
}

export const useNotifications = () => {
  const queryClient = useQueryClient();

  // Buscar notificações do usuário atual
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Erro ao buscar notificações:", error);
        return [];
      }

      return (data || []) as Notification[];
    },
    refetchInterval: 30000, // Refetch a cada 30 segundos
    refetchOnWindowFocus: true,
  });

  // Buscar notificações não lidas
  const unreadNotificationsQuery = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_read", false)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao buscar notificações não lidas:", error);
        return [];
      }

      return (data || []) as Notification[];
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  // Criar notificação
  const createNotification = useMutation({
    mutationFn: async (params: CreateNotificationParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Se user_id não foi fornecido, usar o usuário atual
      const userId = params.user_id || user?.id;
      
      if (!userId && !params.establishment_id) {
        throw new Error("É necessário fornecer user_id ou establishment_id");
      }

      // Se tem establishment_id mas não user_id, criar para todos os usuários do estabelecimento
      if (params.establishment_id && !params.user_id) {
        const { error } = await supabase.rpc("create_notification_for_establishment", {
          p_establishment_id: params.establishment_id,
          p_type: params.type,
          p_title: params.title,
          p_message: params.message,
          p_priority: params.priority || "medium",
          p_metadata: params.metadata || {},
        });

        if (error) throw error;
        return null;
      }

      // Criar notificação para usuário específico
      const { data, error } = await supabase.rpc("create_notification", {
        p_establishment_id: params.establishment_id || null,
        p_user_id: userId,
        p_type: params.type,
        p_title: params.title,
        p_message: params.message,
        p_priority: params.priority || "medium",
        p_metadata: params.metadata || {},
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Marcar notificação como lida
  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("id", notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Marcar todas como lidas
  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("notifications")
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Todas as notificações foram marcadas como lidas");
    },
  });

  // Deletar notificação
  const deleteNotification = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("id", notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return {
    notifications: notificationsQuery.data || [],
    unreadNotifications: unreadNotificationsQuery.data || [],
    unreadCount: unreadNotificationsQuery.data?.length || 0,
    isLoading: notificationsQuery.isLoading,
    createNotification: createNotification.mutateAsync,
    markAsRead: markAsRead.mutateAsync,
    markAllAsRead: markAllAsRead.mutateAsync,
    deleteNotification: deleteNotification.mutateAsync,
    refetch: notificationsQuery.refetch,
  };
};

