import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useEmailQueue = (filters?: {
  status?: string;
  limit?: number;
}) => {
  const queryClient = useQueryClient();

  // Buscar fila de e-mails
  const queueQuery = useQuery({
    queryKey: ['email_queue', filters],
    queryFn: async () => {
      let query = supabase
        .from('email_queue')
        .select(`
          *,
          reservation:reservations(*),
          template:email_templates(name, event_type)
        `)
        .order('priority', { ascending: false })
        .order('scheduled_at', { ascending: true });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      } else {
        query = query.limit(50); // Limite padrão
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
    refetchInterval: 30000, // Atualizar a cada 30 segundos
  });

  // Processar item da fila (chamar worker)
  const processQueueItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { processEmailQueue } = await import('@/lib/emailService');
      return await processEmailQueue(itemId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_queue'] });
      queryClient.invalidateQueries({ queryKey: ['email_logs'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao processar e-mail');
    },
  });

  // Cancelar e-mail da fila
  const cancelQueueItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('email_queue')
        .update({ status: 'cancelled' })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_queue'] });
      toast.success('E-mail cancelado!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao cancelar e-mail');
    },
  });

  // Reprocessar e-mail falho
  const retryQueueItem = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase
        .from('email_queue')
        .update({
          status: 'pending',
          retry_count: 0,
          error_message: null,
          scheduled_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_queue'] });
      toast.success('E-mail será reprocessado!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao reprocessar e-mail');
    },
  });

  // Limpar toda a fila (deletar todos os e-mails)
  const clearQueue = useMutation({
    mutationFn: async () => {
      // Buscar todos os IDs primeiro para garantir que temos permissão
      const { data: allItems, error: fetchError } = await supabase
        .from('email_queue')
        .select('id');

      if (fetchError) throw fetchError;

      if (!allItems || allItems.length === 0) {
        return; // Nada para deletar
      }

      // Deletar todos os itens
      const { error } = await supabase
        .from('email_queue')
        .delete()
        .in('id', allItems.map(item => item.id));

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_queue'] });
      toast.success('Fila de e-mails limpa com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao limpar fila');
    },
  });

  return {
    queue: queueQuery.data || [],
    isLoading: queueQuery.isLoading,
    refetch: queueQuery.refetch,
    processQueueItem: processQueueItem.mutateAsync,
    cancelQueueItem: cancelQueueItem.mutateAsync,
    retryQueueItem: retryQueueItem.mutateAsync,
    clearQueue: clearQueue.mutateAsync,
    isProcessing: processQueueItem.isPending,
    isCancelling: cancelQueueItem.isPending,
    isRetrying: retryQueueItem.isPending,
    isClearing: clearQueue.isPending,
  };
};

