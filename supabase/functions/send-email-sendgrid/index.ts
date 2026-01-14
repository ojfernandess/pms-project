// Edge Function para enviar e-mails via SendGrid
// Funciona como proxy para evitar problemas de CORS

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  to_name?: string;
  from: string;
  from_name?: string;
  reply_to?: string;
  subject: string;
  html: string;
  text?: string;
  api_key: string;
  cc?: string[]; // Array de emails em cópia
  bcc?: string[]; // Array de emails em cópia oculta
}

serve(async (req) => {
  // Handle CORS preflight - IMPORTANTE: deve retornar 200 OK
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 200,
      headers: corsHeaders 
    });
  }

  try {
    // Nota: A autenticação é garantida pelo Supabase quando chamado via supabase.functions.invoke
    // Não precisamos verificar manualmente aqui, pois apenas usuários autenticados podem chamar

    // Parse do body
    let emailData: EmailRequest;
    try {
      emailData = await req.json();
    } catch (parseError: any) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid JSON in request body",
          details: parseError.message || "Erro ao processar JSON do corpo da requisição",
          hint: "Verifique se os dados estão sendo enviados corretamente"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    
    // Log para debug (remover em produção se necessário)
    console.log("Received email data:", {
      to: emailData.to,
      from: emailData.from,
      subject: emailData.subject,
      hasHtml: !!emailData.html,
      hasApiKey: !!emailData.api_key,
      cc: emailData.cc || [],
      bcc: emailData.bcc || [],
      cc_count: emailData.cc?.length || 0,
      bcc_count: emailData.bcc?.length || 0,
    });

    // Validar dados obrigatórios com mensagens mais detalhadas
    const missingFields = [];
    if (!emailData.to) missingFields.push("to (destinatário)");
    if (!emailData.from) missingFields.push("from (remetente)");
    if (!emailData.subject) missingFields.push("subject (assunto)");
    if (!emailData.html) missingFields.push("html (corpo do e-mail)");
    
    if (missingFields.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: "Missing required fields",
          details: `Campos obrigatórios faltando: ${missingFields.join(", ")}`,
          hint: "Verifique se todos os dados foram enviados corretamente"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!emailData.api_key || emailData.api_key.trim() === "") {
      return new Response(
        JSON.stringify({ 
          error: "Missing API Key",
          details: "API Key do SendGrid é obrigatória",
          hint: "Configure a API Key nas configurações de e-mail do PMS"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Preparar personalizations do SendGrid
    const personalizations: any = {
      to: [{ email: emailData.to, name: emailData.to_name || undefined }],
    };
    
    // Adicionar CC se houver
    if (emailData.cc && emailData.cc.length > 0) {
      personalizations.cc = emailData.cc.map(email => ({ email }));
      console.log("SendGrid - CC adicionado:", personalizations.cc);
    }
    
    // Adicionar BCC se houver
    if (emailData.bcc && emailData.bcc.length > 0) {
      personalizations.bcc = emailData.bcc.map(email => ({ email }));
      console.log("SendGrid - BCC adicionado:", personalizations.bcc);
    }

    // Preparar payload do SendGrid
    const sendgridPayload = {
      personalizations: [personalizations],
      from: { 
        email: emailData.from, 
        name: emailData.from_name || undefined 
      },
      reply_to: { 
        email: emailData.reply_to || emailData.from 
      },
      subject: emailData.subject,
      content: [
        { type: "text/html", value: emailData.html },
        ...(emailData.text ? [{ type: "text/plain", value: emailData.text }] : []),
      ],
    };

    console.log("SendGrid - Payload completo:", JSON.stringify(sendgridPayload, null, 2));

    // Enviar e-mail via API do SendGrid
    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${emailData.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sendgridPayload),
      });

      const responseText = await response.text();
      let responseData: any = {};
      
      try {
        responseData = JSON.parse(responseText);
      } catch {
        // Se não for JSON, usar o texto como resposta
        responseData = { message: responseText };
      }

      if (!response.ok) {
        const errorMessage = responseData.errors?.[0]?.message || responseData.message || `Erro HTTP ${response.status}`;
        
        let hint = '';
        if (response.status === 401 || response.status === 403) {
          hint = 'API Key inválida ou sem permissão. Verifique sua API Key no SendGrid.';
        } else if (response.status === 400) {
          hint = 'Dados inválidos. Verifique o e-mail do remetente (deve ser de domínio verificado no SendGrid) e destinatário.';
        } else if (response.status === 429) {
          hint = 'Limite de envio excedido. Verifique seu plano no SendGrid.';
        }

        return new Response(
          JSON.stringify({ 
            error: "Failed to send email via SendGrid",
            details: errorMessage,
            hint: hint
          }),
          {
            status: response.status,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Email sent successfully via SendGrid"
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (fetchError: any) {
      console.error("SendGrid API Error:", fetchError);
      return new Response(
        JSON.stringify({ 
          error: "Failed to send email via SendGrid",
          details: fetchError.message || fetchError.toString()
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Internal server error",
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

