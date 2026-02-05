import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, MapPin, Phone, Mail, Wifi, Car, UtensilsCrossed, Waves, Wind, Tv, Coffee, Bed, Users, Calendar, DollarSign, AlertCircle, MessageCircle, Star, ChevronRight, Sparkles, ChevronLeft, X, ImageIcon, Home, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [selectedCategoryForGallery, setSelectedCategoryForGallery] = useState<any>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    if (establishmentSlug) {
      loadData();
    }
  }, [establishmentSlug]);

  // Calcular preços para todas as categorias quando dados mudarem
  useEffect(() => {
    if (categories.length > 0 && establishment?.id) {
      const calculateCategoryPrices = async () => {
        setCalculatingPrice(true);
        try {
          const adults = parseInt(formData.adults) || 1;
          const children = parseInt(formData.children) || 0;
          const prices: Record<string, number> = {};

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
                let categoryTotal = 0;
                const basePrice = Number(category.base_price || 0);

                for (let i = 0; i < nights; i++) {
                  const currentDate = new Date(checkin);
                  currentDate.setDate(currentDate.getDate() + i);
                  const dateStr = format(currentDate, "yyyy-MM-dd");

                  try {
                    const { data, error } = await supabase.rpc("calculate_rate_price", {
                      p_establishment_id: establishment.id,
                      p_category_id: category.id,
                      p_pricing_plan_id: publicPricingPlanId || null,
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

                prices[category.id] = categoryTotal;
              }
            }
          } else {
            // Se não há datas, calcular preço para hoje usando o plano tarifário
            const todayStr = format(new Date(), "yyyy-MM-dd");
            
            for (const category of categories) {
              const basePrice = Number(category.base_price || 0);
              
              try {
                const { data, error } = await supabase.rpc("calculate_rate_price", {
                  p_establishment_id: establishment.id,
                  p_category_id: category.id,
                  p_pricing_plan_id: publicPricingPlanId || null,
                  p_date: todayStr,
                  p_adults: adults,
                  p_children: children,
                });

                if (error) {
                  prices[category.id] = basePrice;
                } else {
                  const price = Number(data || 0);
                  prices[category.id] = price > 0 ? price : basePrice;
                }
              } catch (error) {
                prices[category.id] = basePrice;
              }
            }
          }

          setCategoryPrices(prices);

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
    formData.checkinDate,
    formData.checkoutDate,
    formData.adults,
    formData.children,
  ]);

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

  const handleCategoryChange = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setSelectedRoom(null); // Resetar quarto selecionado ao mudar categoria
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

    if (new Date(formData.checkinDate) >= new Date(formData.checkoutDate)) {
      toast.error(t("publicReservation.errors.invalidDates"));
      return;
    }

    if (!formData.firstName || !formData.lastName || !formData.email) {
      toast.error(t("publicReservation.errors.fillRequiredFields"));
      return;
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
              first_name: formData.firstName,
              last_name: formData.lastName,
              email: formData.email,
              phone: formData.phone || null,
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

      // Criar orçamento
      const { data: quote, error: quoteError } = await supabase
        .from("quotes")
        .insert({
          establishment_id: establishment.id,
          client_id: clientId,
          guest_name: `${formData.firstName} ${formData.lastName}`,
          guest_email: formData.email,
          guest_phone: formData.phone || null,
          category_id: selectedCategory,
          room_id: selectedRoom || null,
          checkin_date: formData.checkinDate,
          checkout_date: formData.checkoutDate,
          adults: parseInt(formData.adults) || 1,
          children: parseInt(formData.children) || 0,
          total_amount: calculatedPrice || 0,
          status: "pending",
          notes: formData.notes || null,
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
          amount: (calculatedPrice || 0) * 100, // Converter para centavos
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
    const cleaned = value.replace(/\D/g, "");
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2})$/);
    if (match) {
      return [match[1], match[2], match[3], match[4]].filter(Boolean).join(".").replace(/\.$/, "") + (match[4] ? `-${match[4]}` : "");
    }
    return value;
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

  const finalPrice = calculatedPrice || 0;
  const nights = formData.checkinDate && formData.checkoutDate
    ? Math.ceil(
        (new Date(formData.checkoutDate).getTime() - new Date(formData.checkinDate).getTime()) / (1000 * 60 * 60 * 24)
      )
    : 0;
  const pricePerNight = nights > 0 ? finalPrice / nights : calculatedPrice || 0;

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
                                <div className="flex items-center gap-3 mb-2">
                                  <h3 className="text-2xl font-bold text-slate-900">
                                    {category.name}
                                  </h3>
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

                          {/* Preço */}
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
                        min={format(new Date(), "yyyy-MM-dd")}
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
                        min={formData.checkinDate || format(new Date(), "yyyy-MM-dd")}
                        className="h-12 border-2 border-slate-200 focus:border-blue-500 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Hóspedes */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="adults" className="text-sm font-semibold text-slate-700 mb-2 block">
                        {t("publicReservation.adults")}
                      </Label>
                      <Select value={formData.adults} onValueChange={(value) => setFormData({ ...formData, adults: value })}>
                        <SelectTrigger className="h-12 border-2 border-slate-200 focus:border-blue-500 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6].map((num) => (
                            <SelectItem key={num} value={num.toString()}>
                              {num} {num === 1 ? t("publicReservation.adult") : t("publicReservation.adultsPlural")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="children" className="text-sm font-semibold text-slate-700 mb-2 block">
                        {t("publicReservation.children")}
                      </Label>
                      <Select value={formData.children} onValueChange={(value) => setFormData({ ...formData, children: value })}>
                        <SelectTrigger className="h-12 border-2 border-slate-200 focus:border-blue-500 rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[0, 1, 2, 3, 4].map((num) => (
                            <SelectItem key={num} value={num.toString()}>
                              {num} {num === 1 ? t("publicReservation.child") : t("publicReservation.childrenPlural")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
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
                {selectedCategory && calculatedPrice && formData.checkinDate && formData.checkoutDate && (
                  <div className="bg-slate-50 rounded-lg p-4 space-y-3 border-2 border-slate-200">
                    <h4 className="font-semibold text-slate-900 mb-3">{t("publicReservation.reservationSummary")}</h4>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">{t("publicReservation.pricePerNight")}</span>
                      <span className="font-medium text-slate-900">
                        R$ {pricePerNight.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">{nights} {nights === 1 ? t("publicReservation.night") : t("publicReservation.nights")}</span>
                      <span className="font-medium text-slate-900">× {nights}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between">
                      <span className="font-bold text-lg text-slate-900">{t("publicReservation.total")}</span>
                      <span className="font-bold text-2xl text-blue-600">
                        R$ {finalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}

                {/* CTA */}
                <Button
                  type="submit"
                  disabled={isSubmitting || !selectedCategory || !formData.checkinDate || !formData.checkoutDate}
                  className="w-full h-14 text-lg font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg hover:shadow-xl transition-all"
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
    </div>
  );
};

export default PublicReservation;
