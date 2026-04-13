import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function getReservationApiUrl(): string {
  const pms = (import.meta.env.VITE_PMS_API_URL as string | undefined)?.replace(/\/+$/, "");
  if (pms) return `${pms}/api/legacy/get-reservation`;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  return `${String(supabaseUrl).replace(/\/$/, "")}/functions/v1/get-reservation`;
}

interface ReservationRequest {
  identifier?: string; // identification_number
  locator?: string; // reservation_code ou locator do web_checkin
  reservation_code?: string; // reservation_code
}

interface GuestData {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  document_number: string | null;
  birth_date?: string | null;
}

interface RoomData {
  id: string;
  room_number: string;
  name: string | null;
  fixed_password: string | null;
  authentication_type: string | null;
}

interface CategoryData {
  id: string;
  name: string;
  capacity_adults: number | null;
  capacity_children: number | null;
  building_id: string | null;
}

interface EstablishmentData {
  id: string;
  name: string;
}

interface PaymentData {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  notes: string | null;
}

interface WebCheckinData {
  id: string;
  locator: string;
  status: string;
  token: string | null;
  expires_at: string | null;
}

interface ReservationResponse {
  success: boolean;
  reservation: {
    id: string;
    reservation_code: string;
    identification_number: string | null;
    checkin_date: string;
    checkout_date: string;
    checkin_time: string | null;
    checkout_time: string | null;
    total_amount: number;
    paid_amount: number | null;
    payment_status: string | null;
    status: string;
    guest: GuestData | null;
    financial_responsible: GuestData | null;
    room: RoomData | null;
    category: CategoryData | null;
    establishment: EstablishmentData | null;
    payments: PaymentData[];
    web_checkin: WebCheckinData | null;
  };
}

/**
 * Hook para buscar informações de reserva usando o endpoint API
 * Suporta busca por identificador, localizador ou reservation_code
 */
export const useReservationApi = () => {
  const queryClient = useQueryClient();

  /**
   * Buscar reserva por identificador, localizador ou reservation_code
   * @param params - Parâmetros de busca
   * @param requireAuth - Se true, requer autenticação (padrão: true)
   */
  const useGetReservation = (
    params: ReservationRequest,
    requireAuth: boolean = true
  ) => {
    return useQuery({
      queryKey: ["reservation_api", params],
      enabled: !!(params.identifier || params.locator || params.reservation_code),
      queryFn: async () => {
        // Verificar autenticação se necessário
        if (requireAuth) {
          const { data: { session } } = await supabase.auth.getSession();
          const guestAccountId = localStorage.getItem("guest_account_id");
          
          if (!session && !guestAccountId) {
            throw new Error("Autenticação necessária para acessar informações da reserva");
          }
        }

        // Obter URL da função edge
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const functionUrl = `${supabaseUrl}/functions/v1/get-reservation`;

        // Preparar headers
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };

        // Adicionar autenticação
        const { data: { session } } = await supabase.auth.getSession();
        const guestAccountId = localStorage.getItem("guest_account_id");
        
        // Se tiver sessão de usuário, usar token
        if (session?.access_token) {
          headers["Authorization"] = `Bearer ${session.access_token}`;
        } else if (guestAccountId) {
          // Para guest_account, não precisamos de token (a função verificará guest_account_id)
          // Mas ainda precisamos do header Authorization com anon key para passar pela validação básica
          headers["Authorization"] = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
        } else {
          throw new Error("Autenticação necessária. Faça login ou forneça guest_account_id");
        }

        // Preparar body para POST
        const requestBody = {
          ...params,
          // Se for guest_account, incluir guest_account_id
          guest_account_id: guestAccountId || undefined,
        };

        // Fazer requisição POST
        const response = await fetch(functionUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Erro ao buscar reserva: ${response.statusText}`);
        }

        const data: ReservationResponse = await response.json();
        return data;
      },
      retry: 1,
      staleTime: 30000, // Cache por 30 segundos
    });
  };

  /**
   * Buscar reserva por identificador (identification_number)
   */
  const useGetReservationByIdentifier = (identifier: string, requireAuth: boolean = true) => {
    return useGetReservation({ identifier }, requireAuth);
  };

  /**
   * Buscar reserva por localizador (reservation_code ou locator do web_checkin)
   */
  const useGetReservationByLocator = (locator: string, requireAuth: boolean = true) => {
    return useGetReservation({ locator }, requireAuth);
  };

  /**
   * Buscar reserva por reservation_code
   */
  const useGetReservationByCode = (reservationCode: string, requireAuth: boolean = true) => {
    return useGetReservation({ reservation_code: reservationCode }, requireAuth);
  };

  /**
   * Mutation para buscar reserva (útil para refetch manual)
   */
  const fetchReservation = useMutation({
    mutationFn: async (params: ReservationRequest) => {
      // Verificar autenticação
      const { data: { session } } = await supabase.auth.getSession();
      const guestAccountId = localStorage.getItem("guest_account_id");
      
      if (!session && !guestAccountId) {
        throw new Error("Autenticação necessária para acessar informações da reserva");
      }

      const functionUrl = getReservationApiUrl();

      // Preparar headers
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      // Adicionar autenticação (guestAccountId já foi declarado acima)
      // Se tiver sessão de usuário, usar token
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      } else if (guestAccountId) {
        // Para guest_account, não precisamos de token (a função verificará guest_account_id)
        // Mas ainda precisamos do header Authorization com anon key para passar pela validação básica
        headers["Authorization"] = `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`;
      } else {
        throw new Error("Autenticação necessária. Faça login ou forneça guest_account_id");
      }

      // Fazer requisição POST
      const response = await fetch(functionUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...params,
          guest_account_id: guestAccountId || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Erro ao buscar reserva: ${response.statusText}`);
      }

      const data: ReservationResponse = await response.json();
      return data;
    },
    onSuccess: (data, variables) => {
      // Invalidar cache da query
      queryClient.invalidateQueries({ queryKey: ["reservation_api", variables] });
      toast.success("Reserva encontrada com sucesso!", {
        dismissible: true,
        duration: 3000,
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao buscar reserva", {
        dismissible: true,
        duration: 4000,
      });
    },
  });

  return {
    useGetReservation,
    useGetReservationByIdentifier,
    useGetReservationByLocator,
    useGetReservationByCode,
    fetchReservation,
  };
};

