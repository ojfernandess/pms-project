import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  MapPin, 
  Calendar, 
  Users, 
  ChevronLeft, 
  ChevronRight,
  Camera,
  Heart,
  Share2,
  Search,
  CheckCircle2,
  X,
  Phone,
  Mail,
  MessageCircle,
  Globe2,
  Instagram,
  Facebook,
  Twitter,
  Youtube,
  Linkedin
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useTranslation } from "react-i18next";
import { useSiteSettings } from "@/hooks/useSiteSettings";

type BookingThemeKey = "default" | "modern" | "luxury" | "minimal" | "dark" | "travel";

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
    footerBg: "bg-slate-900/80 backdrop-blur-md",
    footerBorder: "border-t border-slate-700",
    footerText: "text-slate-300",
  },
  luxury: {
    pageBg: "bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950",
    headerBg: "bg-slate-950/98 backdrop-blur-md",
    headerText: "text-slate-50",
    headerSubtitle: "text-slate-300",
    headerBorder: "border-b border-slate-800/50",
    textPrimary: "text-slate-50",
    textSecondary: "text-slate-200",
    textMuted: "text-slate-400",
    heroImageOverlay: "bg-gradient-to-t from-black/85 via-purple-900/30 to-transparent",
    summaryBg: "bg-slate-900/98 backdrop-blur-xl",
    summaryBorder: "border border-slate-800/50",
    primaryButton: "bg-gradient-to-r from-purple-600 to-purple-700 text-white font-semibold shadow-lg",
    primaryButtonHover: "hover:from-purple-700 hover:to-purple-800 hover:shadow-xl hover:shadow-purple-500/40",
    secondaryButton: "bg-slate-800/90 text-slate-100 border border-slate-700/50",
    secondaryButtonHover: "hover:bg-slate-700/90 hover:border-purple-500/50",
    iconButton: "bg-slate-800/90 text-slate-100 border border-slate-700/50",
    iconButtonHover: "hover:bg-slate-700/90 hover:border-purple-500/50",
    footerBg: "bg-slate-950/98 backdrop-blur-md",
    footerBorder: "border-t border-slate-800/50",
    footerText: "text-slate-300",
  },
  minimal: {
    pageBg: "bg-white",
    headerBg: "bg-white",
    headerText: "text-slate-900",
    headerSubtitle: "text-slate-500",
    headerBorder: "border-b border-slate-100",
    textPrimary: "text-slate-900",
    textSecondary: "text-slate-700",
    textMuted: "text-slate-500",
    heroImageOverlay: "bg-gradient-to-t from-white/90 via-white/50 to-transparent",
    summaryBg: "bg-white",
    summaryBorder: "border border-slate-200",
    primaryButton: "bg-slate-900 text-white",
    primaryButtonHover: "hover:bg-slate-800 hover:shadow-lg",
    secondaryButton: "bg-white text-slate-900 border border-slate-200",
    secondaryButtonHover: "hover:bg-slate-50 hover:border-slate-300",
    iconButton: "bg-white text-slate-900 border border-slate-200",
    iconButtonHover: "hover:bg-slate-50 hover:border-slate-300",
    footerBg: "bg-white",
    footerBorder: "border-t border-slate-100",
    footerText: "text-slate-600",
  },
  dark: {
    pageBg: "bg-slate-950",
    headerBg: "bg-slate-950/95 backdrop-blur-md",
    headerText: "text-slate-50",
    headerSubtitle: "text-slate-400",
    headerBorder: "border-b border-slate-800",
    textPrimary: "text-slate-50",
    textSecondary: "text-slate-200",
    textMuted: "text-slate-500",
    heroImageOverlay: "bg-gradient-to-t from-black/85 via-slate-900/40 to-transparent",
    summaryBg: "bg-slate-900/95 backdrop-blur-xl",
    summaryBorder: "border border-slate-800",
    primaryButton: "bg-emerald-500 text-slate-950",
    primaryButtonHover: "hover:bg-emerald-400 hover:shadow-lg hover:shadow-emerald-500/30",
    secondaryButton: "bg-slate-900/80 text-slate-100 border border-slate-700",
    secondaryButtonHover: "hover:bg-slate-800/80 hover:border-emerald-400/70",
    iconButton: "bg-slate-900/80 text-slate-100 border border-slate-700",
    iconButtonHover: "hover:bg-slate-800/80 hover:border-emerald-400/70",
    footerBg: "bg-slate-950/95 backdrop-blur-md",
    footerBorder: "border-t border-slate-800",
    footerText: "text-slate-300",
  },
  travel: {
    // Travel Landing Page - Estilo Booking.com
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
};

const CategoryDetailPage = () => {
  const { companySlug, categoryId } = useParams<{ companySlug?: string; categoryId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { settings: siteSettings } = useSiteSettings();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<any>(null);
  const [category, setCategory] = useState<any>(null);
  const [establishment, setEstablishment] = useState<any>(null);
  const [hotelSettings, setHotelSettings] = useState<any>(null);
  const [building, setBuilding] = useState<any>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryType, setGalleryType] = useState<"category" | "establishment">("category");
  const [isFavorite, setIsFavorite] = useState(false);
  const [chatwootWidgetOpen, setChatwootWidgetOpen] = useState(false);

  // Form data
  const [checkin, setCheckin] = useState(searchParams.get("checkin") || "");
  const [checkout, setCheckout] = useState(searchParams.get("checkout") || "");
  const [adults, setAdults] = useState(searchParams.get("adults") || "2");
  const [children, setChildren] = useState(searchParams.get("children") || "0");
  const [coupon, setCoupon] = useState(searchParams.get("coupon") || "");

  // Fotos da categoria
  const categoryPhotos = useMemo(() => {
    if (!category) return [];
    return category.display_photos && Array.isArray(category.display_photos) && category.display_photos.length > 0
      ? category.display_photos
      : category.photo_url
      ? [category.photo_url]
      : ["https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1920&q=80"];
  }, [category]);

  // Fotos do estabelecimento
  const establishmentPhotos = useMemo(() => {
    if (!hotelSettings?.establishment_photos) return [];
    return Array.isArray(hotelSettings.establishment_photos) 
      ? hotelSettings.establishment_photos 
      : [];
  }, [hotelSettings]);

  const themeKey: BookingThemeKey = useMemo(() => {
    const key =
      (company?.booking_engine_theme as BookingThemeKey) ||
      (hotelSettings?.booking_engine_theme as BookingThemeKey) ||
      "default";
    const validKeys: BookingThemeKey[] = ["default", "modern", "luxury", "minimal", "dark", "travel"];
    return validKeys.includes(key) ? key : "default";
  }, [company, hotelSettings]);

  const theme = useMemo(() => DETAIL_THEME_CONFIGS[themeKey], [themeKey]);

  // Carregar estado inicial de favorito do localStorage
  useEffect(() => {
    try {
      const key = "bookingEngine:favorites";
      const raw = localStorage.getItem(key);
      if (!raw || !categoryId) return;
      const data = JSON.parse(raw) as Record<string, boolean>;
      if (data[categoryId]) {
        setIsFavorite(true);
      }
    } catch {
      // ignore
    }
  }, [categoryId]);

  // Atualizar título da página (aba do navegador) com o título e subtítulo do motor de reservas
  // IMPORTANTE: Este useEffect deve estar ANTES dos if statements que retornam cedo
  useEffect(() => {
    if (!company || !category) return; // Retornar cedo se dados não estiverem prontos
    
    const motorTitle = company?.booking_engine_title || company?.name || "Motor de Reservas";
    const motorSubtitle = company?.booking_engine_subtitle || "";
    const categoryName = category?.name || "";
    let baseTitle = "";
    
    if (motorTitle && motorTitle !== "Motor de Reservas") {
      // Se houver subtítulo, incluir no título da página
      if (motorSubtitle) {
        baseTitle = categoryName 
          ? `${categoryName} - ${motorTitle} - ${motorSubtitle}`
          : `${motorTitle} - ${motorSubtitle}`;
      } else {
        baseTitle = categoryName 
          ? `${categoryName} - ${motorTitle}`
          : motorTitle;
      }
    } else if (company?.name) {
      // Se houver subtítulo, incluir no título da página
      if (motorSubtitle) {
        baseTitle = categoryName 
          ? `${categoryName} - ${company.name} - ${motorSubtitle}`
          : `${company.name} - ${motorSubtitle}`;
      } else {
        baseTitle = categoryName 
          ? `${categoryName} - ${company.name} - Motor de Reservas`
          : `${company.name} - Motor de Reservas`;
      }
    } else {
      baseTitle = categoryName 
        ? `${categoryName} - Motor de Reservas`
        : "Motor de Reservas";
    }
    
    document.title = baseTitle;
  }, [company, category]);

  // Chat (Chatwoot ou WhatsApp) - declarar antes do useEffect que o usa
  const chatEnabled = company?.booking_engine_chat_enabled || false;
  const chatType = company?.booking_engine_chat_type || "chatwoot";
  const chatBaseUrl = company?.booking_engine_chat_base_url || null;
  const chatWebsiteToken = company?.booking_engine_chat_website_token || null;
  const chatButtonStyle = company?.booking_engine_chat_button_style || "custom";
  const whatsappDdi = company?.booking_engine_contact_whatsapp_ddi || null;
  const whatsappNumber = company?.booking_engine_contact_whatsapp_number || null;

  // Carregar Chatwoot quando habilitado (apenas se tipo for chatwoot)
  useEffect(() => {
    // Se não estiver habilitado, ou for WhatsApp, ou faltar configuração do Chatwoot, remover script
    if (!chatEnabled || chatType !== "chatwoot" || !chatBaseUrl || !chatWebsiteToken) {
      const existingScript = document.querySelector('script[data-chatwoot]');
      if (existingScript) {
        existingScript.remove();
      }
      return;
    }

    // Verificar se o script já foi carregado
    const existingScript = document.querySelector('script[data-chatwoot]');
    if (existingScript) {
      // Se já existe, apenas atualizar a configuração
      if (window.chatwootSDK) {
        window.chatwootSDK.run({
          websiteToken: chatWebsiteToken,
          baseUrl: chatBaseUrl
        });
      }
      return;
    }

    // Carregar script do Chatwoot
    const script = document.createElement('script');
    script.setAttribute('data-chatwoot', 'true');
    script.src = `${chatBaseUrl}/packs/js/sdk.js`;
    script.async = true;
    
    script.onload = () => {
      if (window.chatwootSDK) {
        window.chatwootSDK.run({
          websiteToken: chatWebsiteToken,
          baseUrl: chatBaseUrl
        });
      }
    };

    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
    }

    // Cleanup: remover script ao desmontar ou quando desabilitar
    return () => {
      const scriptToRemove = document.querySelector('script[data-chatwoot]');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
    };
  }, [chatEnabled, chatType, chatBaseUrl, chatWebsiteToken]);

  // Esconder o botão nativo do Chatwoot apenas quando o estilo for "custom"
  useEffect(() => {
    if (chatEnabled && chatType === "chatwoot" && chatBaseUrl && chatWebsiteToken && chatButtonStyle === "custom") {
      // Função para esconder o botão nativo do Chatwoot
      const hideNativeChatwootButton = () => {
        const nativeButton = document.querySelector('.woot-widget-bubble') as HTMLElement;
        const nativeWidget = document.querySelector('[data-chatwoot-widget]') as HTMLElement;
        
        if (nativeButton) {
          nativeButton.style.display = 'none';
        }
        if (nativeWidget) {
          nativeWidget.style.display = 'none';
        }
        // NÃO esconder #woot-widget-holder pois precisamos detectar quando está aberto
      };

      // Esconder imediatamente
      hideNativeChatwootButton();

      // Observar mudanças no DOM para esconder quando o Chatwoot criar o botão
      const observer = new MutationObserver(hideNativeChatwootButton);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Verificar periodicamente
      const interval = setInterval(hideNativeChatwootButton, 500);

      return () => {
        observer.disconnect();
        clearInterval(interval);
      };
    } else if (chatEnabled && chatType === "chatwoot" && chatBaseUrl && chatWebsiteToken && chatButtonStyle === "native") {
      // Quando for "native", garantir que o botão nativo esteja visível
      const showNativeChatwootButton = () => {
        const nativeButton = document.querySelector('.woot-widget-bubble') as HTMLElement;
        const nativeWidget = document.querySelector('[data-chatwoot-widget]') as HTMLElement;
        
        if (nativeButton) {
          // Usar setProperty com !important para sobrescrever qualquer CSS
          nativeButton.style.setProperty('display', '', 'important');
          nativeButton.style.setProperty('visibility', 'visible', 'important');
          nativeButton.style.setProperty('opacity', '1', 'important');
          // Remover qualquer classe que possa estar escondendo
          nativeButton.classList.remove('woot--hide');
        }
        if (nativeWidget) {
          nativeWidget.style.setProperty('display', '', 'important');
          nativeWidget.style.setProperty('visibility', 'visible', 'important');
          nativeWidget.style.setProperty('opacity', '1', 'important');
        }
      };

      // Mostrar imediatamente
      showNativeChatwootButton();

      // Observar mudanças no DOM
      const observer = new MutationObserver(showNativeChatwootButton);
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Verificar periodicamente
      const interval = setInterval(showNativeChatwootButton, 500);

      return () => {
        observer.disconnect();
        clearInterval(interval);
      };
    }
  }, [chatEnabled, chatType, chatBaseUrl, chatWebsiteToken, chatButtonStyle]);

  // Monitorar o estado do widget do Chatwoot (aberto/fechado) e ajustar posição do botão (apenas para estilo custom)
  useEffect(() => {
    if (chatEnabled && chatType === "chatwoot" && chatBaseUrl && chatWebsiteToken && chatButtonStyle === "custom") {
      const checkWidgetState = () => {
        // Verificar se o widget está aberto
        // O Chatwoot cria um elemento com id 'woot-widget-holder' quando aberto
        const widgetHolder = document.querySelector('#woot-widget-holder') as HTMLElement;
        
        if (!widgetHolder) {
          setChatwootWidgetOpen(false);
          return;
        }
        
        // Verificar múltiplas condições para detectar se está aberto
        const computedStyle = window.getComputedStyle(widgetHolder);
        const hasHeight = widgetHolder.offsetHeight > 100; // Widget geralmente tem mais de 100px quando aberto
        const hasWidth = widgetHolder.offsetWidth > 100;
        const isVisible = computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden';
        const isNotHidden = !widgetHolder.classList.contains('woot--hide');
        
        // Verificar se há um iframe dentro (indicando que o widget está carregado)
        const hasIframe = widgetHolder.querySelector('iframe') !== null;
        
        // O widget está aberto se todas as condições forem verdadeiras
        const isOpen = hasHeight && hasWidth && isVisible && isNotHidden && hasIframe;
        
        setChatwootWidgetOpen(isOpen);
      };

      // Verificar periodicamente o estado do widget (mais frequente para melhor responsividade)
      const interval = setInterval(checkWidgetState, 200);

      // Observar mudanças no DOM
      const observer = new MutationObserver(checkWidgetState);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      // Verificar imediatamente
      checkWidgetState();

      return () => {
        observer.disconnect();
        clearInterval(interval);
      };
    }
  }, [chatEnabled, chatType, chatBaseUrl, chatWebsiteToken, chatButtonStyle]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Verificar se estamos em um domínio personalizado
        // Se estivermos e houver companySlug na URL, bloquear acesso a outros motores
        const currentHost = typeof window !== "undefined" ? window.location.host : undefined;
        if (currentHost && companySlug) {
          const normalizeDomain = (domain: string) => {
            if (!domain) return "";
            return domain
              .toLowerCase()
              .replace(/^https?:\/\//, "")
              .replace(/^www\./, "")
              .split("/")[0];
          };
          
          const normalizedHost = normalizeDomain(currentHost);
          
          // Verificar se o domínio atual é um domínio personalizado configurado
          const { data: companies } = await supabase
            .from("companies")
            .select("id, booking_engine_custom_domain")
            .not("booking_engine_custom_domain", "is", null);

          const isCustomDomain = companies?.some((company) => {
            if (!company.booking_engine_custom_domain) return false;
            const normalizedConfig = normalizeDomain(company.booking_engine_custom_domain);
            return normalizedConfig === normalizedHost;
          });

          // Se for domínio personalizado e houver companySlug, redirecionar para a raiz
          // Isso impede acesso a outros motores através do domínio personalizado
          if (isCustomDomain) {
            console.log("[CategoryDetailPage] Domínio personalizado detectado com companySlug, redirecionando para raiz");
            navigate("/", { replace: true });
            return;
          }
        }

        // Buscar empresa por slug
        let foundCompany: any = null;
        if (companySlug) {
          const { data: companyData, error: companyError } = await supabase
            .from("companies")
            .select("*")
            .eq("booking_engine_slug", companySlug)
            .maybeSingle();

          if (companyError) throw companyError;
          if (!companyData) {
            setError("Empresa não encontrada");
            setLoading(false);
            return;
          }
          foundCompany = companyData;
        } else {
          // Se não houver slug, buscar por domínio personalizado
          const currentHost = typeof window !== "undefined" ? window.location.host : "";
          const { data: companyByDomain } = await supabase
            .from("companies")
            .select("*")
            .eq("booking_engine_custom_domain", currentHost)
            .maybeSingle();

          if (companyByDomain) {
            foundCompany = companyByDomain;
          }
        }

        if (!foundCompany) {
          setError("Empresa não encontrada");
          setLoading(false);
          return;
        }

        setCompany(foundCompany);

        // Buscar categoria (inclui only establishment; prédio é buscado em chamada separada)
        const { data: categoryData, error: categoryError } = await supabase
          .from("room_categories")
          .select(`
            *,
            establishment:establishments(*)
          `)
          .eq("id", categoryId)
          .maybeSingle();

        if (categoryError) throw categoryError;
        if (!categoryData) {
          setError("Categoria não encontrada");
          setLoading(false);
          return;
        }

        setCategory(categoryData);
        setEstablishment(categoryData.establishment);
        setBuilding(null);

        // Se a categoria estiver associada a um prédio, buscar endereço do prédio
        if ((categoryData as any).building_id) {
          const { data: buildingData, error: buildingError } = await supabase
            .from("buildings")
            .select("id, name, street, number, neighborhood, city, state, country, zip_code")
            .eq("id", (categoryData as any).building_id)
            .maybeSingle();

          if (!buildingError && buildingData) {
            setBuilding(buildingData);
          }
        }

        // Buscar configurações do hotel
        if (categoryData.establishment?.id) {
          const { data: hotelData } = await supabase
            .from("hotel_settings")
            .select("*")
            .eq("establishment_id", categoryData.establishment.id)
            .maybeSingle();

          if (hotelData) {
            setHotelSettings(hotelData);
          }
        }
      } catch (err: any) {
        console.error("Erro ao carregar dados:", err);
        setError(err.message || "Erro ao carregar informações");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [companySlug, categoryId]);

  const handleSubmit = () => {
    const params = new URLSearchParams();
    if (checkin) params.set("checkin", checkin);
    if (checkout) params.set("checkout", checkout);
    if (adults) params.set("adults", adults);
    if (children) params.set("children", children);
    if (coupon) params.set("coupon", coupon);
    if (categoryId) params.set("category", categoryId);

    const establishmentSlug = establishment?.slug || establishment?.numeric_id?.toString() || establishment?.id;
    navigate(`/reservar/${establishmentSlug}?${params.toString()}`);
  };

  const nextImage = () => {
    const photos = galleryType === "category" ? categoryPhotos : establishmentPhotos;
    setCurrentImageIndex((prev) => (prev + 1) % photos.length);
  };

  const prevImage = () => {
    const photos = galleryType === "category" ? categoryPhotos : establishmentPhotos;
    setCurrentImageIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">{t("bookingEngine.loading")}</p>
        </div>
      </div>
    );
  }

  if (error || !category || !establishment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="max-w-md w-full p-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">{t("bookingEngine.error.title")}</h2>
            <p className="text-slate-600 mb-6">{error || "Categoria não encontrada"}</p>
            <Button onClick={() => navigate(-1)} variant="default">
              Voltar
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const motorTitle = company?.booking_engine_title || company?.name || "Motor de Reservas";
  const motorSubtitle = company?.booking_engine_subtitle || "";
  const motorLogo = company?.booking_engine_logo || null;

  // Dados de contato e redes sociais (mesma lógica do motor principal)
  // Contatos gerais do motor de reservas (prioridade) ou fallback para contatos do estabelecimento
  const contactCnpj = company?.booking_engine_contact_cnpj || (hotelSettings as any)?.establishment_cnpj || "";
  const contactPhone = company?.booking_engine_contact_phone || (hotelSettings as any)?.phone || "";
  const contactWhatsappDdi = company?.booking_engine_contact_whatsapp_ddi || (hotelSettings as any)?.whatsapp_ddi || "";
  const contactWhatsappNumber = company?.booking_engine_contact_whatsapp_number || (hotelSettings as any)?.whatsapp_number || "";
  const contactEmail = company?.booking_engine_contact_email || (hotelSettings as any)?.email || "";

  const socialInstagram = company?.booking_engine_social_instagram || null;
  const socialFacebook = company?.booking_engine_social_facebook || null;
  const socialTwitter = company?.booking_engine_social_twitter || null;
  const socialYoutube = company?.booking_engine_social_youtube || null;
  const socialLinkedin = company?.booking_engine_social_linkedin || null;
  const socialWebsite = company?.booking_engine_social_website || null;
  const socialWhatsapp = company?.booking_engine_social_whatsapp || null;

  // Animações CSS para o botão pulsante do WhatsApp
  const pulseAnimations = `
    @keyframes pulse-ring {
      0% {
        transform: scale(0.8);
        opacity: 1;
      }
      50% {
        transform: scale(1.2);
        opacity: 0.5;
      }
      100% {
        transform: scale(1.5);
        opacity: 0;
      }
    }

    @keyframes pulse-button {
      0%, 100% {
        transform: scale(1);
      }
      50% {
        transform: scale(1.05);
      }
    }

    /* O botão nativo do Chatwoot será controlado via JavaScript baseado no estilo escolhido */
    /* NÃO esconder #woot-widget-holder pois precisamos detectar quando está aberto */
  `;

  return (
    <>
      <style>{pulseAnimations}</style>
      <div className={`min-h-screen ${theme.pageBg}`}>
      {/* Header */}
      <header className={`${theme.headerBg} ${theme.headerText} sticky top-0 z-50 ${theme.headerBorder || ""}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {motorLogo && (
                <div className="h-10 w-10 rounded-full bg-white/90 shadow-sm flex items-center justify-center overflow-hidden ring-1 ring-black/5">
                  <img
                    src={motorLogo}
                    alt="Logo"
                    className="h-8 w-8 object-contain"
                  />
                </div>
              )}
              <div className="flex flex-col">
                <span className={`text-lg font-semibold tracking-tight ${theme.textPrimary}`}>
                  {motorTitle}
                </span>
                {motorSubtitle && (
                  <span className={`text-xs ${theme.headerSubtitle}`}>
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
                  // Se não houver companySlug (domínio personalizado), voltar para raiz
                  const backPath = companySlug ? `/motor/${companySlug}` : `/`;
                  navigate(backPath);
                }}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Image Carousel */}
      <div className="relative w-full h-[500px] md:h-[600px] overflow-hidden bg-slate-100">
        {categoryPhotos.length > 0 && (
          <>
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

            {/* Action Buttons */}
            <div className="absolute bottom-4 right-4 flex gap-2">
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
              <Button
                variant="secondary"
                size="icon"
                className={`${theme.iconButton} ${theme.iconButtonHover} rounded-full ${isFavorite ? "bg-rose-500 text-white border-rose-500 hover:bg-rose-600" : ""}`}
                onClick={() => {
                  if (!categoryId) return;
                  setIsFavorite((prev) => {
                    const next = !prev;
                    try {
                      const key = "bookingEngine:favorites";
                      const raw = localStorage.getItem(key);
                      const data = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
                      data[categoryId] = next;
                      localStorage.setItem(key, JSON.stringify(data));
                    } catch {
                      // ignore storage errors
                    }
                    return next;
                  });
                }}
              >
                <Heart className="w-4 h-4" fill={isFavorite ? "currentColor" : "none"} />
              </Button>
              <Button
                variant="secondary"
                size="icon"
                className={`${theme.iconButton} ${theme.iconButtonHover} rounded-full`}
                onClick={() => {
                  const shareUrl = window.location.href;
                  const shareData: ShareData = {
                    title: category.name,
                    text: `Veja detalhes da categoria ${category.name} em ${motorTitle}`,
                    url: shareUrl,
                  };
                  if (navigator.share) {
                    navigator.share(shareData).catch(() => {
                      // usuário cancelou ou houve erro — silencioso
                    });
                  } else if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(shareUrl).catch(() => {
                      // ignore
                    });
                  }
                }}
              >
                <Share2 className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_400px] gap-8">
          {/* Left Column - Content */}
          <div className="space-y-8">
            {/* Title and Location */}
            <div>
              <h1 className={`text-3xl md:text-4xl font-bold mb-4 ${theme.textPrimary}`}>
                {category.name}
              </h1>
              <div className={`flex items-center gap-2 ${theme.textSecondary}`}>
                <MapPin className="w-5 h-5" />
                <span>
                  {establishment.name}
                  {establishment.city && `, ${establishment.city}`}
                  {establishment.state && ` - ${establishment.state}`}
                </span>
              </div>
            </div>

            {/* Description */}
            {category.display_description && (
              <div className="prose max-w-none">
                <div className={`${theme.textSecondary} whitespace-pre-line leading-relaxed`}>
                  {category.display_description}
                </div>
              </div>
            )}

            {/* Features */}
            {category.display_features && Array.isArray(category.display_features) && category.display_features.length > 0 && (
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

            {/* Establishment Info */}
            {hotelSettings?.description && (
              <div>
                <h2 className={`text-2xl font-bold mb-4 ${theme.textPrimary}`}>
                  Conheça {establishment.name}
                </h2>
                <div className="prose max-w-none">
                  <div className={`${theme.textSecondary} whitespace-pre-line leading-relaxed`}>
                    {hotelSettings.description}
                  </div>
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
            {(building?.street || hotelSettings?.street || establishment.street) && (
              <div>
                <h2 className={`text-2xl font-bold mb-4 ${theme.textPrimary}`}>Localização</h2>
                <div className={`space-y-2 ${theme.textSecondary}`}>
                  <p>
                    {(building?.street || hotelSettings?.street || establishment.street) as string}
                    {(building?.number || hotelSettings?.number || establishment.number) &&
                      `, ${building?.number || hotelSettings?.number || establishment.number}`}
                  </p>
                  {(building?.neighborhood || hotelSettings?.neighborhood || establishment.neighborhood) && (
                    <p>{building?.neighborhood || hotelSettings?.neighborhood || establishment.neighborhood}</p>
                  )}
                  <p>
                    {building?.city || hotelSettings?.city || establishment.city}
                    {(building?.state || hotelSettings?.state || establishment.state) &&
                      ` - ${building?.state || hotelSettings?.state || establishment.state}`}
                    {(building?.zip_code || hotelSettings?.zip_code || establishment.zip_code) &&
                      `, ${building?.zip_code || hotelSettings?.zip_code || establishment.zip_code}`}
                  </p>
                </div>

                {/* Mapa do Google Maps */}
                <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 shadow-sm h-64 md:h-80">
                  <iframe
                    title={`Mapa - ${establishment.name}`}
                    src={`https://www.google.com/maps?q=${encodeURIComponent(
                      `${building?.street || hotelSettings?.street || establishment.street || ""} ${building?.number || hotelSettings?.number || establishment.number || ""}, ${building?.city || hotelSettings?.city || establishment.city || ""} ${building?.state || hotelSettings?.state || establishment.state || ""} ${building?.zip_code || hotelSettings?.zip_code || establishment.zip_code || ""}`
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

          {/* Right Column - Booking Widget */}
          <div className="lg:sticky lg:top-20 h-fit">
            <Card className={`p-6 shadow-lg rounded-2xl ${theme.summaryBg} ${theme.summaryBorder}`}>
              <h3 className={`text-xl font-bold mb-6 ${theme.textPrimary}`}>Reservar agora</h3>

              {/* Check-in / Check-out */}
              <div className="space-y-4 mb-4">
                <div>
                  <Label className={`text-sm font-medium mb-2 block ${theme.textSecondary}`}>
                    Check-in e checkout
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="date"
                      value={checkin}
                      onChange={(e) => setCheckin(e.target.value)}
                      min={format(new Date(), "yyyy-MM-dd")}
                      className="h-10"
                    />
                    <Input
                      type="date"
                      value={checkout}
                      onChange={(e) => setCheckout(e.target.value)}
                      min={checkin || format(new Date(), "yyyy-MM-dd")}
                      className="h-10"
                    />
                  </div>
                </div>

                {/* Guests */}
                <div>
                  <Label className={`text-sm font-medium mb-2 block ${theme.textSecondary}`}>
                    Hóspedes
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={adults}
                      onChange={(e) => setAdults(e.target.value)}
                      min="1"
                      placeholder="Adultos"
                      className="h-10"
                    />
                    <Input
                      type="number"
                      value={children}
                      onChange={(e) => setChildren(e.target.value)}
                      min="0"
                      placeholder="Crianças"
                      className="h-10"
                    />
                  </div>
                </div>

                {/* Coupon */}
                <div>
                  <Label className={`text-sm font-medium mb-2 block ${theme.textSecondary}`}>
                    Cupom (opcional)
                  </Label>
                  <Input
                    type="text"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                    placeholder="Código promocional"
                    className="h-10 uppercase"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <Button
                className={`w-full h-12 font-semibold ${theme.primaryButton} ${theme.primaryButtonHover}`}
                onClick={handleSubmit}
              >
                <Search className="w-5 h-5 mr-2" />
                Ver disponibilidade
              </Button>
            </Card>
          </div>
        </div>
      </div>

      {/* Gallery Modal */}
      {galleryOpen && (() => {
        const photos = galleryType === "category" ? categoryPhotos : establishmentPhotos;
        const altText = galleryType === "category" ? category.name : `${establishment.name} - Estabelecimento`;
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

      {/* Footer completo reaproveitando o tema do motor */}
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
                    />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className={`text-sm font-semibold ${theme.footerText}`}>
                    {motorTitle}
                  </span>
                  <span className={`text-xs ${theme.footerText}`}>
                    Motor de reservas oficial · página de detalhes da categoria
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
              <h5 className={`text-xs font-semibold uppercase tracking-[0.18em] ${theme.textSecondary}`}>
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
              <h5 className={`text-xs font-semibold uppercase tracking-[0.18em] ${theme.textSecondary}`}>
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

      {/* Botão Flutuante do Chatwoot (apenas quando estilo for "custom") */}
      {chatEnabled && chatType === "chatwoot" && chatBaseUrl && chatWebsiteToken && chatButtonStyle === "custom" && (
        <div 
          className={`fixed right-6 z-[9999] transition-all duration-300 ${
            chatwootWidgetOpen 
              ? 'bottom-[420px]' // Posição abaixo do widget do chat quando aberto (altura aproximada do widget: ~400px)
              : 'bottom-24' // Posição original quando fechado
          }`}
          style={{ pointerEvents: 'auto' }}
        >
          {/* Anel pulsante - apenas quando fechado */}
          {!chatwootWidgetOpen && (
            <>
              <div className="absolute inset-0 rounded-full bg-blue-500 opacity-75 animate-[pulse-ring_2s_cubic-bezier(0.4,0,0.6,1)_infinite]"></div>
              <div className="absolute inset-0 rounded-full bg-blue-500 opacity-50 animate-[pulse-ring_2s_cubic-bezier(0.4,0,0.6,1)_infinite_0.5s]"></div>
            </>
          )}
          <button
            onClick={() => {
              // Abrir o widget do Chatwoot programaticamente
              if (window.chatwootSDK) {
                window.chatwootSDK.run({
                  websiteToken: chatWebsiteToken,
                  baseUrl: chatBaseUrl
                });
                
                // Tentar abrir o widget
                const chatwootWidget = document.querySelector('[data-chatwoot-widget]') as HTMLElement;
                if (chatwootWidget) {
                  chatwootWidget.click();
                } else {
                  // Alternativa: procurar pelo botão do widget do Chatwoot
                  const chatwootButton = document.querySelector('.woot-widget-bubble') as HTMLElement;
                  if (chatwootButton) {
                    chatwootButton.click();
                  }
                }
                
                // Se o SDK tem método toggle, usar
                if ((window.chatwootSDK as any).toggle) {
                  (window.chatwootSDK as any).toggle();
                }
              }
            }}
            className={`relative flex items-center justify-center w-20 h-20 bg-blue-500 hover:bg-blue-600 text-white rounded-full shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-110 group ${
              !chatwootWidgetOpen ? 'animate-[pulse-button_2s_ease-in-out_infinite]' : ''
            } cursor-pointer`}
            aria-label="Fale conosco via Chat"
          >
            <MessageCircle className="w-12 h-12 relative z-10" />
            {/* Tooltip */}
            <div className="absolute right-full mr-3 px-3 py-2 bg-slate-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-20">
              Fale conosco via Chat
              <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-slate-900"></div>
            </div>
          </button>
        </div>
      )}

      {/* Botão Flutuante do WhatsApp */}
      {chatEnabled && chatType === "whatsapp" && whatsappDdi && whatsappNumber && (
        <div className="fixed bottom-24 right-6 z-50">
          {/* Anel pulsante */}
          <div className="absolute inset-0 rounded-full bg-green-500 opacity-75 animate-[pulse-ring_2s_cubic-bezier(0.4,0,0.6,1)_infinite]"></div>
          {/* Segundo anel pulsante com delay */}
          <div className="absolute inset-0 rounded-full bg-green-500 opacity-50 animate-[pulse-ring_2s_cubic-bezier(0.4,0,0.6,1)_infinite_0.5s]"></div>
          <a
            href={`https://wa.me/${whatsappDdi}${whatsappNumber.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="relative flex items-center justify-center w-20 h-20 bg-green-500 hover:bg-green-600 rounded-full shadow-2xl hover:shadow-green-500/50 transition-all duration-300 hover:scale-110 group animate-[pulse-button_2s_ease-in-out_infinite]"
            aria-label="Fale conosco no WhatsApp"
          >
            <img 
              src="/whatsapp.png" 
              alt="WhatsApp" 
              className="w-12 h-12 object-contain relative z-10"
            />
            {/* Tooltip */}
            <div className="absolute right-full mr-3 px-3 py-2 bg-slate-900 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-20">
              Fale conosco no WhatsApp
              <div className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-slate-900"></div>
            </div>
          </a>
        </div>
      )}
      </div>
    </>
  );
};

export default CategoryDetailPage;

