import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type EmailSettingsInsert = TablesInsert<'email_settings'>;
type EmailSettingsUpdate = TablesUpdate<'email_settings'>;

export const useEmailSettings = () => {
  const queryClient = useQueryClient();

  // Buscar configurações de e-mail
  const settingsQuery = useQuery({
    queryKey: ['email_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error;
      }
      return data;
    },
  });

  // Criar ou atualizar configurações
  const upsertSettings = useMutation({
    mutationFn: async (settings: EmailSettingsInsert | EmailSettingsUpdate) => {
      // Verificar se já existe configuração
      const { data: existing } = await supabase
        .from('email_settings')
        .select('id')
        .limit(1)
        .single();

      let data, error;

      if (existing) {
        // Atualizar
        ({ data, error } = await supabase
          .from('email_settings')
          .update(settings)
          .eq('id', existing.id)
          .select()
          .single());
      } else {
        // Criar
        ({ data, error } = await supabase
          .from('email_settings')
          .insert([settings])
          .select()
          .single());
      }

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_settings'] });
      toast.success('Configurações salvas com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao salvar configurações');
    },
  });

  // Testar configurações de e-mail
  const testSettings = useMutation({
    mutationFn: async (testEmail: string) => {
      // Adicionar e-mail de teste à fila
      const { data: queueItem, error: insertError } = await supabase
        .from('email_queue')
        .insert([{
          event_type: 'reservation.created',
          recipient_email: testEmail,
          subject: 'Teste de Configuração de E-mail - PMS',
          body_html: `
            <html>
              <body>
                <h2>Teste de Configuração</h2>
                <p>Se você recebeu este e-mail, suas configurações de e-mail estão funcionando corretamente!</p>
                <p>Data/Hora: ${new Date().toLocaleString('pt-BR')}</p>
              </body>
            </html>
          `,
          status: 'pending',
          priority: 2, // Alta prioridade
        }])
        .select('id')
        .single();

      if (insertError) throw insertError;
      if (!queueItem?.id) throw new Error('Erro ao criar item na fila');

      // Processar o e-mail imediatamente
      const { processEmailQueue } = await import('@/lib/emailService');
      const success = await processEmailQueue(queueItem.id);

      if (!success) {
        // Buscar o erro na fila
        const { data: queueData } = await supabase
          .from('email_queue')
          .select('error_message, status')
          .eq('id', queueItem.id)
          .single();

        throw new Error(queueData?.error_message || 'Erro ao enviar e-mail');
      }

      return { queueId: queueItem.id, success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_queue'] });
      queryClient.invalidateQueries({ queryKey: ['email_logs'] });
      toast.success('E-mail de teste enviado com sucesso!');
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ['email_queue'] });
      queryClient.invalidateQueries({ queryKey: ['email_logs'] });
      toast.error(error.message || 'Erro ao enviar e-mail de teste');
    },
  });

  return {
    settings: settingsQuery.data,
    isLoading: settingsQuery.isLoading,
    refetch: settingsQuery.refetch,
    upsertSettings: upsertSettings.mutateAsync,
    testSettings: testSettings.mutateAsync,
    isSaving: upsertSettings.isPending,
    isTesting: testSettings.isPending,
  };
};

