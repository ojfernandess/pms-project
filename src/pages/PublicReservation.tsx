import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, MapPin, Phone, Mail, Wifi, Car, UtensilsCrossed, Waves, Wind, Tv, Coffee, Bed, Users, Calendar, DollarSign, AlertCircle, MessageCircle, Star, ChevronRight, Sparkles, ChevronLeft, X, ImageIcon, Home, Clock, Plus, Minus, ChevronDown, XCircle, FileText, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Dialog, DialogContent, DialogTitle, DialogHeader, DialogDescription } from "@/components/ui/dialog";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const PublicReservation = () => {
  const { establishmentSlug } = useParams<{ establishmentSlug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [establishment, setEstablishment] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [establishmentServices, setEstablishmentServices] = useState<any[]>([]);
  const [hotelSettings, setHotelSettings] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  // Múltiplas categorias selecionadas (estilo Booking.com)
  const [selectedCategories, setSelectedCategories] = useState<Array<{
    categoryId: string;
    rooms: number;
    adults: number;
    price: number;
  }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pmsLogoUrl, setPmsLogoUrl] = useState<string | null>(null);
  const { settings: siteSettings } = useSiteSettings();

  // Form data
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    cpf: "",
    email: "",
    phone: "",
    checkinDate: "",
    checkoutDate: "",
    adults: "1",
    children: "0",
    notes: "",
    promotionalCode: "",
  });

  const [calculatedPrice, setCalculatedPrice] = useState<number | null>(null);
  const [calculatingPrice, setCalculatingPrice] = useState(false);
  const [categoryPrices, setCategoryPrices] = useState<Record<string, number>>({});
  const [publicPricingPlanId, setPublicPricingPlanId] = useState<string | null>(null);
  const [publicPricingPlan1Id, setPublicPricingPlan1Id] = useState<string | null>(null);
  const [publicPricingPlan1Title, setPublicPricingPlan1Title] = useState<string | null>(null);
  const [publicPricingPlan2Id, setPublicPricingPlan2Id] = useState<string | null>(null);
  const [publicPricingPlan2Title, setPublicPricingPlan2Title] = useState<string | null>(null);
  const [categoryPricesPlan1, setCategoryPricesPlan1] = useState<Record<string, number>>({});
  const [categoryPricesPlan2, setCategoryPricesPlan2] = useState<Record<string, number>>({});
  const [selectedPlanByCategory, setSelectedPlanByCategory] = useState<Record<string, "plan1" | "plan2" | null>>({});
  // Preços recalculados por categoria no resumo (usando dados específicos de cada categoria)
  const [summaryPlanPrices, setSummaryPlanPrices] = useState<Record<string, { plan1?: number; plan2?: number }>>({});
  // Categorias que foram removidas manualmente pelo usuário (não devem ser readicionadas automaticamente)
  const [manuallyRemovedCategories, setManuallyRemovedCategories] = useState<Set<string>>(new Set());
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedCategoryForGallery, setSelectedCategoryForGallery] = useState<any>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [guestsModalOpen, setGuestsModalOpen] = useState(false);
  const [manualRooms, setManualRooms] = useState<number | null>(null); // null = automático, número = manual
  const [availableRoomsCount, setAvailableRoomsCount] = useState<number | null>(null); // Quantidade de quartos disponíveis para categoria selecionada
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [lastAvailabilityWarning, setLastAvailabilityWarning] = useState<string | null>(null); // Para evitar avisos repetidos
  const [categoryTotalRooms, setCategoryTotalRooms] = useState<Record<string, number>>({}); // Total de quartos por categoria (geral)
  const [categoryAvailableRooms, setCategoryAvailableRooms] = useState<Record<string, number>>({}); // Quartos disponíveis por categoria para o período selecionado
  const [establishmentPolicies, setEstablishmentPolicies] = useState<any>(null); // Políticas do estabelecimento
  const [buildingPolicies, setBuildingPolicies] = useState<any>(null); // Políticas do prédio
  const [buildingName, setBuildingName] = useState<string | null>(null); // Nome do prédio
  const [loadingPolicies, setLoadingPolicies] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null); // Cupom aplicado
  const [validatingCoupon, setValidatingCoupon] = useState(false); // Validando cupom
  const [policiesDialogOpen, setPoliciesDialogOpen] = useState(false);

  useEffect(() => {
    if (establishmentSlug) {
      loadData();
    }
  }, [establishmentSlug]);

  // Função auxiliar para formatar data sem problemas de timezone
  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Função auxiliar para adicionar dias a uma data sem problemas de timezone
  const addDays = (date: Date, days: number): Date => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  };

  // Função auxiliar para calcular preços de uma categoria para um plano específico
  const calculateCategoryPriceForPlan = async (
    category: any,
    planId: string | null,
    adults: number,
    children: number,
    checkinDate: string | null,
    checkoutDate: string | null,
    requiredRooms: number
  ): Promise<number> => {
    const basePrice = Number(category.base_price || 0);
    let categoryTotal = 0;

    if (checkinDate && checkoutDate && checkinDate < checkoutDate) {
      const [checkinYear, checkinMonth, checkinDay] = checkinDate.split('-').map(Number);
      const [checkoutYear, checkoutMonth, checkoutDay] = checkoutDate.split('-').map(Number);
      const checkin = new Date(checkinYear, checkinMonth - 1, checkinDay);
      const checkout = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
      const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

      if (nights > 0) {
        for (let i = 0; i < nights; i++) {
          const currentDate = addDays(checkin, i);
          const dateStr = formatDateLocal(currentDate);

          try {
            const { data, error } = await supabase.rpc("calculate_rate_price", {
              p_establishment_id: establishment!.id,
              p_category_id: category.id,
              p_pricing_plan_id: planId,
              p_date: dateStr,
              p_adults: adults,
              p_children: children,
            });

            if (error) {
              categoryTotal += basePrice;
            } else {
              const price = Number(data || 0);
              categoryTotal += price > 0 ? price : basePrice;
            }
          } catch (error) {
            categoryTotal += basePrice;
          }
        }
      }
    } else {
      const todayStr = formatDateLocal(new Date());
      try {
        const { data, error } = await supabase.rpc("calculate_rate_price", {
          p_establishment_id: establishment!.id,
          p_category_id: category.id,
          p_pricing_plan_id: planId,
          p_date: todayStr,
          p_adults: adults,
          p_children: children,
        });

        if (error) {
          categoryTotal = basePrice;
        } else {
          const price = Number(data || 0);
          categoryTotal = price > 0 ? price : basePrice;
        }
      } catch (error) {
        categoryTotal = basePrice;
      }
    }

    return categoryTotal * requiredRooms;
  };

  // Calcular preços para todas as categorias quando dados mudarem
  useEffect(() => {
    if (categories.length > 0 && establishment?.id) {
      const calculateCategoryPrices = async () => {
        setCalculatingPrice(true);
        try {
          const adults = parseInt(formData.adults) || 1;
          const children = parseInt(formData.children) || 0;
          const prices: Record<string, number> = {};
          const pricesPlan1: Record<string, number> = {};
          const pricesPlan2: Record<string, number> = {};

          // Se há datas selecionadas, calcular preço total
          if (formData.checkinDate && formData.checkoutDate && formData.checkinDate < formData.checkoutDate) {
            const [checkinYear, checkinMonth, checkinDay] = formData.checkinDate.split('-').map(Number);
            const [checkoutYear, checkoutMonth, checkoutDay] = formData.checkoutDate.split('-').map(Number);
            const checkin = new Date(checkinYear, checkinMonth - 1, checkinDay);
            const checkout = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
            const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

            if (nights > 0) {
              // Calcular preço para cada categoria (preço total)
              for (const category of categories) {
                // Calcular número de quartos necessários baseado na capacidade
                let requiredRooms = 1;
                if (selectedCategory === category.id && manualRooms !== null) {
                  requiredRooms = manualRooms;
                } else {
                  requiredRooms = calculateRequiredRooms(adults, category);
                }

                // Calcular preço usando plano padrão (para compatibilidade)
                const defaultPrice = await calculateCategoryPriceForPlan(
                  category,
                  publicPricingPlanId,
                  adults,
                  children,
                  formData.checkinDate,
                  formData.checkoutDate,
                  requiredRooms
                );
                prices[category.id] = defaultPrice;

                // Calcular preço para plano 1 se configurado
                if (publicPricingPlan1Id) {
                  const plan1Price = await calculateCategoryPriceForPlan(
                    category,
                    publicPricingPlan1Id,
                    adults,
                    children,
                    formData.checkinDate,
                    formData.checkoutDate,
                    requiredRooms
                  );
                  pricesPlan1[category.id] = plan1Price;
                }

                // Calcular preço para plano 2 se configurado
                if (publicPricingPlan2Id) {
                  const plan2Price = await calculateCategoryPriceForPlan(
                    category,
                    publicPricingPlan2Id,
                    adults,
                    children,
                    formData.checkinDate,
                    formData.checkoutDate,
                    requiredRooms
                  );
                  pricesPlan2[category.id] = plan2Price;
                }
              }
            }
          } else {
            // Se não há datas, calcular preço para hoje
            for (const category of categories) {
              let requiredRooms = 1;
              if (selectedCategory === category.id && manualRooms !== null) {
                requiredRooms = manualRooms;
              } else {
                requiredRooms = calculateRequiredRooms(adults, category);
              }

              // Calcular preço usando plano padrão
              const defaultPrice = await calculateCategoryPriceForPlan(
                category,
                publicPricingPlanId,
                adults,
                children,
                null,
                null,
                requiredRooms
              );
              prices[category.id] = defaultPrice;

              // Calcular preço para plano 1 se configurado
              if (publicPricingPlan1Id) {
                const plan1Price = await calculateCategoryPriceForPlan(
                  category,
                  publicPricingPlan1Id,
                  adults,
                  children,
                  null,
                  null,
                  requiredRooms
                );
                pricesPlan1[category.id] = plan1Price;
              }

              // Calcular preço para plano 2 se configurado
              if (publicPricingPlan2Id) {
                const plan2Price = await calculateCategoryPriceForPlan(
                  category,
                  publicPricingPlan2Id,
                  adults,
                  children,
                  null,
                  null,
                  requiredRooms
                );
                pricesPlan2[category.id] = plan2Price;
              }
            }
          }

          setCategoryPrices(prices);
          setCategoryPricesPlan1(pricesPlan1);
          setCategoryPricesPlan2(pricesPlan2);

          // Se há categoria selecionada, atualizar preço calculado
          if (selectedCategory && prices[selectedCategory]) {
            setCalculatedPrice(prices[selectedCategory]);
          } else {
            setCalculatedPrice(null);
          }
        } catch (error) {
          console.error("Erro ao calcular preços:", error);
          setCategoryPrices({});
          setCalculatedPrice(null);
        } finally {
          setCalculatingPrice(false);
        }
      };

      const timeoutId = setTimeout(calculateCategoryPrices, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setCategoryPrices({});
      setCalculatedPrice(null);
    }
  }, [
    categories,
    selectedCategory,
    selectedRoom,
    establishment?.id,
    publicPricingPlanId,
    publicPricingPlan1Id,
    publicPricingPlan2Id,
    formData.checkinDate,
    formData.checkoutDate,
    formData.adults,
    formData.children,
    manualRooms,
  ]);

  // Verificar disponibilidade de quartos quando datas, categoria, adultos ou quartos mudarem
  useEffect(() => {
    const checkAvailability = async () => {
      if (!selectedCategory || !formData.checkinDate || !formData.checkoutDate || !establishment?.id) {
        setAvailableRoomsCount(null);
        return;
      }

      setCheckingAvailability(true);
      try {
        const selectedCategoryData = categories.find((c) => c.id === selectedCategory);
        if (!selectedCategoryData) {
          setAvailableRoomsCount(null);
          return;
        }

        // Calcular número de quartos necessários
        const adults = parseInt(formData.adults) || 1;
        let currentRequiredRooms = 1;
        if (manualRooms !== null) {
          currentRequiredRooms = manualRooms;
        } else {
          currentRequiredRooms = calculateRequiredRooms(adults, selectedCategoryData);
        }

        // Buscar todos os quartos da categoria que estão disponíveis
        const { data: rooms, error: roomsError } = await supabase
          .from("rooms")
          .select("id")
          .eq("category_id", selectedCategory)
          .eq("establishment_id", establishment.id)
          .eq("show_in_public", true)
          .in("status", ["available", "cleaning"])
          .eq("is_blocked", false);

        if (roomsError || !rooms || rooms.length === 0) {
          setAvailableRoomsCount(0);
          return;
        }

        // Buscar reservas que conflitam com o período
        const { data: conflictingReservations, error: reservationsError } = await supabase
          .from("reservations")
          .select("room_id")
          .eq("category_id", selectedCategory)
          .eq("establishment_id", establishment.id)
          .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"])
          .or(`and(checkin_date.lt.${formData.checkoutDate},checkout_date.gt.${formData.checkinDate})`);

        if (reservationsError) {
          console.error("Erro ao buscar reservas:", reservationsError);
          setAvailableRoomsCount(null);
          return;
        }

        // IDs de quartos ocupados
        const occupiedRoomIds = new Set(
          conflictingReservations?.map((r) => r.room_id).filter(Boolean) || []
        );

        // Quartos disponíveis (não ocupados)
        const availableRooms = rooms.filter((room) => !occupiedRoomIds.has(room.id));
        const availableCount = availableRooms.length;
        setAvailableRoomsCount(availableCount);

        // Mostrar aviso se não houver quartos suficientes (apenas se mudou)
        const warningKey = `${availableCount}-${currentRequiredRooms}`;
        if (warningKey !== lastAvailabilityWarning) {
          if (availableCount === 0) {
            toast.error(t("publicReservation.noRoomsAvailable"), {
              duration: 4000,
            });
            setLastAvailabilityWarning(warningKey);
          } else if (availableCount < currentRequiredRooms) {
            toast.warning(
              formatInsufficientRoomsWarning(availableCount, currentRequiredRooms),
              {
                duration: 4000,
              }
            );
            setLastAvailabilityWarning(warningKey);
          } else {
            // Se há quartos suficientes, limpar o último aviso
            setLastAvailabilityWarning(null);
          }
        }
      } catch (error: any) {
        console.error("Erro ao verificar disponibilidade:", error);
        setAvailableRoomsCount(null);
      } finally {
        setCheckingAvailability(false);
      }
    };

    const timeoutId = setTimeout(checkAvailability, 500);
    return () => clearTimeout(timeoutId);
  }, [selectedCategory, formData.checkinDate, formData.checkoutDate, formData.adults, manualRooms, establishment?.id, categories, t]);

  // Verificar disponibilidade de quartos por categoria quando datas mudarem
  useEffect(() => {
    const checkCategoryAvailability = async () => {
      if (!formData.checkinDate || !formData.checkoutDate || !establishment?.id || categories.length === 0) {
        setCategoryAvailableRooms({});
        return;
      }

      try {
        const availabilityByCategory: Record<string, number> = {};

        // Para cada categoria, verificar disponibilidade no período
        for (const category of categories) {
          // Buscar todos os quartos da categoria que estão disponíveis
          const { data: rooms, error: roomsError } = await supabase
            .from("rooms")
            .select("id")
            .eq("category_id", category.id)
            .eq("establishment_id", establishment.id)
            .eq("show_in_public", true)
            .in("status", ["available", "cleaning"])
            .eq("is_blocked", false);

          if (roomsError || !rooms || rooms.length === 0) {
            availabilityByCategory[category.id] = 0;
            continue;
          }

          // Buscar reservas que conflitam com o período
          const { data: conflictingReservations, error: reservationsError } = await supabase
            .from("reservations")
            .select("room_id")
            .eq("category_id", category.id)
            .eq("establishment_id", establishment.id)
            .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"])
            .or(`and(checkin_date.lt.${formData.checkoutDate},checkout_date.gt.${formData.checkinDate})`);

          if (reservationsError) {
            console.error("Erro ao buscar reservas para categoria:", category.id, reservationsError);
            availabilityByCategory[category.id] = 0;
            continue;
          }

          // IDs de quartos ocupados
          const occupiedRoomIds = new Set(
            conflictingReservations?.map((r) => r.room_id).filter(Boolean) || []
          );

          // Quartos disponíveis (não ocupados)
          const availableRooms = rooms.filter((room) => !occupiedRoomIds.has(room.id));
          availabilityByCategory[category.id] = availableRooms.length;
        }

        setCategoryAvailableRooms(availabilityByCategory);
      } catch (error: any) {
        console.error("Erro ao verificar disponibilidade por categoria:", error);
        setCategoryAvailableRooms({});
      }
    };

    const timeoutId = setTimeout(checkCategoryAvailability, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.checkinDate, formData.checkoutDate, establishment?.id, categories]);

  // Distribuir adultos entre categorias quando categoria selecionada ou adultos mudarem
  useEffect(() => {
    const calculateCategoryDistribution = async () => {
      if (!formData.checkinDate || !formData.checkoutDate || !establishment?.id || categories.length === 0) {
        setSelectedCategories([]);
        return;
      }

      const adults = parseInt(formData.adults) || 1;
      const children = parseInt(formData.children) || 0;

      // Se há planos selecionados mas não há selectedCategory, usar a primeira categoria com plano selecionado
      const categoriesWithPlans = Object.keys(selectedPlanByCategory).filter(
        catId => selectedPlanByCategory[catId] !== null
      );
      
      // Se há categorias com planos selecionados, usar a primeira como selectedCategory
      if (categoriesWithPlans.length > 0 && !selectedCategory) {
        setSelectedCategory(categoriesWithPlans[0]);
        return; // Retornar aqui para que o useEffect seja executado novamente com selectedCategory definido
      }

      // Se não há selectedCategory e não há planos selecionados, limpar categorias
      if (!selectedCategory && categoriesWithPlans.length === 0) {
        setSelectedCategories([]);
        return;
      }

      if (!selectedCategory) {
        return;
      }

      // Se há quantidade manual de quartos definida, verificar se é suficiente
      if (manualRooms !== null) {
        const selectedCategoryData = categories.find((c) => c.id === selectedCategory);
        if (selectedCategoryData) {
          const categoryCapacity = selectedCategoryData.capacity_adults || 1;
          const maxAdultsInManualRooms = manualRooms * categoryCapacity;
          
          // Se a quantidade manual de quartos é suficiente para todos os adultos, usar apenas essa categoria
          if (maxAdultsInManualRooms >= adults) {
            // Calcular preço para a categoria com a quantidade manual de quartos
            let categoryTotal = 0;
            const basePrice = Number(selectedCategoryData.base_price || 0);

            if (formData.checkinDate && formData.checkoutDate) {
              // Criar datas no timezone local para evitar problemas de conversão
              const [checkinYear, checkinMonth, checkinDay] = formData.checkinDate.split('-').map(Number);
              const [checkoutYear, checkoutMonth, checkoutDay] = formData.checkoutDate.split('-').map(Number);
              const checkin = new Date(checkinYear, checkinMonth - 1, checkinDay);
              const checkout = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
              const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

              if (nights > 0) {
                for (let i = 0; i < nights; i++) {
                  const currentDate = addDays(checkin, i);
                  const dateStr = formatDateLocal(currentDate);

                  try {
                    // Usar plano selecionado se houver, senão usar plano padrão
                    const selectedPlan = selectedPlanByCategory[selectedCategory];
                    const planIdToUse = selectedPlan === "plan1" 
                      ? publicPricingPlan1Id 
                      : selectedPlan === "plan2" 
                        ? publicPricingPlan2Id 
                        : publicPricingPlanId || null;
                    
                    const { data, error } = await supabase.rpc("calculate_rate_price", {
                      p_establishment_id: establishment.id,
                      p_category_id: selectedCategory,
                      p_pricing_plan_id: planIdToUse,
                      p_date: dateStr,
                      p_adults: adults,
                      p_children: children,
                    });

                    if (error) {
                      categoryTotal += basePrice;
                    } else {
                      const price = Number(data || 0);
                      categoryTotal += price > 0 ? price : basePrice;
                    }
                  } catch (error) {
                    categoryTotal += basePrice;
                  }
                }
              }
            } else {
              categoryTotal = basePrice;
            }

            setSelectedCategories([{
              categoryId: selectedCategory,
              rooms: manualRooms,
              adults: adults,
              price: categoryTotal * manualRooms,
            }]);
            return;
          } else {
            // Se não é suficiente, distribuir adultos considerando a quantidade manual como limite mínimo
            // Ajustar disponibilidade da categoria primária para usar manualRooms como mínimo
            const adjustedAvailableRooms: Record<string, number> = {
              ...categoryAvailableRooms,
            };
            
            // Garantir que a categoria primária tenha pelo menos manualRooms disponíveis
            if (adjustedAvailableRooms[selectedCategory] < manualRooms) {
              adjustedAvailableRooms[selectedCategory] = manualRooms;
            }
            
            // Distribuir adultos entre categorias, garantindo que a categoria primária use manualRooms
            const distribution = await distributeAdultsAcrossCategoriesWithManualRooms(
              adults,
              selectedCategory,
              adjustedAvailableRooms,
              manualRooms
            );

            // Calcular preço para cada categoria na distribuição
            const categoriesWithPrices = await Promise.all(
              distribution.map(async (item) => {
                const category = categories.find((c) => c.id === item.categoryId);
                if (!category) return null;

                let categoryTotal = 0;
                const basePrice = Number(category.base_price || 0);

                if (formData.checkinDate && formData.checkoutDate) {
                  // Criar datas no timezone local para evitar problemas de conversão
                  const [checkinYear, checkinMonth, checkinDay] = formData.checkinDate.split('-').map(Number);
                  const [checkoutYear, checkoutMonth, checkoutDay] = formData.checkoutDate.split('-').map(Number);
                  const checkin = new Date(checkinYear, checkinMonth - 1, checkinDay);
                  const checkout = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
                  const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

                  if (nights > 0) {
                    for (let i = 0; i < nights; i++) {
                      const currentDate = addDays(checkin, i);
                      const dateStr = formatDateLocal(currentDate);

                      try {
                        // Usar plano selecionado se houver, senão usar plano padrão
                        const selectedPlan = selectedPlanByCategory[item.categoryId];
                        const planIdToUse = selectedPlan === "plan1" 
                          ? publicPricingPlan1Id 
                          : selectedPlan === "plan2" 
                            ? publicPricingPlan2Id 
                            : publicPricingPlanId || null;
                        
                        const { data, error } = await supabase.rpc("calculate_rate_price", {
                          p_establishment_id: establishment.id,
                          p_category_id: item.categoryId,
                          p_pricing_plan_id: planIdToUse,
                          p_date: dateStr,
                          p_adults: item.adults,
                          p_children: children,
                        });

                        if (error) {
                          categoryTotal += basePrice;
                        } else {
                          const price = Number(data || 0);
                          categoryTotal += price > 0 ? price : basePrice;
                        }
                      } catch (error) {
                        categoryTotal += basePrice;
                      }
                    }
                  }
                } else {
                  categoryTotal = basePrice;
                }

                return {
                  categoryId: item.categoryId,
                  rooms: item.rooms,
                  adults: item.adults,
                  price: categoryTotal * item.rooms,
                };
              })
            );

            const validCategories = categoriesWithPrices.filter((c) => c !== null) as Array<{
              categoryId: string;
              rooms: number;
              adults: number;
              price: number;
            }>;

            setSelectedCategories(validCategories);
            return;
          }
        }
      }

      // Verificar se há categorias com planos selecionados que não estão na distribuição atual
      // (categoriesWithPlans já foi declarado acima)

      // Distribuir adultos entre categorias disponíveis (quando não há quantidade manual)
      let distribution = await distributeAdultsAcrossCategories(
        adults,
        selectedCategory,
        categoryAvailableRooms
      );

      // Se há categorias com planos selecionados que não estão na distribuição, adicioná-las
      // MAS apenas se não foram removidas manualmente pelo usuário
      const distributionCategoryIds = new Set(distribution.map(item => item.categoryId));
      for (const categoryIdWithPlan of categoriesWithPlans) {
        // Não readicionar categorias que foram removidas manualmente
        if (manuallyRemovedCategories.has(categoryIdWithPlan)) {
          continue;
        }
        
        if (!distributionCategoryIds.has(categoryIdWithPlan)) {
          const category = categories.find((c) => c.id === categoryIdWithPlan);
          if (category && categoryAvailableRooms[categoryIdWithPlan] > 0) {
            const capacity = category.capacity_adults || 1;
            const availableRooms = categoryAvailableRooms[categoryIdWithPlan] || 0;
            const requiredRooms = calculateRequiredRooms(adults, category);
            const roomsToUse = Math.min(requiredRooms, availableRooms);
            const adultsForCategory = Math.min(adults, roomsToUse * capacity);
            
            if (roomsToUse > 0 && adultsForCategory > 0) {
              distribution.push({
                categoryId: categoryIdWithPlan,
                rooms: roomsToUse,
                adults: adultsForCategory,
              });
            }
          }
        }
      }

      // Calcular preço para cada categoria na distribuição
      const categoriesWithPrices = await Promise.all(
        distribution.map(async (item) => {
          const category = categories.find((c) => c.id === item.categoryId);
          if (!category) return null;

          let categoryTotal = 0;
          const basePrice = Number(category.base_price || 0);

          if (formData.checkinDate && formData.checkoutDate) {
            // Criar datas no timezone local para evitar problemas de conversão
            const [checkinYear, checkinMonth, checkinDay] = formData.checkinDate.split('-').map(Number);
            const [checkoutYear, checkoutMonth, checkoutDay] = formData.checkoutDate.split('-').map(Number);
            const checkin = new Date(checkinYear, checkinMonth - 1, checkinDay);
            const checkout = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
            const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

            if (nights > 0) {
              for (let i = 0; i < nights; i++) {
                const currentDate = addDays(checkin, i);
                const dateStr = formatDateLocal(currentDate);

                try {
                  // Usar plano selecionado se houver, senão usar plano padrão
                  const selectedPlan = selectedPlanByCategory[item.categoryId];
                  const planIdToUse = selectedPlan === "plan1" 
                    ? publicPricingPlan1Id 
                    : selectedPlan === "plan2" 
                      ? publicPricingPlan2Id 
                      : publicPricingPlanId || null;
                  
                  // Calcular adultos por quarto (calculate_rate_price retorna preço por quarto)
                  const categoryCapacity = category?.capacity_adults || 1;
                  const adultsPerRoom = categoryCapacity > 0 
                    ? Math.min(categoryCapacity, Math.ceil(item.adults / item.rooms))
                    : (item.rooms > 0 ? Math.ceil(item.adults / item.rooms) : item.adults);
                  const childrenPerRoom = item.rooms > 0 ? Math.ceil(children / item.rooms) : children;
                  
                  const { data, error } = await supabase.rpc("calculate_rate_price", {
                    p_establishment_id: establishment.id,
                    p_category_id: item.categoryId,
                    p_pricing_plan_id: planIdToUse,
                    p_date: dateStr,
                    p_adults: adultsPerRoom,
                    p_children: childrenPerRoom,
                  });

                  if (error) {
                    categoryTotal += basePrice;
                  } else {
                    const price = Number(data || 0);
                    categoryTotal += price > 0 ? price : basePrice;
                  }
                } catch (error) {
                  categoryTotal += basePrice;
                }
              }
            }
          } else {
            // Se não há datas, usar preço base
            categoryTotal = basePrice;
          }

          return {
            categoryId: item.categoryId,
            rooms: item.rooms,
            adults: item.adults,
            price: categoryTotal * item.rooms,
          };
        })
      );

      const validCategories = categoriesWithPrices
        .filter((c) => c !== null)
        .filter((c) => !manuallyRemovedCategories.has(c!.categoryId)) as Array<{
          categoryId: string;
          rooms: number;
          adults: number;
          price: number;
        }>;

      setSelectedCategories(validCategories);
    };

    const timeoutId = setTimeout(calculateCategoryDistribution, 500);
    return () => clearTimeout(timeoutId);
  }, [
    selectedCategory,
    formData.adults,
    formData.children,
    formData.checkinDate,
    formData.checkoutDate,
    categoryAvailableRooms,
    categories,
    establishment?.id,
    publicPricingPlanId,
    publicPricingPlan1Id,
    publicPricingPlan2Id,
    selectedPlanByCategory,
    manualRooms, // Adicionar manualRooms às dependências
    manuallyRemovedCategories, // Respeitar categorias removidas manualmente
  ]);

  // Recalcular preços dos planos para cada categoria no resumo usando dados específicos de cada categoria
  useEffect(() => {
    const recalculateSummaryPlanPrices = async () => {
      if (selectedCategories.length === 0 || !formData.checkinDate || !formData.checkoutDate || !establishment?.id) {
        setSummaryPlanPrices({});
        return;
      }

      const children = parseInt(formData.children) || 0;
      // Criar datas no timezone local para evitar problemas de conversão
      const [checkinYear, checkinMonth, checkinDay] = formData.checkinDate.split('-').map(Number);
      const [checkoutYear, checkoutMonth, checkoutDay] = formData.checkoutDate.split('-').map(Number);
      const checkin = new Date(checkinYear, checkinMonth - 1, checkinDay);
      const checkout = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
      const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

      if (nights <= 0) {
        setSummaryPlanPrices({});
        return;
      }

      const prices: Record<string, { plan1?: number; plan2?: number }> = {};

      for (const cat of selectedCategories) {
        const category = categories.find((c) => c.id === cat.categoryId);
        if (!category) continue;

        const basePrice = Number(category.base_price || 0);

        // Calcular preço do plano 1 para esta categoria específica
        // IMPORTANTE: calculate_rate_price retorna o preço POR QUARTO baseado no número de adultos
        // Para calcular corretamente, precisamos usar a capacidade máxima do quarto ou adultos por quarto
        if (publicPricingPlan1Id) {
          // Usar capacidade máxima do quarto se disponível, senão calcular adultos por quarto
          const categoryCapacity = category?.capacity_adults || 0;
          const adultsPerRoom = categoryCapacity > 0 
            ? Math.min(categoryCapacity, Math.ceil(cat.adults / cat.rooms))
            : (cat.rooms > 0 ? Math.ceil(cat.adults / cat.rooms) : cat.adults);
          const childrenPerRoom = cat.rooms > 0 ? Math.ceil(children / cat.rooms) : children;
          
          let plan1TotalForAllRooms = 0;
          for (let i = 0; i < nights; i++) {
            const currentDate = addDays(checkin, i);
            const dateStr = formatDateLocal(currentDate);

            try {
              // Calcular preço por quarto usando adultos por quarto
              const { data, error } = await supabase.rpc("calculate_rate_price", {
                p_establishment_id: establishment.id,
                p_category_id: cat.categoryId,
                p_pricing_plan_id: publicPricingPlan1Id,
                p_date: dateStr,
                p_adults: adultsPerRoom,
                p_children: childrenPerRoom,
              });

              if (error) {
                plan1TotalForAllRooms += basePrice * cat.rooms;
              } else {
                const pricePerRoom = Number(data || 0);
                plan1TotalForAllRooms += (pricePerRoom > 0 ? pricePerRoom : basePrice) * cat.rooms;
              }
            } catch (error) {
              plan1TotalForAllRooms += basePrice * cat.rooms;
            }
          }
          // Preço por quarto por noite = total para todos os quartos / número de quartos / número de noites
          prices[cat.categoryId] = {
            ...prices[cat.categoryId],
            plan1: cat.rooms > 0 && nights > 0 
              ? plan1TotalForAllRooms / cat.rooms / nights 
              : cat.rooms > 0 
                ? plan1TotalForAllRooms / cat.rooms 
                : 0,
          };
        }

        // Calcular preço do plano 2 para esta categoria específica
        if (publicPricingPlan2Id) {
          // Usar capacidade máxima do quarto se disponível, senão calcular adultos por quarto
          const categoryCapacity = category?.capacity_adults || 0;
          const adultsPerRoom = categoryCapacity > 0 
            ? Math.min(categoryCapacity, Math.ceil(cat.adults / cat.rooms))
            : (cat.rooms > 0 ? Math.ceil(cat.adults / cat.rooms) : cat.adults);
          const childrenPerRoom = cat.rooms > 0 ? Math.ceil(children / cat.rooms) : children;
          
          let plan2TotalForAllRooms = 0;
          for (let i = 0; i < nights; i++) {
            const currentDate = addDays(checkin, i);
            const dateStr = formatDateLocal(currentDate);

            try {
              // Calcular preço por quarto usando adultos por quarto
              const { data, error } = await supabase.rpc("calculate_rate_price", {
                p_establishment_id: establishment.id,
                p_category_id: cat.categoryId,
                p_pricing_plan_id: publicPricingPlan2Id,
                p_date: dateStr,
                p_adults: adultsPerRoom,
                p_children: childrenPerRoom,
              });

              if (error) {
                plan2TotalForAllRooms += basePrice * cat.rooms;
              } else {
                const pricePerRoom = Number(data || 0);
                plan2TotalForAllRooms += (pricePerRoom > 0 ? pricePerRoom : basePrice) * cat.rooms;
              }
            } catch (error) {
              plan2TotalForAllRooms += basePrice * cat.rooms;
            }
          }
          // Preço por quarto por noite = total para todos os quartos / número de quartos / número de noites
          prices[cat.categoryId] = {
            ...prices[cat.categoryId],
            plan2: cat.rooms > 0 && nights > 0 
              ? plan2TotalForAllRooms / cat.rooms / nights 
              : cat.rooms > 0 
                ? plan2TotalForAllRooms / cat.rooms 
                : 0,
          };
        }
      }

      setSummaryPlanPrices(prices);
    };

    const timeoutId = setTimeout(recalculateSummaryPlanPrices, 500);
    return () => clearTimeout(timeoutId);
  }, [selectedCategories, formData.checkinDate, formData.checkoutDate, formData.children, establishment?.id, categories, publicPricingPlan1Id, publicPricingPlan2Id]);

  // Recalcular preços quando plano selecionado mudar
  useEffect(() => {
    if (selectedCategory && (publicPricingPlan1Id || publicPricingPlan2Id)) {
      // Forçar recálculo da distribuição de categorias quando plano mudar
      const calculateCategoryDistribution = async () => {
        if (!selectedCategory || !formData.checkinDate || !formData.checkoutDate || !establishment?.id || categories.length === 0) {
          return;
        }

        const adults = parseInt(formData.adults) || 1;
        const children = parseInt(formData.children) || 0;

        // Recalcular apenas se houver categorias selecionadas
        if (selectedCategories.length > 0) {
          const updatedCategories = await Promise.all(
            selectedCategories.map(async (cat) => {
              const category = categories.find((c) => c.id === cat.categoryId);
              if (!category) return cat;

              const selectedPlan = selectedPlanByCategory[cat.categoryId];
              const planIdToUse = selectedPlan === "plan1" 
                ? publicPricingPlan1Id 
                : selectedPlan === "plan2" 
                  ? publicPricingPlan2Id 
                  : publicPricingPlanId || null;

              let categoryTotal = 0;
              const basePrice = Number(category.base_price || 0);

              if (formData.checkinDate && formData.checkoutDate) {
                // Criar datas no timezone local para evitar problemas de conversão
                const [checkinYear, checkinMonth, checkinDay] = formData.checkinDate.split('-').map(Number);
                const [checkoutYear, checkoutMonth, checkoutDay] = formData.checkoutDate.split('-').map(Number);
                const checkin = new Date(checkinYear, checkinMonth - 1, checkinDay);
                const checkout = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
                const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

                if (nights > 0) {
                  for (let i = 0; i < nights; i++) {
                    const currentDate = addDays(checkin, i);
                    const dateStr = formatDateLocal(currentDate);

                    try {
                      const { data, error } = await supabase.rpc("calculate_rate_price", {
                        p_establishment_id: establishment.id,
                        p_category_id: cat.categoryId,
                        p_pricing_plan_id: planIdToUse,
                        p_date: dateStr,
                        p_adults: cat.adults,
                        p_children: children,
                      });

                      if (error) {
                        categoryTotal += basePrice;
                      } else {
                        const price = Number(data || 0);
                        categoryTotal += price > 0 ? price : basePrice;
                      }
                    } catch (error) {
                      categoryTotal += basePrice;
                    }
                  }
                }
              } else {
                categoryTotal = basePrice;
              }

              return {
                ...cat,
                price: categoryTotal * cat.rooms,
              };
            })
          );

          setSelectedCategories(updatedCategories);
        }
      };

      const timeoutId = setTimeout(calculateCategoryDistribution, 300);
      return () => clearTimeout(timeoutId);
    }
  }, [selectedPlanByCategory, publicPricingPlan1Id, publicPricingPlan2Id]);

  // Recarregar dados quando o plano tarifário mudar (polling ou refetch)
  useEffect(() => {
    if (!establishment?.id) return;

    const checkPricingPlanUpdate = async () => {
      const { data: hotel } = await supabase
        .from("hotel_settings")
        .select("public_pricing_plan_id")
        .eq("establishment_id", establishment.id)
        .maybeSingle();

      if (hotel && hotel.public_pricing_plan_id !== publicPricingPlanId) {
        setPublicPricingPlanId(hotel.public_pricing_plan_id || null);
        // Forçar recálculo de preços
        if (formData.checkinDate && formData.checkoutDate && formData.checkinDate < formData.checkoutDate) {
          setCategoryPrices({});
          setCalculatedPrice(null);
        }
      }
    };

    // Verificar a cada 5 segundos se o plano tarifário mudou
    const intervalId = setInterval(checkPricingPlanUpdate, 5000);

    return () => clearInterval(intervalId);
  }, [establishment?.id, publicPricingPlanId, formData.checkinDate, formData.checkoutDate]);

  const loadData = async () => {
    try {
      setIsLoading(true);

      // Buscar estabelecimento pelo slug ou numeric_id
      let establishmentQuery = supabase
        .from("establishments")
        .select("*");

      // Tentar buscar por numeric_id primeiro (se for número)
      if (establishmentSlug && !isNaN(Number(establishmentSlug))) {
        establishmentQuery = establishmentQuery.eq("numeric_id", parseInt(establishmentSlug));
      } else {
        // Buscar por slug ou nome
        establishmentQuery = establishmentQuery.or(`name.ilike.%${establishmentSlug}%,slug.eq.${establishmentSlug}`);
      }

      const { data: establishments, error: estError } = await establishmentQuery.limit(1);

      if (estError || !establishments || establishments.length === 0) {
        toast.error(t("publicReservation.errors.establishmentNotFound"));
        setIsLoading(false);
        return;
      }

      const foundEstablishment = establishments[0];
      setEstablishment(foundEstablishment);

      // Buscar configurações do hotel
      const { data: hotel } = await supabase
        .from("hotel_settings")
        .select("*")
        .eq("establishment_id", foundEstablishment.id)
        .maybeSingle();

      if (hotel) {
        setHotelSettings(hotel);
        setPublicPricingPlanId(hotel.public_pricing_plan_id || null);
        const plan1Id = hotel.public_pricing_plan_1_id || null;
        const plan2Id = hotel.public_pricing_plan_2_id || null;
        setPublicPricingPlan1Id(plan1Id);
        setPublicPricingPlan1Title(hotel.public_pricing_plan_1_title || null);
        setPublicPricingPlan2Id(plan2Id);
        setPublicPricingPlan2Title(hotel.public_pricing_plan_2_title || null);
        // Armazenar políticas do estabelecimento
        if (hotel.policies) {
          setEstablishmentPolicies(hotel.policies);
        }
      }

      // Buscar serviços do estabelecimento
      const { data: services } = await supabase
        .from("establishment_services")
        .select("*")
        .eq("establishment_id", foundEstablishment.id)
        .eq("is_active", true)
        .order("name");

      if (services) {
        setEstablishmentServices(services);
      }

      // Buscar categorias disponíveis
      const { data: categoriesData, error: categoriesError } = await supabase
        .from("room_categories")
        .select("*")
        .eq("establishment_id", foundEstablishment.id)
        .eq("show_in_public", true)
        .order("display_order")
        .order("name");

      if (!categoriesError && categoriesData) {
        setCategories(categoriesData);
        if (categoriesData.length > 0 && !selectedCategory) {
          setSelectedCategory(categoriesData[0].id);
        }
      }

      // Buscar quartos disponíveis
      const { data: roomsData, error: roomsError } = await supabase
        .from("rooms")
        .select(`
          *,
          category:room_categories(*)
        `)
        .eq("establishment_id", foundEstablishment.id)
        .eq("show_in_public", true)
        .order("room_number");

      if (!roomsError && roomsData) {
        setRooms(roomsData);
        
        // Calcular total de quartos por categoria (tática de vendas)
        const totalRoomsByCategory: Record<string, number> = {};
        roomsData.forEach((room) => {
          if (room.category_id) {
            totalRoomsByCategory[room.category_id] = (totalRoomsByCategory[room.category_id] || 0) + 1;
          }
        });
        setCategoryTotalRooms(totalRoomsByCategory);
      }

      // Buscar logo do PMS
      if (siteSettings?.logo_url) {
        setPmsLogoUrl(siteSettings.logo_url);
      }
    } catch (error: any) {
      console.error("Erro ao carregar dados:", error);
      toast.error(t("publicReservation.errors.loadError"));
    } finally {
      setIsLoading(false);
    }
  };

  // Buscar políticas do prédio quando uma categoria for selecionada
  useEffect(() => {
    const fetchBuildingPolicies = async () => {
      if (!selectedCategory || !categories.length) {
        setBuildingPolicies(null);
        setBuildingName(null);
        return;
      }

      setLoadingPolicies(true);
      try {
        // Buscar categoria para obter building_id
        const category = categories.find(cat => cat.id === selectedCategory);
        if (!category?.building_id) {
          setBuildingPolicies(null);
          setBuildingName(null);
          setLoadingPolicies(false);
          return;
        }

        // Buscar políticas e nome do prédio
        const { data: building, error: buildingError } = await supabase
          .from("buildings")
          .select("policies, name")
          .eq("id", category.building_id)
          .maybeSingle();

        if (buildingError) {
          console.error("Erro ao buscar políticas do prédio:", buildingError);
          setBuildingPolicies(null);
          setBuildingName(null);
        } else if (building) {
          setBuildingPolicies(building.policies);
          setBuildingName(building.name);
        } else {
          setBuildingPolicies(null);
          setBuildingName(null);
        }
      } catch (error) {
        console.error("Erro ao buscar políticas do prédio:", error);
        setBuildingPolicies(null);
        setBuildingName(null);
      } finally {
        setLoadingPolicies(false);
      }
    };

    fetchBuildingPolicies();
  }, [selectedCategory, categories]);

  // Função para validar e aplicar cupom
  const handleApplyCoupon = async () => {
    if (!formData.promotionalCode.trim() || !establishment?.id) {
      return;
    }

    if (!formData.checkinDate || !formData.checkoutDate) {
      toast.error("Selecione as datas de check-in e check-out primeiro");
      return;
    }

    const checkin = new Date(formData.checkinDate + 'T12:00:00');
    const checkout = new Date(formData.checkoutDate + 'T12:00:00');
    const nights = Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));

    // Calcular valor total atual (sem desconto ainda)
    const currentTotal = selectedCategories.length > 0
      ? selectedCategories.reduce((sum, cat) => sum + cat.price, 0)
      : (calculatedPrice || 0);

    if (currentTotal <= 0) {
      toast.error("Calcule o preço primeiro antes de aplicar o cupom");
      return;
    }

    setValidatingCoupon(true);
    try {
      const { data, error } = await supabase.rpc('validate_and_apply_discount', {
        p_code: formData.promotionalCode.trim().toUpperCase(),
        p_establishment_id: establishment.id,
        p_total_amount: currentTotal,
        p_nights: nights,
      });

      if (error) throw error;

      if (data.valid) {
        setAppliedCoupon(data);
        toast.success(`Cupom "${data.coupon_name}" aplicado com sucesso!`);
      } else {
        setAppliedCoupon(null);
        toast.error(data.error || "Cupom inválido");
      }
    } catch (error: any) {
      console.error("Erro ao validar cupom:", error);
      setAppliedCoupon(null);
      toast.error(error.message || "Erro ao validar cupom");
    } finally {
      setValidatingCoupon(false);
    }
  };

  // Remover cupom aplicado
  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setFormData({ ...formData, promotionalCode: "" });
  };

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setSelectedRoom(null); // Resetar quarto selecionado ao mudar categoria
  };

  // Função para adicionar categoria automaticamente quando um plano é selecionado
  const handlePlanSelection = async (categoryId: string, planType: "plan1" | "plan2" | null) => {
    // Atualizar plano selecionado primeiro
    const newPlanState = planType;
    setSelectedPlanByCategory(prev => ({
      ...prev,
      [categoryId]: prev[categoryId] === planType ? null : planType
    }));

    // Se um plano foi desmarcado, remover a categoria da lista
    if (!newPlanState) {
      // Adicionar à lista de categorias removidas manualmente
      setManuallyRemovedCategories(prev => new Set(prev).add(categoryId));
      
      setSelectedCategories(prev => {
        const updated = prev.filter(cat => cat.categoryId !== categoryId);
        // Se não há mais categorias selecionadas, limpar selectedCategory
        if (updated.length === 0) {
          setSelectedCategory(null);
        }
        return updated;
      });
      return;
    }

    // Se um plano foi selecionado, remover da lista de categorias removidas manualmente
    // (permitindo que seja readicionada automaticamente)
    setManuallyRemovedCategories(prev => {
      const updated = new Set(prev);
      updated.delete(categoryId);
      return updated;
    });

    // Se um plano foi selecionado, garantir que a categoria esteja selecionada
    // O useEffect que depende de selectedPlanByCategory vai recalcular automaticamente
    if (!formData.checkinDate || !formData.checkoutDate || !establishment?.id) {
      return;
    }

    // Se a categoria não está selecionada como principal, definir ela
    // Isso vai acionar o useEffect que recalcula tudo baseado nos planos selecionados
    if (selectedCategory !== categoryId) {
      setSelectedCategory(categoryId);
    }
    // Se já está selecionada, o useEffect já vai recalcular porque selectedPlanByCategory mudou
  };

  // Função para remover categoria do resumo
  const handleRemoveCategory = (categoryId: string) => {
    // Adicionar à lista de categorias removidas manualmente
    setManuallyRemovedCategories(prev => new Set(prev).add(categoryId));

    // Remover categoria da lista
    setSelectedCategories(prev => {
      const updated = prev.filter(cat => cat.categoryId !== categoryId);
      // Se não há mais categorias selecionadas, limpar selectedCategory
      if (updated.length === 0) {
        setSelectedCategory(null);
      }
      return updated;
    });

    // Desmarcar plano tarifário desta categoria
    setSelectedPlanByCategory(prev => ({
      ...prev,
      [categoryId]: null
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCategory) {
      toast.error(t("publicReservation.errors.selectCategory"));
      return;
    }

    if (!formData.checkinDate || !formData.checkoutDate) {
      toast.error(t("publicReservation.errors.selectDates"));
      return;
    }

    // Criar datas no timezone local para evitar problemas de conversão
    const [checkinYear, checkinMonth, checkinDay] = formData.checkinDate.split('-').map(Number);
    const [checkoutYear, checkoutMonth, checkoutDay] = formData.checkoutDate.split('-').map(Number);
    const checkin = new Date(checkinYear, checkinMonth - 1, checkinDay);
    const checkout = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
    
    if (checkin >= checkout) {
      toast.error(t("publicReservation.errors.invalidDates"));
      return;
    }

    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast.error(t("publicReservation.errors.fillRequiredFields"));
      return;
    }

    // Verificar se há categorias selecionadas (distribuição automática)
    if (selectedCategories.length === 0) {
      toast.error(t("publicReservation.errors.selectCategory"));
      return;
    }

    // Verificar se há planos configurados e se foram selecionados
    if ((publicPricingPlan1Id || publicPricingPlan2Id) && selectedCategories.length > 0) {
      for (const cat of selectedCategories) {
        const selectedPlan = selectedPlanByCategory[cat.categoryId];
        if (!selectedPlan && (publicPricingPlan1Id || publicPricingPlan2Id)) {
          const categoryName = categories.find((c) => c.id === cat.categoryId)?.name || "categoria";
          toast.error(`Por favor, selecione um plano tarifário para a ${categoryName}`);
          setIsSubmitting(false);
          return;
        }
      }
    }

    // Verificar disponibilidade para todas as categorias selecionadas
    for (const cat of selectedCategories) {
      const availability = await checkCategoryRoomAvailability(
        cat.categoryId,
        formData.checkinDate,
        formData.checkoutDate,
        cat.rooms
      );

      if (!availability.available) {
        toast.error(
          availability.reason || 
          t("publicReservation.errors.insufficientRooms", { 
            required: cat.rooms, 
            available: availability.availableRooms 
          })
        );
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // Buscar ou criar cliente
      let clientId = null;
      if (formData.email) {
        const { data: existingClient } = await supabase
          .from("clients")
          .select("id")
          .eq("email", formData.email)
          .maybeSingle();

        if (existingClient) {
          clientId = existingClient.id;
        } else {
          const { data: newClient, error: clientError } = await supabase
            .from("clients")
            .insert({
              full_name: `${formData.firstName} ${formData.lastName}`,
              email: formData.email,
              phone: formData.phone || null,
              establishment_id: establishment.id,
            })
            .select()
            .single();

          if (clientError) {
            throw clientError;
          }
          clientId = newClient.id;
        }
      }

      // Gerar token único para seleção de quartos
      const selectionToken = `quote_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;

      // Calcular preço total das categorias selecionadas (antes do desconto)
      const baseTotalAmount = selectedCategories.length > 0
        ? selectedCategories.reduce((sum, cat) => sum + cat.price, 0)
        : (calculatedPrice || 0);

      // Aplicar desconto se houver cupom válido
      const totalAmount = appliedCoupon && appliedCoupon.valid
        ? appliedCoupon.final_amount
        : baseTotalAmount;

      // Usar a primeira categoria como categoria principal (para compatibilidade)
      const primaryCategory = selectedCategories[0]?.categoryId || selectedCategory;

      // Criar reservas para cada categoria e quarto
      const createdReservations: string[] = [];
      
      for (const cat of selectedCategories) {
        // Buscar quartos disponíveis para esta categoria
        const availableRoomIds = await getAvailableRoomsForCategory(
          cat.categoryId,
          formData.checkinDate,
          formData.checkoutDate,
          cat.rooms
        );

        if (availableRoomIds.length < cat.rooms) {
          throw new Error(
            `Não há quartos suficientes disponíveis na categoria ${categories.find((c) => c.id === cat.categoryId)?.name || cat.categoryId}. Necessário: ${cat.rooms}, Disponível: ${availableRoomIds.length}`
          );
        }

        // Calcular preço por quarto (preço total da categoria dividido pelo número de quartos)
        // Se houver desconto aplicado, distribuir proporcionalmente
        let pricePerRoom = cat.price / cat.rooms;
        if (appliedCoupon && appliedCoupon.valid && baseTotalAmount > 0) {
          // Calcular proporção desta categoria no total
          const categoryProportion = cat.price / baseTotalAmount;
          // Aplicar desconto proporcionalmente
          const categoryDiscount = appliedCoupon.discount_amount * categoryProportion;
          const categoryFinalPrice = cat.price - categoryDiscount;
          pricePerRoom = categoryFinalPrice / cat.rooms;
        }
        // Calcular adultos por quarto (distribuir igualmente, último quarto recebe o resto)
        const adultsPerRoom = Math.floor(cat.adults / cat.rooms);
        const remainingAdults = cat.adults % cat.rooms;
        const childrenPerRoom = Math.floor((parseInt(formData.children) || 0) / cat.rooms);
        const remainingChildren = (parseInt(formData.children) || 0) % cat.rooms;

        // Criar uma reserva para cada quarto
        for (let i = 0; i < cat.rooms; i++) {
          const roomId = availableRoomIds[i];
          const category = categories.find((c) => c.id === cat.categoryId);
          
          // Último quarto recebe o resto dos adultos e crianças
          const finalAdults = i === cat.rooms - 1 ? adultsPerRoom + remainingAdults : adultsPerRoom;
          const finalChildren = i === cat.rooms - 1 ? childrenPerRoom + remainingChildren : childrenPerRoom;
          
          // Preparar dados da reserva
          const reservationData = {
            establishment_id: establishment.id,
            room_id: roomId,
            category_id: cat.categoryId,
            client_id: clientId,
            guest_name: `${formData.firstName} ${formData.lastName}`,
            adults: finalAdults,
            children: finalChildren,
            total_amount: pricePerRoom,
            paid_amount: 0,
            payment_status: "pending" as const,
            status: "pending" as const,
            notes: cat.rooms > 1 ? `${formData.notes || ""} (Quarto ${i + 1} de ${cat.rooms} - ${category?.name || cat.categoryId})`.trim() : (formData.notes || null),
            checkin_time: hotelSettings?.checkin_time || null,
            checkout_time: hotelSettings?.checkout_time || null,
            pricing_plan_id: (() => {
              const selectedPlan = selectedPlanByCategory[cat.categoryId];
              if (selectedPlan === "plan1") return publicPricingPlan1Id;
              if (selectedPlan === "plan2") return publicPricingPlan2Id;
              return publicPricingPlanId || null;
            })(),
            created_by: null,
            expiration_date: null,
            channel: "direct" as const,
            coupon_id: appliedCoupon && appliedCoupon.valid ? appliedCoupon.coupon_id : null,
          };

          // Criar reserva usando a função RPC
          const { data: reservationResult, error: reservationError } = await supabase.rpc(
            "create_reservation_with_lock",
            {
              p_reservation_data: reservationData,
              p_checkin_date: formData.checkinDate,
              p_checkout_date: formData.checkoutDate,
              p_establishment_id: establishment.id,
              p_room_id: roomId,
              p_category_id: cat.categoryId,
            }
          );

          if (reservationError || !reservationResult?.success) {
            throw new Error(
              reservationError?.message || 
              reservationResult?.error || 
              `Erro ao criar reserva para quarto ${i + 1} da categoria ${category?.name || cat.categoryId}`
            );
          }

          createdReservations.push(reservationResult.reservation_id);
        }
      }

      // Criar orçamento (quote) vinculado às reservas criadas
      // Armazenar IDs das reservas no campo notes em formato JSON (no final para facilitar parsing)
      const reservationIdsJson = JSON.stringify({ reservation_ids: createdReservations });
      // Usar um marcador único no final do campo notes
      const notesWithReservations = formData.notes 
        ? `${formData.notes}\n\n<!--RESERVATION_IDS_START-->${reservationIdsJson}<!--RESERVATION_IDS_END-->`
        : `<!--RESERVATION_IDS_START-->${reservationIdsJson}<!--RESERVATION_IDS_END-->`;

      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          establishment_id: establishment.id,
          client_id: clientId,
          guest_name: `${formData.firstName} ${formData.lastName}`,
          guest_email: formData.email,
          guest_phone: formData.phone || null,
          category_id: primaryCategory,
          room_id: selectedRoom || null,
          checkin_date: formData.checkinDate,
          checkout_date: formData.checkoutDate,
          adults: parseInt(formData.adults) || 1,
          children: parseInt(formData.children) || 0,
          total_amount: totalAmount,
          status: "pending",
          notes: notesWithReservations,
          room_selection_link: selectionToken,
          channel: "direct",
        })
        .select()
        .single();

      if (quoteError) {
        throw quoteError;
      }

      // Gerar link de pagamento
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke("stripe-payment", {
        body: {
          establishment_id: establishment.id,
          amount: totalAmount * 100, // Converter para centavos
          currency: "brl",
          payment_type: "quote_payment",
          quote_id: quote.id,
          guest_email: formData.email,
          guestName: `${formData.firstName} ${formData.lastName}`,
        },
      });

      if (paymentError || !paymentData?.payment_intent_id) {
        console.error("Erro ao gerar link de pagamento:", paymentError);
        toast.error(t("publicReservation.errors.quoteCreatedPaymentError"));
        return;
      }

      // Construir payment_link usando o payment_intent_id
      const siteUrl = siteSettings?.pms_base_url || window.location.origin;
      const baseUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
      const paymentLink = `${baseUrl}/quote-payment/${paymentData.payment_intent_id}`;

      // Atualizar quote com payment_link e payment_intent_id
      await supabase
        .from("quotes")
        .update({
          payment_link: paymentLink,
          payment_intent_id: paymentData.payment_intent_id,
        })
        .eq("id", quote.id);

      toast.success(t("publicReservation.errors.quoteCreatedSuccess"));
      
      // Redirecionar para página de pagamento
      setTimeout(() => {
        window.location.href = paymentLink;
      }, 1000);
    } catch (error: any) {
      console.error("Erro ao criar reserva:", error);
      toast.error(error.message || t("publicReservation.errors.createReservationError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCPF = (value: string) => {
    // Remove todos os caracteres não numéricos
    const cleaned = value.replace(/\D/g, "");
    
    // Limita a 11 dígitos
    const limited = cleaned.slice(0, 11);
    
    // Formata como 000.000.000-00
    if (limited.length <= 3) {
      return limited;
    } else if (limited.length <= 6) {
      return `${limited.slice(0, 3)}.${limited.slice(3)}`;
    } else if (limited.length <= 9) {
      return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6)}`;
    } else {
      return `${limited.slice(0, 3)}.${limited.slice(3, 6)}.${limited.slice(6, 9)}-${limited.slice(9, 11)}`;
    }
  };

  const formatPhone = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    const match = cleaned.match(/^(\d{0,2})(\d{0,5})(\d{0,4})$/);
    if (match) {
      return [match[1], match[2], match[3]].filter(Boolean).join(" ").replace(/\s$/, "");
    }
    return value;
  };

  // Formatar horário TIME para HH:mm
  const formatTime = (time: string | null | undefined): string => {
    if (!time) return "";
    // Se já estiver no formato HH:mm, retornar como está
    if (time.match(/^\d{2}:\d{2}$/)) {
      return time;
    }
    // Se estiver no formato HH:mm:ss, pegar apenas HH:mm
    if (time.match(/^\d{2}:\d{2}:\d{2}/)) {
      return time.substring(0, 5);
    }
    return time;
  };

  // Formatar texto de quartos necessários
  const formatRoomsRequiredText = (adults: number, capacity: number, rooms: number): string => {
    const adultText = adults === 1 
      ? t("publicReservation.adult") 
      : t("publicReservation.adultsPlural");
    const guestText = capacity === 1 
      ? t("publicReservation.guest") 
      : t("publicReservation.guests");
    const roomText = rooms === 1 
      ? t("publicReservation.room") 
      : t("publicReservation.rooms");
    
    // Construir texto manualmente para garantir substituição correta
    return `Para ${adults} ${adultText} e capacidade de ${capacity} ${guestText} por quarto, serão necessários ${rooms} ${roomText}.`;
  };

  // Formatar texto de cálculo automático
  const formatAutoCalculatedText = (adults: number, capacity: number): string => {
    const adultText = adults === 1 
      ? t("publicReservation.adult") 
      : t("publicReservation.adultsPlural");
    const guestText = capacity === 1 
      ? t("publicReservation.guest") 
      : t("publicReservation.guests");
    
    // Construir texto manualmente para garantir substituição correta
    return `Calculado automaticamente baseado em ${adults} ${adultText} e capacidade de ${capacity} ${guestText} por quarto`;
  };

  // Formatar texto de disponibilidade
  const formatAvailabilityText = (rooms: number, capacity: number): string => {
    const roomText = rooms === 1 
      ? t("publicReservation.room") 
      : t("publicReservation.rooms");
    const guestText = capacity === 1 
      ? t("publicReservation.guest") 
      : t("publicReservation.guests");
    
    // Construir texto manualmente para garantir substituição correta
    return `Serão necessários ${rooms} ${roomText} baseado na capacidade de ${capacity} ${guestText} por quarto`;
  };

  // Formatar texto de aviso de quartos insuficientes
  const formatInsufficientRoomsWarning = (available: number, required: number): string => {
    const availableRoomText = available === 1 
      ? t("publicReservation.roomAvailable") 
      : t("publicReservation.roomsAvailablePlural");
    const requiredText = required === 1 
      ? t("publicReservation.necessary") 
      : t("publicReservation.necessaryPlural");
    
    return `Atenção: Apenas ${available} ${availableRoomText} de ${required} ${requiredText}`;
  };

  // Formatar texto de quartos restantes (tática de vendas)
  const formatRoomsLeftText = (count: number): string => {
    if (count === 1) {
      return t("publicReservation.onlyRoomLeft");
    }
    const roomText = t("publicReservation.rooms");
    return `Apenas ${count} ${roomText} restantes!`;
  };

  // Formatar texto de quartos disponíveis para o período
  const formatAvailableRoomsText = (available: number): string => {
    const roomText = available === 1 
      ? t("publicReservation.roomAvailable") 
      : t("publicReservation.roomsAvailablePlural");
    
    return `${available} ${roomText} para este período`;
  };

  // Calcular número de quartos necessários baseado na capacidade
  const calculateRequiredRooms = (adults: number, category: any): number => {
    if (!category || !category.capacity_adults || category.capacity_adults <= 0) {
      return 1; // Se não há capacidade definida, assumir 1 quarto
    }
    return Math.ceil(adults / category.capacity_adults);
  };

  // Distribuir adultos considerando quantidade manual de quartos na categoria primária
  const distributeAdultsAcrossCategoriesWithManualRooms = async (
    totalAdults: number,
    primaryCategoryId: string,
    availableRoomsByCategory: Record<string, number>,
    manualRooms: number
  ): Promise<Array<{ categoryId: string; rooms: number; adults: number }>> => {
    const result: Array<{ categoryId: string; rooms: number; adults: number }> = [];
    let remainingAdults = totalAdults;

    // Buscar categoria primária
    const primaryCategory = categories.find((c) => c.id === primaryCategoryId);
    if (!primaryCategory) return result;

    const primaryCapacity = primaryCategory.capacity_adults || 1;
    const primaryAvailableRooms = availableRoomsByCategory[primaryCategoryId] || 0;
    
    // Usar manualRooms como quantidade mínima para a categoria primária
    const roomsForPrimary = Math.min(manualRooms, primaryAvailableRooms);
    const adultsForPrimary = Math.min(remainingAdults, roomsForPrimary * primaryCapacity);
    
    if (roomsForPrimary > 0 && adultsForPrimary > 0) {
      result.push({
        categoryId: primaryCategoryId,
        rooms: roomsForPrimary,
        adults: adultsForPrimary,
      });
      remainingAdults -= adultsForPrimary;
    }

    // Se ainda há adultos para acomodar, buscar outras categorias disponíveis
    if (remainingAdults > 0) {
      // Ordenar categorias por capacidade (maior primeiro) e disponibilidade
      const otherCategories = categories
        .filter((c) => c.id !== primaryCategoryId && availableRoomsByCategory[c.id] > 0)
        .sort((a, b) => {
          const aCapacity = a.capacity_adults || 1;
          const bCapacity = b.capacity_adults || 1;
          const aAvailable = availableRoomsByCategory[a.id] * aCapacity;
          const bAvailable = availableRoomsByCategory[b.id] * bCapacity;
          return bAvailable - aAvailable;
        });

      for (const category of otherCategories) {
        if (remainingAdults <= 0) break;

        const capacity = category.capacity_adults || 1;
        const availableRooms = availableRoomsByCategory[category.id] || 0;
        const maxAdults = availableRooms * capacity;

        if (maxAdults > 0) {
          const adultsForCategory = Math.min(remainingAdults, maxAdults);
          const roomsForCategory = Math.ceil(adultsForCategory / capacity);

          if (roomsForCategory > 0 && roomsForCategory <= availableRooms) {
            result.push({
              categoryId: category.id,
              rooms: roomsForCategory,
              adults: adultsForCategory,
            });
            remainingAdults -= adultsForCategory;
          }
        }
      }
    }

    return result;
  };

  // Distribuir adultos entre categorias disponíveis (lógica Booking.com)
  const distributeAdultsAcrossCategories = async (
    totalAdults: number,
    primaryCategoryId: string,
    availableRoomsByCategory: Record<string, number>
  ): Promise<Array<{ categoryId: string; rooms: number; adults: number }>> => {
    const result: Array<{ categoryId: string; rooms: number; adults: number }> = [];
    let remainingAdults = totalAdults;

    // Buscar categoria primária
    const primaryCategory = categories.find((c) => c.id === primaryCategoryId);
    if (!primaryCategory) return result;

    const primaryCapacity = primaryCategory.capacity_adults || 1;
    const primaryAvailableRooms = availableRoomsByCategory[primaryCategoryId] || 0;
    const primaryMaxAdults = primaryAvailableRooms * primaryCapacity;

    // Tentar acomodar na categoria primária primeiro
    if (primaryMaxAdults > 0) {
      const adultsForPrimary = Math.min(remainingAdults, primaryMaxAdults);
      const roomsForPrimary = Math.ceil(adultsForPrimary / primaryCapacity);
      
      if (roomsForPrimary > 0 && roomsForPrimary <= primaryAvailableRooms) {
        result.push({
          categoryId: primaryCategoryId,
          rooms: roomsForPrimary,
          adults: adultsForPrimary,
        });
        remainingAdults -= adultsForPrimary;
      }
    }

    // Se ainda há adultos para acomodar, buscar outras categorias disponíveis
    if (remainingAdults > 0) {
      // Ordenar categorias por capacidade (maior primeiro) e disponibilidade
      const otherCategories = categories
        .filter((c) => c.id !== primaryCategoryId && availableRoomsByCategory[c.id] > 0)
        .sort((a, b) => {
          const aCapacity = a.capacity_adults || 1;
          const bCapacity = b.capacity_adults || 1;
          const aAvailable = availableRoomsByCategory[a.id] * aCapacity;
          const bAvailable = availableRoomsByCategory[b.id] * bCapacity;
          return bAvailable - aAvailable;
        });

      for (const category of otherCategories) {
        if (remainingAdults <= 0) break;

        const capacity = category.capacity_adults || 1;
        const availableRooms = availableRoomsByCategory[category.id] || 0;
        const maxAdults = availableRooms * capacity;

        if (maxAdults > 0) {
          const adultsForCategory = Math.min(remainingAdults, maxAdults);
          const roomsForCategory = Math.ceil(adultsForCategory / capacity);

          if (roomsForCategory > 0 && roomsForCategory <= availableRooms) {
            result.push({
              categoryId: category.id,
              rooms: roomsForCategory,
              adults: adultsForCategory,
            });
            remainingAdults -= adultsForCategory;
          }
        }
      }
    }

    return result;
  };

  // Obter número de quartos (manual ou calculado)
  const getRequiredRooms = (): number => {
    if (manualRooms !== null) {
      return manualRooms;
    }
    const selectedCategoryData = selectedCategory ? categories.find((c) => c.id === selectedCategory) : null;
    if (!selectedCategoryData) return 1;
    const adults = parseInt(formData.adults) || 1;
    return calculateRequiredRooms(adults, selectedCategoryData);
  };

  // Verificar se há disponibilidade suficiente para todas as categorias selecionadas
  const hasSufficientAvailability = (): boolean => {
    if (!formData.checkinDate || !formData.checkoutDate || !selectedCategory) {
      return false;
    }

    // Se há categorias selecionadas, verificar disponibilidade de cada uma
    if (selectedCategories.length > 0) {
      return selectedCategories.every((cat) => {
        const availableRooms = categoryAvailableRooms[cat.categoryId] ?? 0;
        return availableRooms >= cat.rooms && availableRooms > 0; // Garantir que há pelo menos 1 quarto disponível
      });
    }

    // Se não há categorias selecionadas ainda, verificar disponibilidade da categoria selecionada
    // Verificar tanto availableRoomsCount quanto categoryAvailableRooms para garantir consistência
    const categoryAvailable = categoryAvailableRooms[selectedCategory] ?? null;
    const hasCategoryAvailability = categoryAvailable !== null && categoryAvailable > 0;
    const hasAvailableRoomsCount = availableRoomsCount !== null && availableRoomsCount > 0;
    
    // Se ambos estão disponíveis, verificar se há quartos suficientes
    if (hasCategoryAvailability && hasAvailableRoomsCount) {
      return availableRoomsCount >= requiredRooms && categoryAvailable >= requiredRooms;
    }
    
    // Se algum deles indica indisponibilidade, retornar false
    if (categoryAvailable === 0 || availableRoomsCount === 0) {
      return false;
    }

    // Se ainda não há dados de disponibilidade, retornar false para ser seguro
    return false;
  };

  // Buscar quartos disponíveis de uma categoria para atribuir às reservas
  const getAvailableRoomsForCategory = async (
    categoryId: string,
    checkinDate: string,
    checkoutDate: string,
    requiredCount: number
  ): Promise<string[]> => {
    if (!establishment?.id || !checkinDate || !checkoutDate) {
      return [];
    }

    try {
      // Buscar todos os quartos da categoria que estão disponíveis
      const { data: rooms, error: roomsError } = await supabase
        .from("rooms")
        .select("id")
        .eq("category_id", categoryId)
        .eq("establishment_id", establishment.id)
        .eq("show_in_public", true)
        .in("status", ["available", "cleaning"])
        .eq("is_blocked", false)
        .order("room_number");

      if (roomsError || !rooms || rooms.length === 0) {
        return [];
      }

      // Buscar reservas que conflitam com o período
      const { data: conflictingReservations, error: reservationsError } = await supabase
        .from("reservations")
        .select("room_id")
        .eq("category_id", categoryId)
        .eq("establishment_id", establishment.id)
        .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"])
        .or(`and(checkin_date.lt.${checkoutDate},checkout_date.gt.${checkinDate})`);

      if (reservationsError) {
        console.error("Erro ao buscar reservas:", reservationsError);
        return [];
      }

      // IDs de quartos ocupados
      const occupiedRoomIds = new Set(
        conflictingReservations?.map((r) => r.room_id).filter(Boolean) || []
      );

      // Quartos disponíveis (não ocupados)
      const availableRooms = rooms
        .filter((room) => !occupiedRoomIds.has(room.id))
        .slice(0, requiredCount)
        .map((room) => room.id);

      return availableRooms;
    } catch (error: any) {
      console.error("Erro ao buscar quartos disponíveis:", error);
      return [];
    }
  };

  // Verificar disponibilidade de quartos na categoria
  const checkCategoryRoomAvailability = async (
    categoryId: string,
    checkinDate: string,
    checkoutDate: string,
    requiredRooms: number
  ): Promise<{ available: boolean; availableRooms: number; reason?: string }> => {
    if (!establishment?.id || !checkinDate || !checkoutDate) {
      return { available: false, availableRooms: 0, reason: "Datas não selecionadas" };
    }

    try {
      // Buscar todos os quartos da categoria que estão disponíveis
      const { data: rooms, error: roomsError } = await supabase
        .from("rooms")
        .select("id")
        .eq("category_id", categoryId)
        .eq("establishment_id", establishment.id)
        .eq("show_in_public", true)
        .in("status", ["available", "cleaning"])
        .eq("is_blocked", false);

      if (roomsError) {
        console.error("Erro ao buscar quartos:", roomsError);
        return { available: false, availableRooms: 0, reason: "Erro ao verificar disponibilidade" };
      }

      if (!rooms || rooms.length === 0) {
        return { available: false, availableRooms: 0, reason: "Nenhum quarto disponível nesta categoria" };
      }

      // Buscar reservas que conflitam com o período
      const { data: conflictingReservations, error: reservationsError } = await supabase
        .from("reservations")
        .select("room_id")
        .eq("category_id", categoryId)
        .eq("establishment_id", establishment.id)
        .in("status", ["pending", "confirmed", "checkedin", "blocked", "preregistration"])
        .or(`and(checkin_date.lt.${checkoutDate},checkout_date.gt.${checkinDate})`);

      if (reservationsError) {
        console.error("Erro ao buscar reservas:", reservationsError);
        return { available: false, availableRooms: 0, reason: "Erro ao verificar disponibilidade" };
      }

      // IDs de quartos ocupados
      const occupiedRoomIds = new Set(
        conflictingReservations?.map((r) => r.room_id).filter(Boolean) || []
      );

      // Quartos disponíveis (não ocupados)
      const availableRooms = rooms.filter((room) => !occupiedRoomIds.has(room.id));

      const availableRoomsCount = availableRooms.length;

      return {
        available: availableRoomsCount >= requiredRooms,
        availableRooms: availableRoomsCount,
        reason: availableRoomsCount < requiredRooms
          ? `Apenas ${availableRoomsCount} quarto(s) disponível(is) de ${requiredRooms} necessário(s)`
          : undefined,
      };
    } catch (error: any) {
      console.error("Erro ao verificar disponibilidade:", error);
      return { available: false, availableRooms: 0, reason: error.message || "Erro ao verificar disponibilidade" };
    }
  };

  const getFeatureIcon = (feature: string) => {
    const lowerFeature = feature.toLowerCase();
    if (lowerFeature.includes("wifi") || lowerFeature.includes("wi-fi")) return <Wifi className="w-3 h-3" />;
    if (lowerFeature.includes("ar") || lowerFeature.includes("ar-condicionado")) return <Wind className="w-3 h-3" />;
    if (lowerFeature.includes("tv")) return <Tv className="w-3 h-3" />;
    if (lowerFeature.includes("café") || lowerFeature.includes("cafe")) return <Coffee className="w-3 h-3" />;
    if (lowerFeature.includes("piscina")) return <Waves className="w-3 h-3" />;
    if (lowerFeature.includes("estacionamento") || lowerFeature.includes("garagem")) return <Car className="w-3 h-3" />;
    if (lowerFeature.includes("restaurante")) return <UtensilsCrossed className="w-3 h-3" />;
    return null;
  };

  const filteredRooms = selectedCategory
    ? rooms.filter((room) => room.category_id === selectedCategory)
    : rooms;

  // Componente de contador
  const CounterButton = ({ 
    value, 
    onDecrease, 
    onIncrease, 
    min = 0, 
    max = 99,
    disabled = false 
  }: { 
    value: number; 
    onDecrease: () => void; 
    onIncrease: () => void; 
    min?: number;
    max?: number;
    disabled?: boolean;
  }) => (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onDecrease}
        disabled={value <= min || disabled}
        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${
          value <= min || disabled
            ? "border-slate-200 text-slate-300 cursor-not-allowed"
            : "border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-600"
        }`}
      >
        <Minus className="w-4 h-4" />
      </button>
      <span className="w-8 text-center font-semibold text-slate-900">{value}</span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={value >= max || disabled}
        className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${
          value >= max || disabled
            ? "border-slate-200 text-slate-300 cursor-not-allowed"
            : "border-slate-300 text-slate-700 hover:border-blue-500 hover:text-blue-600"
        }`}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );

  const nights = formData.checkinDate && formData.checkoutDate
    ? (() => {
        // Criar datas no timezone local para evitar problemas de conversão
        const [checkinYear, checkinMonth, checkinDay] = formData.checkinDate.split('-').map(Number);
        const [checkoutYear, checkoutMonth, checkoutDay] = formData.checkoutDate.split('-').map(Number);
        const checkin = new Date(checkinYear, checkinMonth - 1, checkinDay);
        const checkout = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
        return Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
      })()
    : 0;
  
  // Calcular número de quartos necessários para a categoria selecionada
  const selectedCategoryData = selectedCategory ? categories.find((c) => c.id === selectedCategory) : null;
  const adults = parseInt(formData.adults) || 1;
  const children = parseInt(formData.children) || 0;
  const requiredRooms = getRequiredRooms();
  
  // Calcular preço total considerando múltiplas categorias (antes do desconto)
  const basePrice = selectedCategories.length > 0
    ? selectedCategories.reduce((sum, cat) => sum + cat.price, 0)
    : (calculatedPrice || 0);

  // Aplicar desconto se houver cupom válido
  const finalPrice = appliedCoupon && appliedCoupon.valid
    ? appliedCoupon.final_amount
    : basePrice;
  
  const discountAmount = appliedCoupon && appliedCoupon.valid
    ? appliedCoupon.discount_amount
    : 0;
  
  // Calcular número total de quartos de todas as categorias selecionadas
  const totalRooms = selectedCategories.length > 0
    ? selectedCategories.reduce((sum, cat) => sum + cat.rooms, 0)
    : requiredRooms;
  
  // Calcular preço por quarto por noite corretamente
  // Se há múltiplas categorias, calcular preço médio por quarto
  let pricePerRoomPerNight: number;
  if (selectedCategories.length > 0) {
    // Calcular preço médio por quarto considerando todas as categorias
    if (totalRooms > 0 && nights > 0) {
      // Preço total dividido pelo número total de quartos e noites
      pricePerRoomPerNight = finalPrice / totalRooms / nights;
    } else if (totalRooms > 0) {
      // Se não há noites, apenas dividir pelo número de quartos
      pricePerRoomPerNight = finalPrice / totalRooms;
    } else {
      pricePerRoomPerNight = finalPrice;
    }
  } else {
    // Quando não há categorias selecionadas ainda, usar lógica antiga
    if (nights > 0 && requiredRooms > 0) {
      pricePerRoomPerNight = finalPrice / nights / requiredRooms;
    } else if (requiredRooms > 0) {
      pricePerRoomPerNight = finalPrice / requiredRooms;
    } else {
      pricePerRoomPerNight = finalPrice;
    }
  }
  
  const pricePerNight = nights > 0 ? finalPrice / nights : finalPrice;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!establishment) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <Card className="p-8 max-w-md">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2 text-slate-900">{t("publicReservation.establishmentNotFound")}</h2>
            <p className="text-slate-600 mb-4">{t("publicReservation.establishmentNotFoundMessage")}</p>
          </div>
        </Card>
      </div>
    );
  }

  // Preparar dados de contato
  const phone = hotelSettings?.phone || 
    (hotelSettings?.phone_ddi && hotelSettings?.phone_number 
      ? `${hotelSettings.phone_ddi} ${hotelSettings.phone_number}`.trim()
      : hotelSettings?.phone_number || '');
  
  const whatsapp = hotelSettings?.whatsapp || 
    (hotelSettings?.whatsapp_ddi && hotelSettings?.whatsapp_number 
      ? `${hotelSettings.whatsapp_ddi}${hotelSettings.whatsapp_number}`.trim()
      : hotelSettings?.whatsapp_number || '');

  // Foto principal do estabelecimento para o hero
  const heroImage = hotelSettings?.establishment_photos && hotelSettings.establishment_photos.length > 0
    ? hotelSettings.establishment_photos[0]
    : null;

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Logo e Título */}
            <div className="flex items-center gap-2 sm:gap-3">
              {(pmsLogoUrl || siteSettings?.logo_url) ? (
                <img 
                  src={pmsLogoUrl || siteSettings?.logo_url || ""} 
                  alt="Logo" 
                  className="h-10 w-10 sm:h-12 sm:w-12 object-contain flex-shrink-0"
                />
              ) : (
                <Home className="w-6 h-6 sm:w-7 sm:h-7 text-slate-600" />
              )}
              <div className="hidden sm:block">
                <h1 className="text-lg sm:text-xl font-bold text-slate-800">
                  {siteSettings?.site_title || t("publicReservation.title")}
                </h1>
                <p className="text-xs text-slate-500">{t("publicReservation.subtitle")}</p>
              </div>
            </div>

            {/* Seletor de Idioma */}
            <div className="flex items-center gap-2 sm:gap-4">
              <LanguageSelector />
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="relative w-full h-[60vh] min-h-[500px] max-h-[700px] overflow-hidden">
        {heroImage ? (
          <img
            src={heroImage}
            alt={hotelSettings?.name || establishment.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-black/20" />
        
        {/* Conteúdo do Hero */}
        <div className="absolute inset-0 flex flex-col justify-end">
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-12">
            <div className="max-w-3xl">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 leading-tight">
                {hotelSettings?.name || establishment.name || t("publicReservation.establishmentNotFound")}
              </h1>
              {hotelSettings?.street && (
                <p className="text-white/90 text-lg flex items-center gap-2 mb-6">
                  <MapPin className="w-5 h-5" />
                  {hotelSettings.street}
                  {hotelSettings.number && `, ${hotelSettings.number}`}
                  {hotelSettings.city && ` - ${hotelSettings.city}`}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-4 text-white/90">
                {phone && (
                  <a 
                    href={`tel:${phone.replace(/\D/g, '')}`}
                    className="flex items-center gap-2 hover:text-white transition-colors"
                  >
                    <Phone className="w-5 h-5" />
                    <span>{phone}</span>
                  </a>
                )}
                {whatsapp && (
                  <a 
                    href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-white transition-colors"
                  >
                    <MessageCircle className="w-5 h-5" />
                    <span>WhatsApp</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8">
          {/* Coluna Esquerda - Quartos */}
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-2">{t("publicReservation.chooseRoom")}</h2>
              <p className="text-slate-600">{t("publicReservation.chooseRoomSubtitle")}</p>
            </div>

            {categories.length === 0 ? (
              <Card className="p-12 text-center border-0 shadow-lg">
                <Bed className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 text-lg">{t("publicReservation.noCategoriesAvailable")}</p>
              </Card>
            ) : (
              <div className="space-y-6">
                {categories.map((category) => {
                  const categoryPhotos = category.display_photos && category.display_photos.length > 0 
                    ? category.display_photos 
                    : [];
                  const categoryFeatures = category.display_features || [];
                  const categoryDescription = category.display_description || "";
                  const categoryPrice = categoryPrices[category.id];
                  const isSelected = selectedCategory === category.id;
                  const totalRoomsInCategory = categoryTotalRooms[category.id] || 0;
                  // Quartos disponíveis para o período selecionado (só mostra quando há datas)
                  const availableRoomsForPeriod = formData.checkinDate && formData.checkoutDate
                    ? (categoryAvailableRooms[category.id] ?? null)
                    : null;
                  // Calcular número de noites
                  const nights = formData.checkinDate && formData.checkoutDate
                    ? (() => {
                        const [checkinYear, checkinMonth, checkinDay] = formData.checkinDate.split('-').map(Number);
                        const [checkoutYear, checkoutMonth, checkoutDay] = formData.checkoutDate.split('-').map(Number);
                        const checkin = new Date(checkinYear, checkinMonth - 1, checkinDay);
                        const checkout = new Date(checkoutYear, checkoutMonth - 1, checkoutDay);
                        return Math.ceil((checkout.getTime() - checkin.getTime()) / (1000 * 60 * 60 * 24));
                      })()
                    : 0;

                  return (
                    <Card
                      key={category.id}
                      className={`overflow-hidden transition-all cursor-pointer border-2 hover:shadow-2xl ${
                        isSelected 
                          ? "border-blue-500 shadow-xl ring-4 ring-blue-500/20" 
                          : "border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => setSelectedCategory(category.id)}
                    >
                      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-0">
                        {/* Foto */}
                        <div 
                          className="relative h-[250px] md:h-full min-h-[250px] cursor-pointer group"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (categoryPhotos.length > 0) {
                              setSelectedCategoryForGallery(category);
                              setCurrentImageIndex(0);
                              setGalleryOpen(true);
                            }
                          }}
                        >
                          {categoryPhotos.length > 0 ? (
                            <>
                              <img
                                src={categoryPhotos[0]}
                                alt={category.name}
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm rounded-full p-3 shadow-lg">
                                  <ImageIcon className="w-6 h-6 text-slate-700" />
                                </div>
                              </div>
                              {categoryPhotos.length > 1 && (
                                <div className="absolute bottom-4 right-4 bg-black/70 text-white px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm">
                                  {categoryPhotos.length} {t("publicReservation.photos")}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
                              <Bed className="w-20 h-20 text-slate-300" />
                            </div>
                          )}
                          {isSelected && (
                            <div className="absolute top-4 right-4">
                              <Badge className="bg-blue-600 text-white px-3 py-1.5 text-sm font-semibold shadow-lg">
                                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                                {t("publicReservation.selected")}
                              </Badge>
                            </div>
                          )}
                        </div>

                        {/* Informações */}
                        <div className="p-6 md:p-8 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2 flex-wrap">
                                  <h3 className="text-2xl font-bold text-slate-900">
                                    {category.name}
                                  </h3>
                                  {/* Badge de Disponibilidade - Tática de Vendas */}
                                  {/* Mostrar apenas quando há datas selecionadas */}
                                  {formData.checkinDate && formData.checkoutDate && availableRoomsForPeriod !== null && (
                                    <>
                                      {availableRoomsForPeriod > 0 ? (
                                        <Badge className={`px-4 py-2 text-sm font-bold shadow-xl border-2 border-white/50 ${
                                          availableRoomsForPeriod <= 3
                                            ? "bg-[#FF5A5F] text-white animate-pulse"
                                            : availableRoomsForPeriod <= 5
                                            ? "bg-gradient-to-r from-orange-500 to-yellow-500 text-white"
                                            : "bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                                        }`}>
                                          <Bed className="w-4 h-4 mr-2" />
                                          {formatRoomsLeftText(availableRoomsForPeriod)}
                                        </Badge>
                                      ) : (
                                        <Badge className="px-4 py-2 text-sm font-bold shadow-xl border-2 border-white/50 bg-gradient-to-r from-slate-600 to-slate-700 text-white">
                                          <XCircle className="w-4 h-4 mr-2" />
                                          {t("publicReservation.soldOut")}
                                        </Badge>
                                      )}
                                    </>
                                  )}
                                  {/* Capacidade de Hóspedes */}
                                  {((category.capacity_adults !== null && category.capacity_adults !== undefined) || 
                                    (category.capacity_children !== null && category.capacity_children !== undefined && category.capacity_children > 0)) && (
                                    <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700 px-3 py-1 text-xs font-semibold">
                                      <Users className="w-3 h-3 mr-1.5" />
                                      {category.capacity_adults || 0} {category.capacity_adults === 1 ? t("publicReservation.adult") : t("publicReservation.adultsPlural")}
                                      {category.capacity_children > 0 && (
                                        <> + {category.capacity_children} {category.capacity_children === 1 ? t("publicReservation.child") : t("publicReservation.childrenPlural")}</>
                                      )}
                                    </Badge>
                                  )}
                                </div>
                                {categoryDescription && (
                                  <p className="text-slate-600 text-sm leading-relaxed line-clamp-2 mb-4">
                                    {categoryDescription}
                                  </p>
                                )}
                                {/* Horários de Check-in e Check-out */}
                                {(hotelSettings?.checkin_time || hotelSettings?.checkout_time) && (
                                  <div className="flex items-center gap-4 mt-3 mb-2">
                                    {hotelSettings?.checkin_time && (
                                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                                        <span className="font-medium">{t("publicReservation.checkin")}:</span>
                                        <span>{formatTime(hotelSettings.checkin_time)}</span>
                                      </div>
                                    )}
                                    {hotelSettings?.checkout_time && (
                                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                                        <span className="font-medium">{t("publicReservation.checkout")}:</span>
                                        <span>{formatTime(hotelSettings.checkout_time)}</span>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Características */}
                            {categoryFeatures.length > 0 && (
                              <div className="flex flex-wrap gap-2 mb-4">
                                {categoryFeatures.slice(0, 5).map((feature: string, index: number) => (
                                  <Badge 
                                    key={index} 
                                    variant="outline" 
                                    className="bg-slate-50 border-slate-200 text-slate-700 px-3 py-1 text-xs font-medium"
                                  >
                                    {getFeatureIcon(feature)}
                                    <span className="ml-1">{feature}</span>
                                  </Badge>
                                ))}
                                {categoryFeatures.length > 5 && (
                                  <Badge variant="outline" className="bg-slate-50 border-slate-200 text-slate-700 px-3 py-1 text-xs font-medium">
                                    +{categoryFeatures.length - 5} {t("publicReservation.more")}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Preço - Exibir 2 planos se configurados */}
                          {publicPricingPlan1Id || publicPricingPlan2Id ? (
                            <div className="pt-4 border-t border-slate-200">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Plano 1 */}
                                {publicPricingPlan1Id && (
                                  <div 
                                    className={`p-4 border-2 rounded-lg bg-white cursor-pointer transition-all hover:shadow-md ${
                                      selectedPlanByCategory[category.id] === "plan1"
                                        ? "border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-500/20"
                                        : "border-slate-200 hover:border-slate-300"
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newPlan = selectedPlanByCategory[category.id] === "plan1" ? null : "plan1";
                                      handlePlanSelection(category.id, newPlan);
                                    }}
                                  >
                                    <div className="flex items-start justify-between mb-2">
                                      <h4 className="text-sm font-semibold text-slate-700">
                                        {publicPricingPlan1Title || "Plano 1"}
                                      </h4>
                                      {selectedPlanByCategory[category.id] === "plan1" && (
                                        <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                                      )}
                                    </div>
                                    {categoryPricesPlan1[category.id] !== undefined ? (
                                      formData.checkinDate && formData.checkoutDate ? (
                                        <>
                                          <p className="text-xs text-slate-500 mb-1">
                                            {t("publicReservation.priceTotalFor")} {nights} {nights === 1 ? t("publicReservation.night") : t("publicReservation.nights")}
                                          </p>
                                          <p className="text-2xl font-bold text-green-600">
                                            R$ {categoryPricesPlan1[category.id].toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                          <p className="text-xs text-slate-500 mt-1">
                                            R$ {(categoryPricesPlan1[category.id] / nights).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t("publicReservation.pricePerNight")}
                                          </p>
                                        </>
                                      ) : (
                                        <>
                                          <p className="text-xs text-slate-500 mb-1">{t("publicReservation.pricePerNight")}</p>
                                          <p className="text-2xl font-bold text-green-600">
                                            R$ {categoryPricesPlan1[category.id].toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                          <p className="text-xs text-slate-400 mt-1">{t("publicReservation.selectDatesToSeeTotal")}</p>
                                        </>
                                      )
                                    ) : (
                                      <>
                                        <p className="text-xs text-slate-500 mb-1">{t("publicReservation.pricePerNight")}</p>
                                        <p className="text-2xl font-bold text-slate-400">
                                          {calculatingPrice ? (
                                            <Loader2 className="w-6 h-6 animate-spin inline-block" />
                                          ) : (
                                            `R$ ${Number(category.base_price || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                          )}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                          {calculatingPrice ? t("publicReservation.loading") : t("publicReservation.selectDatesToSeeTotal")}
                                        </p>
                                      </>
                                    )}
                                  </div>
                                )}

                                {/* Plano 2 */}
                                {publicPricingPlan2Id && (
                                  <div 
                                    className={`p-4 border-2 rounded-lg bg-white cursor-pointer transition-all hover:shadow-md ${
                                      selectedPlanByCategory[category.id] === "plan2"
                                        ? "border-blue-500 bg-blue-50 shadow-lg ring-2 ring-blue-500/20"
                                        : "border-slate-200 hover:border-slate-300"
                                    }`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newPlan = selectedPlanByCategory[category.id] === "plan2" ? null : "plan2";
                                      handlePlanSelection(category.id, newPlan);
                                    }}
                                  >
                                    <div className="flex items-start justify-between mb-2">
                                      <h4 className="text-sm font-semibold text-slate-700">
                                        {publicPricingPlan2Title || "Plano 2"}
                                      </h4>
                                      {selectedPlanByCategory[category.id] === "plan2" && (
                                        <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                                      )}
                                    </div>
                                    {categoryPricesPlan2[category.id] !== undefined ? (
                                      formData.checkinDate && formData.checkoutDate ? (
                                        <>
                                          <p className="text-xs text-slate-500 mb-1">
                                            {t("publicReservation.priceTotalFor")} {nights} {nights === 1 ? t("publicReservation.night") : t("publicReservation.nights")}
                                          </p>
                                          <p className="text-2xl font-bold text-green-600">
                                            R$ {categoryPricesPlan2[category.id].toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                          <p className="text-xs text-slate-500 mt-1">
                                            R$ {(categoryPricesPlan2[category.id] / nights).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t("publicReservation.pricePerNight")}
                                          </p>
                                        </>
                                      ) : (
                                        <>
                                          <p className="text-xs text-slate-500 mb-1">{t("publicReservation.pricePerNight")}</p>
                                          <p className="text-2xl font-bold text-green-600">
                                            R$ {categoryPricesPlan2[category.id].toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                          <p className="text-xs text-slate-400 mt-1">{t("publicReservation.selectDatesToSeeTotal")}</p>
                                        </>
                                      )
                                    ) : (
                                      <>
                                        <p className="text-xs text-slate-500 mb-1">{t("publicReservation.pricePerNight")}</p>
                                        <p className="text-2xl font-bold text-slate-400">
                                          {calculatingPrice ? (
                                            <Loader2 className="w-6 h-6 animate-spin inline-block" />
                                          ) : (
                                            `R$ ${Number(category.base_price || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                          )}
                                        </p>
                                        <p className="text-xs text-slate-400 mt-1">
                                          {calculatingPrice ? t("publicReservation.loading") : t("publicReservation.selectDatesToSeeTotal")}
                                        </p>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                              {calculatingPrice && (
                                <div className="flex justify-center mt-2">
                                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-end justify-between pt-4 border-t border-slate-200">
                              <div>
                                {categoryPrice !== undefined ? (
                                  formData.checkinDate && formData.checkoutDate ? (
                                    <>
                                      <p className="text-xs text-slate-500 mb-1">{t("publicReservation.priceTotalFor")} {nights} {nights === 1 ? t("publicReservation.night") : t("publicReservation.nights")}</p>
                                      <p className="text-3xl font-bold text-blue-600">
                                        R$ {categoryPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </p>
                                      <p className="text-sm text-slate-500 mt-1">
                                        R$ {(categoryPrice / nights).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t("publicReservation.pricePerNight")}
                                      </p>
                                    </>
                                  ) : (
                                    <>
                                      <p className="text-xs text-slate-500 mb-1">{t("publicReservation.pricePerNight")}</p>
                                      <p className="text-3xl font-bold text-blue-600">
                                        R$ {categoryPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </p>
                                      <p className="text-sm text-slate-400 mt-1">{t("publicReservation.selectDatesToSeeTotal")}</p>
                                    </>
                                  )
                                ) : (
                                  <>
                                    <p className="text-xs text-slate-500 mb-1">{t("publicReservation.pricePerNight")}</p>
                                    <p className="text-3xl font-bold text-blue-600">
                                      R$ {Number(category.base_price || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-sm text-slate-400 mt-1">{t("publicReservation.loading")}</p>
                                  </>
                                )}
                              </div>
                              {calculatingPrice && (
                                <Loader2 className="w-5 h-5 animate-spin text-blue-500 mb-2" />
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Coluna Direita - Formulário Sticky */}
          <div className="lg:sticky lg:top-8 h-fit">
            <Card className="border-2 border-slate-200 shadow-xl p-6">
              <h3 className="text-2xl font-bold text-slate-900 mb-6">{t("publicReservation.completeReservation")}</h3>

              {/* Informativo sobre variação de preço e disponibilidade */}
              {selectedCategory && (
                <Alert className="mb-6 border-amber-200 bg-amber-50">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-sm font-semibold text-amber-900">
                    {t("publicReservation.priceAvailabilityNotice.title")}
                  </AlertTitle>
                  <AlertDescription className="text-xs text-amber-800 mt-1">
                    {t("publicReservation.priceAvailabilityNotice.description")}
                  </AlertDescription>
                </Alert>
              )}

              {/* Aviso quando múltiplas categorias são selecionadas automaticamente */}
              {selectedCategories.length > 1 && formData.checkinDate && formData.checkoutDate && (
                <Alert className="mb-6 border-blue-200 bg-blue-50">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertTitle className="text-sm font-semibold text-blue-900">
                    {t("publicReservation.multipleCategoriesSelected")}
                  </AlertTitle>
                  <AlertDescription className="text-xs text-blue-800 mt-1">
                    {t("publicReservation.multipleCategoriesDescription", { 
                      count: selectedCategories.length,
                      totalRooms: selectedCategories.reduce((sum, cat) => sum + cat.rooms, 0),
                      totalAdults: selectedCategories.reduce((sum, cat) => sum + cat.adults, 0)
                    })}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Datas */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="checkinDate" className="text-sm font-semibold text-slate-700 mb-2 block">
                        {t("publicReservation.checkin")}
                      </Label>
                      <Input
                        id="checkinDate"
                        type="date"
                        value={formData.checkinDate}
                        onChange={(e) => setFormData({ ...formData, checkinDate: e.target.value })}
                        required
                        min={formatDateLocal(new Date())}
                        className="h-12 border-2 border-slate-200 focus:border-blue-500 rounded-lg"
                      />
                    </div>
                    <div>
                      <Label htmlFor="checkoutDate" className="text-sm font-semibold text-slate-700 mb-2 block">
                        {t("publicReservation.checkout")}
                      </Label>
                      <Input
                        id="checkoutDate"
                        type="date"
                        value={formData.checkoutDate}
                        onChange={(e) => setFormData({ ...formData, checkoutDate: e.target.value })}
                        required
                        min={formData.checkinDate || formatDateLocal(new Date())}
                        className="h-12 border-2 border-slate-200 focus:border-blue-500 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Hóspedes e Quartos - Estilo Booking.com */}
                  <div>
                    <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                      {t("publicReservation.guestsAndRooms")}
                    </Label>
                    <button
                      type="button"
                      onClick={() => setGuestsModalOpen(true)}
                      className="w-full h-12 border-2 border-slate-200 hover:border-blue-500 focus:border-blue-500 rounded-lg px-4 flex items-center justify-between transition-colors"
                    >
                      <div className="flex items-center gap-2 text-slate-700">
                        <Users className="w-5 h-5" />
                        <span className="text-sm">
                          {adults} {adults === 1 ? t("publicReservation.adult") : t("publicReservation.adultsPlural")}
                          {children > 0 && (
                            <> · {children} {children === 1 ? t("publicReservation.child") : t("publicReservation.childrenPlural")}</>
                          )}
                          {totalRooms > 0 && (
                            <> · {totalRooms} {totalRooms === 1 ? t("publicReservation.room") : t("publicReservation.rooms")}</>
                          )}
                        </span>
                      </div>
                      <ChevronDown className="w-5 h-5 text-slate-400" />
                    </button>
                  </div>

                  {/* Modal de Seleção de Hóspedes e Quartos */}
                  <Dialog open={guestsModalOpen} onOpenChange={setGuestsModalOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogTitle className="text-lg font-semibold text-slate-900 mb-4">
                        {t("publicReservation.selectGuestsAndRooms")}
                      </DialogTitle>
                      
                      <div className="space-y-6">
                        {/* Adultos */}
                        <div className="flex items-center justify-between py-2 border-b border-slate-200">
                          <div>
                            <Label className="text-base font-medium text-slate-900">
                              {t("publicReservation.adults")}
                            </Label>
                          </div>
                          <CounterButton
                            value={adults}
                            onDecrease={() => {
                              if (adults > 1) {
                                setFormData({ ...formData, adults: (adults - 1).toString() });
                                // Resetar quartos manuais quando adultos mudarem
                                if (manualRooms !== null) {
                                  const newAdults = adults - 1;
                                  const calculated = selectedCategoryData 
                                    ? calculateRequiredRooms(newAdults, selectedCategoryData)
                                    : 1;
                                  setManualRooms(calculated);
                                }
                              }
                            }}
                            onIncrease={() => {
                              if (adults < 30) {
                                setFormData({ ...formData, adults: (adults + 1).toString() });
                                // Resetar quartos manuais quando adultos mudarem
                                if (manualRooms !== null) {
                                  const newAdults = adults + 1;
                                  const calculated = selectedCategoryData 
                                    ? calculateRequiredRooms(newAdults, selectedCategoryData)
                                    : 1;
                                  setManualRooms(calculated);
                                }
                              }
                            }}
                            min={1}
                            max={30}
                          />
                        </div>

                        {/* Crianças */}
                        <div className="flex items-center justify-between py-2 border-b border-slate-200">
                          <div>
                            <Label className="text-base font-medium text-slate-900">
                              {t("publicReservation.children")}
                            </Label>
                            <p className="text-xs text-slate-500 mt-1">
                              {t("publicReservation.childrenAgeInfo")}
                            </p>
                          </div>
                          <CounterButton
                            value={children}
                            onDecrease={() => {
                              if (children > 0) {
                                setFormData({ ...formData, children: (children - 1).toString() });
                              }
                            }}
                            onIncrease={() => {
                              if (children < 10) {
                                setFormData({ ...formData, children: (children + 1).toString() });
                              }
                            }}
                            min={0}
                            max={10}
                          />
                        </div>

                        {/* Quartos */}
                        <div className="flex items-center justify-between py-2">
                          <div>
                            <Label className="text-base font-medium text-slate-900">
                              {t("publicReservation.rooms")}
                            </Label>
                            {selectedCategories.length > 0 ? (
                              <p className="text-xs text-slate-500 mt-1">
                                {t("publicReservation.calculatedFromSelectedCategories")}
                              </p>
                            ) : selectedCategoryData && manualRooms === null ? (
                              <p className="text-xs text-slate-500 mt-1">
                                {formatAutoCalculatedText(adults, selectedCategoryData.capacity_adults || 1)}
                              </p>
                            ) : null}
                            {selectedCategories.length === 0 && availableRoomsCount !== null && (
                              <p className={`text-xs mt-1 ${
                                availableRoomsCount === 0 
                                  ? "text-red-600 font-semibold" 
                                  : availableRoomsCount < requiredRooms
                                  ? "text-orange-600"
                                  : "text-green-600"
                              }`}>
                                {checkingAvailability ? (
                                  <>{t("publicReservation.checkingAvailability")}...</>
                                ) : availableRoomsCount === 0 ? (
                                  t("publicReservation.noRoomsAvailable")
                                ) : availableRoomsCount < requiredRooms ? (
                                  formatInsufficientRoomsWarning(availableRoomsCount, requiredRooms)
                                ) : (
                                  formatAvailableRoomsText(availableRoomsCount)
                                )}
                              </p>
                            )}
                            {selectedCategories.length > 0 && (
                              <p className="text-xs text-green-600 mt-1 font-semibold">
                                {totalRooms} {totalRooms === 1 ? t("publicReservation.room") : t("publicReservation.rooms")} {t("publicReservation.fromSelectedCategories")}
                              </p>
                            )}
                          </div>
                          {selectedCategories.length === 0 ? (
                            <CounterButton
                              value={requiredRooms}
                              onDecrease={() => {
                                const minRooms = selectedCategoryData 
                                  ? calculateRequiredRooms(adults, selectedCategoryData)
                                  : 1;
                                if (requiredRooms > minRooms) {
                                  setManualRooms(requiredRooms - 1);
                                }
                              }}
                              onIncrease={() => {
                                // Limitar pela disponibilidade real ou 10 quartos, o que for menor
                                const maxRooms = availableRoomsCount !== null 
                                  ? Math.min(availableRoomsCount, 10)
                                  : 10;
                                if (requiredRooms < maxRooms) {
                                  setManualRooms(requiredRooms + 1);
                                } else if (availableRoomsCount !== null && requiredRooms >= availableRoomsCount) {
                                  toast.error(
                                    t("publicReservation.errors.maxRoomsReached", {
                                      available: availableRoomsCount
                                    })
                                  );
                                }
                              }}
                              min={selectedCategoryData ? calculateRequiredRooms(adults, selectedCategoryData) : 1}
                              max={availableRoomsCount !== null ? Math.min(availableRoomsCount, 10) : 10}
                              disabled={checkingAvailability}
                            />
                          ) : (
                            <div className="text-lg font-bold text-blue-600">
                              {totalRooms}
                            </div>
                          )}
                        </div>

                        {/* Informação sobre disponibilidade */}
                        {selectedCategories.length === 0 && selectedCategoryData && formData.checkinDate && formData.checkoutDate && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-xs text-blue-800">
                              {formatAvailabilityText(requiredRooms, selectedCategoryData.capacity_adults || 1)}
                            </p>
                          </div>
                        )}
                        {selectedCategories.length > 0 && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-xs text-green-800">
                              {t("publicReservation.roomsCalculatedFromPlans")}: {selectedCategories.map((cat, idx) => {
                                const catName = categories.find(c => c.id === cat.categoryId)?.name || "";
                                return `${cat.rooms} ${cat.rooms === 1 ? t("publicReservation.room") : t("publicReservation.rooms")} ${catName}`;
                              }).join(", ")}
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end mt-6">
                        <Button
                          type="button"
                          onClick={() => setGuestsModalOpen(false)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-6"
                        >
                          {t("publicReservation.ok")}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>

                <Separator />

                {/* Dados de Contato */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-slate-900">{t("publicReservation.contactData")}</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="firstName" className="text-sm font-semibold text-slate-700 mb-2 block">
                        {t("publicReservation.firstName")} *
                      </Label>
                      <Input
                        id="firstName"
                        value={formData.firstName}
                        onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                        required
                        className="h-12 border-2 border-slate-200 focus:border-blue-500 rounded-lg"
                      />
                    </div>
                    <div>
                      <Label htmlFor="lastName" className="text-sm font-semibold text-slate-700 mb-2 block">
                        {t("publicReservation.lastName")} *
                      </Label>
                      <Input
                        id="lastName"
                        value={formData.lastName}
                        onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                        required
                        className="h-12 border-2 border-slate-200 focus:border-blue-500 rounded-lg"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="email" className="text-sm font-semibold text-slate-700 mb-2 block">
                      {t("publicReservation.email")} *
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      required
                      className="h-12 border-2 border-slate-200 focus:border-blue-500 rounded-lg"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cpf" className="text-sm font-semibold text-slate-700 mb-2 block">
                        {t("publicReservation.cpf")}
                      </Label>
                      <Input
                        id="cpf"
                        value={formData.cpf}
                        onChange={(e) => setFormData({ ...formData, cpf: formatCPF(e.target.value) })}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className="h-12 border-2 border-slate-200 focus:border-blue-500 rounded-lg"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone" className="text-sm font-semibold text-slate-700 mb-2 block">
                        {t("publicReservation.phone")}
                      </Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                        placeholder="(00) 00000-0000"
                        className="h-12 border-2 border-slate-200 focus:border-blue-500 rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Cupom de Desconto */}
                <div className="space-y-2">
                  <Label htmlFor="promotionalCode" className="text-sm font-semibold text-slate-700 mb-2 block">
                    {t("publicReservation.promotionalCode", "Cupom de Desconto")}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="promotionalCode"
                      value={formData.promotionalCode}
                      onChange={(e) => setFormData({ ...formData, promotionalCode: e.target.value.toUpperCase() })}
                      placeholder={t("publicReservation.enterPromotionalCode", "Digite o código do cupom")}
                      className="h-12 border-2 border-slate-200 focus:border-blue-500 rounded-lg flex-1"
                      disabled={validatingCoupon || !!appliedCoupon}
                    />
                    {appliedCoupon ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRemoveCoupon}
                        className="h-12 px-4"
                      >
                        <X className="h-4 w-4 mr-2" />
                        Remover
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={handleApplyCoupon}
                        disabled={validatingCoupon || !formData.promotionalCode.trim()}
                        className="h-12 px-4 bg-green-600 hover:bg-green-700 text-white"
                      >
                        {validatingCoupon ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          t("publicReservation.apply", "Aplicar")
                        )}
                      </Button>
                    )}
                  </div>
                  {appliedCoupon && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-2 text-green-800">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-semibold">
                          Cupom "{appliedCoupon.coupon_name}" aplicado! Desconto de{" "}
                          {appliedCoupon.discount_type === "percentage"
                            ? `${appliedCoupon.discount_value}%`
                            : `R$ ${appliedCoupon.discount_value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Observações */}
                <div>
                  <Label htmlFor="notes" className="text-sm font-semibold text-slate-700 mb-2 block">
                    {t("publicReservation.notes")}
                  </Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    placeholder={t("publicReservation.notesPlaceholder")}
                    className="border-2 border-slate-200 focus:border-blue-500 rounded-lg resize-none"
                  />
                </div>

                {/* Resumo */}
                {selectedCategory && (selectedCategories.length > 0 || calculatedPrice) && formData.checkinDate && formData.checkoutDate && (
                  <div className="bg-slate-50 rounded-lg p-4 space-y-3 border-2 border-slate-200">
                    <h4 className="font-semibold text-slate-900 mb-3">{t("publicReservation.reservationSummary")}</h4>
                    
                    {/* Detalhamento por categoria */}
                    {selectedCategories.length > 0 && (
                      <div className="space-y-3 mb-3">
                        {selectedCategories.map((cat, index) => {
                          const category = categories.find((c) => c.id === cat.categoryId);
                          const selectedPlan = selectedPlanByCategory[cat.categoryId];
                          
                          // Usar preços recalculados especificamente para esta categoria no resumo
                          const plan1PricePerRoomPerNight = summaryPlanPrices[cat.categoryId]?.plan1;
                          const plan2PricePerRoomPerNight = summaryPlanPrices[cat.categoryId]?.plan2;
                          
                          return (
                            <div key={cat.categoryId} className="bg-white rounded-lg p-4 border-2 border-slate-200 relative">
                              {/* Botão de remover */}
                              <button
                                type="button"
                                onClick={() => handleRemoveCategory(cat.categoryId)}
                                className="absolute top-2 right-2 p-1.5 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                                title={t("publicReservation.removeCategory", "Remover categoria")}
                              >
                                <X className="w-4 h-4" />
                              </button>
                              
                              <div className="flex items-center justify-between mb-3 pr-8">
                                <div className="flex items-center gap-2">
                                  <Bed className="w-4 h-4 text-blue-600" />
                                  <span className="font-semibold text-slate-900 text-sm">
                                    {category?.name || `Categoria ${index + 1}`}
                                  </span>
                                </div>
                                <span className="font-bold text-blue-600">
                                  R$ {cat.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="text-xs text-slate-600 space-y-1 mb-3">
                                <div className="flex justify-between">
                                  <span>{cat.rooms} {cat.rooms === 1 ? t("publicReservation.room") : t("publicReservation.rooms")}</span>
                                  <span>{cat.adults} {cat.adults === 1 ? t("publicReservation.adult") : t("publicReservation.adultsPlural")}</span>
                                </div>
                                {nights > 0 && (
                                  <div className="flex justify-between text-slate-500">
                                    <span>{nights} {nights === 1 ? t("publicReservation.night") : t("publicReservation.nights")}</span>
                                    <span>R$ {(cat.price / nights).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t("publicReservation.pricePerNight")}</span>
                                  </div>
                                )}
                              </div>

                              {/* Seleção de Plano Tarifário para esta categoria */}
                              {(publicPricingPlan1Id || publicPricingPlan2Id) && (plan1PricePerRoomPerNight !== undefined || plan2PricePerRoomPerNight !== undefined) && (
                                <div className="mt-3 pt-3 border-t border-slate-200">
                                  <Label className="text-xs font-semibold text-slate-700 mb-2 block">
                                    Selecionar Plano Tarifário:
                                  </Label>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {/* Plano 1 */}
                                    {publicPricingPlan1Id && plan1PricePerRoomPerNight !== undefined && (
                                      <div 
                                        className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                          selectedPlan === "plan1"
                                            ? "border-blue-500 bg-blue-50 shadow-md"
                                            : "border-slate-200 hover:border-slate-300 bg-white"
                                        }`}
                                        onClick={() => {
                                          const newPlan = selectedPlan === "plan1" ? null : "plan1";
                                          handlePlanSelection(cat.categoryId, newPlan);
                                        }}
                                      >
                                        <div className="flex items-start justify-between mb-1">
                                          <h5 className="text-xs font-semibold text-slate-700">
                                            {publicPricingPlan1Title || "Plano 1"}
                                          </h5>
                                          {selectedPlan === "plan1" && (
                                            <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                          )}
                                        </div>
                                        {nights > 0 ? (
                                          <>
                                            <p className="text-lg font-bold text-green-600">
                                              R$ {plan1PricePerRoomPerNight.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                              por quarto / por noite
                                            </p>
                                          </>
                                        ) : (
                                          <p className="text-lg font-bold text-green-600">
                                            R$ {plan1PricePerRoomPerNight.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                        )}
                                      </div>
                                    )}

                                    {/* Plano 2 */}
                                    {publicPricingPlan2Id && plan2PricePerRoomPerNight !== undefined && (
                                      <div 
                                        className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                                          selectedPlan === "plan2"
                                            ? "border-blue-500 bg-blue-50 shadow-md"
                                            : "border-slate-200 hover:border-slate-300 bg-white"
                                        }`}
                                        onClick={() => {
                                          const newPlan = selectedPlan === "plan2" ? null : "plan2";
                                          handlePlanSelection(cat.categoryId, newPlan);
                                        }}
                                      >
                                        <div className="flex items-start justify-between mb-1">
                                          <h5 className="text-xs font-semibold text-slate-700">
                                            {publicPricingPlan2Title || "Plano 2"}
                                          </h5>
                                          {selectedPlan === "plan2" && (
                                            <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                                          )}
                                        </div>
                                        {nights > 0 ? (
                                          <>
                                            <p className="text-lg font-bold text-green-600">
                                              R$ {plan2PricePerRoomPerNight.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-xs text-slate-500">
                                              por quarto / por noite
                                            </p>
                                          </>
                                        ) : (
                                          <p className="text-lg font-bold text-green-600">
                                            R$ {plan2PricePerRoomPerNight.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Informação de quartos necessários quando houver apenas uma categoria */}
                    {selectedCategories.length === 1 && selectedCategoryData && totalRooms > 1 && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-2 text-blue-800 text-sm">
                          <Bed className="w-4 h-4" />
                          <span className="font-medium">
                            {totalRooms} {totalRooms === 1 ? t("publicReservation.room") : t("publicReservation.rooms")} {t("publicReservation.required")}
                          </span>
                        </div>
                        <p className="text-xs text-blue-700 mt-1">
                          {formatRoomsRequiredText(
                            adults, 
                            selectedCategoryData.capacity_adults || 1,
                            totalRooms
                          )}
                        </p>
                      </div>
                    )}

                    {/* Detalhamento simplificado quando houver apenas uma categoria */}
                    {selectedCategories.length === 1 && nights > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">
                            {totalRooms > 1 
                              ? `${t("publicReservation.pricePerRoomPerNight")} (${totalRooms} ${totalRooms === 1 ? t("publicReservation.room") : t("publicReservation.rooms")})`
                              : t("publicReservation.pricePerNight")
                            }
                          </span>
                          <span className="font-medium text-slate-900">
                            R$ {pricePerRoomPerNight.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">{nights} {nights === 1 ? t("publicReservation.night") : t("publicReservation.nights")}</span>
                          <span className="font-medium text-slate-900">× {nights}</span>
                        </div>
                        {totalRooms > 1 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">{totalRooms} {totalRooms === 1 ? t("publicReservation.room") : t("publicReservation.rooms")}</span>
                            <span className="font-medium text-slate-900">× {totalRooms}</span>
                          </div>
                        )}
                      </>
                    )}

                    {/* Fallback quando não há categorias calculadas ainda */}
                    {selectedCategories.length === 0 && nights > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">
                            {totalRooms > 1 
                              ? `${t("publicReservation.pricePerRoomPerNight")} (${totalRooms} ${totalRooms === 1 ? t("publicReservation.room") : t("publicReservation.rooms")})`
                              : t("publicReservation.pricePerNight")
                            }
                          </span>
                          <span className="font-medium text-slate-900">
                            R$ {pricePerRoomPerNight.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">{nights} {nights === 1 ? t("publicReservation.night") : t("publicReservation.nights")}</span>
                          <span className="font-medium text-slate-900">× {nights}</span>
                        </div>
                        {totalRooms > 1 && (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-600">{totalRooms} {totalRooms === 1 ? t("publicReservation.room") : t("publicReservation.rooms")}</span>
                            <span className="font-medium text-slate-900">× {totalRooms}</span>
                          </div>
                        )}
                      </>
                    )}

                    <Separator />
                    {discountAmount > 0 && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Subtotal</span>
                          <span className="text-slate-700">
                            R$ {basePrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Desconto ({appliedCoupon?.coupon_code})</span>
                          <span className="font-semibold">
                            - R$ {discountAmount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <Separator />
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className="font-bold text-lg text-slate-900">{t("publicReservation.total")}</span>
                      <span className="font-bold text-2xl text-blue-600">
                        R$ {finalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}

                {/* Mensagem de indisponibilidade */}
                {selectedCategory && formData.checkinDate && formData.checkoutDate && !hasSufficientAvailability() && (
                  <Alert className="mb-4 border-red-200 bg-red-50">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <AlertTitle className="text-red-800 font-semibold">
                      {t("publicReservation.noAvailability", "Indisponível")}
                    </AlertTitle>
                    <AlertDescription className="text-red-700 text-sm mt-1">
                      {selectedCategories.length > 0
                        ? t("publicReservation.noAvailabilityForDates", "Não há disponibilidade suficiente para as datas informadas. Algumas categorias selecionadas não possuem quartos disponíveis no período solicitado.")
                        : availableRoomsCount === 0
                        ? t("publicReservation.noRoomsAvailableForDates", "Não há quartos disponíveis para as datas informadas. Por favor, selecione outras datas.")
                        : t("publicReservation.insufficientRoomsForDates", "Não há quartos suficientes disponíveis para as datas informadas. Disponível: {available}, Necessário: {required}. Por favor, selecione outras datas ou reduza a quantidade de quartos.", {
                            available: availableRoomsCount || 0,
                            required: requiredRooms,
                          })
                      }
                    </AlertDescription>
                  </Alert>
                )}

                {/* Ícone de Políticas - Minimalista */}
                {(establishmentPolicies || buildingPolicies) && (
                  <div className="flex items-center justify-center mt-4 mb-2">
                    <button
                      type="button"
                      onClick={() => setPoliciesDialogOpen(true)}
                      className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 transition-colors group"
                    >
                      <Info className="h-4 w-4 text-slate-500 group-hover:text-blue-600 transition-colors" />
                      <span className="underline decoration-dotted underline-offset-2">
                        {t("publicReservation.viewPolicies", "Ver políticas")}
                      </span>
                    </button>
                  </div>
                )}

                {/* CTA */}
                <Button
                  type="submit"
                  disabled={
                    isSubmitting || 
                    !selectedCategory || 
                    !formData.checkinDate || 
                    !formData.checkoutDate ||
                    !hasSufficientAvailability()
                  }
                  className="w-full h-14 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      {t("publicReservation.processing")}
                    </>
                  ) : (
                    <>
                      {t("publicReservation.reserveNow")}
                      <ChevronRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>

                <div className="text-xs text-center text-slate-500 space-y-2">
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>{t("publicReservation.immediateConfirmation")}</span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span>{t("publicReservation.noChargeNow")}</span>
                  </div>
                </div>
              </form>
            </Card>
          </div>
        </div>
      </div>

      {/* Galeria de Imagens */}
      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden [&>button]:hidden">
          {selectedCategoryForGallery && (
            <div className="relative">
              {/* Header */}
              <div className="p-6 border-b border-slate-200 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {(pmsLogoUrl || siteSettings?.logo_url) && (
                      <img
                        src={pmsLogoUrl || siteSettings?.logo_url || ""}
                        alt="Logo"
                        className="h-10 object-contain"
                      />
                    )}
                    <div>
                      <DialogTitle className="text-2xl font-bold text-slate-900">
                        {selectedCategoryForGallery.name}
                      </DialogTitle>
                      {selectedCategoryForGallery.display_photos && selectedCategoryForGallery.display_photos.length > 0 && (
                        <p className="text-sm text-slate-500 mt-1">
                          {currentImageIndex + 1} {t("common.of")} {selectedCategoryForGallery.display_photos.length} {t("publicReservation.galleryPhotos")}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setGalleryOpen(false)}
                    className="rounded-full hover:bg-slate-100"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              {/* Imagem Principal */}
              {selectedCategoryForGallery.display_photos && selectedCategoryForGallery.display_photos.length > 0 && (
                <div className="relative bg-slate-900">
                  <div className="relative h-[60vh] min-h-[400px] flex items-center justify-center">
                    <img
                      src={selectedCategoryForGallery.display_photos[currentImageIndex]}
                      alt={`${selectedCategoryForGallery.name} - Foto ${currentImageIndex + 1}`}
                      className="max-w-full max-h-full object-contain"
                    />
                    
                    {/* Navegação */}
                    {selectedCategoryForGallery.display_photos.length > 1 && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full shadow-lg h-12 w-12"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentImageIndex((prev) => 
                              prev === 0 
                                ? selectedCategoryForGallery.display_photos.length - 1 
                                : prev - 1
                            );
                          }}
                        >
                          <ChevronLeft className="w-6 h-6 text-slate-900" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full shadow-lg h-12 w-12"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCurrentImageIndex((prev) => 
                              prev === selectedCategoryForGallery.display_photos.length - 1 
                                ? 0 
                                : prev + 1
                            );
                          }}
                        >
                          <ChevronRight className="w-6 h-6 text-slate-900" />
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Thumbnails */}
                  {selectedCategoryForGallery.display_photos.length > 1 && (
                    <div className="p-4 bg-white border-t border-slate-200">
                      <div className="flex gap-2 overflow-x-auto pb-2">
                        {selectedCategoryForGallery.display_photos.map((photo: string, index: number) => (
                          <button
                            key={index}
                            onClick={() => setCurrentImageIndex(index)}
                            className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                              currentImageIndex === index
                                ? "border-blue-500 ring-2 ring-blue-500/20"
                                : "border-slate-200 hover:border-slate-300 opacity-70 hover:opacity-100"
                            }`}
                          >
                            <img
                              src={photo}
                              alt={`Thumbnail ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Políticas */}
      <Dialog open={policiesDialogOpen} onOpenChange={setPoliciesDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-slate-900">
              {t("publicReservation.policies", "Políticas")}
            </DialogTitle>
            <DialogDescription>
              {buildingPolicies
                ? buildingName 
                  ? `Políticas específicas do prédio ${buildingName}`
                  : "Políticas específicas do prédio"
                : "Políticas do estabelecimento"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 overflow-y-auto pr-2 flex-1 mt-4">
            {/* Políticas do Prédio (se houver) - Prioridade quando existe */}
            {buildingPolicies && (
              <>
                {/* Texto Livre das Políticas */}
                {buildingPolicies.policies_text && (
                  <Card className="p-4 border-l-4 border-l-blue-500">
                    <div className="flex items-start gap-3 mb-3">
                      <FileText className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">
                        {buildingName ? `Políticas do Prédio: ${buildingName}` : "Políticas do Prédio"}
                      </h3>
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-line">
                      {buildingPolicies.policies_text}
                    </div>
                  </Card>
                )}

                {/* Política de Cancelamento */}
                {buildingPolicies.cancellation && (
                  <Card className="p-4 border-l-4 border-l-blue-500">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">Política de Cancelamento</h3>
                    </div>
                    {buildingPolicies.cancellation.free_cancellation_days > 0 && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Cancelamento Gratuito:</strong> Até {buildingPolicies.cancellation.free_cancellation_days} dia(s) antes do check-in.
                      </p>
                    )}
                    {buildingPolicies.cancellation.cancellation_policy && (
                      <div className="text-sm text-slate-600 mb-2">
                        <strong>Política:</strong>
                        <p className="mt-1 whitespace-pre-line">{buildingPolicies.cancellation.cancellation_policy}</p>
                      </div>
                    )}
                    {buildingPolicies.cancellation.refund_policy && (
                      <div className="text-sm text-slate-600">
                        <strong>Reembolso:</strong>
                        <p className="mt-1 whitespace-pre-line">{buildingPolicies.cancellation.refund_policy}</p>
                      </div>
                    )}
                  </Card>
                )}

                {/* Política de Check-in/Check-out */}
                {buildingPolicies.checkin_checkout && (
                  <Card className="p-4 border-l-4 border-l-green-500">
                    <div className="flex items-start gap-3 mb-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">Check-in e Check-out</h3>
                    </div>
                    {buildingPolicies.checkin_checkout.early_checkin_available && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Check-in Antecipado:</strong> Disponível
                        {buildingPolicies.checkin_checkout.early_checkin_fee && ` - ${buildingPolicies.checkin_checkout.early_checkin_fee}`}
                      </p>
                    )}
                    {buildingPolicies.checkin_checkout.late_checkout_available && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Check-out Tardio:</strong> Disponível
                        {buildingPolicies.checkin_checkout.late_checkout_fee && ` - ${buildingPolicies.checkin_checkout.late_checkout_fee}`}
                      </p>
                    )}
                    {buildingPolicies.checkin_checkout.checkin_instructions && (
                      <div className="text-sm text-slate-600 mb-2">
                        <strong>Instruções de Check-in:</strong>
                        <p className="mt-1 whitespace-pre-line">{buildingPolicies.checkin_checkout.checkin_instructions}</p>
                      </div>
                    )}
                    {buildingPolicies.checkin_checkout.checkout_instructions && (
                      <div className="text-sm text-slate-600">
                        <strong>Instruções de Check-out:</strong>
                        <p className="mt-1 whitespace-pre-line">{buildingPolicies.checkin_checkout.checkout_instructions}</p>
                      </div>
                    )}
                  </Card>
                )}

                {/* Política de Animais */}
                {buildingPolicies.pets && buildingPolicies.pets.pets_allowed && (
                  <Card className="p-4 border-l-4 border-l-purple-500">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertCircle className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">Política de Animais</h3>
                    </div>
                    <p className="text-sm text-slate-700 mb-2">
                      <strong>Animais Permitidos:</strong> Sim
                      {buildingPolicies.pets.pet_fee && ` - ${buildingPolicies.pets.pet_fee}`}
                    </p>
                    {buildingPolicies.pets.pet_policy && (
                      <div className="text-sm text-slate-600">
                        <strong>Política:</strong>
                        <p className="mt-1 whitespace-pre-line">{buildingPolicies.pets.pet_policy}</p>
                      </div>
                    )}
                  </Card>
                )}

                {/* Política de Crianças */}
                {buildingPolicies.children && (
                  <Card className="p-4 border-l-4 border-l-orange-500">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">Política de Crianças</h3>
                    </div>
                    {buildingPolicies.children.children_policy && (
                      <div className="text-sm text-slate-600 mb-2">
                        <strong>Política:</strong>
                        <p className="mt-1 whitespace-pre-line">{buildingPolicies.children.children_policy}</p>
                      </div>
                    )}
                    {buildingPolicies.children.extra_bed_available && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Cama Extra:</strong> Disponível
                        {buildingPolicies.children.extra_bed_fee && ` - ${buildingPolicies.children.extra_bed_fee}`}
                      </p>
                    )}
                    {buildingPolicies.children.crib_available && (
                      <p className="text-sm text-slate-700">
                        <strong>Berço:</strong> Disponível
                        {buildingPolicies.children.crib_fee && ` - ${buildingPolicies.children.crib_fee}`}
                      </p>
                    )}
                  </Card>
                )}

                {/* Políticas Gerais */}
                {buildingPolicies.general && (
                  <Card className="p-4 border-l-4 border-l-slate-500">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertCircle className="h-5 w-5 text-slate-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">Políticas Gerais</h3>
                    </div>
                    {buildingPolicies.general.smoking_policy && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Política de Fumantes:</strong> {buildingPolicies.general.smoking_policy}
                      </p>
                    )}
                    {buildingPolicies.general.age_restriction && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Restrição de Idade:</strong> {buildingPolicies.general.age_restriction}
                      </p>
                    )}
                    {buildingPolicies.general.id_required && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Documento de Identidade:</strong> Obrigatório no check-in
                      </p>
                    )}
                    {buildingPolicies.general.special_requests && (
                      <div className="text-sm text-slate-600">
                        <strong>Solicitações Especiais:</strong>
                        <p className="mt-1 whitespace-pre-line">{buildingPolicies.general.special_requests}</p>
                      </div>
                    )}
                  </Card>
                )}
              </>
            )}

            {/* Políticas do Estabelecimento - Apenas se NÃO houver prédio */}
            {establishmentPolicies && !buildingPolicies && (
              <>
                {/* Texto Livre das Políticas */}
                {establishmentPolicies.policies_text && (
                  <Card className="p-4 border-l-4 border-l-indigo-500">
                    <div className="flex items-start gap-3 mb-3">
                      <FileText className="h-5 w-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">Políticas do Estabelecimento</h3>
                    </div>
                    <div className="text-sm text-slate-700 whitespace-pre-line">
                      {establishmentPolicies.policies_text}
                    </div>
                  </Card>
                )}

                {/* Política de Cancelamento */}
                {establishmentPolicies.cancellation && (
                  <Card className="p-4 border-l-4 border-l-blue-500">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">Política de Cancelamento</h3>
                    </div>
                    {establishmentPolicies.cancellation.free_cancellation_days > 0 && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Cancelamento Gratuito:</strong> Até {establishmentPolicies.cancellation.free_cancellation_days} dia(s) antes do check-in.
                      </p>
                    )}
                    {establishmentPolicies.cancellation.cancellation_policy && (
                      <div className="text-sm text-slate-600 mb-2">
                        <strong>Política:</strong>
                        <p className="mt-1 whitespace-pre-line">{establishmentPolicies.cancellation.cancellation_policy}</p>
                      </div>
                    )}
                    {establishmentPolicies.cancellation.refund_policy && (
                      <div className="text-sm text-slate-600">
                        <strong>Reembolso:</strong>
                        <p className="mt-1 whitespace-pre-line">{establishmentPolicies.cancellation.refund_policy}</p>
                      </div>
                    )}
                  </Card>
                )}

                {/* Política de Check-in/Check-out */}
                {establishmentPolicies.checkin_checkout && (
                  <Card className="p-4 border-l-4 border-l-green-500">
                    <div className="flex items-start gap-3 mb-3">
                      <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">Check-in e Check-out</h3>
                    </div>
                    {establishmentPolicies.checkin_checkout.early_checkin_available && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Check-in Antecipado:</strong> Disponível
                        {establishmentPolicies.checkin_checkout.early_checkin_fee && ` - ${establishmentPolicies.checkin_checkout.early_checkin_fee}`}
                      </p>
                    )}
                    {establishmentPolicies.checkin_checkout.late_checkout_available && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Check-out Tardio:</strong> Disponível
                        {establishmentPolicies.checkin_checkout.late_checkout_fee && ` - ${establishmentPolicies.checkin_checkout.late_checkout_fee}`}
                      </p>
                    )}
                    {establishmentPolicies.checkin_checkout.checkin_instructions && (
                      <div className="text-sm text-slate-600 mb-2">
                        <strong>Instruções de Check-in:</strong>
                        <p className="mt-1 whitespace-pre-line">{establishmentPolicies.checkin_checkout.checkin_instructions}</p>
                      </div>
                    )}
                    {establishmentPolicies.checkin_checkout.checkout_instructions && (
                      <div className="text-sm text-slate-600">
                        <strong>Instruções de Check-out:</strong>
                        <p className="mt-1 whitespace-pre-line">{establishmentPolicies.checkin_checkout.checkout_instructions}</p>
                      </div>
                    )}
                  </Card>
                )}

                {/* Política de Animais */}
                {establishmentPolicies.pets && establishmentPolicies.pets.pets_allowed && (
                  <Card className="p-4 border-l-4 border-l-purple-500">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertCircle className="h-5 w-5 text-purple-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">Política de Animais</h3>
                    </div>
                    <p className="text-sm text-slate-700 mb-2">
                      <strong>Animais Permitidos:</strong> Sim
                      {establishmentPolicies.pets.pet_fee && ` - ${establishmentPolicies.pets.pet_fee}`}
                    </p>
                    {establishmentPolicies.pets.pet_policy && (
                      <div className="text-sm text-slate-600">
                        <strong>Política:</strong>
                        <p className="mt-1 whitespace-pre-line">{establishmentPolicies.pets.pet_policy}</p>
                      </div>
                    )}
                  </Card>
                )}

                {/* Política de Crianças */}
                {establishmentPolicies.children && (
                  <Card className="p-4 border-l-4 border-l-orange-500">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">Política de Crianças</h3>
                    </div>
                    {establishmentPolicies.children.children_policy && (
                      <div className="text-sm text-slate-600 mb-2">
                        <strong>Política:</strong>
                        <p className="mt-1 whitespace-pre-line">{establishmentPolicies.children.children_policy}</p>
                      </div>
                    )}
                    {establishmentPolicies.children.extra_bed_available && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Cama Extra:</strong> Disponível
                        {establishmentPolicies.children.extra_bed_fee && ` - ${establishmentPolicies.children.extra_bed_fee}`}
                      </p>
                    )}
                    {establishmentPolicies.children.crib_available && (
                      <p className="text-sm text-slate-700">
                        <strong>Berço:</strong> Disponível
                        {establishmentPolicies.children.crib_fee && ` - ${establishmentPolicies.children.crib_fee}`}
                      </p>
                    )}
                  </Card>
                )}

                {/* Políticas Gerais */}
                {establishmentPolicies.general && (
                  <Card className="p-4 border-l-4 border-l-slate-500">
                    <div className="flex items-start gap-3 mb-3">
                      <AlertCircle className="h-5 w-5 text-slate-600 flex-shrink-0 mt-0.5" />
                      <h3 className="font-semibold text-slate-900">Políticas Gerais</h3>
                    </div>
                    {establishmentPolicies.general.smoking_policy && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Política de Fumantes:</strong> {establishmentPolicies.general.smoking_policy}
                      </p>
                    )}
                    {establishmentPolicies.general.age_restriction && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Restrição de Idade:</strong> {establishmentPolicies.general.age_restriction}
                      </p>
                    )}
                    {establishmentPolicies.general.id_required && (
                      <p className="text-sm text-slate-700 mb-2">
                        <strong>Documento de Identidade:</strong> Obrigatório no check-in
                      </p>
                    )}
                    {establishmentPolicies.general.special_requests && (
                      <div className="text-sm text-slate-600">
                        <strong>Solicitações Especiais:</strong>
                        <p className="mt-1 whitespace-pre-line">{establishmentPolicies.general.special_requests}</p>
                      </div>
                    )}
                  </Card>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PublicReservation;
