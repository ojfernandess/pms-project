import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { format, isValid } from "date-fns";
import { toast } from "sonner";

export interface RateInventory {
  id: string;
  establishment_id: string;
  category_id: string;
  date: string;
  total_rooms: number;
  available_rooms: number;
  confirmed_reservations: number;
  blocked_rooms: number;
  overbooking_allowed: number;
  created_at: string;
  updated_at: string;
}

export interface RateSalesStatus {
  id: string;
  establishment_id: string;
  category_id: string;
  date: string;
  status: 'open' | 'closed' | 'no_price' | 'restricted_ota' | 'restricted_booking_engine' | 'restricted_all';
  reason?: string;
  closed_by_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ARIData {
  inventory: RateInventory[];
  salesStatus: RateSalesStatus[];
  rateCalendar: any[];
}

export const useARISystem = () => {
  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();

  // Buscar inventário para um período
  const getInventory = (categoryId: string, startDate: Date, endDate: Date) => {
    // Validar datas
    const isValidStart = isValid(startDate);
    const isValidEnd = isValid(endDate);
    
    if (!isValidStart || !isValidEnd) {
      console.error('[useARISystem] Datas inválidas:', { startDate, endDate });
      return useQuery({
        queryKey: ['ari_inventory', selectedEstablishment?.id, categoryId, 'invalid-dates'],
        queryFn: async () => [],
        enabled: false,
      });
    }

    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const endDateStr = format(endDate, 'yyyy-MM-dd');

    return useQuery({
      queryKey: ['ari_inventory', selectedEstablishment?.id, categoryId, startDateStr, endDateStr],
      queryFn: async () => {
        if (!selectedEstablishment?.id || !categoryId) return [];

        const { data, error } = await supabase
          .from('rate_inventory')
          .select('*')
          .eq('establishment_id', selectedEstablishment.id)
          .eq('category_id', categoryId)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date', { ascending: true });

        if (error) {
          // Se a tabela não existe, retornar array vazio (migration não foi executada)
          if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
            console.warn('[useARISystem] Tabela rate_inventory não encontrada. Execute as migrations ARI.');
            return [];
          }
          throw error;
        }
        return (data || []) as RateInventory[];
      },
      enabled: !!selectedEstablishment?.id && !!categoryId && categoryId !== '' && isValidStart && isValidEnd,
    });
  };

  // Buscar status de venda para um período
  const getSalesStatus = (categoryId: string, startDate: Date, endDate: Date) => {
    // Validar datas
    const isValidStart = isValid(startDate);
    const isValidEnd = isValid(endDate);
    
    if (!isValidStart || !isValidEnd) {
      console.error('[useARISystem] Datas inválidas:', { startDate, endDate });
      return useQuery({
        queryKey: ['ari_sales_status', selectedEstablishment?.id, categoryId, 'invalid-dates'],
        queryFn: async () => [],
        enabled: false,
      });
    }

    const startDateStr = format(startDate, 'yyyy-MM-dd');
    const endDateStr = format(endDate, 'yyyy-MM-dd');

    return useQuery({
      queryKey: ['ari_sales_status', selectedEstablishment?.id, categoryId, startDateStr, endDateStr],
      queryFn: async () => {
        if (!selectedEstablishment?.id || !categoryId) return [];

        const { data, error } = await supabase
          .from('rate_sales_status')
          .select('*')
          .eq('establishment_id', selectedEstablishment.id)
          .eq('category_id', categoryId)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date', { ascending: true });

        if (error) {
          // Se a tabela não existe, retornar array vazio (migration não foi executada)
          if (error.code === 'PGRST116' || error.message?.includes('does not exist')) {
            console.warn('[useARISystem] Tabela rate_sales_status não encontrada. Execute as migrations ARI.');
            return [];
          }
          throw error;
        }
        return (data || []) as RateSalesStatus[];
      },
      enabled: !!selectedEstablishment?.id && !!categoryId && categoryId !== '' && isValidStart && isValidEnd,
    });
  };

  // Calcular disponibilidade para uma data específica
  const calculateAvailability = useMutation({
    mutationFn: async ({
      categoryId,
      date,
    }: {
      categoryId: string;
      date: Date;
    }) => {
      if (!selectedEstablishment?.id) throw new Error('Estabelecimento não selecionado');

      const { data, error } = await supabase.rpc('calculate_category_availability', {
        p_establishment_id: selectedEstablishment.id,
        p_category_id: categoryId,
        p_date: format(date, 'yyyy-MM-dd'),
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ari_inventory'] });
    },
  });

  // Sincronizar inventário manualmente
  const syncInventory = useMutation({
    mutationFn: async ({
      categoryId,
      date,
    }: {
      categoryId: string;
      date: Date;
    }) => {
      if (!selectedEstablishment?.id) throw new Error('Estabelecimento não selecionado');

      const { data, error } = await supabase.rpc('sync_rate_inventory_from_reservations', {
        p_establishment_id: selectedEstablishment.id,
        p_category_id: categoryId,
        p_date: format(date, 'yyyy-MM-dd'),
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ari_inventory'] });
      toast.success('Inventário sincronizado com sucesso');
    },
    onError: (error: any) => {
      toast.error('Erro ao sincronizar inventário: ' + error.message);
    },
  });

  // Atualizar status de venda
  const updateSalesStatus = useMutation({
    mutationFn: async ({
      categoryId,
      date,
      status,
      reason,
    }: {
      categoryId: string;
      date: Date;
      status: RateSalesStatus['status'];
      reason?: string;
    }) => {
      if (!selectedEstablishment?.id) throw new Error('Estabelecimento não selecionado');

      const dateStr = format(date, 'yyyy-MM-dd');

      // Verificar se já existe
      const { data: existing } = await supabase
        .from('rate_sales_status')
        .select('id')
        .eq('establishment_id', selectedEstablishment.id)
        .eq('category_id', categoryId)
        .eq('date', dateStr)
        .single();

      if (existing) {
        // Atualizar
        const { data, error } = await supabase
          .from('rate_sales_status')
          .update({
            status,
            reason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Criar novo
        const { data, error } = await supabase
          .from('rate_sales_status')
          .insert({
            establishment_id: selectedEstablishment.id,
            category_id: categoryId,
            date: dateStr,
            status,
            reason,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ari_sales_status'] });
      queryClient.invalidateQueries({ queryKey: ['ari_sales_status_bulk'] });
      toast.success('Status de venda atualizado');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar status: ' + error.message);
    },
  });

  // Edição em massa de status
  const bulkUpdateSalesStatus = useMutation({
    mutationFn: async ({
      categoryId,
      dates,
      status,
      reason,
    }: {
      categoryId: string;
      dates: Date[];
      status: RateSalesStatus['status'];
      reason?: string;
    }) => {
      if (!selectedEstablishment?.id) throw new Error('Estabelecimento não selecionado');

      const dateStrings = dates.map(d => format(d, 'yyyy-MM-dd'));

      // Buscar existentes
      const { data: existing } = await supabase
        .from('rate_sales_status')
        .select('id, date')
        .eq('establishment_id', selectedEstablishment.id)
        .eq('category_id', categoryId)
        .in('date', dateStrings);

      const existingDates = new Set(existing?.map(e => e.date) || []);
      const toInsert = dateStrings.filter(d => !existingDates.has(d));
      const toUpdate = existing?.filter(e => dateStrings.includes(e.date)) || [];

      // Atualizar existentes
      if (toUpdate.length > 0) {
        const { error: updateError } = await supabase
          .from('rate_sales_status')
          .update({
            status,
            reason,
            updated_at: new Date().toISOString(),
          })
          .in('id', toUpdate.map(e => e.id));

        if (updateError) throw updateError;
      }

      // Inserir novos
      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('rate_sales_status')
          .insert(
            toInsert.map(date => ({
              establishment_id: selectedEstablishment.id,
              category_id: categoryId,
              date,
              status,
              reason,
            }))
          );

        if (insertError) throw insertError;
      }

      return { updated: toUpdate.length, inserted: toInsert.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ari_sales_status'] });
      queryClient.invalidateQueries({ queryKey: ['ari_sales_status_bulk'] });
      toast.success('Status atualizado em massa');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar status em massa: ' + error.message);
    },
  });

  // Atualizar inventário manualmente
  const updateInventory = useMutation({
    mutationFn: async ({
      categoryId,
      date,
      available_rooms,
      overbooking_allowed,
    }: {
      categoryId: string;
      date: Date;
      available_rooms?: number;
      overbooking_allowed?: number;
    }) => {
      if (!selectedEstablishment?.id) throw new Error('Estabelecimento não selecionado');

      const dateStr = format(date, 'yyyy-MM-dd');

      // Verificar se já existe
      const { data: existing } = await supabase
        .from('rate_inventory')
        .select('id')
        .eq('establishment_id', selectedEstablishment.id)
        .eq('category_id', categoryId)
        .eq('date', dateStr)
        .single();

      const updateData: any = {};
      if (available_rooms !== undefined) updateData.available_rooms = available_rooms;
      if (overbooking_allowed !== undefined) updateData.overbooking_allowed = overbooking_allowed;

      if (existing) {
        // Atualizar
        const { data, error } = await supabase
          .from('rate_inventory')
          .update(updateData)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Criar novo (precisa buscar total_rooms primeiro)
        const { data: category } = await supabase
          .from('room_categories')
          .select('id')
          .eq('id', categoryId)
          .single();

        if (!category) throw new Error('Categoria não encontrada');

        // Calcular total de quartos
        const { count } = await supabase
          .from('rooms')
          .select('*', { count: 'exact', head: true })
          .eq('establishment_id', selectedEstablishment.id)
          .eq('category_id', categoryId)
          .eq('is_blocked', false);

        const { data, error } = await supabase
          .from('rate_inventory')
          .insert({
            establishment_id: selectedEstablishment.id,
            category_id: categoryId,
            date: dateStr,
            total_rooms: count || 0,
            available_rooms: available_rooms || count || 0,
            confirmed_reservations: 0,
            blocked_rooms: 0,
            overbooking_allowed: overbooking_allowed || 0,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ari_inventory'] });
      toast.success('Inventário atualizado');
    },
    onError: (error: any) => {
      toast.error('Erro ao atualizar inventário: ' + error.message);
    },
  });

  // Verificar se data está disponível para venda
  const checkDateAvailability = async (
    categoryId: string,
    date: Date,
    channel: 'booking_engine' | 'ota' | 'all' = 'booking_engine'
  ): Promise<boolean> => {
    if (!selectedEstablishment?.id) return false;

    const { data, error } = await supabase.rpc('is_date_available_for_sale', {
      p_establishment_id: selectedEstablishment.id,
      p_category_id: categoryId,
      p_date: format(date, 'yyyy-MM-dd'),
      p_channel: channel,
    });

    if (error) {
      console.error('Erro ao verificar disponibilidade:', error);
      return false;
    }

    return data || false;
  };

  return {
    getInventory,
    getSalesStatus,
    calculateAvailability,
    syncInventory,
    updateSalesStatus,
    bulkUpdateSalesStatus,
    updateInventory,
    checkDateAvailability,
  };
};

