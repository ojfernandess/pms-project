import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("=== send-checkout-reminders Edge Function iniciada ===");
    console.log("Method:", req.method);
    console.log("URL:", req.url);

    // Criar cliente Supabase com service role key para bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("❌ Variáveis de ambiente não configuradas");
      return new Response(
        JSON.stringify({ error: "Configuração do Supabase não encontrada" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Obter parâmetros da requisição
    // Suporta tanto GET (query params) quanto POST (body)
    const url = new URL(req.url);
    let daysBeforeCheckout = 1;
    let establishmentId: string | undefined = undefined;

    if (req.method === "GET") {
      // Parâmetros via query string (mais fácil para cron-job.org)
      daysBeforeCheckout = parseInt(url.searchParams.get("days") || "1", 10);
      establishmentId = url.searchParams.get("establishment_id") || undefined;
    } else if (req.method === "POST") {
      // Parâmetros via body JSON
      try {
        const body = await req.json().catch(() => ({}));
        daysBeforeCheckout = parseInt(body.days || url.searchParams.get("days") || "1", 10);
        establishmentId = body.establishment_id || url.searchParams.get("establishment_id") || undefined;
      } catch {
        // Se não conseguir parsear JSON, usar query params como fallback
        daysBeforeCheckout = parseInt(url.searchParams.get("days") || "1", 10);
        establishmentId = url.searchParams.get("establishment_id") || undefined;
      }
    }

    console.log("📋 Parâmetros:", {
      daysBeforeCheckout,
      establishmentId: establishmentId || "todos",
    });

    // Calcular data alvo (checkout_date - daysBeforeCheckout)
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBeforeCheckout);
    const targetDateStr = targetDate.toISOString().split("T")[0]; // YYYY-MM-DD

    console.log(`🔍 Verificando reservas com check-out em ${daysBeforeCheckout} dia(s) (${targetDateStr})...`);

    // Buscar reservas com check-out na data alvo
    let query = supabase
      .from("reservations")
      .select(
        `
        id,
        checkout_date,
        status,
        establishment_id,
        identification_number,
        reservation_code,
        guest_id,
        client_id,
        financial_responsible:clients!client_id(id, email, full_name),
        guest:clients!guest_id(id, email, full_name),
        rooms(id, room_number, name),
        room_categories(id, name, description, building_id)
      `
      )
      .eq("status", "confirmed") // Apenas reservas confirmadas
      .gte("checkout_date", targetDateStr) // checkout_date >= targetDate
      .lt(
        "checkout_date",
        new Date(
          new Date(targetDateStr).getTime() + 24 * 60 * 60 * 1000
        )
          .toISOString()
          .split("T")[0]
      ); // checkout_date < targetDate + 1 dia

    if (establishmentId) {
      query = query.eq("establishment_id", establishmentId);
    }

    const { data: reservations, error: reservationsError } = await query;

    if (reservationsError) {
      console.error("❌ Erro ao buscar reservas:", reservationsError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar reservas", details: reservationsError }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!reservations || reservations.length === 0) {
      console.log("ℹ️ Nenhuma reserva encontrada com check-out próximo");
      return new Response(
        JSON.stringify({
          success: true,
          sent: 0,
          errors: 0,
          message: "Nenhuma reserva encontrada",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`📋 Encontradas ${reservations.length} reserva(s) com check-out próximo`);

    // Verificar se as configurações de e-mail estão ativas
    const { data: emailSettings, error: settingsError } = await supabase
      .from("email_settings")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    if (settingsError || !emailSettings) {
      console.warn("⚠️ Configurações de e-mail não encontradas ou inativas");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Configurações de e-mail não encontradas ou inativas",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Buscar template ativo para o evento
    const { data: templates, error: templateError } = await supabase
      .from("email_templates")
      .select("*")
      .eq("event_type", "checkout.reminder")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (templateError || !templates || templates.length === 0) {
      console.error("❌ Template não encontrado para evento: checkout.reminder");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Template de e-mail não encontrado",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const template = templates[0];
    console.log("✅ Template encontrado:", template.id);

    let sent = 0;
    let errors = 0;
    const errorsDetails: Array<{ reservation_id: string; error: string }> = [];

    // Processar cada reserva
    for (const reservation of reservations) {
      try {
        // Verificar se já foi enviado um lembrete hoje para esta reserva
        const today = new Date().toISOString().split("T")[0];
        const { data: existingEmail } = await supabase
          .from("email_queue")
          .select("id")
          .eq("reservation_id", reservation.id)
          .eq("event_type", "checkout.reminder")
          .gte("created_at", `${today}T00:00:00Z`)
          .limit(1);

        if (existingEmail && existingEmail.length > 0) {
          console.log(
            `⏭️ E-mail de lembrete já enviado hoje para reserva ${reservation.id}`
          );
          continue;
        }

        // Buscar configurações do hotel
        let hotelSettings: Record<string, unknown> | null = null;
        if (reservation.establishment_id) {
          const { data: settings } = await supabase
            .from("hotel_settings")
            .select("*")
            .eq("establishment_id", reservation.establishment_id)
            .maybeSingle();

          hotelSettings = settings as Record<string, unknown> | null;
        }

        // Buscar site settings para valores padrão
        const { data: siteSettings } = await supabase
          .from("site_settings")
          .select("*")
          .maybeSingle();

        // Determinar destinatário
        const recipientEmail =
          reservation.guest?.email || reservation.financial_responsible?.email;
        const recipientName =
          reservation.guest?.full_name ||
          reservation.financial_responsible?.full_name;

        if (!recipientEmail) {
          console.warn(
            `⚠️ E-mail do destinatário não encontrado para reserva ${reservation.id}`
          );
          errors++;
          errorsDetails.push({
            reservation_id: reservation.id,
            error: "E-mail do destinatário não encontrado",
          });
          continue;
        }

        // Gerar variáveis do template
        // Importar funções necessárias (simplificado para Edge Function)
        const checkinDate = reservation.checkin_date
          ? new Date(reservation.checkin_date).toLocaleDateString("pt-BR")
          : "";
        const checkoutDate = reservation.checkout_date
          ? new Date(reservation.checkout_date).toLocaleDateString("pt-BR")
          : "";

        const identificationNumber =
          reservation.identification_number || reservation.reservation_code || "";
        const identificationNumberFormatted = identificationNumber
          ? `#${identificationNumber}`
          : "";

        // Gerar link do web-checkin
        const baseUrl = Deno.env.get("VITE_APP_URL") || 
                       Deno.env.get("SITE_URL") || 
                       supabaseUrl.replace(/\.supabase\.co.*$/, "") || 
                       "http://localhost:8080";
        const webCheckinLink = identificationNumber
          ? `${baseUrl}/web-checkin/${identificationNumber}`
          : "";

        // Preparar variáveis do template (garantir todas as variáveis necessárias)
        const variables: Record<string, string> = {
          guest_name: recipientName || "Hóspede",
          guest_email: recipientEmail,
          reservation_code: reservation.reservation_code || "",
          identification_number: identificationNumberFormatted,
          checkin_date: checkinDate,
          checkout_date: checkoutDate,
          room_number: reservation.rooms?.room_number || "",
          room_name: reservation.rooms?.name || reservation.rooms?.room_number || "",
          hotel_name: (hotelSettings?.name as string) || (siteSettings?.site_title as string) || "Hotel",
          hotel_email: (hotelSettings?.email as string) || (siteSettings?.contact_email as string) || "",
          hotel_phone: (hotelSettings?.phone as string) || (siteSettings?.contact_phone as string) || "",
          hotel_whatsapp: (hotelSettings?.whatsapp as string) || "",
          hotel_address: (hotelSettings?.address as string) || "",
          hotel_website: (hotelSettings?.website as string) || (siteSettings?.site_url as string) || "",
          logo_url: (hotelSettings?.logo_url as string) || (siteSettings?.logo_url as string) || "",
          web_checkin_link: webCheckinLink,
        };

        // Processar template (simplificado - substituir variáveis)
        let subject = template.subject;
        let bodyHtml = template.body_html;

        Object.keys(variables).forEach((key) => {
          const value = variables[key as keyof typeof variables] || "";
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
          subject = subject.replace(regex, String(value));
          bodyHtml = bodyHtml.replace(regex, String(value));
        });

        // Adicionar à fila de e-mails
        const { data: queueItem, error: queueError } = await supabase
          .from("email_queue")
          .insert({
            template_id: template.id,
            event_type: "checkout.reminder",
            recipient_email: recipientEmail,
            recipient_name: recipientName,
            subject,
            body_html: bodyHtml,
            variables: variables,
            reservation_id: reservation.id,
            status: "pending",
            priority: 1, // Alta prioridade
          })
          .select("id")
          .single();

        if (queueError) {
          console.error(
            `❌ Erro ao adicionar e-mail à fila para reserva ${reservation.id}:`,
            queueError
          );
          errors++;
          errorsDetails.push({
            reservation_id: reservation.id,
            error: queueError.message,
          });
          continue;
        }

        console.log(
          `✅ E-mail adicionado à fila para reserva ${reservation.id} (queue_id: ${queueItem.id})`
        );

        // Processar e enviar o e-mail imediatamente
        try {
          const emailSent = await processEmailQueueImmediately(
            supabase,
            queueItem.id,
            emailSettings
          );
          if (emailSent) {
            console.log(
              `✅ E-mail enviado com sucesso para reserva ${reservation.id}`
            );
            sent++;
          } else {
            console.warn(
              `⚠️ E-mail adicionado à fila mas não foi enviado para reserva ${reservation.id}`
            );
            sent++; // Contar como enviado pois está na fila
          }
        } catch (processError: unknown) {
          const errorMessage = processError instanceof Error ? processError.message : "Erro desconhecido";
          console.error(
            `❌ Erro ao processar e-mail da fila para reserva ${reservation.id}:`,
            errorMessage
          );
          // Não contar como erro, pois o e-mail está na fila e será processado depois
          sent++;
        }
      } catch (error: unknown) {
        console.error(
          `❌ Erro ao processar reserva ${reservation.id}:`,
          error
        );
        errors++;
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
        errorsDetails.push({
          reservation_id: reservation.id,
          error: errorMessage,
        });
      }
    }

    console.log(
      `✅ Processamento concluído: ${sent} enviado(s), ${errors} erro(s)`
    );

    return new Response(
      JSON.stringify({
        success: true,
        sent,
        errors,
        total: reservations.length,
        errorsDetails: errors > 0 ? errorsDetails : undefined,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("❌ Erro geral na Edge Function:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Processa e envia um e-mail imediatamente após adicionar à fila
 */
async function processEmailQueueImmediately(
  supabase: SupabaseClient,
  queueItemId: string,
  emailSettings: any
): Promise<boolean> {
  try {
    // Buscar item da fila
    const { data: queueItem, error: fetchError } = await supabase
      .from("email_queue")
      .select("*")
      .eq("id", queueItemId)
      .maybeSingle();

    if (fetchError || !queueItem) {
      console.error("Erro ao buscar item da fila:", fetchError);
      return false;
    }

    // Atualizar status para "sending"
    await supabase
      .from("email_queue")
      .update({ status: "sending" })
      .eq("id", queueItemId);

    // Enviar e-mail baseado no provedor
    let success = false;

    try {
      switch (emailSettings.provider) {
        case "smtp":
          success = await sendViaSMTP(queueItem, emailSettings, supabase);
          break;
        case "sendgrid":
          success = await sendViaSendGrid(queueItem, emailSettings);
          break;
        case "mailgun":
          success = await sendViaMailgun(queueItem, emailSettings);
          break;
        case "resend":
          success = await sendViaResend(queueItem, emailSettings, supabase);
          break;
        default:
          throw new Error(`Provedor não suportado: ${emailSettings.provider}`);
      }

      if (success) {
        // Atualizar status para "sent"
        await supabase
          .from("email_queue")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", queueItemId);
        return true;
      } else {
        throw new Error("Erro ao enviar e-mail");
      }
    } catch (sendError: unknown) {
      const errorMsg = sendError instanceof Error ? sendError.message : "Erro ao enviar e-mail";
      const retryCount = (queueItem.retry_count || 0) + 1;
      const maxRetries = queueItem.max_retries || 3;

      if (retryCount >= maxRetries) {
        await supabase
          .from("email_queue")
          .update({
            status: "failed",
            error_message: errorMsg,
            retry_count: retryCount,
          })
          .eq("id", queueItemId);
      } else {
        await supabase
          .from("email_queue")
          .update({
            status: "pending",
            error_message: errorMsg,
            retry_count: retryCount,
          })
          .eq("id", queueItemId);
      }
      throw sendError;
    }
  } catch (error: unknown) {
    console.error("Erro ao processar e-mail:", error);
    return false;
  }
}

/**
 * Envia e-mail via Resend
 */
async function sendViaResend(
  queueItem: any,
  settings: any,
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    if (!settings.api_key) {
      throw new Error("API Key do Resend não configurada");
    }

    // Chamar Edge Function send-email-resend
    const { data, error } = await supabase.functions.invoke("send-email-resend", {
      body: {
        to: queueItem.recipient_email,
        to_name: queueItem.recipient_name || undefined,
        from: settings.sender_email,
        from_name: settings.sender_name || undefined,
        reply_to: settings.reply_to_email || settings.sender_email,
        subject: queueItem.subject,
        html: queueItem.body_html,
        text: queueItem.body_text || undefined,
        api_key: settings.api_key,
      },
    });

    if (error) {
      throw new Error(error.message || "Erro ao enviar via Resend");
    }

    return true;
  } catch (error: unknown) {
    console.error("Erro ao enviar via Resend:", error);
    throw error;
  }
}

/**
 * Envia e-mail via SendGrid
 */
async function sendViaSendGrid(queueItem: any, settings: any): Promise<boolean> {
  try {
    if (!settings.api_key) {
      throw new Error("API Key do SendGrid não configurada");
    }

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [
              {
                email: queueItem.recipient_email,
                name: queueItem.recipient_name || undefined,
              },
            ],
          },
        ],
        from: {
          email: settings.sender_email,
          name: settings.sender_name || undefined,
        },
        reply_to: {
          email: settings.reply_to_email || settings.sender_email,
        },
        subject: queueItem.subject,
        content: [
          { type: "text/html", value: queueItem.body_html },
          ...(queueItem.body_text
            ? [{ type: "text/plain", value: queueItem.body_text }]
            : []),
        ],
      }),
    });

    if (!response.ok) {
      const responseText = await response.text();
      let errorMessage = `Erro HTTP ${response.status}`;
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.errors?.[0]?.message || errorData.message || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      throw new Error(`Erro ao enviar via SendGrid: ${errorMessage}`);
    }

    return true;
  } catch (error: unknown) {
    console.error("Erro ao enviar via SendGrid:", error);
    throw error;
  }
}

/**
 * Envia e-mail via Mailgun
 */
async function sendViaMailgun(queueItem: any, settings: any): Promise<boolean> {
  try {
    if (!settings.api_key) {
      throw new Error("API Key do Mailgun não configurada");
    }

    const domain = settings.sender_email.split("@")[1];
    if (!domain) {
      throw new Error("Domínio do e-mail do remetente inválido");
    }

    const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`api:${settings.api_key}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        from: settings.sender_name
          ? `${settings.sender_name} <${settings.sender_email}>`
          : settings.sender_email,
        to: queueItem.recipient_email,
        subject: queueItem.subject,
        html: queueItem.body_html,
        ...(queueItem.body_text ? { text: queueItem.body_text } : {}),
        ...(settings.reply_to_email ? { "h:Reply-To": settings.reply_to_email } : {}),
      }).toString(),
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
      throw new Error(`Erro ao enviar via Mailgun: ${errorMessage}`);
    }

    return true;
  } catch (error: unknown) {
    console.error("Erro ao enviar via Mailgun:", error);
    throw error;
  }
}

/**
 * Envia e-mail via SMTP (usando Edge Function)
 */
async function sendViaSMTP(
  queueItem: any,
  settings: any,
  supabase: SupabaseClient
): Promise<boolean> {
  try {
    if (!settings.smtp_host || !settings.smtp_username || !settings.smtp_password) {
      throw new Error("Configurações SMTP incompletas");
    }

    const { data, error } = await supabase.functions.invoke("send-email-smtp", {
      body: {
        to: queueItem.recipient_email,
        to_name: queueItem.recipient_name,
        from: settings.sender_email,
        from_name: settings.sender_name,
        reply_to: settings.reply_to_email || settings.sender_email,
        subject: queueItem.subject,
        html: queueItem.body_html,
        text: queueItem.body_text,
        smtp_config: {
          host: settings.smtp_host,
          port: settings.smtp_port,
          secure: settings.smtp_secure,
          auth: {
            user: settings.smtp_username,
            pass: settings.smtp_password,
          },
        },
      },
    });

    if (error) {
      throw new Error(error.message || "Erro ao enviar via SMTP");
    }

    return true;
  } catch (error: unknown) {
    console.error("Erro ao enviar via SMTP:", error);
    throw error;
  }
}

