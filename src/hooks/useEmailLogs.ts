import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useEmailLogs = (filters?: {
  reservationId?: string;
  recipientEmail?: string;
  status?: string;
  eventType?: string;
  limit?: number;
}) => {
  const queryClient = useQueryClient();

  // Buscar logs de e-mail
  const logsQuery = useQuery({
    queryKey: ['email_logs', filters],
    queryFn: async () => {
      let query = supabase
        .from('email_logs')
        .select(`
          *,
          reservation:reservations(*),
          template:email_templates(name, event_type)
        `)
        .order('created_at', { ascending: false });

      if (filters?.reservationId) {
        query = query.eq('reservation_id', filters.reservationId);
      }
      if (filters?.recipientEmail) {
        query = query.ilike('recipient_email', `%${filters.recipientEmail}%`);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.eventType) {
        query = query.eq('event_type', filters.eventType);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.limit(100); // Limite padrão
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Erro ao buscar logs de e-mail:', error);
        throw error;
      }
      
      console.log('✅ Logs de e-mail carregados:', {
        total: data?.length || 0,
        logs: data?.map((log: any) => ({
          id: log.id,
          event_type: log.event_type,
          status: log.status,
          hasReservation: !!log.reservation,
          reservationCode: log.reservation?.reservation_code,
          hasTemplate: !!log.template,
        }))
      });
      
      return data;
    },
  });

  // Reenviar e-mail
  const resendEmail = useMutation({
    mutationFn: async (logId: string) => {
      // Buscar log original
      const { data: log, error: logError } = await supabase
        .from('email_logs')
        .select('*')
        .eq('id', logId)
        .single();

      if (logError || !log) {
        throw new Error('Log não encontrado');
      }

      // Adicionar à fila novamente
      const { data, error } = await supabase
        .from('email_queue')
        .insert([{
          template_id: log.template_id,
          event_type: log.event_type,
          recipient_email: log.recipient_email,
          recipient_name: log.recipient_name,
          subject: log.subject,
          body_html: log.body_html,
          body_text: log.body_text,
          reservation_id: log.reservation_id,
          status: 'pending',
          priority: 1, // Prioridade alta para reenvios
        }])
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_queue'] });
      toast.success('E-mail adicionado à fila para reenvio!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao reenviar e-mail');
    },
  });

  return {
    logs: logsQuery.data || [],
    isLoading: logsQuery.isLoading,
    refetch: logsQuery.refetch,
    resendEmail: resendEmail.mutateAsync,
    isResending: resendEmail.isPending,
  };
};

