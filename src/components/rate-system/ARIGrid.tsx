import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { format, addDays, eachDayOfInterval, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronLeft, ChevronRight, Edit2, ChevronDown, ChevronUp, AlertCircle, Save, X, RefreshCw, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/reservationUtils";
import { useRateSystem, RatePlan } from "@/hooks/useRateSystem";
import { useARISystem } from "@/hooks/useARISystem";
import { toast } from "sonner";
import { useEstablishment } from "@/contexts/EstablishmentContext";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ARIBulkEditDialog } from "./ARIBulkEditDialog";
import { OccupancyPriceEditDialog } from "./OccupancyPriceEditDialog";
import { supabase } from "@/integrations/supabase/client";

interface ARIGridProps {
  ratePlans: RatePlan[];
  categories: any[];
  selectedCategory: string;
  selectedRatePlan: string;
  startDate: Date;
  onCategoryChange: (category: string) => void;
  onPlanChange: (plan: string) => void;
  onStartDateChange: (date: Date) => void;
}

interface ExpandedPlans {
  [categoryId: string]: {
    [planId: string]: boolean;
  };
}

interface EditingCell {
  categoryId: string;
  planId: string;
  date: string;
  field: string;
  value: any;
}

export const ARIGrid = ({
  ratePlans,
  categories,
  selectedCategory,
  selectedRatePlan,
  startDate,
  onCategoryChange,
  onPlanChange,
  onStartDateChange,
}: ARIGridProps) => {
  const [viewDays, setViewDays] = useState(30);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [expandedPlans, setExpandedPlans] = useState<ExpandedPlans>({});
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [statusEditDialog, setStatusEditDialog] = useState<{
    open: boolean;
    categoryId: string;
    date: Date | null;
    status: 'open' | 'closed' | 'no_price' | null;
  }>({ open: false, categoryId: '', date: null, status: null });
  const [occupancyPriceDialog, setOccupancyPriceDialog] = useState<{
    open: boolean;
    categoryId: string;
    categoryName: string;
    planId: string;
    planName: string;
    date: Date | null;
    occupancy: number;
  }>({ 
    open: false, 
    categoryId: '', 
    categoryName: '',
    planId: '', 
    planName: '',
    date: null, 
    occupancy: 2 
  });

  const { selectedEstablishment } = useEstablishment();
  const queryClient = useQueryClient();
  const { rateCalendar, isLoadingCalendar, upsertRateCalendar } = useRateSystem();
  const {
    updateSalesStatus,
    bulkUpdateSalesStatus,
    updateInventory,
    syncInventory,
  } = useARISystem();

  // Filtrar categorias - mostrar todas se 'all', senão apenas a selecionada
  const filteredCategories = useMemo(() => {
    if (!categories || categories.length === 0) {
      console.warn('[ARIGrid] Nenhuma categoria recebida como prop');
      return [];
    }
    if (selectedCategory === 'all') return categories;
    return categories.filter(c => c.id === selectedCategory);
  }, [categories, selectedCategory]);

  // Debug: log quando categorias mudarem
  useEffect(() => {
    console.log('[ARIGrid] Categorias atualizadas:', {
      total: categories?.length || 0,
      filtered: filteredCategories?.length || 0,
      selectedCategory,
      categories: categories?.map(c => ({ id: c.id, name: c.name })) || [],
    });
  }, [categories, filteredCategories, selectedCategory]);

  // Filtrar planos ativos
  const activePlans = useMemo(() => {
    return ratePlans.filter(p => p.is_active);
  }, [ratePlans]);

  // Datas visíveis
  const visibleDates = useMemo(() => {
    return eachDayOfInterval({
      start: startDate,
      end: addDays(startDate, viewDays - 1),
    });
  }, [startDate, viewDays]);

  // Buscar inventário e status para todas as categorias visíveis
  // Usar uma única query que busca todas as categorias de uma vez
  const endDate = useMemo(() => addDays(startDate, viewDays - 1), [startDate, viewDays]);
  const startDateStr = useMemo(() => format(startDate, 'yyyy-MM-dd'), [startDate]);
  const endDateStr = useMemo(() => format(endDate, 'yyyy-MM-dd'), [endDate]);
  const categoryIds = useMemo(() => filteredCategories.map(c => c.id), [filteredCategories]);

  // Query de verificação para checar se as tabelas existem
  const { data: tableCheck, error: tableCheckError } = useQuery({
    queryKey: ['ari_table_check', selectedEstablishment?.id],
    queryFn: async () => {
      if (!selectedEstablishment?.id) return null;

      // Tentar fazer uma query simples para verificar se as tabelas existem
      const { error: inventoryError } = await supabase
        .from('rate_inventory')
        .select('id')
        .limit(1);

      const { error: statusError } = await supabase
        .from('rate_sales_status')
        .select('id')
        .limit(1);

      // Se ambas as tabelas retornarem erro de "não encontrado", as tabelas não existem
      const inventoryNotFound = inventoryError && (
        inventoryError.code === 'PGRST116' ||
        inventoryError.message?.includes('does not exist') ||
        inventoryError.message?.includes('not found')
      );
      
      const statusNotFound = statusError && (
        statusError.code === 'PGRST116' ||
        statusError.message?.includes('does not exist') ||
        statusError.message?.includes('not found')
      );

      if (inventoryNotFound || statusNotFound) {
        throw { isTableNotFound: true, inventoryNotFound, statusNotFound };
      }

      return { exists: true };
    },
    enabled: !!selectedEstablishment?.id && filteredCategories.length > 0,
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  // Query única para buscar inventário de todas as categorias
  const { 
    data: allInventoryData = [], 
    isLoading: isLoadingInventory,
    error: inventoryError,
    refetch: refetchInventory,
  } = useQuery({
    queryKey: ['ari_inventory_bulk', selectedEstablishment?.id, categoryIds, startDateStr, endDateStr, refetchTrigger],
    queryFn: async () => {
      if (!selectedEstablishment?.id || categoryIds.length === 0) return [];

      const { data, error } = await supabase
        .from('rate_inventory')
        .select('*')
        .eq('establishment_id', selectedEstablishment.id)
        .in('category_id', categoryIds)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .order('date', { ascending: true });

      if (error) {
        // Se a tabela não existe, lançar erro específico
        if (error.code === 'PGRST116' || error.message?.includes('does not exist') || error.message?.includes('not found')) {
          throw { ...error, isTableNotFound: true };
        }
        throw error;
      }
      return (data || []) as any[];
    },
    enabled: !!selectedEstablishment?.id && categoryIds.length > 0 && !!startDateStr && !!endDateStr,
    retry: false, // Não tentar novamente se a tabela não existir
  });

  // Estado para controlar sincronização automática (evitar múltiplas execuções)
  const [autoSyncDone, setAutoSyncDone] = useState(false);

  // Resetar sincronização quando mudar categoria ou período
  useEffect(() => {
    setAutoSyncDone(false);
  }, [selectedCategory, startDate, viewDays]);

  // Sincronizar automaticamente quando não houver dados para as datas visíveis (apenas uma vez)
  useEffect(() => {
    if (
      !selectedEstablishment?.id ||
      filteredCategories.length === 0 ||
      isLoadingInventory ||
      autoSyncDone
    ) {
      return;
    }

    // Verificar se há dados faltantes para cada categoria
    const categoriesNeedingSync: string[] = [];
    
    filteredCategories.forEach(category => {
      const categoryData = allInventoryData.filter((inv: any) => 
        String(inv.category_id) === String(category.id)
      );
      
      // Verificar se há datas sem dados para esta categoria
      const datesWithoutData = visibleDates.filter(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return !categoryData.some((inv: any) => {
          const invDate = inv.date ? inv.date.split('T')[0] : inv.date;
          return invDate === dateStr;
        });
      });
      
      // Se houver datas sem dados, adicionar categoria à lista de sincronização
      if (datesWithoutData.length > 0) {
        categoriesNeedingSync.push(category.id);
      }
    });

    // Se houver categorias que precisam de sincronização, sincronizar automaticamente
    if (categoriesNeedingSync.length > 0 && !autoSyncDone) {
      setAutoSyncDone(true);
      
      const syncData = async () => {
        try {
          const syncPromises: Promise<any>[] = [];
          
          // Sincronizar apenas as categorias que precisam
          filteredCategories
            .filter(cat => categoriesNeedingSync.includes(cat.id))
            .forEach(category => {
              visibleDates.forEach(date => {
                const dateStr = format(date, 'yyyy-MM-dd');
                syncPromises.push(
                  supabase.rpc('sync_rate_inventory_from_reservations', {
                    p_establishment_id: selectedEstablishment.id,
                    p_category_id: category.id,
                    p_date: dateStr,
                  }).then((result) => {
                    console.log(`[ARIGrid] Sincronizado ${category.name} - ${dateStr}:`, result);
                    return null;
                  }).catch((err) => {
                    console.warn(`[ARIGrid] Erro ao sincronizar ${category.name} - ${dateStr}:`, err);
                    return null;
                  })
                );
              });
            });

          console.log(`[ARIGrid] Iniciando sincronização para ${categoriesNeedingSync.length} categorias...`);
          await Promise.all(syncPromises);
          console.log('[ARIGrid] Sincronização concluída');
          
          // Recarregar dados após sincronização
          setTimeout(() => {
            setRefetchTrigger(prev => prev + 1);
            queryClient.invalidateQueries({ queryKey: ['ari_inventory_bulk'] });
          }, 1000); // Aumentar timeout para garantir que os dados foram salvos
        } catch (error) {
          console.warn('[ARIGrid] Erro na sincronização automática:', error);
          setAutoSyncDone(false); // Permitir tentar novamente em caso de erro
        }
      };

      syncData();
    }
  }, [allInventoryData, visibleDates, filteredCategories, selectedEstablishment?.id, isLoadingInventory, autoSyncDone, queryClient]);

  // Query única para buscar status de venda de todas as categorias
  const { 
    data: allSalesStatusData = [], 
    isLoading: isLoadingSalesStatus,
    error: salesStatusError,
  } = useQuery({
    queryKey: ['ari_sales_status_bulk', selectedEstablishment?.id, categoryIds, startDateStr, endDateStr],
    queryFn: async () => {
      if (!selectedEstablishment?.id || categoryIds.length === 0) return [];

      const { data, error } = await supabase
        .from('rate_sales_status')
        .select('*')
        .eq('establishment_id', selectedEstablishment.id)
        .in('category_id', categoryIds)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
        .order('date', { ascending: true });

      if (error) {
        // Se a tabela não existe, lançar erro específico
        if (error.code === 'PGRST116' || error.message?.includes('does not exist') || error.message?.includes('not found')) {
          throw { ...error, isTableNotFound: true };
        }
        throw error;
      }
      return (data || []) as any[];
    },
    enabled: !!selectedEstablishment?.id && categoryIds.length > 0 && !!startDateStr && !!endDateStr,
    retry: false, // Não tentar novamente se a tabela não existir
  });

  // Criar mapas de inventário e status por categoria
  const inventoryMaps = useMemo(() => {
    const maps: { [key: string]: Map<string, any> } = {};
    
    // Inicializar mapas vazios para todas as categorias
    filteredCategories.forEach(category => {
      maps[category.id] = new Map<string, any>();
    });
    
    // Mapear dados para cada categoria
    allInventoryData.forEach((inv: any) => {
      if (!inv || !inv.category_id || !inv.date) return;
      
      // Normalizar category_id
      const invCategoryId = String(inv.category_id);
      
      // Encontrar a categoria correspondente
      const matchingCategory = filteredCategories.find(cat => String(cat.id) === invCategoryId);
      
      if (matchingCategory) {
        const map = maps[matchingCategory.id];
        if (!map) {
          maps[matchingCategory.id] = new Map<string, any>();
        }
        
        // Normalizar data (remover timezone se houver)
        const dateKey = inv.date ? inv.date.split('T')[0] : inv.date;
        if (dateKey) {
          maps[matchingCategory.id].set(dateKey, {
            ...inv,
            total_rooms: Number(inv.total_rooms || 0),
            available_rooms: Number(inv.available_rooms || 0),
            confirmed_reservations: Number(inv.confirmed_reservations || 0),
            blocked_rooms: Number(inv.blocked_rooms || 0),
            occupancy_percentage: Number(inv.occupancy_percentage || 0),
          });
        }
      }
    });
    
    // Debug: log do mapeamento detalhado
    if (allInventoryData.length > 0 || filteredCategories.length > 0) {
      console.log('[ARIGrid] Inventory Maps Debug:', {
        totalData: allInventoryData.length,
        filteredCategories: filteredCategories.length,
        categoryIds: filteredCategories.map(c => c.id),
        dataCategoryIds: [...new Set(allInventoryData.map((inv: any) => inv.category_id))],
        mapsDetails: Object.entries(maps).map(([catId, map]) => ({
          categoryId: catId,
          categoryName: filteredCategories.find(c => String(c.id) === catId)?.name || 'Unknown',
          entriesCount: map.size,
          sampleEntries: Array.from(map.entries()).slice(0, 2),
        })),
        sampleRawData: allInventoryData.slice(0, 3).map((inv: any) => ({
          category_id: inv.category_id,
          date: inv.date,
          available_rooms: inv.available_rooms,
          confirmed_reservations: inv.confirmed_reservations,
        })),
      });
    }
    
    return maps;
  }, [allInventoryData, filteredCategories]);

  const salesStatusMaps = useMemo(() => {
    const maps: { [key: string]: Map<string, any> } = {};
    
    filteredCategories.forEach(category => {
      const map = new Map<string, any>();
      allSalesStatusData
        .filter((status: any) => status.category_id === category.id)
        .forEach((status: any) => {
          map.set(status.date, status);
        });
      maps[category.id] = map;
    });
    
    return maps;
  }, [allSalesStatusData, filteredCategories]);

  // Criar mapa de preços por plano e data
  const rateCalendarMap = useMemo(() => {
    const map = new Map<string, Map<string, Map<string, any>>>();
    if (rateCalendar) {
      rateCalendar.forEach((entry: any) => {
        const categoryKey = entry.category_id;
        const dateKey = entry.date;
        const planKey = entry.pricing_plan_id;
        
        if (!map.has(categoryKey)) {
          map.set(categoryKey, new Map());
        }
        const categoryMap = map.get(categoryKey)!;
        
        if (!categoryMap.has(dateKey)) {
          categoryMap.set(dateKey, new Map());
        }
        const dateMap = categoryMap.get(dateKey)!;
        
        dateMap.set(planKey, entry);
      });
      
      // Verificar se há entradas com campos de flutuação
      const entriesWithFluctuation = rateCalendar.filter((e: any) => 
        e.occupancy_1_fluctuation_type || e.occupancy_3_fluctuation_type || e.occupancy_4_fluctuation_type
      );
      
      console.log('[ARIGrid] rateCalendarMap recriado:', {
        entriesCount: rateCalendar?.length || 0,
        mapSize: map.size,
        entriesWithFluctuation: entriesWithFluctuation.length,
        sampleEntry: rateCalendar?.[0],
        sampleWithFluctuation: entriesWithFluctuation[0],
      });
    }
    return map;
  }, [rateCalendar]);

  // Função para obter status de venda de uma data
  const getSalesStatusForDate = (categoryId: string, date: Date): 'open' | 'closed' | 'no_price' => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const statusMap = salesStatusMaps[categoryId];
    if (statusMap) {
      const status = statusMap.get(dateStr);
      if (status) return status.status;
    }
    
    // Verificar se há preço para algum plano
    const categoryRates = rateCalendarMap.get(categoryId);
    if (categoryRates) {
      const dateRates = categoryRates.get(dateStr);
      if (dateRates && dateRates.size > 0) {
        // Verificar se algum plano tem preço
        for (const [planId, rate] of dateRates.entries()) {
          if (rate.base_price > 0) return 'open';
        }
        return 'no_price';
      }
    }
    return 'no_price';
  };

  // Função para obter inventário de uma data (síncrona para uso no render)
  const getInventoryForDate = (categoryId: string, date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    
    // Normalizar categoryId para busca
    const normalizedCategoryId = String(categoryId);
    
    // Tentar encontrar o mapa usando o ID normalizado
    let inventoryMap = inventoryMaps[normalizedCategoryId];
    
    // Se não encontrar, tentar buscar por comparação direta
    if (!inventoryMap) {
      const matchingKey = Object.keys(inventoryMaps).find(key => String(key) === normalizedCategoryId);
      if (matchingKey) {
        inventoryMap = inventoryMaps[matchingKey];
      }
    }
    
    if (inventoryMap) {
      const inv = inventoryMap.get(dateStr);
      if (inv) {
        return {
          total_rooms: Number(inv.total_rooms || 0),
          available_rooms: Number(inv.available_rooms || 0),
          confirmed_reservations: Number(inv.confirmed_reservations || 0),
          blocked_rooms: Number(inv.blocked_rooms || 0),
          occupancy_percentage: Number(inv.occupancy_percentage || 0),
        };
      }
    }

    // Se não houver dados no mapa, retornar valores padrão
    // (a sincronização automática será feita em background)
    return {
      total_rooms: 0,
      available_rooms: 0,
      confirmed_reservations: 0,
      blocked_rooms: 0,
      occupancy_percentage: 0,
    };
  };

  // Função para obter preço de um plano em uma data
  const getRateCalendarEntry = (categoryId: string, planId: string, date: Date): any => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const categoryRates = rateCalendarMap.get(categoryId);
    if (categoryRates) {
      const dateRates = categoryRates.get(dateStr);
      if (dateRates) {
        return dateRates.get(planId) || null;
      }
    }
    return null;
  };

  // Calcular preços por ocupação (x1, x2, x3, x4)
  const calculatePriceForOccupancy = (entry: any, occupancy: number): number => {
    if (!entry) return 0;
    
    const basePrice = entry.base_price || 0;
    const adultPrice = entry.adult_price || 0;
    
    // Calcular preço BASE para cada ocupação (sem flutuação)
    // Este é o preço de referência antes de aplicar qualquer flutuação
    let baseCalculatedPrice: number;
    switch (occupancy) {
      case 1:
        baseCalculatedPrice = Math.max(0, basePrice - adultPrice);
        break;
      case 2:
        baseCalculatedPrice = basePrice;
        break;
      case 3:
        baseCalculatedPrice = basePrice + adultPrice;
        break;
      case 4:
        baseCalculatedPrice = basePrice + (adultPrice * 2);
        break;
      default:
        baseCalculatedPrice = basePrice;
    }
    
    // Aplicar flutuação se existir para esta ocupação
    // IMPORTANTE: A flutuação é sempre aplicada ao preço BASE, não ao preço já com flutuação
    let finalPrice = baseCalculatedPrice;
    
    if (occupancy === 1) {
      // Verificar se há campos de flutuação
      const hasFluctuationType = entry.occupancy_1_fluctuation_type && 
                                  (entry.occupancy_1_fluctuation_type === 'fixed' || entry.occupancy_1_fluctuation_type === 'percentage');
      const hasFluctuationValue = entry.occupancy_1_fluctuation_value !== null && 
                                  entry.occupancy_1_fluctuation_value !== undefined &&
                                  !isNaN(Number(entry.occupancy_1_fluctuation_value));
      
      if (hasFluctuationType && hasFluctuationValue) {
        const fluctuationValue = Number(entry.occupancy_1_fluctuation_value);
        
        // Aplicar flutuação ao preço BASE x1
        if (entry.occupancy_1_fluctuation_type === 'percentage') {
          // Porcentagem: aplicar ao preço base
          // Exemplo: se basePrice = 190, adultPrice = 32.5, então baseCalculatedPrice = 157.5
          // Se flutuação = -5%, então: 157.5 * (1 + (-5)/100) = 157.5 * 0.95 = 149.625
          finalPrice = baseCalculatedPrice * (1 + fluctuationValue / 100);
        } else {
          // Valor absoluto: adicionar/subtrair do preço base
          // Exemplo: se baseCalculatedPrice = 157.5 e flutuação = -10, então: 157.5 - 10 = 147.5
          finalPrice = baseCalculatedPrice + fluctuationValue;
        }
        
        // IMPORTANTE: Para x1, o preço não pode ser maior que basePrice
        // Se a flutuação resultar em um preço maior que basePrice, limitar ao basePrice
        finalPrice = Math.min(finalPrice, basePrice);
        
        console.log(`[ARIGrid] Aplicando flutuação x1:`, {
          basePrice,
          adultPrice,
          baseCalculatedPrice,
          fluctuationType: entry.occupancy_1_fluctuation_type,
          fluctuationValue: fluctuationValue,
          calculation: entry.occupancy_1_fluctuation_type === 'percentage' 
            ? `${baseCalculatedPrice} * (1 + ${fluctuationValue}/100) = ${baseCalculatedPrice * (1 + fluctuationValue / 100)}`
            : `${baseCalculatedPrice} + ${fluctuationValue} = ${baseCalculatedPrice + fluctuationValue}`,
          beforeLimit: entry.occupancy_1_fluctuation_type === 'percentage' 
            ? baseCalculatedPrice * (1 + fluctuationValue / 100)
            : baseCalculatedPrice + fluctuationValue,
          finalPrice,
          isLimited: finalPrice < (entry.occupancy_1_fluctuation_type === 'percentage' 
            ? baseCalculatedPrice * (1 + fluctuationValue / 100)
            : baseCalculatedPrice + fluctuationValue),
        });
      }
    } else if (occupancy === 3) {
      // Verificar se há campos de flutuação
      const hasFluctuationType = entry.occupancy_3_fluctuation_type && 
                                  (entry.occupancy_3_fluctuation_type === 'fixed' || entry.occupancy_3_fluctuation_type === 'percentage');
      const hasFluctuationValue = entry.occupancy_3_fluctuation_value !== null && 
                                  entry.occupancy_3_fluctuation_value !== undefined &&
                                  !isNaN(Number(entry.occupancy_3_fluctuation_value));
      
      if (hasFluctuationType && hasFluctuationValue) {
        const fluctuationValue = Number(entry.occupancy_3_fluctuation_value);
        
        // Aplicar flutuação ao preço BASE x3
        if (entry.occupancy_3_fluctuation_type === 'percentage') {
          finalPrice = baseCalculatedPrice * (1 + fluctuationValue / 100);
        } else {
          finalPrice = baseCalculatedPrice + fluctuationValue;
        }
        
        console.log(`[ARIGrid] Aplicando flutuação x3:`, {
          basePrice,
          adultPrice,
          baseCalculatedPrice,
          fluctuationType: entry.occupancy_3_fluctuation_type,
          fluctuationValue: fluctuationValue,
          finalPrice,
        });
      }
    } else if (occupancy === 4) {
      // Verificar se há campos de flutuação
      const hasFluctuationType = entry.occupancy_4_fluctuation_type && 
                                  (entry.occupancy_4_fluctuation_type === 'fixed' || entry.occupancy_4_fluctuation_type === 'percentage');
      const hasFluctuationValue = entry.occupancy_4_fluctuation_value !== null && 
                                  entry.occupancy_4_fluctuation_value !== undefined &&
                                  !isNaN(Number(entry.occupancy_4_fluctuation_value));
      
      if (hasFluctuationType && hasFluctuationValue) {
        const fluctuationValue = Number(entry.occupancy_4_fluctuation_value);
        
        // Aplicar flutuação ao preço BASE x4
        if (entry.occupancy_4_fluctuation_type === 'percentage') {
          finalPrice = baseCalculatedPrice * (1 + fluctuationValue / 100);
        } else {
          finalPrice = baseCalculatedPrice + fluctuationValue;
        }
        
        console.log(`[ARIGrid] Aplicando flutuação x4:`, {
          basePrice,
          adultPrice,
          baseCalculatedPrice,
          fluctuationType: entry.occupancy_4_fluctuation_type,
          fluctuationValue: fluctuationValue,
          finalPrice,
        });
      }
    }
    
    return Math.max(0, finalPrice);
  };

  // Função para calcular ocupação
  const calculateOccupancy = (inventory: any): number => {
    if (!inventory || inventory.total_rooms === 0) return 0;
    return Math.round((inventory.confirmed_reservations / inventory.total_rooms) * 100);
  };

  // Função para obter cor do status
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'open':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'closed':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'no_price':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'restricted_ota':
      case 'restricted_booking_engine':
      case 'restricted_all':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  // Função para obter label do status
  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'open':
        return 'Disponível';
      case 'closed':
        return 'Tarifa Fechada';
      case 'no_price':
        return 'Sem Preço';
      case 'restricted_ota':
        return 'Restrito OTA';
      case 'restricted_booking_engine':
        return 'Restrito Motor';
      case 'restricted_all':
        return 'Há Restrições';
      default:
        return 'Desconhecido';
    }
  };

  // Toggle expansão de plano
  const togglePlanExpansion = (categoryId: string, planId: string) => {
    setExpandedPlans(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        [planId]: !prev[categoryId]?.[planId],
      },
    }));
  };

  // Verificar se plano está expandido
  const isPlanExpanded = (categoryId: string, planId: string): boolean => {
    return expandedPlans[categoryId]?.[planId] || false;
  };

  // Handler para atualizar status
  const handleUpdateStatus = async (categoryId: string, date: Date, status: 'open' | 'closed' | 'no_price') => {
    try {
      await updateSalesStatus.mutateAsync({
        categoryId,
        date,
        status,
        reason: `Status alterado para ${getStatusLabel(status)}`,
      });
      setStatusEditDialog({ open: false, categoryId: '', date: null, status: null });
      setRefetchTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Erro ao atualizar status:', error);
    }
  };

  // Handler para salvar edição de célula
  const handleSaveCellEdit = async () => {
    if (!editingCell || !selectedEstablishment?.id) {
      console.warn('[ARIGrid] handleSaveCellEdit: Dados insuficientes', { editingCell, establishment: selectedEstablishment?.id });
      return;
    }

    // Preservar referência às categorias antes da atualização
    const currentCategories = [...categories];
    const currentEditingCell = { ...editingCell };

    console.log('[ARIGrid] Salvando edição:', {
      categoriesCount: currentCategories.length,
      editingCell: currentEditingCell,
    });

    try {
      const entry = getRateCalendarEntry(
        currentEditingCell.categoryId,
        currentEditingCell.planId,
        new Date(currentEditingCell.date)
      );

      const updateData: any = {
        establishment_id: selectedEstablishment.id,
        category_id: currentEditingCell.categoryId,
        pricing_plan_id: currentEditingCell.planId,
        date: currentEditingCell.date,
      };

      // Atualizar campo específico
      if (currentEditingCell.field.startsWith('price_')) {
        const occupancy = parseInt(currentEditingCell.field.replace('price_', ''));
        const entry = getRateCalendarEntry(
          currentEditingCell.categoryId,
          currentEditingCell.planId,
          new Date(currentEditingCell.date)
        );
        
        // Normalizar valor (suportar vírgula como separador decimal brasileiro)
        const normalizedValue = parseFloat(
          currentEditingCell.value.toString().replace(',', '.')
        ) || 0;
        
        if (occupancy === 2) {
          // Preço x2 é o base_price - edição direta do preço padrão
          // Ao alterar o preço padrão, mantemos adult_price fixo
          updateData.base_price = normalizedValue;
          updateData.adult_price = entry?.adult_price || 0;
        } else if (occupancy === 1) {
          // Preço x1 = base_price - adult_price
          // Ao alterar x1, ajustamos adult_price mantendo base_price fixo
          const basePrice = entry?.base_price || 0;
          const newAdultPrice = basePrice - normalizedValue;
          updateData.base_price = basePrice; // Manter base_price fixo
          updateData.adult_price = newAdultPrice;
        } else if (occupancy === 3) {
          // Preço x3 = base_price + adult_price
          // Ao alterar x3, ajustamos adult_price mantendo base_price fixo
          const basePrice = entry?.base_price || 0;
          const newAdultPrice = normalizedValue - basePrice;
          updateData.base_price = basePrice; // Manter base_price fixo
          updateData.adult_price = newAdultPrice;
        } else if (occupancy === 4) {
          // Preço x4 = base_price + (adult_price * 2)
          // Ao alterar x4, ajustamos adult_price mantendo base_price fixo
          const basePrice = entry?.base_price || 0;
          const newAdultPrice = (normalizedValue - basePrice) / 2;
          updateData.base_price = basePrice; // Manter base_price fixo
          updateData.adult_price = newAdultPrice;
        }
      } else {
        // Outros campos (restrições)
        updateData[currentEditingCell.field] = currentEditingCell.value;
      }

      // Se já existe entrada, manter outros campos
      // IMPORTANTE: Não sobrescrever base_price e adult_price se já foram definidos acima
      if (entry) {
        // Manter base_price e adult_price apenas se não foram definidos acima
        if (updateData.base_price === undefined) {
          updateData.base_price = entry.base_price;
        }
        if (updateData.adult_price === undefined) {
          updateData.adult_price = entry.adult_price;
        }
        updateData.min_stay = updateData.min_stay ?? entry.min_stay;
        updateData.max_stay = updateData.max_stay ?? entry.max_stay;
        updateData.closed_to_arrival = updateData.closed_to_arrival ?? entry.closed_to_arrival;
        updateData.closed_to_departure = updateData.closed_to_departure ?? entry.closed_to_departure;
      }

      // Salvar e aguardar conclusão antes de limpar o estado
      await upsertRateCalendar([updateData]);
      
      console.log('[ARIGrid] Edição salva com sucesso');
      
      // Limpar célula de edição apenas após sucesso
      setEditingCell(null);
      
      // Verificar se as categorias ainda estão disponíveis após a atualização
      if (categories.length === 0) {
        console.warn('[ARIGrid] Categorias perdidas após salvar!', {
          categoriesBefore: currentCategories.length,
          categoriesAfter: categories.length,
        });
      }
      
      // O toast já é exibido pelo hook useRateSystem
      // Não invalidar queries manualmente aqui, o hook já faz isso
    } catch (error: any) {
      console.error('[ARIGrid] Erro ao salvar edição:', error);
      // Não limpar o estado em caso de erro para permitir nova tentativa
      // O toast de erro já é exibido pelo hook useRateSystem
    }
  };

  // Renderizar célula de status
  const renderStatusCell = (category: any, date: Date) => {
    const status = getSalesStatusForDate(category.id, date);
    const isPast = date < startOfDay(new Date());
    
    return (
      <div
        className={cn(
          "p-2 text-xs font-medium text-center border rounded",
          getStatusColor(status),
          isPast && "opacity-50"
        )}
        onClick={() => {
          if (!isPast) {
            setStatusEditDialog({
              open: true,
              categoryId: category.id,
              date,
              status,
            });
          }
        }}
        style={{ cursor: isPast ? 'default' : 'pointer' }}
      >
        {getStatusLabel(status)}
      </div>
    );
  };

  // Renderizar célula de inventário
  const renderInventoryCell = (category: any, date: Date) => {
    const inventory = getInventoryForDate(category.id, date);
    return (
      <div className="p-2 text-sm text-center font-semibold text-gray-700">
        {inventory.available_rooms}
      </div>
    );
  };

  // Renderizar célula de reservas
  const renderReservationsCell = (category: any, date: Date) => {
    const inventory = getInventoryForDate(category.id, date);
    return (
      <div className="p-2 text-sm text-center text-gray-600">
        {inventory.confirmed_reservations}
      </div>
    );
  };

  // Obter capacidade máxima da categoria
  const getCategoryMaxOccupancy = (category: any): number => {
    // Usar maximum_occupancy se existir, senão capacity_adults, com fallback para 2
    const maxOccupancy = category.maximum_occupancy ?? category.capacity_adults ?? 2;
    // Garantir que seja pelo menos 1
    return Math.max(1, maxOccupancy);
  };

  // Obter ocupações que devem ser exibidas baseado na capacidade
  // Retorna com x2 (padrão) primeiro, depois as outras em ordem
  const getOccupanciesToDisplay = (category: any): number[] => {
    const maxOccupancy = getCategoryMaxOccupancy(category);
    const occupancies: number[] = [];
    
    // Sempre mostrar ocupação padrão (x2) PRIMEIRO se capacidade >= 2
    if (maxOccupancy >= 2) {
      occupancies.push(2);
    }
    
    // Depois mostrar x1 se capacidade >= 1
    if (maxOccupancy >= 1) {
      occupancies.push(1);
    }
    
    // Mostrar x3 se capacidade >= 3
    if (maxOccupancy >= 3) {
      occupancies.push(3);
    }
    
    // Mostrar x4 se capacidade >= 4
    if (maxOccupancy >= 4) {
      occupancies.push(4);
    }
    
    // Ordem: x2 (padrão), x1, x3, x4
    return occupancies;
  };

  // Renderizar célula de ocupação
  const renderOccupancyCell = (category: any, date: Date) => {
    const inventory = getInventoryForDate(category.id, date);
    const occupancy = calculateOccupancy(inventory);
    return (
      <div className="p-2 text-sm text-center font-medium text-gray-700">
        {occupancy}%
      </div>
    );
  };

  // Renderizar célula de preço editável
  // Handler para salvar preço por ocupação com flutuação
  const handleSaveOccupancyPrice = async (data: {
    fluctuationType: 'fixed' | 'percentage';
    fluctuationValue: number;
  }) => {
    if (!occupancyPriceDialog.categoryId || !occupancyPriceDialog.planId || !selectedEstablishment?.id) {
      toast.error('Dados insuficientes para salvar');
      return;
    }

    try {
      // Para x1, x3, x4: sempre aplicar a todas as datas visíveis (edição em massa)
      // Para x2: aplicar apenas à data específica (edição inline)
      const isBulkEdit = occupancyPriceDialog.occupancy !== 2 || occupancyPriceDialog.date === null;
      const datesToUpdate = isBulkEdit 
        ? visibleDates.filter(date => date >= startOfDay(new Date())) // Apenas datas futuras
        : [occupancyPriceDialog.date!];

      console.log('[ARIGrid] Aplicando alteração:', {
        occupancy: occupancyPriceDialog.occupancy,
        isBulkEdit,
        datesCount: datesToUpdate.length,
        dates: datesToUpdate.map(d => format(d, 'yyyy-MM-dd')),
        fluctuationType: data.fluctuationType,
        fluctuationValue: data.fluctuationValue,
      });

      const updateDataArray: any[] = [];

      for (const date of datesToUpdate) {
        const entry = getRateCalendarEntry(
          occupancyPriceDialog.categoryId,
          occupancyPriceDialog.planId,
          date
        );

        // IMPORTANTE: Sempre usar o base_price específico desta data
        // Se não houver entrada, buscar valores padrão da categoria ou de outra data
        // CRÍTICO: Usar base_price e adult_price da entrada, não o preço calculado com flutuação
        let basePrice = entry?.base_price || 0;
        let adultPrice = entry?.adult_price || 0;
        
        // Log para debug
        console.log(`[ARIGrid] Data ${format(date, 'yyyy-MM-dd')}:`, {
          hasEntry: !!entry,
          basePrice,
          adultPrice,
          existingFluctuation: entry ? {
            x1: { type: entry.occupancy_1_fluctuation_type, value: entry.occupancy_1_fluctuation_value },
            x3: { type: entry.occupancy_3_fluctuation_type, value: entry.occupancy_3_fluctuation_value },
            x4: { type: entry.occupancy_4_fluctuation_type, value: entry.occupancy_4_fluctuation_value },
          } : null,
        });
        
        // Se não houver entrada ou basePrice for 0, buscar valores padrão
        if (!entry || basePrice === 0) {
          // Primeiro, tentar buscar de outra data próxima do mesmo plano (mesma categoria)
          const nearbyDate = visibleDates.find(d => {
            if (d.getTime() === date.getTime()) return false; // Não usar a mesma data
            const nearbyEntry = getRateCalendarEntry(
              occupancyPriceDialog.categoryId,
              occupancyPriceDialog.planId,
              d
            );
            return nearbyEntry && nearbyEntry.base_price > 0;
          });
          
          if (nearbyDate) {
            const nearbyEntry = getRateCalendarEntry(
              occupancyPriceDialog.categoryId,
              occupancyPriceDialog.planId,
              nearbyDate
            );
            if (nearbyEntry?.base_price) {
              basePrice = nearbyEntry.base_price;
              adultPrice = nearbyEntry.adult_price || 0;
            }
          }
          
          // Se ainda não encontrou, buscar da categoria
          if (basePrice === 0) {
            const category = filteredCategories.find(c => c.id === occupancyPriceDialog.categoryId);
            if (category?.base_price) {
              basePrice = category.base_price;
              adultPrice = 0; // Se não há entrada, adult_price começa em 0
            }
          }
        }
        
        // Se ainda não temos basePrice, tentar buscar de qualquer data do mesmo plano
        if (basePrice === 0) {
          // Buscar de qualquer data visível do mesmo plano e categoria
          for (const checkDate of visibleDates) {
            const checkEntry = getRateCalendarEntry(
              occupancyPriceDialog.categoryId,
              occupancyPriceDialog.planId,
              checkDate
            );
            if (checkEntry?.base_price && checkEntry.base_price > 0) {
              basePrice = checkEntry.base_price;
              adultPrice = checkEntry.adult_price || 0;
              console.log(`[ARIGrid] Usando basePrice de ${format(checkDate, 'yyyy-MM-dd')} para ${format(date, 'yyyy-MM-dd')}:`, basePrice);
              break;
            }
          }
          
          // Se ainda não encontrou, buscar da categoria
          if (basePrice === 0) {
            const category = filteredCategories.find(c => c.id === occupancyPriceDialog.categoryId);
            if (category?.base_price && category.base_price > 0) {
              basePrice = category.base_price;
              adultPrice = 0;
              console.log(`[ARIGrid] Usando basePrice da categoria para ${format(date, 'yyyy-MM-dd')}:`, basePrice);
            }
          }
        }
        
        // Se ainda não temos basePrice válido, pular esta data
        if (basePrice === 0 || basePrice <= 0) {
          console.warn(`[ARIGrid] Não foi possível obter basePrice válido para ${format(date, 'yyyy-MM-dd')}, pulando...`);
          continue;
        }
        
        // Calcular preço atual para esta ocupação baseado no base_price desta data
        // IMPORTANTE: Este cálculo usa o basePrice e adultPrice específicos desta data
        // CRÍTICO: NÃO usar calculatePriceForOccupancy aqui, pois isso aplicaria flutuações anteriores
        // Precisamos do preço BASE (sem flutuação) para aplicar a nova flutuação
        let currentPrice: number;
        if (occupancyPriceDialog.occupancy === 1) {
          // x1 = base_price - adult_price (baseado no base_price desta data, SEM flutuação)
          currentPrice = Math.max(0, basePrice - adultPrice);
        } else if (occupancyPriceDialog.occupancy === 2) {
          // x2 = base_price (baseado no base_price desta data, SEM flutuação)
          currentPrice = basePrice;
        } else if (occupancyPriceDialog.occupancy === 3) {
          // x3 = base_price + adult_price (baseado no base_price desta data, SEM flutuação)
          currentPrice = basePrice + adultPrice;
        } else if (occupancyPriceDialog.occupancy === 4) {
          // x4 = base_price + (adult_price * 2) (baseado no base_price desta data, SEM flutuação)
          currentPrice = basePrice + (adultPrice * 2);
        } else {
          currentPrice = basePrice;
        }
        
        // Garantir que currentPrice seja válido
        if (isNaN(currentPrice) || currentPrice < 0) {
          console.warn(`[ARIGrid] currentPrice inválido para ${format(date, 'yyyy-MM-dd')}, recalculando...`);
          // Recalcular baseado nos valores corretos
          if (occupancyPriceDialog.occupancy === 1) {
            currentPrice = Math.max(0, basePrice - adultPrice);
          } else if (occupancyPriceDialog.occupancy === 2) {
            currentPrice = basePrice;
          } else if (occupancyPriceDialog.occupancy === 3) {
            currentPrice = basePrice + adultPrice;
          } else if (occupancyPriceDialog.occupancy === 4) {
            currentPrice = basePrice + (adultPrice * 2);
          } else {
            currentPrice = basePrice;
          }
        }
        
        // Se currentPrice ainda for 0 e não for x1, usar basePrice como fallback
        if (currentPrice === 0 && occupancyPriceDialog.occupancy !== 1) {
          currentPrice = basePrice;
        }
        
        console.log(`[ARIGrid] Data ${format(date, 'yyyy-MM-dd')}:`, {
          basePrice,
          adultPrice,
          occupancy: occupancyPriceDialog.occupancy,
          currentPrice,
          fluctuationType: data.fluctuationType,
          fluctuationValue: data.fluctuationValue,
          hasEntry: !!entry,
        });

        // Calcular base_price e adult_price baseado na ocupação
        const updateData: any = {
          establishment_id: selectedEstablishment.id,
          category_id: occupancyPriceDialog.categoryId,
          pricing_plan_id: occupancyPriceDialog.planId,
          date: format(date, 'yyyy-MM-dd'),
        };

        // IMPORTANTE: Sempre preservar base_price original quando não estamos editando x2
        // Isso garante que o preço padrão nunca seja alterado acidentalmente

        if (occupancyPriceDialog.occupancy === 1) {
          // Preço x1 = base_price - adult_price (quando não há flutuação)
          // Com flutuação: x1 = basePrice * (1 + fluctuation/100) ou basePrice + fluctuation
          // IMPORTANTE: Não alterar adult_price, apenas salvar a flutuação
          // O preço será calculado dinamicamente pela função calculatePriceForOccupancy
          updateData.base_price = basePrice; // Manter base_price fixo (preço padrão desta data)
          updateData.adult_price = adultPrice; // Manter adult_price original (não alterar)
          // Salvar tipo e valor da flutuação (garantir conversão para Number)
          // IMPORTANTE: Substituir a flutuação anterior, não adicionar a ela
          updateData.occupancy_1_fluctuation_type = data.fluctuationType;
          updateData.occupancy_1_fluctuation_value = Number(data.fluctuationValue);
          
          console.log(`[ARIGrid] Salvando flutuação x1 para ${format(date, 'yyyy-MM-dd')}:`, {
            fluctuationType: updateData.occupancy_1_fluctuation_type,
            fluctuationValue: updateData.occupancy_1_fluctuation_value,
            basePrice: updateData.base_price,
            adultPrice: updateData.adult_price,
            currentPrice,
            previousFluctuation: entry ? {
              type: entry.occupancy_1_fluctuation_type,
              value: entry.occupancy_1_fluctuation_value,
            } : null,
          });
        } else if (occupancyPriceDialog.occupancy === 2) {
          // Preço x2 = base_price (preço padrão)
          // Ao alterar o preço padrão, alteramos base_price diretamente
          // Aplicar flutuação ao preço atual (basePrice)
          const beforePrice = currentPrice;
          let newPrice: number;
          
          if (data.fluctuationType === 'percentage') {
            // Aplicar flutuação percentual ao preço atual
            newPrice = currentPrice * (1 + Number(data.fluctuationValue) / 100);
          } else {
            // Aplicar flutuação absoluta ao preço atual
            newPrice = currentPrice + Number(data.fluctuationValue);
          }
          
          console.log(`[ARIGrid] Aplicando flutuação x2:`, {
            beforePrice,
            fluctuationType: data.fluctuationType,
            fluctuationValue: data.fluctuationValue,
            newPrice,
            basePrice,
          });
          
          updateData.base_price = newPrice;
          updateData.adult_price = adultPrice; // Manter adult_price fixo
        } else if (occupancyPriceDialog.occupancy === 3) {
          // Preço x3 = base_price + adult_price (quando não há flutuação)
          // Com flutuação: x3 será calculado dinamicamente pela função calculatePriceForOccupancy
          // IMPORTANTE: Não alterar adult_price, apenas salvar a flutuação
          // O preço será calculado dinamicamente pela função calculatePriceForOccupancy
          updateData.base_price = basePrice; // Manter base_price fixo (preço padrão desta data)
          updateData.adult_price = adultPrice; // Manter adult_price original (não alterar)
          // Salvar tipo e valor da flutuação (garantir conversão para Number)
          updateData.occupancy_3_fluctuation_type = data.fluctuationType;
          updateData.occupancy_3_fluctuation_value = Number(data.fluctuationValue);
          
          console.log(`[ARIGrid] Salvando flutuação x3 para ${format(date, 'yyyy-MM-dd')}:`, {
            fluctuationType: updateData.occupancy_3_fluctuation_type,
            fluctuationValue: updateData.occupancy_3_fluctuation_value,
            basePrice: updateData.base_price,
            adultPrice: updateData.adult_price,
            currentPrice,
            previousFluctuation: entry ? {
              type: entry.occupancy_3_fluctuation_type,
              value: entry.occupancy_3_fluctuation_value,
            } : null,
          });
        } else if (occupancyPriceDialog.occupancy === 4) {
          // Preço x4 = base_price + (adult_price * 2) (quando não há flutuação)
          // Com flutuação: x4 será calculado dinamicamente pela função calculatePriceForOccupancy
          // IMPORTANTE: Não alterar adult_price, apenas salvar a flutuação
          // O preço será calculado dinamicamente pela função calculatePriceForOccupancy
          updateData.base_price = basePrice; // Manter base_price fixo (preço padrão desta data)
          updateData.adult_price = adultPrice; // Manter adult_price original (não alterar)
          // Salvar tipo e valor da flutuação (garantir conversão para Number)
          updateData.occupancy_4_fluctuation_type = data.fluctuationType;
          updateData.occupancy_4_fluctuation_value = Number(data.fluctuationValue);
          
          console.log(`[ARIGrid] Salvando flutuação x4 para ${format(date, 'yyyy-MM-dd')}:`, {
            fluctuationType: updateData.occupancy_4_fluctuation_type,
            fluctuationValue: updateData.occupancy_4_fluctuation_value,
            basePrice: updateData.base_price,
            adultPrice: updateData.adult_price,
            currentPrice,
            previousFluctuation: entry ? {
              type: entry.occupancy_4_fluctuation_type,
              value: entry.occupancy_4_fluctuation_value,
            } : null,
          });
        }

        // Manter outros campos se já existir entrada
        if (entry) {
          // Manter campos de restrições
          updateData.min_stay = entry.min_stay ?? 0;
          updateData.max_stay = entry.max_stay ?? 0;
          updateData.closed_to_arrival = entry.closed_to_arrival ?? false;
          updateData.closed_to_departure = entry.closed_to_departure ?? false;
          
          // Manter campos de flutuação de outras ocupações (preservar valores existentes)
          // IMPORTANTE: Preservar os valores existentes, não sobrescrever com null
          // Mas apenas se não estamos editando essa ocupação específica
          if (occupancyPriceDialog.occupancy !== 1) {
            // Preservar flutuação x1 existente apenas se não estamos editando x1
            updateData.occupancy_1_fluctuation_type = entry.occupancy_1_fluctuation_type ?? null;
            updateData.occupancy_1_fluctuation_value = entry.occupancy_1_fluctuation_value !== null && entry.occupancy_1_fluctuation_value !== undefined 
              ? Number(entry.occupancy_1_fluctuation_value) 
              : null;
          }
          if (occupancyPriceDialog.occupancy !== 3) {
            // Preservar flutuação x3 existente apenas se não estamos editando x3
            updateData.occupancy_3_fluctuation_type = entry.occupancy_3_fluctuation_type ?? null;
            updateData.occupancy_3_fluctuation_value = entry.occupancy_3_fluctuation_value !== null && entry.occupancy_3_fluctuation_value !== undefined 
              ? Number(entry.occupancy_3_fluctuation_value) 
              : null;
          }
          if (occupancyPriceDialog.occupancy !== 4) {
            // Preservar flutuação x4 existente apenas se não estamos editando x4
            updateData.occupancy_4_fluctuation_type = entry.occupancy_4_fluctuation_type ?? null;
            updateData.occupancy_4_fluctuation_value = entry.occupancy_4_fluctuation_value !== null && entry.occupancy_4_fluctuation_value !== undefined 
              ? Number(entry.occupancy_4_fluctuation_value) 
              : null;
          }
        } else {
          // Se não há entrada, inicializar campos com valores padrão
          updateData.min_stay = 0;
          updateData.max_stay = 0;
          updateData.closed_to_arrival = false;
          updateData.closed_to_departure = false;
          
          // Inicializar campos de flutuação de outras ocupações como null
          // Mas apenas se não estamos editando essa ocupação específica
          if (occupancyPriceDialog.occupancy !== 1) {
            updateData.occupancy_1_fluctuation_type = null;
            updateData.occupancy_1_fluctuation_value = null;
          }
          if (occupancyPriceDialog.occupancy !== 3) {
            updateData.occupancy_3_fluctuation_type = null;
            updateData.occupancy_3_fluctuation_value = null;
          }
          if (occupancyPriceDialog.occupancy !== 4) {
            updateData.occupancy_4_fluctuation_type = null;
            updateData.occupancy_4_fluctuation_value = null;
          }
        }

        // Validar updateData antes de adicionar
        if (!updateData.base_price || updateData.base_price <= 0 || isNaN(updateData.base_price)) {
          console.warn(`[ARIGrid] Pulando data ${format(date, 'yyyy-MM-dd')} - base_price inválido:`, updateData);
          continue;
        }
        
        // Garantir que adult_price seja um número válido
        if (isNaN(updateData.adult_price)) {
          updateData.adult_price = 0;
        }
        updateData.adult_price = Math.max(0, updateData.adult_price);
        
        updateDataArray.push(updateData);
        
        // Calcular preços esperados após aplicar a flutuação
        const expectedPrices: any = {
          x1: updateData.base_price - updateData.adult_price,
          x2: updateData.base_price,
          x3: updateData.base_price + updateData.adult_price,
          x4: updateData.base_price + (updateData.adult_price * 2),
        };
        
        // Aplicar flutuação se existir
        if (updateData.occupancy_1_fluctuation_type && updateData.occupancy_1_fluctuation_value !== null) {
          if (updateData.occupancy_1_fluctuation_type === 'percentage') {
            expectedPrices.x1 = expectedPrices.x1 * (1 + Number(updateData.occupancy_1_fluctuation_value) / 100);
          } else {
            expectedPrices.x1 = expectedPrices.x1 + Number(updateData.occupancy_1_fluctuation_value);
          }
          expectedPrices.x1 = Math.min(expectedPrices.x1, updateData.base_price);
        }
        if (updateData.occupancy_3_fluctuation_type && updateData.occupancy_3_fluctuation_value !== null) {
          if (updateData.occupancy_3_fluctuation_type === 'percentage') {
            expectedPrices.x3 = expectedPrices.x3 * (1 + Number(updateData.occupancy_3_fluctuation_value) / 100);
          } else {
            expectedPrices.x3 = expectedPrices.x3 + Number(updateData.occupancy_3_fluctuation_value);
          }
        }
        if (updateData.occupancy_4_fluctuation_type && updateData.occupancy_4_fluctuation_value !== null) {
          if (updateData.occupancy_4_fluctuation_type === 'percentage') {
            expectedPrices.x4 = expectedPrices.x4 * (1 + Number(updateData.occupancy_4_fluctuation_value) / 100);
          } else {
            expectedPrices.x4 = expectedPrices.x4 + Number(updateData.occupancy_4_fluctuation_value);
          }
        }
        
        console.log(`[ARIGrid] Preparado updateData para ${format(date, 'yyyy-MM-dd')}:`, {
          occupancy: occupancyPriceDialog.occupancy,
          base_price: updateData.base_price,
          adult_price: updateData.adult_price,
          fluctuation_type: updateData[`occupancy_${occupancyPriceDialog.occupancy}_fluctuation_type`],
          fluctuation_value: updateData[`occupancy_${occupancyPriceDialog.occupancy}_fluctuation_value`],
          expectedPrices,
          allFluctuationFields: {
            x1: { type: updateData.occupancy_1_fluctuation_type, value: updateData.occupancy_1_fluctuation_value },
            x3: { type: updateData.occupancy_3_fluctuation_type, value: updateData.occupancy_3_fluctuation_value },
            x4: { type: updateData.occupancy_4_fluctuation_type, value: updateData.occupancy_4_fluctuation_value },
          },
        });
      }

      // Preservar referência às categorias antes da atualização
      const categoriesBeforeUpdate = [...categories];
      
      console.log('[ARIGrid] Salvando atualizações:', {
        totalUpdates: updateDataArray.length,
        occupancy: occupancyPriceDialog.occupancy,
        sampleUpdate: updateDataArray[0],
        allDates: updateDataArray.map(u => u.date),
      });
      
      // Salvar todas as atualizações de uma vez
      let result;
      try {
        result = await upsertRateCalendar(updateDataArray);
        
        console.log('[ARIGrid] Resultado do upsert:', {
          resultLength: result?.length,
          sampleResult: result?.[0],
          hasFluctuationFields: result?.[0]?.occupancy_1_fluctuation_type !== undefined,
        });
      } catch (error: any) {
        console.error('[ARIGrid] Erro ao salvar no banco:', error);
        throw error;
      }
      
      // O upsertRateCalendar já invalida o cache no onSuccess, mas vamos garantir o refetch
      // Aguardar um pouco mais para garantir que o banco processou e a invalidação foi processada
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Forçar refetch explícito do rate_calendar e aguardar
      const refetchResult = await queryClient.refetchQueries({ 
        queryKey: ["rate_calendar"],
        exact: false 
      });
      
      console.log('[ARIGrid] Refetch concluído:', {
        refetchCount: refetchResult.length,
        rateCalendarLength: rateCalendar?.length,
      });
      
      // Fechar o modal após salvar
      setOccupancyPriceDialog({ ...occupancyPriceDialog, open: false });
      
      // Verificar se as categorias foram perdidas após a atualização
      if (categories.length === 0 && categoriesBeforeUpdate.length > 0) {
        console.warn('[ARIGrid] Categorias perdidas após salvar preço!', {
          before: categoriesBeforeUpdate.length,
          after: categories.length,
        });
      }
      
      toast.success(
        isBulkEdit 
          ? `Preço x${occupancyPriceDialog.occupancy} atualizado para ${updateDataArray.length} data(s)` 
          : 'Preço atualizado com sucesso'
      );
    } catch (error: any) {
      console.error('[ARIGrid] Erro ao salvar preço por ocupação:', error);
      toast.error('Erro ao salvar: ' + error.message);
    }
  };

  const renderPriceCell = (
    category: any,
    plan: RatePlan,
    date: Date,
    occupancy: number,
    isEditing: boolean
  ) => {
    const entry = getRateCalendarEntry(category.id, plan.id, date);
    const price = calculatePriceForOccupancy(entry, occupancy);
    const isPast = date < startOfDay(new Date());
    const dateStr = format(date, 'yyyy-MM-dd');
    const isStandardPrice = occupancy === 2;

    // Para preço padrão (x2), permitir edição inline
    if (isStandardPrice && isEditing) {
      // Se está editando esta célula específica
      if (editingCell?.categoryId === category.id && 
          editingCell?.planId === plan.id && 
          editingCell?.date === dateStr &&
          editingCell?.field === `price_${occupancy}`) {
        return (
          <div className="p-1">
            <Input
              type="text"
              value={editingCell.value}
              onChange={(e) => {
                // Permitir apenas números, vírgula e ponto
                let value = e.target.value.replace(/[^0-9,.]/g, '');
                // Garantir apenas um separador decimal
                const parts = value.split(/[,.]/);
                if (parts.length > 2) {
                  value = parts[0] + (parts[1] ? ',' + parts.slice(1).join('') : '');
                }
                setEditingCell({ ...editingCell, value });
              }}
              onBlur={handleSaveCellEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveCellEdit();
                } else if (e.key === 'Escape') {
                  setEditingCell(null);
                }
              }}
              placeholder="0,00"
              className="h-8 text-xs text-center"
              autoFocus
            />
          </div>
        );
      }

      // Célula clicável para edição inline
      return (
        <div
          className={cn(
            "p-2 text-sm text-center cursor-pointer hover:bg-gray-50",
            price === 0 && "text-gray-400"
          )}
          onClick={() => {
            if (!isPast) {
              setEditingCell({
                categoryId: category.id,
                planId: plan.id,
                date: dateStr,
                field: `price_${occupancy}`,
                value: price > 0 ? price.toFixed(2) : '0',
              });
            }
          }}
        >
          {price > 0 ? `R$ ${price.toFixed(2)}` : '—'}
        </div>
      );
    }

    // Para outros preços (x1, x3, x4), apenas exibir o preço (não clicável)
    // O botão "Editar" está no header da linha
    return (
      <div
        className={cn(
          "p-2 text-sm text-center",
          price === 0 && "text-gray-400"
        )}
      >
        {price > 0 ? `R$ ${price.toFixed(2)}` : '—'}
      </div>
    );
  };

  // Renderizar célula de restrição (checkbox ou número)
  const renderRestrictionCell = (
    category: any,
    plan: RatePlan,
    date: Date,
    field: string,
    type: 'checkbox' | 'number'
  ) => {
    const entry = getRateCalendarEntry(category.id, plan.id, date);
    const value = entry?.[field] || (type === 'checkbox' ? false : 0);
    const isPast = date < startOfDay(new Date());
    const dateStr = format(date, 'yyyy-MM-dd');

    if (type === 'checkbox') {
      return (
        <div className="p-2 flex items-center justify-center">
          <Checkbox
            checked={value}
            disabled={isPast}
            onCheckedChange={async (checked) => {
              if (!isPast && selectedEstablishment?.id) {
                const updateData: any = {
                  establishment_id: selectedEstablishment.id,
                  category_id: category.id,
                  pricing_plan_id: plan.id,
                  date: dateStr,
                  [field]: checked,
                };

                if (entry) {
                  updateData.base_price = entry.base_price;
                  updateData.adult_price = entry.adult_price;
                  updateData.min_stay = entry.min_stay;
                  updateData.max_stay = entry.max_stay;
                }

                try {
                  await upsertRateCalendar([updateData]);
                  toast.success('Restrição atualizada');
                } catch (error: any) {
                  toast.error('Erro ao atualizar: ' + error.message);
                }
              }
            }}
          />
        </div>
      );
    } else {
      // Número
      if (editingCell?.categoryId === category.id && 
          editingCell?.planId === plan.id && 
          editingCell?.date === dateStr &&
          editingCell?.field === field) {
        return (
          <div className="p-1">
            <Input
              type="number"
              value={editingCell.value}
              onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
              onBlur={handleSaveCellEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveCellEdit();
                } else if (e.key === 'Escape') {
                  setEditingCell(null);
                }
              }}
              className="h-8 text-xs"
              autoFocus
            />
          </div>
        );
      }

      return (
        <div
          className={cn(
            "p-2 text-sm text-center cursor-pointer hover:bg-gray-50",
            isPast && "opacity-50 cursor-default"
          )}
          onClick={() => {
            if (!isPast) {
              setEditingCell({
                categoryId: category.id,
                planId: plan.id,
                date: dateStr,
                field,
                value: value.toString(),
              });
            }
          }}
        >
          {value || '0'}
        </div>
      );
    }
  };

  // Renderizar linha de disponibilidade (barra colorida)
  const renderAvailabilityBar = (category: any, date: Date) => {
    const status = getSalesStatusForDate(category.id, date);
    const inventory = getInventoryForDate(category.id, date);
    const isPast = date < startOfDay(new Date());
    
    let barColor = 'bg-gray-200';
    if (!isPast) {
      if (status === 'open' && inventory.available_rooms > 0) {
        barColor = 'bg-green-500';
      } else if (status === 'closed') {
        barColor = 'bg-red-500';
      } else if (status === 'no_price') {
        barColor = 'bg-orange-500';
      }
    }

    return (
      <div className="p-1">
        <div className={cn("h-4 rounded", barColor)} />
      </div>
    );
  };

  // Se não há categorias, mostrar mensagem
  // Verificar tanto categories quanto filteredCategories para evitar falsos positivos
  // Mas aguardar um pouco antes de mostrar a mensagem, pois pode ser um estado temporário durante recarregamento
  const hasNoCategories = (!categories || categories.length === 0) && 
                          (!filteredCategories || filteredCategories.length === 0) &&
                          !isLoadingInventory && 
                          !isLoadingSalesStatus;

  if (hasNoCategories) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <p className="text-gray-500 mb-2">Nenhuma categoria encontrada</p>
          <p className="text-sm text-gray-400">
            Crie categorias de quartos no sistema para visualizar o grid ARI
          </p>
          {categories && categories.length === 0 && (
            <p className="text-xs text-orange-500 mt-2">
              Debug: categories prop está vazio. Verifique o componente pai.
            </p>
          )}
        </div>
      </Card>
    );
  }

  // Verificar se há erros nas queries indicando que as tabelas não existem
  const isTableNotFound = 
    filteredCategories.length > 0 &&
    (
      // Verificar erro na query de verificação de tabelas
      (tableCheckError && (tableCheckError as any)?.isTableNotFound) ||
      // Verificar erros nas queries de dados
      (inventoryError && ((inventoryError as any)?.isTableNotFound || 
        (inventoryError as any)?.code === 'PGRST116' ||
        (inventoryError as any)?.message?.includes('does not exist') ||
        (inventoryError as any)?.message?.includes('not found'))) ||
      (salesStatusError && ((salesStatusError as any)?.isTableNotFound ||
        (salesStatusError as any)?.code === 'PGRST116' ||
        (salesStatusError as any)?.message?.includes('does not exist') ||
        (salesStatusError as any)?.message?.includes('not found')))
    );

  // Se há erro de tabela não encontrada, mostrar mensagem
  if (isTableNotFound) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-orange-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">Migrations ARI não executadas</h3>
          <p className="text-gray-600 mb-4">
            As tabelas do sistema ARI ainda não foram criadas no banco de dados.
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Execute as seguintes migrations no Supabase na ordem:
          </p>
          <div className="bg-gray-50 rounded-lg p-4 text-left max-w-2xl mx-auto">
            <ol className="list-decimal list-inside space-y-2 text-sm font-mono">
              <li>20250127000001_create_ari_rate_availability_grid.sql</li>
              <li>20250127000002_ari_auto_sync_inventory_triggers.sql</li>
              <li>20250127000003_ari_migrate_existing_data.sql</li>
              <li>20250127000004_ari_initialize_inventory_for_all_establishments.sql</li>
            </ol>
          </div>
          <p className="text-xs text-gray-400 mt-4">
            Após executar as migrations, recarregue a página.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header com controles */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-1">
            {/* Seletor de Categoria */}
            <div className="min-w-[200px]">
              <Label className="text-xs text-gray-500 mb-1 block">Categoria</Label>
              <Select value={selectedCategory} onValueChange={onCategoryChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded"
                          style={{ backgroundColor: category.color || '#3B82F6' }}
                        />
                        {category.name}
                        {category.rooms && (
                          <span className="text-xs text-gray-500 ml-2">
                            (x{category.rooms.length})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, "dd MMM yyyy", { locale: ptBR })} - {format(addDays(startDate, viewDays - 1), "dd MMM yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={{ from: startDate, to: addDays(startDate, viewDays - 1) }}
                  onSelect={(range) => {
                    if (range?.from) {
                      onStartDateChange(range.from);
                      if (range.to) {
                        const days = Math.ceil((range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                        setViewDays(days);
                      }
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Select value={viewDays.toString()} onValueChange={(v) => setViewDays(Number(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="60">60 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              onClick={() => setBulkEditOpen(true)}
            >
              <Edit2 className="w-4 h-4 mr-2" />
              Edição em massa
            </Button>

            <Button
              variant="outline"
              onClick={async () => {
                if (!selectedEstablishment?.id || filteredCategories.length === 0) return;
                
                toast.loading('Sincronizando inventário...', { id: 'sync-inventory' });
                
                try {
                  // Sincronizar inventário para todas as categorias e datas visíveis
                  const syncPromises: Promise<any>[] = [];
                  
                  filteredCategories.forEach(category => {
                    visibleDates.forEach(date => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      syncPromises.push(
                        supabase.rpc('sync_rate_inventory_from_reservations', {
                          p_establishment_id: selectedEstablishment.id,
                          p_category_id: category.id,
                          p_date: dateStr,
                        }).then(() => null).catch((err) => {
                          console.warn(`[ARIGrid] Erro ao sincronizar ${category.id} - ${dateStr}:`, err);
                          return null;
                        })
                      );
                    });
                  });

                  await Promise.all(syncPromises);
                  
                  // Invalidar queries e resetar estado para permitir nova sincronização
                  setAutoSyncDone(false);
                  setRefetchTrigger(prev => prev + 1);
                  queryClient.invalidateQueries({ queryKey: ['ari_inventory_bulk'] });
                  
                  toast.success('Inventário sincronizado com sucesso!', { id: 'sync-inventory' });
                } catch (error: any) {
                  console.error('Erro ao sincronizar inventário:', error);
                  toast.error('Erro ao sincronizar inventário: ' + (error.message || 'Erro desconhecido'), { id: 'sync-inventory' });
                }
              }}
              disabled={isLoadingInventory || isLoadingSalesStatus}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", (isLoadingInventory || isLoadingSalesStatus) && "animate-spin")} />
              Sincronizar Inventário
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStartDateChange(addDays(startDate, -viewDays))}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStartDateChange(addDays(startDate, viewDays))}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Legenda */}
      <Card className="p-4">
        <div className="flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-200 rounded" />
            <span className="text-xs text-gray-600">Datas Passadas</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-300 rounded" />
            <span className="text-xs text-gray-600">Reservável</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-100 border border-orange-300 rounded" />
            <span className="text-xs text-gray-600">Sem Preço</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 border border-red-300 rounded" />
            <span className="text-xs text-gray-600">Fechado</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded" />
            <span className="text-xs text-gray-600">Há Restrições</span>
          </div>
        </div>
      </Card>

      {/* Grid ARI - Uma seção por categoria */}
      {filteredCategories.map((category) => (
        <Card key={category.id} className="overflow-hidden">
          {/* Cabeçalho da categoria */}
          <div className="bg-gray-50 p-4 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-4 h-4 rounded"
                  style={{ backgroundColor: category.color || '#3B82F6' }}
                />
                <div>
                  <h3 className="font-semibold">{category.name}</h3>
                  <p className="text-xs text-gray-500">
                    {category.rooms?.length || 0} {category.rooms?.length === 1 ? 'quarto' : 'quartos'}
                    {category.rooms?.[0]?.id && (
                      <span className="ml-2">ID do quarto: {category.rooms[0].id.substring(0, 4)}</span>
                    )}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // TODO: Abrir dialog de edição de categoria
                }}
              >
                Edição da categoria
              </Button>
            </div>
          </div>

          {/* Grid da categoria */}
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Header com datas */}
              <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
                <div className="flex">
                  <div className="w-64 flex-shrink-0 p-4 border-r border-gray-200 bg-gray-50 font-semibold">
                    {category.name}
                  </div>
                  <div className="flex-1 flex">
                    {visibleDates.map((date) => (
                      <div
                        key={date.toISOString()}
                        className="flex-shrink-0 p-2 text-center border-r border-gray-200 last:border-r-0"
                        style={{ minWidth: '80px' }}
                      >
                        <div className="text-xs font-semibold text-gray-600">
                          {format(date, "EEE", { locale: ptBR })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {format(date, "dd/MM")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Linhas do grid */}
              {/* Status do quarto */}
              <div className="flex border-b border-gray-100">
                <div className="w-64 flex-shrink-0 p-3 border-r border-gray-200 bg-gray-50 font-medium text-sm">
                  Status do quarto
                </div>
                <div className="flex-1 flex">
                  {visibleDates.map((date) => (
                    <div
                      key={`status-${date.toISOString()}`}
                      className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                      style={{ minWidth: '80px' }}
                    >
                      {renderStatusCell(category, date)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Quartos à venda */}
              <div className="flex border-b border-gray-100">
                <div className="w-64 flex-shrink-0 p-3 border-r border-gray-200 bg-gray-50 font-medium text-sm">
                  Quartos à venda
                </div>
                <div className="flex-1 flex">
                  {visibleDates.map((date) => (
                    <div
                      key={`inventory-${date.toISOString()}`}
                      className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                      style={{ minWidth: '80px' }}
                    >
                      {renderInventoryCell(category, date)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Reservas Efetivas */}
              <div className="flex border-b border-gray-100">
                <div className="w-64 flex-shrink-0 p-3 border-r border-gray-200 bg-gray-50 font-medium text-sm">
                  Reservas Efetivas
                </div>
                <div className="flex-1 flex">
                  {visibleDates.map((date) => (
                    <div
                      key={`reservations-${date.toISOString()}`}
                      className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                      style={{ minWidth: '80px' }}
                    >
                      {renderReservationsCell(category, date)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Ocupação */}
              <div className="flex border-b border-gray-100">
                <div className="w-64 flex-shrink-0 p-3 border-r border-gray-200 bg-gray-50 font-medium text-sm">
                  Ocupação
                </div>
                <div className="flex-1 flex">
                  {visibleDates.map((date) => (
                    <div
                      key={`occupancy-${date.toISOString()}`}
                      className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                      style={{ minWidth: '80px' }}
                    >
                      {renderOccupancyCell(category, date)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Planos tarifários */}
              {activePlans.map((plan) => {
                const isExpanded = isPlanExpanded(category.id, plan.id);
                
                return (
                  <div key={plan.id} className="border-b border-gray-100 last:border-b-0">
                    {/* Linha principal do plano (clicável para expandir) */}
                    <div 
                      className="flex border-b border-gray-100 cursor-pointer hover:bg-gray-50"
                      onClick={() => togglePlanExpansion(category.id, plan.id)}
                    >
                      <div className="w-64 flex-shrink-0 p-3 border-r border-gray-200 bg-gray-50 font-medium text-sm flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                        {plan.name}
                      </div>
                      <div className="flex-1 flex">
                        {visibleDates.map((date) => {
                          const entry = getRateCalendarEntry(category.id, plan.id, date);
                          const price = calculatePriceForOccupancy(entry, 2); // Preço padrão x2
                          const status = getSalesStatusForDate(category.id, date);
                          
                          return (
                            <div
                              key={`plan-${plan.id}-${date.toISOString()}`}
                              className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                              style={{ minWidth: '80px' }}
                            >
                              <div className={cn(
                                "p-2 text-sm text-center",
                                price === 0 && status === 'no_price' && "bg-orange-50"
                              )}>
                                {price > 0 ? `R$ ${price.toFixed(2)}` : '—'}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Linhas expandidas do plano */}
                    {isExpanded && (
                      <>
                        {/* Disponibilidade */}
                        <div className="flex border-b border-gray-100 bg-gray-25">
                          <div className="w-64 flex-shrink-0 p-2 border-r border-gray-200 bg-gray-50 text-xs text-gray-600 pl-8">
                            Disponibilidade
                          </div>
                          <div className="flex-1 flex">
                            {visibleDates.map((date) => (
                              <div
                                key={`availability-${plan.id}-${date.toISOString()}`}
                                className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                                style={{ minWidth: '80px' }}
                              >
                                {renderAvailabilityBar(category, date)}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Preços por ocupação - renderização dinâmica baseada na capacidade */}
                        {getOccupanciesToDisplay(category).map((occupancy) => {
                          const isStandard = occupancy === 2;
                          return (
                            <div 
                              key={`price-x${occupancy}`} 
                              className={cn(
                                "flex border-b border-gray-100",
                                isStandard 
                                  ? "bg-blue-50 border-blue-200" 
                                  : "bg-gray-25"
                              )}
                            >
                              <div className={cn(
                                "w-64 flex-shrink-0 p-2 border-r border-gray-200 text-xs pl-8 flex items-center gap-2",
                                isStandard 
                                  ? "bg-blue-100 text-blue-900 font-semibold border-blue-200" 
                                  : "bg-gray-50 text-gray-600"
                              )}>
                                <Users className="w-4 h-4" />
                                {isStandard ? (
                                  'Preço padrão x2'
                                ) : (
                                  <>
                                    <span>Preço x{occupancy}</span>
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="h-auto p-0 text-blue-600 hover:text-blue-800 text-xs font-normal"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // Abrir modal para editar todas as datas desta ocupação
                                        setOccupancyPriceDialog({
                                          open: true,
                                          categoryId: category.id,
                                          categoryName: category.name,
                                          planId: plan.id,
                                          planName: plan.name,
                                          date: null, // null indica edição em massa
                                          occupancy,
                                        });
                                      }}
                                    >
                                      Editar
                                    </Button>
                                  </>
                                )}
                              </div>
                              <div className="flex-1 flex">
                                {visibleDates.map((date) => (
                                  <div
                                    key={`price-x${occupancy}-${plan.id}-${date.toISOString()}`}
                                    className={cn(
                                      "flex-shrink-0 border-r border-gray-100 last:border-r-0",
                                      isStandard && "border-blue-200"
                                    )}
                                    style={{ minWidth: '80px' }}
                                  >
                                    {renderPriceCell(category, plan, date, occupancy, true)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}

                        {/* Duração mínima da estadia */}
                        <div className="flex border-b border-gray-100 bg-gray-25">
                          <div className="w-64 flex-shrink-0 p-2 border-r border-gray-200 bg-gray-50 text-xs text-gray-600 pl-8">
                            Duração mínima da estadia
                          </div>
                          <div className="flex-1 flex">
                            {visibleDates.map((date) => (
                              <div
                                key={`min-stay-${plan.id}-${date.toISOString()}`}
                                className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                                style={{ minWidth: '80px' }}
                              >
                                {renderRestrictionCell(category, plan, date, 'min_stay', 'number')}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Duração máxima da estadia */}
                        <div className="flex border-b border-gray-100 bg-gray-25">
                          <div className="w-64 flex-shrink-0 p-2 border-r border-gray-200 bg-gray-50 text-xs text-gray-600 pl-8">
                            Duração máxima da estadia
                          </div>
                          <div className="flex-1 flex">
                            {visibleDates.map((date) => (
                              <div
                                key={`max-stay-${plan.id}-${date.toISOString()}`}
                                className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                                style={{ minWidth: '80px' }}
                              >
                                {renderRestrictionCell(category, plan, date, 'max_stay', 'number')}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Fechado para check-in */}
                        <div className="flex border-b border-gray-100 bg-gray-25">
                          <div className="w-64 flex-shrink-0 p-2 border-r border-gray-200 bg-gray-50 text-xs text-gray-600 pl-8">
                            Fechado para check-in
                          </div>
                          <div className="flex-1 flex">
                            {visibleDates.map((date) => (
                              <div
                                key={`cta-${plan.id}-${date.toISOString()}`}
                                className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                                style={{ minWidth: '80px' }}
                              >
                                {renderRestrictionCell(category, plan, date, 'closed_to_arrival', 'checkbox')}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Fechado para checkout */}
                        <div className="flex border-b border-gray-100 bg-gray-25">
                          <div className="w-64 flex-shrink-0 p-2 border-r border-gray-200 bg-gray-50 text-xs text-gray-600 pl-8">
                            Fechado para checkout
                          </div>
                          <div className="flex-1 flex">
                            {visibleDates.map((date) => (
                              <div
                                key={`ctd-${plan.id}-${date.toISOString()}`}
                                className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                                style={{ minWidth: '80px' }}
                              >
                                {renderRestrictionCell(category, plan, date, 'closed_to_departure', 'checkbox')}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Antecedência Mínima */}
                        <div className="flex border-b border-gray-100 bg-gray-25">
                          <div className="w-64 flex-shrink-0 p-2 border-r border-gray-200 bg-gray-50 text-xs text-gray-600 pl-8">
                            Antecedência Mínima
                          </div>
                          <div className="flex-1 flex">
                            {visibleDates.map((date) => (
                              <div
                                key={`min-advance-${plan.id}-${date.toISOString()}`}
                                className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                                style={{ minWidth: '80px' }}
                              >
                                <div className="p-2 text-sm text-center text-gray-600">0</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Antecedência Máxima */}
                        <div className="flex border-b border-gray-100 bg-gray-25 last:border-b-0">
                          <div className="w-64 flex-shrink-0 p-2 border-r border-gray-200 bg-gray-50 text-xs text-gray-600 pl-8">
                            Antecedência Máxima
                          </div>
                          <div className="flex-1 flex">
                            {visibleDates.map((date) => (
                              <div
                                key={`max-advance-${plan.id}-${date.toISOString()}`}
                                className="flex-shrink-0 border-r border-gray-100 last:border-r-0"
                                style={{ minWidth: '80px' }}
                              >
                                <div className="p-2 text-sm text-center text-gray-600">0</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      ))}

      {/* Dialog de edição em massa */}
      {selectedCategory !== 'all' && (
        <ARIBulkEditDialog
          open={bulkEditOpen}
          onOpenChange={setBulkEditOpen}
          categoryId={selectedCategory}
          startDate={startDate}
          endDate={addDays(startDate, viewDays - 1)}
          onSuccess={() => {
            setRefetchTrigger(prev => prev + 1);
          }}
        />
      )}

      {/* Dialog de edição de status */}
      <Dialog open={statusEditDialog.open} onOpenChange={(open) => setStatusEditDialog({ ...statusEditDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Status de Venda</DialogTitle>
            <DialogDescription>
              Data: {statusEditDialog.date && format(statusEditDialog.date, "dd/MM/yyyy", { locale: ptBR })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={statusEditDialog.status || ''}
                onValueChange={(value) => setStatusEditDialog({ ...statusEditDialog, status: value as any })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Disponível</SelectItem>
                  <SelectItem value="closed">Fechado</SelectItem>
                  <SelectItem value="no_price">Sem Preço</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStatusEditDialog({ open: false, categoryId: '', date: null, status: null })}
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (statusEditDialog.date && statusEditDialog.status && statusEditDialog.categoryId) {
                  handleUpdateStatus(statusEditDialog.categoryId, statusEditDialog.date, statusEditDialog.status);
                }
              }}
              disabled={!statusEditDialog.status}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de edição de preço por ocupação */}
      {occupancyPriceDialog.open && (
        <OccupancyPriceEditDialog
          open={occupancyPriceDialog.open}
          onOpenChange={(open) => setOccupancyPriceDialog({ ...occupancyPriceDialog, open })}
          categoryName={occupancyPriceDialog.categoryName}
          planName={occupancyPriceDialog.planName}
          occupancy={occupancyPriceDialog.occupancy}
          currentPrice={(() => {
            // Para edição em massa (x1, x3, x4), não mostrar preço atual
            // pois a alteração será baseada no preço padrão de cada data
            if (occupancyPriceDialog.date === null || occupancyPriceDialog.occupancy !== 2) {
              return 0; // Não mostrar preço atual em edições em massa
            }
            
            // Se for edição de uma data específica (x2), usar o preço dessa data
            const entry = getRateCalendarEntry(
              occupancyPriceDialog.categoryId,
              occupancyPriceDialog.planId,
              occupancyPriceDialog.date!
            );
            return calculatePriceForOccupancy(entry, occupancyPriceDialog.occupancy);
          })()}
          basePrice={(() => {
            // Se for edição em massa, usar a primeira data futura como referência
            if (occupancyPriceDialog.date === null) {
              const firstFutureDate = visibleDates.find(date => date >= startOfDay(new Date()));
              if (!firstFutureDate) return 0;
              const entry = getRateCalendarEntry(
                occupancyPriceDialog.categoryId,
                occupancyPriceDialog.planId,
                firstFutureDate
              );
              return entry?.base_price || 0;
            }
            
            const entry = getRateCalendarEntry(
              occupancyPriceDialog.categoryId,
              occupancyPriceDialog.planId,
              occupancyPriceDialog.date!
            );
            return entry?.base_price || 0;
          })()}
          adultPrice={(() => {
            // Se for edição em massa, usar a primeira data futura como referência
            if (occupancyPriceDialog.date === null) {
              const firstFutureDate = visibleDates.find(date => date >= startOfDay(new Date()));
              if (!firstFutureDate) return 0;
              const entry = getRateCalendarEntry(
                occupancyPriceDialog.categoryId,
                occupancyPriceDialog.planId,
                firstFutureDate
              );
              return entry?.adult_price || 0;
            }
            
            const entry = getRateCalendarEntry(
              occupancyPriceDialog.categoryId,
              occupancyPriceDialog.planId,
              occupancyPriceDialog.date!
            );
            return entry?.adult_price || 0;
          })()}
          savedFluctuationType={(() => {
            // Buscar tipo de flutuação salvo da primeira data futura
            const firstFutureDate = visibleDates.find(date => date >= startOfDay(new Date()));
            if (!firstFutureDate) return null;
            const entry = getRateCalendarEntry(
              occupancyPriceDialog.categoryId,
              occupancyPriceDialog.planId,
              firstFutureDate
            );
            if (!entry) return null;
            
            if (occupancyPriceDialog.occupancy === 1) {
              return entry.occupancy_1_fluctuation_type || null;
            } else if (occupancyPriceDialog.occupancy === 3) {
              return entry.occupancy_3_fluctuation_type || null;
            } else if (occupancyPriceDialog.occupancy === 4) {
              return entry.occupancy_4_fluctuation_type || null;
            }
            return null;
          })()}
          savedFluctuationValue={(() => {
            // Buscar valor de flutuação salvo da primeira data futura
            const firstFutureDate = visibleDates.find(date => date >= startOfDay(new Date()));
            if (!firstFutureDate) return null;
            const entry = getRateCalendarEntry(
              occupancyPriceDialog.categoryId,
              occupancyPriceDialog.planId,
              firstFutureDate
            );
            if (!entry) return null;
            
            if (occupancyPriceDialog.occupancy === 1) {
              return entry.occupancy_1_fluctuation_value || null;
            } else if (occupancyPriceDialog.occupancy === 3) {
              return entry.occupancy_3_fluctuation_value || null;
            } else if (occupancyPriceDialog.occupancy === 4) {
              return entry.occupancy_4_fluctuation_value || null;
            }
            return null;
          })()}
          isBulkEdit={occupancyPriceDialog.occupancy !== 2 || occupancyPriceDialog.date === null}
          onSave={handleSaveOccupancyPrice}
        />
      )}
    </div>
  );
};
