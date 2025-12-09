// Edge Function para enviar e-mails via SMTP
// Supabase Edge Functions rodam em Deno

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
  cc?: string; // Emails em cópia, separados por vírgula
  bcc?: string; // Emails em cópia oculta, separados por vírgula
  smtp_config: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verificar autenticação básica
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse do body
    let emailData: EmailRequest;
    try {
      emailData = await req.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validar dados obrigatórios
    if (!emailData.to || !emailData.from || !emailData.subject || !emailData.html) {
      return new Response(
        JSON.stringify({ 
          error: "Missing required fields",
          details: "Required: to, from, subject, html"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!emailData.smtp_config?.host || !emailData.smtp_config?.auth?.user || !emailData.smtp_config?.auth?.pass) {
      return new Response(
        JSON.stringify({ 
          error: "Missing SMTP configuration",
          details: "Required: smtp_config.host, smtp_config.auth.user, smtp_config.auth.pass"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Usar biblioteca SMTP mais recente - tentar diferentes versões
    try {
      // Tentar usar a biblioteca smtp mais recente
      const smtpModule = await import("https://deno.land/x/smtp@v0.7.0/mod.ts");
      
      // Verificar se SmtpClient existe e como é exportado
      let SmtpClient: any;
      if (typeof smtpModule.SmtpClient === 'function') {
        SmtpClient = smtpModule.SmtpClient;
      } else if (typeof smtpModule.default === 'function') {
        SmtpClient = smtpModule.default;
      } else if (smtpModule.default && typeof smtpModule.default.SmtpClient === 'function') {
        SmtpClient = smtpModule.default.SmtpClient;
      } else {
        throw new Error("SmtpClient not found in smtp module");
      }
      
      const client = new SmtpClient();

      const smtpConfig = emailData.smtp_config;
      const port = smtpConfig.port || (smtpConfig.secure ? 465 : 587);

      // Preparar remetente
      const fromEmail = emailData.from_name 
        ? `${emailData.from_name} <${emailData.from}>`
        : emailData.from;

      // Preparar destinatário
      const toEmail = emailData.to_name 
        ? `${emailData.to_name} <${emailData.to}>`
        : emailData.to;

      // Processar CC e BCC
      const ccEmails = emailData.cc 
        ? emailData.cc.split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0)
        : [];
      const bccEmails = emailData.bcc 
        ? emailData.bcc.split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0)
        : [];

      console.log("SMTP - CC e BCC processados:", {
        cc: ccEmails,
        bcc: bccEmails,
        cc_count: ccEmails.length,
        bcc_count: bccEmails.length
      });

      // Conectar ao servidor SMTP
      if (smtpConfig.secure || port === 465) {
        // Conexão TLS direta (porta 465)
        await client.connectTLS({
          hostname: smtpConfig.host,
          port: port,
          username: smtpConfig.auth.user,
          password: smtpConfig.auth.pass,
        });
      } else {
        // Conexão normal (porta 587)
        await client.connect({
          hostname: smtpConfig.host,
          port: port,
          username: smtpConfig.auth.user,
          password: smtpConfig.auth.pass,
        });
      }

      // Preparar objeto de envio com CC e BCC
      const sendOptions: any = {
        from: fromEmail,
        to: toEmail,
        subject: emailData.subject,
        content: emailData.html,
        html: emailData.html,
        ...(emailData.text ? { text: emailData.text } : {}),
        ...(emailData.reply_to ? { replyTo: emailData.reply_to } : {}),
      };

      // Adicionar CC se houver
      if (ccEmails.length > 0) {
        sendOptions.cc = ccEmails.join(', ');
        console.log("SMTP - CC adicionado:", sendOptions.cc);
      }

      // Adicionar BCC se houver
      if (bccEmails.length > 0) {
        sendOptions.bcc = bccEmails.join(', ');
        console.log("SMTP - BCC adicionado:", sendOptions.bcc);
      }

      // Enviar e-mail
      await client.send(sendOptions);

      await client.close();

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Email sent successfully" 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    } catch (smtpError: any) {
      console.error("SMTP Error:", smtpError);
      
      // Mensagem de erro mais detalhada
      const errorMessage = smtpError.message || smtpError.toString();
      
      // Dicas baseadas no tipo de erro
      let hint = "Verifique: host, porta, credenciais e se o servidor SMTP está acessível";
      if (errorMessage.includes("SmtpClient is not a constructor") || errorMessage.includes("not a constructor")) {
        hint = "Erro de compatibilidade da biblioteca SMTP. Recomendamos usar Resend, SendGrid ou Mailgun que funcionam diretamente do frontend sem necessidade de Edge Function.";
      } else if (errorMessage.includes("auth") || errorMessage.includes("login") || errorMessage.includes("535")) {
        hint = "Erro de autenticação. Verifique usuário e senha. Para Gmail, use App Password (não a senha normal).";
      } else if (errorMessage.includes("connect") || errorMessage.includes("timeout") || errorMessage.includes("ECONNREFUSED")) {
        hint = "Erro de conexão. Verifique host e porta. Tente porta 465 (SSL) ou 587 (TLS). Verifique também se o firewall permite a conexão.";
      } else if (errorMessage.includes("TLS") || errorMessage.includes("SSL") || errorMessage.includes("certificate")) {
        hint = "Erro de TLS/SSL. Verifique se 'secure' está configurado corretamente. Para porta 465 use SSL, para 587 use TLS.";
      } else if (errorMessage.includes("bufio") || errorMessage.includes("readSlice")) {
        hint = "Erro de comunicação com servidor SMTP. Tente usar uma porta diferente (465 ou 587) ou verifique se o servidor SMTP está funcionando corretamente.";
      }
      
      return new Response(
        JSON.stringify({ 
          error: "Failed to send email via SMTP",
          details: errorMessage,
          hint: hint,
          recommendation: "Para uma solução mais confiável, considere usar Resend, SendGrid ou Mailgun que não requerem Edge Functions."
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
