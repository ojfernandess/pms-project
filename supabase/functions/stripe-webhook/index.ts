import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";

/**
 * Cria ou busca o portador de pagamento Stripe
 */
async function getOrCreateStripeCarrier(
  supabaseClient: any,
  establishmentId: string
): Promise<string | null> {
  try {
    // Buscar portador Stripe existente
    const { data: existingCarrier } = await supabaseClient
      .from("payment_carriers")
      .select("id")
      .eq("code", "STRIPE")
      .maybeSingle();

    if (existingCarrier?.id) {
      return existingCarrier.id;
    }

    // Criar portador Stripe se não existir
    const { data: newCarrier, error: createError } = await supabaseClient
      .from("payment_carriers")
      .insert({
        code: "STRIPE",
        description: "Stripe - Gateway de Pagamento",
        is_active: true,
      })
      .select("id")
      .single();

    if (createError) {
      console.error("❌ Erro ao criar portador Stripe:", createError);
      return null;
    }

    return newCarrier?.id || null;
  } catch (error) {
    console.error("❌ Erro ao buscar/criar portador Stripe:", error);
    return null;
  }
}

/**
 * Cria ou busca o tipo de pagamento do Stripe baseado no método de pagamento
 */
async function getOrCreateStripePaymentType(
  supabaseClient: any,
  carrierId: string,
  paymentMethod: string,
  cardBrand?: string | null
): Promise<string | null> {
  try {
    // Mapear métodos do Stripe para métodos do PMS
    const methodMap: Record<string, string> = {
      card: "credit_card", // Default para cartão de crédito
      credit_card: "credit_card",
      debit_card: "debit_card",
    };

    const pmsPaymentMethod = methodMap[paymentMethod] || paymentMethod;

    // Determinar nome do tipo de pagamento
    let typeName = "Stripe - ";
    if (pmsPaymentMethod === "credit_card") {
      typeName += cardBrand ? `Cartão de Crédito ${cardBrand.toUpperCase()}` : "Cartão de Crédito";
    } else if (pmsPaymentMethod === "debit_card") {
      typeName += cardBrand ? `Cartão de Débito ${cardBrand.toUpperCase()}` : "Cartão de Débito";
    } else {
      typeName += pmsPaymentMethod.toUpperCase();
    }

    // Buscar tipo de pagamento existente
    const { data: existingType } = await supabaseClient
      .from("payment_types")
      .select("id")
      .eq("carrier_id", carrierId)
      .eq("payment_method", pmsPaymentMethod)
      .eq("card_brand", cardBrand || null)
      .maybeSingle();

    if (existingType?.id) {
      return existingType.id;
    }

    // Criar tipo de pagamento se não existir
    const paymentTypeData: any = {
      carrier_id: carrierId,
      name: typeName,
      payment_method: pmsPaymentMethod,
      is_active: true,
    };

    // Adicionar card_brand apenas para cartões
    if (pmsPaymentMethod === "credit_card" || pmsPaymentMethod === "debit_card") {
      paymentTypeData.card_brand = cardBrand || "unknown";
    }

    const { data: newType, error: createError } = await supabaseClient
      .from("payment_types")
      .insert(paymentTypeData)
      .select("id")
      .single();

    if (createError) {
      console.error("❌ Erro ao criar tipo de pagamento Stripe:", createError);
      return null;
    }

    return newType?.id || null;
  } catch (error) {
    console.error("❌ Erro ao buscar/criar tipo de pagamento Stripe:", error);
    return null;
  }
}

/**
 * Registra o pagamento Stripe na tabela payments do PMS
 */
async function registerStripePaymentInPMS(
  supabaseClient: any,
  reservationId: string,
  establishmentId: string,
  paymentIntent: Stripe.PaymentIntent,
  stripePaymentId: string,
  stripeClient: Stripe
): Promise<boolean> {
  try {
    console.log(`💳 Registrando pagamento Stripe no PMS para reserva: ${reservationId}`);

    // Verificar se já existe um pagamento registrado para este Payment Intent
    const { data: existingPayment } = await supabaseClient
      .from("payments")
      .select("id")
      .eq("reservation_id", reservationId)
      .like("notes", `%${paymentIntent.id}%`)
      .maybeSingle();

    if (existingPayment) {
      console.log(`ℹ️ Pagamento já registrado no PMS para Payment Intent: ${paymentIntent.id}`);
      return true;
    }

    // Obter ou criar portador Stripe
    const carrierId = await getOrCreateStripeCarrier(supabaseClient, establishmentId);
    if (!carrierId) {
      console.error("❌ Não foi possível obter/criar portador Stripe");
      return false;
    }

    // Obter informações do método de pagamento
    let paymentMethod = "credit_card"; // Default
    let cardBrand: string | null = null;
    let installments = 1;

    // Buscar informações do charge para obter método de pagamento e marca do cartão
    try {
      // Expandir charges para obter detalhes do método de pagamento
      const expandedPaymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntent.id, {
        expand: ['charges']
      });

      if (expandedPaymentIntent.charges && expandedPaymentIntent.charges.data && expandedPaymentIntent.charges.data.length > 0) {
        const charge = expandedPaymentIntent.charges.data[0];
        
        if (charge.payment_method_details?.type) {
          paymentMethod = charge.payment_method_details.type;
        }

        if (charge.payment_method_details?.card?.brand) {
          cardBrand = charge.payment_method_details.card.brand;
        }

        // Verificar se há parcelas (installments)
        if (charge.payment_method_details?.card?.installments) {
          installments = charge.payment_method_details.card.installments.count || 1;
        }
      }
    } catch (error) {
      console.warn("⚠️ Erro ao buscar detalhes do método de pagamento:", error);
      // Usar valores padrão se não conseguir buscar
    }

    // Obter ou criar tipo de pagamento
    const paymentTypeId = await getOrCreateStripePaymentType(
      supabaseClient,
      carrierId,
      paymentMethod,
      cardBrand
    );

    if (!paymentTypeId) {
      console.error("❌ Não foi possível obter/criar tipo de pagamento Stripe");
      return false;
    }

    // Calcular valor do pagamento (em centavos para reais)
    const amount = (paymentIntent.amount / 100).toFixed(2);

    // Criar observações com informações do Stripe
    const notes = `[STRIPE] Payment Intent: ${paymentIntent.id}\n[COMPONENT:base]`;

    // Inserir pagamento na tabela payments
    const { error: insertError } = await supabaseClient
      .from("payments")
      .insert({
        reservation_id: reservationId,
        establishment_id: establishmentId,
        carrier_id: carrierId,
        payment_type_id: paymentTypeId,
        amount: amount,
        payment_method: paymentMethod === "card" ? "credit_card" : paymentMethod,
        payment_date: new Date(paymentIntent.created * 1000).toISOString(),
        installments: installments,
        notes: notes,
      });

    if (insertError) {
      console.error("❌ Erro ao inserir pagamento no PMS:", insertError);
      return false;
    }

    // Registrar log de atividade para o pagamento Stripe
    try {
      console.log(`📝 Iniciando registro de log de atividade para pagamento Stripe - Reservation ID: ${reservationId}, Establishment ID: ${establishmentId}`);
      
      // Buscar dados da reserva para o log de atividade
      const { data: reservationData, error: reservationDataError } = await supabaseClient
        .from("reservations")
        .select("reservation_code, paid_amount, total_amount")
        .eq("id", reservationId)
        .single();

      if (reservationDataError) {
        console.warn("⚠️ Erro ao buscar dados da reserva para log:", reservationDataError);
      }

      // Formatar valor em reais
      const formattedAmount = new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(parseFloat(amount));
      
      // Criar descrição do pagamento
      let paymentDescription = `Pagamento Stripe confirmado: ${formattedAmount}`;
      if (installments > 1) {
        paymentDescription += ` (${installments}x)`;
      }
      if (cardBrand) {
        paymentDescription += ` - ${cardBrand.toUpperCase()}`;
      }
      paymentDescription += ` - Payment Intent: ${paymentIntent.id}`;
      
      // Calcular novo paid_amount
      const currentPaidAmount = parseFloat(reservationData?.paid_amount || "0");
      const newPaidAmount = (currentPaidAmount + parseFloat(amount)).toFixed(2);
      
      const logParams = {
        p_establishment_id: establishmentId,
        p_action_type: "payment_added",
        p_entity_type: "reservation", // Mudado de "payment" para "reservation" para aparecer nos logs da reserva
        p_description: paymentDescription,
        p_user_id: null, // Edge Function não tem usuário autenticado
        p_entity_id: reservationId, // ID da reserva
        p_entity_code: reservationData?.reservation_code || null,
        p_old_values: reservationData ? {
          paid_amount: currentPaidAmount,
        } : null,
        p_new_values: reservationData ? {
          paid_amount: parseFloat(newPaidAmount),
          payment_method: paymentMethod === "card" ? "credit_card" : paymentMethod,
          payment_intent_id: paymentIntent.id,
          card_brand: cardBrand,
          installments: installments,
        } : null,
        p_metadata: {
          stripe_payment_intent_id: paymentIntent.id,
          stripe_charge_id: paymentIntent.latest_charge || null,
          payment_method: paymentMethod,
          card_brand: cardBrand,
          installments: installments,
          amount: amount,
          source: "stripe_webhook",
          payment_entity_type: "payment", // Tipo de entidade do pagamento (para referência)
        },
      };
      
      console.log(`📝 Parâmetros do log:`, JSON.stringify(logParams, null, 2));
      
      const { data: logData, error: logError } = await supabaseClient.rpc("insert_activity_log", logParams);

      if (logError) {
        console.error("❌ Erro ao registrar log de atividade do pagamento Stripe:", logError);
        console.error("❌ Detalhes do erro:", JSON.stringify(logError, null, 2));
        // Não bloquear o processamento se o log falhar
      } else {
        console.log(`✅ Log de atividade do pagamento Stripe registrado com sucesso! Log ID: ${logData}`);
        console.log(`✅ Log criado para reserva ${reservationId} (${reservationData?.reservation_code || "sem código"})`);
      }
    } catch (logError) {
      console.error("❌ Exceção ao registrar log de atividade do pagamento Stripe:", logError);
      console.error("❌ Stack trace:", logError instanceof Error ? logError.stack : "N/A");
      // Não bloquear o processamento se o log falhar
    }

    console.log(`✅ Pagamento Stripe registrado no PMS com sucesso: ${amount} (${installments}x)`);
    return true;
  } catch (error) {
    console.error("❌ Erro ao registrar pagamento Stripe no PMS:", error);
    return false;
  }
}

/**
 * Detecta o domínio base do sistema automaticamente
 * Detecta automaticamente se está em localhost (desenvolvimento) ou produção
 */
function detectBaseUrl(req: Request | null = null, supabaseUrl: string | null = null): string {
  // 1. Tentar variável de ambiente SITE_URL (prioridade máxima)
  const siteUrl = Deno.env.get("SITE_URL");
  if (siteUrl) {
    console.log(`🌐 [detectBaseUrl] Usando SITE_URL: ${siteUrl}`);
    return siteUrl;
  }

  // 2. Verificar variáveis de ambiente de plataformas de produção
  // Vercel
  const vercelUrl = Deno.env.get("VERCEL_URL");
  if (vercelUrl) {
    const url = `https://${vercelUrl}`;
    console.log(`🌐 [detectBaseUrl] Usando VERCEL_URL: ${url}`);
    return url;
  }

  // Render
  const renderUrl = Deno.env.get("RENDER_EXTERNAL_URL");
  if (renderUrl) {
    console.log(`🌐 [detectBaseUrl] Usando RENDER_EXTERNAL_URL: ${renderUrl}`);
    return renderUrl;
  }

  // Netlify
  const netlifyUrl = Deno.env.get("URL");
  if (netlifyUrl) {
    console.log(`🌐 [detectBaseUrl] Usando Netlify URL: ${netlifyUrl}`);
    return netlifyUrl;
  }

  // Railway
  const railwayUrl = Deno.env.get("RAILWAY_PUBLIC_DOMAIN");
  if (railwayUrl) {
    const url = `https://${railwayUrl}`;
    console.log(`🌐 [detectBaseUrl] Usando RAILWAY_PUBLIC_DOMAIN: ${url}`);
    return url;
  }

  // 3. Tentar extrair do header Referer ou Origin se disponível (útil para webhooks)
  if (req) {
    const referer = req.headers.get("referer");
    const origin = req.headers.get("origin");
    
    if (origin) {
      try {
        const url = new URL(origin);
        // Verificar se não é localhost
        if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          console.log(`🌐 [detectBaseUrl] Usando Origin header: ${url.origin}`);
          return url.origin;
        }
      } catch {
        // Ignorar erro
      }
    }
    
    if (referer) {
      try {
        const url = new URL(referer);
        // Verificar se não é localhost
        if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          console.log(`🌐 [detectBaseUrl] Usando Referer header: ${url.origin}`);
          return url.origin;
        }
      } catch {
        // Ignorar erro
      }
    }
  }

  // 4. Analisar SUPABASE_URL para detectar ambiente
  const supabaseUrlEnv = supabaseUrl || Deno.env.get("SUPABASE_URL");
  if (supabaseUrlEnv) {
    try {
      const url = new URL(supabaseUrlEnv);
      const hostname = url.hostname;
      
      // Se for localhost, retornar localhost
      if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
        console.log(`🌐 [detectBaseUrl] Detectado localhost via SUPABASE_URL: http://localhost:8080`);
        return "http://localhost:8080";
      }
      
      // Se for um projeto Supabase (.supabase.co), tentar inferir domínio de produção
      if (hostname.includes('.supabase.co')) {
        // Extrair o ID do projeto do hostname
        // Exemplo: xxxxxx.supabase.co -> pode inferir domínio customizado se configurado
        // Por enquanto, vamos tentar usar variáveis de ambiente ou inferir
        console.log(`🌐 [detectBaseUrl] Detectado Supabase Cloud, tentando inferir domínio de produção...`);
      }
      
      // Se não for um domínio .supabase.co, pode ser um domínio customizado
      if (!hostname.includes('.supabase.co')) {
        // Tentar inferir removendo subdomínios como 'api', 'app', etc.
        const parts = hostname.split('.');
        if (parts.length > 2) {
          // Remover subdomínios como 'api', 'app', etc.
          const domain = parts.slice(-2).join('.');
          const inferredUrl = `${url.protocol}//${domain}`;
          console.log(`🌐 [detectBaseUrl] Domínio customizado inferido: ${inferredUrl}`);
          return inferredUrl;
        } else {
          // Se for um domínio direto, usar como está
          const directUrl = `${url.protocol}//${hostname}`;
          console.log(`🌐 [detectBaseUrl] Usando domínio direto do SUPABASE_URL: ${directUrl}`);
          return directUrl;
        }
      }
    } catch {
      // Ignorar erro
    }
  }

  // 5. Verificar variável de ambiente de ambiente (NODE_ENV, DENO_ENV, etc.)
  const env = Deno.env.get("ENVIRONMENT") || Deno.env.get("NODE_ENV") || Deno.env.get("DENO_ENV");
  if (env === "production" || env === "prod") {
    // Em produção, tentar usar o SUPABASE_URL como base
    if (supabaseUrlEnv) {
      try {
        const url = new URL(supabaseUrlEnv);
        // Se não for localhost, tentar inferir
        if (!url.hostname.includes('localhost') && !url.hostname.includes('127.0.0.1')) {
          console.log(`🌐 [detectBaseUrl] Ambiente de produção detectado, usando SUPABASE_URL como base`);
          // Retornar apenas o protocolo e hostname (sem path)
          return `${url.protocol}//${url.hostname}`;
        }
      } catch {
        // Ignorar erro
      }
    }
  }

  // 6. Último fallback: detectar baseado no SUPABASE_URL
  // Se SUPABASE_URL contém localhost, usar localhost
  if (supabaseUrlEnv && (supabaseUrlEnv.includes('localhost') || supabaseUrlEnv.includes('127.0.0.1'))) {
    console.log(`🌐 [detectBaseUrl] Fallback: Detectado localhost, usando http://localhost:8080`);
    return "http://localhost:8080";
  }

  // 7. Se chegou aqui e não é localhost, tentar inferir domínio de produção
  // Por padrão, se não conseguir detectar, usar localhost (mais seguro para desenvolvimento)
  console.log(`🌐 [detectBaseUrl] Fallback final: Usando localhost (desenvolvimento)`);
  return "http://localhost:8080";
}

/**
 * Envia email de pagamento confirmado
 */
async function sendReservationExtensionEmail(
  reservationId: string,
  newCheckoutDate: string,
  supabaseClient: any,
  request?: Request
): Promise<void> {
  try {
    console.log(`📧 Enviando email de extensão de reserva para reserva: ${reservationId}, nova data de check-out: ${newCheckoutDate}`);
    
    // Buscar dados da reserva
    // IMPORTANTE: Incluir reservation_service_fees para calcular valor total correto
    const { data: reservation, error: reservationError } = await supabaseClient
      .from("reservations")
      .select(`
        *,
        financial_responsible:clients!client_id(*),
        guest:clients!guest_id(*),
        rooms (id, room_number, name, fixed_password),
        room_categories (id, name, description, building_id),
        reservation_service_fees (amount, quantity)
      `)
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation) {
      console.error("❌ Erro ao buscar reserva para email de extensão:", reservationError);
      return;
    }

    // Buscar template de email
    const { data: template, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("event_type", "reservation.extended")
      .eq("is_active", true)
      .single();

    if (templateError || !template) {
      console.warn("⚠️ Template de email 'reservation.extended' não encontrado ou inativo");
      return;
    }

    // Buscar configurações de email
    const { data: emailSettings, error: settingsError } = await supabaseClient
      .from("email_settings")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    if (settingsError || !emailSettings) {
      console.warn("⚠️ Configurações de email não encontradas ou inativas");
      return;
    }

    // Determinar destinatário
    const recipientEmail = reservation.guest?.email || reservation.financial_responsible?.email;
    const recipientName = reservation.guest?.full_name || reservation.financial_responsible?.full_name;

    if (!recipientEmail) {
      console.warn("⚠️ Nenhum email encontrado para hóspede ou responsável financeiro");
      return;
    }

    // Buscar configurações do hotel
    let hotelSettings: any = null;
    if (reservation.establishment_id) {
      const { data: settings } = await supabaseClient
        .from("hotel_settings")
        .select("*")
        .eq("establishment_id", reservation.establishment_id)
        .maybeSingle();
      hotelSettings = settings;
    }

    // Buscar configurações do estabelecimento para obter URL customizada
    let customDomain: string | null = null;
    try {
      const { data: establishment } = await supabaseClient
        .from("establishments")
        .select("custom_domain")
        .eq("id", reservation.establishment_id)
        .maybeSingle();
      if (establishment?.custom_domain) {
        customDomain = establishment.custom_domain;
      }
    } catch {
      // Campo pode não existir, ignorar
    }

    // Gerar variáveis completas do template
    const reservationAny = reservation as any;
    
    // Formatar datas
    const formatDate = (dateStr: string | null | undefined): string => {
      if (!dateStr) return "";
      try {
        const date = new Date(dateStr);
        return date.toLocaleDateString("pt-BR");
      } catch {
        return "";
      }
    };

    const checkinDate = formatDate(reservationAny.checkin_date);
    const checkoutDate = formatDate(reservationAny.checkout_date);
    const newCheckoutDateFormatted = formatDate(newCheckoutDate);
    
    // Horários de check-in e check-out (garantir formato HH:MM sem segundos)
    const checkinTimeRaw = reservationAny.checkin_time || hotelSettings?.checkin_time || hotelSettings?.default_checkin_time || '14:00';
    const checkoutTimeRaw = reservationAny.checkout_time || hotelSettings?.checkout_time || hotelSettings?.default_checkout_time || '12:00';
    const checkinTime = typeof checkinTimeRaw === 'string' && checkinTimeRaw.includes(':') ? checkinTimeRaw.substring(0, 5) : checkinTimeRaw;
    const checkoutTime = typeof checkoutTimeRaw === 'string' && checkoutTimeRaw.includes(':') ? checkoutTimeRaw.substring(0, 5) : checkoutTimeRaw;

    // Construir endereço completo
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
    const hotelAddress = addressParts.length > 0 ? addressParts.join(', ') : (hotelSettings?.street ? `${hotelSettings.street}, ${hotelSettings.city || ""}` : "");

    // Construir telefone completo
    const hotelPhone = hotelSettings?.phone_ddi && hotelSettings?.phone_number
      ? `${hotelSettings.phone_ddi} ${hotelSettings.phone_number}`
      : hotelSettings?.phone_number || hotelSettings?.phone || '';

    // Buscar configurações do site para obter logo_url e pms_base_url (antes de detectar baseUrl)
    let siteSettings: any = null;
    try {
      const { data: settings } = await supabaseClient
        .from("site_settings")
        .select("logo_url, pms_base_url")
        .maybeSingle();
      siteSettings = settings;
      console.log(`📧 [sendReservationExtensionEmail] Site settings carregadas, pms_base_url: ${siteSettings?.pms_base_url || 'não configurado'}`);
    } catch (error) {
      console.warn("⚠️ Erro ao buscar site_settings:", error);
    }

    // Detectar domínio base (priorizar pms_base_url de site_settings, depois detecção automática)
    // NOTA: Não usar custom_domain ou website do hotel_settings aqui, pois esses são para o site do estabelecimento
    // e não para o sistema PMS. O pms_base_url é a URL do sistema PMS que gera os links de check-in e políticas.
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    let baseUrl = detectBaseUrl(request, supabaseUrl);
    
    // Priorizar pms_base_url de site_settings
    if (siteSettings?.pms_base_url) {
      const pmsUrl = siteSettings.pms_base_url.trim();
      if (pmsUrl) {
        try {
          // Garantir que tenha protocolo
          const url = new URL(pmsUrl.startsWith('http://') || pmsUrl.startsWith('https://') ? pmsUrl : `https://${pmsUrl}`);
          baseUrl = url.origin;
          console.log(`🌐 [sendReservationExtensionEmail] Usando URL base do PMS (site_settings): ${baseUrl}`);
        } catch {
          // Se falhar, usar como está
          baseUrl = pmsUrl;
          console.log(`🌐 [sendReservationExtensionEmail] Usando URL base do PMS (site_settings) como está: ${baseUrl}`);
        }
      }
    } else {
      console.log(`🌐 [sendReservationExtensionEmail] URL base do PMS não configurada, usando detecção automática: ${baseUrl}`);
    }

    // Gerar link de web check-in
    let webCheckinLink = '';
    try {
      const { data: webCheckin } = await supabaseClient
        .from('web_checkin')
        .select('locator')
        .eq('reservation_id', reservationId)
        .maybeSingle();

      if (webCheckin?.locator) {
        webCheckinLink = `${baseUrl}/web-checkin/${webCheckin.locator}`;
      } else if (reservationAny.reservation_code) {
        webCheckinLink = `${baseUrl}/web-checkin/${reservationAny.reservation_code}`;
      }
    } catch (error) {
      console.warn("⚠️ Erro ao buscar web_checkin:", error);
    }

    // Processar logo_url e hotel_logo (siteSettings já foi carregado acima)
    let logoUrl = siteSettings?.logo_url || hotelSettings?.logo_url || null;
    let hotelLogo = hotelSettings?.logo_url || null;

    // Converter logo_url para URL pública do Supabase Storage se necessário
    if (logoUrl && !logoUrl.startsWith('http://') && !logoUrl.startsWith('https://')) {
      try {
        const possibleBuckets = ['hotel-assets', 'uploads', 'hotel-logos'];
        
        for (const bucket of possibleBuckets) {
          try {
            let filePath = logoUrl;
            
            // Se for hotel-assets e o caminho não começar com "hotel/", adicionar
            if (bucket === 'hotel-assets' && !filePath.startsWith('hotel/') && !filePath.includes('/')) {
              filePath = `hotel/${filePath}`;
            }
            
            // Se o caminho contém "/storage/v1/object/public/", extrair apenas o caminho do arquivo
            if (filePath.includes('/storage/v1/object/public/')) {
              const match = filePath.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
              if (match && match[1]) {
                filePath = match[1];
              }
            }
            
            const { data } = supabaseClient.storage.from(bucket).getPublicUrl(filePath);
            if (data?.publicUrl && (data.publicUrl.startsWith('http://') || data.publicUrl.startsWith('https://'))) {
              logoUrl = data.publicUrl;
              break;
            }
          } catch (error) {
            continue;
          }
        }
      } catch (error) {
        console.warn("⚠️ Erro ao converter logo_url:", error);
      }
    }

    // Converter hotel_logo para URL pública do Supabase Storage se necessário
    if (hotelLogo && !hotelLogo.startsWith('http://') && !hotelLogo.startsWith('https://')) {
      try {
        const possibleBuckets = ['hotel-assets', 'uploads', 'hotel-logos'];
        
        for (const bucket of possibleBuckets) {
          try {
            let filePath = hotelLogo;
            
            // Se for hotel-assets e o caminho não começar com "hotel/", adicionar
            if (bucket === 'hotel-assets' && !filePath.startsWith('hotel/') && !filePath.includes('/')) {
              filePath = `hotel/${filePath}`;
            }
            
            // Se o caminho contém "/storage/v1/object/public/", extrair apenas o caminho do arquivo
            if (filePath.includes('/storage/v1/object/public/')) {
              const match = filePath.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
              if (match && match[1]) {
                filePath = match[1];
              }
            }
            
            const { data } = supabaseClient.storage.from(bucket).getPublicUrl(filePath);
            if (data?.publicUrl && (data.publicUrl.startsWith('http://') || data.publicUrl.startsWith('https://'))) {
              hotelLogo = data.publicUrl;
              break;
            }
          } catch (error) {
            continue;
          }
        }
      } catch (error) {
        console.warn("⚠️ Erro ao converter hotel_logo:", error);
      }
    }

    const variables: Record<string, any> = {
      guest_name: recipientName || "Hóspede",
      reservation_code: reservationAny.reservation_code || "",
      checkin_date: checkinDate,
      checkout_date: checkoutDate, // Data original de check-out
      new_checkout_date: newCheckoutDateFormatted, // Nova data de check-out após extensão
      checkin_time: checkinTime,
      checkout_time: checkoutTime,
      total_amount: (() => {
        const baseTotalAmount = Number(reservationAny.total_amount || 0);
        const serviceFeesTotal = (reservationAny.reservation_service_fees || []).reduce((sum: number, fee: any) => {
          return sum + (Number(fee.amount || 0) * Number(fee.quantity || 1));
        }, 0);
        const totalWithFees = baseTotalAmount + serviceFeesTotal;
        return new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(totalWithFees);
      })(),
      paid_amount: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(reservationAny.paid_amount || 0)),
      room_number: reservationAny.rooms?.room_number || "",
      room_name: reservationAny.rooms?.name || "",
      category_name: reservationAny.room_categories?.name || "",
      room_category: reservationAny.room_categories?.name || "",
      adults: reservationAny.adults || 0,
      children: reservationAny.children || 0,
      hotel_name: hotelSettings?.name || "",
      hotel_address: hotelAddress,
      hotel_contact: hotelPhone,
      hotel_email: hotelSettings?.email || "",
      hotel_phone: hotelPhone,
      hotel_website: hotelSettings?.website || "",
      web_checkin_link: webCheckinLink,
      logo_url: logoUrl || "",
      hotel_logo: hotelLogo || "",
    };

    // Processar template com suporte a condicionais {{#if}}
    const processConditionals = (templateStr: string, vars: Record<string, any>): string => {
      let processed = templateStr;
      let changed = true;
      let iterations = 0;
      const maxIterations = 100;

      while (changed && iterations < maxIterations) {
        iterations++;
        changed = false;

        const ifElseRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
        processed = processed.replace(ifElseRegex, (fullMatch, variableName, ifContent, elseContent) => {
          const value = vars[variableName];
          const isTruthy = value !== null && 
                          value !== undefined && 
                          value !== '' && 
                          value !== 0 && 
                          value !== false && 
                          (typeof value === 'string' ? value.trim() !== '' : true);

          if (isTruthy) {
            changed = true;
            return ifContent;
          } else {
            if (elseContent !== undefined && elseContent !== null) {
              changed = true;
              return elseContent;
            }
            return '';
          }
        });
      }
      
      // Remover qualquer {{/if}} que não foi processado (evitar que apareça no email final)
      processed = processed.replace(/\{\{\/if\}\}/g, '');
      
      return processed;
    };

    // Processar template (primeiro condicionais, depois variáveis)
    const processTemplate = (templateStr: string, vars: Record<string, any>): string => {
      let processed = processConditionals(templateStr, vars);
      
      // Substituir variáveis
      Object.keys(vars).forEach((key) => {
        const value = vars[key];
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        processed = processed.replace(regex, value?.toString() || '');
      });

      return processed;
    };

    const processedSubject = processTemplate(template.subject, variables);
    const processedBody = processTemplate(template.body_html, variables);

    // Tentar enviar email diretamente primeiro (apenas para Resend/SendGrid)
    // Para SMTP, ir direto para a fila que já tem a lógica correta
    let emailSent = false;
    
    // Apenas tentar envio direto se for Resend ou SendGrid (não SMTP)
    if (emailSettings.provider === "resend" || emailSettings.provider === "sendgrid") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const emailFunctionName = emailSettings.provider === "resend" 
          ? "send-email-resend" 
          : "send-email-sendgrid";

        console.log(`📧 Tentando enviar email de extensão via ${emailFunctionName} para: ${recipientEmail}`);

        const requestBody: any = {
          to: recipientEmail,
          to_name: recipientName,
          subject: processedSubject,
          html: processedBody,
          from: emailSettings.sender_email,
          from_name: emailSettings.sender_name,
          api_key: emailSettings.api_key || "",
        };

        const response = await fetch(`${supabaseUrl}/functions/v1/${emailFunctionName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          emailSent = true;
          console.log(`✅ Email de extensão enviado com sucesso para: ${recipientEmail}`);
        } else {
          const errorText = await response.text();
          console.warn(`⚠️ Erro ao enviar email de extensão (${response.status}):`, errorText);
        }
      } catch (fetchError) {
        console.warn("⚠️ Erro ao chamar Edge Function de email:", fetchError);
      }
    } else {
      // Para SMTP, não tentar envio direto - ir direto para a fila
      console.log(`📧 Provider SMTP detectado, adicionando email de extensão à fila para processamento: ${recipientEmail}`);
    }

    // Se não foi enviado, adicionar à fila de emails usando função SQL que bypassa RLS
    if (!emailSent) {
      try {
        // Usar função SQL que bypassa RLS
        const { data: queueId, error: queueError } = await supabaseClient.rpc('insert_email_queue', {
          p_template_id: template.id,
          p_event_type: 'reservation.extended',
          p_recipient_email: recipientEmail,
          p_recipient_name: recipientName,
          p_subject: processedSubject,
          p_body_html: processedBody,
          p_reservation_id: reservationId,
          p_variables: variables,
          p_priority: 1,
        });

        if (queueError) {
          console.error("❌ Erro ao adicionar email de extensão à fila via RPC:", queueError);
          console.error("❌ Código:", queueError.code);
          console.error("❌ Mensagem:", queueError.message);
          
          // Fallback: tentar inserção direta (Service Role Key deveria bypassar RLS)
          console.log("⚠️ Tentando inserção direta como fallback...");
          const { error: directError } = await supabaseClient.from("email_queue").insert({
            template_id: template.id,
            event_type: "reservation.extended",
            recipient_email: recipientEmail,
            recipient_name: recipientName,
            subject: processedSubject,
            body_html: processedBody,
            reservation_id: reservationId,
            variables: variables,
            priority: 1,
          });

          if (directError) {
            console.error("❌ Erro também na inserção direta:", directError);
          } else {
            console.log(`✅ Email de extensão adicionado à fila via inserção direta para: ${recipientEmail}`);
          }
        } else {
          console.log(`✅ Email de extensão adicionado à fila (ID: ${queueId}) para: ${recipientEmail}`);
        }
      } catch (queueInsertError) {
        console.error("❌ Erro ao inserir email de extensão na fila:", queueInsertError);
      }
    }
  } catch (error) {
    console.error("❌ Erro geral ao enviar email de extensão:", error);
  }
}

async function sendPaymentConfirmedEmail(
  reservationId: string,
  supabaseClient: any,
  request?: Request
): Promise<void> {
  try {
    console.log(`📧 [sendPaymentConfirmedEmail] Iniciando envio de email para reserva: ${reservationId}`);
    
    // Buscar dados da reserva
    const { data: reservation, error: reservationError } = await supabaseClient
      .from("reservations")
      .select(`
        *,
        financial_responsible:clients!client_id(*),
        guest:clients!guest_id(*),
        rooms (id, room_number, name, fixed_password),
        room_categories (id, name, description, building_id)
      `)
      .eq("id", reservationId)
      .single();

    if (reservationError || !reservation) {
      console.error(`❌ [sendPaymentConfirmedEmail] Erro ao buscar reserva ${reservationId} para email:`, reservationError);
      return;
    }

    console.log(`📧 [sendPaymentConfirmedEmail] Reserva encontrada: ${reservationId}, código: ${reservation.reservation_code}`);

    // Buscar template de email
    const { data: template, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("event_type", "payment.confirmed")
      .eq("is_active", true)
      .single();

    if (templateError || !template) {
      console.warn(`⚠️ [sendPaymentConfirmedEmail] Template de email 'payment.confirmed' não encontrado ou inativo para reserva ${reservationId}`);
      console.warn(`⚠️ [sendPaymentConfirmedEmail] Erro do template:`, templateError);
      return;
    }

    console.log(`📧 [sendPaymentConfirmedEmail] Template encontrado: ${template.id}, nome: ${template.name}`);

    // Buscar configurações de email
    const { data: emailSettings, error: settingsError } = await supabaseClient
      .from("email_settings")
      .select("*")
      .eq("is_active", true)
      .maybeSingle();

    if (settingsError || !emailSettings) {
      console.warn(`⚠️ [sendPaymentConfirmedEmail] Configurações de email não encontradas ou inativas para reserva ${reservationId}`);
      console.warn(`⚠️ [sendPaymentConfirmedEmail] Erro das configurações:`, settingsError);
      return;
    }

    console.log(`📧 [sendPaymentConfirmedEmail] Configurações de email encontradas, provider: ${emailSettings.provider}`);

    // Determinar destinatário
    const recipientEmail = reservation.guest?.email || reservation.financial_responsible?.email;
    const recipientName = reservation.guest?.full_name || reservation.financial_responsible?.full_name;

    if (!recipientEmail) {
      console.warn(`⚠️ [sendPaymentConfirmedEmail] Nenhum email encontrado para hóspede ou responsável financeiro na reserva ${reservationId}`);
      console.warn(`⚠️ [sendPaymentConfirmedEmail] Guest email: ${reservation.guest?.email || 'N/A'}, Financial responsible email: ${reservation.financial_responsible?.email || 'N/A'}`);
      return;
    }

    console.log(`📧 [sendPaymentConfirmedEmail] Destinatário: ${recipientEmail} (${recipientName || 'N/A'})`);

    // Buscar configurações do hotel
    let hotelSettings: any = null;
    if (reservation.establishment_id) {
      const { data: settings } = await supabaseClient
        .from("hotel_settings")
        .select("*")
        .eq("establishment_id", reservation.establishment_id)
        .maybeSingle();
      hotelSettings = settings;
    }

    // Buscar configurações do site para obter logo_url e pms_base_url
    let siteSettings: any = null;
    try {
      const { data: settings } = await supabaseClient
        .from("site_settings")
        .select("logo_url, pms_base_url")
        .maybeSingle();
      siteSettings = settings;
      console.log(`📧 [sendPaymentConfirmedEmail] Site settings carregadas, pms_base_url: ${siteSettings?.pms_base_url || 'não configurado'}`);
    } catch (error) {
      console.warn("⚠️ Erro ao buscar site_settings:", error);
    }

    // Buscar configurações do estabelecimento para obter URL customizada (se existir campo custom_domain)
    let customDomain: string | null = null;
    try {
      const { data: establishment } = await supabaseClient
        .from("establishments")
        .select("custom_domain")
        .eq("id", reservation.establishment_id)
        .maybeSingle();
      if (establishment?.custom_domain) {
        customDomain = establishment.custom_domain;
      }
    } catch {
      // Campo pode não existir, ignorar
    }

    // Gerar variáveis completas do template (similar ao emailTemplateEngine)
    const reservationAny = reservation as any;
    
    // Formatar datas
    const formatDate = (dateStr: string | null | undefined): string => {
      if (!dateStr) return "";
      try {
        const date = new Date(dateStr);
        return date.toLocaleDateString("pt-BR");
      } catch {
        return "";
      }
    };

    const checkinDate = formatDate(reservationAny.checkin_date);
    const checkoutDate = formatDate(reservationAny.checkout_date);
    
    // Horários de check-in e check-out (garantir formato HH:MM sem segundos)
    const checkinTimeRaw = reservationAny.checkin_time || hotelSettings?.checkin_time || hotelSettings?.default_checkin_time || '14:00';
    const checkoutTimeRaw = reservationAny.checkout_time || hotelSettings?.checkout_time || hotelSettings?.default_checkout_time || '12:00';
    const checkinTime = typeof checkinTimeRaw === 'string' && checkinTimeRaw.includes(':') ? checkinTimeRaw.substring(0, 5) : checkinTimeRaw;
    const checkoutTime = typeof checkoutTimeRaw === 'string' && checkoutTimeRaw.includes(':') ? checkoutTimeRaw.substring(0, 5) : checkoutTimeRaw;

    // Construir endereço completo
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
    const hotelAddress = addressParts.length > 0 ? addressParts.join(', ') : (hotelSettings?.street ? `${hotelSettings.street}, ${hotelSettings.city || ""}` : "");

    // Construir telefone completo
    const hotelPhone = hotelSettings?.phone_ddi && hotelSettings?.phone_number
      ? `${hotelSettings.phone_ddi} ${hotelSettings.phone_number}`
      : hotelSettings?.phone_number || hotelSettings?.phone || '';

    // Gerar link de políticas
    const buildingId = reservationAny.room_categories?.building_id || null;
    const establishmentId = reservationAny.establishment_id || hotelSettings?.establishment_id;
    
    // Detectar domínio base (priorizar pms_base_url de site_settings, depois detecção automática)
    // NOTA: Não usar custom_domain ou website do hotel_settings aqui, pois esses são para o site do estabelecimento
    // e não para o sistema PMS. O pms_base_url é a URL do sistema PMS que gera os links de check-in e políticas.
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    let baseUrl = detectBaseUrl(request, supabaseUrl);
    
    // Priorizar pms_base_url de site_settings
    if (siteSettings?.pms_base_url) {
      const pmsUrl = siteSettings.pms_base_url.trim();
      if (pmsUrl) {
        try {
          // Garantir que tenha protocolo
          const url = new URL(pmsUrl.startsWith('http://') || pmsUrl.startsWith('https://') ? pmsUrl : `https://${pmsUrl}`);
          baseUrl = url.origin;
          console.log(`🌐 Usando URL base do PMS (site_settings): ${baseUrl}`);
        } catch {
          // Se falhar, usar como está
          baseUrl = pmsUrl;
          console.log(`🌐 Usando URL base do PMS (site_settings) como está: ${baseUrl}`);
        }
      }
    } else {
      console.log(`🌐 URL base do PMS não configurada, usando detecção automática: ${baseUrl}`);
    }

    const generatePoliciesLink = (type: 'establishment' | 'building', id: string | null | undefined): string => {
      if (!id) return '';
      try {
        const tokenData = `${type}:${id}`;
        const token = btoa(tokenData);
        // Criar URL amigável usando o nome do hotel como slug
        const hotelName = hotelSettings?.name || 'hotel';
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

    // Gerar link de web check-in
    let webCheckinLink = '';
    try {
      const { data: webCheckin } = await supabaseClient
        .from('web_checkin')
        .select('locator')
        .eq('reservation_id', reservationId)
        .maybeSingle();

      if (webCheckin?.locator) {
        webCheckinLink = `${baseUrl}/web-checkin/${webCheckin.locator}`;
      } else if (reservationAny.reservation_code) {
        // Se não existe web_checkin, usar reservation_code como locator
        webCheckinLink = `${baseUrl}/web-checkin/${reservationAny.reservation_code}`;
      }
    } catch (error) {
      console.warn("⚠️ Erro ao buscar web_checkin:", error);
    }

    // Processar logo_url e hotel_logo
    let logoUrl = siteSettings?.logo_url || hotelSettings?.logo || null;
    let hotelLogo = hotelSettings?.logo || null;

    // Converter logo_url para URL pública do Supabase Storage se necessário
    if (logoUrl && !logoUrl.startsWith('http://') && !logoUrl.startsWith('https://')) {
      try {
        const possibleBuckets = ['hotel-assets', 'uploads', 'hotel-logos'];
        
        for (const bucket of possibleBuckets) {
          try {
            let filePath = logoUrl;
            
            // Se for hotel-assets e o caminho não começar com "hotel/", adicionar
            if (bucket === 'hotel-assets' && !filePath.startsWith('hotel/') && !filePath.includes('/')) {
              filePath = `hotel/${filePath}`;
            }
            
            // Se o caminho contém "/storage/v1/object/public/", extrair apenas o caminho do arquivo
            if (filePath.includes('/storage/v1/object/public/')) {
              const match = filePath.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
              if (match && match[1]) {
                filePath = match[1];
              }
            }
            
            const { data } = supabaseClient.storage.from(bucket).getPublicUrl(filePath);
            if (data?.publicUrl && (data.publicUrl.startsWith('http://') || data.publicUrl.startsWith('https://'))) {
              logoUrl = data.publicUrl;
              console.log(`✅ Logo convertida para URL pública do bucket "${bucket}"`);
              break;
            }
          } catch (error) {
            continue;
          }
        }
      } catch (error) {
        console.warn("⚠️ Erro ao converter logo_url:", error);
      }
    }

    // Converter hotel_logo para URL pública do Supabase Storage se necessário
    if (hotelLogo && !hotelLogo.startsWith('http://') && !hotelLogo.startsWith('https://')) {
      try {
        const possibleBuckets = ['hotel-assets', 'uploads', 'hotel-logos'];
        
        for (const bucket of possibleBuckets) {
          try {
            let filePath = hotelLogo;
            
            // Se for hotel-assets e o caminho não começar com "hotel/", adicionar
            if (bucket === 'hotel-assets' && !filePath.startsWith('hotel/') && !filePath.includes('/')) {
              filePath = `hotel/${filePath}`;
            }
            
            // Se o caminho contém "/storage/v1/object/public/", extrair apenas o caminho do arquivo
            if (filePath.includes('/storage/v1/object/public/')) {
              const match = filePath.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
              if (match && match[1]) {
                filePath = match[1];
              }
            }
            
            const { data } = supabaseClient.storage.from(bucket).getPublicUrl(filePath);
            if (data?.publicUrl && (data.publicUrl.startsWith('http://') || data.publicUrl.startsWith('https://'))) {
              hotelLogo = data.publicUrl;
              console.log(`✅ Hotel logo convertida para URL pública do bucket "${bucket}"`);
              break;
            }
          } catch (error) {
            continue;
          }
        }
      } catch (error) {
        console.warn("⚠️ Erro ao converter hotel_logo:", error);
      }
    }

    const variables: Record<string, any> = {
      guest_name: recipientName || "Hóspede",
      reservation_code: reservationAny.reservation_code || "",
      checkin_date: checkinDate,
      checkout_date: checkoutDate,
      checkin_time: checkinTime,
      checkout_time: checkoutTime,
      total_amount: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(reservationAny.total_amount || 0)),
      paid_amount: new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(reservationAny.paid_amount || 0)),
      payment_status: "Pago",
      room_number: reservationAny.rooms?.room_number || "",
      room_name: reservationAny.rooms?.name || "",
      room_password: reservationAny.rooms?.fixed_password || "",
      room_category: reservationAny.room_categories?.name || "",
      category_name: reservationAny.room_categories?.name || "",
      adults: reservationAny.adults || 0,
      children: reservationAny.children || 0,
      hotel_name: hotelSettings?.name || "",
      hotel_address: hotelAddress,
      hotel_contact: hotelPhone,
      hotel_email: hotelSettings?.email || "",
      hotel_phone: hotelPhone,
      hotel_website: hotelSettings?.website || "",
      hotel_policies: hotelSettings?.policies || "",
      policies_link: policiesLink,
      web_checkin_link: webCheckinLink,
      logo_url: logoUrl || "",
      hotel_logo: hotelLogo || "",
    };

    // Processar template com suporte a condicionais {{#if}}
    const processConditionals = (templateStr: string, vars: Record<string, any>): string => {
      let processed = templateStr;
      let changed = true;
      let iterations = 0;
      const maxIterations = 100;

      while (changed && iterations < maxIterations) {
        iterations++;
        changed = false;

        // Regex para encontrar blocos {{#if}}...{{/if}} com suporte a {{else}}
        // Usar [\s\S] para capturar qualquer caractere incluindo quebras de linha
        const ifElseRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
        processed = processed.replace(ifElseRegex, (fullMatch, variableName, ifContent, elseContent) => {
          const value = vars[variableName];
          const isTruthy = value !== null && 
                          value !== undefined && 
                          value !== '' && 
                          value !== 0 && 
                          value !== false && 
                          (typeof value === 'string' ? value.trim() !== '' : true);

          if (isTruthy) {
            changed = true;
            return ifContent;
          } else {
            if (elseContent !== undefined && elseContent !== null) {
              changed = true;
              return elseContent;
            }
            return '';
          }
        });
        
        // Remover blocos {{/if}} soltos que possam ter sobrado (caso de condicionais aninhadas mal processadas)
        processed = processed.replace(/\{\{\/if\}\}/g, '');
      }
      return processed;
    };

    // Processar template (primeiro condicionais, depois variáveis)
    const processTemplate = (templateStr: string, vars: Record<string, any>): string => {
      // Primeiro processar condicionais
      let processed = processConditionals(templateStr, vars);
      
      // Depois substituir variáveis
      Object.keys(vars).forEach((key) => {
        const value = vars[key];
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
        processed = processed.replace(regex, value?.toString() || "");
      });
      
      return processed;
    };

    const subject = processTemplate(template.subject, variables);
    const bodyHtml = processTemplate(template.body_html, variables);

    // Tentar enviar email diretamente primeiro (apenas para Resend/SendGrid)
    // Para SMTP, ir direto para a fila que já tem a lógica correta
    let emailSent = false;
    
    // Apenas tentar envio direto se for Resend ou SendGrid (não SMTP)
    if (emailSettings.provider === "resend" || emailSettings.provider === "sendgrid") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const emailFunctionName = emailSettings.provider === "resend" 
          ? "send-email-resend" 
          : "send-email-sendgrid";

        console.log(`📧 Tentando enviar email via ${emailFunctionName} para: ${recipientEmail}`);

        const requestBody: any = {
          to: recipientEmail,
          to_name: recipientName,
          subject: subject,
          html: bodyHtml,
          from: emailSettings.sender_email,
          from_name: emailSettings.sender_name,
          api_key: emailSettings.api_key || "",
        };

        const response = await fetch(`${supabaseUrl}/functions/v1/${emailFunctionName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify(requestBody),
        });

        if (response.ok) {
          emailSent = true;
          console.log(`✅ Email de pagamento confirmado enviado com sucesso para: ${recipientEmail}`);
        } else {
          const errorText = await response.text();
          console.warn(`⚠️ Erro ao enviar email (${response.status}):`, errorText);
        }
      } catch (fetchError) {
        console.warn("⚠️ Erro ao chamar Edge Function de email:", fetchError);
      }
    } else {
      // Para SMTP, não tentar envio direto - ir direto para a fila
      console.log(`📧 Provider SMTP detectado, adicionando email à fila para processamento: ${recipientEmail}`);
    }

    // Se não foi enviado, adicionar à fila de emails usando função SQL que bypassa RLS
    if (!emailSent) {
      try {
        // Usar função SQL que bypassa RLS
        const { data: queueId, error: queueError } = await supabaseClient.rpc('insert_email_queue', {
          p_template_id: template.id,
          p_event_type: 'payment.confirmed',
          p_recipient_email: recipientEmail,
          p_recipient_name: recipientName,
          p_subject: subject,
          p_body_html: bodyHtml,
          p_reservation_id: reservationId,
          p_variables: variables,
          p_priority: 1,
        });

        if (queueError) {
          console.error("❌ Erro ao adicionar email à fila via RPC:", queueError);
          console.error("❌ Código:", queueError.code);
          console.error("❌ Mensagem:", queueError.message);
          
          // Fallback: tentar inserção direta (Service Role Key deveria bypassar RLS)
          console.log("⚠️ Tentando inserção direta como fallback...");
          const { error: directError } = await supabaseClient.from("email_queue").insert({
            template_id: template.id,
            event_type: "payment.confirmed",
            recipient_email: recipientEmail,
            recipient_name: recipientName,
            subject: subject,
            body_html: bodyHtml,
            reservation_id: reservationId,
            variables: variables,
            priority: 1,
          });

          if (directError) {
            console.error("❌ Erro também na inserção direta:", directError);
          } else {
            console.log(`✅ Email adicionado à fila via inserção direta para: ${recipientEmail}`);
          }
        } else {
          console.log(`✅ [sendPaymentConfirmedEmail] Email de pagamento confirmado adicionado à fila (ID: ${queueId}) para: ${recipientEmail}`);
          
          // Processar email imediatamente após adicionar à fila
          try {
            console.log(`📧 [sendPaymentConfirmedEmail] Processando email da fila imediatamente (ID: ${queueId})...`);
            
            // Buscar item da fila
            const { data: queueItem, error: fetchError } = await supabaseClient
              .from("email_queue")
              .select("*")
              .eq("id", queueId)
              .maybeSingle();

            if (fetchError || !queueItem) {
              console.warn(`⚠️ [sendPaymentConfirmedEmail] Erro ao buscar item da fila (ID: ${queueId}):`, fetchError);
            } else {
              // Atualizar status para "sending"
              await supabaseClient
                .from("email_queue")
                .update({ status: "sending" })
                .eq("id", queueId);

              // Processar email baseado no provider
              let emailProcessed = false;
              try {
                const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
                
                if (emailSettings.provider === "smtp") {
                  // Chamar Edge Function send-email-smtp
                  const smtpResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-smtp`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    },
                    body: JSON.stringify({
                      to: queueItem.recipient_email,
                      to_name: queueItem.recipient_name,
                      from: emailSettings.sender_email,
                      from_name: emailSettings.sender_name,
                      reply_to: emailSettings.reply_to_email || emailSettings.sender_email,
                      subject: queueItem.subject,
                      html: queueItem.body_html,
                      text: queueItem.body_text || "",
                      smtp_config: {
                        host: emailSettings.smtp_host,
                        port: emailSettings.smtp_port || 587,
                        secure: emailSettings.smtp_secure || false,
                        auth: {
                          user: emailSettings.smtp_username,
                          pass: emailSettings.smtp_password,
                        },
                      },
                    }),
                  });

                  if (smtpResponse.ok) {
                    emailProcessed = true;
                    await supabaseClient
                      .from("email_queue")
                      .update({
                        status: "sent",
                        sent_at: new Date().toISOString(),
                      })
                      .eq("id", queueId);
                    console.log(`✅ [sendPaymentConfirmedEmail] Email SMTP processado e enviado com sucesso (ID: ${queueId})`);
                  } else {
                    const errorText = await smtpResponse.text();
                    console.warn(`⚠️ [sendPaymentConfirmedEmail] Erro ao processar email SMTP (ID: ${queueId}):`, errorText);
                    await supabaseClient
                      .from("email_queue")
                      .update({
                        status: "pending",
                        error_message: errorText.substring(0, 500),
                      })
                      .eq("id", queueId);
                  }
                } else if (emailSettings.provider === "resend") {
                  // Chamar Edge Function send-email-resend
                  const resendResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-resend`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    },
                    body: JSON.stringify({
                      to: queueItem.recipient_email,
                      to_name: queueItem.recipient_name,
                      from: emailSettings.sender_email,
                      from_name: emailSettings.sender_name,
                      reply_to: emailSettings.reply_to_email || emailSettings.sender_email,
                      subject: queueItem.subject,
                      html: queueItem.body_html,
                      text: queueItem.body_text || "",
                      api_key: emailSettings.api_key || "",
                    }),
                  });

                  if (resendResponse.ok) {
                    emailProcessed = true;
                    await supabaseClient
                      .from("email_queue")
                      .update({
                        status: "sent",
                        sent_at: new Date().toISOString(),
                      })
                      .eq("id", queueId);
                    console.log(`✅ [sendPaymentConfirmedEmail] Email Resend processado e enviado com sucesso (ID: ${queueId})`);
                  } else {
                    const errorText = await resendResponse.text();
                    console.warn(`⚠️ [sendPaymentConfirmedEmail] Erro ao processar email Resend (ID: ${queueId}):`, errorText);
                    await supabaseClient
                      .from("email_queue")
                      .update({
                        status: "pending",
                        error_message: errorText.substring(0, 500),
                      })
                      .eq("id", queueId);
                  }
                } else if (emailSettings.provider === "sendgrid") {
                  // Chamar Edge Function send-email-sendgrid
                  const sendgridResponse = await fetch(`${supabaseUrl}/functions/v1/send-email-sendgrid`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    },
                    body: JSON.stringify({
                      to: queueItem.recipient_email,
                      to_name: queueItem.recipient_name,
                      from: emailSettings.sender_email,
                      from_name: emailSettings.sender_name,
                      reply_to: emailSettings.reply_to_email || emailSettings.sender_email,
                      subject: queueItem.subject,
                      html: queueItem.body_html,
                      text: queueItem.body_text || "",
                      api_key: emailSettings.api_key || "",
                    }),
                  });

                  if (sendgridResponse.ok) {
                    emailProcessed = true;
                    await supabaseClient
                      .from("email_queue")
                      .update({
                        status: "sent",
                        sent_at: new Date().toISOString(),
                      })
                      .eq("id", queueId);
                    console.log(`✅ [sendPaymentConfirmedEmail] Email SendGrid processado e enviado com sucesso (ID: ${queueId})`);
                  } else {
                    const errorText = await sendgridResponse.text();
                    console.warn(`⚠️ [sendPaymentConfirmedEmail] Erro ao processar email SendGrid (ID: ${queueId}):`, errorText);
                    await supabaseClient
                      .from("email_queue")
                      .update({
                        status: "pending",
                        error_message: errorText.substring(0, 500),
                      })
                      .eq("id", queueId);
                  }
                }
              } catch (processError) {
                console.error(`❌ [sendPaymentConfirmedEmail] Erro ao processar email da fila (ID: ${queueId}):`, processError);
                await supabaseClient
                  .from("email_queue")
                  .update({
                    status: "pending",
                    error_message: processError instanceof Error ? processError.message.substring(0, 500) : String(processError).substring(0, 500),
                  })
                  .eq("id", queueId);
              }
            }
          } catch (processError) {
            console.warn(`⚠️ [sendPaymentConfirmedEmail] Erro ao processar email da fila (ID: ${queueId}):`, processError);
            // Não falhar aqui, pois o email está na fila e pode ser processado depois
          }
        }
      } catch (queueInsertError) {
        console.error(`❌ [sendPaymentConfirmedEmail] Erro ao inserir na fila de emails para reserva ${reservationId}:`, queueInsertError);
        console.error(`❌ [sendPaymentConfirmedEmail] Stack trace:`, queueInsertError instanceof Error ? queueInsertError.stack : 'N/A');
      }
    } else {
      console.log(`✅ [sendPaymentConfirmedEmail] Email enviado diretamente com sucesso para: ${recipientEmail}`);
    }
  } catch (error) {
    console.error(`❌ [sendPaymentConfirmedEmail] Erro geral ao enviar email de pagamento confirmado para reserva ${reservationId}:`, error);
    console.error(`❌ [sendPaymentConfirmedEmail] Stack trace:`, error instanceof Error ? error.stack : 'N/A');
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Criar cliente Supabase com Service Role Key (bypass RLS)
    // Isso permite que a função funcione sem autenticação do usuário
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    
    // Verificar se Service Role Key está configurada
    if (!supabaseServiceKey) {
      console.error("❌ SUPABASE_SERVICE_ROLE_KEY não configurada");
    }

    // Verificar se tem stripe-signature (autenticação do Stripe)
    const signature = req.headers.get("stripe-signature");
    
    if (!signature) {
      return new Response(
        JSON.stringify({ 
          error: "Missing stripe-signature header",
          message: "This endpoint requires Stripe webhook signature for authentication"
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.text();

    if (!signature) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Buscar configuração global para determinar webhook secret
    const { data: globalConfig } = await supabaseClient
      .from("stripe_global_config")
      .select("test_mode, webhook_secret_test, webhook_secret_live")
      .single();

    const isTestMode = globalConfig?.test_mode ?? true;
    const webhookSecret = isTestMode
      ? globalConfig?.webhook_secret_test
      : globalConfig?.webhook_secret_live;

    if (!webhookSecret) {
      return new Response(
        JSON.stringify({ error: "Webhook secret not configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let event: Stripe.Event;

    try {
      // No Deno, precisamos usar constructEventAsync em vez de constructEvent
      // porque SubtleCryptoProvider não pode ser usado em contexto síncrono
      event = await Stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret
      ) as Stripe.Event;
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return new Response(
        JSON.stringify({ error: `Webhook Error: ${err.message}` }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Salvar webhook no banco
    const { data: webhook } = await supabaseClient
      .from("stripe_webhooks")
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event as any,
        processed: false,
      })
      .select()
      .single();

    // Processar eventos
    let processed = false;
    let errorMessage: string | null = null;

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          
          // Buscar o pagamento no banco para obter reservation_id, quote_id e payment_type
          const { data: payment, error: paymentFetchError } = await supabaseClient
            .from("stripe_payments")
            .select("id, reservation_id, quote_id, amount, payment_type, establishment_id, metadata")
            .eq("stripe_payment_intent_id", paymentIntent.id)
            .single();

          if (paymentFetchError) {
            console.error("Error fetching payment:", paymentFetchError);
            throw paymentFetchError;
          }

          // Atualizar pagamento no banco
          const { error: updateError } = await supabaseClient
            .from("stripe_payments")
            .update({
              status: paymentIntent.status,
              receipt_url: paymentIntent.charges?.data[0]?.receipt_url || null,
            })
            .eq("stripe_payment_intent_id", paymentIntent.id);

          if (updateError) {
            throw updateError;
          }

          // Se houver reservation_id, registrar pagamento no PMS e atualizar reserva
          if (payment?.reservation_id) {
            // Buscar a reserva atual para obter o paid_amount existente, establishment_id e status
            const { data: reservation, error: reservationFetchError } = await supabaseClient
              .from("reservations")
              .select("paid_amount, total_amount, establishment_id, status")
              .eq("id", payment.reservation_id)
              .single();

            if (reservationFetchError) {
              console.error("Error fetching reservation:", reservationFetchError);
            } else if (reservation) {
              // Registrar pagamento na tabela payments do PMS
              const establishmentId = reservation.establishment_id || payment.establishment_id;
              if (establishmentId) {
                try {
                  // Buscar configuração do Stripe do estabelecimento
                  const { data: globalConfig } = await supabaseClient
                    .from("stripe_global_config")
                    .select("test_mode")
                    .single();

                  const { data: establishmentConfig } = await supabaseClient
                    .from("stripe_establishment_config")
                    .select("test_secret_key, live_secret_key")
                    .eq("establishment_id", establishmentId)
                    .maybeSingle();

                  // Obter chave secreta baseada no modo (test ou live)
                  const isTestMode = globalConfig?.test_mode ?? true;
                  const stripeSecretKey = isTestMode
                    ? establishmentConfig?.test_secret_key
                    : establishmentConfig?.live_secret_key;

                  if (stripeSecretKey) {
                    const stripeClient = new Stripe(stripeSecretKey, {
                      apiVersion: "2023-10-16",
                    });
                    
                    await registerStripePaymentInPMS(
                      supabaseClient,
                      payment.reservation_id,
                      establishmentId,
                      paymentIntent,
                      payment.id,
                      stripeClient
                    );
                  } else {
                    console.warn(`⚠️ Chave secreta do Stripe não configurada para estabelecimento ${establishmentId} (modo: ${isTestMode ? 'test' : 'live'}), pulando registro no PMS`);
                  }
                } catch (pmsError) {
                  console.error("Error registering payment in PMS:", pmsError);
                  // Não bloquear o processamento se falhar
                }
              }

              // Calcular novo paid_amount (somar o valor pago ao que já estava pago)
              const currentPaidAmount = Number(reservation.paid_amount || 0);
              const paymentAmount = Number(payment.amount || 0);
              
              // Se for extensão, o total_amount pode ser atualizado pelo metadata
              // Caso contrário, usar o total_amount atual da reserva
              let totalAmount = Number(reservation.total_amount || 0);

              // Preparar atualização da reserva (inicialmente vazio, será preenchido abaixo)
              const reservationUpdate: any = {};

              // Se o pagamento é de extensão, buscar metadata do payment intent para obter novas datas
              console.log(`[Webhook] Verificando payment_type: ${payment.payment_type}, reservation_id: ${payment.reservation_id}`);
              
              if (payment.payment_type === "extension") {
                console.log(`[Webhook] ✅ Pagamento é de extensão, buscando metadata...`);
                try {
                  // Buscar metadata do payment intent do Stripe
                  const { data: globalConfig } = await supabaseClient
                    .from("stripe_global_config")
                    .select("test_mode")
                    .single();

                  const { data: establishmentConfig } = await supabaseClient
                    .from("stripe_establishment_config")
                    .select("test_secret_key, live_secret_key")
                    .eq("establishment_id", establishmentId)
                    .maybeSingle();

                  const isTestMode = globalConfig?.test_mode ?? true;
                  const stripeSecretKey = isTestMode
                    ? establishmentConfig?.test_secret_key
                    : establishmentConfig?.live_secret_key;

                  if (stripeSecretKey) {
                    const stripeClient = new Stripe(stripeSecretKey, {
                      apiVersion: "2023-10-16",
                    });

                    // Buscar payment intent do Stripe para obter metadata
                    const stripePaymentIntent = await stripeClient.paymentIntents.retrieve(
                      paymentIntent.id
                    );

                    console.log(`[Webhook] Metadata do Payment Intent:`, JSON.stringify(stripePaymentIntent.metadata));

                    // Se houver metadata com checkout_date e total_amount, atualizar
                    if (stripePaymentIntent.metadata?.checkout_date) {
                      (reservationUpdate as any).checkout_date = stripePaymentIntent.metadata.checkout_date;
                      console.log(`[Webhook] ✅ checkout_date atualizado para: ${stripePaymentIntent.metadata.checkout_date}`);
                    } else {
                      console.log(`[Webhook] ⚠️ checkout_date não encontrado no metadata`);
                    }
                    
                    if (stripePaymentIntent.metadata?.total_amount) {
                      const newTotalAmount = parseFloat(stripePaymentIntent.metadata.total_amount);
                      (reservationUpdate as any).total_amount = newTotalAmount;
                      // Atualizar o totalAmount para o cálculo do paid_amount
                      totalAmount = newTotalAmount;
                      console.log(`[Webhook] ✅ total_amount atualizado para: ${newTotalAmount}`);
                    } else {
                      console.log(`[Webhook] ⚠️ total_amount não encontrado no metadata`);
                    }
                  } else {
                    console.log(`[Webhook] ⚠️ Chave secreta do Stripe não encontrada para estabelecimento ${establishmentId}`);
                  }
                } catch (metadataError) {
                  console.error("[Webhook] ❌ Erro ao buscar metadata do payment intent para extensão:", metadataError);
                  // Continuar sem atualizar datas se houver erro
                }
              } else {
                console.log(`[Webhook] ℹ️ Pagamento não é de extensão (payment_type: ${payment.payment_type}), pulando atualização de datas`);
              }

              // Calcular novo paid_amount DEPOIS de atualizar o totalAmount (se for extensão)
              // IMPORTANTE: Fazer isso DEPOIS de atualizar o totalAmount para garantir cálculo correto
              const newPaidAmount = currentPaidAmount + paymentAmount;
              
              // Adicionar paid_amount à atualização
              (reservationUpdate as any).paid_amount = newPaidAmount;
              
              // Atualizar status baseado no pagamento
              // Se o valor pago é maior ou igual ao total, status = "confirmed" (Pago)
              // Caso contrário, manter status atual ou definir como "pending" se necessário
              // IMPORTANTE: Se for pré-reserva (preregistration), efetivar automaticamente quando houver pagamento
              const isPreregistration = reservation.status === "preregistration";
              
              if (newPaidAmount >= totalAmount && totalAmount > 0) {
                (reservationUpdate as any).status = "confirmed";
                if (isPreregistration) {
                  console.log(`[Webhook] ✅ Pré-reserva efetivada automaticamente para "confirmed" (paid_amount: ${newPaidAmount} >= total_amount: ${totalAmount})`);
                } else {
                  console.log(`[Webhook] ✅ Status atualizado para "confirmed" (paid_amount: ${newPaidAmount} >= total_amount: ${totalAmount})`);
                }
              } else if (newPaidAmount > 0) {
                // Se pagou parcialmente, status pode ser "pending" ou manter o atual
                // Mas se já estava "confirmed", manter "confirmed"
                // Se for pré-reserva, efetivar como "pending" quando houver pagamento parcial
                if (isPreregistration) {
                  (reservationUpdate as any).status = "pending";
                  console.log(`[Webhook] ✅ Pré-reserva efetivada automaticamente para "pending" (pagamento parcial: ${newPaidAmount} < ${totalAmount})`);
                } else if (reservation.status !== "confirmed") {
                  (reservationUpdate as any).status = "pending";
                  console.log(`[Webhook] ℹ️ Status definido como "pending" (pagamento parcial: ${newPaidAmount} < ${totalAmount})`);
                } else {
                  console.log(`[Webhook] ℹ️ Mantendo status "confirmed" (já estava confirmado)`);
                }
              }

              // Atualizar reserva: status, paid_amount (e datas se for extensão)
              const { error: reservationUpdateError } = await supabaseClient
                .from("reservations")
                .update(reservationUpdate)
                .eq("id", payment.reservation_id);

              if (reservationUpdateError) {
                console.error("[Webhook] ❌ Error updating reservation:", reservationUpdateError);
                // Não lançar erro aqui para não quebrar o processamento do webhook
              } else {
                const updateDetails: string[] = [];
                const checkoutDate = (reservationUpdate as any).checkout_date;
                const totalAmountUpdate = (reservationUpdate as any).total_amount;
                if (checkoutDate) updateDetails.push(`checkout_date: ${checkoutDate}`);
                if (totalAmountUpdate) updateDetails.push(`total_amount: ${totalAmountUpdate}`);
                console.log(`[Webhook] ✅ Reserva ${payment.reservation_id} atualizada para status "confirmed" com paid_amount: ${newPaidAmount >= totalAmount ? totalAmount : newPaidAmount}${updateDetails.length > 0 ? `, ${updateDetails.join(', ')}` : ''}`);
                
                // Enviar email apropriado baseado no tipo de pagamento
                // IMPORTANTE: Sempre tentar enviar email quando pagamento for confirmado via Stripe
                try {
                  console.log(`[Webhook] 📧 Iniciando envio de email para reserva ${payment.reservation_id}, payment_type: ${payment.payment_type}`);
                  
                  if (payment.payment_type === "extension" && (reservationUpdate as any).checkout_date) {
                    // Se for extensão, enviar email específico de extensão
                    console.log(`[Webhook] 📧 Enviando email de extensão para reserva ${payment.reservation_id}`);
                    await sendReservationExtensionEmail(
                      payment.reservation_id,
                      (reservationUpdate as any).checkout_date,
                      supabaseClient,
                      req
                    );
                    console.log(`[Webhook] ✅ Email de extensão processado para reserva ${payment.reservation_id}`);
                  } else {
                    // Caso contrário, enviar email padrão de pagamento confirmado
                    console.log(`[Webhook] 📧 Enviando email de pagamento confirmado para reserva ${payment.reservation_id}`);
                    await sendPaymentConfirmedEmail(payment.reservation_id, supabaseClient, req);
                    console.log(`[Webhook] ✅ Email de pagamento confirmado processado para reserva ${payment.reservation_id}`);
                  }
                } catch (emailError) {
                  console.error(`[Webhook] ❌ Erro ao enviar email para reserva ${payment.reservation_id}:`, emailError);
                  console.error(`[Webhook] ❌ Stack trace:`, emailError instanceof Error ? emailError.stack : 'N/A');
                  // Não lançar erro aqui para não quebrar o processamento do webhook
                  // Mas garantir que o erro seja logado para debug
                }
              }
            }
          }

          // Processar pagamento de orçamento (quote_payment)
          const quoteId = payment?.quote_id || paymentIntent.metadata?.quote_id || payment?.metadata?.quote_id;
          // Verificar se é um pagamento de orçamento: tem quote_id OU payment_type é "quote_payment"
          if (quoteId) {
            console.log(`[Webhook] 💰 Processando pagamento de orçamento: ${quoteId} (payment_type: ${payment?.payment_type || 'não definido'})`);
            
            try {
              // Buscar dados do orçamento
              const { data: quote, error: quoteError } = await supabaseClient
                .from("quotes")
                .select("*")
                .eq("id", quoteId)
                .single();

              if (quoteError || !quote) {
                console.error(`[Webhook] ❌ Erro ao buscar orçamento ${quoteId}:`, quoteError);
                throw quoteError || new Error("Orçamento não encontrado");
              }

              // Verificar se já foi convertido
              if (quote.status === "converted" && quote.reservation_id) {
                console.log(`[Webhook] ℹ️ Orçamento ${quoteId} já foi convertido em reserva ${quote.reservation_id}`);
                // Atualizar o pagamento para apontar para a reserva existente
                await supabaseClient
                  .from("stripe_payments")
                  .update({ reservation_id: quote.reservation_id })
                  .eq("stripe_payment_intent_id", paymentIntent.id);
                break;
              }

              // Buscar ou criar cliente/hóspede
              let clientId = quote.client_id;
              let guestId = quote.guest_id;

              if (!clientId && quote.guest_email) {
                // Tentar encontrar cliente existente pelo email
                const { data: existingClient } = await supabaseClient
                  .from("clients")
                  .select("id")
                  .eq("email", quote.guest_email)
                  .maybeSingle();

                if (existingClient) {
                  clientId = existingClient.id;
                  guestId = existingClient.id;
                } else {
                  // Criar novo cliente
                  const { data: newClient, error: clientError } = await supabaseClient
                    .from("clients")
                    .insert({
                      full_name: quote.guest_name || "Cliente",
                      email: quote.guest_email || null,
                      phone: quote.guest_phone || null,
                    })
                    .select("id")
                    .single();

                  if (clientError) {
                    throw new Error(`Erro ao criar cliente: ${clientError.message}`);
                  }

                  clientId = newClient.id;
                  guestId = newClient.id;
                }
              }

              if (!clientId) {
                throw new Error("É necessário ter um cliente associado ao orçamento");
              }

              // Criar reserva usando a função create_reservation_with_lock
              const reservationData = {
                establishment_id: quote.establishment_id,
                room_id: quote.room_id || null,
                category_id: quote.category_id,
                guest_id: guestId,
                client_id: clientId,
                guest_name: quote.guest_name || null,
                adults: quote.adults || 1,
                children: quote.children || 0,
                total_amount: quote.total_amount || 0,
                paid_amount: quote.total_amount || 0, // Pagamento completo
                payment_status: "paid",
                status: "confirmed",
                notes: quote.notes || null,
                pricing_plan_id: quote.pricing_plan_id || null,
                created_by: quote.created_by || null,
                channel: quote.channel || "direct",
              };

              const { data: reservationResult, error: reservationError } = await supabaseClient.rpc(
                "create_reservation_with_lock",
                {
                  p_reservation_data: reservationData,
                  p_checkin_date: quote.checkin_date,
                  p_checkout_date: quote.checkout_date,
                  p_establishment_id: quote.establishment_id,
                  p_room_id: quote.room_id || null,
                  p_category_id: quote.category_id,
                }
              );

              if (reservationError || !reservationResult?.success) {
                throw new Error(reservationError?.message || "Erro ao criar reserva");
              }

              const newReservationId = reservationResult.reservation_id;

              // Atualizar orçamento como convertido
              const { error: updateQuoteError } = await supabaseClient
                .from("quotes")
                .update({
                  status: "converted",
                  reservation_id: newReservationId,
                  converted_at: new Date().toISOString(),
                })
                .eq("id", quoteId);

              if (updateQuoteError) {
                console.error(`[Webhook] ⚠️ Erro ao atualizar orçamento ${quoteId}:`, updateQuoteError);
                // Não lançar erro aqui, pois a reserva já foi criada
              }

              // Atualizar pagamento para apontar para a reserva criada
              await supabaseClient
                .from("stripe_payments")
                .update({ reservation_id: newReservationId })
                .eq("stripe_payment_intent_id", paymentIntent.id);

              // Registrar pagamento no PMS
              const establishmentId = quote.establishment_id;
              if (establishmentId) {
                try {
                  const { data: globalConfig } = await supabaseClient
                    .from("stripe_global_config")
                    .select("test_mode")
                    .single();

                  const { data: establishmentConfig } = await supabaseClient
                    .from("stripe_establishment_config")
                    .select("test_secret_key, live_secret_key")
                    .eq("establishment_id", establishmentId)
                    .maybeSingle();

                  const isTestMode = globalConfig?.test_mode ?? true;
                  const stripeSecretKey = isTestMode
                    ? establishmentConfig?.test_secret_key
                    : establishmentConfig?.live_secret_key;

                  if (stripeSecretKey) {
                    const stripeClient = new Stripe(stripeSecretKey, {
                      apiVersion: "2023-10-16",
                    });
                    
                    await registerStripePaymentInPMS(
                      supabaseClient,
                      newReservationId,
                      establishmentId,
                      paymentIntent,
                      payment.id,
                      stripeClient
                    );
                  }
                } catch (pmsError) {
                  console.error(`[Webhook] ❌ Erro ao registrar pagamento no PMS para reserva ${newReservationId}:`, pmsError);
                }
              }

              // Enviar email de pagamento confirmado
              try {
                console.log(`[Webhook] 📧 Enviando email de pagamento confirmado para reserva ${newReservationId} (convertida de orçamento ${quoteId})`);
                await sendPaymentConfirmedEmail(newReservationId, supabaseClient, req);
                console.log(`[Webhook] ✅ Email de pagamento confirmado processado para reserva ${newReservationId}`);
              } catch (emailError) {
                console.error(`[Webhook] ❌ Erro ao enviar email para reserva ${newReservationId}:`, emailError);
              }

              console.log(`[Webhook] ✅ Orçamento ${quoteId} convertido em reserva ${newReservationId} com sucesso`);
            } catch (quoteError: any) {
              console.error(`[Webhook] ❌ Erro ao processar pagamento de orçamento ${quoteId}:`, quoteError);
              console.error(`[Webhook] ❌ Stack trace:`, quoteError?.stack);
              // Tentar atualizar o status do quote para "sent" mesmo em caso de erro parcial
              // para indicar que houve tentativa de processamento
              try {
                await supabaseClient
                  .from("quotes")
                  .update({ 
                    status: "sent",
                    // Manter o status atual se já estiver convertido
                  })
                  .eq("id", quoteId)
                  .neq("status", "converted");
              } catch (updateError) {
                console.error(`[Webhook] ❌ Erro ao atualizar status do quote após erro:`, updateError);
              }
              // Não lançar erro aqui para não quebrar o processamento do webhook
            }
          }
          
          // Log adicional se quoteId foi encontrado mas não processado
          if (quoteId && !payment?.reservation_id) {
            console.warn(`[Webhook] ⚠️ Quote ID encontrado (${quoteId}) mas não foi processado. Payment type: ${payment?.payment_type}, Reservation ID: ${payment?.reservation_id}`);
          }

          processed = true;
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          
          await supabaseClient
            .from("stripe_payments")
            .update({
              status: paymentIntent.status,
            })
            .eq("stripe_payment_intent_id", paymentIntent.id);

          processed = true;
          break;
        }

        case "charge.refunded": {
          const charge = event.data.object as Stripe.Charge;
          
          // Buscar pagamento relacionado
          const { data: payment } = await supabaseClient
            .from("stripe_payments")
            .select("*")
            .eq("stripe_payment_intent_id", charge.payment_intent)
            .single();

          if (payment) {
            // Buscar configuração do estabelecimento para obter secret key
            const { data: establishmentConfig } = await supabaseClient
              .from("stripe_establishment_config")
              .select("test_secret_key, live_secret_key")
              .eq("establishment_id", payment.establishment_id)
              .single();

            const secretKey = isTestMode 
              ? establishmentConfig?.test_secret_key
              : establishmentConfig?.live_secret_key;

            if (secretKey) {
              const stripe = new Stripe(secretKey, {
                apiVersion: "2023-10-16",
              });
              
              const refunds = await stripe.refunds.list({
                charge: charge.id,
                limit: 1,
              });

              if (refunds.data.length > 0) {
                const refund = refunds.data[0];
                
                await supabaseClient
                  .from("stripe_refunds")
                  .upsert(
                    {
                      establishment_id: payment.establishment_id,
                      payment_id: payment.id,
                      reservation_id: payment.reservation_id,
                      stripe_refund_id: refund.id,
                      amount: refund.amount / 100,
                      currency: refund.currency,
                      status: refund.status,
                      reason: refund.reason || null,
                      metadata: refund.metadata,
                    },
                    { onConflict: "stripe_refund_id" }
                  );
              }

              // Atualizar status do pagamento
              await supabaseClient
                .from("stripe_payments")
                .update({ status: "refunded" })
                .eq("id", payment.id);
            }
          }

          processed = true;
          break;
        }

        case "payment_method.attached": {
          // Método de pagamento anexado a um customer
          const paymentMethod = event.data.object as Stripe.PaymentMethod;
          
          if (paymentMethod.customer) {
            // Atualizar ou criar método de pagamento no banco
            const customerId = typeof paymentMethod.customer === "string"
              ? paymentMethod.customer
              : paymentMethod.customer.id;

            await supabaseClient
              .from("stripe_payment_methods")
              .upsert(
                {
                  stripe_payment_method_id: paymentMethod.id,
                  stripe_customer_id: customerId,
                  type: paymentMethod.type,
                  card_brand: paymentMethod.card?.brand,
                  card_last4: paymentMethod.card?.last4,
                  card_exp_month: paymentMethod.card?.exp_month,
                  card_exp_year: paymentMethod.card?.exp_year,
                  is_active: true,
                },
                { onConflict: "stripe_payment_method_id" }
              );
          }

          processed = true;
          break;
        }

        default:
          console.log(`Unhandled event type: ${event.type}`);
          processed = true;
      }

      // Marcar webhook como processado
      await supabaseClient
        .from("stripe_webhooks")
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq("id", webhook.id);
    } catch (error) {
      errorMessage = error.message;
      console.error("Error processing webhook:", error);

      // Marcar webhook com erro
      await supabaseClient
        .from("stripe_webhooks")
        .update({
          processed: false,
          error_message: errorMessage,
        })
        .eq("id", webhook.id);
    }

    return new Response(
      JSON.stringify({
        received: true,
        processed,
        event_type: event.type,
        error: errorMessage,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error handling webhook:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

