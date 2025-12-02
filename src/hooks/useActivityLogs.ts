import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedEstablishmentId } from "@/lib/establishmentUtils";
import { useEstablishment } from "@/contexts/EstablishmentContext";

export interface ActivityLog {
  id: string;
  establishment_id: string;
  user_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  entity_code: string | null;
  description: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  metadata: Record<string, any> | null;
  created_at: string;
  user?: {
    email?: string;
    full_name?: string;
  };
}

export interface ActivityLogsFilters {
  actionType?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export const useActivityLogs = (filters?: ActivityLogsFilters) => {
  const { selectedEstablishment } = useEstablishment();

  const getEstablishmentId = (): string | null => {
    if (selectedEstablishment?.id) {
      localStorage.setItem("selectedEstablishmentId", selectedEstablishment.id);
      return selectedEstablishment.id;
    }
    return getSelectedEstablishmentId();
  };

  const activityLogsQuery = useQuery({
    queryKey: ["activity_logs", selectedEstablishment?.id, filters],
    queryFn: async () => {
      const establishmentId = getEstablishmentId();
      if (!establishmentId) return [];

      let query = supabase
        .from("activity_logs")
        .select("*")
        .eq("establishment_id", establishmentId)
        .order("created_at", { ascending: false })
        .limit(1000); // Limitar a 1000 registros mais recentes

      // Aplicar filtros
      if (filters?.actionType) {
        query = query.eq("action_type", filters.actionType);
      }

      // Se filtrar por entityType e entityId (ex: reservation), buscar também logs relacionados
      // através de entity_code ou metadata.reservation_id
      let allLogs: any[] = [];
      
      if (filters?.entityType && filters?.entityId) {
        // Se for uma reserva, buscar logs relacionados também via código e metadata
        if (filters.entityType === "reservation") {
          // Buscar o código da reserva primeiro
          const { data: reservationData } = await supabase
            .from("reservations")
            .select("reservation_code")
            .eq("id", filters.entityId)
            .single();
          
          const reservationCode = reservationData?.reservation_code;
          
          // Buscar logs em múltiplas queries e combinar resultados
          const queries = [];
          
          // 1. Logs diretos da reserva
          let q1 = supabase
            .from("activity_logs")
            .select("*")
            .eq("establishment_id", establishmentId)
            .eq("entity_type", "reservation")
            .eq("entity_id", filters.entityId);
          queries.push(q1);
          
          // 2. Logs relacionados via entity_code (reservation_code)
          if (reservationCode) {
            let q2 = supabase
              .from("activity_logs")
              .select("*")
              .eq("establishment_id", establishmentId)
              .eq("entity_code", reservationCode);
            queries.push(q2);
          }
          
          // 3. Logs relacionados via metadata.reservation_id
          let q3 = supabase
            .from("activity_logs")
            .select("*")
            .eq("establishment_id", establishmentId)
            .eq("metadata->>reservation_id", filters.entityId);
          queries.push(q3);
          
          // 4. Logs relacionados via metadata.reservation_code
          if (reservationCode) {
            let q4 = supabase
              .from("activity_logs")
              .select("*")
              .eq("establishment_id", establishmentId)
              .eq("metadata->>reservation_code", reservationCode);
            queries.push(q4);
          }
          
          // Executar todas as queries
          const results = await Promise.all(queries.map(q => q));
          
          // Combinar resultados e remover duplicatas
          const logIds = new Set<string>();
          results.forEach(({ data: logs }) => {
            if (logs) {
              logs.forEach((log: any) => {
                if (!logIds.has(log.id)) {
                  logIds.add(log.id);
                  allLogs.push(log);
                }
              });
            }
          });
          
          // Aplicar outros filtros aos logs combinados
          let filteredLogs = allLogs;
          
          if (filters?.actionType) {
            filteredLogs = filteredLogs.filter(log => log.action_type === filters.actionType);
          }
          
          if (filters?.userId) {
            if (filters.userId === "system") {
              filteredLogs = filteredLogs.filter(log => !log.user_id);
            } else {
              filteredLogs = filteredLogs.filter(log => log.user_id === filters.userId);
            }
          }
          
          if (filters?.startDate) {
            filteredLogs = filteredLogs.filter(log => log.created_at >= filters.startDate);
          }
          
          if (filters?.endDate) {
            filteredLogs = filteredLogs.filter(log => log.created_at <= filters.endDate);
          }
          
          if (filters?.search) {
            const searchLower = filters.search.toLowerCase();
            filteredLogs = filteredLogs.filter(log => 
              log.description?.toLowerCase().includes(searchLower) ||
              log.entity_code?.toLowerCase().includes(searchLower)
            );
          }
          
          // Ordenar por data (mais recente primeiro) e limitar
          filteredLogs.sort((a, b) => 
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          allLogs = filteredLogs.slice(0, 1000);
        } else {
          // Para outros tipos de entidade, usar filtro normal
          query = query.eq("entity_type", filters.entityType);
          query = query.eq("entity_id", filters.entityId);
        }
      } else {
        // Se não houver entityId, aplicar filtro normal de entityType
        if (filters?.entityType) {
          query = query.eq("entity_type", filters.entityType);
        }

        if (filters?.entityId) {
          query = query.eq("entity_id", filters.entityId);
        }
      }

      // Se não foi uma busca especial de reserva, usar query normal
      let data: any[] = [];
      let error: any = null;
      
      if (allLogs.length === 0 && (!filters?.entityType || filters.entityType !== "reservation" || !filters?.entityId)) {
        if (filters?.userId) {
          if (filters.userId === "system") {
            query = query.is("user_id", null);
          } else {
            query = query.eq("user_id", filters.userId);
          }
        }

        if (filters?.startDate) {
          query = query.gte("created_at", filters.startDate);
        }

        if (filters?.endDate) {
          query = query.lte("created_at", filters.endDate);
        }

        if (filters?.search) {
          query = query.or(
            `description.ilike.%${filters.search}%,entity_code.ilike.%${filters.search}%`
          );
        }

        const result = await query;
        data = result.data || [];
        error = result.error;
      } else {
        data = allLogs;
      }

      if (error) {
        console.error("Erro ao buscar logs de atividade:", error);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      // Buscar dados dos usuários separadamente
      const userIds = [...new Set(data.map((log: any) => log.user_id).filter(Boolean))];
      let usersMap: Record<string, { email: string; full_name: string | null }> = {};

      if (userIds.length > 0) {
        // Tentar buscar da tabela public.users primeiro
        const { data: usersData, error: usersError } = await supabase
          .from("users")
          .select("id, email, full_name")
          .in("id", userIds);

        if (!usersError && usersData) {
          usersData.forEach((user: any) => {
            usersMap[user.id] = {
              email: user.email || "",
              full_name: user.full_name || null,
            };
          });
        }

        // Para usuários não encontrados em public.users, tentar buscar do auth via admin API
        // Por enquanto, vamos apenas usar o que encontramos
      }

      // Processar dados do usuário
      return (data || []).map((log: any) => ({
        ...log,
        user: log.user_id && usersMap[log.user_id]
          ? {
              email: usersMap[log.user_id].email,
              full_name: usersMap[log.user_id].full_name || usersMap[log.user_id].email,
            }
          : log.user_id
          ? {
              email: log.user_id.substring(0, 8) + "...",
              full_name: null,
            }
          : null,
      })) as ActivityLog[];
    },
  });

  return {
    logs: activityLogsQuery.data || [],
    isLoading: activityLogsQuery.isLoading,
    refetch: activityLogsQuery.refetch,
  };
};

