/**
 * Serviço de envio de e-mails
 * Suporta múltiplos provedores: SMTP, SendGrid, Mailgun, SES, Resend
 */

import { supabase } from '@/integrations/supabase/client';
import { postPmsApiAuth } from '@/lib/pmsApi';
import { processTemplate, generateReservationVariables, type TemplateVariables } from './emailTemplateEngine';
import { reservationGuestContactFields, reservationGuestDisplayName } from './reservationChannelDisplay';

function pmsApiBase(): string | undefined {
  return (import.meta.env.VITE_PMS_API_URL as string | undefined)?.replace(/\/+$/, '');
}

type SendEmailEdgeName = 'send-email-smtp' | 'send-email-sendgrid' | 'send-email-resend';

async function invokeSendEmailEdge<T = unknown>(
  name: SendEmailEdgeName,
  body: unknown
): Promise<{ data: T | null; error: { message?: string } | null }> {
  const base = pmsApiBase();
  if (base) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        return { data: null, error: { message: 'Sessão necessária para enviar e-mail' } };
      }
      const data = await postPmsApiAuth<T>(`/api/legacy/${name}`, body, session.access_token);
      return { data, error: null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // Fallback: API Node indisponível ou erro transitório — mesmo fluxo que antes (Edge direto).
      try {
        const result = await supabase.functions.invoke(name, { body });
        if (result.error) return { data: result.data as T, error: result.error as { message?: string } };
        return { data: result.data as T, error: null };
      } catch {
        return { data: null, error: { message } };
      }
    }
  }
  const result = await supabase.functions.invoke(name, { body });
  return { data: result.data as T, error: result.error as { message?: string } | null };
}

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

function resolveReservationRecipient(
  reservation: any,
  customRecipientEmail?: string
): { email: string | null; name: string } {
  const { email } = reservationGuestContactFields(reservation);
  const recipientEmail =
    (customRecipientEmail && String(customRecipientEmail).trim()) || email || null;
  const recipientName = reservationGuestDisplayName(reservation);
  return { email: recipientEmail, name: recipientName };
}

/**
 * Adiciona um e-mail à fila
 */
export async function queueEmail(email: EmailQueueItem): Promise<string | null> {
  try {
    // Verificar se há review_link no body_html antes de salvar
    const hasPlaceholder = email.body_html?.includes('{{review_link}}') || email.body_html?.includes('{{{review_link}}}');
    const hasReviewLink = email.variables?.review_link ? email.body_html?.includes(email.variables.review_link) : false;
    
    console.log('📬 Adicionando e-mail à fila:', { 
      eventType: email.event_type, 
      recipient: email.recipient_email,
      reservationId: email.reservation_id,
      cc_emails: email.cc_emails || 'Nenhum',
      bcc_emails: email.bcc_emails || 'Nenhum',
      cc_parsed: email.cc_emails ? parseEmailList(email.cc_emails) : [],
      bcc_parsed: email.bcc_emails ? parseEmailList(email.bcc_emails) : [],
      hasPlaceholderInBody: hasPlaceholder,
      hasReviewLinkInBody: hasReviewLink,
      reviewLinkInVariables: email.variables?.review_link,
      bodyHtmlLength: email.body_html?.length,
      bodyHtmlSample: email.body_html?.substring(
        email.body_html.indexOf('Avaliar Estadia') > 0 ? email.body_html.indexOf('Avaliar Estadia') - 50 : 0,
        email.body_html.indexOf('Avaliar Estadia') > 0 ? email.body_html.indexOf('Avaliar Estadia') + 200 : 200
      ),
    });
    
    // GARANTIR que review_link está nas variáveis antes de salvar
    // Isso é crítico porque o review_link pode ser perdido na serialização JSONB
    if (email.variables && !email.variables.review_link) {
      // Tentar extrair do body_html se não estiver nas variáveis
      if (email.body_html) {
        const urlPattern = /(https?:\/\/[^\s<>"']+\/review\/[^\s<>"']+)/g;
        const matches = email.body_html.match(urlPattern);
        if (matches && matches.length > 0) {
          email.variables.review_link = matches[0];
          console.log('🔧 review_link extraído do body_html e adicionado às variáveis antes de salvar:', email.variables.review_link);
        }
      }
    }
    
    // Tentar inserir diretamente primeiro
    const { data, error } = await supabase
      .from('email_queue')
      .insert([{
        ...email,
        status: 'pending',
        // Garantir que variables seja um objeto JSON válido
        variables: email.variables ? JSON.parse(JSON.stringify(email.variables)) : {},
      }])
      .select('id')
      .single();

    // Se houver erro de RLS (403 ou 42501), tentar usar a função que bypassa RLS
    if (error && (error.code === '42501' || error.code === 'PGRST301' || error.message?.includes('row-level security'))) {
      console.warn('⚠️ Erro de RLS ao inserir diretamente, tentando usar função insert_email_queue:', error);
      
      // Usar a função insert_email_queue que bypassa RLS
      // IMPORTANTE: p_template_id e p_recipient_name são obrigatórios na função SQL
      // mas podem ser NULL no banco, então passamos string vazia se não tiver valor
      // GARANTIR que review_link está nas variáveis antes de passar para a função
      const variablesToSave = email.variables ? JSON.parse(JSON.stringify(email.variables)) : {};
      if (!variablesToSave.review_link && email.body_html) {
        const urlPattern = /(https?:\/\/[^\s<>"']+\/review\/[^\s<>"']+)/g;
        const matches = email.body_html.match(urlPattern);
        if (matches && matches.length > 0) {
          variablesToSave.review_link = matches[0];
          console.log('🔧 review_link extraído do body_html e adicionado às variáveis antes de salvar (via função):', variablesToSave.review_link);
        }
      }
      
      const { data: functionData, error: functionError } = await supabase.rpc('insert_email_queue', {
        p_template_id: email.template_id || '00000000-0000-0000-0000-000000000000',
        p_event_type: email.event_type,
        p_recipient_email: email.recipient_email,
        p_recipient_name: email.recipient_name || '',
        p_subject: email.subject,
        p_body_html: email.body_html,
        p_reservation_id: email.reservation_id || null,
        p_variables: variablesToSave,
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
  
  // Log detalhado do que foi recuperado da fila
  const hasPlaceholderInQueue = queueItem.body_html?.includes('{{review_link}}') || queueItem.body_html?.includes('{{{review_link}}}');
  
  // IMPORTANTE: Se review_link não estiver nas variáveis, tentar extrair do body_html
  // Isso pode acontecer se o JSONB foi corrompido ou se o review_link foi perdido na serialização
  let reviewLinkFromBody = null;
  if (hasPlaceholderInQueue && queueItem.body_html) {
    // Tentar extrair o review_link do body_html procurando por padrões de URL
    const urlPattern = /(https?:\/\/[^\s<>"']+)/g;
    const matches = queueItem.body_html.match(urlPattern);
    if (matches) {
      // Procurar por URLs que contenham '/review/'
      const reviewUrl = matches.find(url => url.includes('/review/'));
      if (reviewUrl) {
        reviewLinkFromBody = reviewUrl;
        console.log('🔍 review_link extraído do body_html:', reviewLinkFromBody);
      }
    }
  }
  
  // Se review_link não estiver nas variáveis, mas estiver no body_html, adicionar às variáveis
  if (!queueItem.variables?.review_link && reviewLinkFromBody) {
    if (!queueItem.variables) {
      queueItem.variables = {};
    }
    queueItem.variables.review_link = reviewLinkFromBody;
    console.log('✅ review_link adicionado às variáveis a partir do body_html');
  }
  
  const hasReviewLinkInQueue = queueItem.variables?.review_link ? queueItem.body_html?.includes(queueItem.variables.review_link) : false;
  
  console.log('📥 Item recuperado da fila:', {
    itemId,
    eventType: queueItem.event_type,
    recipient: queueItem.recipient_email,
    hasPlaceholderInBody: hasPlaceholderInQueue,
    hasReviewLinkInBody: hasReviewLinkInQueue,
    reviewLinkInVariables: queueItem.variables?.review_link,
    reviewLinkFromBody,
    variablesType: typeof queueItem.variables,
    variablesKeys: queueItem.variables ? Object.keys(queueItem.variables) : [],
    bodyHtmlLength: queueItem.body_html?.length,
    bodyHtmlSample: queueItem.body_html?.substring(
      queueItem.body_html.indexOf('Avaliar Estadia') > 0 ? queueItem.body_html.indexOf('Avaliar Estadia') - 50 : 0,
      queueItem.body_html.indexOf('Avaliar Estadia') > 0 ? queueItem.body_html.indexOf('Avaliar Estadia') + 200 : 200
    ),
  });

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

    // PROCESSAR TODAS AS VARIÁVEIS DO TEMPLATE ANTES DE ENVIAR
    // Se o body_html ainda contém placeholders ({{variable}}), processar usando processTemplate
    let finalBodyHtml = queueItem.body_html || '';
    let finalSubject = queueItem.subject || '';
    
    // Verificar se há placeholders não processados no template
    const hasUnprocessedPlaceholders = finalBodyHtml.includes('{{') || finalSubject.includes('{{');
    
    if (hasUnprocessedPlaceholders && queueItem.variables) {
      console.log('🔄 Processando variáveis do template na fila:', {
        hasPlaceholders: hasUnprocessedPlaceholders,
        variablesCount: Object.keys(queueItem.variables).length,
        variableKeys: Object.keys(queueItem.variables),
      });
      
      try {
        // Importar e usar processTemplate para processar todas as variáveis
        const { processTemplate } = await import('./emailTemplateEngine');
        
        // Processar subject e body_html com todas as variáveis
        finalSubject = processTemplate(finalSubject, queueItem.variables);
        finalBodyHtml = processTemplate(finalBodyHtml, queueItem.variables);
        
        console.log('✅ Template processado com todas as variáveis:', {
          subjectProcessed: !finalSubject.includes('{{'),
          bodyProcessed: !finalBodyHtml.includes('{{'),
          remainingPlaceholders: (finalBodyHtml.match(/\{\{[^}]+\}\}/g) || []).length,
        });
        
        // Atualizar queueItem com o conteúdo processado
        queueItem.body_html = finalBodyHtml;
        queueItem.subject = finalSubject;
      } catch (processError) {
        console.error('❌ Erro ao processar template com variáveis:', processError);
        // Continuar mesmo se houver erro no processamento
      }
    }
    
    // SUBSTITUIR review_link ANTES DE ENVIAR (última chance)
    // Verificar se há review_link nas variáveis e substituir no body_html
    if (queueItem.variables?.review_link) {
      const reviewLink = queueItem.variables.review_link;
      console.log('🔧 Substituindo review_link no processEmailQueue:', {
        reviewLink,
        hasPlaceholderInBody: finalBodyHtml.includes('{{review_link}}') || finalBodyHtml.includes('{{{review_link}}}'),
        bodyHtmlLength: finalBodyHtml.length,
      });
      
      // Substituir todas as variações possíveis - MÚLTIPLAS VEZES
      let iterations = 0;
      while (iterations < 10 && (finalBodyHtml.includes('{{review_link}}') || finalBodyHtml.includes('{{{review_link}}}'))) {
        const before = finalBodyHtml;
        finalBodyHtml = finalBodyHtml.split('{{review_link}}').join(reviewLink);
        finalBodyHtml = finalBodyHtml.split('{{{review_link}}}').join(reviewLink);
        finalBodyHtml = finalBodyHtml.split('{{ review_link }}').join(reviewLink);
        finalBodyHtml = finalBodyHtml.split('{{{ review_link }}}').join(reviewLink);
        
        if (before === finalBodyHtml) break; // Sem mudanças, parar
        iterations++;
      }
      
      // Também substituir no subject
      finalSubject = finalSubject.split('{{review_link}}').join(reviewLink);
      finalSubject = finalSubject.split('{{{review_link}}}').join(reviewLink);
      finalSubject = finalSubject.split('{{ review_link }}').join(reviewLink);
      finalSubject = finalSubject.split('{{{ review_link }}}').join(reviewLink);
      
      console.log('✅ review_link substituído no processEmailQueue:', {
        iterations,
        hasPlaceholderAfter: finalBodyHtml.includes('{{review_link}}') || finalBodyHtml.includes('{{{review_link}}}'),
        hasReviewLinkInBody: finalBodyHtml.includes(reviewLink),
        reviewLink,
      });
      
      // Atualizar queueItem com o body_html processado
      queueItem.body_html = finalBodyHtml;
      queueItem.subject = finalSubject;
    }

    // VERIFICAÇÃO FINAL ABSOLUTA ANTES DE ENVIAR
    // Garantir que o body_html está processado e não tem placeholders
    if (queueItem.variables?.review_link && queueItem.body_html) {
      const reviewLink = queueItem.variables.review_link;
      const hasPlaceholder = queueItem.body_html.includes('{{review_link}}') || 
                             queueItem.body_html.includes('{{{review_link}}}') ||
                             queueItem.body_html.includes('{{ review_link }}') ||
                             queueItem.body_html.includes('{{{ review_link }}}');
      
      if (hasPlaceholder) {
        console.error('🚨 ERRO CRÍTICO: Placeholder ainda presente no body_html antes de enviar!');
        console.error('Executando substituição de emergência final...');
        
        // Substituição de emergência final - todas as formas possíveis
        queueItem.body_html = queueItem.body_html.replace(/\{\{review_link\}\}/gi, reviewLink);
        queueItem.body_html = queueItem.body_html.replace(/\{\{\{review_link\}\}\}/gi, reviewLink);
        queueItem.body_html = queueItem.body_html.replace(/\{\{\s*review_link\s*\}\}/gi, reviewLink);
        queueItem.body_html = queueItem.body_html.replace(/\{\{\{\s*review_link\s*\}\}\}/gi, reviewLink);
        queueItem.body_html = queueItem.body_html.split('{{review_link}}').join(reviewLink);
        queueItem.body_html = queueItem.body_html.split('{{{review_link}}}').join(reviewLink);
        queueItem.body_html = queueItem.body_html.split('{{ review_link }}').join(reviewLink);
        queueItem.body_html = queueItem.body_html.split('{{{ review_link }}}').join(reviewLink);
        
        // Também no subject
        queueItem.subject = queueItem.subject.replace(/\{\{review_link\}\}/gi, reviewLink);
        queueItem.subject = queueItem.subject.replace(/\{\{\{review_link\}\}\}/gi, reviewLink);
        queueItem.subject = queueItem.subject.split('{{review_link}}').join(reviewLink);
        queueItem.subject = queueItem.subject.split('{{{review_link}}}').join(reviewLink);
        
        console.log('✅ Substituição de emergência final executada:', {
          stillHasPlaceholder: queueItem.body_html.includes('{{review_link}}') || queueItem.body_html.includes('{{{review_link}}}'),
          hasReviewLink: queueItem.body_html.includes(reviewLink),
          reviewLink,
        });
      }
    }

    // Enviar e-mail baseado no provedor
    let success = false;
    let errorMessage = '';

    console.log('📧 Processando email com provedor:', {
      provider: settings.provider,
      cc_emails: queueItem.cc_emails || 'Nenhum',
      bcc_emails: queueItem.bcc_emails || 'Nenhum',
      hasReviewLinkPlaceholder: queueItem.body_html?.includes('{{review_link}}') || queueItem.body_html?.includes('{{{review_link}}}'),
      hasReviewLink: queueItem.variables?.review_link ? queueItem.body_html?.includes(queueItem.variables.review_link) : false,
      reviewLink: queueItem.variables?.review_link,
      bodyHtmlSample: queueItem.body_html?.substring(
        queueItem.body_html.indexOf('Avaliar Estadia') > 0 ? queueItem.body_html.indexOf('Avaliar Estadia') - 50 : 0,
        queueItem.body_html.indexOf('Avaliar Estadia') > 0 ? queueItem.body_html.indexOf('Avaliar Estadia') + 200 : 200
      ),
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
    
    // VERIFICAÇÃO FINAL: Garantir que review_link está substituído antes de enviar
    let finalHtml = queueItem.body_html || '';
    if (queueItem.variables?.review_link) {
      const reviewLink = queueItem.variables.review_link;
      const hasPlaceholder = finalHtml.includes('{{review_link}}') || 
                             finalHtml.includes('{{{review_link}}}') ||
                             finalHtml.includes('{{ review_link }}') ||
                             finalHtml.includes('{{{ review_link }}}');
      
      if (hasPlaceholder) {
        console.error('🚨 ERRO CRÍTICO: Placeholder ainda presente no body_html antes de enviar via SMTP!');
        console.error('Executando substituição de emergência final no sendViaSMTP...');
        
        // Substituição de emergência final
        finalHtml = finalHtml.replace(/\{\{review_link\}\}/gi, reviewLink);
        finalHtml = finalHtml.replace(/\{\{\{review_link\}\}\}/gi, reviewLink);
        finalHtml = finalHtml.replace(/\{\{\s*review_link\s*\}\}/gi, reviewLink);
        finalHtml = finalHtml.replace(/\{\{\{\s*review_link\s*\}\}\}/gi, reviewLink);
        finalHtml = finalHtml.split('{{review_link}}').join(reviewLink);
        finalHtml = finalHtml.split('{{{review_link}}}').join(reviewLink);
        finalHtml = finalHtml.split('{{ review_link }}').join(reviewLink);
        finalHtml = finalHtml.split('{{{ review_link }}}').join(reviewLink);
        
        console.log('✅ Substituição de emergência final no sendViaSMTP executada:', {
          stillHasPlaceholder: finalHtml.includes('{{review_link}}') || finalHtml.includes('{{{review_link}}}'),
          hasReviewLink: finalHtml.includes(reviewLink),
          reviewLink,
        });
      }
    }
    
    const smtpPayload = {
      to: queueItem.recipient_email,
      to_name: queueItem.recipient_name,
      from: settings.sender_email,
      from_name: senderName,
      reply_to: settings.reply_to_email || settings.sender_email,
      subject: queueItem.subject,
      html: finalHtml,
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
      smtp_config: { ...smtpPayload.smtp_config, auth: { user: smtpPayload.smtp_config.auth.user, pass: '***' } },
      hasReviewLinkPlaceholder: smtpPayload.html?.includes('{{review_link}}') || smtpPayload.html?.includes('{{{review_link}}}'),
      hasReviewLink: queueItem.variables?.review_link ? smtpPayload.html?.includes(queueItem.variables.review_link) : false,
      reviewLink: queueItem.variables?.review_link,
      htmlSample: smtpPayload.html?.substring(
        smtpPayload.html.indexOf('Avaliar Estadia') > 0 ? smtpPayload.html.indexOf('Avaliar Estadia') - 50 : 0,
        smtpPayload.html.indexOf('Avaliar Estadia') > 0 ? smtpPayload.html.indexOf('Avaliar Estadia') + 200 : 200
      ),
    });
    
    // Edge (direto) ou API PMS → Edge (JWT do utilizador)
    try {
      const result = await invokeSendEmailEdge('send-email-smtp', smtpPayload);
      
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
 * Envia e-mail via SendGrid usando Edge Function (evita problemas de CORS)
 */
async function sendViaSendGrid(queueItem: any, settings: EmailSettings, hotelName?: string): Promise<boolean> {
  try {
    // Validar configurações
    if (!settings.api_key) {
      throw new Error('API Key do SendGrid não configurada');
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
    
    // Garantir que sender_name não esteja vazio - usar nome do hotel como fallback
    const senderName = settings.sender_name?.trim() || hotelName || 'PMS System';

    const result = await invokeSendEmailEdge('send-email-sendgrid', {
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
    });
    
    if (ccEmails.length > 0 || bccEmails.length > 0) {
      console.log('✅ SendGrid - Payload enviado com CC/BCC:', {
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
        const data = result.data as any;
        details = data.details || data.error || errorMessage;
        hint = data.hint || '';
      }

      // Mensagens de erro mais específicas
      if (errorMessage.includes('API Key') || errorMessage.includes('401') || errorMessage.includes('403')) {
        throw new Error(`API Key do SendGrid inválida ou sem permissão: ${details}${hint ? `\nDica: ${hint}` : ''}`);
      } else if (errorMessage.includes('400') || errorMessage.includes('Dados inválidos')) {
        throw new Error(`Dados inválidos para envio via SendGrid: ${details}${hint ? `\nDica: ${hint}` : ''}`);
      } else if (errorMessage.includes('429') || errorMessage.includes('Limite')) {
        throw new Error(`Limite de envio excedido no SendGrid: ${details}${hint ? `\nDica: ${hint}` : ''}`);
      } else {
        throw new Error(`Erro ao enviar via SendGrid: ${details}${hint ? `\nDica: ${hint}` : ''}`);
      }
    }

    // Verificar se a resposta indica sucesso
    if (result.data && typeof result.data === 'object') {
      const data = result.data as any;
      if (data.success === true || data.message) {
    console.log('✅ SendGrid - Email enviado com sucesso (incluindo CC/BCC se configurado)');
        return true;
      }
    }

    // Se chegou aqui, considerar como sucesso (Edge Function retornou sem erro)
    console.log('✅ SendGrid - Email enviado com sucesso');
    return true;
  } catch (error: any) {
    console.error('Erro ao enviar via SendGrid:', error);
    
    // Verificar se é erro de Edge Function não encontrada
    if (error.message?.includes('Function not found') || 
        error.message?.includes('404') ||
        error.code === 'FUNCTION_NOT_FOUND') {
      throw new Error(
        'Edge Function "send-email-sendgrid" não encontrada ou não configurada. ' +
        'Por favor, crie a Edge Function no Supabase Dashboard: ' +
        '1. Vá em Edge Functions > Create a new function ' +
        '2. Nome: send-email-sendgrid ' +
        '3. Cole o código de supabase/functions/send-email-sendgrid/index.ts ' +
        '4. Deploy. Veja o guia completo em GUIA_SENDGRID_EDGE_FUNCTION.md'
      );
    }
    
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
    
    const result = await invokeSendEmailEdge('send-email-resend', {
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
    
    // Verificar se o sistema de e-mail está habilitado para o estabelecimento
    if (establishmentId) {
      const { data: siteSettingsFeatureFlag } = await supabase
        .from('site_settings')
        .select('features_enabled')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      
      const { isFeatureEnabledForEstablishment } = await import('@/lib/featureAccess');
      const isEmailEnabled = isFeatureEnabledForEstablishment(
        siteSettingsFeatureFlag?.features_enabled?.email,
        establishmentId
      );
      
      if (!isEmailEnabled) {
        console.warn('⚠️ Sistema de e-mail está desabilitado para este estabelecimento. E-mail não será enviado.');
        return null;
      }
    }
    
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas. E-mail não será enviado.');
      return null;
    }
    
    // Buscar template ativo para o evento com filtro de estabelecimento
    const template = await findEmailTemplate('guest.password_reset', establishmentId);
    
    if (!template) {
      return null;
    }
    
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
    establishmentId?: string;
  }
): Promise<string | null> {
  try {
    // Verificar se o sistema de e-mail está habilitado para o estabelecimento
    if (requestData.establishmentId) {
      const { data: siteSettingsFeatureFlag } = await supabase
        .from('site_settings')
        .select('features_enabled')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      
      const { isFeatureEnabledForEstablishment } = await import('@/lib/featureAccess');
      const isEmailEnabled = isFeatureEnabledForEstablishment(
        siteSettingsFeatureFlag?.features_enabled?.email,
        requestData.establishmentId
      );
      
      if (!isEmailEnabled) {
        console.warn('⚠️ Sistema de e-mail está desabilitado para este estabelecimento. E-mail não será enviado.');
        return null;
      }
    }
    
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas.');
      return null;
    }

    // Buscar template ativo para o evento com filtro de estabelecimento
    const template = await findEmailTemplate('fiscal_document.request', requestData.establishmentId);
    
    if (!template) {
      return null;
    }

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
    
    // Verificar se o sistema de e-mail está habilitado para o estabelecimento
    const { data: siteSettingsFeatureFlag } = await supabase
      .from('site_settings')
      .select('features_enabled')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();
    
    const { isFeatureEnabledForEstablishment } = await import('@/lib/featureAccess');
    const isEmailEnabled = isFeatureEnabledForEstablishment(
      siteSettingsFeatureFlag?.features_enabled?.email,
      employeeData.establishmentId
    );
    
    if (!isEmailEnabled) {
      console.warn('⚠️ Sistema de e-mail está desabilitado para este estabelecimento. E-mail não será enviado.');
      return null;
    }
    
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas. E-mail não será enviado.');
      return null;
    }
    
    // Buscar template ativo para o evento com filtro de estabelecimento
    console.log('🔍 Buscando template para evento: employee.added_to_establishment');
    const template = await findEmailTemplate('employee.added_to_establishment', employeeData.establishmentId);
    
    if (!template) {
      console.log('💡 Dica: Verifique se a migration 20251204000001_add_employee_added_to_establishment_email_template.sql foi executada no Supabase.');
      return null;
    }
    
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
    
    // Verificar se o sistema de e-mail está habilitado para o estabelecimento
    if (reservation?.establishment_id) {
      const { data: siteSettingsFeatureFlag } = await supabase
        .from('site_settings')
        .select('features_enabled')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      
      const { isFeatureEnabledForEstablishment } = await import('@/lib/featureAccess');
      const isEmailEnabled = isFeatureEnabledForEstablishment(
        siteSettingsFeatureFlag?.features_enabled?.email,
        reservation.establishment_id
      );
      
      if (!isEmailEnabled) {
        console.warn('⚠️ Sistema de e-mail está desabilitado para este estabelecimento. E-mail não será enviado.');
        return null;
      }
    }
    
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas. E-mail não será enviado.');
      return null;
    }
    
    // Buscar template ativo para o evento com filtro de estabelecimento
    console.log('🔍 Buscando template para evento: checkout.reminder');
    const template = await findEmailTemplate('checkout.reminder', reservation?.establishment_id);
    
    if (!template) {
      console.log('💡 Dica: Verifique se a migration 20251204000003_create_checkout_reminder_email_template.sql foi executada no Supabase.');
      return null;
    }
    
    // Buscar dados completos da reserva com relacionamentos
    const { data: fullReservation, error: reservationError } = await supabase
      .from('reservations')
      .select(`
        *,
        financial_responsible:clients!client_id(*),
        guest:clients!guest_id(*),
        rooms (id, room_number, name),
        room_categories (id, name, description, building_id),
        ota_reservations(ota_guest_email, ota_guest_name)
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

    // Buscar site_settings como fallback para logo e pms_base_url
    let siteSettings = null;
    try {
      const { data: siteData } = await supabase
        .from('site_settings')
        .select('logo_url, pms_base_url')
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
    
    // Usar pms_base_url de site_settings se disponível, senão detectar automaticamente
    let baseUrl = siteSettings?.pms_base_url || null;
    if (!baseUrl) {
      baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : (process.env.VITE_APP_URL || 'http://localhost:8080');
    }
    
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

    // Destinatário: cliente ou email em ota_reservations (reservas canal/Aiosell)
    const { email: recipientEmail, name: recipientName } = resolveReservationRecipient(fullReservation);

    if (!recipientEmail) {
      console.warn('⚠️ E-mail do destinatário não encontrado para reserva:', fullReservation.id);
      return null;
    }

    console.log('✅ Destinatário encontrado:', { email: recipientEmail, name: recipientName });

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

/**
 * Envia e-mail de solicitação de avaliação após check-out
 */
export async function sendStayReviewRequestEmail(
  reservation: any,
  reviewLink: string
): Promise<string | null> {
  try {
    // Validar e garantir que reviewLink está correto
    if (!reviewLink || reviewLink.trim() === '') {
      console.error('❌ reviewLink está vazio ou inválido!');
      return null;
    }
    
    // Garantir que o link começa com http:// ou https://
    if (!reviewLink.startsWith('http://') && !reviewLink.startsWith('https://')) {
      console.warn('⚠️ reviewLink não começa com http:// ou https://, ajustando...');
      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : (import.meta.env.VITE_APP_URL || 'http://localhost:8080');
      reviewLink = `${baseUrl}${reviewLink.startsWith('/') ? '' : '/'}${reviewLink}`;
    }
    
    console.log('📧 Enviando e-mail de solicitação de avaliação:', { 
      reservationId: reservation?.id,
      reviewLink,
      reviewLinkLength: reviewLink.length,
      reviewLinkStartsWithHttp: reviewLink.startsWith('http'),
    });
    
    // Verificar se o feature flag de avaliações está habilitado para este estabelecimento
    const { data: siteSettingsFeatureFlag } = await supabase
      .from('site_settings')
      .select('features_enabled')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();
    
    const { isFeatureEnabledForEstablishment } = await import('@/lib/featureAccess');
    const isStayReviewsEnabled = isFeatureEnabledForEstablishment(
      siteSettingsFeatureFlag?.features_enabled?.stay_reviews,
      reservation?.establishment_id
    );
    
    if (!isStayReviewsEnabled) {
      console.warn('⚠️ Sistema de avaliações está desabilitado para este estabelecimento. E-mail não será enviado.');
      return null;
    }
    
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas. E-mail não será enviado.');
      return null;
    }
    
    // Buscar template ativo para o evento com filtro de estabelecimento
    const template = await findEmailTemplate('checkout.completed', reservation?.establishment_id);
    
    if (!template) {
      return null;
    }
    
    // Buscar dados completos da reserva
    const { data: fullReservation, error: reservationError } = await supabase
      .from('reservations')
      .select(`
        *,
        financial_responsible:clients!client_id(*),
        guest:clients!guest_id(*),
        rooms (id, room_number, name),
        room_categories (id, name, description, building_id),
        ota_reservations(ota_guest_email, ota_guest_name)
      `)
      .eq('id', reservation.id || reservation)
      .single();

    if (reservationError || !fullReservation) {
      console.error('❌ Erro ao buscar dados da reserva:', reservationError);
      return null;
    }

    // Buscar configurações do hotel (necessárias para generateReservationVariables)
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
    // IMPORTANTE: generateReservationVariables é async, precisa de await
    const variables = await generateReservationVariables(
      fullReservation,
      fullReservation.financial_responsible,
      fullReservation.guest,
      hotelSettings,
      siteSettings
    );
    
    // Adicionar link de avaliação
    const allVariables: TemplateVariables = {
      ...variables,
      review_link: reviewLink,
    };
    
    console.log('📊 Variáveis geradas:', {
      variablesCount: Object.keys(variables).length,
      variablesKeys: Object.keys(variables),
      allVariablesCount: Object.keys(allVariables).length,
      allVariablesKeys: Object.keys(allVariables),
    });

    console.log('📧 Processando template de avaliação:', {
      reviewLink,
      hasReviewLink: !!reviewLink,
      allVariablesKeys: Object.keys(allVariables),
      reviewLinkInVariables: allVariables.review_link,
      templateBodyHasReviewLink: template.body_html?.includes('{{review_link}}'),
      templateBodyHasReviewLinkTriple: template.body_html?.includes('{{{review_link}}}'),
      templateBodySample: template.body_html?.substring(0, 500),
    });

    // SUBSTITUIR review_link DIRETAMENTE NO TEMPLATE ANTES DE PROCESSAR
    // Isso garante que a variável seja substituída mesmo se o processTemplate falhar
    let templateSubject = template.subject || '';
    let templateBodyHtml = template.body_html || '';
    
    console.log('🔍 Template original (primeiros 2000 chars):', templateBodyHtml.substring(0, 2000));
    console.log('🔍 reviewLink recebido:', reviewLink);
    
    if (reviewLink) {
      // Substituir no template ANTES de processar - usar método mais direto
      // Substituir todas as variações possíveis
      const replacements = [
        { from: '{{review_link}}', to: reviewLink },
        { from: '{{{review_link}}}', to: reviewLink },
        { from: '{{ review_link }}', to: reviewLink },
        { from: '{{{ review_link }}}', to: reviewLink },
      ];
      
      replacements.forEach(({ from, to }) => {
        while (templateSubject.includes(from)) {
          templateSubject = templateSubject.replace(from, to);
        }
        while (templateBodyHtml.includes(from)) {
          templateBodyHtml = templateBodyHtml.replace(from, to);
        }
      });
      
      console.log('🔧 review_link substituído no template ANTES do processamento:', {
        subjectHasPlaceholder: templateSubject.includes('{{review_link}}') || templateSubject.includes('{{{review_link}}}'),
        bodyHasPlaceholder: templateBodyHtml.includes('{{review_link}}') || templateBodyHtml.includes('{{{review_link}}}'),
        bodyHasReviewLink: templateBodyHtml.includes(reviewLink),
        reviewLinkLength: reviewLink.length,
      });
    }

    // Processar template (agora sem review_link placeholder)
    // IMPORTANTE: Não processar review_link novamente, já foi substituído
    // Processar normalmente, mas garantir que review_link não seja processado novamente
    // Salvar o templateBodyHtml antes de processar para poder restaurar se necessário
    const templateBodyHtmlWithLink = templateBodyHtml;
    
    let subject = processTemplate(templateSubject, allVariables);
    let bodyHtml = processTemplate(templateBodyHtml, allVariables);
    
    // VERIFICAÇÃO CRÍTICA: Se o processTemplate removeu o review_link que já estava substituído
    if (reviewLink) {
      const templateHadReviewLink = templateBodyHtmlWithLink.includes(reviewLink);
      const processedHasReviewLink = bodyHtml.includes(reviewLink);
      const processedHasPlaceholder = bodyHtml.includes('{{review_link}}') || bodyHtml.includes('{{{review_link}}}');
      
      console.log('🔍 Verificação pós-processamento:', {
        templateHadReviewLink,
        processedHasReviewLink,
        processedHasPlaceholder,
        reviewLink,
      });
      
      // Se o template tinha o link mas o processado não tem, restaurar
      if (templateHadReviewLink && !processedHasReviewLink) {
        console.error('❌ ERRO: processTemplate removeu review_link que já estava substituído!');
        console.error('Restaurando do templateBodyHtml que já tinha o link...');
        // Usar o templateBodyHtml que já tinha o link substituído
        bodyHtml = templateBodyHtmlWithLink;
      }
      
      // Se ainda há placeholder após processamento, substituir
      if (processedHasPlaceholder) {
        console.warn('⚠️ Placeholder ainda presente após processamento, substituindo...');
        bodyHtml = bodyHtml.replace(/\{\{review_link\}\}/g, reviewLink);
        bodyHtml = bodyHtml.replace(/\{\{\{review_link\}\}\}/g, reviewLink);
        bodyHtml = bodyHtml.split('{{review_link}}').join(reviewLink);
        bodyHtml = bodyHtml.split('{{{review_link}}}').join(reviewLink);
      }
    }
    
    // VERIFICAÇÃO CRÍTICA: Se o processTemplate não substituiu review_link corretamente
    // e o templateBodyHtml já tinha o link substituído, usar o templateBodyHtml
    if (reviewLink && templateBodyHtml.includes(reviewLink) && !bodyHtml.includes(reviewLink)) {
      console.error('❌ ERRO CRÍTICO: processTemplate removeu review_link que já estava substituído!');
      console.error('Restaurando do templateBodyHtml que já tinha o link...');
      bodyHtml = templateBodyHtml; // Usar o template já com review_link substituído
    }
    
    console.log('📧 Template processado (primeira passada):', {
      subject,
      bodyHtmlLength: bodyHtml?.length,
      hasReviewLinkInBody: bodyHtml?.includes(reviewLink || ''),
      hasPlaceholder: bodyHtml?.includes('{{review_link}}'),
      hasPlaceholderTriple: bodyHtml?.includes('{{{review_link}}}'),
      reviewLinkValue: reviewLink,
      reviewLinkInVariables: allVariables.review_link,
      templateBodyHadReviewLink: templateBodyHtml.includes(reviewLink),
      bodyHtmlSample: bodyHtml?.substring(
        bodyHtml.indexOf('Avaliar Estadia') > 0 ? bodyHtml.indexOf('Avaliar Estadia') - 50 : 0, 
        bodyHtml.indexOf('Avaliar Estadia') > 0 ? bodyHtml.indexOf('Avaliar Estadia') + 200 : 200
      ),
    });
    
    // Se ainda houver placeholder, substituir manualmente (fallback)
    if (bodyHtml?.includes('{{review_link}}') && reviewLink) {
      console.warn('⚠️ Placeholder {{review_link}} ainda presente após processamento, substituindo manualmente');
      bodyHtml = bodyHtml.replace(/\{\{review_link\}\}/g, reviewLink);
      subject = subject.replace(/\{\{review_link\}\}/g, reviewLink);
    }
    if (bodyHtml?.includes('{{{review_link}}}') && reviewLink) {
      console.warn('⚠️ Placeholder {{{review_link}}} ainda presente após processamento, substituindo manualmente');
      bodyHtml = bodyHtml.replace(/\{\{\{review_link\}\}\}/g, reviewLink);
      subject = subject.replace(/\{\{\{review_link\}\}\}/g, reviewLink);
    }
    
    // Verificação final
    if (bodyHtml?.includes('{{review_link}}') || bodyHtml?.includes('{{{review_link}}}')) {
      console.error('❌ ERRO: Placeholder review_link ainda presente após todas as tentativas de substituição!');
      console.error('Variáveis disponíveis:', Object.keys(allVariables));
      console.error('review_link value:', allVariables.review_link);
    } else {
      console.log('✅ review_link substituído com sucesso!');
    }
    
    const finalBodyHtml = bodyHtml;

    const { email: recipientEmail, name: recipientName } = resolveReservationRecipient(fullReservation);

    if (!recipientEmail) {
      console.warn('⚠️ E-mail do destinatário não encontrado para reserva:', fullReservation.id);
      return null;
    }

    console.log('✅ Destinatário encontrado:', { email: recipientEmail, name: recipientName });

    // GARANTIR que review_link seja substituído ANTES de adicionar à fila
    // Fazer substituição final manual FORÇADA para garantir
    let finalSubject = subject;
    let finalBodyHtmlFinal = finalBodyHtml;
    
    if (reviewLink) {
      console.log('🔧 Executando substituição FORÇADA de review_link:', {
        reviewLink,
        bodyHtmlLength: finalBodyHtmlFinal?.length,
        hasPlaceholderBefore: finalBodyHtmlFinal?.includes('{{review_link}}') || finalBodyHtmlFinal?.includes('{{{review_link}}}'),
      });
      
      // Substituir TODAS as variações possíveis do placeholder - FORÇADO
      const replacements = [
        { pattern: /\{\{review_link\}\}/g, value: reviewLink },
        { pattern: /\{\{\{review_link\}\}\}/g, value: reviewLink },
        { pattern: /\{\{ review_link \}\}/g, value: reviewLink },
        { pattern: /\{\{\{ review_link \}\}\}/g, value: reviewLink },
        { pattern: /\{\{review_link\s*\}\}/g, value: reviewLink },
        { pattern: /\{\{\{review_link\s*\}\}\}/g, value: reviewLink },
      ];
      
      let replacedCount = 0;
      replacements.forEach(({ pattern, value }) => {
        const beforeSubject = finalSubject;
        const beforeBody = finalBodyHtmlFinal;
        
        finalSubject = finalSubject?.replace(pattern, value) || finalSubject;
        finalBodyHtmlFinal = finalBodyHtmlFinal?.replace(pattern, value) || finalBodyHtmlFinal;
        
        if (beforeSubject !== finalSubject) {
          replacedCount++;
          console.log('✅ review_link substituído no subject (fallback)', { pattern: pattern.toString() });
        }
        if (beforeBody !== finalBodyHtmlFinal) {
          replacedCount++;
          console.log('✅ review_link substituído no body (fallback)', { pattern: pattern.toString() });
        }
      });
      
      console.log('📊 Substituições realizadas:', { replacedCount });
    }
    
    // Verificação final CRÍTICA
    const stillHasPlaceholder = finalBodyHtmlFinal?.includes('{{review_link}}') || 
                                finalBodyHtmlFinal?.includes('{{{review_link}}}') ||
                                finalBodyHtmlFinal?.includes('{{ review_link }}') ||
                                finalBodyHtmlFinal?.includes('{{{ review_link }}}');
    
    if (stillHasPlaceholder) {
      console.error('❌ ERRO CRÍTICO: review_link ainda não foi substituído após todas as tentativas!');
      console.error('Template original (primeiros 1000 chars):', template.body_html?.substring(0, 1000));
      console.error('Body processado (primeiros 1000 chars):', finalBodyHtmlFinal?.substring(0, 1000));
      console.error('reviewLink value:', reviewLink);
      console.error('allVariables.review_link:', allVariables.review_link);
      
      // ÚLTIMA TENTATIVA: substituição direta e literal
      if (reviewLink) {
        finalBodyHtmlFinal = finalBodyHtmlFinal?.replace(/{{review_link}}/g, reviewLink) || finalBodyHtmlFinal;
        finalBodyHtmlFinal = finalBodyHtmlFinal?.replace(/{{{review_link}}}/g, reviewLink) || finalBodyHtmlFinal;
        finalBodyHtmlFinal = finalBodyHtmlFinal?.replace(/{{ review_link }}/g, reviewLink) || finalBodyHtmlFinal;
        finalBodyHtmlFinal = finalBodyHtmlFinal?.replace(/{{{ review_link }}}/g, reviewLink) || finalBodyHtmlFinal;
        console.log('🔄 Última tentativa de substituição direta executada');
      }
    } else {
      console.log('✅ Verificação final: review_link foi substituído com sucesso!');
    }
    
    // VERIFICAÇÃO FINAL ANTES DE ADICIONAR À FILA
    // Garantir que NÃO há placeholders restantes - SUBSTITUIÇÃO FORÇADA
    if (finalBodyHtmlFinal && reviewLink) {
      console.log('🔧 Executando substituição FORÇADA final antes de adicionar à fila:', {
        reviewLink,
        bodyLength: finalBodyHtmlFinal.length,
        hasPlaceholderBefore: finalBodyHtmlFinal.includes('{{review_link}}') || finalBodyHtmlFinal.includes('{{{review_link}}}'),
      });
      
      // Substituição literal final (sem regex, direto) - MÚLTIPLAS VEZES
      let iterations = 0;
      let previousBody = '';
      while (iterations < 10 && (finalBodyHtmlFinal.includes('{{review_link}}') || finalBodyHtmlFinal.includes('{{{review_link}}}'))) {
        previousBody = finalBodyHtmlFinal;
        finalBodyHtmlFinal = finalBodyHtmlFinal.split('{{review_link}}').join(reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.split('{{{review_link}}}').join(reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.split('{{ review_link }}').join(reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.split('{{{ review_link }}}').join(reviewLink);
        
        if (previousBody === finalBodyHtmlFinal) break; // Sem mudanças, parar
        iterations++;
      }
      
      // Também substituir no subject
      let subjectIterations = 0;
      while (subjectIterations < 10 && (finalSubject.includes('{{review_link}}') || finalSubject.includes('{{{review_link}}}'))) {
        const prevSubject = finalSubject;
        finalSubject = finalSubject.split('{{review_link}}').join(reviewLink);
        finalSubject = finalSubject.split('{{{review_link}}}').join(reviewLink);
        finalSubject = finalSubject.split('{{ review_link }}').join(reviewLink);
        finalSubject = finalSubject.split('{{{ review_link }}}').join(reviewLink);
        
        if (prevSubject === finalSubject) break; // Sem mudanças, parar
        subjectIterations++;
      }
      
      console.log('✅ Verificação final após substituição forçada:', {
        iterations,
        subjectIterations,
        stillHasPlaceholder: finalBodyHtmlFinal.includes('{{review_link}}') || finalBodyHtmlFinal.includes('{{{review_link}}}'),
        reviewLinkInBody: finalBodyHtmlFinal.includes(reviewLink),
        reviewLinkValue: reviewLink,
      });
      
      // Se AINDA houver placeholder após todas as tentativas, ERRO CRÍTICO
      if (finalBodyHtmlFinal.includes('{{review_link}}') || finalBodyHtmlFinal.includes('{{{review_link}}}')) {
        console.error('❌ ERRO CRÍTICO: review_link AINDA presente após substituição forçada!');
        console.error('Body HTML (primeiros 2000 chars):', finalBodyHtmlFinal.substring(0, 2000));
        console.error('reviewLink:', reviewLink);
        
        // ÚLTIMA TENTATIVA DESESPERADA: substituir caractere por caractere
        finalBodyHtmlFinal = finalBodyHtmlFinal.replace(/\{\{review_link\}\}/g, reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.replace(/\{\{\{review_link\}\}\}/g, reviewLink);
      }
    }
    
    // VERIFICAÇÃO ABSOLUTAMENTE FINAL - GARANTIR QUE review_link ESTÁ SUBSTITUÍDO
    // Se ainda houver placeholder, substituir UMA ÚLTIMA VEZ
    if (reviewLink && finalBodyHtmlFinal) {
      const hasPlaceholder = finalBodyHtmlFinal.includes('{{review_link}}') || 
                             finalBodyHtmlFinal.includes('{{{review_link}}}') ||
                             finalBodyHtmlFinal.includes('{{ review_link }}') ||
                             finalBodyHtmlFinal.includes('{{{ review_link }}}');
      
      if (hasPlaceholder) {
        console.error('🚨 ERRO: Placeholder ainda presente! Executando substituição de emergência...');
        // Substituição de emergência - todas as formas possíveis
        finalBodyHtmlFinal = finalBodyHtmlFinal.replace(/\{\{review_link\}\}/gi, reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.replace(/\{\{\{review_link\}\}\}/gi, reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.replace(/\{\{\s*review_link\s*\}\}/gi, reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.replace(/\{\{\{\s*review_link\s*\}\}\}/gi, reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.split('{{review_link}}').join(reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.split('{{{review_link}}}').join(reviewLink);
        
        console.log('🔧 Substituição de emergência executada:', {
          stillHasPlaceholder: finalBodyHtmlFinal.includes('{{review_link}}') || finalBodyHtmlFinal.includes('{{{review_link}}}'),
          hasReviewLink: finalBodyHtmlFinal.includes(reviewLink),
        });
      }
    }
    
    // VERIFICAÇÃO FINAL ABSOLUTA ANTES DE ADICIONAR À FILA
    // Garantir que o body_html NÃO tem placeholders
    if (reviewLink && finalBodyHtmlFinal) {
      const hasPlaceholder = finalBodyHtmlFinal.includes('{{review_link}}') || 
                             finalBodyHtmlFinal.includes('{{{review_link}}}') ||
                             finalBodyHtmlFinal.includes('{{ review_link }}') ||
                             finalBodyHtmlFinal.includes('{{{ review_link }}}');
      
      if (hasPlaceholder) {
        console.error('🚨 ERRO CRÍTICO: Placeholder ainda presente ANTES de adicionar à fila!');
        console.error('Executando substituição de emergência FINAL antes de salvar na fila...');
        
        // Substituição de emergência final - TODAS as formas possíveis
        finalBodyHtmlFinal = finalBodyHtmlFinal.replace(/\{\{review_link\}\}/gi, reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.replace(/\{\{\{review_link\}\}\}/gi, reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.replace(/\{\{\s*review_link\s*\}\}/gi, reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.replace(/\{\{\{\s*review_link\s*\}\}\}/gi, reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.split('{{review_link}}').join(reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.split('{{{review_link}}}').join(reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.split('{{ review_link }}').join(reviewLink);
        finalBodyHtmlFinal = finalBodyHtmlFinal.split('{{{ review_link }}}').join(reviewLink);
        
        // Também no subject
        finalSubject = finalSubject.replace(/\{\{review_link\}\}/gi, reviewLink);
        finalSubject = finalSubject.replace(/\{\{\{review_link\}\}\}/gi, reviewLink);
        finalSubject = finalSubject.split('{{review_link}}').join(reviewLink);
        finalSubject = finalSubject.split('{{{review_link}}}').join(reviewLink);
        
        console.log('✅ Substituição de emergência FINAL executada antes de salvar na fila:', {
          stillHasPlaceholder: finalBodyHtmlFinal.includes('{{review_link}}') || finalBodyHtmlFinal.includes('{{{review_link}}}'),
          hasReviewLink: finalBodyHtmlFinal.includes(reviewLink),
          reviewLink,
        });
      }
    }
    
    // Adicionar à fila
    const queueId = await queueEmail({
      template_id: template.id,
      event_type: 'checkout.completed',
      recipient_email: recipientEmail,
      recipient_name: recipientName,
      subject: finalSubject,
      body_html: finalBodyHtmlFinal,
      variables: allVariables,
      reservation_id: fullReservation.id,
      cc_emails: template.cc_emails || undefined,
      bcc_emails: template.bcc_emails || undefined,
    });
    
    console.log('📬 Email adicionado à fila:', {
      queueId,
      hasReviewLinkInFinalBody: finalBodyHtmlFinal?.includes(reviewLink || ''),
      hasPlaceholderInFinalBody: finalBodyHtmlFinal?.includes('{{review_link}}') || finalBodyHtmlFinal?.includes('{{{review_link}}}'),
      reviewLinkValue: reviewLink,
      reviewLinkInVariables: allVariables.review_link,
      bodyHtmlSample: finalBodyHtmlFinal?.substring(
        finalBodyHtmlFinal.indexOf('Avaliar Estadia') > 0 ? finalBodyHtmlFinal.indexOf('Avaliar Estadia') - 50 : 0,
        finalBodyHtmlFinal.indexOf('Avaliar Estadia') > 0 ? finalBodyHtmlFinal.indexOf('Avaliar Estadia') + 200 : 200
      ),
      bodyHtmlLength: finalBodyHtmlFinal?.length,
    });

    if (!queueId) {
      console.error('❌ Erro ao adicionar e-mail à fila');
      return null;
    }

    console.log('✅ E-mail adicionado à fila:', { queueId });

    // Processar imediatamente
    try {
      const { data: queueItem } = await supabase
        .from('email_queue')
        .select('*')
        .eq('id', queueId)
        .single();

      if (queueItem) {
        // Processar e-mail imediatamente (a função processEmailQueue será chamada automaticamente)
        console.log('📬 E-mail será processado pela fila');
      }
    } catch (error) {
      console.warn('⚠️ Erro ao processar e-mail imediatamente, será processado pela fila:', error);
    }

    return queueId;
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail de solicitação de avaliação:', error);
    return null;
  }
}

/**
 * Helper function para buscar templates de email com filtro de estabelecimento
 */
async function findEmailTemplate(eventType: string, establishmentId?: string) {
  let templatesQuery = supabase
      .from('email_templates')
      .select('*')
      .eq('event_type', eventType)
      .eq('is_active', true)
    .order('updated_at', { ascending: false });
  
  // Se houver establishment_id, filtrar templates que permitem este estabelecimento
  // ou templates sem restrição (establishment_ids vazio, null ou array vazio)
  if (establishmentId) {
    // Verificar se o campo establishment_ids contém o establishment_id ou está vazio/null
    // Usar RPC ou filtro mais específico para JSONB array
    // Primeiro buscar todos os templates e filtrar no código se necessário
    const { data: allTemplates, error: fetchError } = await templatesQuery;
    
    if (fetchError) {
      console.warn(`⚠️ Erro ao buscar template para evento: ${eventType}`, fetchError);
      return null;
    }
    
    if (!allTemplates || allTemplates.length === 0) {
      console.warn(`⚠️ Template não encontrado para evento: ${eventType}`);
      return null;
    }
    
    // Filtrar templates que permitem este estabelecimento ou não têm restrição
    const filteredTemplates = allTemplates.filter((template: any) => {
      const establishmentIds = template.establishment_ids;
      
      console.log(`🔍 Verificando template ${template.id} para estabelecimento ${establishmentId}:`, {
        templateName: template.name,
        establishmentIds,
        isNull: establishmentIds === null,
        isUndefined: establishmentIds === undefined,
        isArray: Array.isArray(establishmentIds),
        arrayLength: Array.isArray(establishmentIds) ? establishmentIds.length : 'N/A',
        type: typeof establishmentIds
      });
      
      // Se nunca foi definido (null ou undefined), permitir todos (comportamento padrão)
      if (establishmentIds === null || establishmentIds === undefined) {
        console.log(`✅ Template ${template.id}: null/undefined - PERMITIDO (padrão)`);
        return true;
      }
      
      // Se foi explicitamente definido como array vazio, não permitir nenhum
      if (Array.isArray(establishmentIds) && establishmentIds.length === 0) {
        console.log(`❌ Template ${template.id}: array vazio [] - NEGADO`);
        return false;
      }
      
      // Se for string JSON vazia, não permitir
      if (typeof establishmentIds === 'string' && (establishmentIds.trim() === '' || establishmentIds === '[]')) {
        console.log(`❌ Template ${template.id}: string vazia - NEGADO`);
        return false;
      }
      
      // Se há restrição com valores, verificar se o establishment_id está na lista
      if (Array.isArray(establishmentIds)) {
        const isIncluded = establishmentIds.includes(establishmentId);
        console.log(`🔍 Template ${template.id}: array com valores - ${isIncluded ? 'PERMITIDO' : 'NEGADO'}`);
        return isIncluded;
      }
      
      // Se for string JSON, tentar parsear
      try {
        const parsed = typeof establishmentIds === 'string' ? JSON.parse(establishmentIds) : establishmentIds;
        if (Array.isArray(parsed)) {
          // Se parseou como array vazio, não permitir
          if (parsed.length === 0) {
            console.log(`❌ Template ${template.id}: parseado como array vazio - NEGADO`);
            return false;
          }
          const isIncluded = parsed.includes(establishmentId);
          console.log(`🔍 Template ${template.id}: parseado com valores - ${isIncluded ? 'PERMITIDO' : 'NEGADO'}`);
          return isIncluded;
        }
      } catch (e) {
        // Se não conseguir parsear, assumir que não há restrição (comportamento padrão)
        console.log(`⚠️ Template ${template.id}: erro ao parsear - PERMITIDO (padrão)`);
        return true;
      }
      
      console.log(`❌ Template ${template.id}: caso não tratado - NEGADO`);
      return false;
    });
    
    if (filteredTemplates.length === 0) {
      console.warn(`⚠️ Template não encontrado para evento: ${eventType} e estabelecimento: ${establishmentId}`);
      return null;
    }
    
    // Retornar o template mais recente (já ordenado por updated_at)
    return filteredTemplates[0];
  }
  
  // Se não há establishment_id, retornar o primeiro template encontrado
  const { data: templates, error } = await templatesQuery.limit(1);
  
  if (error) {
    console.warn(`⚠️ Erro ao buscar template para evento: ${eventType}`, error);
      return null;
    }

    if (!templates || templates.length === 0) {
      console.warn(`⚠️ Template não encontrado para evento: ${eventType}`);
      return null;
    }

  return templates[0];
}

/**
 * Envia e-mail com link de pagamento de orçamento
 */
export async function sendQuotePaymentLinkEmail(
  quote: any,
  paymentLink: string
): Promise<string | null> {
  try {
    console.log('📧 Enviando e-mail de link de pagamento para orçamento:', { quoteId: quote.id, quoteCode: quote.quote_code });
    
    // Verificar se o sistema de e-mail está habilitado para o estabelecimento
    if (quote?.establishment_id) {
      const { data: siteSettingsFeatureFlag } = await supabase
        .from('site_settings')
        .select('features_enabled')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
        
      const { isFeatureEnabledForEstablishment } = await import('@/lib/featureAccess');
      const isEmailEnabled = isFeatureEnabledForEstablishment(
        siteSettingsFeatureFlag?.features_enabled?.email,
        quote.establishment_id
      );
      
      if (!isEmailEnabled) {
        console.warn('⚠️ Sistema de e-mail está desabilitado para este estabelecimento. E-mail não será enviado.');
        return null;
      }
    }
    
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas. E-mail não será enviado.');
      return null;
    }
    
    // Verificar se há email do destinatário
    const recipientEmail = quote.guest_email;
    if (!recipientEmail) {
      console.warn('⚠️ E-mail do destinatário não encontrado para o orçamento:', quote.id);
      return null;
    }
    
    // Buscar template ativo para o evento
    const template = await findEmailTemplate('quote.payment_link', quote?.establishment_id);
    
    if (!template) {
      console.warn('⚠️ Template de e-mail não encontrado para evento: quote.payment_link');
      return null;
    }
    
    // Buscar dados adicionais necessários
    const { data: establishment, error: establishmentError } = await supabase
      .from('establishments')
      .select('name')
      .eq('id', quote.establishment_id)
      .maybeSingle();
    
    if (establishmentError) {
      console.warn('⚠️ Erro ao buscar estabelecimento:', establishmentError);
    }
    
    const { data: hotelSettings, error: hotelSettingsError } = await supabase
      .from('hotel_settings')
      .select('*')
      .eq('establishment_id', quote.establishment_id)
      .maybeSingle();
    
    if (hotelSettingsError) {
      console.warn('⚠️ Erro ao buscar configurações do hotel:', hotelSettingsError);
    }
    
    const { data: category, error: categoryError } = await supabase
      .from('room_categories')
      .select('name')
      .eq('id', quote.category_id)
      .maybeSingle();
    
    if (categoryError) {
      console.warn('⚠️ Erro ao buscar categoria:', categoryError);
    }
    
    let room = null;
    if (quote.room_id) {
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .select('room_number, name')
        .eq('id', quote.room_id)
        .maybeSingle();
      
      if (roomError) {
        console.warn('⚠️ Erro ao buscar quarto:', roomError);
      } else {
        room = roomData;
      }
    }
    
    const { data: siteSettings } = await supabase
      .from('site_settings')
      .select('pms_base_url')
      .eq('id', '00000000-0000-0000-0000-000000000001')
      .maybeSingle();
    
    // Construir endereço completo do hotel
    const addressParts: string[] = [];
    if (hotelSettings?.street) {
      let streetLine = hotelSettings.street;
      if (hotelSettings.number) {
        streetLine += `, ${hotelSettings.number}`;
      }
      addressParts.push(streetLine);
    }
    if (hotelSettings?.neighborhood) {
      addressParts.push(hotelSettings.neighborhood);
    }
    if (hotelSettings?.city) {
      let cityLine = hotelSettings.city;
      if (hotelSettings.state) {
        cityLine += ` - ${hotelSettings.state}`;
      }
      if (hotelSettings.zip_code) {
        cityLine += ` - CEP: ${hotelSettings.zip_code}`;
      }
      addressParts.push(cityLine);
    }
    const hotelAddress = addressParts.length > 0 ? addressParts.join(', ') : '';
    
    // Construir telefone completo
    const hotelPhone = hotelSettings?.phone 
      || (hotelSettings?.phone_ddi && hotelSettings?.phone_number
        ? `${hotelSettings.phone_ddi} ${hotelSettings.phone_number}`
        : hotelSettings?.phone_number || '');
    
    // Formatar valor total
    const totalAmount = quote.total_amount?.toFixed(2).replace('.', ',') || '0,00';
    
    // Formatar datas - evitar problemas de timezone manipulando apenas strings
    // O PostgreSQL retorna datas no formato YYYY-MM-DD (sem hora)
    const formatQuoteDate = (dateString: string | null | undefined): string => {
      if (!dateString) return '';
      
      // Se já estiver no formato correto (DD/MM/YYYY), retornar como está
      if (dateString.includes('/')) return dateString;
      
      // Formato esperado: YYYY-MM-DD ou YYYY-MM-DDTHH:mm:ss.sssZ
      // Pegar apenas a parte da data (antes do T se houver)
      const dateOnly = dateString.split('T')[0];
      const parts = dateOnly.split('-');
      
      if (parts.length === 3) {
        // Formato: YYYY-MM-DD -> DD/MM/YYYY (sem conversão de timezone)
        // Isso evita problemas de timezone porque não usa new Date()
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
      
      // Fallback: tentar usar Date com UTC para evitar problemas de timezone
      try {
        // Adicionar hora do meio-dia UTC para evitar problemas de timezone
        const date = new Date(dateString + 'T12:00:00Z');
        return date.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' });
      } catch {
        return dateString;
      }
    };
    
    const checkinDate = formatQuoteDate(quote.checkin_date);
    const checkoutDate = formatQuoteDate(quote.checkout_date);
    
    // Logo do hotel
    const hotelLogo = hotelSettings?.logo_url || hotelSettings?.logo || '';
    
    // URL base do PMS
    let baseUrl = siteSettings?.pms_base_url || null;
    if (!baseUrl) {
      baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : (process.env.VITE_APP_URL || 'http://localhost:8080');
    }
    
    // Variáveis do template
    const variables: TemplateVariables = {
      quote_code: quote.quote_code || '',
      guest_name: quote.guest_name || 'Hóspede',
      hotel_name: establishment?.name || hotelSettings?.name || 'Hotel',
      hotel_logo: hotelLogo,
      logo_url: hotelLogo,
      category_name: category?.name || '',
      room_number: room?.room_number || '',
      checkin_date: checkinDate,
      checkout_date: checkoutDate,
      adults: quote.adults?.toString() || '1',
      children: quote.children?.toString() || '0',
      total_amount: totalAmount,
      payment_link: paymentLink,
      expiration_date: quote.expiration_date ? formatQuoteDate(quote.expiration_date) : '',
      notes: quote.notes || '',
      hotel_email: hotelSettings?.email || '',
      hotel_phone: hotelPhone,
      hotel_address: hotelAddress,
      hotel_website: hotelSettings?.website || '',
    };
    
    // Processar template
    const subject = processTemplate(template.subject, variables);
    const bodyHtml = processTemplate(template.body_html, variables);
    
    // Adicionar à fila (incluindo CC e BCC do template)
    const ccEmails = template.cc_emails?.trim() || undefined;
    const bccEmails = template.bcc_emails?.trim() || undefined;
    
    const queueId = await queueEmail({
      template_id: template.id,
      event_type: 'quote.payment_link',
      recipient_email: recipientEmail,
      recipient_name: quote.guest_name,
      subject,
      body_html: bodyHtml,
      variables,
      cc_emails: ccEmails,
      bcc_emails: bccEmails,
    });
    
    if (!queueId) {
      console.error('❌ Erro ao adicionar e-mail à fila');
      return null;
    }
    
    console.log('✅ E-mail de link de pagamento adicionado à fila:', { queueId });
    
    // Processar imediatamente após adicionar à fila
    try {
      const success = await processEmailQueue(queueId);
      if (success) {
        console.log('✅ E-mail de link de pagamento enviado com sucesso:', { queueId });
      } else {
        console.warn('⚠️ E-mail adicionado à fila mas não foi enviado:', { queueId });
      }
    } catch (processError) {
      console.error('❌ Erro ao processar e-mail da fila:', processError);
      // Não retornar null aqui, pois o e-mail já está na fila e pode ser processado depois
    }
    
    // Atualizar status do orçamento para 'sent'
    await supabase
      .from('quotes')
      .update({ 
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', quote.id);
    
    return queueId;
  } catch (error) {
    console.error('❌ Erro ao enviar e-mail de link de pagamento:', error);
    return null;
  }
}

export async function triggerEmail(
  eventType: 'reservation.created' | 'reservation.multiple.created' | 'reservation.imported' | 'reservation.cancelled' | 'payment.confirmed' | 'payment.pending' | 'checkin.confirmed' | 'reservation.extended' | 'reservation.overbooking' | 'guest.password_reset' | 'fiscal_document.request' | 'employee.added_to_establishment' | 'checkout.reminder' | 'checkin.reception.notification' | 'checkout.completed' | 'preregistration.expired' | 'reservation.modified' | 'quote.payment_link',
  reservation: any,
  additionalVariables?: TemplateVariables,
  customRecipientEmail?: string
): Promise<string | null> {
  try {
    console.log(`📧 Disparando e-mail para evento: ${eventType}`, { reservationId: reservation?.id });
    
    // Verificar se o sistema de e-mail está habilitado para o estabelecimento
    if (reservation?.establishment_id) {
      const { data: siteSettingsFeatureFlag } = await supabase
        .from('site_settings')
        .select('features_enabled')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      
      const { isFeatureEnabledForEstablishment } = await import('@/lib/featureAccess');
      const isEmailEnabled = isFeatureEnabledForEstablishment(
        siteSettingsFeatureFlag?.features_enabled?.email,
        reservation.establishment_id
      );
      
      if (!isEmailEnabled) {
        console.warn('⚠️ Sistema de e-mail está desabilitado para este estabelecimento. E-mail não será enviado.');
        return null;
      }
    }
    
    // Verificar se as configurações de e-mail estão ativas
    const settings = await getEmailSettings();
    if (!settings || !settings.is_active) {
      console.warn('⚠️ Configurações de e-mail não encontradas ou inativas. E-mail não será enviado.');
      return null;
    }
    console.log('✅ Configurações de e-mail ativas:', { provider: settings.provider });
    
    // Buscar template ativo para o evento com filtro de estabelecimento
    const template = await findEmailTemplate(eventType, reservation?.establishment_id);
    
    if (!template) {
      return null;
    }
    
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
    // IMPORTANTE: Incluir reservation_service_fees para calcular valor total correto
    const { data: fullReservation, error: reservationError } = await supabase
      .from('reservations')
      .select(`
        *,
        financial_responsible:clients!client_id(*),
        guest:clients!guest_id(*),
        rooms (id, room_number, name, fixed_password, authentication_type),
        room_categories (id, name, description, building_id),
        reservation_service_fees (amount, quantity),
        ota_reservations(ota_guest_email, ota_guest_name)
      `)
      .eq('id', reservation.id || reservation)
      .single();

    if (reservationError || !fullReservation) {
      console.error('❌ Erro ao buscar reserva:', reservationError);
      return null;
    }
    const otaContact = reservationGuestContactFields(fullReservation);
    console.log('✅ Reserva encontrada:', { 
      reservationId: fullReservation.id,
      hasFinancialResponsible: !!fullReservation.financial_responsible,
      hasGuest: !!fullReservation.guest,
      financialResponsibleEmail: fullReservation.financial_responsible?.email,
      guestEmail: fullReservation.guest?.email,
      otaGuestEmail: otaContact.email
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
    
    // IMPORTANTE: Se o evento for checkout.completed, gerar review_link e adicionar às variáveis
    // Isso garante que o review_link esteja disponível quando o template for processado
    if (eventType === 'checkout.completed' && !processedAdditionalVariables.review_link) {
      // Verificar se o feature flag de avaliações está habilitado para este estabelecimento
      const { data: siteSettingsFeatureFlag } = await supabase
        .from('site_settings')
        .select('features_enabled')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();
      
      const { isFeatureEnabledForEstablishment } = await import('@/lib/featureAccess');
      const isStayReviewsEnabled = isFeatureEnabledForEstablishment(
        siteSettingsFeatureFlag?.features_enabled?.stay_reviews,
        fullReservation.establishment_id
      );
      
      if (isStayReviewsEnabled) {
        // Gerar link de avaliação
        const baseUrl = typeof window !== 'undefined' 
          ? window.location.origin 
          : (import.meta.env.VITE_APP_URL || 'http://localhost:8080');
        
        // Buscar locator da reserva (identification_number ou reservation_code)
        // Pode estar em fullReservation ou precisar buscar de web_checkin
        let locator = fullReservation.identification_number || fullReservation.reservation_code;
        
        // Se não tiver identification_number, tentar buscar de web_checkin
        if (!fullReservation.identification_number) {
          const { data: webCheckin } = await supabase
            .from('web_checkin')
            .select('locator')
            .eq('reservation_id', fullReservation.id)
            .maybeSingle();
          
          if (webCheckin?.locator) {
            locator = webCheckin.locator;
          }
        }
        
        if (locator) {
          const reviewLink = `${baseUrl}/review/${locator}`;
          processedAdditionalVariables.review_link = reviewLink;
          console.log('✅ review_link gerado e adicionado às variáveis no triggerEmail:', reviewLink);
        } else {
          console.warn('⚠️ Não foi possível gerar review_link: locator não encontrado');
        }
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

    const { email: recipientEmail, name: recipientName } = resolveReservationRecipient(
      fullReservation,
      customRecipientEmail
    );

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

