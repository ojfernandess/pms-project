/**
 * Serviço de envio de e-mails
 * Suporta múltiplos provedores: SMTP, SendGrid, Mailgun, SES, Resend
 */

import { supabase } from '@/integrations/supabase/client';
import { processTemplate, generateReservationVariables, type TemplateVariables } from './emailTemplateEngine';

export interface EmailSettings {
  id: string;
  provider: 'smtp' | 'sendgrid' | 'mailgun' | 'ses' | 'resend';
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_secure?: boolean;
  api_key?: string;
  sender_name: string;
  sender_email: string;
  reply_to_email?: string;
  is_active: boolean;
}

export interface EmailQueueItem {
  template_id?: string;
  event_type: string;
  recipient_email: string;
  recipient_name?: string;
  subject: string;
  body_html: string;
  body_text?: string;
  variables?: TemplateVariables;
  reservation_id?: string;
  priority?: number;
  cc_emails?: string; // Emails em cópia, separados por vírgula
  bcc_emails?: string; // Emails em cópia oculta, separados por vírgula
}

/**
 * Obtém as configurações de e-mail ativas
 */
export async function getEmailSettings(): Promise<EmailSettings | null> {
  try {
    const { data, error } = await supabase
      .from('email_settings')
      .select('*')
      .eq('is_active', true)
      .maybeSingle(); // Usar maybeSingle() em vez de single() para não dar erro quando não há registros

    if (error) {
      console.error('Erro ao buscar configurações de e-mail:', error);
      return null;
    }

    if (!data) {
      console.warn('⚠️ Nenhuma configuração de e-mail ativa encontrada');
      return null;
    }

    return data as EmailSettings;
  } catch (error) {
    console.error('Erro ao buscar configurações de e-mail:', error);
    return null;
  }
}

/**
 * Converte string de emails separados por vírgula em array
 */
function parseEmailList(emailString?: string): string[] {
  if (!emailString || !emailString.trim()) return [];
  return emailString
    .split(',')
    .map(email => email.trim())
    .filter(email => email.length > 0 && email.includes('@'));
}

/**
 * Adiciona um e-mail à fila
 */
export async function queueEmail(email: EmailQueueItem): Promise<string | null> {
  try {
    console.log('📬 Adicionando e-mail à fila:', { 
      eventType: email.event_type, 
      recipient: email.recipient_email,
      reservationId: email.reservation_id,
      cc_emails: email.cc_emails || 'Nenhum',
      bcc_emails: email.bcc_emails || 'Nenhum',
      cc_parsed: email.cc_emails ? parseEmailList(email.cc_emails) : [],
      bcc_parsed: email.bcc_emails ? parseEmailList(email.bcc_emails) : []
    });
    
    // Tentar inserir diretamente primeiro
    const { data, error } = await supabase
      .from('email_queue')
      .insert([{
        ...email,
        status: 'pending',
      }])
      .select('id')
      .single();

    // Se houver erro de RLS (403 ou 42501), tentar usar a função que bypassa RLS
    if (error && (error.code === '42501' || error.code === 'PGRST301' || error.message?.includes('row-level security'))) {
      console.warn('⚠️ Erro de RLS ao inserir diretamente, tentando usar função insert_email_queue:', error);
      
      // Usar a função insert_email_queue que bypassa RLS
      // IMPORTANTE: p_template_id e p_recipient_name são obrigatórios na função SQL
      // mas podem ser NULL no banco, então passamos string vazia se não tiver valor
      const { data: functionData, error: functionError } = await supabase.rpc('insert_email_queue', {
        p_template_id: email.template_id || '00000000-0000-0000-0000-000000000000',
        p_event_type: email.event_type,
        p_recipient_email: email.recipient_email,
        p_recipient_name: email.recipient_name || '',
        p_subject: email.subject,
        p_body_html: email.body_html,
        p_reservation_id: email.reservation_id || null,
        p_variables: email.variables || null,
        p_priority: email.priority || 1,
        p_cc_emails: email.cc_emails || null,
        p_bcc_emails: email.bcc_emails || null
      });

      if (functionError) {
        console.error('❌ Erro ao adicionar e-mail à fila via função:', functionError);
        return null;
      }

      console.log('✅ E-mail adicionado à fila com sucesso (via função):', { queueId: functionData });
      return functionData;
    }

    if (error) {
      console.error('❌ Erro ao adicionar e-mail à fila:', error);
      return null;
    }

    console.log('✅ E-mail adicionado à fila com sucesso:', { queueId: data.id });
    return data.id;
  } catch (error) {
    console.error('❌ Erro ao adicionar e-mail à fila:', error);
    return null;
  }
}

/**
 * Processa e envia um e-mail da fila
 * Esta função deve ser chamada por um worker/background job
 */
export async function processEmailQueue(itemId: string): Promise<boolean> {
  // Buscar item da fila
  // Usar maybeSingle() em vez de single() para não dar erro quando não há registros
  const { data: queueItem, error: fetchError } = await supabase
    .from('email_queue')
    .select('*')
    .eq('id', itemId)
    .maybeSingle();

  if (fetchError || !queueItem) {
    console.error('Erro ao buscar item da fila:', fetchError);
    return false;
  }

  // Log para debug de CC e BCC
  if (queueItem.cc_emails || queueItem.bcc_emails) {
    console.log('📧 CC e BCC encontrados na fila:', {
      cc_emails: queueItem.cc_emails,
      bcc_emails: queueItem.bcc_emails,
      cc_parsed: parseEmailList(queueItem.cc_emails),
      bcc_parsed: parseEmailList(queueItem.bcc_emails),
    });
  }

  // Atualizar status para "sending"
  // Tratar erro 403 (Forbidden) que pode ocorrer por RLS
  const { error: updateError } = await supabase
    .from('email_queue')
    .update({ status: 'sending' })
    .eq('id', itemId);
  
  if (updateError) {
    // Se for erro 403 ou 42501 (RLS), logar mas continuar - pode ser problema de RLS
    const isPermissionError = 
      updateError.code === 'PGRST301' || 
      updateError.code === '42501' ||
      updateError.message?.includes('403') ||
      updateError.message?.includes('42501') ||
      updateError.message?.includes('row-level security') ||
      updateError.message?.includes('RLS');
    
    if (isPermissionError) {
      console.warn('⚠️ Permissão negada para atualizar status (RLS/403). Continuando processamento...', {
        code: updateError.code,
        message: updateError.message,
        hint: 'Isso pode ser causado por políticas RLS no Supabase. O processamento continuará.'
      });
    } else {
      console.error('Erro ao atualizar status para sending:', updateError);
      // Não bloquear o processamento por causa disso
    }
  }

  try {
    // Obter configurações de e-mail
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      throw new Error('Configurações de e-mail não encontradas ou inativas');
    }

    // Enviar e-mail baseado no provedor
    let success = false;
    let errorMessage = '';

    console.log('📧 Processando email com provedor:', {
      provider: settings.provider,
      cc_emails: queueItem.cc_emails || 'Nenhum',
      bcc_emails: queueItem.bcc_emails || 'Nenhum'
    });

    // Extrair nome do hotel das variáveis salvas (se disponível)
    const hotelName = queueItem.variables?.hotel_name || undefined;
    
    try {
      switch (settings.provider) {
        case 'smtp':
          console.log('📧 Usando SMTP para enviar email');
          success = await sendViaSMTP(queueItem, settings, hotelName);
          break;
        case 'sendgrid':
          console.log('📧 Usando SendGrid para enviar email');
          success = await sendViaSendGrid(queueItem, settings, hotelName);
          // sendViaSendGrid já lança exceção em caso de erro
          break;
        case 'mailgun':
          console.log('📧 Usando Mailgun para enviar email');
          success = await sendViaMailgun(queueItem, settings, hotelName);
          // sendViaMailgun já lança exceção em caso de erro
          break;
        case 'ses':
          success = await sendViaSES(queueItem, settings);
          if (!success) errorMessage = 'AWS SES não implementado. Use Edge Function.';
          break;
        case 'resend':
          console.log('📧 Usando Resend para enviar email');
          success = await sendViaResend(queueItem, settings, hotelName);
          // sendViaResend já lança exceção em caso de erro, então se chegou aqui é sucesso
          break;
        default:
          throw new Error(`Provedor não suportado: ${settings.provider}`);
      }

      if (success) {
        // Atualizar status para "sent"
        const { error: updateSentError } = await supabase
          .from('email_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
          })
          .eq('id', itemId);
        
        // Se houver erro 403 ou 42501 (RLS), logar mas considerar como sucesso (e-mail foi enviado)
        if (updateSentError) {
          const isPermissionError = 
            updateSentError.code === 'PGRST301' || 
            updateSentError.code === '42501' ||
            updateSentError.message?.includes('403') ||
            updateSentError.message?.includes('42501') ||
            updateSentError.message?.includes('row-level security') ||
            updateSentError.message?.includes('RLS');
          
          if (isPermissionError) {
            console.warn('⚠️ E-mail enviado com sucesso, mas permissão negada para atualizar status (RLS/403).', {
              code: updateSentError.code,
              message: updateSentError.message,
              hint: 'Isso pode ser causado por políticas RLS no Supabase. O e-mail foi enviado, mas o status não foi atualizado.'
            });
          } else {
            console.error('Erro ao atualizar status para sent:', updateSentError);
          }
        }
        return true;
      } else {
        throw new Error(errorMessage || 'Erro desconhecido ao enviar e-mail');
      }
    } catch (sendError: any) {
      // Capturar erros específicos dos provedores
      errorMessage = sendError.message || 'Erro ao enviar e-mail';
      throw sendError; // Re-throw para ser capturado no catch externo
    }
  } catch (error: any) {
    const errorMsg = error.message || 'Erro ao processar e-mail';
    const retryCount = (queueItem.retry_count || 0) + 1;
    const maxRetries = queueItem.max_retries || 3;

    // Atualizar status para "failed" se excedeu tentativas
    if (retryCount >= maxRetries) {
      const { error: updateFailedError } = await supabase
        .from('email_queue')
        .update({
          status: 'failed',
          error_message: errorMsg,
          retry_count: retryCount,
        })
        .eq('id', itemId);
      
      const isPermissionError = 
        updateFailedError?.code === 'PGRST301' || 
        updateFailedError?.code === '42501' ||
        updateFailedError?.message?.includes('403') ||
        updateFailedError?.message?.includes('42501') ||
        updateFailedError?.message?.includes('row-level security') ||
        updateFailedError?.message?.includes('RLS');
      
      if (updateFailedError && !isPermissionError) {
        console.error('Erro ao atualizar status para failed:', updateFailedError);
      } else if (isPermissionError) {
        console.warn('⚠️ Permissão negada para atualizar status (RLS/403).', updateFailedError);
      }
    } else {
      // Tentar novamente depois
      const { error: updatePendingError } = await supabase
        .from('email_queue')
        .update({
          status: 'pending',
          error_message: errorMsg,
          retry_count: retryCount,
          scheduled_at: new Date(Date.now() + 60000 * retryCount).toISOString(), // Backoff exponencial
        })
        .eq('id', itemId);
      
      const isPermissionError = 
        updatePendingError?.code === 'PGRST301' || 
        updatePendingError?.code === '42501' ||
        updatePendingError?.message?.includes('403') ||
        updatePendingError?.message?.includes('42501') ||
        updatePendingError?.message?.includes('row-level security') ||
        updatePendingError?.message?.includes('RLS');
      
      if (updatePendingError && !isPermissionError) {
        console.error('Erro ao atualizar status para pending:', updatePendingError);
      } else if (isPermissionError) {
        console.warn('⚠️ Permissão negada para atualizar status (RLS/403).', updatePendingError);
      }
    }

    console.error('Erro ao processar e-mail:', error);
    return false;
  }
}

/**
 * Envia e-mail via SMTP (usando API do Supabase Edge Function ou serviço externo)
 */
async function sendViaSMTP(queueItem: any, settings: EmailSettings, hotelName?: string): Promise<boolean> {
  // Para SMTP, precisamos de uma Edge Function do Supabase
  // Tentar chamar a Edge Function, se não existir, retornar erro claro
  
  try {
    // Verificar se as configurações SMTP estão completas
    if (!settings.smtp_host || !settings.smtp_username || !settings.smtp_password) {
      throw new Error('Configurações SMTP incompletas. Verifique host, usuário e senha.');
    }

    // Processar CC e BCC
    const ccEmails = parseEmailList(queueItem.cc_emails);
    const bccEmails = parseEmailList(queueItem.bcc_emails);
    
    // Garantir que sender_name não esteja vazio - usar nome do hotel como fallback
    const senderName = settings.sender_name?.trim() || hotelName || 'PMS System';
    
    const smtpPayload = {
      to: queueItem.recipient_email,
      to_name: queueItem.recipient_name,
      from: settings.sender_email,
      from_name: senderName,
      reply_to: settings.reply_to_email || settings.sender_email,
      subject: queueItem.subject,
      html: queueItem.body_html,
      text: queueItem.body_text,
      ...(ccEmails.length > 0 ? { cc: ccEmails.join(',') } : {}),
      ...(bccEmails.length > 0 ? { bcc: bccEmails.join(',') } : {}),
      smtp_config: {
        host: settings.smtp_host,
        port: settings.smtp_port,
        secure: settings.smtp_secure,
        auth: {
          user: settings.smtp_username,
          pass: settings.smtp_password,
        },
      },
    };
    
    console.log('📧 SMTP - Payload completo sendo enviado:', {
      ...smtpPayload,
      from_name: senderName,
      original_sender_name: settings.sender_name,
      smtp_config: { ...smtpPayload.smtp_config, auth: { user: smtpPayload.smtp_config.auth.user, pass: '***' } }
    });
    
    // Chamar Edge Function do Supabase para enviar via SMTP
    try {
      const result = await supabase.functions.invoke('send-email-smtp', {
        body: smtpPayload,
      });
      
      // Verificar se há erro no resultado
      if (result.error) {
        const errorMessage = result.error.message || result.error.toString();
        
        // Tentar obter detalhes do erro da resposta
        let details = errorMessage;
        let hint = '';
        
        if (result.data && typeof result.data === 'object') {
          details = result.data.error || result.data.details || errorMessage;
          hint = result.data.hint || '';
        }
        
        const fullMessage = hint 
          ? `${details}. ${hint}`
          : details;
        
        throw new Error(fullMessage);
      }
      
      // Se result.data é string e contém erro, pode ser uma resposta de erro
      if (typeof result.data === 'string' && result.data.includes('error')) {
        try {
          const parsed = JSON.parse(result.data);
          if (parsed.error) {
            throw new Error(parsed.details || parsed.error);
          }
        } catch {
          // Ignorar se não for JSON
        }
      }
      
      // Verificar se result.data contém erro (status 500 mas sem result.error)
      if (result.data && typeof result.data === 'object') {
        if (result.data.error) {
          const details = result.data.details || result.data.error;
          const hint = result.data.hint || '';
          throw new Error(
            hint 
              ? `${details}. ${hint}`
              : details
          );
        }
        
        // Verificar se a resposta indica sucesso
        if (result.data.success) {
          return true;
        }
      }
      
      // Se não houver erro mas também não houver sucesso explícito, considerar como sucesso
      return true;
    } catch (invokeError: any) {
      // Capturar erros de CORS, função não encontrada, etc.
      const errorMessage = invokeError.message || invokeError.toString();
      
      if (
        errorMessage.includes('CORS') ||
        errorMessage.includes('Function not found') ||
        errorMessage.includes('404') ||
        errorMessage.includes('Failed to send a request') ||
        errorMessage.includes('ERR_FAILED')
      ) {
        throw new Error(
          'Edge Function "send-email-smtp" não encontrada ou não configurada. ' +
          'Para usar SMTP, é necessário criar uma Edge Function no Supabase. ' +
          'Recomendamos usar SendGrid, Mailgun ou Resend que funcionam diretamente do frontend.'
        );
      }
      
      // Re-throw o erro original com a mensagem
      throw invokeError;
    }
  } catch (error: any) {
    console.error('Erro ao enviar via SMTP:', error);
    throw error; // Re-throw para capturar a mensagem de erro
  }
}

/**
 * Envia e-mail via SendGrid
 */
async function sendViaSendGrid(queueItem: any, settings: EmailSettings, hotelName?: string): Promise<boolean> {
  try {
    if (!settings.api_key) {
      throw new Error('API Key do SendGrid não configurada');
    }

    if (!settings.sender_email) {
      throw new Error('E-mail do remetente não configurado');
    }

    // Processar CC e BCC
    const ccEmails = parseEmailList(queueItem.cc_emails);
    const bccEmails = parseEmailList(queueItem.bcc_emails);
    
    console.log('📧 SendGrid - CC e BCC processados:', {
      cc_emails: queueItem.cc_emails,
      bcc_emails: queueItem.bcc_emails,
      cc_parsed: ccEmails,
      bcc_parsed: bccEmails,
      cc_count: ccEmails.length,
      bcc_count: bccEmails.length
    });
    
    const personalizations: any = {
      to: [{ email: queueItem.recipient_email, name: queueItem.recipient_name || undefined }],
    };
    
    if (ccEmails.length > 0) {
      personalizations.cc = ccEmails.map(email => ({ email }));
      console.log('✅ SendGrid - CC adicionado:', personalizations.cc);
    }
    
    if (bccEmails.length > 0) {
      personalizations.bcc = bccEmails.map(email => ({ email }));
      console.log('✅ SendGrid - BCC adicionado:', personalizations.bcc);
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.api_key}`,
        'Content-Type': 'application/json',
      },
      body: (() => {
        // Garantir que sender_name não esteja vazio - usar nome do hotel como fallback
        const senderName = settings.sender_name?.trim() || hotelName || 'PMS System';
        
        const payload = {
          personalizations: [personalizations],
          from: { email: settings.sender_email, name: senderName },
          reply_to: { email: settings.reply_to_email || settings.sender_email },
          subject: queueItem.subject,
          content: [
            { type: 'text/html', value: queueItem.body_html },
            ...(queueItem.body_text ? [{ type: 'text/plain', value: queueItem.body_text }] : []),
          ],
        };
        console.log('📧 SendGrid - Payload completo sendo enviado:', {
          ...payload,
          from: { ...payload.from, name: senderName },
          original_sender_name: settings.sender_name
        });
        return JSON.stringify(payload);
      })(),
    });

    if (!response.ok) {
      const responseText = await response.text();
      let errorMessage = `Erro HTTP ${response.status}`;
      
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.errors?.[0]?.message || errorData.message || errorMessage;
        console.error('❌ SendGrid - Erro na resposta:', {
          status: response.status,
          errors: errorData.errors,
          message: errorMessage
        });
      } catch {
        errorMessage = responseText || errorMessage;
        console.error('❌ SendGrid - Erro ao parsear resposta:', responseText);
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(`API Key inválida: ${errorMessage}`);
      } else if (response.status === 400) {
        throw new Error(`Dados inválidos: ${errorMessage}`);
      } else {
        throw new Error(`Erro ao enviar via SendGrid: ${errorMessage}`);
      }
    }

    console.log('✅ SendGrid - Email enviado com sucesso (incluindo CC/BCC se configurado)');
    return true;
  } catch (error: any) {
    console.error('Erro ao enviar via SendGrid:', error);
    throw error;
  }
}

/**
 * Envia e-mail via Mailgun
 */
async function sendViaMailgun(queueItem: any, settings: EmailSettings, hotelName?: string): Promise<boolean> {
  try {
    if (!settings.api_key) {
      throw new Error('API Key do Mailgun não configurada');
    }

    if (!settings.sender_email) {
      throw new Error('E-mail do remetente não configurado');
    }

    // Mailgun requer o domínio do e-mail do remetente
    const domain = settings.sender_email.split('@')[1];
    if (!domain) {
      throw new Error('Domínio do e-mail do remetente inválido. O Mailgun precisa do domínio para enviar.');
    }

    // Processar CC e BCC
    const ccEmails = parseEmailList(queueItem.cc_emails);
    const bccEmails = parseEmailList(queueItem.bcc_emails);
    
    console.log('📧 Mailgun - CC e BCC processados:', {
      cc_emails: queueItem.cc_emails,
      bcc_emails: queueItem.bcc_emails,
      cc_parsed: ccEmails,
      bcc_parsed: bccEmails,
      cc_count: ccEmails.length,
      bcc_count: bccEmails.length
    });
    
    // Garantir que sender_name não esteja vazio - usar nome do hotel como fallback
    const senderName = settings.sender_name?.trim() || hotelName || 'PMS System';
    
    const params: Record<string, string> = {
      from: `${senderName} <${settings.sender_email}>`,
      to: queueItem.recipient_email,
      subject: queueItem.subject,
      html: queueItem.body_html,
      ...(queueItem.body_text ? { text: queueItem.body_text } : {}),
      ...(settings.reply_to_email ? { 'h:Reply-To': settings.reply_to_email } : {}),
    };
    
    console.log('📧 Mailgun - Nome do remetente:', {
      sender_name: senderName,
      original_sender_name: settings.sender_name,
      from_field: params.from
    });
    
    if (ccEmails.length > 0) {
      params.cc = ccEmails.join(',');
      console.log('✅ Mailgun - CC adicionado:', params.cc);
    }
    
    if (bccEmails.length > 0) {
      params.bcc = bccEmails.join(',');
      console.log('✅ Mailgun - BCC adicionado:', params.bcc);
    }

    console.log('📧 Mailgun - Parâmetros sendo enviados:', {
      ...params,
      cc: params.cc || 'Nenhum',
      bcc: params.bcc || 'Nenhum'
    });

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`api:${settings.api_key}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
    });

    if (!response.ok) {
      const responseText = await response.text();
      let errorMessage = `Erro HTTP ${response.status}`;
      
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.message || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }

      if (response.status === 401) {
        throw new Error(`API Key inválida: ${errorMessage}`);
      } else if (response.status === 404) {
        throw new Error(`Domínio não encontrado ou não verificado no Mailgun: ${errorMessage}`);
      } else {
        throw new Error(`Erro ao enviar via Mailgun: ${errorMessage}`);
      }
    }

    return true;
  } catch (error: any) {
    console.error('Erro ao enviar via Mailgun:', error);
    throw error;
  }
}

/**
 * Envia e-mail via AWS SES
 */
async function sendViaSES(queueItem: any, settings: EmailSettings): Promise<boolean> {
  // AWS SES requer configuração específica e assinatura AWS
  // Por enquanto, retornamos false - deve ser implementado via Edge Function
  console.warn('AWS SES não implementado ainda - use Edge Function');
  return false;
}

/**
 * Envia e-mail via Resend (usando Edge Function para evitar CORS)
 */
async function sendViaResend(queueItem: any, settings: EmailSettings, hotelName?: string): Promise<boolean> {
  try {
    // Validar configurações
    if (!settings.api_key) {
      throw new Error('API Key do Resend não configurada');
    }

    if (!settings.sender_email) {
      throw new Error('E-mail do remetente não configurado');
    }

    // Validar dados antes de enviar
    if (!queueItem.recipient_email) {
      throw new Error('E-mail do destinatário não informado');
    }
    if (!queueItem.subject) {
      throw new Error('Assunto do e-mail não informado');
    }
    if (!queueItem.body_html) {
      throw new Error('Corpo do e-mail (HTML) não informado');
    }
    if (!settings.sender_email) {
      throw new Error('E-mail do remetente não configurado');
    }

    // Processar CC e BCC
    const ccEmails = parseEmailList(queueItem.cc_emails);
    const bccEmails = parseEmailList(queueItem.bcc_emails);
    
    console.log('📧 Resend - CC e BCC processados:', {
      cc_emails: queueItem.cc_emails,
      bcc_emails: queueItem.bcc_emails,
      cc_parsed: ccEmails,
      bcc_parsed: bccEmails,
      cc_count: ccEmails.length,
      bcc_count: bccEmails.length
    });
    
    // Garantir que sender_name não esteja vazio - usar nome do hotel como fallback
    const senderName = settings.sender_name?.trim() || hotelName || 'PMS System';
    
    console.log('📧 Resend - Nome do remetente:', {
      sender_name: senderName,
      original_sender_name: settings.sender_name,
      from_email: settings.sender_email
    });
    
    // Usar Edge Function para evitar problemas de CORS
    const result = await supabase.functions.invoke('send-email-resend', {
      body: {
        to: queueItem.recipient_email,
        to_name: queueItem.recipient_name || undefined,
        from: settings.sender_email,
        from_name: senderName,
        reply_to: settings.reply_to_email || settings.sender_email,
        subject: queueItem.subject,
        html: queueItem.body_html,
        text: queueItem.body_text || undefined,
        api_key: settings.api_key,
        ...(ccEmails.length > 0 ? { cc: ccEmails } : {}),
        ...(bccEmails.length > 0 ? { bcc: bccEmails } : {}),
      },
    });
    
    if (ccEmails.length > 0 || bccEmails.length > 0) {
      console.log('✅ Resend - Payload enviado com CC/BCC:', {
        cc: ccEmails.length > 0 ? ccEmails : undefined,
        bcc: bccEmails.length > 0 ? bccEmails : undefined
      });
    }

    if (result.error) {
      const errorMessage = result.error.message || result.error.toString();
      
      // Tentar obter detalhes do erro da resposta (status 400, 500, etc)
      let details = errorMessage;
      let hint = '';
      
      if (result.data && typeof result.data === 'object') {
        details = result.data.error || result.data.details || errorMessage;
        hint = result.data.hint || '';
      }
      
      const fullMessage = hint 
        ? `${details}. ${hint}`
        : details;
      
      throw new Error(fullMessage);
    }

    // Verificar se result.data contém erro (status 400 mas sem result.error)
    // Quando há erro 400, o Supabase pode não colocar em result.error
    if (result.data) {
      if (typeof result.data === 'object') {
        if (result.data.error) {
          const details = result.data.details || result.data.error;
          const hint = result.data.hint || '';
          throw new Error(
            hint 
              ? `${details}. ${hint}`
              : details
          );
        }
        
        // Verificar se a resposta indica sucesso
        if (result.data.success) {
          return true;
        }
      }
    }

    // Se chegou aqui sem erro explícito, considerar sucesso
    return true;
  } catch (error: any) {
    console.error('Erro ao enviar via Resend:', error);
    
    // Se for erro de CORS ou função não encontrada, dar mensagem clara
    const errorMessage = error.message || error.toString();
    if (
      errorMessage.includes('CORS') ||
      errorMessage.includes('Function not found') ||
      errorMessage.includes('404') ||
      errorMessage.includes('Failed to send a request') ||
      errorMessage.includes('ERR_FAILED')
    ) {
      throw new Error(
        'Edge Function "send-email-resend" não encontrada ou não configurada. ' +
        'Por favor, crie a Edge Function no Supabase Dashboard: ' +
        '1. Vá em Edge Functions > Create a new function ' +
        '2. Nome: send-email-resend ' +
        '3. Cole o código de supabase/functions/send-email-resend/index.ts ' +
        '4. Deploy. Veja o guia completo em GUIA_RESEND_EDGE_FUNCTION.md'
      );
    }
    
    throw error;
  }
}

/**
 * Dispara e-mail automaticamente baseado em evento
 */
/**
 * Envia e-mail de reset de senha para hóspede
 */
export async function sendGuestPasswordResetEmail(
  guestEmail: string,
  guestName: string,
  resetToken: string,
  establishmentId?: string
): Promise<string | null> {
  try {
    console.log('📧 Enviando e-mail de reset de senha para hóspede:', { guestEmail });
    
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas. E-mail não será enviado.');
      return null;
    }
    
    // Buscar template ativo para o evento
    const { data: templates, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('event_type', 'guest.password_reset')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (templateError) {
      console.warn('⚠️ Erro ao buscar template para evento: guest.password_reset', templateError);
      return null;
    }

    if (!templates || templates.length === 0) {
      console.warn('⚠️ Template não encontrado para evento: guest.password_reset');
      return null;
    }

    const template = templates[0];
    
    // Buscar configurações do hotel se establishmentId fornecido
    let hotelSettings = null;
    if (establishmentId) {
      const { data: settings, error: settingsError } = await supabase
        .from('hotel_settings')
        .select('*')
        .eq('establishment_id', establishmentId)
        .maybeSingle();
      
      if (!settingsError && settings) {
        hotelSettings = settings;
      }
    }

    // Buscar site settings para informações gerais
    const { data: siteSettings } = await supabase
      .from('site_settings')
      .select('*')
      .maybeSingle();

    // Construir URL de reset
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : (process.env.VITE_APP_URL || 'http://localhost:8080');
    const resetUrl = `${baseUrl}/web-checkin/reset-password?token=${resetToken}`;

    // Preparar variáveis do template
    const variables: TemplateVariables = {
      guest_name: guestName || guestEmail.split('@')[0],
      guest_email: guestEmail,
      reset_url: resetUrl,
      hotel_name: hotelSettings?.hotel_name || siteSettings?.site_title || 'Hotel',
      hotel_email: hotelSettings?.email || siteSettings?.contact_email || '',
      hotel_phone: hotelSettings?.phone || siteSettings?.contact_phone || '',
      hotel_address: hotelSettings?.address || '',
      hotel_website: hotelSettings?.website || siteSettings?.site_url || '',
      hotel_logo: hotelSettings?.logo_url || siteSettings?.logo_url || '',
      logo_url: hotelSettings?.logo_url || siteSettings?.logo_url || '',
    };

    // Processar template
    const subject = processTemplate(template.subject, variables);
    const bodyHtml = processTemplate(template.body_html, variables);

    // Adicionar à fila (incluindo CC e BCC do template)
    const queueId = await queueEmail({
      template_id: template.id,
      event_type: 'guest.password_reset',
      recipient_email: guestEmail,
      recipient_name: guestName,
      subject,
      body_html: bodyHtml,
      variables,
      cc_emails: template.cc_emails || undefined,
      bcc_emails: template.bcc_emails || undefined,
    });

    if (!queueId) {
      console.error('❌ Erro ao adicionar e-mail à fila');
      return null;
    }

    // Processar imediatamente
    try {
      const success = await processEmailQueue(queueId);
      if (success) {
        console.log('✅ E-mail de reset de senha enviado com sucesso:', { queueId });
      } else {
        console.warn('⚠️ E-mail adicionado à fila mas não foi enviado:', { queueId });
      }
    } catch (processError) {
      console.error('❌ Erro ao processar e-mail da fila:', processError);
    }

    return queueId;
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail de reset de senha:', error);
    return null;
  }
}

/**
 * Envia e-mail de solicitação de Nota Fiscal
 */
export async function sendFiscalDocumentRequestEmail(
  requestData: {
    requestId: string;
    reservationCode: string;
    guestName: string;
    actualGuestName?: string; // Nome real de quem se hospedou
    roomNumber?: string; // Número do quarto
    guestAddress?: string; // Endereço do hóspede
    checkinDate: string;
    checkoutDate: string;
    paidAmount: number;
    requestType: 'individual' | 'company';
    companyName?: string;
    cnpj?: string;
    financialEmail?: string;
    reservationId: string;
    recipientEmail: string;
  }
): Promise<string | null> {
  try {
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas.');
      return null;
    }

    // Buscar template ativo para o evento
    const { data: templates, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('event_type', 'fiscal_document.request')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (templateError) {
      console.error('Erro ao buscar template:', templateError);
      return null;
    }

    if (!templates || templates.length === 0) {
      console.warn('⚠️ Template não encontrado para fiscal_document.request');
      return null;
    }

    const template = templates[0];

    // Preparar variáveis para o template
    const formattedAmount = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(requestData.paidAmount);

    // IMPORTANTE: Para pessoa jurídica:
    // - guestName deve ser o nome REAL do hóspede (quem se hospedou)
    // - companyName é o nome da empresa (para faturamento)
    // - actualGuestName é o mesmo que guestName (nome real do hóspede)
    
    // Garantir que temos valores válidos para nome do hóspede
    let actualGuestName = "";
    if (requestData.actualGuestName && requestData.actualGuestName.trim()) {
      actualGuestName = requestData.actualGuestName.trim();
    } else if (requestData.guestName && requestData.guestName.trim()) {
      // Se não temos actualGuestName, usar guestName (que agora sempre é o nome real do hóspede)
      actualGuestName = requestData.guestName.trim();
    }
    
    // Se ainda não temos o nome do hóspede, tentar buscar da reserva
    if (!actualGuestName && requestData.reservationId) {
      try {
        const { data: reservationData } = await supabase
          .from("reservations")
          .select(`
            guest_id,
            guest:guest_id (
              full_name
            )
          `)
          .eq("id", requestData.reservationId)
          .maybeSingle();
        
        if (reservationData?.guest) {
          const guest = Array.isArray(reservationData.guest) ? reservationData.guest[0] : reservationData.guest;
          if (guest?.full_name) {
            actualGuestName = guest.full_name;
          }
        }
      } catch (error) {
        console.error("Erro ao buscar nome do hóspede:", error);
      }
    }
    
    // Se ainda não encontrou, usar string vazia (não usar companyName como fallback)
    if (!actualGuestName) {
      actualGuestName = "";
    }
    
    // Para pessoa jurídica, garantir que temos o nome real do hóspede separado do nome da empresa
    // guestName agora sempre é o nome real do hóspede (não mais o nome da empresa)
    const guestNameForTemplate = actualGuestName || requestData.guestName || "";
    
    // Processar número do quarto - garantir que sempre tenha um valor (mesmo que vazio)
    let roomNumber = "";
    if (requestData.roomNumber) {
      roomNumber = requestData.roomNumber.trim();
    }
    
    // Sempre buscar dados completos do quarto através da reserva para ter room_number, room_name e category_name
    // Isso garante que temos todas as variáveis disponíveis no template
    let roomName = "";
    let categoryName = "";
    if (requestData.reservationId) {
      try {
        const { data: reservationData } = await supabase
          .from("reservations")
          .select(`
            room_id,
            category_id,
            rooms:room_id (
              room_number,
              name,
              category_id
            ),
            room_categories:category_id (
              name
            )
          `)
          .eq("id", requestData.reservationId)
          .maybeSingle();
        
        if (reservationData?.rooms) {
          const rooms = Array.isArray(reservationData.rooms) ? reservationData.rooms[0] : reservationData.rooms;
          // Se não temos roomNumber ainda, usar o que encontramos
          if (!roomNumber) {
            roomNumber = rooms?.room_number || rooms?.name || "";
          }
          // Sempre buscar roomName (nome do quarto)
          roomName = rooms?.name || rooms?.room_number || "";
        } else if (reservationData?.room_id) {
          // Buscar diretamente pelo room_id se o relacionamento não trouxe dados
          const { data: roomData } = await supabase
            .from("rooms")
            .select("room_number, name, category_id")
            .eq("id", reservationData.room_id)
            .maybeSingle();
          
          if (roomData) {
            // Se não temos roomNumber ainda, usar o que encontramos
            if (!roomNumber) {
              roomNumber = roomData.room_number || roomData.name || "";
            }
            // Sempre buscar roomName (nome do quarto)
            roomName = roomData.name || roomData.room_number || "";
            
            // Se temos category_id do quarto, buscar a categoria
            if (roomData.category_id && !categoryName) {
              const { data: categoryData } = await supabase
                .from("room_categories")
                .select("name")
                .eq("id", roomData.category_id)
                .maybeSingle();
              
              if (categoryData?.name) {
                categoryName = categoryData.name;
              }
            }
          }
        }
        
        // Buscar categoria através do relacionamento room_categories da reserva
        if (reservationData?.room_categories && !categoryName) {
          const categories = Array.isArray(reservationData.room_categories) 
            ? reservationData.room_categories[0] 
            : reservationData.room_categories;
          if (categories?.name) {
            categoryName = categories.name;
          }
        }
        
        // Se ainda não temos a categoria, buscar pelo category_id da reserva
        if (!categoryName && reservationData?.category_id) {
          const { data: categoryData } = await supabase
            .from("room_categories")
            .select("name")
            .eq("id", reservationData.category_id)
            .maybeSingle();
          
          if (categoryData?.name) {
            categoryName = categoryData.name;
          }
        }
      } catch (error) {
        console.error("Erro ao buscar quarto no emailService:", error);
      }
    }
    
    // Se não encontramos roomName mas temos roomNumber, usar roomNumber como fallback
    if (!roomName && roomNumber) {
      roomName = roomNumber;
    }
    
    // Se não encontramos roomNumber mas temos roomName, usar roomName como fallback
    if (!roomNumber && roomName) {
      roomNumber = roomName;
    }
    
    // Buscar nome do estabelecimento
    let hotelName = "";
    let establishmentId = null;
    
    // Primeiro, obter o establishment_id da reserva (se ainda não temos)
    if (requestData.reservationId) {
      try {
        // Buscar establishment_id da reserva (pode já ter sido buscado anteriormente)
        const { data: reservationData } = await supabase
          .from("reservations")
          .select(`
            establishment_id,
            establishments:establishment_id (
              name
            )
          `)
          .eq("id", requestData.reservationId)
          .maybeSingle();
        
        if (reservationData) {
          establishmentId = reservationData.establishment_id;
          
          // Tentar obter nome do relacionamento establishments
          if (reservationData.establishments) {
            const establishments = Array.isArray(reservationData.establishments) 
              ? reservationData.establishments[0] 
              : reservationData.establishments;
            if (establishments?.name) {
              hotelName = establishments.name;
            }
          }
        }
        
        // Se não encontrou pelo relacionamento, buscar diretamente
        if (!hotelName && establishmentId) {
          const { data: establishmentData } = await supabase
            .from("establishments")
            .select("name")
            .eq("id", establishmentId)
            .maybeSingle();
          
          if (establishmentData?.name) {
            hotelName = establishmentData.name;
          }
        }
        
        // Se ainda não encontrou, tentar buscar de hotel_settings (nome do hotel)
        if (!hotelName && establishmentId) {
          const { data: settingsData } = await supabase
            .from("hotel_settings")
            .select("name")
            .eq("establishment_id", establishmentId)
            .maybeSingle();
          
          if (settingsData?.name) {
            hotelName = settingsData.name;
          }
        }
      } catch (error) {
        console.error("Erro ao buscar nome do estabelecimento:", error);
      }
    }
    
    console.log("🏨 Dados do quarto encontrados:", {
      roomNumber: roomNumber || "(não encontrado)",
      roomName: roomName || "(não encontrado)",
      categoryName: categoryName || "(não encontrado)",
      hasRoomNumber: !!roomNumber,
      hasRoomName: !!roomName,
      hasCategoryName: !!categoryName,
      hotelName: hotelName || "(não encontrado)",
    });

    // Buscar CPF do hóspede
    let guestCPF = "";
    if (requestData.reservationId) {
      try {
        // Buscar CPF da reserva através do guest_id
        const { data: reservationData } = await supabase
          .from("reservations")
          .select(`
            guest_id,
            guest:guest_id (
              document_number,
              document_type
            )
          `)
          .eq("id", requestData.reservationId)
          .maybeSingle();
        
        if (reservationData?.guest) {
          const guest = Array.isArray(reservationData.guest) ? reservationData.guest[0] : reservationData.guest;
          if (guest?.document_type === "cpf" && guest?.document_number) {
            guestCPF = guest.document_number.replace(/\D/g, ""); // Apenas números
          }
        }
        
        // Se não encontrou, buscar diretamente de clients
        if (!guestCPF && reservationData?.guest_id) {
          const { data: guestData } = await supabase
            .from("clients")
            .select("document_number, document_type")
            .eq("id", reservationData.guest_id)
            .maybeSingle();
          
          if (guestData && guestData.document_type === "cpf" && guestData.document_number) {
            guestCPF = guestData.document_number.replace(/\D/g, ""); // Apenas números
          }
        }
        
        // Se ainda não encontrou, tentar buscar de web_checkin_guests
        if (!guestCPF && requestData.reservationId) {
          const { data: webCheckin } = await supabase
            .from("web_checkin")
            .select("id")
            .eq("reservation_id", requestData.reservationId)
            .maybeSingle();
          
          if (webCheckin?.id) {
            const { data: webCheckinGuest } = await supabase
              .from("web_checkin_guests")
              .select("document_number, document_type")
              .eq("web_checkin_id", webCheckin.id)
              .eq("is_main_guest", true)
              .maybeSingle();
            
            if (webCheckinGuest && webCheckinGuest.document_type === "cpf" && webCheckinGuest.document_number) {
              guestCPF = webCheckinGuest.document_number.replace(/\D/g, ""); // Apenas números
            }
          }
        }
      } catch (error) {
        console.error("Erro ao buscar CPF do hóspede:", error);
      }
    }
    
    // Formatar CPF para exibição (XXX.XXX.XXX-XX)
    const formattedCPF = guestCPF 
      ? guestCPF.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
      : "";

    console.log("📧 Variáveis do template (fiscal_document.request):", {
      actualGuestName,
      roomNumber: roomNumber || "(não encontrado)",
      guestName: requestData.guestName,
      guestCPF: guestCPF || "(não encontrado)",
      hasActualGuestName: !!requestData.actualGuestName,
      hasRoomNumber: !!requestData.roomNumber,
      reservationId: requestData.reservationId,
      requestType: requestData.requestType,
    });

    const variables: TemplateVariables = {
      reservation_code: requestData.reservationCode || '',
      // guest_name sempre é o nome real do hóspede (quem se hospedou)
      // Para pessoa jurídica, o nome da empresa está em company_name
      guest_name: guestNameForTemplate, // Nome real do hóspede
      actual_guest_name: actualGuestName || guestNameForTemplate, // Nome real de quem se hospedou (garantir que está preenchido)
      guest_cpf: formattedCPF || '', // CPF do hóspede formatado (XXX.XXX.XXX-XX)
      guest_address: requestData.guestAddress || '', // Endereço do hóspede
      hotel_name: hotelName || '', // Nome do estabelecimento
      room_number: roomNumber || '', // Número do quarto - sempre incluir, mesmo que vazio
      room_name: roomName || roomNumber || '', // Nome do quarto (alias para room_number se não houver nome específico)
      category_name: categoryName || '', // Nome da categoria do quarto
      room_category: categoryName || '', // Alias para category_name (compatibilidade)
      checkin_date: requestData.checkinDate || '',
      checkout_date: requestData.checkoutDate || '',
      paid_amount: formattedAmount || '0,00',
      request_type_label: requestData.requestType === 'company' ? 'Pessoa Jurídica' : 'Pessoa Física',
      request_id: requestData.requestId || '',
      ...(requestData.companyName && { company_name: requestData.companyName }),
      ...(requestData.cnpj && { cnpj: requestData.cnpj }),
      ...(requestData.financialEmail && { financial_email: requestData.financialEmail }),
    };
    
    // Log final das variáveis que serão usadas no template
    console.log("📧 Variáveis finais para o template (fiscal_document.request):", {
      reservation_code: variables.reservation_code,
      guest_name: variables.guest_name || "(vazio - nome real do hóspede)",
      actual_guest_name: variables.actual_guest_name || "(vazio - nome real do hóspede)",
      guest_cpf: variables.guest_cpf || "(vazio - CPF do hóspede)",
      guest_address: variables.guest_address || "(vazio - endereço do hóspede)",
      guest_address_length: variables.guest_address?.length || 0,
      hotel_name: variables.hotel_name || "(vazio - nome do estabelecimento)",
      room_number: variables.room_number || "(vazio - não encontrado)",
      room_name: variables.room_name || "(vazio - não encontrado)",
      category_name: variables.category_name || "(vazio - não encontrado)",
      room_category: variables.room_category || "(vazio - não encontrado)",
      checkin_date: variables.checkin_date,
      checkout_date: variables.checkout_date,
      paid_amount: variables.paid_amount,
      request_type_label: variables.request_type_label,
      company_name: variables.company_name || "(não aplicável - apenas para pessoa jurídica)",
      cnpj: variables.cnpj || "(não aplicável - apenas para pessoa jurídica)",
      financial_email: variables.financial_email || "(não aplicável)",
      all_variables_keys: Object.keys(variables),
      requestData_guestAddress: requestData.guestAddress || "(não passado)",
      note: "Para pessoa jurídica: guest_name = nome real do hóspede, company_name = nome da empresa",
    });

    // Processar template
    const { processTemplate } = await import('./emailTemplateEngine');
    const subject = processTemplate(template.subject, variables);
    const bodyHtml = processTemplate(template.body_html, variables);
    const bodyText = template.body_text 
      ? processTemplate(template.body_text, variables)
      : bodyHtml.replace(/<[^>]*>/g, "");

    // Adicionar à fila (incluindo CC e BCC do template)
    const queueId = await queueEmail({
      template_id: template.id,
      event_type: 'fiscal_document.request',
      recipient_email: requestData.recipientEmail,
      recipient_name: "Departamento Fiscal",
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      variables,
      reservation_id: requestData.reservationId,
      cc_emails: template.cc_emails || undefined,
      bcc_emails: template.bcc_emails || undefined,
    });

    if (!queueId) {
      console.error('❌ Erro ao adicionar e-mail à fila');
      return null;
    }

    // Processar imediatamente após adicionar à fila
    // Nota: Se houver erro 403/42501 (Forbidden/RLS), pode ser problema de RLS no Supabase
    // Nesse caso, o e-mail ficará na fila e será processado por um worker/edge function
    try {
      const success = await processEmailQueue(queueId);
      if (success) {
        console.log('✅ E-mail enviado com sucesso:', { queueId });
      } else {
        console.warn('⚠️ E-mail adicionado à fila mas não foi enviado:', { queueId });
      }
    } catch (processError: any) {
      // Se for erro 403 ou 42501 (RLS), apenas logar - o e-mail ficará na fila para ser processado depois
      const isPermissionError = 
        processError?.code === 'PGRST301' || 
        processError?.code === '42501' ||
        processError?.status === 403 || 
        processError?.message?.includes('403') ||
        processError?.message?.includes('42501') ||
        processError?.message?.includes('row-level security') ||
        processError?.message?.includes('RLS');
      
      if (isPermissionError) {
        console.warn('⚠️ Permissão negada para processar e-mail da fila (RLS/403). O e-mail foi adicionado à fila e será processado por um worker/edge function.', { 
          queueId,
          code: processError?.code,
          message: processError?.message,
          hint: 'Isso pode ser causado por políticas RLS no Supabase. O e-mail está na fila e será processado.'
        });
        // Não é um erro crítico - o e-mail está na fila e será processado
      } else {
      console.error('❌ Erro ao processar e-mail da fila:', processError);
      }
    }

    return queueId;
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail de solicitação de NF:', error);
    return null;
  }
}

/**
 * Envia e-mail quando um funcionário é adicionado a um estabelecimento
 */
export async function sendEmployeeAddedToEstablishmentEmail(
  employeeData: {
    userId: string;
    employeeName: string;
    employeeEmail: string;
    establishmentId: string;
    establishmentName?: string;
    companyName?: string;
    roleName?: string;
  }
): Promise<string | null> {
  try {
    console.log('📧 Enviando e-mail de adição de funcionário ao estabelecimento:', { 
      employeeEmail: employeeData.employeeEmail,
      establishmentId: employeeData.establishmentId 
    });
    
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas. E-mail não será enviado.');
      return null;
    }
    
    // Buscar template ativo para o evento
    console.log('🔍 Buscando template para evento: employee.added_to_establishment');
    const { data: templates, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('event_type', 'employee.added_to_establishment')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (templateError) {
      console.error('❌ Erro ao buscar template para evento: employee.added_to_establishment', templateError);
      return null;
    }

    console.log('📋 Templates encontrados:', templates?.length || 0);

    if (!templates || templates.length === 0) {
      console.error('❌ Template não encontrado para evento: employee.added_to_establishment');
      console.log('💡 Dica: Verifique se a migration 20251204000001_add_employee_added_to_establishment_email_template.sql foi executada no Supabase.');
      return null;
    }

    const template = templates[0];
    
    // Buscar dados do estabelecimento se não foram fornecidos
    let establishmentName = employeeData.establishmentName;
    let companyName = employeeData.companyName;
    
    if (!establishmentName || !companyName) {
      const { data: establishmentData, error: establishmentError } = await supabase
        .from('establishments')
        .select(`
          name,
          companies (
            name
          )
        `)
        .eq('id', employeeData.establishmentId)
        .maybeSingle();
      
      if (!establishmentError && establishmentData) {
        if (!establishmentName) {
          establishmentName = establishmentData.name;
        }
        if (!companyName && establishmentData.companies) {
          const companies = Array.isArray(establishmentData.companies) 
            ? establishmentData.companies[0] 
            : establishmentData.companies;
          companyName = companies?.name;
        }
      }
    }
    
    // Buscar dados do cargo se não foi fornecido
    let roleName = employeeData.roleName;
    if (!roleName) {
      // Buscar o cargo do funcionário através do employee_id
      // Mas como não temos o employee_id aqui, vamos buscar pelo user_id e establishment_id
      const { data: employeeRecord, error: employeeError } = await supabase
        .from('employees')
        .select(`
          employee_roles (
            name
          )
        `)
        .eq('user_id', employeeData.userId)
        .eq('establishment_id', employeeData.establishmentId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!employeeError && employeeRecord?.employee_roles) {
        const roles = Array.isArray(employeeRecord.employee_roles) 
          ? employeeRecord.employee_roles[0] 
          : employeeRecord.employee_roles;
        roleName = roles?.name;
      }
    }
    
    // Buscar site settings para informações gerais
    const { data: siteSettings } = await supabase
      .from('site_settings')
      .select('*')
      .maybeSingle();

    // Preparar variáveis do template
    const variables: TemplateVariables = {
      employee_name: employeeData.employeeName || employeeData.employeeEmail.split('@')[0],
      employee_email: employeeData.employeeEmail,
      establishment_name: establishmentName || 'Estabelecimento',
      company_name: companyName || 'Empresa',
      role_name: roleName || 'Funcionário',
      hotel_name: establishmentName || siteSettings?.site_title || 'Hotel',
      hotel_email: siteSettings?.contact_email || '',
      hotel_phone: siteSettings?.contact_phone || '',
      logo_url: siteSettings?.logo_url || '',
    };

    // Processar template
    const subject = processTemplate(template.subject, variables);
    const bodyHtml = processTemplate(template.body_html, variables);

    // Adicionar à fila (incluindo CC e BCC do template)
    const queueId = await queueEmail({
      template_id: template.id,
      event_type: 'employee.added_to_establishment',
      recipient_email: employeeData.employeeEmail,
      recipient_name: employeeData.employeeName,
      subject,
      body_html: bodyHtml,
      variables,
      cc_emails: template.cc_emails || undefined,
      bcc_emails: template.bcc_emails || undefined,
    });

    if (!queueId) {
      console.error('❌ Erro ao adicionar e-mail à fila');
      return null;
    }

    // Processar imediatamente
    try {
      const success = await processEmailQueue(queueId);
      if (success) {
        console.log('✅ E-mail de adição ao estabelecimento enviado com sucesso:', { queueId });
      } else {
        console.warn('⚠️ E-mail adicionado à fila mas não foi enviado:', { queueId });
      }
    } catch (processError) {
      console.error('❌ Erro ao processar e-mail da fila:', processError);
    }

    return queueId;
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail de adição ao estabelecimento:', error);
    return null;
  }
}

/**
 * Envia e-mail de lembrete de check-out próximo
 */
export async function sendCheckoutReminderEmail(
  reservation: any
): Promise<string | null> {
  try {
    console.log('📧 Enviando e-mail de lembrete de check-out:', { 
      reservationId: reservation?.id,
      checkoutDate: reservation?.checkout_date
    });
    
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas. E-mail não será enviado.');
      return null;
    }
    
    // Buscar template ativo para o evento
    console.log('🔍 Buscando template para evento: checkout.reminder');
    const { data: templates, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('event_type', 'checkout.reminder')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (templateError) {
      console.error('❌ Erro ao buscar template para evento: checkout.reminder', templateError);
      return null;
    }

    console.log('📋 Templates encontrados:', templates?.length || 0);

    if (!templates || templates.length === 0) {
      console.error('❌ Template não encontrado para evento: checkout.reminder');
      console.log('💡 Dica: Verifique se a migration 20251204000003_create_checkout_reminder_email_template.sql foi executada no Supabase.');
      return null;
    }

    const template = templates[0];
    
    // Buscar dados completos da reserva com relacionamentos
    const { data: fullReservation, error: reservationError } = await supabase
      .from('reservations')
      .select(`
        *,
        financial_responsible:clients!client_id(*),
        guest:clients!guest_id(*),
        rooms (id, room_number, name),
        room_categories (id, name, description, building_id)
      `)
      .eq('id', reservation.id || reservation)
      .single();

    if (reservationError || !fullReservation) {
      console.error('❌ Erro ao buscar reserva:', reservationError);
      return null;
    }

    // Buscar configurações do hotel
    const establishmentId = fullReservation.establishment_id;
    let hotelSettings = null;
    if (establishmentId) {
      const { data: settings, error: settingsError } = await supabase
        .from('hotel_settings')
        .select('*')
        .eq('establishment_id', establishmentId)
        .maybeSingle();
      
      if (settingsError) {
        console.warn('⚠️ Erro ao buscar configurações do hotel:', settingsError);
      }
      
      hotelSettings = settings;
    }

    // Buscar site_settings como fallback para logo
    let siteSettings = null;
    try {
      const { data: siteData } = await supabase
        .from('site_settings')
        .select('logo_url')
        .maybeSingle();
      siteSettings = siteData;
    } catch (error) {
      console.warn('⚠️ Erro ao buscar site_settings:', error);
    }

    // Gerar variáveis do template
    const { generateReservationVariables } = await import('./emailTemplateEngine');
    const variables = await generateReservationVariables(
      fullReservation,
      fullReservation.financial_responsible,
      fullReservation.guest,
      hotelSettings,
      siteSettings
    );

    // Adicionar/atualizar variáveis específicas
    // O generateReservationVariables já inclui identification_number (com #) e web_checkin_link,
    // mas vamos garantir que estão no formato correto
    const identificationNumberRaw = fullReservation.identification_number || fullReservation.reservation_code || '';
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : (process.env.VITE_APP_URL || 'http://localhost:8080');
    
    // Garantir que o link do web-checkin está correto (usar o número sem #)
    let webCheckinLink = variables.web_checkin_link || '';
    if (!webCheckinLink && identificationNumberRaw) {
      webCheckinLink = `${baseUrl}/web-checkin/${identificationNumberRaw}`;
    }

    // Adicionar/atualizar variáveis específicas
    // O identification_number já vem formatado com # do generateReservationVariables
    const allVariables: TemplateVariables = {
      ...variables,
      web_checkin_link: webCheckinLink, // Garantir que o link está correto
    };

    // Processar template
    const subject = processTemplate(template.subject, allVariables);
    const bodyHtml = processTemplate(template.body_html, allVariables);

    // Determinar destinatário
    // Se customRecipientEmail foi fornecido (ex: para portaria), usar ele
    // Caso contrário, usar o email do hóspede ou responsável financeiro
    const recipientEmail = customRecipientEmail || fullReservation.guest?.email || fullReservation.financial_responsible?.email;
    const recipientName = fullReservation.guest?.full_name || fullReservation.financial_responsible?.full_name;

    if (!recipientEmail) {
      console.warn('⚠️ E-mail do destinatário não encontrado para reserva:', fullReservation.id);
      return null;
    }

    console.log('✅ Destinatário encontrado:', { email: recipientEmail, name: recipientName, isCustom: !!customRecipientEmail });

    // Adicionar à fila (incluindo CC e BCC do template)
    const queueId = await queueEmail({
      template_id: template.id,
      event_type: 'checkout.reminder',
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      subject,
      body_html: bodyHtml,
      variables: allVariables,
      reservation_id: fullReservation.id,
      cc_emails: template.cc_emails || undefined,
      bcc_emails: template.bcc_emails || undefined,
    });

    if (!queueId) {
      console.error('❌ Erro ao adicionar e-mail à fila');
      return null;
    }

    console.log('✅ E-mail adicionado à fila:', { queueId });

    // Processar imediatamente
    try {
      const success = await processEmailQueue(queueId);
      if (success) {
        console.log('✅ E-mail de lembrete de check-out enviado com sucesso:', { queueId });
      } else {
        console.warn('⚠️ E-mail adicionado à fila mas não foi enviado:', { queueId });
      }
    } catch (processError) {
      console.error('❌ Erro ao processar e-mail da fila:', processError);
    }

    return queueId;
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail de lembrete de check-out:', error);
    return null;
  }
}

/**
 * Verifica reservas com check-out próximo e envia e-mails de lembrete
 * @param daysBeforeCheckout - Número de dias antes do check-out para enviar o lembrete (padrão: 1)
 * @param establishmentId - ID do estabelecimento (opcional, se não fornecido, verifica todos)
 */
export async function sendCheckoutReminders(
  daysBeforeCheckout: number = 1,
  establishmentId?: string
): Promise<{ sent: number; errors: number }> {
  try {
    console.log(`🔍 Verificando reservas com check-out em ${daysBeforeCheckout} dia(s)...`);
    
    // Calcular data alvo (checkout_date - daysBeforeCheckout)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBeforeCheckout);
    const targetDateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Buscar reservas com check-out na data alvo
    let query = supabase
      .from('reservations')
      .select('id, checkout_date, status, establishment_id')
      .eq('status', 'confirmed') // Apenas reservas confirmadas
      .gte('checkout_date', targetDateStr) // checkout_date >= targetDate
      .lt('checkout_date', new Date(new Date(targetDateStr).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]); // checkout_date < targetDate + 1 dia
      // .eq('checkout_date', targetDateStr); // Alternativa: exatamente na data
    
    if (establishmentId) {
      query = query.eq('establishment_id', establishmentId);
    }
    
    const { data: reservations, error: reservationsError } = await query;
    
    if (reservationsError) {
      console.error('❌ Erro ao buscar reservas:', reservationsError);
      return { sent: 0, errors: 0 };
    }
    
    if (!reservations || reservations.length === 0) {
      console.log('ℹ️ Nenhuma reserva encontrada com check-out próximo');
      return { sent: 0, errors: 0 };
    }
    
    console.log(`📋 Encontradas ${reservations.length} reserva(s) com check-out próximo`);
    
    let sent = 0;
    let errors = 0;
    
    // Enviar e-mail para cada reserva
    for (const reservation of reservations) {
      try {
        // Verificar se já foi enviado um lembrete hoje para esta reserva
        // (evitar enviar múltiplos e-mails no mesmo dia)
        const today = new Date().toISOString().split('T')[0];
        const { data: existingEmail } = await supabase
          .from('email_queue')
          .select('id')
          .eq('reservation_id', reservation.id)
          .eq('event_type', 'checkout.reminder')
          .gte('created_at', `${today}T00:00:00Z`)
          .limit(1);
        
        if (existingEmail && existingEmail.length > 0) {
          console.log(`⏭️ E-mail de lembrete já enviado hoje para reserva ${reservation.id}`);
          continue;
        }
        
        const result = await sendCheckoutReminderEmail(reservation);
        if (result) {
          sent++;
          console.log(`✅ E-mail de lembrete enviado para reserva ${reservation.id}`);
        } else {
          errors++;
          console.warn(`⚠️ Falha ao enviar e-mail de lembrete para reserva ${reservation.id}`);
        }
      } catch (error) {
        errors++;
        console.error(`❌ Erro ao processar reserva ${reservation.id}:`, error);
      }
    }
    
    console.log(`✅ Processamento concluído: ${sent} enviado(s), ${errors} erro(s)`);
    return { sent, errors };
  } catch (error) {
    console.error('❌ Erro ao verificar e enviar lembretes de check-out:', error);
    return { sent: 0, errors: 0 };
  }
}

export async function triggerEmail(
  eventType: 'reservation.created' | 'reservation.imported' | 'reservation.cancelled' | 'payment.confirmed' | 'payment.pending' | 'checkin.confirmed' | 'reservation.extended' | 'reservation.overbooking' | 'guest.password_reset' | 'fiscal_document.request' | 'employee.added_to_establishment' | 'checkout.reminder' | 'checkin.reception.notification',
  reservation: any,
  additionalVariables?: TemplateVariables,
  customRecipientEmail?: string
): Promise<string | null> {
  try {
    console.log(`📧 Disparando e-mail para evento: ${eventType}`, { reservationId: reservation?.id });
    
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas. E-mail não será enviado.');
      return null;
    }
    console.log('✅ Configurações de e-mail ativas:', { provider: settings.provider });
    
    // Buscar template ativo para o evento
    // IMPORTANTE: Usar .order('updated_at', { ascending: false }) para pegar o template mais recente
    // e .maybeSingle() para evitar erro se houver múltiplos templates
    const { data: templates, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('event_type', eventType)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (templateError) {
      console.warn(`⚠️ Erro ao buscar template para evento: ${eventType}`, templateError);
      console.warn(`⚠️ Código do erro:`, templateError?.code);
      console.warn(`⚠️ Mensagem do erro:`, templateError?.message);
      return null;
    }

    if (!templates || templates.length === 0) {
      console.warn(`⚠️ Template não encontrado para evento: ${eventType}`);
      return null;
    }

    const template = templates[0]; // Pegar o template mais recente
    
    console.log('✅ Template encontrado:', { 
      templateId: template.id, 
      templateName: template.name,
      eventType: eventType,
      isActive: template.is_active,
      updatedAt: template.updated_at,
      bodyHtmlLength: template.body_html?.length || 0,
      subjectLength: template.subject?.length || 0,
      cc_emails: template.cc_emails || 'Nenhum',
      bcc_emails: template.bcc_emails || 'Nenhum'
    });
    
    // Log do conteúdo do template para debug
    console.log('📄 Conteúdo do template (primeiros 200 caracteres):', {
      subject: template.subject?.substring(0, 200),
      bodyHtml: template.body_html?.substring(0, 200)
    });

    // Buscar dados da reserva com relacionamentos
    // IMPORTANTE: Incluir fixed_password do quarto para variável room_password
    const { data: fullReservation, error: reservationError } = await supabase
      .from('reservations')
      .select(`
        *,
        financial_responsible:clients!client_id(*),
        guest:clients!guest_id(*),
        rooms (id, room_number, name, fixed_password, authentication_type),
        room_categories (id, name, description, building_id)
      `)
      .eq('id', reservation.id || reservation)
      .single();

    if (reservationError || !fullReservation) {
      console.error('❌ Erro ao buscar reserva:', reservationError);
      return null;
    }
    console.log('✅ Reserva encontrada:', { 
      reservationId: fullReservation.id,
      hasFinancialResponsible: !!fullReservation.financial_responsible,
      hasGuest: !!fullReservation.guest,
      financialResponsibleEmail: fullReservation.financial_responsible?.email,
      guestEmail: fullReservation.guest?.email
    });

    // Buscar configurações do hotel
    const establishmentId = fullReservation.establishment_id;
    let hotelSettings = null;
    if (establishmentId) {
      const { data: settings, error: settingsError } = await supabase
        .from('hotel_settings')
        .select('*')
        .eq('establishment_id', establishmentId)
        .maybeSingle();
      
      if (settingsError) {
        console.warn('⚠️ Erro ao buscar configurações do hotel:', settingsError);
      }
      
      hotelSettings = settings;
      console.log('✅ Configurações do hotel:', { 
        hasSettings: !!hotelSettings,
        hotelName: hotelSettings?.name,
        hasAddress: !!(hotelSettings?.street || hotelSettings?.city),
        hasLogoUrl: !!hotelSettings?.logo_url,
        logoUrl: hotelSettings?.logo_url ? (hotelSettings.logo_url.substring(0, 100) + '...') : 'N/A',
        logoUrlLength: hotelSettings?.logo_url?.length || 0,
        allSettingsKeys: hotelSettings ? Object.keys(hotelSettings) : []
      });
    } else {
      console.warn('⚠️ Reserva sem establishment_id');
    }

    // Buscar site_settings como fallback para logo
    let siteSettings = null;
    try {
      const { data: siteData, error: siteError } = await supabase
        .from('site_settings')
        .select('logo_url')
        .maybeSingle();
      
      if (siteError) {
        console.warn('⚠️ Erro ao buscar site_settings:', siteError);
      } else {
        siteSettings = siteData;
        console.log('✅ Site settings:', {
          hasSiteSettings: !!siteSettings,
          hasLogoUrl: !!siteSettings?.logo_url,
          logoUrl: siteSettings?.logo_url ? (siteSettings.logo_url.substring(0, 100) + '...') : 'N/A'
        });
      }
    } catch (error) {
      console.warn('⚠️ Erro ao buscar site_settings:', error);
    }

    // Obter nome do hotel para usar como fallback no sender_name
    const hotelName = hotelSettings?.name || undefined;

    // Gerar variáveis do template
    const variables = await generateReservationVariables(
      fullReservation,
      fullReservation.financial_responsible,
      fullReservation.guest,
      hotelSettings,
      siteSettings
    );

    // Mesclar com variáveis adicionais
    // IMPORTANTE: Se new_checkout_date vier como variável adicional, garantir que esteja formatada no padrão brasileiro
    let processedAdditionalVariables = { ...additionalVariables };
    if (processedAdditionalVariables.new_checkout_date) {
      // Importar formatDate para garantir formatação brasileira
      const { formatDate } = await import('./emailTemplateEngine');
      const dateStr = processedAdditionalVariables.new_checkout_date as string;
      if (dateStr) {
        processedAdditionalVariables.new_checkout_date = formatDate(dateStr);
      }
    }
    
    const allVariables = { ...variables, ...processedAdditionalVariables };

    // Processar template
    console.log('🔄 Processando template com variáveis:', {
      totalVariables: Object.keys(allVariables).length,
      variableKeys: Object.keys(allVariables),
      templateSubjectLength: template.subject?.length || 0,
      templateBodyHtmlLength: template.body_html?.length || 0
    });
    
    const subject = processTemplate(template.subject, allVariables);
    const bodyHtml = processTemplate(template.body_html, allVariables);
    
    console.log('✅ Template processado:', {
      subjectLength: subject.length,
      bodyHtmlLength: bodyHtml.length,
      subjectPreview: subject.substring(0, 100),
      bodyHtmlPreview: bodyHtml.substring(0, 200)
    });

    // Log para debug do payment_link
    if (allVariables.payment_link) {
      console.log('✅ Payment link disponível nas variáveis:', allVariables.payment_link);
      console.log('📧 Template HTML contém payment_link?', bodyHtml.includes('payment_link') || bodyHtml.includes(allVariables.payment_link));
    } else {
      console.warn('⚠️ Payment link NÃO está disponível nas variáveis do template');
      console.log('📊 Variáveis disponíveis:', Object.keys(allVariables));
    }
    
    // Log para debug de outras variáveis importantes
    console.log('📊 Variáveis importantes:', {
      hotel_phone: allVariables.hotel_phone || 'N/A',
      hotel_whatsapp: allVariables.hotel_whatsapp || 'N/A',
      hotel_contact: allVariables.hotel_contact || 'N/A',
      hotel_logo: allVariables.hotel_logo ? (allVariables.hotel_logo.substring(0, 150) + (allVariables.hotel_logo.length > 150 ? '...' : '')) : 'Não configurado',
      logo_url: allVariables.logo_url ? (allVariables.logo_url.substring(0, 150) + (allVariables.logo_url.length > 150 ? '...' : '')) : 'Não configurado',
      hotel_logo_length: allVariables.hotel_logo?.length || 0,
      logo_url_length: allVariables.logo_url?.length || 0,
      hotel_logo_is_url: allVariables.hotel_logo ? (allVariables.hotel_logo.startsWith('http://') || allVariables.hotel_logo.startsWith('https://')) : false,
      logo_url_is_url: allVariables.logo_url ? (allVariables.logo_url.startsWith('http://') || allVariables.logo_url.startsWith('https://')) : false,
      new_checkout_date: allVariables.new_checkout_date || 'N/A'
    });
    
    // Verificar se o template contém referências à logo
    const templateHasLogo = template.body_html?.includes('{{logo_url}}') || template.body_html?.includes('{{hotel_logo}}');
    console.log('📧 Template contém referência à logo?', {
      hasLogoReference: templateHasLogo,
      hasLogoUrl: template.body_html?.includes('{{logo_url}}'),
      hasHotelLogo: template.body_html?.includes('{{hotel_logo}}'),
      logoUrlInProcessed: bodyHtml.includes(allVariables.logo_url || ''),
      hotelLogoInProcessed: bodyHtml.includes(allVariables.hotel_logo || '')
    });

    // Determinar destinatário
    // Se customRecipientEmail foi fornecido (ex: para portaria), usar ele
    // Caso contrário, usar o email do hóspede ou responsável financeiro
    const recipientEmail = customRecipientEmail || fullReservation.guest?.email || fullReservation.financial_responsible?.email;
    const recipientName = fullReservation.guest?.full_name || fullReservation.financial_responsible?.full_name;

    if (!recipientEmail) {
      console.warn('⚠️ E-mail do destinatário não encontrado para reserva:', fullReservation.id);
      return null;
    }
    console.log('✅ Destinatário encontrado:', { email: recipientEmail, name: recipientName });

    // Adicionar à fila (incluindo CC e BCC do template)
    const ccEmails = template.cc_emails?.trim() || undefined;
    const bccEmails = template.bcc_emails?.trim() || undefined;
    
    console.log('📧 Preparando email com CC e BCC:', {
      cc_emails: ccEmails || 'Nenhum',
      bcc_emails: bccEmails || 'Nenhum',
      cc_parsed: ccEmails ? parseEmailList(ccEmails) : [],
      bcc_parsed: bccEmails ? parseEmailList(bccEmails) : []
    });
    
    const queueId = await queueEmail({
      template_id: template.id,
      event_type: eventType,
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      subject,
      body_html: bodyHtml,
      variables: allVariables,
      reservation_id: fullReservation.id,
      cc_emails: ccEmails,
      bcc_emails: bccEmails,
    });

    if (!queueId) {
      console.error('❌ Erro ao adicionar e-mail à fila');
      return null;
    }
    console.log('✅ E-mail adicionado à fila:', { queueId });

    // Processar imediatamente após adicionar à fila
    try {
      const success = await processEmailQueue(queueId);
      if (success) {
        console.log('✅ E-mail enviado com sucesso:', { queueId });
      } else {
        console.warn('⚠️ E-mail adicionado à fila mas não foi enviado:', { queueId });
      }
    } catch (processError) {
      console.error('❌ Erro ao processar e-mail da fila:', processError);
      // Não retornar null aqui, pois o e-mail já está na fila e pode ser processado depois
    }

    return queueId;
  } catch (error) {
    console.error('❌ Erro ao disparar e-mail:', error);
    return null;
  }
}

