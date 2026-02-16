import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  MapPin, 
  Calendar, 
  Users, 
  ChevronLeft,
  ChevronRight,
  Camera,
  Phone,
  Mail,
  CheckCircle2,
  ExternalLink,
  Key,
  User,
  CreditCard,
  Building2,
  FileText,
  Instagram,
  Facebook,
  Twitter,
  Youtube,
  Linkedin,
  Globe2,
  X
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useTranslation } from "react-i18next";
import { useSiteSettings } from "@/hooks/useSiteSettings";

type BookingThemeKey = "default" | "modern" | "luxury" | "minimal" | "dark" | "travel" | "airbnb";

const DETAIL_THEME_CONFIGS: Record<BookingThemeKey, {
  pageBg: string;
  headerBg: string;
  headerText: string;
  headerSubtitle: string;
  headerBorder?: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  heroImageOverlay: string;
  summaryBg: string;
  summaryBorder: string;
  primaryButton: string;
  primaryButtonHover: string;
  secondaryButton: string;
  secondaryButtonHover: string;
  iconButton: string;
  iconButtonHover: string;
  footerBg: string;
  footerBorder: string;
  footerText: string;
}> = {
  default: {
    pageBg: "bg-slate-50",
    headerBg: "bg-white/90 backdrop-blur-md",
    headerText: "text-slate-900",
    headerSubtitle: "text-slate-500",
    headerBorder: "border-b border-slate-200/80",
    textPrimary: "text-slate-900",
    textSecondary: "text-slate-700",
    textMuted: "text-slate-500",
    heroImageOverlay: "bg-gradient-to-t from-black/60 via-black/30 to-transparent",
    summaryBg: "bg-white",
    summaryBorder: "border border-slate-200",
    primaryButton: "bg-blue-600 text-white",
    primaryButtonHover: "hover:bg-blue-700 hover:shadow-lg",
    secondaryButton: "bg-white/90 text-slate-900 border border-slate-200",
    secondaryButtonHover: "hover:bg-white hover:border-blue-200",
    iconButton: "bg-white/90 text-slate-900 border border-slate-200",
    iconButtonHover: "hover:bg-white hover:border-blue-300",
    footerBg: "bg-white",
    footerBorder: "border-t border-slate-200",
    footerText: "text-slate-600",
  },
  modern: {
    pageBg: "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950",
    headerBg: "bg-slate-900/80 backdrop-blur-md",
    headerText: "text-white",
    headerSubtitle: "text-slate-300",
    headerBorder: "border-b border-slate-700/50",
    textPrimary: "text-white",
    textSecondary: "text-slate-200",
    textMuted: "text-slate-400",
    heroImageOverlay: "bg-gradient-to-t from-black/80 via-black/40 to-transparent",
    summaryBg: "bg-slate-800/95 backdrop-blur-xl",
    summaryBorder: "border border-slate-700",
    primaryButton: "bg-amber-500 text-slate-900",
    primaryButtonHover: "hover:bg-amber-600 hover:shadow-xl hover:shadow-amber-500/30",
    secondaryButton: "bg-slate-800/80 text-slate-100 border border-slate-600",
    secondaryButtonHover: "hover:bg-slate-700/80 hover:border-amber-400/60",
    iconButton: "bg-slate-800/80 text-slate-100 border border-slate-600",
    iconButtonHover: "hover:bg-slate-700/80 hover:border-amber-400/60",
    footerBg: "bg-slate-900",
    footerBorder: "border-t border-slate-700",
    footerText: "text-slate-300",
  },
  luxury: {
    pageBg: "bg-gradient-to-br from-amber-950 via-amber-900 to-amber-950",
    headerBg: "bg-amber-950/90 backdrop-blur-md",
    headerText: "text-amber-50",
    headerSubtitle: "text-amber-200",
    headerBorder: "border-b border-amber-800/50",
    textPrimary: "text-amber-50",
    textSecondary: "text-amber-100",
    textMuted: "text-amber-200",
    heroImageOverlay: "bg-gradient-to-t from-black/90 via-black/60 to-transparent",
    summaryBg: "bg-amber-900/95 backdrop-blur-xl",
    summaryBorder: "border border-amber-800",
    primaryButton: "bg-amber-600 text-amber-950",
    primaryButtonHover: "hover:bg-amber-500 hover:shadow-xl hover:shadow-amber-500/40",
    secondaryButton: "bg-amber-900/80 text-amber-50 border border-amber-700",
    secondaryButtonHover: "hover:bg-amber-800/80 hover:border-amber-500",
    iconButton: "bg-amber-900/80 text-amber-50 border border-amber-700",
    iconButtonHover: "hover:bg-amber-800/80 hover:border-amber-500",
    footerBg: "bg-amber-950",
    footerBorder: "border-t border-amber-800",
    footerText: "text-amber-200",
  },
  minimal: {
    pageBg: "bg-white",
    headerBg: "bg-white",
    headerText: "text-slate-900",
    headerSubtitle: "text-slate-500",
    headerBorder: "border-b border-slate-200",
    textPrimary: "text-slate-900",
    textSecondary: "text-slate-700",
    textMuted: "text-slate-500",
    heroImageOverlay: "bg-gradient-to-t from-black/40 to-transparent",
    summaryBg: "bg-white",
    summaryBorder: "border border-slate-200",
    primaryButton: "bg-slate-900 text-white",
    primaryButtonHover: "hover:bg-slate-800 hover:shadow-lg",
    secondaryButton: "bg-white text-slate-900 border border-slate-300",
    secondaryButtonHover: "hover:bg-slate-50 hover:border-slate-400",
    iconButton: "bg-white text-slate-900 border border-slate-300",
    iconButtonHover: "hover:bg-slate-50 hover:border-slate-400",
    footerBg: "bg-white",
    footerBorder: "border-t border-slate-200",
    footerText: "text-slate-600",
  },
  dark: {
    pageBg: "bg-slate-950",
    headerBg: "bg-slate-950/90 backdrop-blur-md",
    headerText: "text-white",
    headerSubtitle: "text-slate-400",
    headerBorder: "border-b border-slate-800",
    textPrimary: "text-white",
    textSecondary: "text-slate-300",
    textMuted: "text-slate-500",
    heroImageOverlay: "bg-gradient-to-t from-black/80 via-black/50 to-transparent",
    summaryBg: "bg-slate-900/95 backdrop-blur-xl",
    summaryBorder: "border border-slate-800",
    primaryButton: "bg-blue-600 text-white",
    primaryButtonHover: "hover:bg-blue-700 hover:shadow-xl hover:shadow-blue-500/30",
    secondaryButton: "bg-slate-800/80 text-slate-100 border border-slate-700",
    secondaryButtonHover: "hover:bg-slate-700/80 hover:border-blue-400/60",
    iconButton: "bg-slate-800/80 text-slate-100 border border-slate-700",
    iconButtonHover: "hover:bg-slate-700/80 hover:border-blue-400/60",
    footerBg: "bg-slate-950",
    footerBorder: "border-t border-slate-800",
    footerText: "text-slate-400",
  },
  travel: {
    // Travel Landing Page - Estilo Booking.com (mesmo da CategoryDetailPage)
    pageBg: "bg-slate-50",
    headerBg: "bg-[#003580] text-white",
    headerText: "text-white",
    headerSubtitle: "text-blue-100",
    headerBorder: "border-b border-[#00224d]",
    textPrimary: "text-slate-900",
    textSecondary: "text-slate-700",
    textMuted: "text-slate-500",
    heroImageOverlay: "bg-gradient-to-t from-black/65 via-black/25 to-transparent",
    summaryBg: "bg-white",
    summaryBorder: "border border-slate-200",
    primaryButton: "bg-[#0071c2] text-white",
    primaryButtonHover: "hover:bg-[#005fa3] hover:shadow-lg hover:shadow-[#0071c2]/30",
    secondaryButton: "bg-white text-[#0071c2] border border-[#0071c2]",
    secondaryButtonHover: "hover:bg-blue-50",
    iconButton: "bg-white text-slate-700 border border-slate-200",
    iconButtonHover: "hover:bg-slate-50 hover:border-[#0071c2]/60",
    footerBg: "bg-[#003580]",
    footerBorder: "border-t border-[#00224d]",
    footerText: "text-blue-100",
  },
  airbnb: {
    pageBg: "bg-neutral-50",
    headerBg: "bg-white",
    headerText: "text-neutral-900",
    headerSubtitle: "text-neutral-600",
    headerBorder: "border-b border-neutral-200",
    textPrimary: "text-neutral-900",
    textSecondary: "text-neutral-700",
    textMuted: "text-neutral-500",
    heroImageOverlay: "bg-gradient-to-t from-black/50 via-black/15 to-transparent",
    summaryBg: "bg-white",
    summaryBorder: "border border-neutral-200",
    primaryButton: "bg-[#FF5A5F] text-white font-semibold",
    primaryButtonHover: "hover:bg-[#E04550] hover:shadow-lg hover:shadow-[#FF5A5F]/25",
    secondaryButton: "bg-white text-neutral-900 border-2 border-neutral-900",
    secondaryButtonHover: "hover:bg-neutral-50",
    iconButton: "bg-white text-neutral-900 border border-neutral-200",
    iconButtonHover: "hover:bg-neutral-50 hover:border-[#FF5A5F]/60",
    footerBg: "bg-neutral-100",
    footerBorder: "border-t border-neutral-200",
    footerText: "text-neutral-600",
  },
};

export default function ReservationDetailPage() {
  const { reservationId, companySlug } = useParams<{ reservationId: string; companySlug?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settings: siteSettings, isLoading: isLoadingSiteSettings } = useSiteSettings();
  const [reservation, setReservation] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);
  const [establishment, setEstablishment] = useState<any>(null);
  const [category, setCategory] = useState<any>(null);
  const [hotelSettings, setHotelSettings] = useState<any>(null);
  const [building, setBuilding] = useState<any>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryType, setGalleryType] = useState<"category" | "establishment">("category");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buscar empresa do siteSettings (mesma lógica do motor de reservas e detalhes da categoria)
  const companyFromSettings = useMemo(() => {
    if (!siteSettings || !siteSettings.companies) return null;
    
    // Se houver companySlug, buscar por slug
    if (companySlug) {
      const found = siteSettings.companies.find((c: any) => c.booking_engine_slug === companySlug);
      if (found) return found;
    }
    
    // Se não houver companySlug, tentar buscar por domínio personalizado
    const currentDomain = typeof window !== "undefined" ? window.location.hostname : undefined;
    if (currentDomain) {
      const found = siteSettings.companies.find((c: any) => {
        if (!c.booking_engine_custom_domain) return false;
        const normalizedConfig = c.booking_engine_custom_domain
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .split("/")[0];
        const normalizedHost = currentDomain
          .toLowerCase()
          .replace(/^www\./, "");
        return normalizedConfig === normalizedHost;
      });
      if (found) return found;
    }
    
    return null;
  }, [siteSettings, companySlug]);

  // Usar empresa do siteSettings ou da reserva (priorizar siteSettings)
  // Mas se a empresa da reserva tiver um ID que corresponde a uma empresa do siteSettings, usar a do siteSettings
  const finalCompany = useMemo(() => {
    // Se temos empresa do siteSettings, usar ela (tem prioridade)
    if (companyFromSettings) {
      console.log("[ReservationDetailPage] Usando empresa do siteSettings:", {
        id: companyFromSettings.id,
        name: companyFromSettings.name,
        theme: companyFromSettings.booking_engine_theme
      });
      return companyFromSettings;
    }
    
    // Se temos empresa da reserva, usar ela
    if (company) {
      // Mas tentar encontrar no siteSettings pelo ID para ter dados atualizados
      if (siteSettings && siteSettings.companies && company.id) {
        const foundInSettings = siteSettings.companies.find((c: any) => c.id === company.id);
        if (foundInSettings) {
          console.log("[ReservationDetailPage] Empresa encontrada no siteSettings pelo ID:", {
            id: foundInSettings.id,
            name: foundInSettings.name,
            theme: foundInSettings.booking_engine_theme
          });
          return foundInSettings; // Usar a do siteSettings que tem dados mais atualizados
        }
      }
      console.log("[ReservationDetailPage] Usando empresa da reserva:", {
        id: company.id,
        name: company.name,
        theme: company.booking_engine_theme
      });
      return company;
    }
    
    console.log("[ReservationDetailPage] Nenhuma empresa encontrada");
    return null;
  }, [companyFromSettings, company, siteSettings]);

  // Buscar tema da empresa (mesma lógica do motor de reservas e detalhes da categoria)
  const themeKey: BookingThemeKey = useMemo(() => {
    // Priorizar tema da empresa, depois do hotel_settings
    const key =
      (finalCompany?.booking_engine_theme as BookingThemeKey) ||
      (hotelSettings?.booking_engine_theme as BookingThemeKey) ||
      "default";
    const validKeys: BookingThemeKey[] = ["default", "modern", "luxury", "minimal", "dark", "travel", "airbnb"];
    const validKey = validKeys.includes(key) ? key : "default";
    
    // Debug: log para verificar qual tema está sendo usado
    if (finalCompany) {
      console.log("[ReservationDetailPage] Tema detectado:", {
        companyId: finalCompany.id,
        companyName: finalCompany.name,
        companyTheme: finalCompany.booking_engine_theme,
        hotelTheme: hotelSettings?.booking_engine_theme,
        finalTheme: validKey
      });
    }
    
    return validKey;
  }, [finalCompany, hotelSettings]);

  const theme = useMemo(() => DETAIL_THEME_CONFIGS[themeKey], [themeKey]);

  useEffect(() => {
    const loadReservation = async () => {
      if (!reservationId) {
        setError("ID da reserva não fornecido");
        setLoading(false);
        return;
      }

      try {
        // Buscar reserva com dados do cliente, categoria, estabelecimento e empresa
        const { data: reservationData, error: reservationError } = await supabase
          .from("reservations")
          .select(`
            *,
            clients:client_id (
              id,
              full_name,
              email,
              phone
            ),
            room_categories:category_id (
              id,
              name,
              establishment_id,
              display_photos,
              display_description,
              display_features,
              building_id,
              establishments:establishment_id (
                id,
                name,
                company_id,
                companies:company_id (
                  id,
                  name,
                  booking_engine_theme,
                  booking_engine_title,
                  booking_engine_subtitle,
                  booking_engine_logo,
                  booking_engine_favicon,
                  booking_engine_slug,
                  booking_engine_custom_domain
                )
              )
            )
          `)
          .eq("id", reservationId)
          .single();

        if (reservationError) throw reservationError;
        if (!reservationData) {
          setError("Reserva não encontrada");
          setLoading(false);
          return;
        }

        setReservation(reservationData);
        setClient(reservationData.clients);
        setCategory(reservationData.room_categories);
        
        // Extrair estabelecimento e empresa
        const categoryData = reservationData.room_categories;
        if (categoryData) {
          const establishmentData = categoryData.establishments;
          if (establishmentData) {
            setEstablishment(establishmentData);
            const companyData = establishmentData.companies;
            if (companyData) {
              console.log("[ReservationDetailPage] Empresa carregada da reserva:", {
                id: companyData.id,
                name: companyData.name,
                theme: companyData.booking_engine_theme
              });
              setCompany(companyData);
            }

            // Buscar hotel_settings do estabelecimento (mesma lógica do motor de reservas)
            if (establishmentData.id) {
              const { data: settingsData } = await supabase
                .from("hotel_settings" as any)
                .select("*")
                .eq("establishment_id", establishmentData.id)
                .maybeSingle();
              
              if (settingsData) {
                setHotelSettings(settingsData);
              }
            }

            // Se a categoria estiver associada a um prédio, buscar endereço do prédio
            if (categoryData.building_id) {
              const { data: buildingData, error: buildingError } = await supabase
                .from("buildings")
                .select("id, name, street, number, neighborhood, city, state, country, zip_code")
                .eq("id", categoryData.building_id)
                .maybeSingle();

              if (!buildingError && buildingData) {
                setBuilding(buildingData);
              }
            }
          }
        }

        setLoading(false);
      } catch (err: any) {
        console.error("Erro ao carregar reserva:", err);
        setError(err.message || "Erro ao carregar reserva");
        setLoading(false);
      }
    };

    loadReservation();
  }, [reservationId]);

  // Atualizar título da página - DEVE estar ANTES dos returns antecipados
  useEffect(() => {
    if (!finalCompany || !reservation) return;
    
    const motorTitle = finalCompany?.booking_engine_title || finalCompany?.name || "Motor de Reservas";
    const motorSubtitle = finalCompany?.booking_engine_subtitle || "";
    const reservationCode = reservation?.reservation_code || "";
    
    let baseTitle = "";
    if (motorTitle && motorTitle !== "Motor de Reservas") {
      if (motorSubtitle) {
        baseTitle = reservationCode 
          ? `Reserva ${reservationCode} - ${motorTitle} - ${motorSubtitle}`
          : `${motorTitle} - ${motorSubtitle}`;
      } else {
        baseTitle = reservationCode 
          ? `Reserva ${reservationCode} - ${motorTitle}`
          : motorTitle;
      }
    } else if (finalCompany?.name) {
      if (motorSubtitle) {
        baseTitle = reservationCode 
          ? `Reserva ${reservationCode} - ${finalCompany.name} - ${motorSubtitle}`
          : `${finalCompany.name} - ${motorSubtitle}`;
      } else {
        baseTitle = reservationCode 
          ? `Reserva ${reservationCode} - ${finalCompany.name}`
          : `${finalCompany.name} - Motor de Reservas`;
      }
    } else {
      baseTitle = reservationCode 
        ? `Reserva ${reservationCode} - Motor de Reservas`
        : "Motor de Reservas";
    }
    
    document.title = baseTitle;
  }, [finalCompany, reservation]);

  // Logo, título e subtítulo do motor (mesma lógica da CategoryDetailPage)
  const motorTitle = finalCompany?.booking_engine_title || finalCompany?.name || "Motor de Reservas";
  const motorSubtitle = finalCompany?.booking_engine_subtitle || "";
  const motorLogo = finalCompany?.booking_engine_logo || null;

  // Dados de contato e redes sociais (mesma lógica do motor principal e CategoryDetailPage)
  const contactCnpj = finalCompany?.booking_engine_contact_cnpj || (hotelSettings as any)?.establishment_cnpj || "";
  const contactPhone = finalCompany?.booking_engine_contact_phone || (hotelSettings as any)?.phone || "";
  const contactWhatsappDdi = finalCompany?.booking_engine_contact_whatsapp_ddi || (hotelSettings as any)?.whatsapp_ddi || "";
  const contactWhatsappNumber = finalCompany?.booking_engine_contact_whatsapp_number || (hotelSettings as any)?.whatsapp_number || "";
  const contactEmail = finalCompany?.booking_engine_contact_email || (hotelSettings as any)?.email || "";

  const socialInstagram = finalCompany?.booking_engine_social_instagram || null;
  const socialFacebook = finalCompany?.booking_engine_social_facebook || null;
  const socialTwitter = finalCompany?.booking_engine_social_twitter || null;
  const socialYoutube = finalCompany?.booking_engine_social_youtube || null;
  const socialLinkedin = finalCompany?.booking_engine_social_linkedin || null;
  const socialWebsite = finalCompany?.booking_engine_social_website || null;
  const socialWhatsapp = finalCompany?.booking_engine_social_whatsapp || null;

  // Fotos da categoria
  const categoryPhotos = useMemo(() => {
    if (!category) return [];
    return category.display_photos && Array.isArray(category.display_photos) && category.display_photos.length > 0
      ? category.display_photos
      : ["https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1920&q=80"];
  }, [category]);

  // Fotos do estabelecimento
  const establishmentPhotos = useMemo(() => {
    if (!hotelSettings?.establishment_photos) return [];
    return Array.isArray(hotelSettings.establishment_photos) 
      ? hotelSettings.establishment_photos 
      : [];
  }, [hotelSettings]);

  // Funções de navegação do carousel
  const nextImage = () => {
    const photos = galleryType === "category" ? categoryPhotos : establishmentPhotos;
    setCurrentImageIndex((prev) => (prev + 1) % photos.length);
  };

  const prevImage = () => {
    const photos = galleryType === "category" ? categoryPhotos : establishmentPhotos;
    setCurrentImageIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  if (loading || isLoadingSiteSettings) {
    return (
      <div className={`min-h-screen ${theme.pageBg} flex items-center justify-center`}>
        <div className="text-center">
          <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${theme.primaryButton} mx-auto mb-4`}></div>
          <p className={theme.textSecondary}>Carregando reserva...</p>
        </div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className={`min-h-screen ${theme.pageBg} flex items-center justify-center p-4`}>
        <Card className={`${theme.summaryBg} ${theme.summaryBorder} p-8 max-w-md w-full`}>
          <div className="text-center">
            <p className={`${theme.textPrimary} text-lg mb-4`}>
              {error || "Reserva não encontrada"}
            </p>
            <Button
              onClick={() => navigate(-1)}
              className={`${theme.secondaryButton} ${theme.secondaryButtonHover}`}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const checkinDate = reservation.checkin_date ? format(new Date(reservation.checkin_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "";
  const checkoutDate = reservation.checkout_date ? format(new Date(reservation.checkout_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "";
  const nights = reservation.checkin_date && reservation.checkout_date 
    ? differenceInDays(new Date(reservation.checkout_date), new Date(reservation.checkin_date))
    : 0;

  return (
    <div className={`min-h-screen ${theme.pageBg}`}>
      {/* Header - mesmo estilo da CategoryDetailPage */}
      <header className={`${theme.headerBg} ${theme.headerText} sticky top-0 z-50 ${theme.headerBorder || ""}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {motorLogo && (
                <div className={`h-10 w-10 rounded-full shadow-sm flex items-center justify-center overflow-hidden ring-1 ${
                  themeKey === "travel" ? "bg-white/20 ring-white/20" : "bg-white/90 ring-black/5"
                }`}>
                  <img
                    src={motorLogo}
                    alt="Logo"
                    className="h-8 w-8 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              )}
              <div className="flex flex-col">
                <span className={`text-lg font-semibold tracking-tight ${
                  themeKey === "travel" ? "text-white" : theme.textPrimary
                }`}>
                  {motorTitle}
                </span>
                {motorSubtitle && (
                  <span className={`text-xs ${
                    themeKey === "travel" ? "text-blue-100" : theme.headerSubtitle
                  }`}>
                    {motorSubtitle}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <LanguageSelector />
              <Button
                variant="outline"
                className={`${theme.secondaryButton} ${theme.secondaryButtonHover} border rounded-full px-4 py-2 text-sm font-medium`}
                onClick={() => {
                  if (finalCompany?.booking_engine_custom_domain) {
                    window.location.href = `https://${finalCompany.booking_engine_custom_domain}`;
                  } else if (finalCompany?.booking_engine_slug) {
                    navigate(`/motor/${finalCompany.booking_engine_slug}`);
                  } else {
                    navigate(-1);
                  }
                }}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Image Carousel - Fotos da Categoria */}
      {category && categoryPhotos.length > 0 && (
        <div className="relative w-full h-[500px] md:h-[600px] overflow-hidden bg-slate-100">
          <img
            src={categoryPhotos[currentImageIndex]}
            alt={category.name}
            className="w-full h-full object-cover"
          />
          <div className={`absolute inset-0 ${theme.heroImageOverlay}`} />

          {/* Navigation Buttons */}
          {categoryPhotos.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className={`absolute left-4 top-1/2 -translate-y-1/2 rounded-full p-2 shadow-lg transition-all ${theme.iconButton} ${theme.iconButtonHover}`}
                aria-label="Imagem anterior"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button
                onClick={nextImage}
                className={`absolute right-4 top-1/2 -translate-y-1/2 rounded-full p-2 shadow-lg transition-all ${theme.iconButton} ${theme.iconButtonHover}`}
                aria-label="Próxima imagem"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </>
          )}

          {/* Image Counter */}
          {categoryPhotos.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-full text-sm">
              {currentImageIndex + 1} / {categoryPhotos.length}
            </div>
          )}

          {/* Action Button */}
          <div className="absolute bottom-4 right-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setGalleryType("category");
                setCurrentImageIndex(0);
                setGalleryOpen(true);
              }}
              className={`${theme.secondaryButton} ${theme.secondaryButtonHover} rounded-full px-4 py-2 text-xs md:text-sm`}
            >
              <Camera className="w-4 h-4 mr-2" />
              Ver mais fotos
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_480px] xl:grid-cols-[minmax(0,1fr)_520px] gap-6 lg:gap-8">
          {/* Left Column - Content */}
          <div className="space-y-8">
            {/* Title and Location */}
            {category && (
              <div>
                <h1 className={`text-3xl md:text-4xl font-bold mb-4 ${theme.textPrimary}`}>
                  {category.name}
                </h1>
                {establishment && (
                  <div className={`flex items-center gap-2 ${theme.textSecondary}`}>
                    <MapPin className="w-5 h-5" />
                    <span>
                      {establishment.name}
                      {establishment.city && `, ${establishment.city}`}
                      {establishment.state && ` - ${establishment.state}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            {category?.display_description && (
              <div className="prose max-w-none">
                <div className={`${theme.textSecondary} whitespace-pre-line leading-relaxed`}>
                  {category.display_description}
                </div>
              </div>
            )}

            {/* Features */}
            {category?.display_features && Array.isArray(category.display_features) && category.display_features.length > 0 && (
              <div>
                <h2 className={`text-2xl font-bold mb-4 ${theme.textPrimary}`}>Características</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {category.display_features.map((feature: string, index: number) => (
                    <div key={index} className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                      <span className={theme.textSecondary}>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Establishment Photos Gallery */}
            {establishmentPhotos.length > 0 && (
              <div>
                <h2 className={`text-2xl font-bold mb-4 ${theme.textPrimary}`}>Fotos do Estabelecimento</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {establishmentPhotos.slice(0, 6).map((photo: string, index: number) => (
                    <div
                      key={index}
                      className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => {
                        setGalleryType("establishment");
                        setCurrentImageIndex(index);
                        setGalleryOpen(true);
                      }}
                    >
                      <img
                        src={photo}
                        alt={`Foto ${index + 1} do estabelecimento`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Location + Google Maps */}
            {(building?.street || hotelSettings?.street) && (
              <div>
                <h2 className={`text-2xl font-bold mb-4 ${theme.textPrimary}`}>Localização</h2>
                <div className={`space-y-2 ${theme.textSecondary}`}>
                  <p>
                    {(building?.street || hotelSettings?.street) as string}
                    {(building?.number || hotelSettings?.number) &&
                      `, ${building?.number || hotelSettings?.number}`}
                  </p>
                  {(building?.neighborhood || hotelSettings?.neighborhood) && (
                    <p>{building?.neighborhood || hotelSettings?.neighborhood}</p>
                  )}
                  <p>
                    {building?.city || hotelSettings?.city}
                    {(building?.state || hotelSettings?.state) &&
                      ` - ${building?.state || hotelSettings?.state}`}
                    {(building?.zip_code || hotelSettings?.zip_code) &&
                      `, ${building?.zip_code || hotelSettings?.zip_code}`}
                  </p>
                </div>

                {/* Mapa do Google Maps */}
                <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 shadow-sm h-64 md:h-80">
                  <iframe
                    title={`Mapa - ${establishment?.name || "Estabelecimento"}`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(
                      `${building?.street || hotelSettings?.street || ""} ${building?.number || hotelSettings?.number || ""}, ${building?.city || hotelSettings?.city || ""} ${building?.state || hotelSettings?.state || ""} ${building?.zip_code || hotelSettings?.zip_code || ""}`
                    )}&output=embed`}
                    width="100%"
                    height="100%"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Reservation Details Card (Sticky) */}
          <div className="lg:sticky lg:top-20 h-fit">
            <Card className={`${theme.summaryBg} ${theme.summaryBorder} p-5 sm:p-6 md:p-8 lg:p-8 shadow-lg rounded-xl`}>
          <div className="space-y-5 sm:space-y-6 md:space-y-7">
            {/* Header com Status */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
              <div className="flex-1 min-w-0">
                <h2 className={`${theme.textPrimary} text-xl sm:text-2xl font-bold mb-1 sm:mb-2 break-words`}>
                  Reserva #{reservation.reservation_code}
                </h2>
                <p className={`${theme.textMuted} text-xs sm:text-sm break-words`}>
                  {establishment?.name || "Estabelecimento"}
                  {category?.name && ` • ${category.name}`}
                </p>
              </div>
              <Badge
                className={`text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 shrink-0 ${
                  reservation.status === "confirmed"
                    ? "bg-green-100 text-green-800 border-green-200"
                    : reservation.status === "checkedin"
                    ? "bg-blue-100 text-blue-800 border-blue-200"
                    : reservation.status === "checkedout"
                    ? "bg-gray-100 text-gray-800 border-gray-200"
                    : reservation.status === "cancelled"
                    ? "bg-red-100 text-red-800 border-red-200"
                    : "bg-yellow-100 text-yellow-800 border-yellow-200"
                } border`}
              >
                {reservation.status === "confirmed"
                  ? "Confirmada"
                  : reservation.status === "checkedin"
                  ? "Check-in realizado"
                  : reservation.status === "checkedout"
                  ? "Check-out realizado"
                  : reservation.status === "cancelled"
                  ? "Cancelada"
                  : "Pendente"}
              </Badge>
            </div>

            <Separator className={themeKey === 'modern' || themeKey === 'luxury' || themeKey === 'dark' ? 'bg-slate-700/50' : 'bg-slate-200'} />

            {/* Informações em Grid - Responsivo: 1 coluna em mobile, 2 em tablet+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 md:gap-6">
              {/* Informações do Hóspede */}
              <Card className={`${theme.summaryBg} ${theme.summaryBorder} p-5 sm:p-6 border ${theme.cardBorder || 'border-slate-200'} rounded-lg`}>
                <div className="flex items-center gap-3 mb-4 sm:mb-5">
                  <div className={`p-2 sm:p-2.5 rounded-lg shrink-0 ${
                    themeKey === 'default' ? 'bg-blue-100 text-blue-600' :
                    themeKey === 'modern' ? 'bg-amber-500/20 text-amber-400' :
                    themeKey === 'luxury' ? 'bg-amber-400/20 text-amber-300' :
                    themeKey === 'dark' ? 'bg-blue-500/20 text-blue-400' :
                    themeKey === 'travel' ? 'bg-blue-100 text-blue-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    <User className="w-5 h-5 sm:w-5 sm:h-5" />
                  </div>
                  <h3 className={`${theme.textPrimary} text-lg sm:text-lg font-semibold`}>
                    Hóspede
                  </h3>
                </div>
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <p className={`${theme.textMuted} text-xs sm:text-sm mb-1.5 font-medium`}>Nome completo</p>
                    <p className={`${theme.textPrimary} font-medium text-sm sm:text-base break-words leading-relaxed`}>
                      {client?.full_name || reservation.guest_name || "Não informado"}
                    </p>
                  </div>
                  {client?.phone && (
                    <div className="flex items-start gap-2.5 pt-1">
                      <Phone className={`w-4 h-4 sm:w-4 sm:h-4 ${theme.textMuted} shrink-0 mt-0.5`} />
                      <p className={`${theme.textPrimary} text-sm sm:text-base break-all leading-relaxed`}>{client.phone}</p>
                    </div>
                  )}
                  {client?.email && (
                    <div className="flex items-start gap-2.5 pt-1">
                      <Mail className={`w-4 h-4 sm:w-4 sm:h-4 ${theme.textMuted} shrink-0 mt-0.5`} />
                      <p className={`${theme.textPrimary} text-sm sm:text-base break-all leading-relaxed`}>{client.email}</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Datas e Estadia */}
              <Card className={`${theme.summaryBg} ${theme.summaryBorder} p-5 sm:p-6 border ${theme.cardBorder || 'border-slate-200'} rounded-lg`}>
                <div className="flex items-center gap-3 mb-4 sm:mb-5">
                  <div className={`p-2 sm:p-2.5 rounded-lg shrink-0 ${
                    themeKey === 'default' ? 'bg-blue-100 text-blue-600' :
                    themeKey === 'modern' ? 'bg-amber-500/20 text-amber-400' :
                    themeKey === 'luxury' ? 'bg-amber-400/20 text-amber-300' :
                    themeKey === 'dark' ? 'bg-blue-500/20 text-blue-400' :
                    themeKey === 'travel' ? 'bg-blue-100 text-blue-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    <Calendar className="w-5 h-5 sm:w-5 sm:h-5" />
                  </div>
                  <h3 className={`${theme.textPrimary} text-lg sm:text-lg font-semibold`}>
                    Estadia
                  </h3>
                </div>
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <p className={`${theme.textMuted} text-xs sm:text-sm mb-1.5 font-medium`}>Check-in</p>
                    <p className={`${theme.textPrimary} font-medium text-sm sm:text-base leading-relaxed`}>{checkinDate}</p>
                  </div>
                  <div>
                    <p className={`${theme.textMuted} text-xs sm:text-sm mb-1.5 font-medium`}>Check-out</p>
                    <p className={`${theme.textPrimary} font-medium text-sm sm:text-base leading-relaxed`}>{checkoutDate}</p>
                  </div>
                  {nights > 0 && (
                    <div className={`pt-3 border-t ${themeKey === 'modern' || themeKey === 'luxury' || themeKey === 'dark' ? 'border-slate-700/50' : 'border-slate-200/50'}`}>
                      <p className={`${theme.textMuted} text-xs sm:text-sm mb-1.5 font-medium`}>Duração</p>
                      <p className={`${theme.textPrimary} font-semibold text-sm sm:text-base leading-relaxed`}>
                        {nights} {nights === 1 ? "noite" : "noites"}
                      </p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Hóspedes */}
              <Card className={`${theme.summaryBg} ${theme.summaryBorder} p-5 sm:p-6 border ${theme.cardBorder || 'border-slate-200'} rounded-lg`}>
                <div className="flex items-center gap-3 mb-4 sm:mb-5">
                  <div className={`p-2 sm:p-2.5 rounded-lg shrink-0 ${
                    themeKey === 'default' ? 'bg-blue-100 text-blue-600' :
                    themeKey === 'modern' ? 'bg-amber-500/20 text-amber-400' :
                    themeKey === 'luxury' ? 'bg-amber-400/20 text-amber-300' :
                    themeKey === 'dark' ? 'bg-blue-500/20 text-blue-400' :
                    themeKey === 'travel' ? 'bg-blue-100 text-blue-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    <Users className="w-5 h-5 sm:w-5 sm:h-5" />
                  </div>
                  <h3 className={`${theme.textPrimary} text-lg sm:text-lg font-semibold`}>
                    Hóspedes
                  </h3>
                </div>
                <div className="space-y-3 sm:space-y-3.5">
                  <div className="flex items-center justify-between py-1">
                    <span className={`${theme.textSecondary} text-sm sm:text-base`}>Adultos</span>
                    <span className={`${theme.textPrimary} font-semibold text-base sm:text-base`}>
                      {reservation.adults || 1}
                    </span>
                  </div>
                  {reservation.children > 0 && (
                    <div className="flex items-center justify-between py-1">
                      <span className={`${theme.textSecondary} text-sm sm:text-base`}>Crianças</span>
                      <span className={`${theme.textPrimary} font-semibold text-base sm:text-base`}>
                        {reservation.children}
                      </span>
                    </div>
                  )}
                  <div className={`pt-3 border-t ${themeKey === 'modern' || themeKey === 'luxury' || themeKey === 'dark' ? 'border-slate-700/50' : 'border-slate-200/50'}`}>
                    <div className="flex items-center justify-between py-1">
                      <span className={`${theme.textSecondary} text-sm sm:text-base font-medium`}>Total</span>
                      <span className={`${theme.textPrimary} font-bold text-base sm:text-lg`}>
                        {(reservation.adults || 1) + (reservation.children || 0)} {((reservation.adults || 1) + (reservation.children || 0)) === 1 ? "pessoa" : "pessoas"}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Informações Financeiras */}
              <Card className={`${theme.summaryBg} ${theme.summaryBorder} p-5 sm:p-6 border ${theme.cardBorder || 'border-slate-200'} rounded-lg`}>
                <div className="flex items-center gap-3 mb-4 sm:mb-5">
                  <div className={`p-2 sm:p-2.5 rounded-lg shrink-0 ${
                    themeKey === 'default' ? 'bg-blue-100 text-blue-600' :
                    themeKey === 'modern' ? 'bg-amber-500/20 text-amber-400' :
                    themeKey === 'luxury' ? 'bg-amber-400/20 text-amber-300' :
                    themeKey === 'dark' ? 'bg-blue-500/20 text-blue-400' :
                    themeKey === 'travel' ? 'bg-blue-100 text-blue-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    <CreditCard className="w-5 h-5 sm:w-5 sm:h-5" />
                  </div>
                  <h3 className={`${theme.textPrimary} text-lg sm:text-lg font-semibold`}>
                    Pagamento
                  </h3>
                </div>
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex items-center justify-between py-1">
                    <span className={`${theme.textSecondary} text-sm sm:text-base`}>Valor total</span>
                    <span className={`${theme.textPrimary} font-bold text-base sm:text-lg`}>
                      R$ {parseFloat(reservation.total_amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1">
                    <span className={`${theme.textSecondary} text-sm sm:text-base`}>Valor pago</span>
                    <span className={`${theme.textPrimary} font-semibold text-sm sm:text-base`}>
                      R$ {parseFloat(reservation.paid_amount || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className={`pt-3 border-t ${themeKey === 'modern' || themeKey === 'luxury' || themeKey === 'dark' ? 'border-slate-700/50' : 'border-slate-200/50'}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2 py-1">
                      <span className={`${theme.textSecondary} text-sm sm:text-base font-medium`}>Status do pagamento</span>
                      {(() => {
                        // Calcular status de pagamento baseado em paid_amount e total_amount
                        const paidAmount = parseFloat(reservation.paid_amount || 0);
                        const totalAmount = parseFloat(reservation.total_amount || 0);
                        let paymentStatus = "unpaid";
                        
                        if (totalAmount > 0) {
                          if (paidAmount >= totalAmount) {
                            paymentStatus = "paid";
                          } else if (paidAmount > 0) {
                            paymentStatus = "partial";
                          } else {
                            paymentStatus = "unpaid";
                          }
                        }
                        
                        return (
                          <Badge
                            className={`text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 ${
                              paymentStatus === "paid"
                                ? "bg-green-100 text-green-800 border-green-200"
                                : paymentStatus === "partial"
                                ? "bg-yellow-100 text-yellow-800 border-yellow-200"
                                : paymentStatus === "refunded"
                                ? "bg-red-100 text-red-800 border-red-200"
                                : "bg-gray-100 text-gray-800 border-gray-200"
                            } border`}
                          >
                            {paymentStatus === "paid"
                              ? "Pago"
                              : paymentStatus === "partial"
                              ? "Parcial"
                              : paymentStatus === "refunded"
                              ? "Reembolsado"
                              : "Pendente"}
                          </Badge>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <Separator className={themeKey === 'modern' || themeKey === 'luxury' || themeKey === 'dark' ? 'bg-slate-700/50' : 'bg-slate-200'} />

            {/* Ações */}
            <div className="space-y-4 sm:space-y-5">
              <h3 className={`${theme.textPrimary} text-lg sm:text-lg font-semibold mb-4`}>Ações Disponíveis</h3>
              <div className="grid grid-cols-1 gap-3 sm:gap-3.5">
                <Button
                  onClick={() => navigate(`/web-checkin/${reservation.reservation_code}`)}
                  className={`${theme.primaryButton} ${theme.primaryButtonHover} flex items-center justify-center gap-2.5 h-12 sm:h-12 text-sm sm:text-base w-full font-medium`}
                >
                  <Key className="w-4 h-4 sm:w-5 sm:h-5" />
                  Fazer Check-in Web
                  <ExternalLink className="w-4 h-4 sm:w-4 sm:h-4" />
                </Button>
                <Button
                  onClick={() => navigate(`/guest-dashboard?reservation=${reservation.id}`)}
                  className={`${theme.secondaryButton} ${theme.secondaryButtonHover} flex items-center justify-center gap-2.5 h-12 sm:h-12 text-sm sm:text-base w-full font-medium`}
                >
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  Acessar Guest Dashboard
                  <ExternalLink className="w-4 h-4 sm:w-4 sm:h-4" />
                </Button>
              </div>
            </div>

            {/* Observações */}
            {reservation.notes && (
              <>
                <Separator className={themeKey === 'modern' || themeKey === 'luxury' || themeKey === 'dark' ? 'bg-slate-700/50' : 'bg-slate-200'} />
                <div className="pt-1">
                  <div className="flex items-center gap-3 mb-3 sm:mb-4">
                    <FileText className={`w-5 h-5 sm:w-5 sm:h-5 ${theme.textMuted} shrink-0`} />
                    <h3 className={`${theme.textPrimary} text-lg sm:text-lg font-semibold`}>Observações</h3>
                  </div>
                  <p className={`${theme.textSecondary} text-sm sm:text-sm leading-relaxed break-words`}>
                    {reservation.notes}
                  </p>
                </div>
              </>
            )}
            </div>
          </Card>
        </div>
      </div>
      </main>

      {/* Gallery Modal */}
      {galleryOpen && (() => {
        const photos = galleryType === "category" ? categoryPhotos : establishmentPhotos;
        const altText = galleryType === "category" ? category?.name : `${establishment?.name || "Estabelecimento"} - Estabelecimento`;
        return (
          <div
            className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
            onClick={() => setGalleryOpen(false)}
          >
            <div className="relative max-w-6xl w-full">
              <button
                onClick={() => setGalleryOpen(false)}
                className="absolute top-4 right-4 text-white hover:text-slate-300 z-10"
              >
                <X className="w-8 h-8" />
              </button>
              <img
                src={photos[currentImageIndex]}
                alt={altText}
                className="w-full h-auto max-h-[90vh] object-contain"
              />
              {photos.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      prevImage();
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-3"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      nextImage();
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-3"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-full text-sm">
                    {currentImageIndex + 1} / {photos.length}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Footer completo - mesmo estilo da CategoryDetailPage */}
      <footer className={`${theme.footerBg} ${theme.footerBorder} mt-8`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Coluna 1 - Identidade */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {motorLogo && (
                  <div className="h-10 w-10 rounded-full bg-white/90 shadow-sm flex items-center justify-center overflow-hidden ring-1 ring-black/5">
                    <img
                      src={motorLogo}
                      alt="Logo"
                      className="h-8 w-8 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className={`text-sm font-semibold ${theme.footerText}`}>
                    {motorTitle}
                  </span>
                  <span className={`text-xs ${theme.footerText}`}>
                    Motor de reservas oficial · página de detalhes da reserva
                  </span>
                </div>
              </div>
              <div className="mt-2">
                <span className={`text-xs ${theme.footerText}`}>
                  Experiência moderna de reserva direta, sem taxas ocultas.
                </span>
              </div>
              {contactCnpj && (
                <p className={`text-xs ${theme.footerText}`}>CNPJ: {contactCnpj}</p>
              )}
            </div>

            {/* Coluna 2 - Contato */}
            <div className="space-y-3">
              <h5 className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                themeKey === "travel" ? "text-white" : theme.textSecondary
              }`}>
                Contato
              </h5>
              <div className="space-y-2 text-sm">
                {contactPhone && (
                  <p className={`flex items-center gap-2 ${theme.footerText}`}>
                    <Phone className="w-4 h-4 opacity-70" />
                    <a href={`tel:${contactPhone}`} className="hover:underline">
                      {contactPhone}
                    </a>
                  </p>
                )}
                {contactWhatsappNumber && (
                  <p className={`flex items-center gap-2 ${theme.footerText}`}>
                    <img src="/whatsapp.png" alt="WhatsApp" className="w-4 h-4 object-contain opacity-70" />
                    <a
                      href={`https://wa.me/${encodeURIComponent(`${contactWhatsappDdi || ""}${contactWhatsappNumber}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {`${contactWhatsappDdi || ""} ${contactWhatsappNumber}`.trim()}
                    </a>
                  </p>
                )}
                {contactEmail && (
                  <p className={`flex items-center gap-2 ${theme.footerText}`}>
                    <Mail className="w-4 h-4 opacity-70" />
                    <a href={`mailto:${contactEmail}`} className="hover:underline">
                      {contactEmail}
                    </a>
                  </p>
                )}
              </div>
            </div>

            {/* Coluna 3 - Experiência & tecnologia */}
            <div className="space-y-3 md:text-right">
              <h5 className={`text-xs font-semibold uppercase tracking-[0.18em] ${
                themeKey === "travel" ? "text-white" : theme.textSecondary
              }`}>
                Experiência segura
              </h5>
              <p className={`text-sm ${theme.footerText}`}>
                Pagamentos criptografados, disponibilidade em tempo real e confirmação imediata da sua reserva.
              </p>
              <div className="inline-flex items-center gap-2 text-xs text-slate-400 mt-2 md:justify-end">
                <Globe2 className="w-3 h-3" />
                <span>Tecnologia SaaS para hospitalidade</span>
              </div>
            </div>
          </div>

          {/* Redes sociais */}
          {(socialInstagram || socialFacebook || socialTwitter || socialYoutube || socialLinkedin || socialWebsite || socialWhatsapp) && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <span className={`text-[11px] ${theme.footerText}`}>Siga-nos:</span>
              {socialInstagram && (
                <a
                  href={socialInstagram}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="Instagram"
                >
                  <Instagram className="w-4 h-4" />
                </a>
              )}
              {socialFacebook && (
                <a
                  href={socialFacebook}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="Facebook"
                >
                  <Facebook className="w-4 h-4" />
                </a>
              )}
              {socialTwitter && (
                <a
                  href={socialTwitter}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="Twitter / X"
                >
                  <Twitter className="w-4 h-4" />
                </a>
              )}
              {socialYoutube && (
                <a
                  href={socialYoutube}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="YouTube"
                >
                  <Youtube className="w-4 h-4" />
                </a>
              )}
              {socialLinkedin && (
                <a
                  href={socialLinkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="LinkedIn"
                >
                  <Linkedin className="w-4 h-4" />
                </a>
              )}
              {socialWhatsapp && (
                <a
                  href={socialWhatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-green-500 text-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                  aria-label="WhatsApp"
                >
                  <img src="/whatsapp.png" alt="WhatsApp" className="w-4 h-4 object-contain" />
                </a>
              )}
              {socialWebsite && (
                <a
                  href={socialWebsite}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full border ${theme.footerBorder}`}
                >
                  <Globe2 className="w-3 h-3" />
                  <span>Site oficial</span>
                </a>
              )}
            </div>
          )}

          {/* Linha inferior */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-4 border-t border-white/5 border-slate-200/10">
            <p className={`text-[11px] ${theme.footerText}`}>
              © {new Date().getFullYear()} {motorTitle}. Todos os direitos reservados.
            </p>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
              <span>Idioma: Português (Brasil)</span>
              <span className="hidden md:inline-block w-px h-3 bg-slate-700/40" />
              <span>Moeda: BRL (R$)</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

