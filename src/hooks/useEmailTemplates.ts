import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

type EmailTemplateInsert = TablesInsert<'email_templates'>;
type EmailTemplateUpdate = TablesUpdate<'email_templates'>;

export const useEmailTemplates = () => {
  const queryClient = useQueryClient();

  // Buscar todos os templates
  const templatesQuery = useQuery({
    queryKey: ['email_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Criar template
  const createTemplate = useMutation({
    mutationFn: async (template: EmailTemplateInsert) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from('email_templates')
        .insert([{
          ...template,
          created_by: user?.id || null,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_templates'] });
      toast.success('Template criado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao criar template');
    },
  });

  // Atualizar template
  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & EmailTemplateUpdate) => {
      console.log('📝 Atualizando template:', { id, updates: Object.keys(updates) });
      
      // Primeiro, verificar se o template existe
      const { data: existingTemplate, error: checkError } = await supabase
        .from('email_templates')
        .select('id')
        .eq('id', id)
        .maybeSingle();

      if (checkError) {
        console.error('❌ Erro ao verificar template:', checkError);
        throw checkError;
      }

      if (!existingTemplate) {
        const error = new Error('Template não encontrado. Pode ter sido deletado ou você não tem permissão para editá-lo.');
        console.error('❌', error.message);
        throw error;
      }
      
      // Garantir que updated_at seja atualizado explicitamente (o trigger deve fazer isso, mas vamos garantir)
      const { data, error } = await supabase
        .from('email_templates')
        .update({
          ...updates,
          updated_at: new Date().toISOString(), // Forçar atualização do updated_at
        })
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        console.error('❌ Erro ao atualizar template:', error);
        throw error;
      }

      if (!data) {
        const error = new Error('Template não foi atualizado. Pode ser um problema de permissões (RLS) ou o template foi deletado durante a atualização.');
        console.error('❌', error.message);
        throw error;
      }
      
      console.log('✅ Template atualizado com sucesso:', { 
        id: data.id, 
        name: data.name,
        updated_at: data.updated_at,
        body_html_length: data.body_html?.length || 0,
        subject_length: data.subject?.length || 0
      });
      
      return data;
    },
    onSuccess: (data) => {
      // Invalidar cache de templates
      queryClient.invalidateQueries({ queryKey: ['email_templates'] });
      // Também remover do cache para forçar recarregamento
      queryClient.removeQueries({ queryKey: ['email_templates'] });
      console.log('🔄 Cache de templates invalidado');
      toast.success('Template atualizado com sucesso!');
    },
    onError: (error: any) => {
      console.error('❌ Erro ao atualizar template:', error);
      toast.error(error.message || 'Erro ao atualizar template');
    },
  });

  // Deletar template
  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email_templates'] });
      toast.success('Template deletado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao deletar template');
    },
  });

  // Enviar e-mail de teste
  const sendTestEmail = useMutation({
    mutationFn: async ({ templateId, recipientEmail, variables }: {
      templateId: string;
      recipientEmail: string;
      variables?: Record<string, any>;
    }) => {
      // Buscar template
      const { data: template, error: templateError } = await supabase
        .from('email_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (templateError || !template) {
        throw new Error('Template não encontrado');
      }

      // Processar template (simplificado para teste)
      const { processTemplate } = await import('@/lib/emailTemplateEngine');
      const subject = processTemplate(template.subject, variables || {});
      const bodyHtml = processTemplate(template.body_html, variables || {});

      // Adicionar à fila
      const { data, error } = await supabase
        .from('email_queue')
        .insert([{
          template_id: templateId,
          event_type: template.event_type,
          recipient_email: recipientEmail,
          subject,
          body_html: bodyHtml,
          status: 'pending',
          priority: 2, // Alta prioridade para testes
        }])
        .select('id')
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('E-mail de teste adicionado à fila!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao enviar e-mail de teste');
    },
  });

  return {
    templates: templatesQuery.data || [],
    isLoading: templatesQuery.isLoading,
    refetch: templatesQuery.refetch,
    createTemplate: createTemplate.mutateAsync,
    updateTemplate: updateTemplate.mutateAsync,
    deleteTemplate: deleteTemplate.mutateAsync,
    sendTestEmail: sendTestEmail.mutateAsync,
    isCreating: createTemplate.isPending,
    isUpdating: updateTemplate.isPending,
    isDeleting: deleteTemplate.isPending,
    isSendingTest: sendTestEmail.isPending,
  };
};

