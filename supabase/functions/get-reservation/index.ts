// Edge Function para buscar informações de reserva por identificador ou localizador
// Suporta GET e POST com autenticação

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ReservationRequest {
  identifier?: string; // identification_number
  locator?: string; // reservation_code ou locator do web_checkin
  reservation_code?: string; // reservation_code
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verificar autenticação (pode ser token de usuário ou guest_account_id)
    const authHeader = req.headers.get("Authorization");
    let hasAuth = !!authHeader;

    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verificar se é autenticação de hóspede (guest_account) ou admin/user
    let userAuth = null;
    let guestAccountId: string | null = null;
    
    // Se tiver Authorization header, tentar verificar como usuário admin/user
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      
      if (!userError && user) {
        userAuth = user;
      }
    }

    // Obter parâmetros da requisição
    let identifier: string | null = null;
    let locator: string | null = null;
    let reservationCode: string | null = null;

    if (req.method === "POST") {
      const body: ReservationRequest = await req.json();
      identifier = body.identifier || null;
      locator = body.locator || null;
      reservationCode = body.reservation_code || null;
      // Para POST, guest_account_id pode vir no body
      if (!userAuth && body.guest_account_id) {
        guestAccountId = body.guest_account_id;
      }
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      identifier = url.searchParams.get("identifier") || null;
      locator = url.searchParams.get("locator") || null;
      reservationCode = url.searchParams.get("reservation_code") || null;
      // Para GET, guest_account_id pode vir nos query params
      if (!userAuth) {
        guestAccountId = url.searchParams.get("guest_account_id");
      }
    }

    // Se não tem autenticação de usuário nem guest_account_id, retornar erro
    // Mas só verificar depois de obter os parâmetros

    // Validar que pelo menos um identificador foi fornecido
    if (!identifier && !locator && !reservationCode) {
      return new Response(
        JSON.stringify({ 
          error: "Missing identifier",
          message: "É necessário fornecer pelo menos um dos seguintes: identifier, locator ou reservation_code"
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Se não tem autenticação de usuário nem guest_account_id, retornar erro
    if (!userAuth && !guestAccountId) {
      return new Response(
        JSON.stringify({ 
          error: "Authentication required",
          message: "Autenticação necessária. Forneça um token de usuário ou guest_account_id"
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Buscar reserva
    let reservation = null;
    let webCheckin = null;

    // Tentar buscar por identification_number
    if (identifier) {
      const { data: reservationByIdentifier, error: errorIdentifier } = await supabase
        .from("reservations")
        .select(`
          id,
          reservation_code,
          identification_number,
          checkin_date,
          checkout_date,
          checkin_time,
          checkout_time,
          total_amount,
          paid_amount,
          payment_status,
          status,
          guest_id,
          client_id,
          room_id,
          category_id,
          establishment_id
        `)
        .eq("identification_number", identifier)
        .maybeSingle();

      if (!errorIdentifier && reservationByIdentifier) {
        reservation = reservationByIdentifier;
      }
    }

    // Se não encontrou por identifier, tentar por reservation_code
    if (!reservation && (reservationCode || locator)) {
      const searchCode = reservationCode || locator;
      const { data: reservationByCode, error: errorCode } = await supabase
        .from("reservations")
        .select(`
          id,
          reservation_code,
          identification_number,
          checkin_date,
          checkout_date,
          checkin_time,
          checkout_time,
          total_amount,
          paid_amount,
          payment_status,
          status,
          guest_id,
          client_id,
          room_id,
          category_id,
          establishment_id
        `)
        .eq("reservation_code", searchCode)
        .maybeSingle();

      if (!errorCode && reservationByCode) {
        reservation = reservationByCode;
      }
    }

    // Se não encontrou por reservation_code, tentar buscar pelo locator do web_checkin
    if (!reservation && locator) {
      const { data: webCheckinByLocator, error: errorWebCheckin } = await supabase
        .from("web_checkin")
        .select(`
          id,
          reservation_id,
          locator,
          status,
          token,
          expires_at
        `)
        .eq("locator", locator)
        .maybeSingle();

      if (!errorWebCheckin && webCheckinByLocator) {
        webCheckin = webCheckinByLocator;
        
        // Buscar reserva pelo reservation_id do web_checkin
        const { data: reservationByWebCheckin, error: errorReservation } = await supabase
          .from("reservations")
          .select(`
            id,
            reservation_code,
            identification_number,
            checkin_date,
            checkout_date,
            checkin_time,
            checkout_time,
            total_amount,
            paid_amount,
            payment_status,
            status,
            guest_id,
            client_id,
            room_id,
            category_id,
            establishment_id
          `)
          .eq("id", webCheckinByLocator.reservation_id)
          .maybeSingle();

        if (!errorReservation && reservationByWebCheckin) {
          reservation = reservationByWebCheckin;
        }
      }
    }

    // Se não encontrou reserva, retornar erro
    if (!reservation) {
      return new Response(
        JSON.stringify({ 
          error: "Reservation not found",
          message: "Reserva não encontrada com os identificadores fornecidos"
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // SEGURANÇA: Verificar se o usuário tem permissão para acessar esta reserva
    // Se for guest_account, verificar se a reserva está vinculada à conta
    // Se for usuário admin/user, permitir acesso (já autenticado acima)
    if (guestAccountId && !userAuth) {
      const { data: stayHistory, error: historyError } = await supabase
        .from("guest_stay_history")
        .select("guest_account_id")
        .eq("reservation_id", reservation.id)
        .eq("guest_account_id", guestAccountId)
        .maybeSingle();

      if (historyError || !stayHistory) {
        return new Response(
          JSON.stringify({ 
            error: "Access denied",
            message: "Você não tem permissão para acessar esta reserva. A reserva precisa estar vinculada à sua conta."
          }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Buscar dados relacionados
    const reservationId = reservation.id;

    // Buscar dados do hóspede
    let guest = null;
    if (reservation.guest_id) {
      const { data: guestData } = await supabase
        .from("clients")
        .select("id, full_name, email, phone, document_number, birth_date")
        .eq("id", reservation.guest_id)
        .maybeSingle();
      guest = guestData;
    }

    // Buscar dados do responsável financeiro
    let financialResponsible = null;
    if (reservation.client_id) {
      const { data: financialData } = await supabase
        .from("clients")
        .select("id, full_name, email, phone, document_number")
        .eq("id", reservation.client_id)
        .maybeSingle();
      financialResponsible = financialData;
    }

    // Buscar dados do quarto
    let room = null;
    if (reservation.room_id) {
      const { data: roomData } = await supabase
        .from("rooms")
        .select("id, room_number, name, fixed_password, authentication_type")
        .eq("id", reservation.room_id)
        .maybeSingle();
      room = roomData;
    }

    // Buscar dados da categoria
    let category = null;
    if (reservation.category_id) {
      const { data: categoryData } = await supabase
        .from("room_categories")
        .select("id, name, capacity_adults, capacity_children, building_id")
        .eq("id", reservation.category_id)
        .maybeSingle();
      category = categoryData;
    }

    // Buscar dados do estabelecimento
    let establishment = null;
    if (reservation.establishment_id) {
      const { data: establishmentData } = await supabase
        .from("establishments")
        .select("id, name")
        .eq("id", reservation.establishment_id)
        .maybeSingle();
      establishment = establishmentData;
    }

    // Buscar pagamentos
    const { data: payments } = await supabase
      .from("payments")
      .select("id, amount, payment_date, payment_method, notes")
      .eq("reservation_id", reservationId)
      .order("payment_date", { ascending: false });

    // Buscar web check-in relacionado
    if (!webCheckin) {
      const { data: webCheckinData } = await supabase
        .from("web_checkin")
        .select("id, locator, status, token, expires_at")
        .eq("reservation_id", reservationId)
        .maybeSingle();
      webCheckin = webCheckinData;
    }

    // Montar resposta
    const response = {
      success: true,
      reservation: {
        ...reservation,
        guest,
        financial_responsible: financialResponsible,
        room,
        category,
        establishment,
        payments: payments || [],
        web_checkin: webCheckin,
      },
    };

    return new Response(
      JSON.stringify(response),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Erro ao buscar reserva:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error",
        message: error.message || "Erro interno ao processar a requisição"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

