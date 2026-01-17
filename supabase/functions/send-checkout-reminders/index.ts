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
        checkin_date,
        checkout_date,
        status,
        establishment_id,
        identification_number,
        reservation_code,
        guest_id,
        client_id,
        financial_responsible:clients!client_id(id, email, full_name),
        guest:clients!guest_id(id, email, full_name),
        rooms(id, room_number, name, category_id, room_categories!category_id(id, name, description, building_id))
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

        // Buscar site settings para valores padrão (incluindo pms_base_url)
        const { data: siteSettings } = await supabase
          .from("site_settings")
          .select("*, pms_base_url")
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
          ? new Date(reservation.checkin_date).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })
          : "";
        const checkoutDate = reservation.checkout_date
          ? new Date(reservation.checkout_date).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })
          : "";

        // Priorizar identification_number, se não existir, usar reservation_code
        const identificationNumber = reservation.identification_number || "";
        const reservationCode = reservation.reservation_code || "";
        const identificationNumberFormatted = identificationNumber
          ? `#${identificationNumber}`
          : reservationCode
          ? reservationCode
          : "";

        // Gerar link do web-checkin (usar reservation_code como prioridade para o link)
        // O link deve usar reservation_code (ex: RSV742516) e não identification_number
        
        // Detectar URL base automaticamente (ordem de prioridade):
        // 1. site_settings.pms_base_url (URL base do PMS - prioridade máxima)
        // 2. Headers da requisição (Origin, Referer, X-Forwarded-Host)
        // 3. Variáveis de ambiente (VERCEL_URL, SITE_URL, etc.)
        // 4. hotel_settings.website (URL do site do estabelecimento - não usar para links do PMS)
        // 5. site_settings.site_url (URL do site - não usar para links do PMS)
        // 6. Fallback para localhost
        let baseUrl = "";
        let urlSource = "";
        
        // 1. Priorizar pms_base_url de site_settings (URL base do PMS)
        if (siteSettings && siteSettings.pms_base_url) {
          const pmsUrl = (siteSettings.pms_base_url as string).trim();
          if (pmsUrl) {
            try {
              // Garantir que tenha protocolo
              const url = new URL(pmsUrl.startsWith('http://') || pmsUrl.startsWith('https://') ? pmsUrl : `https://${pmsUrl}`);
              baseUrl = url.origin;
              urlSource = "site_settings-pms_base_url";
              console.log("🌐 URL base do PMS obtida de site_settings.pms_base_url:", baseUrl);
            } catch {
              // Se falhar, usar como está
              baseUrl = pmsUrl;
              urlSource = "site_settings-pms_base_url";
              console.log("🌐 URL base do PMS obtida de site_settings.pms_base_url (como está):", baseUrl);
            }
          }
        }
        
        // 2. Se não tem pms_base_url, tentar obter dos headers da requisição
        try {
          const origin = req.headers.get("origin");
          const referer = req.headers.get("referer");
          const forwardedHost = req.headers.get("x-forwarded-host");
          const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
          
          // Tentar Origin primeiro
          if (origin && !origin.includes(".supabase.co") && 
              !origin.includes("localhost") && 
              !origin.includes("127.0.0.1")) {
            baseUrl = origin.replace(/\/$/, "");
            urlSource = "request-origin-header";
            console.log("🌐 URL base detectada do header Origin:", baseUrl);
          }
          // Se não tem Origin, tentar Referer
          else if (referer && !baseUrl) {
            try {
              const refererUrl = new URL(referer);
              if (!refererUrl.hostname.includes(".supabase.co") &&
                  !refererUrl.hostname.includes("localhost") &&
                  !refererUrl.hostname.includes("127.0.0.1")) {
                baseUrl = `${refererUrl.protocol}//${refererUrl.hostname}${refererUrl.port ? `:${refererUrl.port}` : ""}`;
                urlSource = "request-referer-header";
                console.log("🌐 URL base detectada do header Referer:", baseUrl);
              }
            } catch (e) {
              // Ignorar erro de parsing
            }
          }
          // Se não tem Origin nem Referer, tentar X-Forwarded-Host
          else if (forwardedHost && !baseUrl) {
            if (!forwardedHost.includes(".supabase.co") &&
                !forwardedHost.includes("localhost") &&
                !forwardedHost.includes("127.0.0.1")) {
              baseUrl = `${forwardedProto}://${forwardedHost}`;
              urlSource = "request-forwarded-host-header";
              console.log("🌐 URL base detectada do header X-Forwarded-Host:", baseUrl);
            }
          }
        } catch (e) {
          console.log("⚠️ Erro ao processar headers da requisição:", e);
        }
        
        // 3. Se ainda não tem, tentar variáveis de ambiente de plataformas
        if (!baseUrl) {
          // Vercel
          const vercelUrl = Deno.env.get("VERCEL_URL");
          if (vercelUrl) {
            baseUrl = `https://${vercelUrl}`;
            urlSource = "environment-vercel";
            console.log("🌐 URL base obtida de VERCEL_URL:", baseUrl);
          }
          // Render
          else {
            const renderUrl = Deno.env.get("RENDER_EXTERNAL_URL");
            if (renderUrl) {
              baseUrl = renderUrl;
              urlSource = "environment-render";
              console.log("🌐 URL base obtida de RENDER_EXTERNAL_URL:", baseUrl);
            }
            // Outras variáveis de ambiente
            else {
              const envUrl = Deno.env.get("VITE_APP_URL") || Deno.env.get("SITE_URL") || "";
              if (envUrl && !envUrl.includes(".supabase.co") && 
                  envUrl.trim() !== "" &&
                  (envUrl.startsWith("http://") || envUrl.startsWith("https://"))) {
                baseUrl = envUrl.replace(/\/$/, "");
                urlSource = "environment-variable";
                console.log("🌐 URL base obtida de variáveis de ambiente:", baseUrl);
              }
            }
          }
        }
        
        // 4. Fallback para localhost se ainda não tem
        if (!baseUrl || baseUrl.includes(".supabase.co") || baseUrl.trim() === "") {
          // Verificar se SUPABASE_URL contém localhost para detectar ambiente
          const supabaseUrlEnv = Deno.env.get("SUPABASE_URL") || "";
          if (supabaseUrlEnv.includes("localhost") || supabaseUrlEnv.includes("127.0.0.1")) {
            baseUrl = "http://localhost:8080";
            urlSource = "fallback-localhost";
            console.log("🌐 URL base usando localhost (ambiente de desenvolvimento detectado)");
          } else {
            baseUrl = "http://localhost:8080";
            urlSource = "fallback-localhost";
            console.log("⚠️ URL base usando fallback (localhost) - configure pms_base_url em site_settings");
          }
        }
        
        // Para o link, sempre usar reservation_code se disponível, senão identification_number
        const locatorForLink = reservationCode || identificationNumber || "";
        const webCheckinLink = locatorForLink
          ? `${baseUrl}/web-checkin/${locatorForLink}`
          : "";
        
        // Gerar link de políticas (priorizar prédio, senão estabelecimento)
        // O building_id vem através de rooms -> room_categories
        const firstRoomCategory = firstRoom?.room_categories;
        const buildingId = firstRoomCategory?.building_id || null;
        const establishmentId = reservation.establishment_id || null;
        
        const generatePoliciesLink = (type: 'establishment' | 'building', id: string | null | undefined): string => {
          if (!id) return '';
          try {
            const tokenData = `${type}:${id}`;
            const token = btoa(tokenData);
            // Criar URL amigável usando o nome do hotel como slug
            const hotelName = (hotelSettings?.name as string) || 'hotel';
            // Criar slug simples (remover acentos, espaços, caracteres especiais)
            const slug = hotelName
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '') // Remove acentos
              .replace(/[^a-z0-9]+/g, '-') // Substitui não-alfanuméricos por hífen
              .replace(/^-+|-+$/g, ''); // Remove hífens no início/fim
            // URL amigável: /policies/{slug}/{token}
            return `${baseUrl}/policies/${slug}/${token}`;
          } catch {
            return '';
          }
        };
        
        const policiesLink = buildingId 
          ? generatePoliciesLink('building', buildingId)
          : generatePoliciesLink('establishment', establishmentId);
        
        console.log("🔗 Links gerados:", {
          baseUrl,
          urlSource,
          locatorForLink,
          webCheckinLink,
          policiesLink,
          hasReservationCode: !!reservationCode,
          hasIdentificationNumber: !!identificationNumber,
          buildingId: buildingId || "não disponível",
          establishmentId: establishmentId || "não disponível",
          headers: {
            origin: req.headers.get("origin") || "não disponível",
            referer: req.headers.get("referer") ? "disponível" : "não disponível",
            forwardedHost: req.headers.get("x-forwarded-host") || "não disponível",
          },
          hotelSettingsWebsite: hotelSettings?.website || "não configurado",
          siteSettingsPmsBaseUrl: siteSettings?.pms_base_url || "não configurado",
        });

        // Preparar variáveis do template (garantir todas as variáveis necessárias)
        // Nota: Para condicionais {{#if}}, a variável precisa existir e não estar vazia
        
        // rooms pode ser um array, pegar o primeiro item
        const firstRoom = Array.isArray(reservation.rooms) && reservation.rooms.length > 0
          ? reservation.rooms[0]
          : (reservation.rooms as any);
        
        const variables: Record<string, string> = {
          guest_name: recipientName || "Hóspede",
          guest_email: recipientEmail,
          reservation_code: reservationCode,
          identification_number: identificationNumberFormatted,
          checkin_date: checkinDate,
          checkout_date: checkoutDate,
          room_number: firstRoom?.room_number || "",
          room_name: firstRoom?.name || firstRoom?.room_number || "",
          // category_name vem de room_categories através da relação do quarto
          category_name: firstRoom?.room_categories?.name || "",
          hotel_name: (hotelSettings?.name as string) || (siteSettings?.site_title as string) || "Hotel",
          hotel_email: (hotelSettings?.email as string) || (siteSettings?.contact_email as string) || "",
          hotel_phone: (hotelSettings?.phone as string) || (siteSettings?.contact_phone as string) || "",
          hotel_whatsapp: (hotelSettings?.whatsapp as string) || "",
          hotel_address: (hotelSettings?.address as string) || "",
          hotel_website: (hotelSettings?.website as string) || (siteSettings?.site_url as string) || "",
          logo_url: (hotelSettings?.logo_url as string) || (siteSettings?.logo_url as string) || "",
          web_checkin_link: webCheckinLink,
          policies_link: policiesLink,
        };

        // Processar template (suporta Handlebars simples)
        let subject = template.subject;
        let bodyHtml = template.body_html;

        // IMPORTANTE: Processar condicionais ANTES de substituir variáveis simples
        // Isso evita que variáveis dentro de condicionais sejam substituídas antes do processamento
        console.log("🔄 Processando condicionais Handlebars...");
        console.log("📋 Variáveis disponíveis:", Object.keys(variables).filter(k => variables[k] && variables[k].trim() !== "").join(", "));
        console.log("📋 Variáveis vazias:", Object.keys(variables).filter(k => !variables[k] || variables[k].trim() === "").join(", "));
        
        bodyHtml = processHandlebarsConditionals(bodyHtml, variables);
        subject = processHandlebarsConditionals(subject, variables);

        // Depois, substituir variáveis simples {{variavel}}
        console.log("🔄 Substituindo variáveis simples...");
        Object.keys(variables).forEach((key) => {
          const value = variables[key as keyof typeof variables] || "";
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
          const beforeSubject = subject;
          const beforeBody = bodyHtml;
          subject = subject.replace(regex, String(value));
          bodyHtml = bodyHtml.replace(regex, String(value));
          if (beforeSubject !== subject || beforeBody !== bodyHtml) {
            const displayValue = value.length > 50 ? value.substring(0, 50) + "..." : value;
            console.log(`  ✅ Substituído {{${key}}} = "${displayValue}"`);
          }
        });

        // Verificar se ainda há variáveis não processadas
        const remainingVars = bodyHtml.match(/\{\{(\w+)\}\}/g) || [];
        const remainingConditionals = bodyHtml.match(/\{\{#if|\{\{else\}}|\{\{\/if\}\}/g) || [];
        
        if (remainingVars.length > 0 || remainingConditionals.length > 0) {
          console.warn("⚠️ Variáveis/condicionais não processados:", {
            vars: remainingVars.slice(0, 10),
            conditionals: remainingConditionals.slice(0, 10),
          });
        } else {
          console.log("✅ Todas as variáveis e condicionais foram processados com sucesso!");
        }

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

/**
 * Processa condicionais Handlebars simples {{#if variavel}} ... {{/if}} e {{#if variavel}} ... {{else}} ... {{/if}}
 */
function processHandlebarsConditionals(template: string, variables: Record<string, string>): string {
  let result = template;
  let changed = true;
  let iterations = 0;
  const maxIterations = 20; // Aumentar limite para lidar com múltiplos condicionais

  // Processar condicionais em loop até não haver mais mudanças (para lidar com condicionais aninhados)
  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    // Processar {{#if variavel}} ... {{else}} ... {{/if}} (precisa processar antes do if simples)
    // Usar regex não-greedy (.*?) e garantir que captura até o {{/if}} correspondente
    const ifElsePattern = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
    const beforeIfElse = result;
    result = result.replace(ifElsePattern, (match, varName, ifContent, elseContent) => {
      const value = variables[varName] || "";
      // Se a variável existe e não está vazia, retorna o conteúdo do if, senão retorna o else
      if (value && value.trim() !== "") {
        return ifContent;
      }
      return elseContent;
    });
    if (result !== beforeIfElse) {
      changed = true;
      console.log(`🔄 Processado if-else para: ${ifElsePattern.source}`);
    }

    // Processar {{#if variavel}} ... {{/if}}
    // IMPORTANTE: Processar de dentro para fora (condicionais aninhados)
    // Usar uma abordagem que processa do mais interno para o mais externo
    let ifPattern = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    let beforeIf = result;
    let tempResult = result;
    
    // Processar múltiplas vezes até não haver mais mudanças
    let innerIterations = 0;
    while (innerIterations < 10) {
      const beforeInner = tempResult;
      tempResult = tempResult.replace(ifPattern, (match, varName, content) => {
        // Verificar se o conteúdo ainda tem condicionais aninhados
        if (content.match(/\{\{#if\s+\w+\}\}/)) {
          // Se tem condicionais aninhados, não processar ainda
          return match;
        }
        
        const value = variables[varName] || "";
        // Se a variável existe e não está vazia, retorna o conteúdo
        if (value && value.trim() !== "") {
          console.log(`  ✅ Condicional if: ${varName} = "${value.substring(0, 30)}" -> mostrando conteúdo`);
          return content;
        }
        console.log(`  ✅ Condicional if: ${varName} = vazio -> removendo conteúdo`);
        return "";
      });
      
      if (tempResult === beforeInner) {
        break; // Não houve mudanças, sair do loop
      }
      innerIterations++;
    }
    
    result = tempResult;
    if (result !== beforeIf) {
      changed = true;
    }
  }

  if (iterations >= maxIterations) {
    console.warn("⚠️ Aviso: processamento de condicionais atingiu o limite de iterações");
  }

  // Verificar se ainda há condicionais não processados
  const remainingIf = (result.match(/\{\{#if\s+\w+\}\}/g) || []).length;
  const remainingEndIf = (result.match(/\{\{\/if\}\}/g) || []).length;
  const remainingElse = (result.match(/\{\{else\}\}/g) || []).length;
  
  if (remainingIf > 0 || remainingEndIf > 0 || remainingElse > 0) {
    console.warn(`⚠️ Ainda há condicionais não processados: #if=${remainingIf}, /if=${remainingEndIf}, else=${remainingElse}`);
    // Tentar uma última vez com uma abordagem mais agressiva - remover condicionais não processados
    result = result.replace(/\{\{#if\s+\w+\}\}[\s\S]*?\{\{\/if\}\}/g, "");
    result = result.replace(/\{\{else\}\}/g, "");
    result = result.replace(/\{\{\/if\}\}/g, "");
  }

  return result;
}

