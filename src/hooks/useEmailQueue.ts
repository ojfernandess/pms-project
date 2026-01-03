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
      console.log('🧹 Iniciando limpeza da fila de e-mails...');
      
      // Primeiro, buscar todos os IDs para verificar quantos serão deletados
      const { data: allItems, error: fetchError } = await supabase
        .from('email_queue')
        .select('id, status')
        .in('status', ['pending', 'failed', 'cancelled', 'queued', 'sending']);

      if (fetchError) {
        console.error('Erro ao buscar itens da fila:', fetchError);
        throw fetchError;
      }

      if (!allItems || allItems.length === 0) {
        console.log('ℹ️ Nenhum item para deletar');
        return;
      }

      console.log(`📊 Encontrados ${allItems.length} item(ns) para deletar`);

      // Deletar em lotes se houver muitos itens (limite do Supabase é ~1000 por vez)
      const batchSize = 1000;
      const batches = [];
      for (let i = 0; i < allItems.length; i += batchSize) {
        batches.push(allItems.slice(i, i + batchSize));
      }

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const batchIds = batch.map(item => item.id);
        
        console.log(`🗑️ Deletando lote ${i + 1}/${batches.length} (${batchIds.length} itens)...`);
        
        const { error: deleteError } = await supabase
          .from('email_queue')
          .delete()
          .in('id', batchIds);

        if (deleteError) {
          console.error(`Erro ao deletar lote ${i + 1}:`, deleteError);
          throw deleteError;
        }
      }

      console.log('✅ Limpeza da fila concluída');
      
      // Verificar se ainda há itens restantes
      const { data: remainingItems, error: checkError } = await supabase
        .from('email_queue')
        .select('id')
        .in('status', ['pending', 'failed', 'cancelled', 'queued', 'sending'])
        .limit(1);

      if (checkError) {
        console.warn('Erro ao verificar itens restantes:', checkError);
      }

      if (remainingItems && remainingItems.length > 0) {
        console.warn(`⚠️ Ainda há ${remainingItems.length} item(ns) restante(s) na fila`);
      }
    },
    onSuccess: () => {
      // Invalidar todas as queries relacionadas à fila
      queryClient.invalidateQueries({ queryKey: ['email_queue'] });
      queryClient.removeQueries({ queryKey: ['email_queue'] });
      toast.success('Fila de e-mails limpa com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao limpar fila:', error);
      toast.error(error.message || 'Erro ao limpar fila');
    },
  });

  // Função de refetch melhorada que também invalida o cache
  const handleRefetch = async () => {
    queryClient.invalidateQueries({ queryKey: ['email_queue'] });
    return await queueQuery.refetch();
  };

  return {
    queue: queueQuery.data || [],
    isLoading: queueQuery.isLoading,
    refetch: handleRefetch,
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

